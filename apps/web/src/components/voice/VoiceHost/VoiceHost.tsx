import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';

const HostContext = createContext<HTMLElement | null>(null);
const MicSlotContext = createContext<{
  slot: HTMLElement | null;
  setSlot: (element: HTMLElement | null) => void;
  /** A Voice Note is being held: the Dock rises above the scrim. */
  recording: boolean;
  setRecording: (recording: boolean) => void;
  /** The Dock's mic half is lit to show where voice input lives ("Say it"); nothing else changes. */
  micTeach: boolean;
  setMicTeach: (teach: boolean) => void;
}>({
  slot: null,
  setSlot: () => undefined,
  recording: false,
  setRecording: () => undefined,
  micTeach: false,
  setMicTeach: () => undefined,
});

const SetHostContext = createContext<(element: HTMLElement | null) => void>(
  () => undefined,
);

/** Where the Voice Note button is placed: the slot if the app has one, else the body. */
export function useVoiceHost() {
  return useContext(HostContext) ?? document.body;
}

/** The Dock's mic half, where the hold-to-talk button is placed; null while the Dock has none. */
export function useDockMicSlot() {
  return useContext(MicSlotContext).slot;
}

/** Ref callback for the Dock's mic half: tells the Voice Note where its button goes. */
export function useRegisterDockMicSlot() {
  return useContext(MicSlotContext).setSlot;
}

/** Wrap the page and the Dock; the Voice Note controls land in the `VoiceHostSlot` inside it. */
export function VoiceHostProvider({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [recording, setRecording] = useState(false);
  const [micTeach, setMicTeach] = useState(false);
  // The teach is for the page it started on: leaving it (the camera, another tab) ends it, so it
  // cannot relight the mic when the Member comes back to a Dock page.
  const { pathname } = useLocation();
  const [teachPath, setTeachPath] = useState(pathname);
  if (teachPath !== pathname) {
    setTeachPath(pathname);
    setMicTeach(false);
  }
  const mic = useMemo(
    () => ({ slot, setSlot, recording, setRecording, micTeach, setMicTeach }),
    [slot, recording, micTeach],
  );
  return (
    <SetHostContext.Provider value={setHost}>
      <HostContext.Provider value={host}>
        <MicSlotContext.Provider value={mic}>
          {children}
        </MicSlotContext.Provider>
      </HostContext.Provider>
    </SetHostContext.Provider>
  );
}

/**
 * Put this in the DOM between the page and the Dock: the Voice Note's scrim and
 * notices are fixed on screen, but in the DOM they sit here, so Tab reaches them after the page
 * and before the Dock (whose mic half holds the button itself).
 */
export function VoiceHostSlot() {
  return <div ref={useContext(SetHostContext)} />;
}

/** True while a Voice Note is held; the Dock lifts above the scrim so the mic stays bright. */
export function useDockRaised() {
  return useContext(MicSlotContext).recording;
}

/** Tell the Dock whether a Voice Note is being held. */
export function useReportRecording() {
  return useContext(MicSlotContext).setRecording;
}

/** The non-blocking mic teach: whether it is on, and how to start and stop it. */
export function useMicTeach() {
  const { micTeach, setMicTeach } = useContext(MicSlotContext);
  return useMemo(
    () => ({
      teaching: micTeach,
      start: () => setMicTeach(true),
      stop: () => setMicTeach(false),
    }),
    [micTeach, setMicTeach],
  );
}
