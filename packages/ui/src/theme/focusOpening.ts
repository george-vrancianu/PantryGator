import { useState, type RefObject } from 'react';

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
 * moved by the Member. Below `md`, never onto a text field.
 */
export function focusOpening(
  paper: HTMLElement | null,
  initialFocus: RefObject<HTMLElement | null> | undefined,
  centred: boolean,
) {
  return () => {
    const target = initialFocus?.current;
    if (!target || !paper) return;
    const active = document.activeElement;
    if (active && active !== paper && paper.contains(active)) return;
    if (!centred && isTextField(target)) return;
    target.focus();
  };
}

/** A text field holds focus right now: closing a sheet onto it would raise the phone keyboard. */
function textFieldHasFocus(): boolean {
  const active =
    typeof document === 'undefined' ? null : document.activeElement;
  return active instanceof HTMLElement && isTextField(active);
}

/**
 * The closing focus of a Sheet or Dialog (ADR 0039): whether to skip putting
 * focus back where it was before the open. On iOS a tap on a button does not
 * focus it, so a text field the Member typed in earlier can still hold focus
 * when a sheet opens; restoring onto it as the sheet closes would raise the
 * keyboard. Below `md` (`centred` false) the restore is skipped then; the
 * caller's `onExited` can still move focus. Decided in the render that opens
 * the sheet, while that field still has focus: the MUI focus trap reads it once
 * per open.
 */
export function useSkipTextRestore(open: boolean, centred: boolean): boolean {
  const [wasOpen, setWasOpen] = useState(open);
  const [skip, setSkip] = useState(
    () => open && !centred && textFieldHasFocus(),
  );
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSkip(!centred && textFieldHasFocus());
  }
  return skip;
}
