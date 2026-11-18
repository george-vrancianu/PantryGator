import { useEffect, useRef } from 'react';

/** What a pick was: a new Family Ingredient, a Link & pick of `name`, or an Ingredient that was already there. */
export type PickOutcome =
  { kind: 'added' } | { kind: 'linked'; name: string } | { kind: 'existing' };

/** The primary action of the form, for a host that pins it (the phone Sheet). */
export type FormAction = {
  label: string;
  disabled: boolean;
  pending: boolean;
  onClick: () => void;
};

/**
 * Tell the host the primary action while this part of the form is on screen. Only the latest
 * `onClick` runs, and the host hears again only when the label or a flag changes.
 */
export function useReportedAction(
  onAction: ((action: FormAction | null) => void) | undefined,
  action: FormAction,
  enabled: boolean,
) {
  const click = useRef(action.onClick);
  const { label, disabled, pending, onClick } = action;
  useEffect(() => {
    click.current = onClick;
  });
  useEffect(() => {
    if (!onAction || !enabled) return;
    onAction({ label, disabled, pending, onClick: () => click.current() });
  }, [onAction, enabled, label, disabled, pending]);
}
