import {
  Box,
  Button,
  SearchIcon,
  Typography,
  radius,
  palette,
} from '@pocket-pantry/ui';
import { soonBorder } from '../soonBorder';
import { useEffect, useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AmountField } from '@/components/catalog/AmountField/AmountField';
import { ExpiryTag } from '@/components/pantry/ExpiryTag/ExpiryTag';
import { LocationToggle } from '@/components/pantry/LocationToggle/LocationToggle';
import { CatalogSearch } from '@/components/catalogSearch/CatalogSearch/CatalogSearch';
import { ExpiryField } from '@/components/expiryPicker/ExpiryField/ExpiryField';
import { expiryContext } from '@/components/expiryPicker/expiryContext';
import type { CatalogSearchResult, Unit } from '@/lib/catalog';
import { defaultExpiryDate, fullDate, useExpiryTags } from '@/lib/pantry';
import { useToday } from '@/lib/useToday';
import type { VoiceBatchRow, VoiceReviewAction } from '@/lib/voice';
import { cachedShoppingRow } from '@/lib/shopping';
import { voiceNote } from '@/lib/voiceNote';
import {
  canChangeIngredient,
  displayName,
  effectiveExpiry,
  effectiveLocation,
  hasAmount,
  soonestFirst,
} from '../reviewModel';
import { useVoiceActionText } from '../voiceActionText';

const eyebrow = {
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: '.07em',
  textTransform: 'uppercase',
  color: palette('text-secondary'),
  mb: '6px',
} as const;

const note = {
  fontSize: 12.5,
  color: palette('text-secondary'),
  mt: '6px',
} as const;

/**
 * What a Pantry add falls back to for a Match: its Catalog Location and Default
 * Expiry. Catalog search already applies the Family's expiry overrides to
 * `expiryDays`, so this agrees with the server's `addDefaults`.
 */
function defaultsOf(ingredient: CatalogSearchResult, today: Date) {
  const { location, expiryDays } = ingredient.defaults;
  return {
    ...(location ? { location } : {}),
    ...(expiryDays === null
      ? {}
      : { expiresOn: defaultExpiryDate(expiryDays, today) }),
  };
}

function AmountEditor({
  action,
  typed,
  invalid,
  onTyped,
}: {
  action: VoiceReviewAction;
  typed: string;
  invalid: boolean;
  onTyped: (text: string) => void;
}) {
  const { t } = useTranslation(['voice', 'common']);
  const setUnit = (unit: Unit | '') =>
    voiceNote.edit(action.id, { unit: unit === '' ? null : unit });
  return (
    // Pulled out of the editor's 57 px indent like the Location toggle, so the three fields share a left edge.
    <Box sx={{ ml: '-45px' }}>
      <AmountField
        name={displayName(action)}
        quantity={typed}
        unit={action.unit ?? ''}
        onQuantityChange={(quantity, unit) => {
          onTyped(quantity);
          if (unit !== undefined) setUnit(unit);
        }}
        onUnitChange={setUnit}
        error={invalid ? t('common:amount.invalid') : null}
        // Enter has no save here; Done below closes the row.
        onSubmit={() => {}}
        amountScale={action.ingredient?.amountScale}
        label={t('voice:review.edit.amount')}
        // A misheard amount is corrected here, not converted: a new unit keeps the number.
        rescaleOnUnitChange={false}
      />
    </Box>
  );
}

