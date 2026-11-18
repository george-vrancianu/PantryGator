import { screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import type { Recording } from '../lib/microphone';
import { voiceNote } from '../lib/voiceNote';
import { holdLongEnough, pressDown } from './voiceHold';

/*
 * The shared fake voice environment. Import this module BEFORE anything that reaches the
 * microphone module (the page, the Voice Note module): it registers the mock, and a module that
 * is already loaded keeps the real one.
 *
 * - Microphone: jsdom has no getUserMedia or MediaRecorder, so the microphone module is the seam.
 *   `mic.start` / `mic.permission` / `mic.request` are the mocks behind it.
 * - Wake lock: a fake `navigator.wakeLock`; `wake.request` / `wake.released` are its mocks.
 * - Voice Note: the default instance is swapped for a fresh one by `resetVoiceEnvironment`, so no
 *   page test inherits the last one's phase, Voice Cap or lock. The module has no reset of its own.
 * - Send-Voice-Note request: `stubVoiceFetch` wraps the stubbed API and returns what is sent; `holdReads()` keeps reads pending.
 *
 * Call `resetVoiceEnvironment()` in `beforeEach` to put all of it back to its defaults.
 *
 * A test that only needs the Gator bubble helpers imports `./voiceDom` (mock-free) instead; they
 * are re-exported here. This module throws if the real lib/voiceNote was already loaded when it
 * registered its mocks. Not detected: a real lib/microphone loaded first by another importer
 * (useMicPermission, or a direct import) without lib/voiceNote; keep this import first.
 */
export * from './voiceDom';

const fakes = vi.hoisted(() => ({
  MicrophoneError: class MicrophoneError extends Error {
    constructor(readonly reason: string) {
      super(reason);
    }
  },
  mic: { start: vi.fn(), permission: vi.fn(), request: vi.fn() },
  wake: { request: vi.fn(), released: vi.fn() },
  voice: { replace: () => {} },
}));

vi.mock('../lib/microphone', () => ({
  startRecording: fakes.mic.start,
  permissionState: fakes.mic.permission,
  requestPermission: fakes.mic.request,
  watchPermission: () => () => {},
  MicrophoneError: fakes.MicrophoneError,
}));

// The pages use the default Voice Note; behind it sits an instance this environment can renew.
vi.mock('../lib/voiceNote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/voiceNote')>();
  const { useSyncExternalStore } = await import('react');
  const { startRecording: startMicrophone } = await import('../lib/microphone');
  const { sendVoiceNote } = await import('../lib/voice');
  const { keepScreenAwake } = await import('../lib/wakeLock');
  // No wait before the network retry: a test never sits through a real delay.
  const create = () =>
    actual.createVoiceNote({
      send: sendVoiceNote,
      keepScreenAwake,
      startMicrophone,
      retryDelayMs: 0,
    });
  let current = create();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  let unsubscribe = current.subscribe(emit);
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  };
  const voiceNote = new Proxy(current, {
    get: (_, key) =>
      key === 'subscribe' ? subscribe : Reflect.get(current, key),
  });
  fakes.voice.replace = () => {
    // Settle what the last test left under way, then start over.
    current.clear();
    unsubscribe();
    current = create();
    unsubscribe = current.subscribe(emit);
    emit();
  };
  return {
    ...actual,
    voiceNote,
    useVoiceNoteState: () =>
      useSyncExternalStore(subscribe, voiceNote.getState, voiceNote.getState),
  };
});

// vi.mock does nothing to a module that is already loaded: a Voice Note module evaluated before this
// file keeps the real microphone. Probe it: starting must reach the mock, not the real thing.
// Relies on `start` calling the microphone before its first await; if that changes, this misreports.
// Only a real lib/voiceNote is caught, not a real lib/microphone loaded by another importer.
{
  const probe = voiceNote.start({ defaultTarget: 'shopping' });
  const reached = fakes.mic.start.mock.calls.length > 0;
  probe.catch(() => {});
  fakes.voice.replace();
  fakes.mic.start.mockReset();
  if (!reached) {
    throw new Error(
      'test/voice was imported after the real lib/voiceNote was already loaded, so its mocks cannot apply. Import test/voice first, or import the DOM helpers from test/voiceDom.',
    );
  }
}

/** The microphone module's error, as the page sees it (the page checks `instanceof`). */
export const MicrophoneError = fakes.MicrophoneError;

export const mic = fakes.mic;
export const wake = fakes.wake;

/** Defaults: a granted microphone that hands out `fakeSession()`s, a supported wake lock. */
export function resetVoiceEnvironment() {
  // First: dropping the Voice Note releases the wake lock, which the resets below then forget.
  fakes.voice.replace();
  mic.start.mockReset();
  mic.start.mockImplementation(() => Promise.resolve(fakeSession()));
  mic.permission.mockReset();
  mic.permission.mockResolvedValue('granted');
  mic.request.mockReset();
  mic.request.mockResolvedValue(undefined);
  wake.released.mockReset();
  wake.released.mockImplementation(() => Promise.resolve());
  wake.request.mockReset();
  wake.request.mockImplementation(() =>
    Promise.resolve({ release: wake.released }),
  );
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request: wake.request },
  });
}

