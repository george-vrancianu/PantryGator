import {
  Box,
  radius,
  SAFE_LEFT,
  SAFE_RIGHT,
  shadow,
  Typography,
} from '@pocket-pantry/ui';

/** A cream card with a pointer at the bottom, aimed at the capsule below it. */
export function SetupCallout({
  title,
  body,
  bottom,
  width = 'fit-content',
  role,
  zIndex,
}: {
  title: string;
  body: string;
  /** CSS `bottom`: where the pointer's card sits above the capsule. */
  bottom: string | { xs: string; md: string };
  /** CSS `width`; the default hugs the text. */
  width?: number | string;
  /** Set to `status` for a callout that appears over a live page. */
  role?: 'status';
  zIndex?: number;
}) {
  return (
    <Box
      role={role}
      sx={{
        position: 'fixed',
        left: SAFE_LEFT,
        right: SAFE_RIGHT,
        bottom,
        mx: 'auto',
        width,
        zIndex,
        pointerEvents: 'none',
        maxWidth: `calc(100% - 32px - ${SAFE_LEFT} - ${SAFE_RIGHT})`,
        boxSizing: 'border-box',
        px: '14px',
        py: '10px',
        textAlign: 'center',
        borderRadius: radius.card,
        backgroundColor: 'pp.cardBg',
        color: 'text.primary',
        boxShadow: shadow.float,
        '&::after': {
          content: '""',
          position: 'absolute',
          left: '50%',
          bottom: -6,
          width: 12,
          height: 12,
          transform: 'translateX(-50%) rotate(45deg)',
          backgroundColor: 'pp.cardBg',
        },
      }}
    >
      <Typography sx={{ fontWeight: 700, fontSize: 15 }}>{title}</Typography>
      <Typography
        variant="meta"
        sx={{ display: 'block', color: 'text.secondary' }}
      >
        {body}
      </Typography>
    </Box>
  );
}
