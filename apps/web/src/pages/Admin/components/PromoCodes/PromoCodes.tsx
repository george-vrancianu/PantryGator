import {
  Alert,
  Button,
  Sheet,
  SegmentedControl,
  Spinner,
  Stack,
  TextField,
  Typography,
  useToast,
} from '@pocket-pantry/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';
import { formatDate } from '@/lib/dateFormat';
import { localIso } from '@/lib/pantry';
import {
  PROMO_COUNT_MAX,
  PROMO_COUNT_MIN,
  PROMO_CREDITS_DEFAULT,
  PROMO_CREDITS_MAX,
  PROMO_CREDITS_MIN,
  PROMO_NOTE_MAX,
  useGeneratePromoCodes,
  usePromoCodes,
  useRevokePromoCode,
  type PromoCodeEntry,
  type PromoCodeStatus,
} from '@/lib/promoCodes';

type Filter = PromoCodeStatus | 'all';

const shortId = (id: string) => id.slice(0, 8);

/**
 * The Promo Codes tab: generate a batch (count, Credits, note), copy what was
 * made, and review the list newest first with a status filter, a copy button
 * per code, who redeemed it, and Revoke (confirmed) for Unused codes.
 */
export function PromoCodes() {
  const { t } = useTranslation(['admin', 'errors', 'common']);
  const toast = useToast();
  const [count, setCount] = useState('1');
  const [credits, setCredits] = useState(String(PROMO_CREDITS_DEFAULT));
  const [note, setNote] = useState('');
  const [made, setMade] = useState<string[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  // Kept after close so the title does not blank during the exit transition.
  const [revoking, setRevoking] = useState<PromoCodeEntry | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const generate = useGeneratePromoCodes();
  const revoke = useRevokePromoCode();
  const list = usePromoCodes(filter === 'all' ? undefined : filter);
  const entries = list.data ?? [];

  const copy = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(message, { polite: true });
    } catch {
      toast.show(t('admin:promoCodes.copyFailed'), { polite: true });
    }
  };

  const error = generate.error ?? revoke.error ?? list.error;
  const countNumber = Number(count);
  const creditsNumber = Number(credits);
  const valid =
    Number.isInteger(countNumber) &&
    countNumber >= PROMO_COUNT_MIN &&
    countNumber <= PROMO_COUNT_MAX &&
    Number.isInteger(creditsNumber) &&
    creditsNumber >= PROMO_CREDITS_MIN &&
    creditsNumber <= PROMO_CREDITS_MAX;

  return (
    <Stack spacing={3}>
      <Stack
        component="form"
        spacing={2}
        aria-label={t('admin:promoCodes.formLabel')}
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid || generate.isPending) return;
          revoke.reset();
          generate.mutate(
            {
              count: countNumber,
              credits: creditsNumber,
              ...(note.trim() ? { note: note.trim() } : {}),
            },
            { onSuccess: (result) => setMade(result.codes) },
          );
        }}
      >
        <TextField
          label={t('admin:promoCodes.count')}
          type="number"
          value={count}
          onChange={(event) => setCount(event.target.value)}
          slotProps={{
            htmlInput: { min: PROMO_COUNT_MIN, max: PROMO_COUNT_MAX, step: 1 },
          }}
          helperText={t('admin:promoCodes.countHelp')}
        />
        <TextField
          label={t('admin:promoCodes.credits')}
          type="number"
          value={credits}
          onChange={(event) => setCredits(event.target.value)}
          slotProps={{
            htmlInput: {
              min: PROMO_CREDITS_MIN,
              max: PROMO_CREDITS_MAX,
              step: 1,
            },
          }}
          helperText={t('admin:promoCodes.creditsHelp')}
        />
        <TextField
          label={t('admin:promoCodes.note')}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          slotProps={{ htmlInput: { maxLength: PROMO_NOTE_MAX } }}
          helperText={t('admin:promoCodes.noteHelp')}
        />
        <Button type="submit" disabled={!valid || generate.isPending}>
          {t('admin:promoCodes.generate')}
        </Button>
      </Stack>

      {error ? <Alert>{translateApiError(t, error)}</Alert> : null}

      {made.length > 0 ? (
        <Stack
          component="section"
          spacing={1}
          aria-label={t('admin:promoCodes.resultTitle')}
        >
          <Typography component="h2" variant="subtitle1">
            {t('admin:promoCodes.resultTitle')}
          </Typography>
          <Stack component="ul" spacing={0.5} sx={{ m: 0, p: 0 }}>
            {made.map((code) => (
              <Typography
                key={code}
                component="li"
                sx={{ listStyle: 'none', fontFamily: 'monospace' }}
              >
                {code}
              </Typography>
            ))}
          </Stack>
          <Button
            variant="secondary"
            onClick={() =>
              void copy(
                made.join('\n'),
                t('admin:promoCodes.copiedAll', { count: made.length }),
              )
            }
          >
            {t('admin:promoCodes.copyAll')}
          </Button>
        </Stack>
      ) : null}

      <SegmentedControl
        label={t('admin:promoCodes.filterLabel')}
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: t('admin:promoCodes.status.all') },
          { value: 'unused', label: t('admin:promoCodes.status.unused') },
          { value: 'redeemed', label: t('admin:promoCodes.status.redeemed') },
          { value: 'revoked', label: t('admin:promoCodes.status.revoked') },
        ]}
      />
      {list.isPending ? <Spinner label={t('common:loading')} /> : null}
      {list.isSuccess && entries.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t('admin:promoCodes.empty')}
        </Typography>
      ) : null}
      <Stack component="ul" spacing={2} sx={{ m: 0, p: 0, listStyle: 'none' }}>
        {entries.map((entry) => (
          <li key={entry.id}>
            <Row
              entry={entry}
              onCopy={() => void copy(entry.code, t('admin:promoCodes.copied'))}
              onRevoke={() => {
                generate.reset();
                revoke.reset();
                setRevoking(entry);
                setConfirmOpen(true);
              }}
            />
          </li>
        ))}
      </Stack>
      {list.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          {t('admin:promoCodes.loadMore')}
        </Button>
      ) : null}

      <Sheet
        open={confirmOpen}
        size="content"
        onClose={() => setConfirmOpen(false)}
        title={t('admin:promoCodes.revokeTitle', { code: revoking?.code })}
        primary={{
          label: t('admin:promoCodes.revokeConfirm'),
          tone: 'danger',
          pending: revoke.isPending,
          onClick: () =>
            revoking &&
            revoke.mutate(revoking.id, {
              onSettled: () => setConfirmOpen(false),
            }),
        }}
      >
        <Typography>{t('admin:promoCodes.revokeBody')}</Typography>
      </Sheet>
    </Stack>
  );
}

