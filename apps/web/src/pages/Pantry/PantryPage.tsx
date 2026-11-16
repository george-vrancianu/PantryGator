import {
  Alert,
  Button,
  PlusIcon,
  Spinner,
  Stack,
  Typography,
} from '@pocket-pantry/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../components/layout/Screen';
import {
  RowToggleErrorProvider,
  useRowToggleErrors,
} from '../../components/RowToggleErrors';
import { RowHintNote } from '../../components/RowHintNote';
import { UnverifiedToast } from '../../components/UnverifiedToast';
import { EmptyPantry, newPantryVisit } from './components/EmptyPantry';
import { ShelfCard } from './components/ShelfCard';
import { AddToPantrySheet } from './components/AddToPantrySheet';
import { LocationSection } from './components/LocationSection';
import { RowKeyHints } from './components/RowKeyHints';
import { PantryFilters } from './components/PantryFilters';
import { usePantryRowHint } from './hooks/usePantryRowHint';
import { usePantryScreen } from './hooks/usePantryScreen';

export function PantryPage() {
  const { t } = useTranslation(['pantry', 'common']);
  const screen = usePantryScreen();
  const rowToggleErrors = useRowToggleErrors();
  const rowHint = usePantryRowHint();
  const [visit] = useState(newPantryVisit);

  const focusAdd = useCallback(
    () =>
      document
        .querySelector<HTMLElement>(`[aria-label="${t('pantry:add')}"]`)
        ?.focus(),
    [t],
  );

  // The last Batch going leaves no section to hand focus on from, so the header "+" takes it.
  const hadBatches = useRef(false);
  useEffect(() => {
    if (
      screen.isEmpty &&
      hadBatches.current &&
      document.activeElement === document.body
    )
      focusAdd();
    hadBatches.current = !screen.isEmpty && !screen.isLoading && !screen.error;
  }, [screen.isEmpty, screen.isLoading, screen.error, focusAdd]);

  return (
    <RowToggleErrorProvider report={rowToggleErrors.report}>
      <UnverifiedToast />
      <Screen
        title={t('pantry:title')}
        status={screen.isEmpty ? t('pantry:empty.subtitle') : undefined}
        primary={{
          label: t('pantry:add'),
          icon: <PlusIcon size={20} />,
          onClick: screen.startAdding,
        }}
      >
        <RowHintNote hint={rowHint.hint} />
        {/* The list stays rendered behind the sheet. */}
        <AddToPantrySheet
          open={screen.adding}
          start={screen.addStart}
          location={screen.addLocation}
          onClose={screen.stopAdding}
          onExited={() => {
            if (document.activeElement === document.body) focusAdd();
          }}
        />
        <Stack spacing={1}>
          {screen.error ? <Alert>{screen.error}</Alert> : null}
          {rowToggleErrors.message ? (
            <Alert>{rowToggleErrors.message}</Alert>
          ) : null}
          {screen.error ? (
            <Button onClick={screen.retry}>{t('common:retry')}</Button>
          ) : null}
          {screen.isLoading ? <Spinner label={t('common:loading')} /> : null}
          {screen.isEmpty ? (
            <EmptyPantry
              onType={screen.startAdding}
              onAddTo={screen.startAddingAt}
              visit={visit}
            />
          ) : null}
          {!screen.isEmpty && !screen.isLoading && !screen.error ? (
            <PantryFilters
              query={screen.query}
              onQueryChange={screen.setQuery}
              filter={screen.filter}
              onFilterChange={screen.setFilter}
              counts={screen.counts}
            />
          ) : null}
          {screen.emptyShelf ? (
            <ShelfCard
              location={screen.emptyShelf}
              onAdd={screen.startAddingAt}
            />
          ) : null}
          {screen.noMatches ? (
            <Typography color="text.secondary">
              {t('pantry:noMatches')}
            </Typography>
          ) : null}
          {(screen.isEmpty ? [] : screen.sections).map((section) => (
            <LocationSection
              key={section.location}
              location={section.location}
              batchCount={section.batchCount}
              rows={section.rows}
              today={screen.today}
              onToggleOpen={screen.toggleOpen}
              onRemoveBatch={(batch) =>
                screen.removeBatch(batch.id, batch.name)
              }
              onAddBatch={screen.startAddingTo}
              onEmptied={focusAdd}
              rowHint={rowHint}
            />
          ))}
        </Stack>
        <RowKeyHints />
      </Screen>
    </RowToggleErrorProvider>
  );
}
