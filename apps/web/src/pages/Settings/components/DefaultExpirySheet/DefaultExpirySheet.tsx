import {
  Alert,
  Box,
  IconButton,
  MinusIcon,
  PlusIcon,
  Sheet,
  Stack,
  Tag,
  radius,
  Typography,
  tokens,
  useToast,
} from '@pocket-pantry/ui';
import { useEffect, useRef, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';
import {
  useSetExpiryOverride,
  type CategoryOptions,
  type ExpiryOverride,
} from '@/lib/settings';
import {
  lookupCategory,
  MAX_DAYS,
  MIN_DAYS,
  QUICK_PICK_DAYS,
  startingDays,
  type CategoryRef,
} from '../../defaultExpiry';
import { CategoryPicker } from '../CategoryPicker/CategoryPicker';

/** Where the sheet opens: the pick list, or straight into an override (edit mode). */
export type SheetStart =
  { kind: 'pick' } | { kind: 'edit'; categoryId: string };

export type DefaultExpirySheetProps = {
  open: boolean;
  start: SheetStart;
  options: CategoryOptions | undefined;
  /** The categories query is still loading. */
  optionsPending: boolean;
  /** Why the categories failed to load, if they did. */
  optionsError: unknown;
  /** The Family's visible overrides (not ones pending an Undo). */
  overrides: ExpiryOverride[];
  onClose: () => void;
  onExited: () => void;
  /** "Use Catalog default": the section removes the override with Undo. */
  onUseCatalog: (category: CategoryRef) => void;
  /** Runs just before Save sends: drops a removal of this category still waiting on its Undo. */
  onBeforeSave: (categoryId: string) => void;
};

type View =
  { mode: 'pick' } | { mode: 'days'; categoryId: string; fromPick: boolean };

/**
 * The Default expiry sheet: a pick list of categories, then a days editor. Opened
 * from a row it starts in days mode in edit mode; it keeps its own state, so the
 * section remounts it (via `key`) for each opening.
 */
export function DefaultExpirySheet({
  open,
  start,
  options,
  optionsPending,
  optionsError,
  overrides,
  onClose,
  onExited,
  onUseCatalog,
  onBeforeSave,
}: DefaultExpirySheetProps) {
  const { t } = useTranslation('settings');
  const toast = useToast();
  const setOverride = useSetExpiryOverride();
  const overrideDays = (id: string) =>
    overrides.find((o) => o.categoryId === id)?.days ?? null;

  const [view, setView] = useState<View>(() =>
    start.kind === 'edit'
      ? { mode: 'days', categoryId: start.categoryId, fromPick: false }
      : { mode: 'pick' },
  );
  const [query, setQuery] = useState('');
  const [days, setDays] = useState<number>(() => {
    if (start.kind !== 'edit') return 0;
    const category = lookupCategory(options, start.categoryId);
    return startingDays(overrideDays(start.categoryId), category?.catalogDays);
  });
  // Focus moves to the new view once the sheet has opened (not on first render).
  const entered = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const daysRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!entered.current) return;
    if (view.mode === 'pick') searchRef.current?.focus();
    else daysRef.current?.focus();
  }, [view.mode]);

  const category =
    view.mode === 'days'
      ? (lookupCategory(options, view.categoryId) ??
        fallbackCategory(overrides, view.categoryId))
      : null;

  const chooseCategory = (id: string) => {
    const found = lookupCategory(options, id);
    setDays(startingDays(overrideDays(id), found?.catalogDays));
    setView({ mode: 'days', categoryId: id, fromPick: true });
  };

  const save = () => {
    if (!category) return;
    onBeforeSave(category.id);
    setOverride.mutateAsync({ categoryId: category.id, days }).then(
      () => {
        toast.show(
          t('defaultExpiry.savedToast', { name: category.name, count: days }),
        );
        onClose();
      },
      () => {
        // The error stays above the footer; the sheet stays open.
      },
    );
  };

  // "Use Catalog default" whenever the open category has an override, however it was reached.
  const hasOverride = category !== null && overrideDays(category.id) !== null;

  const actions =
    view.mode === 'days' && category
      ? {
          primary: {
            label: t('defaultExpiry.save'),
            pending: setOverride.isPending,
            onClick: save,
          },
          secondary: hasOverride
            ? {
                label: t('defaultExpiry.useCatalogButton'),
                onClick: () => {
                  onUseCatalog(category);
                  onClose();
                },
              }
            : undefined,
        }
      : {};

  return (
    <Sheet
      open={open}
      onClose={onClose}
      onEntered={() => {
        entered.current = true;
      }}
      initialFocus={view.mode === 'pick' ? searchRef : daysRef}
      onExited={onExited}
      title={
        view.mode === 'pick'
          ? t('defaultExpiry.pickTitle')
          : (category?.name ?? '')
      }
      subtitle={
        view.mode === 'pick'
          ? t('defaultExpiry.pickHint')
          : subline(t, category) || undefined
      }
      onBack={
        view.mode === 'days' && view.fromPick
          ? () => {
              setQuery('');
              setView({ mode: 'pick' });
            }
          : undefined
      }
      size={view.mode === 'pick' ? 'tall' : 'content'}
      {...actions}
    >
      {view.mode === 'pick' ? (
        <CategoryPicker
          query={query}
          onQuery={setQuery}
          searchRef={searchRef}
          options={options}
          optionsPending={optionsPending}
          optionsError={optionsError}
          onChoose={chooseCategory}
          renderTrailing={(row) =>
            overrideDays(row.id) !== null ? (
              <Tag tone="accent">
                {t('defaultExpiry.set', { days: overrideDays(row.id) })}
              </Tag>
            ) : row.catalogDays !== null ? (
              <Typography variant="meta" color="text.secondary">
                {t('defaultExpiry.catalog', { days: row.catalogDays })}
              </Typography>
            ) : null
          }
        />
      ) : (
        <DaysEditor
          groupRef={daysRef}
          error={
            setOverride.error ? translateApiError(t, setOverride.error) : null
          }
          days={days}
          onDays={setDays}
          catalogDays={category?.catalogDays ?? null}
        />
      )}
    </Sheet>
  );
}

