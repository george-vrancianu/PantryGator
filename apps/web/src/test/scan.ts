import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { beforeEach, expect, vi } from 'vitest';
import type { CameraStatus, FocusPass, FocusPoint } from '../lib/camera';

/** The shutter button, which takes a Scan. */
export const shutter = () => screen.getByRole('button', { name: 'Take photo' });

/** Lets pending promises and effects settle. */
export const flush = () => act(async () => {});

/** Advances the fake timers inside `act` (the test must have called `vi.useFakeTimers()`). */
export const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

const touch = {
  pointerId: 1,
  pointerType: 'touch',
  isPrimary: true,
  button: 0,
};

/** Presses the shutter with a finger at (x, y). */
export const press = (x = 200, y = 700) =>
  fireEvent.pointerDown(shutter(), { ...touch, clientX: x, clientY: y });

/** Moves the finger on the shutter to (x, y). */
export const moveOnShutter = (x: number, y: number) =>
  fireEvent.pointerMove(shutter(), { ...touch, clientX: x, clientY: y });

/** Lifts the finger off the shutter at (x, y). */
export const lift = (x = 200, y = 700) =>
  fireEvent.pointerUp(shutter(), { ...touch, clientX: x, clientY: y });

/** The browser cancels the touch on the shutter. */
export const cancelPress = () => fireEvent.pointerCancel(shutter(), touch);

/** The mode slider (a radio group). */
export const slider = () =>
  screen.getByRole('radiogroup', { name: 'Scan mode' });

/** The words of the selected mode(s) in the mode slider. */
export const selected = () =>
  within(slider())
    .getAllByRole('radio')
    .filter((radio) => radio.getAttribute('aria-checked') === 'true')
    .map((radio) => radio.getAttribute('aria-label') ?? radio.textContent);

/** Take a Scan as a Member does: press the shutter. */
export function takeScan() {
  fireEvent.click(shutter());
}

/** Takes a Scan and lets it settle. */
export async function scanOnce() {
  takeScan();
  await flush();
}

/** The Scan Language chip (the button that opens the language menu), in any UI language. */
export const languageChip = () =>
  screen.getByRole('button', { name: /Reading as|Citit ca|Læses på/ });
export const queryLanguageChip = () =>
  screen.queryByRole('button', { name: /Reading as|Citit ca|Læses på/ });

/** Pick a Scan Language from the chip's menu as a Member does: open it, click the language by its own name. */
export async function pickScanLanguage(name: 'English' | 'Română' | 'Dansk') {
  await userEvent.click(languageChip());
  await userEvent.click(screen.getByRole('menuitemradio', { name }));
}

/** The photo stack: its name starts with "Review" once the Scan Session holds a card. */
export const photoStack = () =>
  screen.getByRole('button', { name: /^(Review|No photos yet)/ });

/** The number on the photo stack's badge: how many cards the Scan Session holds (0 when the stack is empty). */
export const stackCount = () =>
  Number(
    screen.queryByTestId('stack-badge')?.textContent?.replace(/\D/g, '') ?? 0,
  );

const STACK_STATUS = {
  reading: (n: number) => new RegExp(`${n} still reading$`),
  read: () => /all read$/,
  failed: (n: number) => new RegExp(`${n} couldn't be read$`),
  uncropped: (n: number) => new RegExp(`${n} receipts? to crop$`),
};

/**
 * Expects the photo stack to announce `state` in its accessible name. `n` is the number the name
 * carries for that state (still reading, failed, to crop); for `read` it is the badge's card count.
 */
export function expectStack(state: keyof typeof STACK_STATUS, n = 1): void {
  expect(photoStack()).toHaveAccessibleName(STACK_STATUS[state](n));
  if (state === 'read') expect(stackCount()).toBe(n);
}

/** The photo stack, then the first card once it is read: the line editor for that Scan. */
export async function openFirstScanCard() {
  await userEvent.click(
    await screen.findByRole('button', { name: /^Review \d+ / }),
  );
  const [card] = await screen.findAllByTestId('card-result');
  await userEvent.click(card);
}

