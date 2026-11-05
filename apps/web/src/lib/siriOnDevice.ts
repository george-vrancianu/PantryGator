import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { apiOrigin, apiRequest, ApiError } from './api';
import {
  assistantTokensQueryKey,
  type CreatedAssistantToken,
} from './assistantTokens';

/**
 * Siri on the device (ADR 0038): the iPhone app's own Assistant Token, kept in the iOS Keychain so the
 * app's App Intents can post Assistant Requests without opening the app. This is the only code that
 * talks to the Keychain plugin (`apps/mobile/ios/App/App/SiriKeychainPlugin.swift`). The secret goes
 * in once and never comes back to JavaScript.
 */

/** What the plugin hands back: never the secret. Both are absent when nothing is stored. */
type StoredItem = { tokenId?: string; memberId?: string };

type SiriKeychainPlugin = {
  /** The API origin is stored with the secret so the intents know where to post. */
  set(item: {
    secret: string;
    tokenId: string;
    memberId: string;
    apiOrigin: string;
  }): Promise<void>;
  clear(): Promise<void>;
  get(): Promise<StoredItem>;
};

const keychain = registerPlugin<SiriKeychainPlugin>('SiriKeychain');

/** What is on the phone: which token, and whose. */
export type SiriStored = { tokenId: string; memberId: string };

export const siriOnDevice = {
  /** Only the iPhone app can host the built-in commands. */
  isAvailable: (): boolean =>
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios',

  /** The token the phone holds, or null. */
  async stored(): Promise<SiriStored | null> {
    const { tokenId, memberId } = await keychain.get();
    return tokenId && memberId ? { tokenId, memberId } : null;
  },

  /**
   * Creates a token named `tokenName` and stores it on the phone. If storing fails the new token is
   * revoked again (best effort), so no token exists that the phone cannot use.
   */
  async turnOn(memberId: string, tokenName: string): Promise<SiriStored> {
    const created = await apiRequest<CreatedAssistantToken>(
      '/assistant-tokens',
      { method: 'POST', body: { name: tokenName } },
    );
    try {
      await keychain.set({
        secret: created.secret,
        tokenId: created.id,
        memberId,
        apiOrigin,
      });
    } catch (error) {
      await revoke(created.id).catch(() => undefined);
      throw error;
    }
    return { tokenId: created.id, memberId };
  },

  /**
   * Revokes the stored token, then clears it from the phone. A failed revoke leaves the item in place
   * (the switch stays on, matching what is stored); a token already gone counts as revoked.
   */
  async turnOff(): Promise<void> {
    const stored = await siriOnDevice.stored();
    if (stored) {
      try {
        await revoke(stored.tokenId);
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 404)) throw error;
      }
    }
    await keychain.clear();
  },
};

function revoke(tokenId: string) {
  return apiRequest<{ id: string }>(`/assistant-tokens/${tokenId}`, {
    method: 'DELETE',
  });
}

const storedQueryKey = ['siri-on-device'] as const;

function refresh(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: storedQueryKey }),
    queryClient.invalidateQueries({ queryKey: assistantTokensQueryKey }),
  ]);
}

/** The switch: on when the phone holds a token. Turning it on or off keeps the token list in step. */
export function useSiriOnDevice() {
  const queryClient = useQueryClient();
  const stored = useQuery({
    queryKey: storedQueryKey,
    queryFn: () => siriOnDevice.stored(),
    // The Keychain is the truth, so never serve a cached answer after a change.
    gcTime: 0,
  });
  const turnOn = useMutation({
    mutationFn: ({
      memberId,
      tokenName,
    }: {
      memberId: string;
      tokenName: string;
    }) => siriOnDevice.turnOn(memberId, tokenName),
    onSettled: () => refresh(queryClient),
  });
  const turnOff = useMutation({
    mutationFn: () => siriOnDevice.turnOff(),
    onSettled: () => refresh(queryClient),
  });
  return {
    /** Undefined while reading the Keychain. */
    isOn: stored.isSuccess ? stored.data !== null : undefined,
    busy: turnOn.isPending || turnOff.isPending,
    error: turnOn.error ?? turnOff.error ?? stored.error,
    turnOn: (memberId: string, tokenName: string) => {
      turnOff.reset();
      turnOn.mutate({ memberId, tokenName });
    },
    turnOff: () => {
      turnOn.reset();
      turnOff.mutate();
    },
  };
}
