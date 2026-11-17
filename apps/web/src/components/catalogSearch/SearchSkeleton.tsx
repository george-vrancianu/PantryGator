import { Box, tokens, radius, nestedRadius } from '@pocket-pantry/ui';

const TITLE_WIDTHS = ['58%', '44%', '66%', '50%'];
const META_WIDTHS = ['36%', '40%', '30%', '42%'];

const shimmer = {
  '@keyframes pp-search-shimmer': {
    from: { transform: 'translateX(-100%)' },
    to: { transform: 'translateX(100%)' },
  },
  '@keyframes pp-search-fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
};

/** Four placeholder rows for the first load of a query; hidden from assistive tech. */
export function SearchSkeleton({ animate }: { animate: boolean }) {
  const { color } = tokens;
  const bar = (width: string, height: number, delay: number) => (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        width,
        height,
        borderRadius: radius.tag,
        backgroundColor: color.chipNeutral,
        ...(animate
          ? {
              '&::after': {
                content: '""',
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(90deg, transparent, ${tokens.color.surface}, transparent)`,
                opacity: 0.6,
                animation: `pp-search-shimmer 1.4s ${delay}ms infinite`,
              },
            }
          : {}),
      }}
    />
  );
  return (
    <Box aria-hidden="true" sx={shimmer}>
      {TITLE_WIDTHS.map((width, index) => (
        <Box
          key={width}
          data-testid="search-skeleton"
          data-shimmer={animate ? 'on' : 'off'}
          sx={{
            minHeight: 58,
            p: '9px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            borderTop: index === 0 ? 0 : `1px solid ${color.divider}`,
            ...(animate
              ? {
                  opacity: 0,
                  animation: `pp-search-fade-in 250ms ${index * 50}ms forwards`,
                }
              : {}),
          }}
        >
          <Box
            sx={{
              flexShrink: 0,
              width: 38,
              height: 38,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Box
              sx={{
                width: 30,
                height: 30,
                borderRadius: nestedRadius(radius.control, 6),
                backgroundColor: color.chipNeutral,
              }}
            />
          </Box>
          <Box sx={{ flex: 1, display: 'grid', gap: '7px' }}>
            {bar(width, 14, index * 120)}
            {bar(META_WIDTHS[index], 11, index * 120)}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
