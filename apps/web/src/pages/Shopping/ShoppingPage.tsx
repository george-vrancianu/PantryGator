import {
  Alert,
  Box,
  Button,
  HeaderButton,
  ImportIcon,
  PlusIcon,
  Spinner,
  Stack,
} from '@pocket-pantry/ui';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useTemplates } from '../../lib/shoppingTemplates';
import { Screen } from '../../components/layout/Screen';
import {
  RowToggleErrorProvider,
  useRowToggleErrors,
} from '../../components/RowToggleErrors';
import { RowHintNote } from '../../components/RowHintNote';
import { useRowHint } from '../../lib/useRowHint';
import { itemCount } from '../../lib/shopping';
import { UnverifiedToast } from '../../components/UnverifiedToast';
import { AddSheet } from './components/addSheet/AddSheet';
import { FinishShoppingReview } from './components/FinishShoppingReview';
import { ShoppingGroups } from './components/ShoppingGroups';
import { SaveTemplateSheet } from './components/SaveTemplateSheet';
import { ApplyTemplatesSheet } from './components/ApplyTemplatesSheet';
import { SaveListRow } from './components/SaveListRow';
import { EmptyListStart } from './components/EmptyListStart';
import { FinishShoppingRow } from './components/FinishShoppingRow';
import { ShoppingHeader } from './components/ShoppingHeader';
import { useShoppingScreen } from './hooks/useShoppingScreen';

export function ShoppingPage() {
  const { t } = useTranslation(['shopping', 'common']);
  const templates = useTemplates();
  const screen = useShoppingScreen();
  const rowToggleErrors = useRowToggleErrors();
  const [reviewing, setReviewing] = useState(false);
  // `?finish=1` (the Empty Pantry's ticked bar) opens Finish Shopping's Review once the list has
  // loaded, then leaves the URL, so a reload does not reopen it.
  const [params, setParams] = useSearchParams();
  const finishRequested = params.get('finish') === '1' && screen.list != null;
  if (finishRequested && !reviewing) setReviewing(true);
  useEffect(() => {
    if (!finishRequested) return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('finish');
        return next;
      },
      { replace: true },
    );
  }, [finishRequested, setParams]);
  const hint = useRowHint(
    'shopping',
    !reviewing && (screen.list?.groups.length ?? 0) > 0,
  );
  // Removing the last row unmounts the list that held focus: hand it to the Start your list block.
  const empty = useRef<HTMLDivElement>(null);
  const hadGroups = useRef(false);
  const groupCount = screen.list?.groups.length ?? 0;
  useEffect(() => {
    if (groupCount === 0 && hadGroups.current) {
      const active = document.activeElement;
      if (!active || active === document.body) empty.current?.focus();
    }
    hadGroups.current = groupCount > 0;
  }, [groupCount]);
  // A tile that opened a sheet unmounts once the sheet fills the list: put focus back on the
  // header "+" / the header's Import button instead of leaving it on <body>.
  const importButton = useRef<HTMLButtonElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);
  const refocusIfOpenerGone = (
    target: React.RefObject<HTMLButtonElement | null>,
  ) => {
    if (opener.current && !opener.current.isConnected) target.current?.focus();
    opener.current = null;
  };
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);

  // Every way in starts clean, with no error left from an earlier opening.
  // The opener is the clicked element: Safari does not focus a button on tap.
  const openSheet = (from: Element) => {
    screen.resetAddError();
    opener.current = from;
    setSheetOpen(true);
  };

  const openApply = (from: Element) => {
    opener.current = from;
    setApplyOpen(true);
  };

  if (reviewing) {
    return (
      <Screen title={t('shopping:title')}>
        <FinishShoppingReview
          onDone={() => setReviewing(false)}
          onCancel={() => setReviewing(false)}
        />
      </Screen>
    );
  }

  return (
    <RowToggleErrorProvider report={rowToggleErrors.report}>
      <UnverifiedToast />
      <Screen
        title={t('shopping:title')}
        header={<ShoppingHeader summary={screen.list?.summary} />}
        secondary={
          <HeaderButton
            ref={importButton}
            icon={<ImportIcon size={18} />}
            onClick={(event) => openApply(event.currentTarget)}
          >
            {t('shopping:import.button')}
          </HeaderButton>
        }
        primary={{
          label: t('shopping:addItems'),
          icon: <PlusIcon size={20} />,
          onClick: (event) => openSheet(event.currentTarget),
          buttonRef: addButton,
        }}
      >
        <RowHintNote hint={hint} />
        <Stack spacing={2.5}>
          {screen.error ? <Alert>{screen.error}</Alert> : null}
          {rowToggleErrors.message ? (
            <Alert>{rowToggleErrors.message}</Alert>
          ) : null}
          {screen.isLoading ? <Spinner label={t('common:loading')} /> : null}
          {!screen.list && !screen.isLoading ? (
            <Button onClick={screen.retry}>{t('common:retry')}</Button>
          ) : null}
          {screen.list ? (
            <>
              <FinishShoppingRow
                checked={screen.list.summary.checked}
                onFinish={() => setReviewing(true)}
              />
              {screen.list.groups.length === 0 ? (
                <Box ref={empty} tabIndex={-1} sx={{ outline: 'none' }}>
                  <EmptyListStart
                    templateCount={templates.data?.length ?? 0}
                    onAddItems={(event) => openSheet(event.currentTarget)}
                    onImport={(event) => openApply(event.currentTarget)}
                  />
                </Box>
              ) : (
                <ShoppingGroups
                  groups={screen.list.groups}
                  onToggle={screen.toggle}
                  onSetAmount={screen.setAmount}
                  onRemove={screen.remove}
                  hint={hint}
                />
              )}
              {screen.list.groups.length > 0 ? (
                <SaveListRow
                  count={itemCount(screen.list.summary)}
                  onClick={() => setSaveOpen(true)}
                />
              ) : null}
            </>
          ) : null}
        </Stack>
        <AddSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onExited={() => refocusIfOpenerGone(addButton)}
          adding={screen.adding}
          onAdd={screen.add}
          addError={screen.addError}
          suggestions={screen.suggestions}
        />
        <ApplyTemplatesSheet
          open={applyOpen}
          onClose={() => setApplyOpen(false)}
          onExited={() => refocusIfOpenerGone(importButton)}
        />
        <SaveTemplateSheet open={saveOpen} onClose={() => setSaveOpen(false)} />
      </Screen>
    </RowToggleErrorProvider>
  );
}
