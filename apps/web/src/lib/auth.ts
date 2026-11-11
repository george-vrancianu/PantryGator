import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest, isNetworkError } from './api';
import { clearPendingTheme } from './appearance';
import { nativeSession } from './nativeSession';
import { siriOnDevice } from './siriOnDevice';
import { resetScanSession } from './scanSession';
import { voiceNote } from './voiceNote';
import { recipeReads } from './recipeReads';
import { sessionQueryKey, type Session } from './session';

export type SignInInput = { email: string; password: string };
export type SignUpInput = SignInInput & {
  name: string;
  /** Sent only when the person typed one. */
  promoCode?: string;
  /** Sent instead of creating a Family: joins the Family behind this Invite Code. */
  joinInviteCode?: string;
};

/** Public: whether signup needs a Promo Code. */
export function useSignupConfig() {
  return useQuery({
    queryKey: ['signup-config'],
    queryFn: () => apiRequest<{ promoCodeRequired: boolean }>('/signup-config'),
    retry: false,
    staleTime: 60_000,
  });
}

export function useSession() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: () => apiRequest<Session>('/auth/get-session'),
    retry: false,
    staleTime: 60_000,
  });
}

/** After a successful sign-in or sign-up the cookie is set; reload the session before navigating. */
function useSessionRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: sessionQueryKey });
}

export function useSignIn() {
  const refreshSession = useSessionRefresh();
  return useMutation({
    mutationFn: (input: SignInInput) =>
      apiRequest('/auth/sign-in/email', { method: 'POST', body: input }),
    onSuccess: refreshSession,
  });
}

/**
 * Creates the account. `afterCreate` runs once the cookie is set and before the session reloads (which
 * moves the Member on), for anything that has to be saved first; what it returns is the mutation's result.
 */
export function useSignUp<Result = undefined>(
  afterCreate?: () => Promise<Result>,
) {
  const refreshSession = useSessionRefresh();
  return useMutation({
    mutationFn: async (input: SignUpInput) => {
      await apiRequest('/auth/sign-up/email', { method: 'POST', body: input });
      return afterCreate ? await afterCreate() : undefined;
    },
    onSuccess: refreshSession,
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // The phone's Siri token is revoked while the session still can (best effort), then cleared.
      if (siriOnDevice.isAvailable()) {
        const session = queryClient.getQueryData<Session>(sessionQueryKey);
        await siriOnDevice.signOut(session?.user.id);
      }
      try {
        return await apiRequest('/auth/sign-out', { method: 'POST', body: {} });
      } catch (error) {
        // In the app, offline counts as signed out here: the session is local, so sign-out never gets
        // stuck. The server session lapses on its own. A 401 means the server no longer knows the
        // session, so that counts as signed out too. Any other server error still fails.
        const signedOut =
          isNetworkError(error) ||
          (error instanceof ApiError && error.status === 401);
        if (!(signedOut && nativeSession.isActive())) throw error;
      }
    },
    onSuccess: async () => {
      await nativeSession.forget();
      clearPendingTheme();
      voiceNote.clear();
      recipeReads.clear();
      resetScanSession();
      queryClient.clear();
      queryClient.setQueryData(sessionQueryKey, null);
    },
  });
}
