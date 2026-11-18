import { Alert, Box, Typography, tokens, radius } from '@pocket-pantry/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CreditPrice,
  useCreditPriceText,
} from '@/components/credits/CreditPrice/CreditPrice';
import { apiRequest } from '@/lib/api';
import { translateErrorCode } from '@/i18n/translateApiError';
import { creditsQueryKey, type Credits } from '@/lib/credits';
import { recipeReads } from '@/lib/recipeReads';
import { readScans } from '@/lib/scanReads';
import {
  dispatchScanSession,
  getScanSession,
  type SessionScan,
} from '@/lib/scanSession';

const buttonSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 2,
  minHeight: 44,
  px: 1.5,
  borderRadius: radius.control,
  border: `1px solid ${tokens.color.line}`,
  backgroundColor: tokens.color.surface,
  color: 'inherit',
  font: 'inherit',
  fontWeight: 600,
  textAlign: 'left',
  cursor: 'pointer',
  '&:focus-visible': {
    outline: `2px solid ${tokens.color.accentMid}`,
    outlineOffset: 2,
  },
} as const;

/**
 * The refusals of the server that keep a picked dish on its card, with its guesses, and out of the strip.
 * A refusal the check above could not see (a balance that moved since, the 20-draft limit, which only the
 * server counts, a read that waited its turn) comes back through the holder as `restore`.
 * Another refusal that belongs on the card is one more code here.
 */
const REFUSED_PICK_CODES = [
  'credits.insufficient',
  'recipe_drafts.limit_reached',
] as const;

export const cardId = (id: string) => `review-card-${id}`;

/**
 * A read Plate Scan's dish guesses, most likely first, and nothing else to review (ADR 0035).
 * Picking one leaves the Scan Session: the dish is handed to the recipe-reads holder, which has the
 * server write it as a Recipe Draft while the Member keeps scanning. A full holder keeps the card, and so
 * does a Family without the Credits the writing costs (its own Credit Price, besides the photo's): the
 * balance is looked up fresh before anything is handed over, and a pick the server still refuses
 * (`REFUSED_PICK_CODES`) is handed back by the holder, so the card returns with its guesses and the
 * refusal. Neither reaches the strip. A refusal that comes back after the Scan Session was left or
 * finished still puts the card back (a Session of just that card); sign-out aborts the reads first, so
 * nothing returns then. The returned card remounts and focus stays where `onPicked` moved it; the
 * refusal `Alert` is announced (`role="alert"`), and it is hidden while a new pick finds the holder full.
 */
export function PlateChoice({
  scan,
  onPicked,
}: {
  scan: SessionScan;
  /** Called once the dish is handed over and the card is gone: the overview moves focus on, as Remove does. */
  onPicked: () => void;
}) {
  const { t } = useTranslation(['review', 'errors']);
  const queryClient = useQueryClient();
  const headingId = useId();
  const priceText = useCreditPriceText('plate-recipe');
  const [full, setFull] = useState(false);
  const [short, setShort] = useState<{ price: number; balance: number } | null>(
    null,
  );
  const checking = useRef(false);
  /** The refusal of the server, when it refused after the check passed and handed the card back. */
  const refusal = scan.refusal;

  /** The Credits the Family is short of for the writing step, or null when it can pay (or this cannot be told). */
  const shortOfCredits = async () => {
    try {
      const credits = await queryClient.fetchQuery({
        queryKey: creditsQueryKey,
        queryFn: () => apiRequest<Credits>('/credits'),
        staleTime: 0,
      });
      const price = credits.prices['plate-recipe'];
      return credits.balance < price
        ? { price, balance: credits.balance }
        : null;
    } catch {
      // Not known: the server refuses a short balance too, and the row says so.
      return null;
    }
  };

  const pick = async (title: string) => {
    if (checking.current) return;
    setFull(false);
    setShort(null);
    checking.current = true;
    const refused = await shortOfCredits().finally(() => {
      checking.current = false;
    });
    if (refused) {
      setShort(refused);
      return;
    }
    const index = getScanSession().scans.findIndex((s) => s.id === scan.id);
    const outcome = recipeReads.add({
      kind: 'plate',
      title,
      token: scan.plateToken ?? '',
      returnOn: REFUSED_PICK_CODES,
      onReturned: (error) =>
        dispatchScanSession({
          type: 'restore',
          scan: {
            ...scan,
            refusal: { code: error.code, params: error.params },
          },
          index: Math.max(index, 0),
        }),
      // A used-up or expired token: the photo goes back to be read again, as a card does that failed.
      readAgain: () => {
        dispatchScanSession({
          type: 'restore',
          scan: {
            ...scan,
            status: 'queued',
            dishes: undefined,
            plateToken: undefined,
            refusal: undefined,
          },
          index: Math.max(index, 0),
        });
        readScans();
      },
    });
    if (outcome === 'full') {
      setFull(true);
      return;
    }
    dispatchScanSession({ type: 'remove', id: scan.id });
    onPicked();
  };

  return (
    <Box sx={{ mt: 0.5 }}>
      <Typography id={headingId} sx={{ fontWeight: 700 }}>
        {t('overview.pickDish')}
      </Typography>
      <Box
        role="group"
        aria-labelledby={headingId}
        sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}
      >
        {(scan.dishes ?? []).map((dish) => {
          const percent = Math.round(dish.confidence * 100);
          return (
            <Box
              key={dish.title}
              component="button"
              type="button"
              aria-label={t(
                priceText ? 'overview.dishOptionPriced' : 'overview.dishOption',
                { title: dish.title, percent, price: priceText },
              )}
              onClick={() => void pick(dish.title)}
              sx={buttonSx}
            >
              <span>{dish.title}</span>
              <Box
                component="span"
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.5 }}
              >
                <span aria-hidden="true">{percent}%</span>
                <CreditPrice kind="plate-recipe" />
              </Box>
            </Box>
          );
        })}
      </Box>
      {short || (refusal && !full) ? (
        <Box sx={{ mt: 1 }}>
          <Alert severity="error">
            {short
              ? t('errors:credits.insufficient', short)
              : refusal
                ? translateErrorCode(t, refusal.code, refusal.params)
                : null}
          </Alert>
        </Box>
      ) : null}
      {full ? (
        <Box sx={{ mt: 1 }}>
          <Alert>{t('overview.readsFull')}</Alert>
        </Box>
      ) : null}
    </Box>
  );
}
