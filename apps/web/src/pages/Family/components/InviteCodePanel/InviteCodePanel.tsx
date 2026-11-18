import { Alert, Button, Stack, Typography } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';

type Props = {
  code: string;
  expiryLabel: string;
  expired: boolean;
  isOwner: boolean;
  regenerating: boolean;
  onRegenerate: () => void;
};

export function InviteCodePanel({
  code,
  expiryLabel,
  expired,
  isOwner,
  regenerating,
  onRegenerate,
}: Props) {
  const { t } = useTranslation('family');
  return (
    <Stack spacing={1}>
      <Typography variant="sectionLabel" color="text.secondary">
        {t('inviteCode')}
      </Typography>
      <Typography
        variant="body1"
        sx={{
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textDecoration: expired ? 'line-through' : 'none',
        }}
      >
        {code}
      </Typography>
      <Typography variant="meta" color="text.secondary">
        {expired ? t('expired') : t('expiresOn', { date: expiryLabel })}
      </Typography>
      {expired ? (
        <Alert severity="info">
          {isOwner ? t('expiredOwnerPrompt') : t('expiredMemberPrompt')}
        </Alert>
      ) : (
        <Typography variant="meta" color="text.secondary">
          {t('inviteCodeHelp')}
        </Typography>
      )}
      {isOwner ? (
        <>
          <Button
            variant={expired ? 'primary' : 'secondary'}
            disabled={regenerating}
            onClick={onRegenerate}
          >
            {regenerating ? t('regenerating') : t('regenerate')}
          </Button>
          <Typography variant="meta" color="text.secondary">
            {t('regenerateWarning')}
          </Typography>
        </>
      ) : null}
    </Stack>
  );
}
