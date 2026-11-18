import {
  Box,
  Link,
  Stack,
  Typography,
  tokens,
  radius,
} from '@pocket-pantry/ui';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  DiffEntry,
  PantryMatch,
  RecipeDetail,
  RecipeDetailLine,
  RecipeVariantItem,
} from '@/lib/recipes';
import type { AddState } from '@/lib/addToFamily';
import { AddToFamilyButton } from '@/components/recipe/AddToFamilyButton/AddToFamilyButton';
import { recipeHref } from '@/lib/recipeHref';
import { GuidanceSection } from './GuidanceSection/GuidanceSection';
import {
  IngredientList,
  lineAmount,
  type LineAllergy,
} from './IngredientList/IngredientList';
import { OwnerBadge } from '@/components/recipe/OwnerBadge/OwnerBadge';
import { RowTags } from '@/components/recipe/RowTags/RowTags';
import {
  AddMissingNotes,
  PantryHeading,
} from '@/components/recipe/PantryStatus/PantryStatus';
import { Section } from './Section/Section';
import { ServingsStepper } from '@/components/recipe/Servings/Servings';
import { StepList, TipCallout } from './StepList/StepList';

/** What a Catalog Recipe's preview adds to its sections: its Variants carry add buttons and open previews. */
export type PreviewSectionProps = {
  stateOf: (variant: RecipeVariantItem) => AddState;
  onAdd: (variant: RecipeVariantItem) => void;
  /** Variant previews opened from here keep counting toward Explore's Back badge. */
  fromExplore: boolean;
};

export type SectionProps = {
  /** Set on a Catalog Recipe's preview. */
  preview?: PreviewSectionProps | undefined;
  recipe: RecipeDetail;
  /** The Servings picked; the Recipe's own until the Member steps it. */
  servings: number;
  onServingsChange: (servings: number) => void;
  /** The Pantry match at `servings`; undefined until the first answer. */
  match: PantryMatch | undefined;
  /** The match shown is not for the Servings picked yet. */
  stale: boolean;
  /** Any add to the Shopping List is in flight, bulk or per line. */
  adding: boolean;
  /** Why the last bulk add failed. */
  addError: string | null;
  /** What the per-line add controls need. */
  addLine: {
    /** Adds one line at the Servings picked; `onAdded` or `onFailed` runs with the outcome. */
    onAdd: (
      line: RecipeDetailLine,
      done: { onAdded: () => void; onFailed: () => void },
    ) => void;
    /** Lines added by hand at the Servings picked. */
    handAddedIds: ReadonlySet<string>;
    /** Why the last per-line add failed. */
    error: string | null;
  };
};

function IngredientsSection({
  recipe,
  servings,
  onServingsChange,
  match,
  stale,
  adding,
  addError,
  addLine,
}: SectionProps) {
  const { t } = useTranslation('recipes');
  // One row at a time; the section unmounts with its tab, so a tab switch clears both.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const select = (lineId: string | null) => {
    setSelectedId(lineId);
    setAddedId(null);
    setErrorId(null);
  };
  const byLine = new Map(match?.lines.map((line) => [line.lineId, line]));
  // The match carries quantities scaled to its Servings; the Recipe's own are for the first load.
  const lines = recipe.lines.map((line) => {
    const scaled = byLine.get(line.id);
    return scaled
      ? { ...line, quantity: scaled.quantity, unit: scaled.unit }
      : line;
  });
  const allergiesByLine = new Map<string, LineAllergy[]>();
  for (const entry of recipe.allergyWarning?.entries ?? []) {
    for (const { lineId, severity } of entry.lines) {
      const marked = allergiesByLine.get(lineId) ?? [];
      // Several people can share an Allergen; a line is marked once per Allergen.
      if (marked.some((m) => m.allergen.id === entry.allergen.id)) continue;
      allergiesByLine.set(lineId, [
        ...marked,
        { allergen: entry.allergen, severity },
      ]);
    }
  }
  return (
    <Section title={t('sections.ingredients')}>
      <Stack spacing={1.5}>
        <Stack
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between' }}
        >
          <PantryHeading match={match} />
          <Box sx={{ ml: 'auto' }}>
            <ServingsStepper servings={servings} onChange={onServingsChange} />
          </Box>
        </Stack>
        <IngredientList
          lines={lines}
          allergiesByLine={allergiesByLine}
          aria-label={t('sections.ingredients')}
          pantryByLine={byLine}
          selectedId={selectedId}
          onSelect={select}
          addedId={addedId}
          handAddedIds={addLine.handAddedIds}
          errorId={errorId}
          error={addLine.error}
          addDisabled={stale || adding}
          onAddLine={(line) => {
            setErrorId(null);
            addLine.onAdd(line, {
              onAdded: () => setAddedId(line.id),
              onFailed: () => setErrorId(line.id),
            });
          }}
        />
        <AddMissingNotes match={match} error={addError} />
      </Stack>
    </Section>
  );
}

function StepsSection({ recipe }: SectionProps) {
  const { t } = useTranslation('recipes');
  if (recipe.steps.length === 0) return null;
  return (
    <Section title={t('sections.steps')}>
      <StepList
        steps={recipe.steps}
        tips={recipe.tips}
        aria-label={t('sections.steps')}
      />
    </Section>
  );
}

