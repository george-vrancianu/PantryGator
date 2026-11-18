import { Box, palette } from '@pocket-pantry/ui';
import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatAmount, formatRowAmount } from '@/lib/amount';
import { fullDate } from '@/lib/pantry';
import { useToday } from '@/lib/useToday';
import type { VoiceBatchRow, VoiceReviewAction } from '@/lib/voice';
import {
  displayName,
  effectiveExpiry,
  effectiveLocation,
  kindOf,
  soonestFirst,
  type VoiceActionKind,
} from './reviewModel';

const strong = { fontWeight: 600, color: palette('text-primary') } as const;

/** `text` with each of `parts` (amounts, in the order they occur) set in the stronger ink. */
function withStrong(text: string, parts: (string | null)[]): ReactNode {
  const out: ReactNode[] = [];
  let rest = text;
  parts.forEach((part, index) => {
    if (!part) return;
    const at = rest.indexOf(part);
    if (at < 0) return;
    out.push(rest.slice(0, at));
    out.push(
      <Box component="span" key={index} sx={strong}>
        {part}
      </Box>,
    );
    rest = rest.slice(at + part.length);
  });
  out.push(rest);
  return out.map((piece, index) => <Fragment key={index}>{piece}</Fragment>);
}

/** A Location or expiry the Member didn't say: dotted underline, with the word that says why. */
function Marked({ text, mark }: { text: string; mark: string }) {
  return (
    <Box
      component="span"
      sx={{
        borderBottom: `1px dotted ${palette('pp-line')}`,
        pb: '1px',
      }}
    >
      {text}
      <Box component="span" sx={{ color: palette('text-secondary') }}>
        {' · '}
        {mark}
      </Box>
    </Box>
  );
}

/** The words of a Voice Action row: its verb, and the second line under the name. */
export function useVoiceActionText() {
  const { t, i18n } = useTranslation(['voice', 'common']);
  const today = useToday();
  const language = i18n.language;

  const amountOf = (a: {
    quantity: number | null;
    unit: VoiceReviewAction['unit'];
  }) => formatRowAmount(a, language, t);
  const batchAmount = (batch: VoiceBatchRow, take: number | null | undefined) =>
    formatRowAmount(
      { quantity: take ?? batch.quantity, unit: batch.unit },
      language,
      t,
    );
  const dateOf = (iso: string | null) =>
    iso === null
      ? t('voice:review.detail.noDate')
      : fullDate(iso, today, language);

  const verb = (kind: VoiceActionKind) => t(`voice:review.op.${kind}`);

  /** The row's second line: what applying the Voice Action will do, or what holds Apply back. */
  const lineTwo = (action: VoiceReviewAction): ReactNode => {
    const kind = kindOf(action);
    const name = displayName(action);
    const batches = soonestFirst(action.rows.batches ?? []);
    const amount = amountOf(action);
    const noAmount = t('voice:review.detail.noAmount');
    const unmatched = action.ingredient
      ? null
      : t('voice:review.detail.unmatched');
    const join = (...parts: ReactNode[]) =>
      parts
        .filter((part) => part !== null && part !== false)
        .map((part, index) => (
          <Fragment key={index}>
            {index > 0 ? ' · ' : null}
            {part}
          </Fragment>
        ));
    const strongAmount = (value: string | null) =>
      value ? (
        <Box component="span" sx={strong}>
          {value}
        </Box>
      ) : (
        noAmount
      );

    if (action.target === 'shopping') {
      const item = action.rows.shoppingItem;
      const onList = item ? amountOf(item) : null;
      switch (kind) {
        case 'check':
          return amount
            ? withStrong(
                onList
                  ? `${amount}, ${t('voice:review.detail.listSaid', { amount: onList })}`
                  : amount,
                [amount],
              )
            : join(
                t('voice:review.detail.onList'),
                onList && strongAmount(onList),
              );
        case 'addChecked':
          return join(
            amount && strongAmount(amount),
            t('voice:review.detail.notOnList'),
          );
        case 'uncheck':
          return t('voice:review.detail.backOnList');
        case 'remove':
          return join(
            t('voice:review.detail.comesOff'),
            onList && strongAmount(onList),
          );
        case 'setQuantity': {
          const said = amount ?? noAmount;
          return withStrong(
            onList
              ? `${said}, ${t('voice:review.detail.listSaid', { amount: onList })}`
              : said,
            [amount],
          );
        }
        default:
          return join(strongAmount(amount), unmatched);
      }
    }

    // Pantry
    if (kind === 'runningLow') return t('voice:review.detail.lowHint');
    if (action.op === 'runningLow') {
      return join(noAmount, t('voice:review.detail.lowToList', { name }));
    }
    if (kind === 'add') {
      const location = effectiveLocation(action);
      const expiry = effectiveExpiry(action);
      const spokenLocation = action.location !== null;
      const spokenExpiry = action.expiresOn !== null || action.noExpiry;
      return join(
        strongAmount(amount),
        location === null ? (
          <Box
            component="span"
            sx={{ color: palette('warning-main'), fontWeight: 600 }}
          >
            {t('voice:review.detail.noPlace')}
          </Box>
        ) : spokenLocation ? (
          t(`common:locations.${location}`)
        ) : (
          <Marked
            text={t(`common:locations.${location}`)}
            mark={t('voice:review.detail.usual')}
          />
        ),
        expiry === null ? (
          t('voice:review.detail.noExpiry')
        ) : spokenExpiry ? (
          t('voice:review.detail.expires', { date: dateOf(expiry) })
        ) : (
          <Marked
            text={t('voice:review.detail.expires', { date: dateOf(expiry) })}
            mark={t('voice:review.detail.default')}
          />
        ),
        unmatched,
      );
    }
    if (action.status === 'needsBatch') {
      const unit = batches[0]?.unit;
      const said = amount ?? '';
      if (action.batchId) {
        return withStrong(
          t('voice:review.detail.takesPicked', { amount: said }),
          [said],
        );
      }
      return (
        <Box
          component="span"
          sx={{ color: palette('warning-main'), fontWeight: 600 }}
        >
          {t('voice:review.detail.needsBatch', {
            amount: said,
            unit: unit ? t(`common:units.${unit}`) : '',
          })}
        </Box>
      );
    }
    if (kind === 'removeAll') {
      const units = new Set(batches.map((batch) => batch.unit));
      const known = batches.every((batch) => batch.quantity !== null);
      const total =
        known && units.size === 1 && batches[0]?.unit
          ? formatAmount(
              batches.reduce((sum, batch) => sum + (batch.quantity ?? 0), 0),
              batches[0].unit,
              language,
              t,
            )
          : null;
      return join(
        t('voice:review.detail.takesAll', { count: batches.length }),
        total && strongAmount(total),
      );
    }
    if (kind === 'use') {
      return withStrong(
        t('voice:review.detail.takesFrom', {
          count: batches.length,
          amount: amount ?? '',
        }),
        [amount],
      );
    }
    const first = batches[0];
    if (!first) return null;
    const taken = batchAmount(first, first.take) ?? '';
    return withStrong(
      `${t('voice:review.detail.takes', {
        amount: taken,
        date: dateOf(first.expiresOn),
      })}, ${t('voice:review.detail.soonest')}`,
      [taken],
    );
  };

  return { verb, lineTwo, amountOf };
}
