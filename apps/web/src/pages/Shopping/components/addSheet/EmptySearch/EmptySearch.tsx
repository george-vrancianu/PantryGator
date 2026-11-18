import { Box } from '@pocket-pantry/ui';
import type { Suggestion, Suggestions } from '@/lib/suggestions';
import { GoneTiles } from '../GoneTiles/GoneTiles';
import { RunningLowTiles } from '../RunningLowTiles/RunningLowTiles';

export type EmptySearchProps = {
  suggestions: Suggestions;
  /** Called as a Gone tile is picked, before the search selects it. */
  onPickGone: (suggestion: Suggestion) => void;
};

/** What the Add sheet shows while the search is empty: what is gone from the Pantry, and what is running low. */
export function EmptySearch(props: EmptySearchProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.25 }}>
      <GoneTiles suggestions={props.suggestions} onPick={props.onPickGone} />
      <RunningLowTiles runningLow={props.suggestions.runningLow} />
    </Box>
  );
}
