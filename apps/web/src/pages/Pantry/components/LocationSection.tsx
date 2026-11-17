import { Box, Typography } from '@pocket-pantry/ui';
import { useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { StorageLocation } from '../../../lib/catalog';
import type { Batch } from '../../../lib/pantry';
import type { PantryRowHint } from '../hooks/usePantryRowHint';
import type { OpenIngredientKey, PantryRow } from '../hooks/usePantryScreen';
import { ingredientBlockSx } from './ingredientBlock';
import { RollUpRow } from './RollUpRow';

type Props = {
  location: StorageLocation;
  /** Number of Batches (not rows) in this Location. */
  batchCount: number;
  rows: PantryRow[];
  today: Date;
  onToggleOpen: (key: OpenIngredientKey) => void;
  onRemoveBatch: (batch: Batch) => void;
  /** Open the Add batch form for this row's Ingredient. */
  onAddBatch: (row: PantryRow) => void;
  /** Called when the last row is gone and this section unmounts, so focus can go elsewhere. */
  onEmptied: () => void;
  rowHint: PantryRowHint;
};

export function LocationSection({
  location,
  batchCount,
  rows,
  today,
  onToggleOpen,
  onRemoveBatch,
  onAddBatch,
  onEmptied,
  rowHint,
}: Props) {
  const { t } = useTranslation('pantry');
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  return (
    <Box component="section" aria-labelledby={headingId} sx={{ mb: 2 }}>
      <Typography
        id={headingId}
        ref={heading}
        tabIndex={-1}
        variant="sectionLabel"
        component="h2"
        color="text.secondary"
        sx={{ display: 'block', mx: '4px', mb: 1 }}
      >
        {`${t(`common:locations.${location}`)} · ${batchCount}`}
      </Typography>
      {/* The Location card is a stack of row blocks; the open one shows its rail. */}
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {rows.map((row, index) => (
          <RollUpRow
            key={row.key}
            sx={ingredientBlockSx({
              open: row.open,
              first: index === 0,
              last: index === rows.length - 1,
            })}
            rollUp={row}
            today={today}
            onToggle={() => onToggleOpen(row.openKey)}
            onRemoveBatch={onRemoveBatch}
            onAddBatch={() => onAddBatch(row)}
            rowHint={rowHint}
            onRowGone={() =>
              rows.length > 1 ? heading.current?.focus() : onEmptied()
            }
          />
        ))}
      </Box>
    </Box>
  );
}
