import {
  Box,
  color,
  Gator,
  radius,
  palette,
  Typography,
} from '@pocket-pantry/ui';
import { useGatorAlt } from '@/lib/useGatorAlt';

type Props = {
  /** The strong first line, e.g. how many things Gator read. */
  title: string;
  /** The line under it: what to check, or that there is nothing to. */
  detail: string;
  testId?: string;
};

/** The accent banner where a happy Gator says it read everything: shared by the Scan Review and the Setup Review. */
export function GatorBanner({ title, detail, testId }: Props) {
  const gatorAlt = useGatorAlt();
  return (
    <Box
      role="status"
      data-testid={testId}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        mb: 1.5,
        py: 1.25,
        pr: 2,
        pl: 0.25,
        borderRadius: radius.card,
        backgroundColor: palette('pp-accent'),
        color: color.accentInk,
      }}
    >
      <Box sx={{ flex: 'none' }}>
        <Gator mood="happy" size={88} alt={gatorAlt('happy')} />
      </Box>
      <Typography sx={{ fontSize: 15, lineHeight: 1.4 }}>
        <strong>{title}</strong>
        <br />
        {detail}
      </Typography>
    </Box>
  );
}
