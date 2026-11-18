import { Box, CloseIcon, Link, tokens, focusRing } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { useEmptyStateSearch } from '@/components/catalogSearch/emptyState/context';
import { IngredientTile } from '@/components/catalogSearch/emptyState/IngredientTile/IngredientTile';
import {
  MAX_TILES,
  TileSection,
} from '@/components/catalogSearch/emptyState/TileSection/TileSection';
import { useShortAgo } from '@/components/catalogSearch/emptyState/useShortAgo';
import { translateApiError } from '../../../../i18n/translateApiError';
import {
  goneInOrder,
  useDismissSuggestion,
  type GoneEntry,
  type Suggestion,
  type Suggestions,
} from '../../../../lib/suggestions';
import { useSheetToast } from './useSheetToast';

export type GoneTilesProps = {
  suggestions: Suggestions;
  /** Called just before the tile's Ingredient is selected through the search (the Suggestion is not dismissed), e.g. to carry a Staple's amount. */
  onPick?: (suggestion: Suggestion) => void;
};

/** "Gone from your Pantry": expired, then Used Up, then missing Staples, as tiles saying why and when. */
export function GoneTiles({ suggestions, onPick }: GoneTilesProps) {
  const search = useEmptyStateSearch();
  const { t } = useTranslation('shopping');
  const toast = useSheetToast();
  const dismiss = useDismissSuggestion();
  const ago = useShortAgo();
  const all = goneInOrder(suggestions);
  const entries = all.slice(0, MAX_TILES);
  if (!search) return null;

  const dismissTile = (suggestion: Suggestion) => {
    void dismiss.mutateAsync(suggestion.ingredientId).then(
      () => toast.show(t('suggestions.dismissed', { name: suggestion.name })),
      (error: unknown) => toast.show(translateApiError(t, error)),
    );
  };

  const tile = ({ suggestion, reason }: GoneEntry) => {
    const { name, since } = suggestion;
    const age = since === null ? '' : ago(since);
    const { color } = tokens;
    const why = {
      expired: {
        glyph: '◷',
        text: t('suggestions.expiredWhen', { when: age }),
        color: color.urgentFg,
      },
      usedUp: {
        glyph: '→',
        text: t('suggestions.usedUpWhen', { when: age }),
        color: color.muted,
      },
      staple: {
        glyph: '★',
        text: t('suggestions.stapleWhy'),
        color: color.soonIcon,
      },
    }[reason];
    const label = {
      expired: t('suggestions.goneLabelExpired', { name, when: age }),
      usedUp: t('suggestions.goneLabelUsedUp', { name, when: age }),
      staple: t('suggestions.goneLabelStaple', { name }),
    }[reason];
    return (
      <IngredientTile
        key={suggestion.ingredientId}
        ingredientId={suggestion.ingredientId}
        aisleId={suggestion.aisle?.id ?? null}
        name={name}
        why={why}
        label={label}
        onSelect={() => {
          onPick?.(suggestion);
          search.select(suggestion.ingredient);
        }}
        action={
          <Box
            component="button"
            type="button"
            aria-label={t('suggestions.dismiss', { name })}
            onClick={() => dismissTile(suggestion)}
            sx={{
              width: 44,
              height: 44,
              display: 'grid',
              placeItems: 'center',
              p: 0,
              color: color.muted,
              background: 'none',
              border: 0,
              cursor: 'pointer',
              '&:hover': { color: color.ink },
              ...focusRing,
            }}
          >
            <CloseIcon size={16} />
          </Box>
        }
      />
    );
  };
  return (
    <TileSection
      heading={t('suggestions.gone')}
      count={all.length > 0 ? all.length : undefined}
      none={t('suggestions.goneNone')}
      action={
        <Link
          href="/shopping/staples"
          sx={{
            height: 44,
            display: 'flex',
            alignItems: 'center',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 'normal',
            textTransform: 'none',
          }}
        >
          {t('suggestions.manage')}
        </Link>
      }
    >
      {entries.map(tile)}
    </TileSection>
  );
}
