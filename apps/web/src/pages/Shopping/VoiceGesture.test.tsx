import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  openReady,
  fakeSession,
  hold as holdOn,
  mic,
  removeWakeLock,
  resetVoiceEnvironment,
  stubVoiceFetch,
  talkButton,
  wake,
} from '@/test/voice';
import {
  holdFor,
  holdLongEnough,
  pressDown,
  useVoiceTimers,
} from '@/test/voiceHold';
import { renderInAppLayout, stubApi } from '@/test/render';
import { voiceNote } from '@/lib/voiceNote';
import { ShoppingPage } from './ShoppingPage';

function setup() {
  const { fetchMock } = stubApi({
    'GET /api/shopping-list': () =>
      Response.json({
        id: 'l1',
        groups: [],
        summary: { remaining: 0, checked: 0 },
      }),
    'GET /api/voice/config': () => Response.json({ configured: true }),
    'POST /api/voice': () =>
      Response.json({ transcript: 'got the bread', actions: [] }),
  });
  return stubVoiceFetch(fetchMock);
}

/** jsdom has no layout: the button sits at 100..162 x 500..562. */
function place(button: HTMLElement) {
  button.getBoundingClientRect = () =>
    ({
      left: 100,
      right: 162,
      top: 500,
      bottom: 562,
      width: 62,
      height: 62,
    }) as DOMRect;
}

const hold = () =>
  holdOn({ prepare: place, init: { clientX: 130, clientY: 530 } });

const cancelledToast = 'Cancelled. Nothing was sent.';

