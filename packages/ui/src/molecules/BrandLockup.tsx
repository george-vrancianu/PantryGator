import { Box } from '../atoms/Layout';
import { Typography } from '../atoms/Typography';
import { Gator } from '../gator/Gator';

export type BrandLockupProps = {
  /** The app's name, worded by the app (this package has no i18n). */
  name: string;
  /** Gator hops in on mount. Off where the lockup is an inline header (Languages). */
  entrance?: boolean;
};

/** The app icon with the app's name beside it, so the logo never stands alone. */
export function BrandLockup({ name, entrance = true }: BrandLockupProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <Gator
        mood="app-icon"
        size={44}
        loop="idle"
        entrance={entrance}
        decorative
      />
      {/* Not a heading, and smaller than one: the screen's own title is its heading. */}
      <Typography variant="h4" component="p">
        {name}
      </Typography>
    </Box>
  );
}
