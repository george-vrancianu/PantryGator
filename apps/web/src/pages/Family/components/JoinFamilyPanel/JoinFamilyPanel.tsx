import { Alert, Button, Stack, TextField, Typography } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import type { JoinFlow } from '../../hooks/useJoinFlow';

/**
 * Joining abandons the Member's Household of One, so the code is checked first
 * and the Member sees what will be deleted before confirming.
 */
export function JoinFamilyPanel({ flow }: { flow: JoinFlow }) {
  const { t } = useTranslation('family');
  return (
    <Stack spacing={1}>
      <Typography variant="sectionLabel" color="text.secondary">
        {t('joinTitle')}
      </Typography>
      {flow.preview ? (
        <>
          <Alert severity="warning">
            {t('joinWarning')}{' '}
            {t('joinBatches', { count: flow.preview.batches })}{' '}
            {t('joinShoppingItems', { count: flow.preview.shoppingItems })}
          </Alert>
          <Stack direction="row" spacing={1}>
            <Button disabled={flow.joining} onClick={flow.confirm}>
              {flow.joining ? t('joining') : t('joinConfirm')}
            </Button>
            <Button variant="ghost" sx={{ height: 52 }} onClick={flow.cancel}>
              {t('cancel')}
            </Button>
          </Stack>
        </>
      ) : (
        <Stack
          component="form"
          spacing={1}
          onSubmit={(event) => {
            event.preventDefault();
            flow.check();
          }}
        >
          <Typography variant="meta" color="text.secondary">
            {t('joinHelp')}
          </Typography>
          <TextField
            label={t('joinCodeLabel')}
            value={flow.code}
            onChange={(event) => flow.setCode(event.target.value)}
            slotProps={{ htmlInput: { autoCapitalize: 'characters' } }}
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={flow.checking || flow.code.trim() === ''}
          >
            {flow.checking ? t('joinChecking') : t('joinCheck')}
          </Button>
        </Stack>
      )}
      {flow.error ? <Alert>{flow.error}</Alert> : null}
    </Stack>
  );
}
