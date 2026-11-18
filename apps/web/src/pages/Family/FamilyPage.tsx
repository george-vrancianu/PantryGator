import { Alert, Button, Spinner, Stack, Typography } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/layout/Screen';
import { ConfirmAction } from '@/components/ConfirmAction';
import { InviteCodePanel } from './components/InviteCodePanel/InviteCodePanel';
import { JoinFamilyPanel } from './components/JoinFamilyPanel/JoinFamilyPanel';
import { MemberList } from './components/MemberList/MemberList';
import { useFamilyScreen } from './hooks/useFamilyScreen';
import { useJoinFlow } from './hooks/useJoinFlow';

export function FamilyPage() {
  const { t } = useTranslation(['family', 'common']);
  const screen = useFamilyScreen();
  const joinFlow = useJoinFlow();
  const family = screen.family;
  const isOwner = family?.currentMemberIsOwner ?? false;
  // Only a Household of One can be abandoned by joining another Family.
  const isHouseholdOfOne = family?.members.length === 1;

  return (
    <Screen
      title={t('family:title')}
      back={{ label: t('screenHeader:back'), href: '/settings' }}
    >
      <Stack spacing={3}>
        {screen.error ? <Alert>{screen.error}</Alert> : null}
        {screen.isLoading ? <Spinner label={t('common:loading')} /> : null}
        {!family && !screen.isLoading ? (
          <Button onClick={screen.retry}>{t('common:retry')}</Button>
        ) : null}
        {family ? (
          <>
            <MemberList
              members={family.members}
              busy={screen.busy}
              isOwner={isOwner}
              onMakeOwner={(m) => screen.makeOwner(m.id)}
              onRemove={(m) => screen.removeMember(m.id)}
            />
            <InviteCodePanel
              code={family.inviteCode}
              expiryLabel={screen.expiryLabel ?? ''}
              expired={screen.expired}
              isOwner={isOwner}
              regenerating={screen.regenerating}
              onRegenerate={screen.regenerate}
            />
            {isHouseholdOfOne ? <JoinFamilyPanel flow={joinFlow} /> : null}
            {isOwner ? (
              <Stack spacing={1}>
                {!isHouseholdOfOne ? (
                  <Typography variant="meta" color="text.secondary">
                    {t('family:ownerCannotLeave')}
                  </Typography>
                ) : null}
                <ConfirmAction
                  label={t('family:delete')}
                  message={t('family:deleteConfirm')}
                  disabled={screen.busy}
                  onConfirm={screen.deleteFamily}
                />
              </Stack>
            ) : (
              <ConfirmAction
                label={t('family:leave')}
                message={t('family:leaveConfirm')}
                disabled={screen.busy}
                onConfirm={screen.leave}
              />
            )}
          </>
        ) : null}
      </Stack>
    </Screen>
  );
}
