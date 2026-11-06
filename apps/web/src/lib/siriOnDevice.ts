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
  fetchAssistantTokens,
  siriOnDeviceQueryKey,
  type CreatedAssistantToken,
} from './assistantTokens';

/**
 * Siri on the device (ADR 0038): the iPhone app's own Assistant Token, kept in the iOS Keychain so the
 * app's App Intents can post Assistant Requests without opening the app. This is the only code that
 * talks to the Keychain plugin (`apps/mobile/ios/App/App/SiriKeychainPlugin.swift`). The secret goes
 * in once and never comes back to JavaScript.
 */

/** What the plugin hands back: never the secret. Both are absent when nothing is stored. */
type StoredItem = { tokenId?: string; memberId?: string; apiOrigin?: string };

type SiriKeychainPlugin = {
  /**
   * The API origin is stored with the secret so the intents know where to post. `updateApiOrigin`
   * keeps it in step with the build that is running (see `reconcile`).
   */
  set(item: {
    secret: string;
    tokenId: string;
    memberId: string;
    apiOrigin: string;
  }): Promise<void>;
  clear(): Promise<void>;
  get(): Promise<StoredItem>;
  /** Replaces the stored API origin and keeps the rest. Does nothing when nothing is stored. */
  updateApiOrigin(item: { apiOrigin: string }): Promise<void>;
};

const keychain = registerPlugin<SiriKeychainPlugin>('SiriKeychain');

/** What is on the phone: which token, and whose. */
export type SiriStored = {
  tokenId: string;
  memberId: string;
  apiOrigin?: string;
};

export const siriOnDevice = {
  /** Only the iPhone app can host the built-in commands. */
  isAvailable: (): boolean =>
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios',

  /** The token the phone holds, or null. */
  async stored(): Promise<SiriStored | null> {
    const { tokenId, memberId, apiOrigin } = await keychain.get();
    return tokenId && memberId ? { tokenId, memberId, apiOrigin } : null;
  },

  /**
   * Makes what is on the phone honest: an item for another Member, or for a token that is no longer
   * active, is cleared (never revoked: the token is gone, or it is not this Member's to revoke).
   * Returns what is left. If the Member's tokens cannot be read (offline) the item is kept. A kept item
   * whose API origin is not this build's gets the current one, so the intents post to the right API.
   * `listTokens` reads the Member's active tokens (the hook passes a shared, cached read).
   */
  async reconcile(
    memberId: string,
    listTokens: () => Promise<{ id: string }[]> = fetchAssistantTokens,
  ): Promise<SiriStored | null> {
    const stored = await siriOnDevice.stored();
    if (!stored) return null;
    if (stored.memberId !== memberId) {
      await clearIfUnchanged(stored);
      return null;
    }
    let tokens;
    try {
      tokens = await listTokens();
    } catch {
      return stored;
    }
    if (!tokens.some((token) => token.id === stored.tokenId)) {
      await clearIfUnchanged(stored);
      return null;
    }
    return await withCurrentApiOrigin(stored);
  },

  /**
   * Before sign-out: revokes the stored token (best effort) and clears the item whatever happens, so
   * an offline or failed revoke never blocks signing out. A token left behind stays in the Member's
   * list to revoke later. Nothing stored, or a token that is not `memberId`'s (the signed-in Member,
   * if known), means no request.
   */
  async signOut(memberId?: string): Promise<void> {
    try {
      const stored = await siriOnDevice.stored();
      if (stored && (!memberId || stored.memberId === memberId)) {
        await revoke(stored.tokenId).catch(() => undefined);
      }
    } catch {
      // Reading the phone failed: still clear below.
    }
    await keychain.clear().catch(() => undefined);
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

/** Best effort: a failed update leaves the old origin, and the switch still follows the token. */
async function withCurrentApiOrigin(stored: SiriStored): Promise<SiriStored> {
  if (stored.apiOrigin === apiOrigin) return stored;
  try {
    await keychain.updateApiOrigin({ apiOrigin });
    return { ...stored, apiOrigin };
  } catch {
    return stored;
  }
}

/** Clears the item only if it is still the one that was read: the Member may have turned Siri off and on meanwhile. */
async function clearIfUnchanged(read: SiriStored) {
  const now = await siriOnDevice.stored();
  if (now?.tokenId === read.tokenId && now.memberId === read.memberId) {
    await keychain.clear();
  }
}

function revoke(tokenId: string) {
  return apiRequest<{ id: string }>(`/assistant-tokens/${tokenId}`, {
    method: 'DELETE',
  });
}

function refresh(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: siriOnDeviceQueryKey }),
    queryClient.invalidateQueries({ queryKey: assistantTokensQueryKey }),
  ]);
}

/**
 * The switch for the signed-in Member (`memberId`, once known): on when the phone holds their token.
 * Turning it on or off keeps the token list in step.
 */
export function useSiriOnDevice(memberId: string | undefined) {
  const queryClient = useQueryClient();
  const stored = useQuery({
    queryKey: [...siriOnDeviceQueryKey, memberId],
    // Reconciled with the signed-in Member and their active tokens whenever it is fetched: on every
    // mount (gcTime 0) and after a change. Not on every read: the app's default staleTime applies.
    queryFn: () =>
      siriOnDevice.reconcile(memberId as string, () =>
        // Shares the token list's own request on this screen; never much older than this fetch.
        queryClient.fetchQuery({
          queryKey: assistantTokensQueryKey,
          queryFn: fetchAssistantTokens,
          // A read this screen just made is reused; a change (invalidated) always refetches.
          staleTime: 5_000,
        }),
      ),
    enabled: memberId !== undefined,
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
