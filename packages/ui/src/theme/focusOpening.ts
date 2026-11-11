import type { RefObject } from 'react';

const NON_TEXT_INPUTS = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/** A text-like input, a textarea or an editable element: focusing it raises the phone keyboard. */
export function isTextField(el: HTMLElement): boolean {
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(el.type);
  return el.isContentEditable || el.getAttribute('contenteditable') === 'true';
}

/**
 * The opening focus of a Sheet or Dialog (ADR 0039). Returns the function to
 * call once the open transition ends. Focus moves to `initialFocus` unless the
 * Member already moved it to a control inside the sheet. Focus still on the
 * paper, or outside it (a tap on the scrim leaves it on the body), has not been
 * moved by the Member. Below `md`, never onto a text field. When focus is
 * outside the sheet and there is no target to take it, it goes to the paper.
 */
export function focusOpening(
  paper: HTMLElement | null,
  initialFocus: RefObject<HTMLElement | null> | undefined,
  centred: boolean,
) {
  return () => {
    if (!paper) return;
    const active = document.activeElement;
    if (active && active !== paper && paper.contains(active)) return;
    const target = initialFocus?.current;
    if (target && (centred || !isTextField(target))) target.focus();
    else if (!paper.contains(document.activeElement)) paper.focus();
  };
}
