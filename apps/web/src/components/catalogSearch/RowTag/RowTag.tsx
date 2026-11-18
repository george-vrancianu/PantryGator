import { Box, palette, radius } from '@pocket-pantry/ui';

/** A host's short per-row pill (for example "On list"). */
export function RowTag({ children }: { children: string }) {
  return (
    <Box
      component="span"
      sx={{
        flexShrink: 0,
        px: '9px',
        py: '3px',
        borderRadius: radius.tag,
        backgroundColor: palette('pp-accentTint'),
        color: palette('pp-accentOnTint'),
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {children}
    </Box>
  );
}
