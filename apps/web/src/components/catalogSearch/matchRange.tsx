import { Box, palette } from '@pocket-pantry/ui';
import { fold } from '@/lib/fold';

/** Where the first case- and accent-insensitive match of `query` sits in `text`, as [start, end) of `text`. */
export function matchRange(
  text: string,
  query: string,
): [number, number] | null {
  const wanted = fold(query.trim());
  if (!wanted) return null;
  let folded = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let at = 0;
  for (const char of text) {
    const piece = fold(char);
    for (let i = 0; i < piece.length; i += 1) {
      starts.push(at);
      ends.push(at + char.length);
    }
    folded += piece;
    at += char.length;
  }
  const found = folded.indexOf(wanted);
  if (found < 0) return null;
  return [starts[found], ends[found + wanted.length - 1]];
}

/** `text` with the part matching `query` marked: accent colour, bold, underlined. */
export function Highlighted({ text, query }: { text: string; query: string }) {
  const range = matchRange(text, query);
  if (!range) return <>{text}</>;
  return (
    <>
      {text.slice(0, range[0])}
      <Box
        component="mark"
        sx={{
          background: 'none',
          color: palette('pp-accent'),
          fontWeight: 700,
          textDecoration: 'underline',
          textDecorationThickness: 2,
          textUnderlineOffset: '3px',
        }}
      >
        {text.slice(range[0], range[1])}
      </Box>
      {text.slice(range[1])}
    </>
  );
}