/**
 * The ONE fake camera for every Scan page and add-Batch camera test. jsdom has no camera, so the
 * camera module is the seam. Each test file only mounts it, with this one line (`vi.mock` is
 * hoisted, so the factory has to import this file lazily):
 *
 *   vi.mock('../../lib/camera', async () => (await import('../../test/scan')).fakeCameraModule());
 *
 * Tests then set `fakeCamera` fields. The state resets before every test (the factory registers
 * `beforeEach(resetFakeCamera)`), so nothing leaks between tests.
 *
 * To add a capability (e.g. zoom): add the field here with its default in `defaults()`, and have
 * `fakeUseCamera` return it (e.g. `zoomSupported`). Nothing else changes.
 */
export const fakeCamera = defaults();

function defaults() {
  return {
    /** `'ready'`, or `'unavailable'` for a denied permission / no camera. Read on each render; flip it mid-test with `setStatus`. */
    status: 'ready' as CameraStatus,
    /** Whether the camera has a torch; the flash toggle shows only then. */
    torchSupported: true,
    /** Whether the track has the zoom capability; the zoom pill shows only then. `setZoom` records each level asked for in `zooms`. */
    zoomSupported: false,
    /** The levels `setZoom` was called with, in order. */
    zooms: [] as number[],
    /** Whether it supports `single-shot` focus. Off: a Scan's focus pass is the steady pause (`FOCUS_PAUSE_MS`). */
    focusSupported: false,
    /** The frame a Scan captures (null: no live frame, so the capture yields nothing). */
    frame: new Blob(['frame'], { type: 'image/jpeg' }) as Blob | null,
    /** Barcodes in Barcode mode: the live watch. Emit a code with `emitBarcode`. */
    emit: null as ((code: string) => void) | null,
    /** How many barcode watches are running. */
    watching: 0,
    /**
     * What `readBarcode` (a Scan's photo or frame) answers: the nth read runs `reads[n]`, then null.
     * Set `deferReads` to answer by hand instead through `pendingReads` (resolve or reject each).
     */
    reads: [] as Array<() => Promise<string | null>>,
    readCount: 0,
    deferReads: false,
    pendingReads: [] as Array<{
      source: Blob;
      resolve: (code: string | null) => void;
      reject: (error: Error) => void;
    }>,
    /** Focus passes started, and cancelled; `finishFocus` ends the latest one (single-shot only). */
    focuses: 0,
    /** The guide centre each focus pass was told to aim at (undefined: the default point). */
    focusPoints: [] as Array<FocusPoint | undefined>,
    cancels: 0,
    /** The camera stream's lifecycle: `useCamera` mounted / unmounted. */
    starts: 0,
    stops: 0,
    /** The first argument of each `useCamera` call. */
    calls: [] as unknown[],
    finishFocus: () => {},
  };
}

const statusListeners = new Set<() => void>();

/** Flips the camera status mid-test (e.g. ready to unavailable) and re-renders the screen using it. */
export function setStatus(status: CameraStatus) {
  fakeCamera.status = status;
  act(() => statusListeners.forEach((listener) => listener()));
}

/** Puts the fake camera back to a ready, torch-equipped camera with no single-shot focus and no barcodes. */
export function resetFakeCamera() {
  Object.assign(fakeCamera, defaults());
}

/** The camera sees `code` in Barcode mode (waits for the page to start watching). The watch then ends, as the real one does. */
export function emitBarcode(code: string) {
  fakeCamera.emit?.(code);
}

const videoRef = { current: null };
// Set from the real module by `fakeCameraModule`, so the fake pause cannot drift from it.
let focusPauseMs = 0;

const capture = () => Promise.resolve(fakeCamera.frame);
const setTorch = () => Promise.resolve(fakeCamera.torchSupported);
const setZoom = (level: number) => {
  fakeCamera.zooms.push(level);
  return Promise.resolve(fakeCamera.zoomSupported);
};

