import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MicrophoneError,
  bubbleSays,
  mic,
  resetVoiceEnvironment,
  talkButton,
} from '@/test/voice';
import { holdFor, pressDown, useVoiceTimers } from '@/test/voiceHold';
import { renderInAppLayout, stubApi } from '@/test/render';
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
  });
  vi.stubGlobal('fetch', fetchMock);
}

describe('Voice Note microphone sheets', () => {
  beforeEach(() => {
    useVoiceTimers();
    resetVoiceEnvironment();
    mic.permission.mockResolvedValue('prompt');
    setup();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('while the microphone has not been asked for', () => {
    it('opens the intro sheet with the Shopping examples, and records nothing', async () => {
      renderInAppLayout(<ShoppingPage />, '/shopping');

      pressDown(await talkButton());

      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent('Say what you did');
      expect(dialog).toHaveTextContent('Got the bread, take milk off');
      expect(dialog).toHaveTextContent('Goes straight to the Pantry');
      expect(dialog).toHaveTextContent(/then deleted/i);
      expect(mic.start).not.toHaveBeenCalled();
      expect(screen.queryByText("Gator's listening")).toBeNull();
    });

    it('can be pressed again after closing, and changes nothing', async () => {
      renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await talkButton();
      pressDown(button);
      await userEvent.click(
        await screen.findByRole('button', { name: 'Close' }),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(mic.request).not.toHaveBeenCalled();
      expect(mic.start).not.toHaveBeenCalled();

      pressDown(button);
      expect(await screen.findByRole('dialog')).toHaveTextContent(
        'Say what you did',
      );
    });

    it('asks only once however many times Allow is tapped, and disables it meanwhile', async () => {
      let allowed: () => void = () => {};
      mic.request.mockImplementation(
        () => new Promise<void>((resolve) => (allowed = resolve)),
      );
      renderInAppLayout(<ShoppingPage />, '/shopping');
      pressDown(await talkButton());
      const allow = await screen.findByRole('button', {
        name: 'Allow microphone',
      });

      fireEvent.click(allow);
      fireEvent.click(allow);

      await waitFor(() => expect(allow).toBeDisabled());
      expect(mic.request).toHaveBeenCalledTimes(1);
      await act(async () => allowed());
    });

    it('asks for the microphone on Allow, then thanks without recording', async () => {
      renderInAppLayout(<ShoppingPage />, '/shopping');
      pressDown(await talkButton());

      await userEvent.click(
        await screen.findByRole('button', { name: 'Allow microphone' }),
      );

      await waitFor(() => expect(mic.request).toHaveBeenCalledTimes(1));
      expect(await screen.findByText(/Microphone on/)).toHaveTextContent(
        'Microphone on · Now hold the button and speak.',
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(mic.start).not.toHaveBeenCalled();
    });

    it('swaps to the blocked sheet when Allow is refused', async () => {
      mic.request.mockRejectedValue(new MicrophoneError('denied'));
      renderInAppLayout(<ShoppingPage />, '/shopping');
      pressDown(await talkButton());

      await userEvent.click(
        await screen.findByRole('button', { name: 'Allow microphone' }),
      );

      expect(
        await screen.findByText('The microphone is blocked'),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.queryByText('Say what you did')).toBeNull(),
      );
    });
  });

  it('skips the intro when the browser already granted the microphone', async () => {
    mic.permission.mockResolvedValue('granted');
    renderInAppLayout(<ShoppingPage />, '/shopping');

    pressDown(await talkButton());

    await screen.findByText("Gator's listening");
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  describe('while the microphone is blocked', () => {
    beforeEach(() => mic.permission.mockResolvedValue('denied'));

    it('shows the blocked button, and a press opens the blocked sheet', async () => {
      renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await talkButton();
      await waitFor(() => expect(button).toHaveStyle({ opacity: '0.55' }));

      pressDown(button);

      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent('The microphone is blocked');
      expect(mic.start).not.toHaveBeenCalled();
    });

    it('says the microphone is blocked to assistive technology', async () => {
      renderInAppLayout(<ShoppingPage />, '/shopping');
      const button = await talkButton();
      await waitFor(() =>
        expect(button).toHaveAccessibleDescription(/Microphone blocked/),
      );
    });

    it('lists the steps for both browsers when the browser is not known', async () => {
      renderInAppLayout(<ShoppingPage />, '/shopping');
      pressDown(await talkButton());

      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent('iPhone, Safari');
      expect(dialog).toHaveTextContent('Android, Chrome');
    });

    it('lists only the steps for the browser it knows', async () => {
      vi.stubGlobal('navigator', {
        ...navigator,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      });
      renderInAppLayout(<ShoppingPage />, '/shopping');
      pressDown(await talkButton());

      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent('iPhone, Safari');
      expect(dialog).not.toHaveTextContent('Android, Chrome');
    });

    it('closes with a thanks when "I\'ve allowed it" finds the microphone allowed', async () => {
      renderInAppLayout(<ShoppingPage />, '/shopping');
      pressDown(await talkButton());
      const dialog = await screen.findByRole('dialog');

      mic.permission.mockResolvedValue('granted');
      await userEvent.click(
        within(dialog).getByRole('button', { name: "I've allowed it" }),
      );

      expect(await screen.findByText(/Microphone on/)).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(mic.start).not.toHaveBeenCalled();
    });

    it('stays, and shakes the hero once, while still blocked', async () => {
      mic.request.mockRejectedValue(new MicrophoneError('denied'));
      renderInAppLayout(<ShoppingPage />, '/shopping');
      pressDown(await talkButton());
      const dialog = await screen.findByRole('dialog');
      const hero = within(dialog).getByTestId('mic-hero');
      expect(hero).not.toHaveAttribute('data-shaking');

      await userEvent.click(
        within(dialog).getByRole('button', { name: "I've allowed it" }),
      );

      expect(await within(dialog).findByRole('status')).toHaveTextContent(
        /Still blocked/,
      );
      await waitFor(() =>
        expect(within(dialog).getByTestId('mic-hero')).toHaveAttribute(
          'data-shaking',
        ),
      );
      expect(screen.getByRole('dialog')).toHaveTextContent(
        'The microphone is blocked',
      );
    });

    it('reopens the blocked sheet fresh after a failed recheck and Close', async () => {
      mic.request.mockRejectedValue(new MicrophoneError('denied'));
      renderInAppLayout(<ShoppingPage />, '/shopping');
      pressDown(await talkButton());
      const dialog = await screen.findByRole('dialog');
      await userEvent.click(
        within(dialog).getByRole('button', { name: "I've allowed it" }),
      );
      expect(await within(dialog).findByRole('status')).toHaveTextContent(
        /Still blocked/,
      );

      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Close' }),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      pressDown(await talkButton());

      const again = await screen.findByRole('dialog');
      expect(again).toHaveTextContent('The microphone is blocked');
      expect(within(again).getByRole('status')).toBeEmptyDOMElement();
      expect(within(again).queryByText(/Still blocked/)).toBeNull();
      expect(within(again).getByTestId('mic-hero')).not.toHaveAttribute(
        'data-shaking',
      );
    });

    it('says the microphone is not available when it cannot be asked for', async () => {
      mic.request.mockRejectedValue(new MicrophoneError('unavailable'));
      renderInAppLayout(<ShoppingPage />, '/shopping');
      pressDown(await talkButton());
      const dialog = await screen.findByRole('dialog');

      await userEvent.click(
        within(dialog).getByRole('button', { name: "I've allowed it" }),
      );

      await bubbleSays('1 could not be read');
      fireEvent.click(screen.getByRole('button', { name: /Open Review/ }));
      expect(await screen.findByRole('dialog')).toHaveTextContent(
        /cannot record audio/i,
      );
    });

    it('closes without changing anything on Close', async () => {
      renderInAppLayout(<ShoppingPage />, '/shopping');
      pressDown(await talkButton());
      await userEvent.click(
        await screen.findByRole('button', { name: 'Close' }),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
  });

  it('skips the intro on a device that allowed the microphone before, though the browser says prompt', async () => {
    localStorage.setItem('pp.voice.micExplained', '1');
    renderInAppLayout(<ShoppingPage />, '/shopping');

    pressDown(await talkButton());

    await screen.findByText("Gator's listening");
    expect(mic.start).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('starts nothing when let go while the permission is being read', async () => {
    let answer: (state: string) => void = () => {};
    mic.permission.mockImplementation(
      () => new Promise((resolve) => (answer = resolve)),
    );
    renderInAppLayout(<ShoppingPage />, '/shopping');
    const button = await talkButton();

    pressDown(button);
    fireEvent.pointerUp(button);
    await act(async () => answer('granted'));
    await holdFor(50);

    expect(mic.start).not.toHaveBeenCalled();
    expect(screen.queryByText('Starting…')).toBeNull();
  });

  it('opens no sheet when cancelled while the permission is being read', async () => {
    let answer: (state: string) => void = () => {};
    mic.permission.mockImplementation(
      () => new Promise((resolve) => (answer = resolve)),
    );
    renderInAppLayout(<ShoppingPage />, '/shopping');
    const button = await talkButton();

    pressDown(button);
    fireEvent.pointerCancel(button, { isPrimary: true });
    await act(async () => answer('prompt'));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the blocked sheet when the browser refuses mid-hold (no Permissions API)', async () => {
    mic.permission.mockResolvedValue('granted');
    mic.start.mockRejectedValue(new MicrophoneError('denied'));
    renderInAppLayout(<ShoppingPage />, '/shopping');

    pressDown(await talkButton());

    expect(
      await screen.findByText('The microphone is blocked'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
