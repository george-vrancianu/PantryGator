import {
  Box,
  ChevronRightIcon,
  IngredientIcon,
  Link,
  Sheet,
  displayType,
  radius,
  tokens,
  useToast,
  visuallyHidden,
} from '@pocket-pantry/ui';
import { RowTags } from './RowTags';
import { TagChips } from './TagChips';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { familyRecipeHref, recipeHref } from '../lib/recipeHref';
import type { AddState, AddableRecipe } from '../lib/addToFamily';
import type { CookTonightCard } from '../lib/cookTonight';
import {
  totalMinutes,
  useRecipe,
  useRecipePantryMatch,
  type RecipeListItem,
} from '../lib/recipes';
import { StatusPills } from './StatusPills';
import { AddToFamilyButton } from './AddToFamilyButton';

type Props = {
  /** The Recipe shown; keep passing it while the sheet closes, so the content stays through the slide. */
  recipe: RecipeListItem;
  open: boolean;
  onClose: () => void;
  card?: CookTonightCard | undefined;
  state: AddState;
  /** Adds a Catalog Recipe (the Recipe itself or one of its Variants). */
  onAdd: (recipe: AddableRecipe) => void;
  /** The add state of a Variant. */
  stateOf: (recipe: AddableRecipe) => AddState;
};

const labelSx = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: tokens.color.muted,
} as const;

/**
 * The Explore quick view (handoff section 4): a bottom sheet over Explore to decide on a Catalog
 * Recipe without leaving: facts, pills, Ingredients, its Catalog Variants, and the add / Make a
 * Variant / See the whole Recipe actions.
 */