describe('the recording gesture on the Shopping List', () => {
  let session: ReturnType<typeof fakeSession>;
  let vibrate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useVoiceTimers();
    resetVoiceEnvironment();
    session = fakeSession();
    mic.start.mockImplementation(() => Promise.resolve(session));
    vibrate = vi.fn();
    vi.stubGlobal(
      'navigator',
      Object.assign(Object.create(navigator), { vibrate }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('slide to cancel', () => {
    it('does not arm within 72 px, arms beyond it, and disarms when back', async () => {
      setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await hold();
      vibrate.mockClear();

      // 70 px left of the box: still keeping it.
      fireEvent.pointerMove(button, { clientX: 30, clientY: 530 });
      expect(screen.queryByText('Let go to cancel')).toBeNull();
      expect(vibrate).not.toHaveBeenCalled();

      // 80 px left of the box.
      fireEvent.pointerMove(button, { clientX: 20, clientY: 530 });
      expect(await screen.findAllByText('Let go to cancel')).not.toHaveLength(
        0,
      );
      expect(screen.getByText('Slide back to keep recording')).toBeVisible();
      expect(vibrate).toHaveBeenCalledWith(6);
      expect(session.cancel).not.toHaveBeenCalled();

      fireEvent.pointerMove(button, { clientX: 130, clientY: 530 });
      expect(screen.queryByText('Slide back to keep recording')).toBeNull();
      expect(vibrate).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Gator's listening")).toBeVisible();
    });

    it('arms by sliding down or up too', async () => {
      setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await hold();
      fireEvent.pointerMove(button, { clientX: 130, clientY: 700 });
      expect(screen.getByText('Slide back to keep recording')).toBeVisible();
      fireEvent.pointerMove(button, { clientX: 130, clientY: 530 });
      fireEvent.pointerMove(button, { clientX: 130, clientY: 400 });
      expect(screen.getByText('Slide back to keep recording')).toBeVisible();
    });

    it('discards on release while armed, and says so', async () => {
      const { sent } = setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await hold();
      fireEvent.pointerMove(button, { clientX: 10, clientY: 530 });
      fireEvent.pointerUp(button);

      expect(await screen.findByText(cancelledToast)).toBeVisible();
      expect(session.cancel).toHaveBeenCalledTimes(1);
      expect(session.stop).not.toHaveBeenCalled();
      expect(sent).toHaveLength(0);
      expect(screen.queryByText("Gator's listening")).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('keeps recording when the pointer leaves the button but not the margin', async () => {
      const { sent } = setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await hold();
      fireEvent.pointerLeave(button);
      fireEvent.pointerMove(button, { clientX: 60, clientY: 530 });
      expect(session.cancel).not.toHaveBeenCalled();
      fireEvent.pointerUp(button);
      await openReady();
      expect(sent).toHaveLength(1);
    });

    it('cancels on a pointer cancel (a system gesture)', async () => {
      const { sent } = setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await hold();
      fireEvent.pointerCancel(button);

      await waitFor(() => expect(session.cancel).toHaveBeenCalledTimes(1));
      expect(screen.queryByText("Gator's listening")).toBeNull();
      expect(sent).toHaveLength(0);
    });
  });

  describe('a press that is no longer a recording', () => {
    it('does not arm, buzz or grey the button after Escape or the 60 s auto-stop while the finger is still down', async () => {
      setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await hold();
      await userEvent.keyboard('{Escape}');
      await screen.findByText(cancelledToast);
      vibrate.mockClear();
      fireEvent.pointerMove(button, { clientX: 10, clientY: 530 });
      expect(vibrate).not.toHaveBeenCalled();
      expect(screen.queryByText('Slide back to keep recording')).toBeNull();
      fireEvent.pointerUp(button);

      const again = await hold();
      await holdFor(60_000);
      await openReady();
      vibrate.mockClear();
      fireEvent.pointerMove(again, { clientX: 10, clientY: 530 });
      expect(vibrate).not.toHaveBeenCalled();
      expect(screen.queryByText('Slide back to keep recording')).toBeNull();
    });

    it('still treats a later click with no press before it as assistive after a press that ended early', async () => {
      setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await hold();
      await userEvent.keyboard('{Escape}');
      await holdFor(1_000);
      fireEvent.click(button);
      await screen.findByText("Gator's listening");
      expect(mic.start).toHaveBeenCalledTimes(2);
    });

    it('ignores a second finger or a right click', async () => {
      setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await talkButton();
      pressDown(button, { isPrimary: false });
      pressDown(button, { button: 2 });
      await holdFor(100);
      expect(mic.start).not.toHaveBeenCalled();
    });

    it('is not ended by a second finger lifting or being cancelled', async () => {
      const { sent } = setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await hold();
      fireEvent.pointerUp(button, { pointerId: 2, isPrimary: false });
      fireEvent.pointerCancel(button, { pointerId: 2, isPrimary: false });
      fireEvent.lostPointerCapture(button, { pointerId: 2 });
      expect(session.cancel).not.toHaveBeenCalled();
      expect(screen.getByText("Gator's listening")).toBeVisible();
      expect(sent).toHaveLength(0);

      fireEvent.pointerUp(button);
      await openReady();
      expect(sent).toHaveLength(1);
    });

    it('has the destination as the button description', async () => {
      setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      expect(await talkButton()).toHaveAccessibleDescription(/shopping/i);
    });

    it('shows only Cancelled, not the hold tip, after a quick release then Escape before the stream arrives', async () => {
      let arrive: (value: ReturnType<typeof fakeSession>) => void = () => {};
      mic.start.mockImplementation(
        () => new Promise((resolve) => (arrive = resolve)),
      );
      setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await talkButton();
      pressDown(button, { clientX: 130, clientY: 530 });
      await screen.findByText('Starting…');
      await holdLongEnough();
      fireEvent.pointerUp(button);
      await userEvent.keyboard('{Escape}');
      expect(await screen.findByText(cancelledToast)).toBeVisible();
      await act(async () => arrive(session));
      await holdFor(1_000);
      expect(screen.queryByText('Hold to talk, let go to send')).toBeNull();
    });

    it('says Cancelled even when the stream had not arrived yet, and then records nothing', async () => {
      let arrive: (value: ReturnType<typeof fakeSession>) => void = () => {};
      mic.start.mockImplementation(
        () => new Promise((resolve) => (arrive = resolve)),
      );
      const { sent } = setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await talkButton();
      pressDown(button, { clientX: 130, clientY: 530 });
      await screen.findByText('Starting…');
      await userEvent.keyboard('{Escape}');

      expect(await screen.findByText(cancelledToast)).toBeVisible();
      await act(async () => arrive(session));
      expect(session.cancel).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Gator's listening")).toBeNull();
      expect(sent).toHaveLength(0);
    });

    it('ignores a second press while the first is still starting: no buzz, no change, and the first keeps its tip', async () => {
      let arrive: (value: ReturnType<typeof fakeSession>) => void = () => {};
      mic.start.mockImplementation(
        () => new Promise((resolve) => (arrive = resolve)),
      );
      setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await talkButton();
      pressDown(button, { clientX: 130, clientY: 530 });
      await screen.findByText('Starting…');
      await holdLongEnough();
      fireEvent.pointerUp(button);
      vibrate.mockClear();

      pressDown(button, { clientX: 130, clientY: 530 });
      await holdFor(500);
      expect(vibrate).not.toHaveBeenCalled();
      expect(mic.start).toHaveBeenCalledTimes(1);
      fireEvent.pointerUp(button);

      await act(async () => arrive(session));
      expect(
        await screen.findByText('Hold to talk, let go to send'),
      ).toBeVisible();
      expect(session.cancel).toHaveBeenCalledTimes(1);
    });

    it('says Cancelled for a system cancel after letting go while the permission is still being read', async () => {
      let answer: (value: 'granted') => void = () => {};
      mic.permission.mockImplementation(
        () => new Promise((resolve) => (answer = resolve)),
      );
      const { sent } = setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await talkButton();
      pressDown(button, { clientX: 130, clientY: 530 });
      await holdLongEnough();
      fireEvent.pointerUp(button);
      fireEvent.pointerCancel(button);

      expect(await screen.findByText(cancelledToast)).toBeVisible();
      await act(async () => answer('granted'));
      expect(mic.start).not.toHaveBeenCalled();
      expect(sent).toHaveLength(0);
    });

    it('records nothing when the stream arrives after leaving the page', async () => {
      let arrive: (value: ReturnType<typeof fakeSession>) => void = () => {};
      mic.start.mockImplementation(
        () => new Promise((resolve) => (arrive = resolve)),
      );
      const { sent } = setup();
      const view = renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await talkButton();
      pressDown(button);
      await screen.findByText('Starting…');
      view.unmount();

      await act(async () => arrive(session));
      await holdFor(61_000);
      expect(session.cancel).toHaveBeenCalledTimes(1);
      expect(session.stop).not.toHaveBeenCalled();
      expect(sent).toHaveLength(0);
    });
  });

  describe('time limit', () => {
    it('turns to "n s left" from 50 s, and stops and sends at 60 s with a toast', async () => {
      const { sent } = setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      await hold();
      expect(screen.queryByText(/s left/)).toBeNull();

      await holdFor(50_000);
      expect(screen.getByText('10 s left')).toBeVisible();
      expect(screen.getByTestId('elapsed')).toHaveStyle({
        color: 'var(--mui-palette-warning-main)',
      });
      await holdFor(4_000);
      expect(screen.getByText('6 s left')).toBeVisible();
      expect(session.stop).not.toHaveBeenCalled();

      vibrate.mockClear();
      await holdFor(6_000);
      expect(vibrate).toHaveBeenCalledWith(14);
      expect(
        await screen.findByText('Stopped at 1 minute · Sending what you said.'),
      ).toBeVisible();
      expect(await openReady()).toHaveTextContent('What I heard');
      expect(sent).toHaveLength(1);
    });

    it('does not buzz when the recording fails mid-hold, only at the limit', async () => {
      setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      await hold();
      vibrate.mockClear();
      act(() => voiceNote.fail('unavailable'));
      await waitFor(() =>
        expect(screen.queryByText("Gator's listening")).toBeNull(),
      );
      expect(vibrate).not.toHaveBeenCalledWith(14);
    });
  });

  describe('keyboard', () => {
    it('records while Space is down and sends on key up', async () => {
      const { sent } = setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await talkButton();
      button.focus();

      fireEvent.keyDown(button, { key: ' ' });
      await screen.findByText("Gator's listening");
      fireEvent.keyDown(button, { key: ' ', repeat: true });
      await holdLongEnough();
      fireEvent.keyUp(button, { key: ' ' });

      expect(await openReady()).toHaveTextContent('What I heard');
      expect(mic.start).toHaveBeenCalledTimes(1);
      expect(sent).toHaveLength(1);
    });

    it('records with Enter, and a quick Enter is only a tap', async () => {
      const { sent } = setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await talkButton();

      fireEvent.keyDown(button, { key: 'Enter' });
      await screen.findByText("Gator's listening");
      fireEvent.keyUp(button, { key: 'Enter' });

      expect(
        await screen.findByText('Hold to talk, let go to send'),
      ).toBeVisible();
      expect(sent).toHaveLength(0);
    });

    it('cancels with Escape while recording', async () => {
      const { sent } = setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await talkButton();
      fireEvent.keyDown(button, { key: ' ' });
      await screen.findByText("Gator's listening");
      await holdLongEnough();

      await userEvent.keyboard('{Escape}');

      expect(await screen.findByText(cancelledToast)).toBeVisible();
      expect(session.cancel).toHaveBeenCalledTimes(1);
      fireEvent.keyUp(button, { key: ' ' });
      expect(sent).toHaveLength(0);
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  describe('assistive activation', () => {
    it('toggles: one click starts, the next sends', async () => {
      const { sent } = setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await talkButton();

      fireEvent.click(button);
      await screen.findByText("Gator's listening");
      expect(button).toHaveAttribute('aria-pressed', 'true');
      await holdFor(1_000);
      expect(sent).toHaveLength(0);

      fireEvent.click(button);
      expect(await openReady()).toHaveTextContent('What I heard');
      expect(sent).toHaveLength(1);
    });

    it('cancels a toggled recording with Escape', async () => {
      const { sent } = setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await talkButton();
      fireEvent.click(button);
      await screen.findByText("Gator's listening");
      await holdLongEnough();

      await userEvent.keyboard('{Escape}');

      expect(await screen.findByText(cancelledToast)).toBeVisible();
      expect(sent).toHaveLength(0);
    });

    it('does not treat the click after a press as a toggle', async () => {
      setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await hold();
      fireEvent.pointerUp(button);
      fireEvent.click(button);
      await openReady();
      expect(mic.start).toHaveBeenCalledTimes(1);
      expect(session.stop).toHaveBeenCalledTimes(1);
    });
  });

  describe('live region', () => {
    it('announces Recording, Let go to cancel and 10 seconds left once each, never the ticking time', async () => {
      setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await talkButton();
      place(button);
      pressDown(button, { clientX: 130, clientY: 530 });
      const card = (await screen.findByText("Gator's listening")).closest(
        '[role="status"]',
      )!;
      expect(card).toHaveAttribute('role', 'status');

      // What a screen reader reads: everything not aria-hidden.
      const live = () =>
        Array.from(card.querySelectorAll('*'))
          .filter((node) => !node.closest('[aria-hidden="true"]'))
          .map((node) => (node.children.length === 0 ? node.textContent : ''))
          .join('')
          .trim();
      const announced: string[] = [];
      const watch = new MutationObserver(() => {
        const now = live();
        if (now) announced.push(now);
      });
      watch.observe(card, {
        subtree: true,
        childList: true,
        characterData: true,
      });
      const arm = () => {
        fireEvent.pointerMove(button, { clientX: 10, clientY: 530 });
      };
      const disarm = () => {
        fireEvent.pointerMove(button, { clientX: 130, clientY: 530 });
      };

      await holdFor(3_000);
      arm();
      await holdFor(10);
      disarm();
      await holdFor(10);
      arm();
      await holdFor(10);
      disarm();
      await holdFor(47_000);
      arm();
      await holdFor(10);
      disarm();
      await holdFor(5_000);
      watch.disconnect();

      expect(announced).toEqual([
        'Recording',
        'Let go to cancel',
        '10 seconds left',
      ]);
    });
  });

  describe('wake lock', () => {
    const request = wake.request;
    const released = wake.released;

    it('is held from the press until Review opens', async () => {
      setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await hold();
      expect(request).toHaveBeenCalledWith('screen');
      expect(released).not.toHaveBeenCalled();

      fireEvent.pointerUp(button);
      await openReady();
      expect(request).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(released).toHaveBeenCalledTimes(1));
    });

    it('is skipped silently when the browser has none, or refuses', async () => {
      request.mockImplementation(() => Promise.reject(new Error('denied')));
      setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await hold();
      fireEvent.pointerUp(button);
      expect(await openReady()).toBeInTheDocument();
      expect(released).not.toHaveBeenCalled();
    });

    it('works where wakeLock is unsupported', async () => {
      removeWakeLock();
      setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await hold();
      fireEvent.pointerUp(button);
      expect(await openReady()).toBeInTheDocument();
    });
  });

  describe('keyboard order', () => {
    it('tabs from the page through the Dock, mic before camera', async () => {
      setup();
      renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await talkButton();
      const dock = screen.getByRole('navigation');
      const camera = screen.getByRole('link', { name: 'Camera' });

      dock.querySelector<HTMLElement>('a,button')?.focus();
      // Before the Dock is the page itself.
      await userEvent.tab({ shift: true });
      expect(document.querySelector('main')).toContainElement(
        document.activeElement as HTMLElement,
      );
      await userEvent.tab();
      expect(dock.contains(document.activeElement)).toBe(true);
      button.focus();
      await userEvent.tab();
      expect(camera).toHaveFocus();
      await userEvent.tab({ shift: true });
      expect(button).toHaveFocus();
    });
  });
});
