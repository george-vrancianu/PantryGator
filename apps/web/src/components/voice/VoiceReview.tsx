import {
  Alert,
  Box,
  Gator,
  Sheet,
  Typography,
  ShoppingIcon,
  PantryIcon,
  SearchIcon,
  AlertIcon,
  CloseIcon,
  IconButton,
  radius,
  useToast,
  shadow,
  palette,
} from '@pocket-pantry/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { AddToShoppingListButton } from './AddToShoppingListButton';
import { applyToast } from './applyResult';
import { focusVoiceButton } from '../../lib/voiceFocus';
import { voiceToast } from '../../lib/voicePlacement';
import { HeardCard, MergedHeardCard } from './HeardCard';
import { ListPicker, RowListPicker } from './ListPicker';
import { ReviewFooter } from './ReviewFooter';
import { VoiceActionRow } from './VoiceActionRow';
import {
  blockOf,
  displayName,
  groupsOf,
  hasAmount,
  isActionable,
  isChange,
  needsList,
} from './reviewModel';
import { translateApiError } from '../../i18n/translateApiError';
import { usePreferredSpokenLanguage } from '../../lib/usePreferredSpokenLanguage';
import { parseAmountText } from '../../lib/pantry';
import {
  catalogChangeQueryKeys,
  shoppingListChangeQueryKeys,
} from '../../lib/queryKeys';
import {
  applyVoiceActions,
  type VoiceApplyResult,
  type VoiceList,
  type VoiceReviewAction,
} from '../../lib/voice';
import { flashRows } from '../../lib/rowFlash';
import { useGatorAlt } from '../../lib/useGatorAlt';
import { useVoiceNoteState, voiceNote } from '../../lib/voiceNote';
import { PantryAnswerRow } from './PantryAnswerRow';

/** How long the Apply result stays: long enough to read, no Undo (ADR 0017). */
const APPLY_TOAST_MS = 5200;

/** The list every action with a pick is on, or '' when they are split or undecided. */
const allOn = (actions: VoiceReviewAction[]): VoiceList | '' => {
  const lists = new Set(actions.filter((a) => a.byList).map((a) => a.target));
  const [only] = lists;
  return lists.size === 1 && only ? only : '';
};

const quantityText = (action: VoiceReviewAction) =>
  action.quantity === null ? '' : String(action.quantity);

/** How the Review looks: the app's, or the Intro's (happy Gator, "Here's what I heard", "Do these N", transcript open). */
export type ReviewLook = 'app' | 'setup';

/** What a host's Review is set to, apart from its look: whether Apply toasts, and who hears about the result. */
export type ReviewSettings = {
  look: ReviewLook;
  /** Whether Apply shows its toast and flashes the rows. */
  toastOnApply: boolean;
  /** Told what was really applied; it does not change the look or the toast. */
  afterApply?: AfterApply;
};

const APP_REVIEW: ReviewSettings = { look: 'app', toastOnApply: true };

/** What a host does once an Apply succeeds, given what was really applied (a host's `afterApply` setting). */
export type AfterApply = (
  /** Apply succeeded (some actions may have been skipped). */
  result: VoiceApplyResult,
  /** What was sent, as edited. */
  actions: VoiceReviewAction[],
) => void;

/**
 * Review for a Voice Note, over the current page: the Voice Actions grouped by list, each edited in place, and
 * Discard and Apply. Mounted while there is a Voice Note to review, so each one starts with a clean sheet.
 */
export function VoiceReview({
  review = APP_REVIEW,
}: { review?: ReviewSettings } = {}) {
  const { phase } = useVoiceNoteState();
  return phase === 'review' || phase === 'applying' ? (
    <ReviewSheet review={review} />
  ) : null;
}

