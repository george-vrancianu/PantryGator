import {
  Box,
  displayType,
  Gator,
  Link,
  tokens,
  visuallyHidden,
} from '@pocket-pantry/ui';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { CookTonightCard } from '@/lib/cookTonight';
import { cookTonightPanelState } from '@/lib/cookTonightPanel';
import { useGatorAlt } from '@/lib/useGatorAlt';
import { useGatorTapLink } from '@/lib/useGatorTapLink';
import { EmptyPotPanel } from '@/components/gator/EmptyPotPanel/EmptyPotPanel';
import { GatorBubblePanel } from '@/components/gator/GatorBubblePanel/GatorBubblePanel';

/**
 * Gator's bubble panel for Cook Tonight, in the wide/tall Dashboard Widget:
 * one link in every state (see `cookTonightPanelState`). Pressing it plays Gator's Tap, then
 * navigates; with reduced motion it navigates at once. With `noRecipes` it is the empty-pot panel
 * instead (not a link) with three text links under it.
 */
export function CookTonightPanel({
  cards,
  noRecipes = false,
}: {
  cards: CookTonightCard[];
  /** The Family has no Recipes (see `hasNoFamilyRecipes`); only decide this once the Recipe list has loaded. */
  noRecipes?: boolean;
}) {
  const { t } = useTranslation('recipes');
  const gatorAlt = useGatorAlt();
  // The Recipes page hides the panel when the Family has no Recipes; the Dashboard Widget passes `noRecipes`.
  const state = cookTonightPanelState(cards, noRecipes, t);
  const { taps, onClick } = useGatorTapLink(state.to);
  const moodId = useId();
  if (state.kind === 'noRecipes') return <EmptyPot />;
  const { mood, to, lines } = state;
  const title = t('cookTonight.title');
  const [line, ...rest] = lines;
  const moodAlt = gatorAlt(mood);

  return (
    <GatorBubblePanel
      to={to}
      // Block children carry no spaces for a screen reader, so name the link explicitly.
      label={[title, ...lines].join(', ')}
      // The label overrides Gator's alt text, so his mood is the link's description instead.
      describedBy={moodId}
      onClick={onClick}
      gator={
        <Gator
          mood={mood}
          size={170}
          loop="signature"
          tapSignal={taps}
          alt={moodAlt}
        />
      }
    >
      <Box component="span" id={moodId} sx={visuallyHidden}>
        {moodAlt}
      </Box>
      <Box sx={{ ...displayType, fontSize: 18 }}>{title}</Box>
      <Box sx={{ fontWeight: 700, mt: '4px' }}>{line}</Box>
      {rest.map((text, i) => (
        <Box
          key={i}
          sx={{ fontSize: 13, mt: '2px', color: tokens.color.accentOnTint }}
        >
          {text}
        </Box>
      ))}
    </GatorBubblePanel>
  );
}

/** The empty-pot panel, then the three ways to get a first Recipe as small text links. */
function EmptyPot() {
  const { t } = useTranslation('recipes');
  const links = [
    { to: '/recipes/explore', label: t('emptyFamily.explore') },
    { to: '/recipes/from-link', label: t('emptyFamily.fromLink') },
    { to: '/recipes/new', label: t('family.newRecipe') },
  ];
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <EmptyPotPanel />
      <Box
        sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', px: '4px' }}
      >
        {links.map(({ to, label }) => (
          <Link key={to} href={to} underline="none" sx={{ fontSize: 14 }}>
            {label}
          </Link>
        ))}
      </Box>
    </Box>
  );
}