function watchBarcodes(onCode: (code: string) => void) {
  let active = true;
  fakeCamera.watching += 1;
  const stop = () => {
    if (!active) return;
    active = false;
    fakeCamera.watching -= 1;
    if (fakeCamera.emit === emit) fakeCamera.emit = null;
  };
  const emit = (code: string) => {
    if (!active) return;
    stop();
    onCode(code);
  };
  fakeCamera.emit = emit;
  return stop;
}

function focusForScan(guideCentre?: FocusPoint): FocusPass {
  fakeCamera.focuses += 1;
  fakeCamera.focusPoints.push(guideCentre);
  let finish: () => void = () => {};
  const done = new Promise<void>((resolve) => (finish = resolve));
  if (!fakeCamera.focusSupported) {
    const timer = setTimeout(finish, focusPauseMs);
    return {
      done,
      cancel: () => {
        fakeCamera.cancels += 1;
        clearTimeout(timer);
        finish();
      },
    };
  }
  fakeCamera.finishFocus = finish;
  return {
    done,
    cancel: () => {
      fakeCamera.cancels += 1;
      finish();
    },
  };
}

function fakeUseCamera(...args: unknown[]) {
  fakeCamera.calls.push(args[0]);
  const [, rerender] = useState(0);
  useEffect(() => {
    const listener = () => rerender((n) => n + 1);
    statusListeners.add(listener);
    return () => void statusListeners.delete(listener);
  }, []);
  useEffect(() => {
    fakeCamera.starts += 1;
    return () => {
      fakeCamera.stops += 1;
    };
  }, []);
  return {
    videoRef,
    status: fakeCamera.status,
    torchSupported: fakeCamera.torchSupported,
    zoomSupported: fakeCamera.zoomSupported,
    setZoom,
    focusForScan,
    capture,
    setTorch,
    // A fresh function per render, as every per-file mock had: the Scan page then re-arms its watch
    // on its next render, not only after the scan interval. A stable one (like the real hook's) makes
    // the "keeps reading" ScanBarcode test wait out that interval first.
    watchBarcodes: (onCode: (code: string) => void) => watchBarcodes(onCode),
  };
}

function fakeReadBarcode(source: Blob | HTMLVideoElement) {
  const index = fakeCamera.readCount++;
  if (fakeCamera.deferReads) {
    return new Promise<string | null>((resolve, reject) =>
      fakeCamera.pendingReads.push({ source: source as Blob, resolve, reject }),
    );
  }
  return fakeCamera.reads[index]?.() ?? Promise.resolve(null);
}

/** The factory for `vi.mock('../../lib/camera', ...)`: the real module's other exports, with the camera hook and barcode reader faked. */
export async function fakeCameraModule() {
  const actual =
    await vi.importActual<typeof import('../lib/camera')>('../lib/camera');
  focusPauseMs = actual.FOCUS_PAUSE_MS;
  beforeEach(resetFakeCamera);
  return { ...actual, useCamera: fakeUseCamera, readBarcode: fakeReadBarcode };
}

/**
 * `stubApi` routes that answer the Member's Preferences with this Scan Language as the effective one
 * (the chip and the Voice Note start there); spread them into the routes.
 */
export const scanLanguagePreference = (
  effectiveScanLanguage: 'en' | 'ro' | 'da',
  effectiveSpokenLanguage: 'en' | 'ro' | 'da' = 'en',
) => ({
  'GET /api/settings/preferences': () =>
    Response.json({
      locale: null,
      catalogLanguage: null,
      effectiveCatalogLanguage: 'en',
      scanLanguage: effectiveScanLanguage,
      effectiveScanLanguage,
      spokenLanguage: effectiveSpokenLanguage,
      effectiveSpokenLanguage,
      theme: null,
      hideRecipesWithAllergies: false,
    }),
});