/** Recipe-level Tips: own and inherited. Step Tips show on their step instead. */
function TipsSection({ recipe }: SectionProps) {
  const { t } = useTranslation('recipes');
  const tips = recipe.tips.filter((tip) => tip.stepId === null);
  if (tips.length === 0) return null;
  return (
    <Section title={t('sections.tips')}>
      <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {tips.map((tip) => (
          <li key={tip.id}>
            <TipCallout tip={tip} />
          </li>
        ))}
      </Stack>
    </Section>
  );
}

function useEntryText() {
  const { t, i18n } = useTranslation(['recipes', 'common']);
  return (entry: DiffEntry) => {
    const amount = lineAmount(entry, i18n.language, t);
    return amount ? `${entry.ingredientName} ${amount}` : entry.ingredientName;
  };
}

const DIFF_KEYS = {
  added: {
    key: '+',
    bg: tokens.color.accentTint,
    fg: tokens.color.accentOnTint,
  },
  removed: { key: '−', bg: tokens.color.urgentBg, fg: tokens.color.urgentFg },
  swapped: { key: '⇄', bg: tokens.color.soonBg, fg: tokens.color.soonFg },
};

/** One kind of change: a list named for it, each line led by a coloured key (+, −, ⇄). */
function DiffGroup({
  kind,
  label,
  items,
}: {
  kind: keyof typeof DIFF_KEYS;
  label: string;
  items: ReactNode[];
}) {
  if (items.length === 0) return null;
  const { key, bg, fg } = DIFF_KEYS[kind];
  return (
    <Stack
      component="ul"
      aria-label={label}
      sx={{ listStyle: 'none', m: 0, p: 0 }}
    >
      {items.map((item, index) => (
        <Box
          component="li"
          key={index}
          sx={{ display: 'flex', gap: '8px', alignItems: 'center', py: '6px' }}
        >
          <Box
            component="span"
            aria-hidden="true"
            sx={{
              width: 22,
              height: 22,
              flexShrink: 0,
              borderRadius: radius.box,
              display: 'grid',
              placeItems: 'center',
              fontSize: 13,
              fontWeight: 800,
              bgcolor: bg,
              color: fg,
            }}
          >
            {key}
          </Box>
          <span>{item}</span>
        </Box>
      ))}
    </Stack>
  );
}

/** A Variant's ingredient diff against its base. */
function WhatsDifferentSection({ recipe }: SectionProps) {
  const { t } = useTranslation('recipes');
  const entryText = useEntryText();
  const { diff, base } = recipe;
  if (!diff) return null;
  const empty =
    diff.added.length + diff.removed.length + diff.swapped.length === 0;
  return (
    <Section card title={t('sections.whatsDifferent')}>
      <Stack spacing={1}>
        {empty ? (
          <Typography color="text.secondary">
            {t('diff.none', { base: base?.title ?? '' })}
          </Typography>
        ) : null}
        <DiffGroup
          kind="added"
          label={t('diff.added')}
          items={diff.added.map(entryText)}
        />
        <DiffGroup
          kind="removed"
          label={t('diff.removed')}
          items={diff.removed.map(entryText)}
        />
        <DiffGroup
          kind="swapped"
          label={t('diff.swapped')}
          items={diff.swapped.map((swap) =>
            t('diff.swap', {
              from: entryText(swap.from),
              to: entryText(swap.to),
            }),
          )}
        />
      </Stack>
    </Section>
  );
}

/** A base Recipe's Variants with their Tags. */
function VariantsSection({ recipe, preview }: SectionProps) {
  const { t } = useTranslation('recipes');
  if (recipe.parentId !== null) return null;
  // The preview shows the Catalog's Variants only; the Family's own are reached from its copy.
  const variants = preview
    ? recipe.variants.filter((variant) => variant.owner === 'catalog')
    : recipe.variants;
  return (
    <Section title={t('sections.variants')}>
      {variants.length === 0 ? (
        <Typography color="text.secondary">{t('noVariants')}</Typography>
      ) : (
        <Stack
          component="ul"
          spacing={1}
          sx={{ listStyle: 'none', m: 0, p: 0 }}
        >
          {variants.map((variant) => (
            <Box
              component="li"
              key={variant.id}
              sx={
                preview
                  ? { display: 'flex', alignItems: 'center', gap: '10px' }
                  : undefined
              }
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Link
                  href={recipeHref(variant)}
                  {...(preview?.fromExplore
                    ? { state: { fromExplore: true } }
                    : {})}
                >
                  {variant.title}
                </Link>{' '}
                <OwnerBadge owner={variant.owner} />
                <RowTags tags={variant.tags} />
              </Box>
              {preview ? (
                <AddToFamilyButton
                  title={variant.title}
                  state={preview.stateOf(variant)}
                  onAdd={() => preview.onAdd(variant)}
                />
              ) : null}
            </Box>
          ))}
        </Stack>
      )}
    </Section>
  );
}

export type DetailTab = 'ingredients' | 'steps' | 'about';

/**
 * The detail page's sections by tab, top to bottom. A new section is one more entry.
 */
export const DETAIL_SECTIONS: {
  key: string;
  tab: DetailTab;
  Component: (p: SectionProps) => ReactNode;
}[] = [
  { key: 'ingredients', tab: 'ingredients', Component: IngredientsSection },
  { key: 'steps', tab: 'steps', Component: StepsSection },
  { key: 'tips', tab: 'steps', Component: TipsSection },
  { key: 'whats-different', tab: 'about', Component: WhatsDifferentSection },
  { key: 'guidance', tab: 'about', Component: GuidanceSection },
  { key: 'variants', tab: 'about', Component: VariantsSection },
];
