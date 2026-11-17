import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useToast } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { voiceToast } from './voicePlacement';
import { haptic } from './haptic';
import { QUICK_TAP_MS, type VoiceDefaultTarget } from './voice';
import { voiceNote, useVoiceNoteState } from './voiceNote';
import { useMicPermission } from './useMicPermission';
import { micExplained } from './micExplained';
import { usePreferredSpokenLanguage } from './usePreferredSpokenLanguage';

/**
 * Hold-to-talk Voice Note: `press` starts recording, `release` stops and sends,
 * `cancel` (sliding off, Escape) throws the recording away, and 60 seconds stops and
 * sends by itself. A recording that fails to send stays in memory for `retry`
 * until the page reloads.
 */
export function useVoiceNote(defaultTarget: VoiceDefaultTarget) {
  const { t } = useTranslation(['errors', 'voice']);
  const toast = useToast();
  const { spokenLanguage, spokenLanguageToSend } = usePreferredSpokenLanguage();
  // The Voice Note itself lives in the Voice Note module, so Review and the button on any page see it.
  const { phase, inbox } = useVoiceNoteState();
  const failedCount = inbox.failed;
  const recording = phase === 'recording';
  const sending = phase === 'reading';
  // The module renders again when the Voice Cap lifts.
  const capped = voiceNote.isCapReached();
  // The pointer is down and the stream is not live yet ("Starting…").
  const [pressing, setPressing] = useState(false);
  // A tip above the button: how a press works, or why this one did nothing.
  const [tip, setTip] = useState<'hold' | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pressedAt = useRef(0);
  // Let go after 0.3 s but before the stream was live: say how it works once it is known to be dropped.
  const tipOnArrival = useRef(false);

  const showTip = useCallback(() => {
    setTip('hold');
    clearTimeout(tipTimer.current);
    tipTimer.current = setTimeout(() => setTip(null), TIP_MS);
  }, []);

  // The pointer is still down: a release before the microphone is ready cancels the start.
  const held = useRef(false);
  // The permission is being read, before the module is asked to start.
  const asking = useRef(false);
  // The press was cancelled (not merely let go) while the permission was being read.
  const cancelled = useRef(false);
  const unmounted = useRef(false);
  const options = useRef({
    spokenLanguageToSend,
    defaultTarget,
    t,
    toast,
  });
  useLayoutEffect(() => {
    options.current = {
      spokenLanguageToSend,
      defaultTarget,
      t,
      toast,
    };
  });
  const say = (message: string) =>
    options.current.toast.show(message, voiceToast());

  const mic = useMicPermission({
    onGranted: () => {
      const { t } = options.current;
      say(`${t('voice:mic.on')} · ${t('voice:mic.onHint')}`);
    },
    onUnavailable: () => voiceNote.fail('unavailable'),
  });

  const { refresh, showBlocked, showIntro } = mic;

  const begin = () => {
    const { defaultTarget, spokenLanguageToSend } = options.current;
    return voiceNote.start({
      defaultTarget,
      spokenLanguage: spokenLanguageToSend,
    });
  };

  // The module stops a recording at 60 seconds by itself: the pointer is still down, but the press is over.
  // The recording ends and the audio is finalised (idle) while the pointer is still down: that is the limit, so it buzzes once and
  // ends the press. A failure mid-recording goes to `failed` instead and does not buzz.
  const wasRecording = useRef(false);
  const failedBefore = useRef(failedCount);
  useEffect(() => {
    // A failure joins the Voice Inbox in the same step that ends the recording; the limit does not.
    const failedNow = failedCount > failedBefore.current;
    failedBefore.current = failedCount;
    if (wasRecording.current && phase === 'idle' && held.current) {
      held.current = false;
      if (!failedNow) haptic(14);
    }
    wasRecording.current = recording;
  }, [recording, phase, failedCount]);

  /** Ends the recording and sends it; a recording too short to read gets the tip. */
  const finish = useCallback(async () => {
    if ((await voiceNote.stop()) === 'tooShort') showTip();
  }, [showTip]);

  /** Throw the recording away without a word (a tap too quick to be a note). */
  const discardRecording = useCallback(() => {
    held.current = false;
    tipOnArrival.current = false;
    setPressing(false);
    voiceNote.cancel({ quiet: true });
  }, []);

  /** The Member cancelled (slid off, Escape, a system gesture): discard it and say so. */
  const cancel = useCallback(() => {
    // Pressed counts even before the module was asked to start, and even after letting go.
    const waiting = asking.current;
    cancelled.current = true;
    held.current = false;
    tipOnArrival.current = false;
    setPressing(false);
    voiceNote.cancel({ beforeStart: waiting });
  }, []);

  const press = useCallback(async () => {
    if (asking.current || held.current) return;
    // Nothing starts while a Review is open or the Voice Inbox is full; a failed note never blocks.
    const blocker = voiceNote.startBlocker();
    // A note is already under way (still starting, recording or being finalised): the press changes nothing.
    if (blocker === 'active') return;
    // A Review or answer sheet is open: the mic is not offered.
    if (blocker === 'review') return;
    // The Voice Cap is used up, or the Voice Inbox is full: the module shows why.
    if (blocker === 'capped' || blocker === 'full') {
      void begin();
      return;
    }
    held.current = true;
    cancelled.current = false;
    pressedAt.current = Date.now();
    tipOnArrival.current = false;
    clearTimeout(tipTimer.current);
    setTip(null);
    asking.current = true;
    // The microphone sheets stand in for the hold until it is allowed; nothing records and the press resets.
    const permission = await refresh();
    // Cancelled (Escape, a system gesture) or the page left while asking: nothing more happens.
    if (cancelled.current || unmounted.current) {
      asking.current = false;
      return;
    }
    // iOS Safari often forgets a grant between sessions and reports `prompt` again: a device that has
    // allowed the microphone before goes straight to the hold, and the browser asks as it does.
    const needsSheet =
      permission === 'denied' || (permission === 'prompt' && !micExplained());
    if (needsSheet) {
      held.current = false;
      asking.current = false;
      if (permission === 'denied') showBlocked();
      else showIntro();
      return;
    }
    // Let go while the permission was being read: no recording to start.
    if (!held.current) {
      asking.current = false;
      if (tipOnArrival.current) {
        tipOnArrival.current = false;
        showTip();
      }
      return;
    }
    setPressing(true);
    haptic(10);
    asking.current = false;
    const outcome = await begin();
    setPressing(false);
    if (outcome === 'started') return;
    held.current = false;
    if (outcome === 'cancelled' && tipOnArrival.current) {
      tipOnArrival.current = false;
      showTip();
    }
    // A browser with no Permissions API only says "blocked" when a hold meets the refusal.
    if (outcome === 'denied') showBlocked();
  }, [refresh, showBlocked, showIntro, showTip]);

  const release = useCallback(() => {
    if (!held.current) return;
    if (Date.now() - pressedAt.current < QUICK_TAP_MS) {
      // Too quick to be a Voice Note: send nothing and say how it works.
      discardRecording();
      showTip();
      return;
    }
    held.current = false;
    // The stream may not be live yet: nothing to send, so it ends with the tip once it is dropped.
    tipOnArrival.current = true;
    haptic(14);
    void finish();
  }, [finish, discardRecording, showTip]);

  // Leaving the page drops a recording in progress; a read in flight carries on.
  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      clearTimeout(tipTimer.current);
      // A stream that arrives after this page is gone must not start a note.
      held.current = false;
      tipOnArrival.current = false;
      voiceNote.cancel({ quiet: true });
    };
  }, []);

  return {
    spokenLanguage,
    recording,
    pressing,
    tip,
    sending,
    capped,
    mic,
    press,
    release,
    cancel,
  };
}

const TIP_MS = 1800;
