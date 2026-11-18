import {
  Box,
  CloseIcon,
  FlashIcon,
  InfoIcon,
  Typography,
  visuallyHidden,
  palette,
} from '@pocket-pantry/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TOP_BAR_HEIGHT } from '@/lib/scanGuides';
import { glassBar, glassFocusRing, translucent } from '../glass';
import { insetLeft, insetRight, insetTop } from '../CameraFrame/CameraFrame';

const iconButton = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 40,
  height: 40,
  p: 0,
  borderRadius: '50%',
  border: 0,
  backgroundColor: 'transparent',
  color: palette('text-primary'),
  cursor: 'pointer',
  '&:active': { backgroundColor: translucent(palette('text-primary'), 12) },
  '&:focus-visible': glassFocusRing,
};

type Props = {
  onClose: () => void;
  /** Present when the camera has a torch: the button is lit while it is on. */
  torch?: { on: boolean; onToggle: () => void };
  /** The Scan Language chip, or nothing. */
  language?: ReactNode;
  /** Opens the Info sheet; no Info button without it. */
  onInfo?: () => void;
  /** A visually hidden heading naming the screen. */
  heading?: string;
};

/**
 * The glass bar over the top of the camera feed (handoff 2): Close on the left; torch, the Scan
 * Language chip and Info on the right. Both camera hosts (the Scan page and the add-Batch camera)
 * mount it; each passes the right-hand controls it has.
 */
export function CameraTopBar({
  onClose,
  torch,
  language,
  onInfo,
  heading,
}: Props) {
  const { t } = useTranslation('scan');
  return (
    <Box
      data-testid="scan-top-bar"
      sx={{
        ...glassBar,
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        borderBottom: `1px solid ${translucent(palette('text-primary'), 6)}`,
        pt: insetTop,
        pl: insetLeft,
        pr: insetRight,
      }}
    >
      <Box
        sx={{
          height: TOP_BAR_HEIGHT,
          px: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Box
          component="button"
          type="button"
          aria-label={t('close')}
          onClick={onClose}
          sx={iconButton}
        >
          <CloseIcon size={22} strokeWidth={1.9} />
        </Box>
        {heading ? (
          <Typography component="h1" sx={visuallyHidden}>
            {heading}
          </Typography>
        ) : null}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {torch ? (
            <Box
              component="button"
              type="button"
              aria-label={t('torch')}
              aria-pressed={torch.on}
              onClick={torch.onToggle}
              sx={{
                ...iconButton,
                ...(torch.on && { color: palette('warning-main') }),
              }}
            >
              <FlashIcon
                size={22}
                strokeWidth={1.9}
                fill={torch.on ? 'currentColor' : 'none'}
              />
            </Box>
          ) : null}
          {language}
          {onInfo ? (
            <Box
              component="button"
              type="button"
              aria-label={t('info.label')}
              onClick={onInfo}
              sx={iconButton}
            >
              <InfoIcon size={22} strokeWidth={1.9} />
            </Box>
          ) : null}
        </Box>
      </Box>
    </Box>
  );
}
