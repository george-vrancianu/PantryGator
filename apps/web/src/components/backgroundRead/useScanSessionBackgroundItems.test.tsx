// The fake voice environment registers its mocks, so it comes before anything that reaches the microphone.
import {
  announcements,
  closeBubbleSheet,
  openBubbleSheet,
  resetVoiceEnvironment,
  stubVoiceFetch,
  talkButton,
} from '@/test/voice';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchScanSession } from '@/lib/scanSession';
import type { CameraMode } from '@/lib/cameraMode';
import { renderWithProviders, stubApi } from '@/test/render';
import { holdLongEnough, pressDown, useVoiceTimers } from '@/test/voiceHold';
import { AppLayout } from '@/components/layout/AppLayout/AppLayout';
import ro from '../../i18n/locales/ro/background.json';
import da from '../../i18n/locales/da/background.json';

/** Puts a Scan in the Scan Session as the camera would: queued, started and, unless told otherwise, read. */
const seed = (
  id: string,
  mode: CameraMode,
  outcome: 'reading' | 'read' | 'error' | 'cap' = 'read',
) =>
  act(() => {
    dispatchScanSession({
      type: 'enqueue',
      scan: {
        id,
        mode,
        scanLanguage: 'en',
        image: 'data:image/jpeg;base64,YQ==',
        thumbnail: 'data:image/jpeg;base64,YQ==',
      },
    });
    dispatchScanSession({ type: 'start' });
    if (outcome === 'read')
      dispatchScanSession({ type: 'read', id, lines: [] });
    if (outcome === 'error' || outcome === 'cap')
      dispatchScanSession({ type: 'fail', id, reason: outcome });
  });

function renderAt(route = '/shopping') {
  return renderWithProviders(
    <Routes>
      <Route element={<AppLayout />}>
        <Route
          path="/shopping"
          element={
            <>
              <Link to="/scan">to the camera</Link>
              <Link to="/pantry">to the pantry</Link>
            </>
          }
        />
        <Route path="/scan" element={<Link to="/shopping">back</Link>} />
        <Route
          path="/pantry"
          element={<Link to="/shopping">to shopping</Link>}
        />
        <Route path="/scan/review" element={<p>review overview</p>} />
        <Route path="/scan/review/:scanId" element={<p>line editor</p>} />
      </Route>
    </Routes>,
    { route },
  );
}

/** The Gator bubble, when it is up. */
const bubble = () => screen.queryByTestId('gator-bubble');
const bubbleNamed = (sentence: string) =>
  screen.findByRole('button', { name: `${sentence}. Open Review` });

