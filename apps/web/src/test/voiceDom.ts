import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from 'vitest';

/*
 * The Gator bubble and Review sheet helpers. Mock-free: this module imports nothing from the app,
 * so a test file may import it in any order. (test/voice.ts re-exports it and registers the voice mocks.)
 */

/** The Gator bubble's accessible name, in each locale the tests use ("...Open Review"). */
const BUBBLE_NAME = /Open Review|Deschide Verificarea|Åbn Gennemsyn/;
/** The Review sheet's name in each locale. */
const SHEET_NAME = /^(Review|Verificare|Gennemsyn)$/;

/** The Gator bubble, by its accessible name ("...Open Review"). */
export const bubbleButton = () =>
  screen.getByRole('button', { name: BUBBLE_NAME });

/** Waits for the Gator bubble to say `sentence` ("All read: 1 ready to review"), and returns it. */
export const bubbleSays = (sentence: string) =>
  screen.findByRole('button', { name: `${sentence}. Open Review` });

/** Taps the Gator bubble and returns the Review sheet it opens (or the one already open). */
export async function openBubbleSheet() {
  // Already open: the bubble is hidden under it.
  const open = screen.queryByRole('dialog', { name: SHEET_NAME });
  if (open) return open;
  fireEvent.click(await screen.findByRole('button', { name: BUBBLE_NAME }));
  return screen.findByRole('dialog', { name: SHEET_NAME });
}

/** Closes the Review sheet with Escape and waits for it to go, so the page can be used again. */
export async function closeBubbleSheet() {
  const open = screen.queryByRole('dialog', { name: SHEET_NAME });
  if (!open) return;
  fireEvent.keyDown(open, { key: 'Escape' });
  await waitFor(() => expect(open).not.toBeInTheDocument());
}

/**
 * Opens the Voice Note that is ready from the Review sheet (tap the Gator bubble, then the Review
 * or See button of the first ready row) and returns the Review sheet of that note, or the answer
 * sheet for a note of only Pantry Questions.
 */
export async function openReady(name?: { name: string | RegExp }) {
  const background = await openBubbleSheet();
  // A real click, which focuses the button as a Member's would.
  await userEvent.setup().click(
    within(background).getAllByRole('button', {
      name: /^(Review|See): /,
    })[0]!,
  );
  // The background sheet closes as the note opens; wait it out so only the note's sheet is left.
  await waitFor(() => expect(background).not.toBeInTheDocument());
  return screen.findByRole('dialog', name);
}

/** What the toast live region (a polite status) says now, one string per message. */
export const announcements = () =>
  screen
    .queryAllByRole('status')
    .map((el) => el.textContent ?? '')
    .filter((text) => text !== '');