type RowProps = {
  entry: PromoCodeEntry;
  onCopy: () => void;
  onRevoke: () => void;
};

function Row({ entry, onCopy, onRevoke }: RowProps) {
  const { t } = useTranslation('admin');
  return (
    <Stack spacing={0.5}>
      <Typography
        component="h3"
        variant="subtitle1"
        sx={{ fontFamily: 'monospace' }}
      >
        {entry.code}
      </Typography>
      <Typography variant="body2">
        {t('promoCodes.credits_value', { count: entry.credits })} ·{' '}
        {t(`promoCodes.status.${entry.status}`)} ·{' '}
        {t('promoCodes.created', {
          date: formatDate(localIso(new Date(entry.createdAt))),
        })}
      </Typography>
      {entry.note ? (
        <Typography variant="body2" color="text.secondary">
          {entry.note}
        </Typography>
      ) : null}
      {entry.status === 'redeemed' && entry.redeemedAt ? (
        <Typography variant="body2" color="text.secondary">
          {t('promoCodes.redeemedBy', {
            name: entry.redeemedByName ?? t('promoCodes.formerMember'),
            email: entry.redeemedByEmail ?? '',
            family: entry.redeemedFamilyId
              ? shortId(entry.redeemedFamilyId)
              : '',
            date: formatDate(localIso(new Date(entry.redeemedAt))),
          })}
        </Typography>
      ) : null}
      <Stack direction="row" spacing={1}>
        <Button
          variant="secondary"
          aria-label={t('promoCodes.copyCode', { code: entry.code })}
          onClick={onCopy}
        >
          {t('promoCodes.copy')}
        </Button>
        {entry.status === 'unused' ? (
          <Button
            variant="ghost"
            aria-label={t('promoCodes.revokeCode', { code: entry.code })}
            onClick={onRevoke}
          >
            {t('promoCodes.revoke')}
          </Button>
        ) : null}
      </Stack>
    </Stack>
  );
}
