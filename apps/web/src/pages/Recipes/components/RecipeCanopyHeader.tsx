import {
  BranchIcon,
  Box,
  CompassIcon,
  HeaderButton,
  PeopleIcon,
  ShoppingIcon,
  canopy,
  displayType,
  focusRing,
  radius,
} from '@pocket-pantry/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { recipeHref } from '../../../lib/recipeHref';
import {
  totalMinutes,
  type PantryMatch,
  type RecipeDetail,
} from '../../../lib/recipes';
import { linesToAdd } from './PantryStatus';

const CAPS = {
  fontSize: 11,
  fontWeight: 700,
  lineHeight: 1,
  letterSpacing: '.1em',
  textTransform: 'uppercase',
} as const;

export type RecipeCanopyHeaderProps = {
  recipe: RecipeDetail;
  /** The Servings picked. */
  servings: number;
  /** A Catalog Recipe's preview: its own eyebrow, and the "In your Recipes" tag once added. */
  preview?: { inFamily: boolean };
  match: PantryMatch | undefined;
  /** The answer is for another Servings; wait for the current one. */
  stale: boolean;
  adding: boolean;
  /** The missing lines were added at the Servings picked. */
  added: boolean;
  onAddMissing: () => void;
};

/**
 * The Recipe's block in the Canopy header (Canopy handoff section 7.5): the lineage row (the Base
 * it is a Variant of, the Family tag), the title, the facts between two rules, and Pantry
 * coverage with the gold "Add missing" button, which moved here from under the ingredient list.
 */
export function RecipeCanopyHeader({
  recipe,
  servings,
  preview,
  match,
  stale,
  adding,
  added,
  onAddMissing,
}: RecipeCanopyHeaderProps) {
  const { t } = useTranslation('recipes');
  const minutes = totalMinutes(recipe);
  const facts: { label: string; value: ReactNode }[] = [
    ...(minutes === null
      ? []
      : [{ label: t('facts.time'), value: t('minutes', { count: minutes }) }]),
    { label: t('facts.serves'), value: servings },
    ...(recipe.difficulty
      ? [
          {
            label: t('facts.level'),
            value: t(`difficulty.${recipe.difficulty}`),
          },
        ]
      : []),
  ];
  const tag =
    preview === undefined
      ? recipe.owner === 'family'
        ? t('familyBadge')
        : null
      : preview.inFamily
        ? t('preview.inFamily')
        : null;
  const lineage = recipe.base ? (
    <Box
      component={Link}
      to={recipeHref({ ...recipe.base, owner: 'catalog' })}
      sx={{
        ...CAPS,
        minHeight: 44,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        minWidth: 0,
        color: canopy.gold,
        textDecoration: 'none',
        borderRadius: '8px',
        ...focusRing,
      }}
    >
      <BranchIcon size={14} />
      <span>{t('variantOf', { base: recipe.base.title })}</span>
    </Box>
  ) : preview ? (
    <Box
      sx={{
        ...CAPS,
        minHeight: 44,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        color: canopy.gold,
      }}
    >
      <CompassIcon size={14} />
      {t('preview.eyebrow')}
    </Box>
  ) : null;

  // Pantry coverage counts the lines "Add missing" looks at: the required ones.
  const required = (match?.lines ?? []).filter((line) => !line.optional);
  const toAdd = linesToAdd(match).length;
  const covered = required.length - toAdd;

  return (
    <Box sx={{ mt: '4px' }}>
      {lineage || tag ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
          }}
        >
          {lineage ?? <span />}
          {tag ? (
            <Box
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                height: 22,
                px: '7px',
                flexShrink: 0,
                borderRadius: radius.tag,
                bgcolor: canopy.goldTint,
                border: `1px solid ${canopy.goldLine}`,
                color: canopy.gold,
                fontSize: 11,
                fontWeight: 700,
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}
            >
              <PeopleIcon size={12} />
              {tag}
            </Box>
          ) : null}
        </Box>
      ) : null}
      <Box
        component="h1"
        sx={{
          ...displayType,
          m: '-2px 0 0',
          fontSize: 31,
          fontWeight: 800,
          lineHeight: 1.05,
          letterSpacing: '-0.04em',
          overflowWrap: 'anywhere',
        }}
      >
        {recipe.title}
      </Box>
      <Box
        component="dl"
        sx={{
          display: 'flex',
          m: '16px 0 0',
          py: '12px',
          borderTop: `1px solid ${canopy.chipLine}`,
          borderBottom: `1px solid ${canopy.chipLine}`,
        }}
      >
        {facts.map(({ label, value }, i) => (
          <Box
            key={label}
            sx={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '7px',
              ...(i > 0
                ? { pl: '14px', borderLeft: `1px solid ${canopy.chipLine}` }
                : {}),
            }}
          >
            <Box
              component="dt"
              sx={{ ...CAPS, fontSize: 10.5, color: canopy.muted }}
            >
              {label}
            </Box>
            <Box
              component="dd"
              sx={{
                m: 0,
                ...displayType,
                fontSize: 16,
                lineHeight: 1,
                letterSpacing: '-0.02em',
                whiteSpace: 'nowrap',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {value}
            </Box>
          </Box>
        ))}
      </Box>
      {match ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            mt: '14px',
          }}
        >
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '9px',
            }}
          >
            <Box sx={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1 }}>
              <Box
                component="span"
                sx={{
                  ...displayType,
                  fontSize: 15,
                  fontWeight: 800,
                  color: canopy.gold,
                }}
              >
                {t('pantry.coverageCount', { covered, total: required.length })}
              </Box>{' '}
              {t('pantry.coverageLabel')}
            </Box>
            <Box
              aria-hidden
              sx={{
                height: '5px',
                borderRadius: radius.tag,
                bgcolor: canopy.progressTrack,
                boxShadow: canopy.progressShadow,
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  width: `${required.length === 0 ? 100 : (covered / required.length) * 100}%`,
                  height: '100%',
                  borderRadius: radius.tag,
                  bgcolor: canopy.gold,
                }}
              />
            </Box>
          </Box>
          {toAdd > 0 || added ? (
            <HeaderButton
              tone="key"
              icon={<ShoppingIcon size={17} />}
              disabled={adding || stale || added}
              onClick={onAddMissing}
              aria-label={
                added
                  ? t('pantry.addedList')
                  : t('pantry.addMissing', { count: toAdd })
              }
            >
              {added
                ? t('pantry.addedList')
                : t('pantry.addMissingShort', { count: toAdd })}
            </HeaderButton>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}
