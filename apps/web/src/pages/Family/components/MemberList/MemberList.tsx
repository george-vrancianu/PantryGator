import { Stack, Typography } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import type { FamilyMember } from '@/lib/family';
import { ConfirmAction } from '@/components/editor/ConfirmAction/ConfirmAction';

type Props = {
  members: FamilyMember[];
  /** The viewer is the Owner: shows per-Member actions. */
  isOwner: boolean;
  onMakeOwner: (member: FamilyMember) => void;
  onRemove: (member: FamilyMember) => void;
  busy?: boolean;
};

export function MemberList({
  members,
  isOwner,
  onMakeOwner,
  onRemove,
  busy,
}: Props) {
  const { t } = useTranslation('family');
  return (
    <Stack spacing={1}>
      <Typography variant="sectionLabel" color="text.secondary">
        {t('members')}
      </Typography>
      <Stack component="ul" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {members.map((member) => (
          <Stack component="li" key={member.id} spacing={1}>
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: 'center', minHeight: 44 }}
            >
              <Typography variant="body1">{member.name}</Typography>
              {member.isOwner ? (
                <Typography variant="meta" color="text.secondary">
                  {t('owner')}
                </Typography>
              ) : null}
            </Stack>
            {!member.isOwner && isOwner ? (
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                <ConfirmAction
                  variant="ghost"
                  label={t('makeOwner')}
                  triggerName={t('makeOwnerNamed', { name: member.name })}
                  message={t('makeOwnerConfirm', { name: member.name })}
                  disabled={busy}
                  onConfirm={() => onMakeOwner(member)}
                />
                <ConfirmAction
                  variant="ghost"
                  label={t('remove')}
                  triggerName={t('removeNamed', { name: member.name })}
                  message={t('removeConfirm', { name: member.name })}
                  disabled={busy}
                  onConfirm={() => onRemove(member)}
                />
              </Stack>
            ) : null}
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}