function ExpiresEditor({
  action,
  typed,
  spokenExpiry,
}: {
  action: VoiceReviewAction;
  /** The amount as typed, for the sheet's context line. */
  typed: string;
  /** The expiry the server heard, to tell it from one picked here. */
  spokenExpiry: string | null;
}) {
  const { t, i18n } = useTranslation(['voice', 'common']);
  const expiry = effectiveExpiry(action);
  const location = effectiveLocation(action);
  const name = displayName(action);

  // Only where the date came from; the ExpiryField above already shows the date itself.
  let source: string | null = null;
  if (expiry !== null) {
    if (action.expiresOn === null) {
      source = t('voice:review.edit.defaultExpiry');
    } else if (action.expiresOn === spokenExpiry) {
      source = t('voice:review.edit.fromSpeech');
    }
  }

  return (
    // Pulled out of the editor's 57 px indent like the Location toggle, so the three fields share a left edge.
    <Box sx={{ ml: '-45px' }}>
      <ExpiryField
        label={t('voice:review.edit.expires')}
        value={expiry}
        onChange={(iso) =>
          voiceNote.edit(
            action.id,
            iso === null
              ? { noExpiry: true, expiresOn: null }
              : { noExpiry: false, expiresOn: iso },
          )
        }
        usualDays={action.ingredient?.defaults.expiryDays ?? null}
        context={
          location === null
            ? name
            : expiryContext(
                { name, quantity: typed, unit: action.unit, location },
                i18n.language,
                t,
              )
        }
      />
      {source ? (
        // The copy is lowercase ("from what you said"), so capitalize it as a standalone line.
        <Typography
          sx={{ ...note, '&::first-letter': { textTransform: 'uppercase' } }}
        >
          {source}
        </Typography>
      ) : null}
    </Box>
  );
}

