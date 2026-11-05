import { Alert, Box, Stack, Toggle, Typography } from '@pocket-pantry/ui';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '../../../i18n/translateApiError';
import { useSession } from '../../../lib/auth';
import { useSiriOnDevice } from '../../../lib/siriOnDevice';

/** "Use Siri" in the iPhone app: the phone's own Assistant Token, never shown or copied (ADR 0038). */
export function SiriSwitch() {
  const { t } = useTranslation('siri');
  const id = useId();
  const session = useSession();
  const siri = useSiriOnDevice();
  const memberId = session.data?.user.id;

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id={`${id}-label`} variant="body1">
            {t('use.label')}
          </Typography>
          <Typography id={`${id}-hint`} variant="meta" color="text.secondary">
            {t('use.hint')}
          </Typography>
        </Box>
        <Toggle
          checked={siri.isOn === true}
          disabled={siri.isOn === undefined || !memberId || siri.busy}
          onChange={(wanted) => {
            if (!wanted) siri.turnOff();
            else if (memberId) siri.turnOn(memberId, t('use.tokenName'));
          }}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-hint`}
        />
      </Stack>
      {(['needs', 'got', 'have'] as const).map((command) => (
        <Typography key={command} variant="body1" sx={{ fontWeight: 600 }}>
          {t(`use.phrases.${command}`)}
        </Typography>
      ))}
      {siri.error ? <Alert>{translateApiError(t, siri.error)}</Alert> : null}
    </Stack>
  );
}
