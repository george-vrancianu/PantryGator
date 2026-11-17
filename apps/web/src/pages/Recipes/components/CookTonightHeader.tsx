import {
  ArrowLeftIcon,
  Box,
  Gator,
  canopy,
  displayType,
  canopyFocusRing,
  radius,
  visuallyHidden,
} from '@pocket-pantry/ui';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { CookTonightCard } from '../../../lib/cookTonight';
import { cookTonightPanelState } from '../../../lib/cookTonightPanel';
import { useGatorAlt } from '../../../lib/useGatorAlt';
import { useGatorTapLink } from '../../../lib/useGatorTapLink';

/** The block's height, kept while the Recipes and Cook Tonight answers load so the header does not jump. */
const BLOCK_HEIGHT = 139;

/**
 * Cook tonight in the Canopy header (Canopy handoff section 7.4): the label, what Gator says, a gold
 * "See them" and chef Gator at the right edge, cut by the sheet. The whole block is one link (see
 * `cookTonightPanelState`); pressing it plays Gator's Tap, then navigates.
 */
export function CookTonightHeader({ cards }: { cards: CookTonightCard[] }) {
  const { t } = useTranslation('recipes');
  const gatorAlt = useGatorAlt();
  const state = cookTonightPanelState(cards, false, t);
  const { taps, onClick } = useGatorTapLink(state.to);
  const moodId = useId();
  if (state.kind === 'noRecipes') return null;
  const title = t('cookTonight.title');
  const [line, ...rest] = state.lines;
  // Nothing to cook from the Pantry: its second line is the way on, so it is the gold link text.
  const pantry = state.kind === 'nothing';
  const lines = pantry ? [] : rest;
  const action = pantry ? rest[0] : t('cookTonight.seeThem');
  const moodAlt = gatorAlt(state.mood);

  return (
    <Box sx={{ position: 'relative', mt: '20px', minHeight: BLOCK_HEIGHT }}>
      <Box
        component={Link}
        to={state.to}
        // Block children carry no spaces for a screen reader, so name the link explicitly.
        aria-label={[title, ...state.lines, ...(pantry ? [] : [action])].join(
          ', ',
        )}
        aria-describedby={moodId}
        onClick={onClick}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: '9px',
          maxWidth: 196,
          color: 'inherit',
          textDecoration: 'none',
          borderRadius: radius.btn,
          ...canopyFocusRing,
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            // Past the header's gutter, so he stands at the screen's edge.
            right: { xs: -16, md: -48 },
            top: 4,
          }}
        >
          <Gator
            mood={state.mood}
            size={166}
            loop="signature"
            tapSignal={taps}
            alt={moodAlt}
          />
        </Box>
        <Box component="span" id={moodId} sx={visuallyHidden}>
          {moodAlt}
        </Box>
        <Box
          component="span"
          sx={{
            fontSize: 11,
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            color: canopy.gold,
          }}
        >
          {title}
        </Box>
        <Box
          component="span"
          sx={{
            ...displayType,
            fontSize: 22,
            lineHeight: 1.12,
            letterSpacing: '-0.03em',
          }}
        >
          {line}
        </Box>
        {lines.map((text) => (
          <Box
            key={text}
            component="span"
            sx={{ fontSize: 13, fontWeight: 500, color: canopy.muted }}
          >
            {text}
          </Box>
        ))}
        <Box
          component="span"
          aria-hidden
          sx={{
            minHeight: 44,
            mt: '-4px',
            alignSelf: 'flex-start',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: 13,
            fontWeight: 700,
            color: canopy.gold,
          }}
        >
          {action}
          <Box
            component="span"
            sx={{ display: 'flex', transform: 'rotate(180deg)' }}
          >
            <ArrowLeftIcon size={15} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

/** Keeps the header's height while the answers load. */
export function CookTonightHeaderPlaceholder() {
  return <Box aria-hidden sx={{ mt: '20px', height: BLOCK_HEIGHT }} />;
}
