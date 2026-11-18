import { Typography, tokens } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import type { CameraMode } from '@/lib/cameraMode';

type Props = {
  /** What the Scan read for the line; renders nothing when null. */
  text: string | null;
  mode: CameraMode;
  /** A span for running inside a line of text, rather than a line of its own. */
  inline?: boolean;
};

/** The text the Scan actually read, one muted line that ellipsises, so a wrong Match is easy to spot. */
export function SourceText({ text, mode, inline }: Props) {
  const { t } = useTranslation('review');
  if (text === null) return null;
  const label = t(mode === 'receipt' ? 'row.receiptPrefix' : 'row.readPrefix', {
    text,
  });
  const sx = { fontSize: 12, color: tokens.color.muted };
  if (inline)
    return (
      <Typography component="span" title={text} sx={sx}>
        {label}
      </Typography>
    );
  return (
    <Typography noWrap title={text} sx={sx}>
      {label}
    </Typography>
  );
}