function LocationEditor({ action }: { action: VoiceReviewAction }) {
  const { t } = useTranslation(['voice', 'common']);
  return (
    <Box>
      {/* Pulled out of the editor's 57 px indent (to 12 px from the row edge) so the Romanian labels fit whole at 320 px; the amount and expiry fields do the same. */}
      <Box sx={{ ml: '-45px' }}>
        <LocationToggle
          label={t('voice:review.edit.location')}
          value={effectiveLocation(action)}
          onChange={(location) => voiceNote.edit(action.id, { location })}
          voicePicker={action.id}
        />
        {action.location === null && action.defaults.location ? (
          <Typography sx={note}>
            {t('voice:review.edit.locationDefault')}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
}

function BatchEditor({ action }: { action: VoiceReviewAction }) {
  const { t, i18n } = useTranslation(['voice', 'common']);
  const today = useToday();
  const { tagFor } = useExpiryTags(today);
  const { amountOf } = useVoiceActionText();
  const name = useId();
  const batches = soonestFirst(action.rows.batches ?? []);
  const label = t('voice:review.edit.whichBatch');
  const pickedIndex = batches.findIndex((batch) => batch.id === action.batchId);

  return (
    <Box>
      <Typography component="div" id={`${name}-label`} sx={eyebrow}>
        {label}
      </Typography>
      <Box
        role="radiogroup"
        aria-labelledby={`${name}-label`}
        sx={{
          backgroundColor: palette('background-paper'),
          border: `1px solid ${pickedIndex < 0 ? soonBorder : palette('pp-line')}`,
          borderRadius: radius.control,
          overflow: 'hidden',
        }}
      >
        {batches.map((batch: VoiceBatchRow, index) => {
          const amount = amountOf(batch) ?? t('voice:review.detail.noAmount');
          const date =
            batch.expiresOn === null
              ? t('voice:review.detail.noDate')
              : fullDate(batch.expiresOn, today, i18n.language);
          return (
            <Box
              component="label"
              key={batch.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                minHeight: 50,
                px: '12px',
                py: '7px',
                cursor: 'pointer',
                borderTop: index === 0 ? 0 : `1px solid ${palette('divider')}`,
              }}
            >
              <input
                type="radio"
                name={name}
                value={batch.id}
                checked={action.batchId === batch.id}
                data-voice-picker={index === 0 ? action.id : undefined}
                onChange={() =>
                  voiceNote.edit(action.id, { batchId: batch.id })
                }
                style={{ width: 20, height: 20, accentColor: 'currentColor' }}
              />
              <Box
                component="span"
                aria-hidden
                sx={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  bgcolor: palette('pp-chip'),
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {index + 1}
              </Box>
              <Box component="span" sx={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                <Box component="b">{amount}</Box>
                <Box component="span" sx={{ color: palette('text-secondary') }}>
                  {' · '}
                  {date}
                </Box>
              </Box>
              <ExpiryTag tag={tagFor(batch.expiresOn)} />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function IngredientEditor({ action }: { action: VoiceReviewAction }) {
  const { t } = useTranslation(['voice', 'common']);
  const [searching, setSearching] = useState(false);
  const today = useToday();
  const queryClient = useQueryClient();
  const refocus = useRef(false);
  const name = displayName(action);

  // Leaving the search with Escape puts focus back on "Change".
  useEffect(() => {
    if (searching || !refocus.current) return;
    refocus.current = false;
    document
      .querySelector<HTMLElement>(`[data-voice-change="${action.id}"]`)
      ?.focus();
  }, [searching, action.id]);

  if (searching) {
    return (
      <Box
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          // Escape belongs to the search, never to the Sheet behind it.
          event.stopPropagation();
          const open = event.currentTarget
            .querySelector('[role="combobox"]')
            ?.getAttribute('aria-expanded');
          if (open === 'true') return;
          setSearching(false);
          refocus.current = true;
        }}
      >
        <Typography component="div" sx={eyebrow}>
          {t('voice:review.edit.ingredient')}
        </Typography>
        <CatalogSearch
          autoFocus
          showUnit={false}
          defaultQuery={action.ingredient?.name ?? action.name ?? undefined}
          label={t('voice:review.edit.searchLabel', { name })}
          onSelect={(ingredient) => {
            voiceNote.edit(action.id, {
              ingredient,
              name: null,
              ...(action.target === 'shopping'
                ? {
                    shoppingItem: cachedShoppingRow(queryClient, ingredient.id),
                  }
                : {}),
              // A Pantry add's Location and Default Expiry follow the new Match.
              ...(action.target === 'pantry'
                ? { defaults: defaultsOf(ingredient, today) }
                : {}),
            });
            setSearching(false);
          }}
        />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      <Typography
        component="span"
        sx={{ fontSize: 13, color: palette('text-secondary') }}
      >
        {t('voice:review.edit.ingredient')}
      </Typography>
      <Typography component="span" sx={{ fontSize: 14, fontWeight: 700 }}>
        {name}
      </Typography>
      {action.ingredient ? null : (
        <Box
          component="span"
          sx={{
            fontSize: 11.5,
            fontWeight: 600,
            px: '8px',
            py: '2px',
            borderRadius: radius.tag,
            backgroundColor: palette('warning-light'),
            color: palette('warning-main'),
          }}
        >
          {t('voice:review.edit.unmatched')}
        </Box>
      )}
      {canChangeIngredient(action) ? (
        <Button
          variant="ghost"
          size="sm"
          data-voice-change={action.id}
          startIcon={<SearchIcon size={15} />}
          aria-label={t('voice:review.edit.changeIngredient', { name })}
          onClick={() => setSearching(true)}
        >
          {t('voice:review.edit.change')}
        </Button>
      ) : null}
    </Box>
  );
}

/** The open row's editor: what was heard, then the fields that apply to this Voice Action. */
export function ActionEditor({
  action,
  typed,
  invalid,
  spokenExpiry,
  onTyped,
  onDone,
}: {
  action: VoiceReviewAction;
  typed: string;
  invalid: boolean;
  spokenExpiry: string | null;
  onTyped: (text: string) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation(['voice', 'common']);
  const pantryAdd = action.target === 'pantry' && action.op === 'add';
  const batches =
    action.target === 'pantry' &&
    action.op === 'remove' &&
    action.status === 'needsBatch';
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        pt: '2px',
        pb: '14px',
        pr: '14px',
        pl: '57px',
      }}
    >
      <Typography sx={{ fontSize: 12.5, color: palette('text-secondary') }}>
        {t('voice:review.edit.heard')} “{action.text}”
      </Typography>
      {hasAmount(action) ? (
        <AmountEditor
          action={action}
          typed={typed}
          invalid={invalid}
          onTyped={onTyped}
        />
      ) : null}
      {pantryAdd ? (
        <ExpiresEditor
          action={action}
          typed={typed}
          spokenExpiry={spokenExpiry}
        />
      ) : null}
      {pantryAdd ? <LocationEditor action={action} /> : null}
      {batches ? <BatchEditor action={action} /> : null}
      <IngredientEditor action={action} />
      <Box>
        <Button variant="tonal" size="sm" onClick={onDone}>
          {t('voice:review.edit.done')}
        </Button>
      </Box>
    </Box>
  );
}
