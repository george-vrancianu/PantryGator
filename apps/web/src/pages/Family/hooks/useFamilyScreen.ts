import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';
import {
  useDeleteFamily,
  useFamily,
  useLeaveFamily,
  useRegenerateInviteCode,
  useRemoveMember,
  useTransferOwnership,
} from '@/lib/family';

export function useFamilyScreen() {
  const { t, i18n } = useTranslation();
  const family = useFamily();
  const regenerate = useRegenerateInviteCode();
  const leave = useLeaveFamily();
  const remove = useRemoveMember();
  const transfer = useTransferOwnership();
  const deleteFamily = useDeleteFamily();

  const error =
    family.error ??
    regenerate.error ??
    leave.error ??
    remove.error ??
    transfer.error ??
    deleteFamily.error;
  const expiresAt = family.data
    ? new Date(family.data.inviteCodeExpiresAt)
    : null;
  const busy =
    leave.isPending ||
    remove.isPending ||
    transfer.isPending ||
    deleteFamily.isPending;

  return {
    family: family.data,
    isLoading: family.isPending,
    error: error ? translateApiError(t, error) : null,
    // oxlint-disable-next-line react/purity -- invite expiry is checked against the current time on each render; freezing it would keep an expired invite looking valid
    expired: expiresAt !== null && expiresAt.getTime() <= Date.now(),
    expiryLabel: expiresAt
      ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
          expiresAt,
        )
      : null,
    regenerate: () => regenerate.mutate(),
    regenerating: regenerate.isPending,
    busy,
    leave: () => leave.mutate(),
    removeMember: (memberId: string) => remove.mutate(memberId),
    makeOwner: (memberId: string) => transfer.mutate(memberId),
    deleteFamily: () => deleteFamily.mutate(),
    retry: () => void family.refetch(),
  };
}
