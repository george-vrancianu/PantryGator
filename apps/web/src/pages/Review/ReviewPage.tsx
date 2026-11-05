import {
  Alert,
  Box,
  Button,
  Stack,
  Typography,
  useBreakpointUp,
} from '@pocket-pantry/ui';
import { useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { AppScreenHeader } from '../../components/AppScreenHeader';
import { MatchDialog } from '../../components/MatchDialog';
import { ReviewActionBar } from '../../components/ReviewActionBar';
import { ReviewCounters } from './components/ReviewCounters';
import { ReviewTable } from './components/ReviewTable';
import {
  ReviewCounterChips,
  ReviewTabletFooter,
} from './components/ReviewTabletChrome';
import { TabletReviewTable } from './components/TabletReviewTable';
import { useReviewScreen } from './hooks/useReviewScreen';

/** What a host's frame wraps around the line editor. */
export type ReviewFrameProps = {
  subtitle: string;
  /** How many lines the Scan read: said once, when the Review opens. */
  spotted: number;
  /** Lines still to check, live. */
  check: number;
  /** Lines the save will write. */
  saveCount: number;
  saving: boolean;
  canSave: boolean;
  onSave: () => void;
  children: ReactNode;
};

/**
 * What the host (the Intro's Setup Review) decides for the line editor: what happens once the card is
 * saved, where Retake goes, and the frame and banner wrapping it. Without settings the editor is the app's:
 * it lands on the Pantry or Shopping List and uses the app header.
 *
 * Unlike `ReviewOverviewSettings` (all optional, with app defaults), every part is required: passing
 * settings at all switches the editor to the host's layout, and a half-hosted editor has no sensible default.
 */
export type ReviewEditorSettings = {
  /** The card was saved with this many lines; replaces the app's landing. */
  onSaved: (saved: number) => void;
  /** Retake: also the action offered when the Scan read nothing. */
  onRetake: () => void;
  /** The phone layout wrapped in the host's frame, top row, banner and footer. */
  renderFrame: (props: ReviewFrameProps) => ReactNode;
};

/**
 * The Review screen: where a Member confirms, edits, or discards Scan results
 * before anything is saved. Every Scan Mode lands here with the same proposed
 * lines (see `lib/review.ts`). Lines to check sort to the top, already open;
 * confident ones are single rows. Below 900 px it is the phone layout; from
 * 900 px a wide table with the same state, handlers and groups.
 */
export function ReviewPage({
  settings,
}: { settings?: ReviewEditorSettings } = {}) {
  const { t } = useTranslation('review');
  const screen = useReviewScreen(settings);
  const wide = useBreakpointUp('md');
  // Callback ref: the result heading mounts with the tick-failure screen, so focus it then.
  const focusHeading = useCallback(
    (heading: HTMLHeadingElement | null) => heading?.focus(),
    [],
  );

  if (screen.tickFailures) {
    const { missing, changed, other } = screen.tickFailures;
    return (
      <>
        <AppScreenHeader title={t('saved.title')} titleRef={focusHeading} />
        <Stack spacing={2}>
          <Alert severity="warning">
            <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2 }}>
              {missing > 0 ? (
                <li>{t('tick.missing', { count: missing })}</li>
              ) : null}
              {changed > 0 ? (
                <li>{t('tick.changed', { count: changed })}</li>
              ) : null}
              {other > 0 ? <li>{t('tick.failed', { count: other })}</li> : null}
            </Stack>
          </Alert>
          <Button onClick={screen.toPantry}>{t('saved.toPantry')}</Button>
        </Stack>
      </>
    );
  }

  if (!screen.hadDraft) return <Navigate to="/scan/review" replace />;

  const { counts, groups } = screen;
  const read = counts.save + counts.excluded;
  const subtitle = t('subtitle.lines', {
    count: read,
    mode: t(`subtitle.mode.${screen.mode ?? 'product'}`),
  });
  const saveLabel = screen.saving
    ? t('pantry:form.saving')
    : t('save', { count: counts.save });

  const notices = (
    <>
      {screen.overLimit > 0 ? (
        <Alert severity="warning">
          {t('tooMany', {
            max: screen.maxItems,
            over: screen.overLimit,
          })}
        </Alert>
      ) : null}
      {screen.error ? <Alert>{screen.error}</Alert> : null}
    </>
  );

  // The phone layout's editor body: the Setup Review shows the same one in the Intro's frame.
  const editor = (
    <>
      <ReviewTable
        state={screen.state}
        groups={groups}
        parents={screen.parents}
        sheetKey={screen.sheetKey}
        sheetOpen={screen.sheetOpen}
        onOpenSheet={screen.openSheet}
        onCloseSheet={screen.closeSheet}
        sheetInitialFocus={screen.sheetInitialFocus}
        onSheetEntered={screen.sheetEntered}
        onSheetExited={screen.sheetExited}
        onChange={screen.change}
        onPickMatch={screen.pickMatch}
        onRemove={screen.remove}
        onConfirm={screen.confirm}
        onRestore={screen.restore}
        onToggleSureGroup={screen.toggleSureGroup}
        blocked={screen.blocked}
        mode={screen.mode}
      />
      <Stack spacing={2} sx={{ mt: 2 }}>
        {notices}
      </Stack>
    </>
  );

  if (settings) {
    return settings.renderFrame({
      subtitle,
      spotted: screen.included.length,
      check: counts.check,
      saveCount: counts.save,
      saving: screen.saving,
      canSave: screen.canSave,
      onSave: screen.save,
      children:
        read === 0 ? (
          <Stack spacing={2}>
            <Typography color="text.secondary">{t('empty')}</Typography>
            <Button onClick={settings.onRetake}>{t('overview.retake')}</Button>
          </Stack>
        ) : (
          editor
        ),
    });
  }

  if (wide) {
    return (
      <>
        <AppScreenHeader
          title={t('title')}
          subtitle={subtitle}
          trailing={read === 0 ? null : <ReviewCounterChips {...counts} />}
        />
        {read === 0 ? (
          <Stack spacing={2}>
            <Typography color="text.secondary">{t('empty')}</Typography>
            <Button onClick={screen.discard}>{t('backToScan')}</Button>
          </Stack>
        ) : (
          <>
            <TabletReviewTable
              state={screen.state}
              groups={groups}
              parents={screen.parents}
              mode={screen.mode}
              blocked={screen.blocked}
              onOpen={screen.open}
              onToggle={(key) => screen.toggle(key, 'quantity')}
              onChange={screen.change}
              onSwapMatch={screen.openSwap}
              onRemove={screen.remove}
              onConfirm={screen.confirm}
              onRestore={screen.restore}
              onToggleSureGroup={screen.toggleSureGroup}
            />
            <Stack spacing={2} sx={{ mt: 2 }}>
              {notices}
            </Stack>
            <MatchDialog
              open={screen.swapOpen}
              name={screen.swapName}
              defaultQuery={screen.swapQuery}
              newIngredientAllergenIds={screen.swapAllergenIds}
              onSelect={screen.changeMatch}
              onClose={screen.closeSwap}
            />
            <ReviewTabletFooter
              saveLabel={saveLabel}
              canSave={screen.canSave}
              onSave={screen.save}
              onDiscard={screen.discard}
            />
          </>
        )}
      </>
    );
  }

  return (
    <>
      <AppScreenHeader title={t('title')} subtitle={subtitle} />
      {read === 0 ? (
        <Stack spacing={2}>
          <Typography color="text.secondary">{t('empty')}</Typography>
          <Button onClick={screen.discard}>{t('backToScan')}</Button>
        </Stack>
      ) : (
        // Room under the last row for the fixed action bar.
        <Box sx={{ pb: '100px' }}>
          <ReviewCounters {...counts} />
          {editor}
          <ReviewActionBar
            saveLabel={saveLabel}
            canSave={screen.canSave}
            onSave={screen.save}
            onDiscard={screen.discard}
          />
        </Box>
      )}
    </>
  );
}