/** A row whose category is not in the loaded options: name only, from the override. */
function fallbackCategory(
  overrides: ExpiryOverride[],
  id: string,
): CategoryRef {
  return {
    id,
    name: overrides.find((o) => o.categoryId === id)?.name ?? '',
    parentName: '',
    wholeParent: false,
    catalogDays: null,
  };
}

function subline(
  t: (key: string, options?: Record<string, unknown>) => string,
  category: CategoryRef | null,
): string {
  if (!category) return '';
  const parts = [
    category.parentName ? category.parentName : null,
    category.wholeParent ? null : catalogDefaultText(t, category.catalogDays),
  ];
  return parts.filter(Boolean).join(' · ');
}

function catalogDefaultText(
  t: (key: string, options?: Record<string, unknown>) => string,
  catalogDays: number | null,
): string | null {
  if (catalogDays === null) return null;
  return t('defaultExpiry.catalogDefault', { count: catalogDays });
}

function DaysEditor({
  groupRef,
  error,
  days,
  onDays,
  catalogDays,
}: {
  /** Takes focus when the editor opens: it replaces the picker the Member just left. */
  groupRef: Ref<HTMLDivElement>;
  /** Why Save failed; the sheet stays open. */
  error: string | null;
  days: number;
  onDays: (value: number) => void;
  catalogDays: number | null;
}) {
  const { t } = useTranslation('settings');
  const { color } = tokens;
  return (
    <Stack spacing={2} sx={{ px: 2, pb: 2 }}>
      {error ? <Alert>{error}</Alert> : null}
      <Box
        ref={groupRef}
        tabIndex={-1}
        role="group"
        aria-label={t('defaultExpiry.quickPicks')}
        sx={{ outline: 'none' }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 1,
          }}
        >
          {QUICK_PICK_DAYS.map((quick) => {
            const pressed = days === quick;
            return (
              <Box
                key={quick}
                component="button"
                type="button"
                aria-pressed={pressed}
                aria-label={t(`defaultExpiry.quick.${quick}`)}
                onClick={() => onDays(quick)}
                sx={{
                  minHeight: 54,
                  borderRadius: radius.control,
                  border: '1px solid',
                  borderColor: pressed ? 'transparent' : color.line,
                  backgroundColor: pressed ? color.accent : color.surface,
                  color: pressed ? 'pp.accentInk' : color.ink,
                  font: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <Typography
                  component="span"
                  variant="body1"
                  sx={{ fontWeight: 700, display: 'block' }}
                >
                  {quick}
                </Typography>
                <Typography component="span" variant="meta">
                  {t(`defaultExpiry.quickShort.${quick}`)}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          px: 2,
          py: 1.5,
          borderRadius: radius.card,
          backgroundColor: color.surface,
          border: `1px solid ${color.line}`,
        }}
      >
        <IconButton
          label={t('defaultExpiry.fewer')}
          size={40}
          disabled={days <= MIN_DAYS}
          onClick={() => onDays(Math.max(MIN_DAYS, days - 1))}
        >
          <MinusIcon size={18} />
        </IconButton>
        <Box sx={{ textAlign: 'center' }}>
          <Typography
            variant="body1"
            aria-live="polite"
            sx={{ fontWeight: 700 }}
          >
            {t('defaultExpiry.value', { count: days })}
          </Typography>
          {catalogDays !== null ? (
            <Typography variant="meta" color="text.secondary">
              {t('defaultExpiry.catalogSays', { days: catalogDays })}
            </Typography>
          ) : null}
        </Box>
        <IconButton
          label={t('defaultExpiry.more')}
          size={40}
          disabled={days >= MAX_DAYS}
          onClick={() => onDays(Math.min(MAX_DAYS, days + 1))}
        >
          <PlusIcon size={18} />
        </IconButton>
      </Box>
    </Stack>
  );
}
