import CircularProgress from '@mui/material/CircularProgress';

/**
 * A progress spinner. With a `label` it is announced; without one it is decorative (`aria-hidden`),
 * for a spot where text beside it already says what is happening. `size` is in px.
 */
export function Spinner({ label, size }: { label?: string; size?: number }) {
  return (
    <CircularProgress
      {...(label
        ? { 'aria-label': label }
        : { 'aria-hidden': true, color: 'inherit' })}
      {...(size === undefined ? {} : { size, thickness: 5 })}
    />
  );
}
