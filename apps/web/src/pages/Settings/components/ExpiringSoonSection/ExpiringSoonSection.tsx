import {
  Alert,
  Box,
  Button,
  Card,
  MinusIcon,
  PlusIcon,
  Stack,
  Typography,
  radius,
  tokens,
  useToast,
  SectionHeading,
} from '@pocket-pantry/ui';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExpiryTag } from '@/components/pantry/ExpiryTag/ExpiryTag';
import { translateApiError } from '@/i18n/translateApiError';
import { useFamilySettings, useSetStaleThreshold } from '@/lib/settings';
import { expiryTagFor, localDate, localIso } from '@/lib/pantry';
import { useToday } from '@/lib/useToday';

/** The range the stepper offers. The API accepts 1 to 365; a stored value above the range is shown as it is. */
const MIN_DAYS = 1;
const MAX_DAYS = 30;
/** Taps within this window send one save, after the last of them. */
const SAVE_DELAY_MS = 600;

/** Sample Batches for the preview, by days from today. Names are translated in settings.json. */
const SAMPLES = [
  { key: 'milk', days: 0 },
  { key: 'spinach', days: 2 },
  { key: 'feta', days: 4 },
  { key: 'eggs', days: 9 },
] as const;

const stepperButton = {
  width: 38,
  minWidth: 38,
  px: 0,
  bgcolor: tokens.color.chipNeutral,
} as const;

/**
 * The Expiring soon control: how many days before expiry a Batch turns amber. The value is a draft until the
 * save lands, so taps move the value and the preview at once, and one save follows the last tap.
 */
export function ExpiringSoonSection() {
  const { t } = useTranslation('settings');
  const id = useId();
  const toast = useToast();
  const today = useToday();
  const settings = useFamilySettings();
  const save = useSetStaleThreshold();
  const saved = settings.data?.staleThresholdDays;

  // The value on screen while a tap is unsent or a save is running. `null` means the saved value.
  const [draft, setDraft] = useState<number | null>(null);
  const value = draft ?? saved;

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const unsent = useRef<number | null>(null);
  // Saves can overlap: count those in flight, and number them so only the latest may revert.
  const inFlight = useRef(0);
  const latestSave = useRef(0);

  // A new saved value (ours, once it lands, or another device's) replaces the draft, unless a change is still pending.
  useEffect(() => {
    if (inFlight.current === 0 && unsent.current === null) setDraft(null);
  }, [saved]);

  const flush = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const next = unsent.current;
    if (next === null) return;
    unsent.current = null;
    inFlight.current += 1;
    const saveNumber = ++latestSave.current;
    save.mutateAsync(next).then(
      () => {
        inFlight.current -= 1;
        toast.show(t('expiringSoon.saved'));
      },
      (error: unknown) => {
        inFlight.current -= 1;
        // Revert, unless a newer save has been sent or the Member has tapped again since.
        if (
          saveNumber === latestSave.current &&
          unsent.current === null &&
          timer.current === undefined
        )
          setDraft(null);
        toast.show(translateApiError(t, error));
      },
    );
  };

  // Leaving the tab must not drop a tap that is still waiting for its 600 ms.
  const flushNow = useRef(flush);
  useLayoutEffect(() => {
    flushNow.current = flush;
  });
  useEffect(
    () => () => {
      if (unsent.current !== null) flushNow.current();
    },
    [],
  );

  const step = (delta: number) => {
    const base = unsent.current ?? value;
    if (base === undefined) return;
    const next = base + delta;
    setDraft(next);
    unsent.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  const headingId = `${id}-expiring`;
  const loading = settings.isPending;
  const canMinus = value !== undefined && value > MIN_DAYS;
  const canPlus = value !== undefined && value < MAX_DAYS;

  return (
    <Stack component="section" spacing={1} aria-labelledby={headingId}>
      <SectionHeading id={headingId} title={t('expiringSoon.title')} />
      <Card>
        <Stack spacing={2}>
          {loading ? (
            <Box
              role="status"
              aria-label={t('loading')}
              sx={{
                height: 44,
                borderRadius: radius.control,
                bgcolor: tokens.color.subtle,
              }}
            />
          ) : null}
          {settings.error ? (
            <Alert>{translateApiError(t, settings.error)}</Alert>
          ) : null}
          {value !== undefined ? (
            <>
              <Stack
                direction="row"
                spacing={2}
                sx={{ alignItems: 'center', justifyContent: 'space-between' }}
              >
                <Typography
                  variant="meta"
                  color="text.secondary"
                  sx={{ flex: 1, minWidth: 0 }}
                >
                  {t('expiringSoon.hint')}
                </Typography>
                <Stack
                  role="group"
                  aria-labelledby={headingId}
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: 'center', flexShrink: 0 }}
                >
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={t('expiringSoon.fewer')}
                    disabled={!canMinus}
                    onClick={() => step(-1)}
                    sx={stepperButton}
                  >
                    <MinusIcon size={18} />
                  </Button>
                  <Box
                    aria-live="polite"
                    sx={{ minWidth: 52, textAlign: 'center' }}
                  >
                    <Typography
                      component="span"
                      sx={{
                        display: 'block',
                        fontSize: 20,
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {value}
                    </Typography>
                    <Typography
                      component="span"
                      variant="meta"
                      color="text.secondary"
                      sx={{ display: 'block', fontSize: 11, fontWeight: 600 }}
                    >
                      {t('expiringSoon.unit', { count: value })}
                    </Typography>
                  </Box>
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={t('expiringSoon.more')}
                    disabled={!canPlus}
                    onClick={() => step(1)}
                    sx={stepperButton}
                  >
                    <PlusIcon size={18} />
                  </Button>
                </Stack>
              </Stack>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 1,
                }}
              >
                {SAMPLES.map((sample) => {
                  const expiry = localIso(
                    localDate(
                      today.getFullYear(),
                      today.getMonth(),
                      today.getDate() + sample.days,
                    ),
                  );
                  return (
                    <Stack
                      key={sample.key}
                      direction="row"
                      spacing={1}
                      sx={{
                        p: 1,
                        borderRadius: radius.control,
                        bgcolor: tokens.color.subtle,
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        minWidth: 0,
                      }}
                    >
                      <Typography
                        sx={{ fontSize: 13, fontWeight: 600, minWidth: 0 }}
                      >
                        {t(`expiringSoon.samples.${sample.key}`)}
                      </Typography>
                      <ExpiryTag tag={expiryTagFor(expiry, today, value)} />
                    </Stack>
                  );
                })}
              </Box>
            </>
          ) : null}
        </Stack>
      </Card>
    </Stack>
  );
}
