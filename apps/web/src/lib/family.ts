import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from './api';
import { creditsQueryKey } from './credits';

export type FamilyMember = { id: string; name: string; isOwner: boolean };

export type Family = {
  id: string;
  inviteCode: string;
  /** ISO timestamp. */
  inviteCodeExpiresAt: string;
  members: FamilyMember[];
  currentMemberIsOwner: boolean;
};

export const familyQueryKey = ['family'] as const;

export function useFamily() {
  return useQuery({
    queryKey: familyQueryKey,
    queryFn: () => apiRequest<Family>('/family'),
  });
}

export type JoinPreview = {
  batches: number;
  shoppingItems: number;
  recipeDrafts: number;
};

/** Validates the code and returns what joining would delete. Changes nothing. */
export function useJoinPreview() {
  return useMutation({
    mutationFn: (code: string) =>
      apiRequest<JoinPreview>(
        `/family/join-preview?code=${encodeURIComponent(code)}`,
      ),
  });
}

/** Each membership change returns the caller's Family as it is afterwards. */
function useFamilyMutation<TVariables = void>(
  request: (variables: TVariables) => Promise<Family>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (family) => {
      queryClient.setQueryData(familyQueryKey, family);
      // Joining, leaving, removal and deletion change which Family's Credits the caller sees.
      void queryClient.invalidateQueries({ queryKey: creditsQueryKey });
    },
  });
}

export const useRegenerateInviteCode = () =>
  useFamilyMutation(() =>
    apiRequest<Family>('/family/invite-code/regenerate', {
      method: 'POST',
      body: {},
    }),
  );

export const useJoinFamily = () =>
  useFamilyMutation((code: string) =>
    apiRequest<Family>('/family/join', { method: 'POST', body: { code } }),
  );

export const useLeaveFamily = () =>
  useFamilyMutation(() =>
    apiRequest<Family>('/family/leave', { method: 'POST', body: {} }),
  );

export const useRemoveMember = () =>
  useFamilyMutation((memberId: string) =>
    apiRequest<Family>(`/family/members/${encodeURIComponent(memberId)}`, {
      method: 'DELETE',
    }),
  );

export const useTransferOwnership = () =>
  useFamilyMutation((memberId: string) =>
    apiRequest<Family>('/family/transfer-ownership', {
      method: 'POST',
      body: { memberId },
    }),
  );

export const useDeleteFamily = () =>
  useFamilyMutation(() => apiRequest<Family>('/family', { method: 'DELETE' }));