function ReviewSheet({ review }: { review: ReviewSettings }) {
  const { afterApply, toastOnApply } = review;
  const setupLook = review.look === 'setup';
  const { t, i18n } = useTranslation(['voice', 'common', 'onboarding']);
  const gatorAlt = useGatorAlt();
  const { proposal, defaultTarget, phase, recording, merged } =
    useVoiceNoteState();
  const { spokenLanguage } = usePreferredSpokenLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const body = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);

  const actions = proposal?.actions ?? [];
  // The Pantry Questions' answers: a read-only card above the rows; Apply never sends them.
  const answers = proposal?.answers ?? [];
  const transcript = proposal?.transcript ?? '';
  // Set once "Add N to the Shopping List" ran: a later Discard no longer changes nothing.
  const [addedFromAnswers, setAddedFromAnswers] = useState(false);
  // What the server heard of each expiry, to tell it from one picked here.
  const [spoken] = useState(
    () => new Map(actions.map((a) => [a.id, a.expiresOn])),
  );
  const language = recording?.spokenLanguage ?? spokenLanguage;

  const groups = groupsOf(actions, defaultTarget);
  const changes = actions.filter(isChange);
  const applicable = actions.filter(isActionable);
  const undecided = actions.filter(needsList);
  const unclear = actions.filter((a) => !isChange(a) && !needsList(a));
  const blocking = [...undecided, ...groups.flatMap((g) => g.actions)].find(
    (a) => blockOf(a),
  );
  const withPicker = actions.filter((a) => a.byList).length;

  const [openId, setOpenId] = useState<string | null>(
    blocking && blockOf(blocking) !== 'list' ? blocking.id : null,
  );
  const [confirming, setConfirming] = useState(false);
  const [keptReviewing, setKeptReviewing] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  // What the Member typed in each amount field; the store only takes valid amounts.
  const [typed, setTyped] = useState<Record<string, string>>({});
  const textOf = (a: VoiceReviewAction) => typed[a.id] ?? quantityText(a);
  const invalid = new Set(
    applicable
      .filter((a) => hasAmount(a) && !parseAmountText(textOf(a)).valid)
      .map((a) => a.id),
  );

  const applying = phase === 'applying';
  const refreshLists = () =>
    void Promise.all(
      [
        ['shopping-list'],
        ['pantry'],
        ...shoppingListChangeQueryKeys,
        ...catalogChangeQueryKeys.filter(
          (key) => key[0] === 'pantry' || key[0] === 'recipes',
        ),
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
  const apply = useMutation({
    onMutate: () => voiceNote.applying(),
    mutationFn: () => applyVoiceActions(applicable),
    onError: () => voiceNote.applyFailed(),
    onSuccess: (result: VoiceApplyResult) => {
      if (!toastOnApply) {
        voiceNote.applied();
        refreshLists();
        afterApply?.(result, applicable);
        return;
      }
      const { message, detail } = applyToast(
        result,
        actions,
        defaultTarget,
        t,
        i18n.language,
      );
      voiceNote.applied();
      // Only this page's rows: the other list's rows are not on screen to flash.
      flashRows(
        result.applied.flatMap((entry) =>
          entry.list !== defaultTarget
            ? []
            : (entry.rowIds ?? (entry.rowId ? [entry.rowId] : [])),
        ),
      );
      toast.show(message, {
        ...voiceToast(),
        detail,
        duration: APPLY_TOAST_MS,
      });
      focusVoiceButton();
      refreshLists();
      afterApply?.(result, applicable);
    },
  });

  const discard = () => {
    voiceNote.discard();
    // After "Add N to the Shopping List" something was changed, so the hint would be false.
    toast.show(
      merged
        ? t('voice:review.footer.discardedAll')
        : addedFromAnswers
          ? t('voice:review.footer.discarded')
          : `${t('voice:review.footer.discarded')} · ${t('voice:review.footer.discardedHint')}`,
      voiceToast(),
    );
    focusVoiceButton();
  };

  // Where focus lands as the sheet opens: the control of the row that holds Apply back, else the title.
  // A text field there stays unfocused on a phone (ADR 0039); the Sheet decides.
  const pickerOf = (id: string) =>
    body.current?.querySelector<HTMLElement>(`[data-voice-picker="${id}"]`) ??
    null;
  const pickerControl = (picker: HTMLElement) =>
    // A picker that cannot take focus itself (the Location toggle group) hands it to its pressed button, else its first control.
    picker.hasAttribute('tabindex') || picker.matches('button, input')
      ? picker
      : (picker.querySelector<HTMLElement>('[aria-pressed="true"]') ??
        picker.querySelector<HTMLElement>('button, input') ??
        picker);
  const blockingId = blocking?.id;
  const openingFocus = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        const picker = blockingId ? pickerOf(blockingId) : null;
        return picker ? pickerControl(picker) : title.current;
      },
    }),
    // pickerOf / pickerControl only read refs and the DOM; the blocking row is the one input.
    [blockingId],
  );
  // Focus after the Member's tap (the row that holds Apply back): scrolled into view, then focused.
  const focusPicker = (id: string) => {
    const picker = pickerOf(id);
    if (!picker) return false;
    picker.scrollIntoView?.({ block: 'center' });
    pickerControl(picker).focus();
    return true;
  };
  // Declining the Discard question hands focus back to the Discard button.
  useEffect(() => {
    if (!keptReviewing || confirming) return;
    document.querySelector<HTMLElement>('[data-voice-discard]')?.focus();
    // oxlint-disable-next-line react/set-state-in-effect -- one-shot focus request: focus is moved, then the request is cleared
    setKeptReviewing(false);
  }, [keptReviewing, confirming]);
  // A failed Apply puts its Alert at the top of the body; bring it into view.
  useEffect(() => {
    if (!apply.isError) return;
    body.current
      ?.querySelector('[role="alert"]')
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [apply.isError, apply.failureCount]);
  useEffect(() => {
    if (focusId === null) return;
    // oxlint-disable-next-line react/set-state-in-effect -- one-shot focus request: cleared once the picker is focused
    if (focusPicker(focusId)) setFocusId(null);
  }, [focusId, openId]);

  const heading = setupLook
    ? t('onboarding:sayIt.heard.title')
    : merged
      ? t('voice:review.titleAll')
      : t('voice:review.title');
  const count = changes.length + undecided.length;
  const both = new Set(changes.map((a) => a.target)).size > 1;
  const subline =
    count === 0
      ? t('voice:review.sublineNothing')
      : t(both ? 'voice:review.sublineBoth' : 'voice:review.subline', {
          count,
        });

  /** What was typed belonged to the other list's resolution; and a Pantry removal that needs a Batch opens on its picker. */
  const settlePicks = (picked: VoiceReviewAction[], list: VoiceList) => {
    const ids = new Set(picked.map((a) => a.id));
    setTyped((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id]) => !ids.has(id)),
      ),
    );
    const needy = picked.find((a) => a.byList?.[list].status === 'needsBatch');
    if (needy) {
      setOpenId(needy.id);
      setFocusId(needy.id);
    }
  };
  const pick = (action: VoiceReviewAction, list: VoiceList) => {
    voiceNote.pickList(action.id, list);
    settlePicks([action], list);
  };
  const pickAll = (list: VoiceList) => {
    voiceNote.pickAllLists(list);
    settlePicks(
      actions.filter((a) => a.byList),
      list,
    );
  };

  const renderRow = (action: VoiceReviewAction) => (
    <VoiceActionRow
      key={action.id}
      action={action}
      open={openId === action.id}
      typed={textOf(action)}
      invalid={invalid.has(action.id)}
      spokenExpiry={spoken.get(action.id) ?? null}
      onPick={(list) => pick(action, list)}
      onToggle={() => setOpenId((id) => (id === action.id ? null : action.id))}
      onTyped={(text) => {
        setTyped((current) => ({ ...current, [action.id]: text }));
        const parsed = parseAmountText(text);
        if (parsed.valid) voiceNote.edit(action.id, { quantity: parsed.value });
      }}
    />
  );

  return (
    <Sheet
      open
      onClose={() => undefined}
      dismissable={false}
      onEscape={() => {
        if (!applying) setConfirming(true);
      }}
      initialFocus={openingFocus}
      onEntered={() => {
        // A text field that blocks Confirm is shown, not focused, on a phone.
        const picker = blocking ? pickerOf(blocking.id) : null;
        picker?.scrollIntoView?.({ block: 'center' });
      }}
      label={heading}
      header={
        <Box
          sx={{
            px: 2.5,
            pt: 1.5,
            pb: 1.5,
            ...(setupLook
              ? { display: 'flex', alignItems: 'center', gap: '12px' }
              : {}),
          }}
        >
          {setupLook ? (
            <Gator mood="happy" size={72} alt={gatorAlt('happy')} />
          ) : null}
          <Box>
            <Typography
              component="h2"
              variant="h2"
              tabIndex={-1}
              ref={title}
              sx={{ outline: 'none' }}
            >
              {heading}
            </Typography>
            {setupLook ? null : (
              <Typography
                sx={{ fontSize: 13, color: palette('text-secondary') }}
              >
                {subline}
              </Typography>
            )}
          </Box>
        </Box>
      }
      footer={
        <ReviewFooter
          count={applicable.length}
          blocked={blocking ? blockOf(blocking) : null}
          invalid={invalid.size > 0}
          applying={applying}
          applyLabel={
            setupLook
              ? t('onboarding:sayIt.heard.doThese', {
                  count: applicable.length,
                })
              : undefined
          }
          confirming={confirming}
          merged={merged !== undefined}
          onAsk={() => setConfirming(true)}
          onKeep={() => {
            setConfirming(false);
            setKeptReviewing(true);
          }}
          onDiscard={discard}
          onApply={() => apply.mutate()}
          onBlockedApply={() => {
            if (!blocking) return;
            setOpenId(blocking.id);
            setFocusId(blocking.id);
          }}
        />
      }
    >
      <Box
        ref={body}
        inert={applying}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          px: 2,
          pb: 2,
        }}
      >
        {apply.isError ? (
          <Alert>{translateApiError(t, apply.error)}</Alert>
        ) : null}

        {merged ? (
          <MergedHeardCard notes={merged} />
        ) : (
          <HeardCard
            transcript={transcript}
            language={language}
            durationMs={recording?.durationMs}
            defaultOpen={
              setupLook || actions.every((a) => a.status === 'notUnderstood')
            }
          />
        )}

        {answers.length > 0 ? (
          <Group
            label={t('voice:answers.title')}
            count={answers.length}
            tag={null}
            after={
              <AddToShoppingListButton
                answers={answers}
                onAdded={() => {
                  setAddedFromAnswers(true);
                  title.current?.focus();
                }}
              />
            }
          >
            {answers.map((answer) => (
              <PantryAnswerRow key={answer.id} answer={answer} />
            ))}
          </Group>
        ) : null}

        {withPicker > 1 ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              px: '4px',
              fontSize: 13,
              fontWeight: 600,
              color: palette('text-secondary'),
            }}
          >
            <span aria-hidden>{t('voice:review.putAll.label')}</span>
            <Box sx={{ flex: 1 }}>
              <ListPicker
                label={t('voice:review.putAll.name')}
                value={allOn(actions)}
                onChange={pickAll}
              />
            </Box>
          </Box>
        ) : null}

        {undecided.length > 0 ? (
          <Group
            label={t('voice:review.pickList.group')}
            count={undecided.length}
            tag={null}
          >
            {undecided.map(renderRow)}
          </Group>
        ) : null}

        {groups.map((group) => (
          <Group
            key={group.list}
            label={t(`voice:review.lists.${group.list}`)}
            icon={
              group.list === 'shopping' ? (
                <ShoppingIcon size={15} />
              ) : (
                <PantryIcon size={15} />
              )
            }
            count={group.actions.length}
            tag={group.named ? t('voice:review.namedIt') : null}
          >
            {group.actions.map(renderRow)}
          </Group>
        ))}

        {setupLook ? (
          <Typography
            sx={{ px: '4px', fontSize: 13, color: palette('text-secondary') }}
          >
            {t('onboarding:sayIt.heard.nothingSaved')}
          </Typography>
        ) : null}

        {unclear.length > 0 ? (
          <Group
            label={t('voice:review.couldnt')}
            count={unclear.length}
            tag={null}
          >
            {unclear.map((action) => (
              <CouldntRow
                key={action.id}
                action={action}
                onPick={(list) => pick(action, list)}
              />
            ))}
          </Group>
        ) : null}
      </Box>
    </Sheet>
  );
}

