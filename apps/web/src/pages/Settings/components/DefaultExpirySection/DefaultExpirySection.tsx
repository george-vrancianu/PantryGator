import {
  Alert,
  Box,
  Button,
  CloseIcon,
  IconButton,
  Stack,
  Typography,
  SectionHeading,
} from '@pocket-pantry/ui';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';
import {
  familySettingsQueryKey,
  useCategoryOptions,
  useFamilySettings,
  useRemoveExpiryOverride,
} from '@/lib/settings';
import { useDeferredRemoval } from '@/lib/useDeferredRemoval';
import { lookupCategory } from '../../defaultExpiry';
import {
  DefaultExpirySheet,
  type SheetStart,
} from '../DefaultExpirySheet/DefaultExpirySheet';

type SheetState = { open: boolean; start: SheetStart; session: number };

/**
 * Family Default expiry: one row per override, removed with Undo (ADR 0009), and a sheet to set or
 * change one. Every Member can edit it.
 */
export function DefaultExpirySection() {
  const { t } = useTranslation('settings');
  const id = useId();
  const settings = useFamilySettings();
  const categories = useCategoryOptions();
  const removeOverride = useRemoveExpiryOverride();
  const removal = useDeferredRemoval(
    familySettingsQueryKey,
    removeOverride.mutateAsync,
  );

  // A removed override stays out of the list, refetches included, until its delete has settled.
  const overrides = (settings.data?.expiryOverrides ?? []).filter(
    (override) => !removal.hiddenIds.has(override.categoryId),
  );

  const [sheet, setSheet] = useState<SheetState>({
    open: false,
    start: { kind: 'pick' },
    session: 0,
  });
  // Where focus goes back to when the sheet closes; the add button if the opener has gone.
  const opener = useRef<HTMLElement | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  // The opener is passed in: Safari does not focus a clicked button, so `activeElement` would be `<body>`.
  const openSheet = (start: SheetStart, from: HTMLElement) => {
    opener.current = from;
    setSheet((prev) => ({ open: true, start, session: prev.session + 1 }));
  };
  const closeSheet = () => setSheet((prev) => ({ ...prev, open: false }));
  const focusOpener = () => {
    if (opener.current?.isConnected) opener.current.focus();
    else addButton.current?.focus();
  };

  /** Remove the override with Undo, so the category falls back to its Catalog default. */
  const revertToCatalog = ({ id, name }: { id: string; name: string }) =>
    removal.remove(id, name, t('defaultExpiry.removed', { name }));

  const error = settings.error ? translateApiError(t, settings.error) : null;
  const headingId = `${id}-heading`;

  return (
    <Stack component="section" spacing={2} aria-labelledby={headingId}>
      <SectionHeading id={headingId} title={t('defaultExpiry.title')} />
      <Typography variant="meta" color="text.secondary">
        {t('defaultExpiry.hint')}
      </Typography>
      {error ? <Alert>{error}</Alert> : null}
      {overrides.length > 0 ? (
        <Stack
          component="ul"
          aria-labelledby={headingId}
          sx={{ listStyle: 'none', p: 0, m: 0 }}
        >
          {overrides.map((override) => {
            const category = lookupCategory(
              categories.data,
              override.categoryId,
            );
            const subline = category
              ? category.wholeParent
                ? [category.parentName, t('defaultExpiry.wholeParent')]
                : [
                    category.parentName,
                    category.catalogDays !== null
                      ? t('defaultExpiry.catalog', {
                          days: category.catalogDays,
                        })
                      : null,
                  ]
              : [];
            return (
              <Stack
                component="li"
                key={override.categoryId}
                direction="row"
                sx={{
                  alignItems: 'center',
                  minHeight: 52,
                  borderTop: 1,
                  borderColor: 'divider',
                }}
              >
                <Box
                  component="button"
                  type="button"
                  onClick={(event) =>
                    openSheet(
                      { kind: 'edit', categoryId: override.categoryId },
                      event.currentTarget,
                    )
                  }
                  sx={{
                    display: 'flex',
                    flex: 1,
                    minWidth: 0,
                    alignItems: 'center',
                    gap: 1,
                    py: 1,
                    border: 0,
                    background: 'none',
                    color: 'inherit',
                    font: 'inherit',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      {override.name}
                    </Typography>
                    {subline.length > 0 ? (
                      <Typography variant="meta" color="text.secondary">
                        {subline.filter(Boolean).join(' · ')}
                      </Typography>
                    ) : null}
                  </Box>
                  <Typography variant="body1" sx={{ fontWeight: 700 }}>
                    <span>{override.days}</span>{' '}
                    <Typography
                      component="span"
                      variant="meta"
                      color="text.secondary"
                    >
                      {t('defaultExpiry.unit')}
                    </Typography>
                  </Typography>
                </Box>
                <IconButton
                  label={t('defaultExpiry.useCatalog', {
                    name: override.name,
                  })}
                  size={40}
                  onClick={() =>
                    revertToCatalog({
                      id: override.categoryId,
                      name: override.name,
                    })
                  }
                >
                  <CloseIcon size={18} />
                </IconButton>
              </Stack>
            );
          })}
        </Stack>
      ) : (
        <Typography color="text.secondary">
          {t('defaultExpiry.empty')}
        </Typography>
      )}
      <Button
        ref={addButton}
        variant="secondary"
        onClick={(event) => openSheet({ kind: 'pick' }, event.currentTarget)}
      >
        {t('defaultExpiry.add')}
      </Button>
      <DefaultExpirySheet
        key={sheet.session}
        open={sheet.open}
        start={sheet.start}
        options={categories.data}
        optionsPending={categories.isPending}
        optionsError={categories.error}
        overrides={overrides}
        onClose={closeSheet}
        onExited={focusOpener}
        onUseCatalog={revertToCatalog}
        onBeforeSave={removal.discard}
      />
    </Stack>
  );
}