describe('the Scan Session in the Gator bubble', () => {
  beforeEach(() => {
    const { fetchMock } = stubApi({
      'GET /api/voice/config': () => Response.json({ configured: false }),
    });
    stubVoiceFetch(fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows nothing while the Scan Session holds no Scan, however voice is configured', () => {
    renderAt();
    expect(bubble()).toBeNull();
  });

  it('shows after the Member leaves the camera, and is hidden on it', async () => {
    seed('a', 'receipt', 'reading');
    renderAt('/scan');
    expect(bubble()).toBeNull();

    await userEvent.click(screen.getByRole('link', { name: 'back' }));
    expect(await bubbleNamed('Gator is working: 1 being read')).toBeVisible();
    const sheet = within(await openBubbleSheet());
    expect(sheet.getByText('1 receipt')).toBeVisible();
    expect(sheet.getByText('1 reading')).toBeVisible();
  });

  it('is hidden on the Review overview', () => {
    seed('a', 'receipt');
    renderAt('/scan/review');
    expect(screen.getByText('review overview')).toBeVisible();
    expect(bubble()).toBeNull();
  });

  it("is hidden on a Scan's line editor", () => {
    seed('a', 'receipt');
    renderAt('/scan/review/a');
    expect(screen.getByText('line editor')).toBeVisible();
    expect(bubble()).toBeNull();
  });

  it('is one Job however many Scans it holds, with its read and reading summary in its row', async () => {
    seed('a', 'receipt');
    seed('b', 'receipt');
    seed('c', 'receipt', 'reading');
    renderAt();
    expect(await bubbleNamed('Gator is working: 1 being read')).toBeVisible();
    const sheet = within(await openBubbleSheet());
    expect(sheet.getAllByRole('listitem')).toHaveLength(1);
    expect(sheet.getByText('3 receipts')).toBeVisible();
    expect(sheet.getByText('2 read · 1 reading')).toBeVisible();
  });

  it('is a photo item unless every Scan is a receipt, and leaves out barcode lookups and uncropped receipts', async () => {
    seed('a', 'receipt');
    seed('b', 'product');
    seed('code', 'barcode', 'reading');
    act(() =>
      dispatchScanSession({
        type: 'enqueue',
        scan: {
          id: 'g',
          mode: 'receipt',
          thumbnail: 'blob',
          source: new Blob(),
        },
      }),
    );
    renderAt();
    const sheet = within(await openBubbleSheet());
    expect(sheet.getByText('2 photos')).toBeVisible();
    expect(sheet.getByText('2 read')).toBeVisible();
  });

  it('opens the Review overview from its row, reading or read', async () => {
    seed('a', 'receipt', 'reading');
    renderAt();
    const sheet = within(await openBubbleSheet());
    await userEvent.click(
      sheet.getByRole('button', { name: 'Review 1 receipt' }),
    );
    expect(await screen.findByText('review overview')).toBeVisible();
  });

  it.each([
    ['failed', 'error'],
    ['capped', 'cap'],
  ] as const)(
    'shows Could not read when a Scan is %s',
    async (_name, outcome) => {
      seed('a', 'receipt');
      seed('b', 'receipt', outcome);
      renderAt();
      expect(await bubbleNamed('1 could not be read')).toBeVisible();
      expect(screen.getByTestId('gator-bubble')).toHaveAttribute(
        'data-state',
        'couldNotRead',
      );
      const sheet = within(await openBubbleSheet());
      expect(sheet.getByText('1 read · 1 failed')).toBeVisible();
    },
  );

  it('announces a failure through the toast live region, as a status and not an alert', async () => {
    seed('a', 'receipt');
    seed('b', 'receipt', 'error');
    seed('c', 'receipt', 'error');
    renderAt('/scan');
    await userEvent.click(screen.getByRole('link', { name: 'back' }));
    await bubbleNamed('1 could not be read');
    await waitFor(() =>
      expect(announcements()).toContain('1 could not be read'),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('buzzes once when the last reading Scan is read while the Member is on a Dock page', async () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, vibrate });
    seed('a', 'receipt', 'reading');
    renderAt();
    expect(vibrate).not.toHaveBeenCalled();
    act(() => dispatchScanSession({ type: 'read', id: 'a', lines: [] }));
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('does not buzz for a Session that was already read when the Member arrived', async () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, vibrate });
    seed('a', 'receipt');
    renderAt('/scan');
    await userEvent.click(screen.getByRole('link', { name: 'back' }));
    expect(await bubbleNamed('All read: 1 ready to review')).toBeVisible();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('turns gold with a happy Gator once all are read', async () => {
    seed('a', 'receipt');
    renderAt();
    const button = await bubbleNamed('All read: 1 ready to review');
    expect(button.querySelector('img[data-mood]')).toHaveAttribute(
      'data-mood',
      'happy',
    );
    expect(screen.getByTestId('gator-bubble')).toHaveAttribute(
      'data-state',
      'allDone',
    );
  });

  it('keeps a thinking Gator while Scans are read', async () => {
    seed('a', 'receipt', 'reading');
    renderAt();
    const button = await bubbleNamed('Gator is working: 1 being read');
    expect(button.querySelector('img[data-mood]')).toHaveAttribute(
      'data-mood',
      'thinking',
    );
  });
});

describe('the Scan Session and Voice Notes in the bubble', () => {
  let fake: ReturnType<typeof stubVoiceFetch>;
  beforeEach(() => {
    useVoiceTimers();
    resetVoiceEnvironment();
    const { fetchMock } = stubApi({
      'GET /api/voice/config': () => Response.json({ configured: true }),
    });
    fake = stubVoiceFetch(fetchMock);
    fake.holdReads();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function speak() {
    const button = await talkButton();
    pressDown(button);
    await screen.findByText("Gator's listening");
    await holdLongEnough();
    fireEvent.pointerUp(button);
    await waitFor(() => expect(fake.reads).toHaveLength(1));
  }

  it('counts the Scan Session once beside a Voice Note, in the general summary', async () => {
    seed('a', 'receipt', 'reading');
    seed('b', 'receipt', 'reading');
    renderAt();
    await speak();
    expect(await bubbleNamed('Gator is working: 2 being read')).toBeVisible();

    const sheet = await openBubbleSheet();
    expect(sheet.querySelectorAll('li')).toHaveLength(2);
    expect(sheet).toHaveTextContent('2 receipts');
  });

  it('opens the Review overview from the Scan Session row of the sheet', async () => {
    seed('a', 'receipt', 'reading');
    renderAt();
    await speak();
    const sheet = await openBubbleSheet();
    const row = Array.from(sheet.querySelectorAll('li')).find((li) =>
      li.textContent?.includes('1 receipt'),
    )!;
    expect(
      within(row).getByRole('button', { name: 'Review 1 receipt' }),
    ).toBeVisible();
    await userEvent.click(row.querySelector('button')!);
    expect(await screen.findByText('review overview')).toBeVisible();
  });

  it('with one ready item among several, the Review sheet lists it under Ready to review', async () => {
    seed('a', 'receipt');
    renderAt();
    await speak();
    expect(await bubbleNamed('1 ready to review')).toBeVisible();
    const sheet = within(await openBubbleSheet());
    await userEvent.click(
      sheet.getByRole('button', { name: 'Review 1 receipt' }),
    );
    expect(await screen.findByText('review overview')).toBeVisible();
    await closeBubbleSheet();
  });
});

describe('the background copy for Scan Sessions', () => {
  it('has plural forms in Romanian and Danish', () => {
    expect(ro.scan.receipt_few).toContain('{{count}}');
    expect(da.scan.receipt_other).toContain('{{count}}');
  });
});