function Group({
  label,
  icon,
  count,
  tag,
  after,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  count: number;
  tag: string | null;
  /** Below the list, inside the region. */
  after?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Box component="section" aria-label={label}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          px: '4px',
          pb: '6px',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '.07em',
          textTransform: 'uppercase',
          color: palette('text-secondary'),
        }}
      >
        {icon}
        <span>{label}</span>
        {tag ? (
          <Box
            component="span"
            sx={{
              ml: '4px',
              px: '8px',
              py: '1px',
              borderRadius: '999px',
              backgroundColor: palette('pp-chip'),
              fontSize: 11.5,
              fontWeight: 600,
              letterSpacing: 0,
              textTransform: 'none',
            }}
          >
            {tag}
          </Box>
        ) : null}
        <Box component="span" sx={{ ml: 'auto' }}>
          {count}
        </Box>
      </Box>
      <Box
        component="ul"
        sx={{
          m: 0,
          p: 0,
          listStyle: 'none',
          backgroundColor: palette('background-paper'),
          border: `1px solid ${palette('pp-line')}`,
          borderRadius: radius.card,
          boxShadow: shadow.card,
          overflow: 'hidden',
        }}
      >
        {children}
      </Box>
      {after}
    </Box>
  );
}

/** A Voice Action the server could not act on: what was said and why, with no editor. */
function CouldntRow({
  action,
  onPick,
}: {
  action: VoiceReviewAction;
  onPick: (list: VoiceList) => void;
}) {
  const { t } = useTranslation('voice');
  const notFound = action.status === 'notFound';
  const name = displayName(action);
  const reason = notFound
    ? t(
        action.target === 'pantry'
          ? 'review.reason.notFoundPantry'
          : 'review.reason.notFoundShopping',
        { name },
      )
    : t('review.reason.notUnderstood');
  return (
    <Box
      component="li"
      sx={{
        position: 'relative',
        display: 'flex',
        gap: '11px',
        py: '10px',
        pl: '12px',
        pr: '52px',
        '& + &': { borderTop: `1px solid ${palette('divider')}` },
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 34,
          height: 34,
          flexShrink: 0,
          borderRadius: radius.control,
          display: 'grid',
          placeItems: 'center',
          border: `1.5px dashed ${palette('pp-line')}`,
          color: palette('text-secondary'),
        }}
      >
        {notFound ? <SearchIcon size={18} /> : <AlertIcon size={18} />}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ fontSize: 15 }}>
          <Box component="span" sx={{ color: palette('text-secondary') }}>
            {t(notFound ? 'review.notFound' : 'review.notUnderstood')}{' '}
          </Box>
          <Box component="span" sx={{ fontWeight: 600 }}>
            “{action.text}”
          </Box>
        </Box>
        <Box sx={{ fontSize: 12.5, color: palette('text-secondary') }}>
          {reason}
        </Box>
        {action.byList ? (
          <Box sx={{ pt: '8px' }}>
            <RowListPicker action={action} onPick={onPick} />
          </Box>
        ) : null}
      </Box>
      <Box sx={{ position: 'absolute', right: 8, top: 12 }}>
        <IconButton
          label={t('review.hide', { text: action.text })}
          tone="plain"
          size={34}
          onClick={() => voiceNote.remove(action.id)}
        >
          <CloseIcon size={17} />
        </IconButton>
      </Box>
    </Box>
  );
}
