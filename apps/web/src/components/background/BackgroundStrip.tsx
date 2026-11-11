import {
  Box,
  Button,
  Gator,
  gutterLeft,
  gutterRight,
  palette,
  radius,
  shadow,
  useToastFloor,
  visuallyHidden,
} from '@pocket-pantry/ui';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { pillBottom, VOICE_LAYER } from '../../lib/voicePlacement';
import { VOICE_PILL_ATTRIBUTE } from '../../lib/voiceFocus';
import { enter } from '../voice/enter';
import { useVoiceHost } from '../voice/VoiceHost';
import { countBackground, type BackgroundItem } from './backgroundItem';

const oneLine = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

/** The strip's top edge as a distance from the bottom of the screen, px; `null` until measured. */
function useTopEdge() {
  // Held in state: the portal's children remount when the host changes, so follow the live node.
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [edge, setEdge] = useState<number | null>(null);
  useEffect(() => {
    if (!el) return;
    // From layout (height plus the `bottom` offset), not the painted box: the entrance transform
    // would shift a bounding rect for the first 200 ms and nothing re-measures after it.
    const measure = () => {
      // A node the portal has already replaced has no layout; wait for its successor.
      if (!el.isConnected) return;
      setEdge(
        Math.round(
          el.offsetHeight + (parseFloat(getComputedStyle(el).bottom) || 0),
        ),
      );
    };
    measure();
    window.addEventListener('resize', measure);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measure);
    // Border box: a failed strip's thicker border grows it without changing the content box.
    observer?.observe(el, { box: 'border-box' });
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [el]);
  return { ref: setEl, edge };
}

/**
 * The background strip, where the status pill was: what is being read in the background. One item
 * shows its own title and detail; several show "N in the background" with how many are reading,
 * ready and failed. The button is Review when the strip holds one item that can be opened, or exactly
 * one item is ready (it opens that item), else Open ("Open N" when several are ready), which opens the sheet. Once everything is ready it turns
 * into the dark pill with a happy Gator. A failure outlines it in the warning colour; `alert` is
 * announced assertively (the rest of the strip is a polite status).
 */
export function BackgroundStrip({
  items,
  alert,
  openSheet,
}: {
  items: BackgroundItem[];
  /** The one-time announcement of a failure, while it is up. */
  alert?: string;
  openSheet: () => void;
}) {
  const { t } = useTranslation('background');
  const host = useVoiceHost();
  // Toasts sit above the strip while it is up.
  const { ref, edge } = useTopEdge();
  useToastFloor(edge);
  const { reading, ready, failed, total } = countBackground(items);
  const busy = reading > 0;
  const allReady = total > 0 && ready === total;
  const single = items.length === 1 ? items[0] : undefined;
  const onlyReady =
    ready === 1 ? items.find((i) => i.status === 'ready') : undefined;

  const title = single ? single.title : t('title', { count: total });
  const detail = single
    ? single.detail
    : [
        busy ? t('reading', { count: reading }) : null,
        ready > 0 ? t('ready', { count: ready }) : null,
        failed > 0 ? t('failed', { count: failed }) : null,
      ]
        .filter(Boolean)
        .join(' · ');
  const art = single?.art ?? null;

  // A lone item that can be opened (the Scan Session, whatever its status) or the one ready item opens itself.
  const lead = single?.open ? single : onlyReady;
  const open = () => {
    if (lead?.open) lead.open.onClick();
    else openSheet();
  };

  return createPortal(
    <Box
      ref={ref}
      {...{ [VOICE_PILL_ATTRIBUTE]: '' }}
      onClick={open}
      sx={{
        position: 'fixed',
        left: gutterLeft(16),
        right: gutterRight(16),
        bottom: pillBottom,
        mx: 'auto',
        maxWidth: 420,
        zIndex: VOICE_LAYER.card,
        display: 'flex',
        alignItems: 'center',
        gap: '11px',
        p: '11px 12px 11px 14px',
        // Everything ready keeps the dark pill.
        backgroundColor: allReady ? 'text.primary' : 'pp.cardBg',
        color: allReady ? 'background.paper' : 'text.primary',
        borderRadius: radius.control,
        boxShadow: shadow.float,
        cursor: 'pointer',
        border: failed > 0 ? `2px solid ${palette('warning-main')}` : 'none',
        ...enter,
      }}
    >
      <Box
        aria-hidden
        sx={{ flex: 'none', display: 'flex', alignItems: 'center' }}
      >
        {art && !allReady ? (
          art
        ) : (
          <Gator
            mood={busy ? 'thinking' : 'happy'}
            size={44}
            loop={busy ? 'signature' : 'idle'}
            entrance={false}
            decorative
          />
        )}
      </Box>
      <Box role="status" sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ fontSize: 14, fontWeight: 600, ...oneLine }}>{title}</Box>
        <Box
          sx={{
            fontSize: 12,
            color: allReady ? 'inherit' : 'text.secondary',
            opacity: allReady ? 0.75 : 1,
            ...oneLine,
          }}
        >
          {detail}
        </Box>
      </Box>
      {alert ? (
        <Box role="alert" sx={visuallyHidden}>
          {alert}
        </Box>
      ) : null}
      <Button
        variant="primary"
        size="sm"
        shape="pill"
        onClick={(event) => {
          event.stopPropagation();
          open();
        }}
      >
        {lead?.open
          ? t('review')
          : ready > 1
            ? t('openCount', { count: ready })
            : t('open')}
      </Button>
    </Box>,
    host,
  );
}
