import { Box, tokens, radius } from '@pocket-pantry/ui';

/** A host's short per-row pill (for example "On list"). */
export function RowTag({ children }: { children: string }) {
  const { color } = tokens;
  return (
    <Box
      component="span"
      sx={{
        flexShrink: 0,
        px: '9px',
        py: '3px',
        borderRadius: radius.tag,
        backgroundColor: color.accentTint,
        color: color.accentOnTint,
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {children}
    </Box>
  );
}
