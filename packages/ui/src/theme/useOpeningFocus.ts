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
 * call once the open transition ends. Focus moves to `initialFocus` only if it
 * is still on the paper, and, below `md`, never onto a text field.
 */
export function useOpeningFocus(
  paper: HTMLElement | null,
  initialFocus: RefObject<HTMLElement | null> | undefined,
  centred: boolean,
) {
  return () => {
    const target = initialFocus?.current;
    if (!target || !paper) return;
    if (document.activeElement !== paper) return;
    if (!centred && isTextField(target)) return;
    target.focus();
  };
}
