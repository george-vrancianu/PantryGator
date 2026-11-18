import { useTranslation } from 'react-i18next';

const HINT_IDS = {
  markLow: 'pantry-key-mark-low',
  clearLow: 'pantry-key-clear-low',
  makeStaple: 'pantry-key-make-staple',
  removeStaple: 'pantry-key-remove-staple',
};

/**
 * The closed rows' keyboard actions, "Press L: Mark running low. Press S: Make Staple." (or Clear /
 * Remove). Rendered once by the page, so each row points at them rather than carrying its own copy.
 */
export function RowKeyHints() {
  const { t } = useTranslation('pantry');
  const lowKey = (action: string) => t('a11y.lowKey', { action: t(action) });
  const stapleKey = (action: string) =>
    t('a11y.stapleKey', { action: t(action) });
  return (
    <>
      <span id={HINT_IDS.markLow} hidden>
        {lowKey('a11y.markLow')}
      </span>
      <span id={HINT_IDS.clearLow} hidden>
        {lowKey('a11y.clearLow')}
      </span>
      <span id={HINT_IDS.makeStaple} hidden>
        {stapleKey('a11y.makeStaple')}
      </span>
      <span id={HINT_IDS.removeStaple} hidden>
        {stapleKey('a11y.removeStaple')}
      </span>
    </>
  );
}

/** The `aria-describedby` of a closed, matched row: what its L and S keys will do. */
export function rowKeyHintIds({
  runningLow,
  isStaple,
}: {
  runningLow: boolean;
  isStaple: boolean;
}) {
  return [
    runningLow ? HINT_IDS.clearLow : HINT_IDS.markLow,
    isStaple ? HINT_IDS.removeStaple : HINT_IDS.makeStaple,
  ].join(' ');
}
