import {
  BranchIcon,
  Box,
  Button,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  IconButton,
  IngredientIcon,
  PlusIcon,
  RecipesIcon,
  Sheet,
  displayType,
  radius,
  tokens,
  useToast,
  visuallyHidden,
} from '@pocket-pantry/ui';
import { RowTags } from './RowTags';
import { TagChips } from './TagChips';
import { useEffect, useRef, type ReactNode } from 'react';
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
  const closeButton = useRef<HTMLButtonElement>(null);
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

  return (
    <Sheet
      open={open}
      onClose={onClose}
      initialFocus={closeButton}
      label={recipe.title}
      size="content"
      header={
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            px: '20px',
            pt: '12px',
          }}
        >
          <Cluster ids={lines.map((line) => line.ingredientId)} size={58} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box
              sx={{
                fontSize: 11.5,
                fontWeight: 700,
                letterSpacing: '.05em',
                textTransform: 'uppercase',
                color: tokens.color.accent,
              }}
            >
              {recipe.base ? (
                <Box
                  component="span"
                  sx={{ display: 'inline-flex', gap: '4px' }}
                >
                  <BranchIcon size={13} />
                  {t('variantOf', { base: recipe.base.title })}
                </Box>
              ) : (
                t('quickView.eyebrow')
              )}
            </Box>
            <Box sx={{ ...displayType, fontSize: 23, lineHeight: 1.15 }}>
              {recipe.title}
            </Box>
          </Box>
          <IconButton
            ref={closeButton}
            label={t('quickView.close')}
            tone="plain"
            size={40}
            onClick={onClose}
          >
            <CloseIcon size={20} />
          </IconButton>
        </Box>
      }
    >
      <Box sx={{ px: '20px', pt: '14px', pb: '28px' }}>
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
                    borderRadius: radius.pill,
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
        <Button
          variant="secondary"
          fullWidth
          onClick={() => openPreview(recipe.id)}
          startIcon={
            <Box sx={{ display: 'flex', color: tokens.color.accent }}>
              <RecipesIcon size={18} />
            </Box>
          }
          sx={{ mt: '16px', height: 46, justifyContent: 'center' }}
        >
          {t('quickView.seeWhole')}
          <ChevronRightIcon size={16} />
        </Button>
        <Box sx={{ mt: '14px', display: 'grid', gap: '8px' }}>
          {state.status === 'added' ? (
            <Button
              variant="tonal"
              fullWidth
              href={familyRecipeHref(state.copyId)}
              startIcon={<CheckIcon size={18} />}
              sx={{ height: 48 }}
            >
              {t('quickView.openCopy')}
            </Button>
          ) : (
            <Button
              variant="primary"
              fullWidth
              {...(state.status === 'adding'
                ? { 'aria-disabled': true, 'aria-busy': true }
                : { onClick: () => onAdd(recipe) })}
              startIcon={<PlusIcon size={18} />}
              sx={{ height: 48 }}
            >
              {t('quickView.add')}
            </Button>
          )}
          <Button
            variant="secondary"
            fullWidth
            href={`/recipes/${recipe.id}/variant/new`}
            startIcon={<BranchIcon size={18} />}
            sx={{ height: 48 }}
          >
            {t('family.makeVariant')}
          </Button>
        </Box>
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