/** Take the wake lock away, as on a browser without Screen Wake Lock. */
export function removeWakeLock() {
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: undefined,
  });
}

/** A Voice Note read held by `holdReads`: it stays pending until the test settles it. */
export type PendingRead = {
  /** The upload, as sent. */
  body: FormData;
  /** Answers the read; give `Response.json({ transcript, actions })` or the like. */
  resolve: (response: Response) => void;
  /** Fails the read, e.g. with `new TypeError('Failed to fetch')` for no signal. */
  reject: (error: unknown) => void;
};

/**
 * Route `fetch` through `fetchMock`, recording every Voice Note upload (a FormData body) and its abort signal.
 * `onRequest` sees every request first, e.g. to capture another body.
 *
 * After `holdReads()` the uploads no longer reach `fetchMock`: each one waits in `reads` until the
 * test calls its `resolve` or `reject` (an abort rejects it, as fetch does), so Voice Notes can
 * be stacked and settled in any order. `releaseReads()` goes back to answering at once.
 */
export function stubVoiceFetch(
  fetchMock: (input: RequestInfo | URL, init?: RequestInit) => unknown,
  onRequest?: (input: RequestInfo | URL, init?: RequestInit) => void,
) {
  const sent: FormData[] = [];
  const signals: AbortSignal[] = [];
  const reads: PendingRead[] = [];
  let holding = false;
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    onRequest?.(input, init);
    if (init?.body instanceof FormData) {
      const body = init.body;
      sent.push(body);
      if (init.signal) signals.push(init.signal);
      if (holding) {
        return new Promise<Response>((resolve, reject) => {
          const aborted = () =>
            reject(new DOMException('Aborted', 'AbortError'));
          if (init.signal?.aborted) return aborted();
          reads.push({ body, resolve, reject });
          init.signal?.addEventListener('abort', aborted, { once: true });
        });
      }
    }
    return fetchMock(input, init);
  });
  return {
    sent,
    signals,
    reads,
    holdReads: () => void (holding = true),
    releaseReads: () => void (holding = false),
  };
}

/** A three second Voice Note recording, as the microphone module hands it over. */
export const recording: Recording = {
  blob: new Blob(['audio-bytes'], { type: 'audio/webm' }),
  mimeType: 'audio/webm;codecs=opus',
  durationMs: 3000,
};

/** Records a Voice Note from the fake microphone and lets go, as another page would have: it is sent to be read. */
export async function recordAndSend(options: {
  spokenLanguage: 'en' | 'ro';
  defaultTarget: 'shopping' | 'pantry';
}) {
  await voiceNote.start(options);
  await voiceNote.stop();
}

/** A live microphone session that stops with `recording`. */
export function fakeSession() {
  return {
    stop: vi.fn(() => Promise.resolve(recording)),
    cancel: vi.fn(),
    level: vi.fn(() => 0),
  };
}

/** The mic half of the Dock's capsule: the one place a Voice Note is recorded from. */
export const talkButton = async () =>
  within(await screen.findByRole('navigation')).findByRole('button', {
    name: /hold to record a voice note/i,
  });

/** Press the voice button, wait for Listening and hold past a tap; the button is returned still held. */
export async function hold({
  init,
  prepare,
}: {
  init?: PointerEventInit;
  /** Runs before the press, e.g. to give the button a position (jsdom has no layout). */
  prepare?: (button: HTMLElement) => void;
} = {}) {
  const button = await talkButton();
  prepare?.(button);
  pressDown(button, init);
  await screen.findByText("Gator's listening");
  await holdLongEnough();
  return button;
}

/** A Catalog Ingredient as the Voice endpoints return it. */
export const voiceIngredient = (
  id: string,
  name: string,
  overrides: Record<string, unknown> = {},
) => ({
  owner: 'catalog',
  amountScale: 'medium',
  id,
  name,
  defaultUnit: 'pcs',
  leafCategory: { id: 'leaf', name: 'Leaf' },
  parentCategory: {
    id: 'parent',
    name: 'Parent',
    aisle: { id: 'aisle', name: 'Aisle' },
  },
  defaults: { expiryDays: 7, location: 'fridge' },
  ...overrides,
});

/** A ready Voice Action to add to the Pantry; each test passes what differs. */
export const voiceAction = (overrides: Record<string, unknown> = {}) => ({
  id: 'a1',
  status: 'ready',
  target: 'pantry',
  op: 'add',
  text: 'x',
  ingredient: null,
  name: null,
  quantity: null,
  unit: null,
  scope: null,
  expiresOn: null,
  noExpiry: false,
  location: null,
  rows: {},
  defaults: {},
  ...overrides,
});
