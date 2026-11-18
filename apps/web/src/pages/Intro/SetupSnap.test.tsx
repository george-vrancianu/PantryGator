import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { stubSetupMember, Where } from '@/test/intro';
import { renderWithProviders } from '@/test/render';

async function openSnap() {
  stubSetupMember();
  renderWithProviders(
    <>
      <App />
      <Where />
    </>,
    { route: '/intro/setup' },
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /Show me how/ }));
  await screen.findByRole('radiogroup', { name: "What's in front of you?" });
  return user;
}

const where = () => screen.getByLabelText('Where').textContent;

/** Everything in the Dock that is not the camera. */
const dimmed = () =>
  ['Home', 'Shopping', 'Pantry', 'Recipes', 'Hold to record a Voice Note'].map(
    (name) => screen.getByRole('button', { name }),
  );

describe('Setup 1, Snap', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens from "Show me how" and asks what is in front of the Member', async () => {
    await openSnap();
    expect(where()).toBe('/intro/snap');
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Gator, talking' })).toBeVisible();
    const choices = screen.getByRole('radiogroup', {
      name: "What's in front of you?",
    });
    expect(
      within(choices).getByRole('radio', { name: 'Ingredients' }),
    ).toBeChecked();
    expect(
      within(choices).getByRole('radio', { name: 'Receipt' }),
    ).not.toBeChecked();
    expect(
      screen.getByText('Tap the camera and snap away'),
    ).toBeInTheDocument();
  });

  it("makes Gator's line follow the pick", async () => {
    const user = await openSnap();
    expect(
      screen.getByText(
        "Put some food on the counter and snap it. Take as many photos as you like and I'll work out what it all is.",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Receipt' }));
    expect(
      screen.getByText(
        "Snap the receipt from your last shop. A long one? Take it in a few photos and I'll put the whole shop away.",
      ),
    ).toBeInTheDocument();
  });

  it('lets only the camera be used: the tabs and the mic are dimmed, out of the tab order and do nothing', async () => {
    const user = await openSnap();
    for (const control of dimmed()) {
      expect(control).toHaveAttribute('aria-disabled', 'true');
      expect(control).toHaveAttribute('tabindex', '-1');
    }

    // Tab around the whole screen: the dimmed parts are never reached.
    const reached = new Set<Element | null>();
    for (let i = 0; i < 8; i += 1) {
      await user.tab();
      reached.add(document.activeElement);
    }
    for (const control of dimmed()) expect(reached.has(control)).toBe(false);
    expect(reached.has(screen.getByRole('link', { name: 'Camera' }))).toBe(
      true,
    );

    for (const control of dimmed()) await user.click(control);
    expect(where()).toBe('/intro/snap');
  });

  it('opens the camera in the picked mode', async () => {
    const user = await openSnap();
    expect(screen.getByRole('link', { name: 'Camera' })).toHaveAttribute(
      'href',
      '/intro/camera?mode=ingredients',
    );
    await user.click(screen.getByRole('radio', { name: 'Receipt' }));
    const camera = screen.getByRole('link', { name: 'Camera' });
    expect(camera).toHaveAttribute('href', '/intro/camera?mode=receipt');

    await user.click(camera);
    expect(where()).toBe('/intro/camera?mode=receipt');
  });

  it('skips to Say it', async () => {
    const user = await openSnap();
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(where()).toBe('/intro/say-it');
  });

  it('is on the Canopy ground in the light look', async () => {
    await openSnap();
    expect(document.querySelector('[data-ground="canopy"]')).not.toBeNull();
    expect(document.querySelector('[data-ground="cream"]')).toBeNull();
    expect(document.querySelector('[data-theme="light"]')).not.toBeNull();
  });
});
