import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from './api';

/** An Assistant Token as listed: never the secret. Dates are ISO timestamps. */
export type AssistantToken = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

/** Returned once on creation; the secret cannot be fetched again. */
export type CreatedAssistantToken = AssistantToken & { secret: string };

export const assistantTokensQueryKey = ['assistant-tokens'] as const;

/** The iPhone app's Siri switch state (see `siriOnDevice`); it follows the token list, so revoking a token refreshes it too. */
export const siriOnDeviceQueryKey = ['siri-on-device'] as const;

export const fetchAssistantTokens = () =>
  apiRequest<AssistantToken[]>('/assistant-tokens');

export function useAssistantTokens() {
  return useQuery({
    queryKey: assistantTokensQueryKey,
    queryFn: fetchAssistantTokens,
  });
}

export function useCreateAssistantToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiRequest<CreatedAssistantToken>('/assistant-tokens', {
        method: 'POST',
        body: { name },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: assistantTokensQueryKey }),
  });
}

export function useRevokeAssistantToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ id: string }>(`/assistant-tokens/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: assistantTokensQueryKey }),
        queryClient.invalidateQueries({ queryKey: siriOnDeviceQueryKey }),
      ]),
  });
}
