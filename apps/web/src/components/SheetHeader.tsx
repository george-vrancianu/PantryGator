import {
  BackIcon,
  Box,
  CloseIcon,
  displayType,
  IconButton,
  Typography,
} from '@pocket-pantry/ui';
import type { ReactNode, Ref } from 'react';

export type SheetHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  /** Given, the title takes focus programmatically (a step change moves focus here). */
  titleRef?: Ref<HTMLHeadingElement>;
  onBack?: () => void;
  onClose: () => void;
  /** Needed only with `onBack`. */
  backLabel?: string;
  closeLabel: string;
  /** `roomy` is the larger title and wider padding of the Family catalog sheets. */
  size?: 'compact' | 'roomy';
};

/** A sheet's header (Settings, Admin): an optional back button, a title with a context line, and a close button. */
export function SheetHeader({
  title,
  subtitle,
  titleRef,
  onBack,
  onClose,
  backLabel,
  closeLabel,
  size = 'compact',
}: SheetHeaderProps) {
  const roomy = size === 'roomy';
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 2,
        pt: 1.5,
        pb: 1,
      }}
    >
      {onBack ? (
        <IconButton
          label={backLabel ?? ''}
          tone="well"
          size={44}
          onClick={onBack}
        >
          <BackIcon size={19} />
        </IconButton>
      ) : null}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          ref={titleRef}
          component="h2"
          tabIndex={titleRef ? -1 : undefined}
          sx={{
            ...displayType,
            fontSize: roomy ? 25 : 22,
            fontWeight: 800,
            letterSpacing: '-0.04em',
            lineHeight: 1.1,
            overflowWrap: 'anywhere',
            outline: 'none',
          }}
        >
          {title}
        </Typography>
        {subtitle ? (
          <Typography component="div" variant="meta" color="text.secondary">
            {subtitle}
          </Typography>
        ) : null}
      </Box>
      <IconButton label={closeLabel} tone="well" size={44} onClick={onClose}>
        <CloseIcon size={19} />
      </IconButton>
    </Box>
  );
}