export function QuickViewSheet({
  recipe,
  open,
  onClose,
  card,
  state,
  onAdd,
  stateOf,
}: Props) {
  const { t } = useTranslation('recipes');
  const navigate = useNavigate();
  const toast = useToast();
  // Opening the sheet hides any toast that is showing.
  useEffect(() => {
    if (open) toast.dismiss();
  }, [open, toast]);

  const detail = useRecipe(recipe.id, open).data;
  const match = useRecipePantryMatch(
    recipe.id,
    recipe.servings,
    open && detail !== undefined,
  ).data;
  const missing = new Set(
    (match?.lines ?? [])
      .filter((line) => line.status === 'missing' && !line.pantryBasic)
      .map((line) => line.lineId),
  );
  const lines = detail?.lines ?? [];
  const variants = (detail?.variants ?? []).filter(
    (variant) => variant.owner === 'catalog',
  );
  const minutes = totalMinutes(recipe);
  const facts = [
    {
      label: t('facts.time'),
      value: minutes === null ? '—' : t('minutes', { count: minutes }),
      wide: false,
    },
    { label: t('facts.serves'), value: String(recipe.servings), wide: false },
    {
      label: t('facts.level'),
      value: recipe.difficulty ? t(`difficulty.${recipe.difficulty}`) : '—',
      wide: false,
    },
  ];
  const added = state.status !== 'none';
  const openPreview = (id: string) => {
    onClose();
    navigate(recipeHref({ id, owner: 'catalog' }), {
      state: { fromExplore: true },
    });
  };

  const openCopy = state.status === 'added';
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={recipe.title}
      subtitle={
        recipe.base
          ? t('variantOf', { base: recipe.base.title })
          : t('quickView.eyebrow')
      }
      size="content"
      primary={
        openCopy
          ? {
              label: t('quickView.openCopy'),
              onClick: () => navigate(familyRecipeHref(state.copyId)),
            }
          : {
              label: t('quickView.add'),
              pending: state.status === 'adding',
              onClick: () => onAdd(recipe),
            }
      }
      secondary={{
        label: t('family.makeVariant'),
        onClick: () => navigate(`/recipes/${recipe.id}/variant/new`),
      }}
    >
      <Box sx={{ px: '20px', pt: '14px', pb: '28px' }}>
        <Box sx={{ mb: '12px' }}>
          <Cluster ids={lines.map((line) => line.ingredientId)} size={58} />
        </Box>
        <Box
          component="dl"
          sx={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '8px',
            m: 0,
          }}
        >
          {facts.map((fact) => (
            <Box
              key={fact.label}
              sx={{
                bgcolor: tokens.color.surface,
                border: `1px solid ${tokens.color.line}`,
                borderRadius: radius.control,
                px: '6px',
                py: '8px',
                textAlign: 'center',
                minWidth: 0,
              }}
            >
              <Box
                component="dt"
                sx={{ ...labelSx, fontSize: 10, letterSpacing: '.05em' }}
              >
                {fact.label}
              </Box>
              <Box
                component="dd"
                sx={{
                  m: 0,
                  mt: '2px',
                  ...displayType,
                  fontSize: fact.wide ? 13 : 15,
                  lineHeight: 1.2,
                }}
              >
                {fact.value}
              </Box>
            </Box>
          ))}
        </Box>
        {recipe.tags.length > 0 ? (
          <Box sx={{ mt: '10px' }}>
            <TagChips tags={recipe.tags} />
          </Box>
        ) : null}
        {card || recipe.allergyWarning ? (
          <StatusPills
            recipeId={recipe.id}
            card={card}
            warning={recipe.allergyWarning}
          />
        ) : null}
        {lines.length > 0 ? (
          <Box component="section" sx={{ mt: '16px' }}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                mb: '8px',
                ...labelSx,
              }}
            >
              <Box component="h3" sx={{ m: 0, font: 'inherit' }}>
                {t('sections.ingredients')}
              </Box>
              <span>{lines.length}</span>
            </Box>
            <Box
              component="ul"
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
                listStyle: 'none',
                m: 0,
                p: 0,
              }}
            >
              {lines.map((line) => (
                <Box
                  component="li"
                  key={line.id}
                  data-missing={missing.has(line.id) ? '' : undefined}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    height: 30,
                    pl: '4px',
                    pr: '10px',
                    borderRadius: radius.chip,
                    bgcolor: tokens.color.surface,
                    border: missing.has(line.id)
                      ? `1px dashed ${tokens.color.soonFg}`
                      : `1px solid ${tokens.color.line}`,
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}
                >
                  <IngredientIcon ingredientId={line.ingredientId} size={22} />
                  {line.ingredientName}
                  {missing.has(line.id) ? (
                    <Box component="span" sx={visuallyHidden}>
                      {t('quickView.missing')}
                    </Box>
                  ) : null}
                </Box>
              ))}
            </Box>
          </Box>
        ) : null}
        {variants.length > 0 ? (
          <Box component="section" sx={{ mt: '16px' }}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                mb: '8px',
                ...labelSx,
              }}
            >
              <Box component="h3" sx={{ m: 0, font: 'inherit' }}>
                {t('sections.variants')}
              </Box>
              <span>{variants.length}</span>
            </Box>
            <Box
              component="ul"
              sx={{
                listStyle: 'none',
                m: 0,
                p: 0,
                bgcolor: tokens.color.surface,
                borderRadius: radius.card,
                border: `1px solid ${tokens.color.line}`,
              }}
            >
              {variants.map((variant) => (
                <Box
                  component="li"
                  key={variant.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    minHeight: 58,
                    pr: '10px',
                    '& + &': { borderTop: `1px solid ${tokens.color.line}` },
                  }}
                >
                  <Box
                    component="button"
                    type="button"
                    onClick={() => openPreview(variant.id)}
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      p: '8px 0 8px 10px',
                      border: 0,
                      bgcolor: 'transparent',
                      font: 'inherit',
                      color: tokens.color.ink,
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <Cluster ids={[]} size={40} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ fontSize: 14.5, fontWeight: 700 }}>
                        {variant.title}
                      </Box>
                      <Box
                        sx={{
                          fontSize: 12.5,
                          color: tokens.color.muted,
                        }}
                      >
                        <RowTags tags={variant.tags} />
                      </Box>
                    </Box>
                  </Box>
                  <AddToFamilyButton
                    title={variant.title}
                    state={stateOf(variant)}
                    onAdd={() => onAdd(variant)}
                  />
                </Box>
              ))}
            </Box>
          </Box>
        ) : null}
        <Link
          href={recipeHref({ id: recipe.id, owner: 'catalog' })}
          onClick={(event) => {
            // Modified and middle clicks keep the link's own behaviour.
            if (
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            openPreview(recipe.id);
          }}
          sx={{
            mt: '16px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          {t('quickView.seeWhole')}
          <ChevronRightIcon size={16} />
        </Link>
        <Box
          sx={{
            mt: '10px',
            fontSize: 12.5,
            color: tokens.color.muted,
            textAlign: 'center',
          }}
        >
          {added ? t('quickView.explainAdded') : t('quickView.explain')}
        </Box>
      </Box>
    </Sheet>
  );
}

/** The Recipe's icon tile: up to four of its Ingredient icons. */
function Cluster({
  ids,
  size,
}: {
  ids: (string | null)[];
  size: number;
}): ReactNode {
  const icons = (ids.length > 0 ? ids : [null]).slice(0, 4);
  const inner = size >= 50 ? 22 : 16;
  return (
    <Box
      aria-hidden
      sx={{
        flexShrink: 0,
        width: size,
        height: size,
        display: 'grid',
        gridTemplateColumns: icons.length > 1 ? '1fr 1fr' : '1fr',
        placeItems: 'center',
        borderRadius: radius.control,
        bgcolor: tokens.color.accentTint,
        color: tokens.color.accentOnTint,
        overflow: 'hidden',
      }}
    >
      {icons.map((id, index) => (
        <IngredientIcon key={index} ingredientId={id} size={inner} />
      ))}
    </Box>
  );
}
