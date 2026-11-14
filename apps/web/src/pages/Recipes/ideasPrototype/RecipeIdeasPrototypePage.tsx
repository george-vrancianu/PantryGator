/**
 * PROTOTYPE (throwaway): three layouts of the Recipe Ideas page, switchable via `?variant=A|B|C`, plus
 * `?from=pantry|pantry-expiring|recipes|recipe` for what each entry point pre-selects (and `&base=<recipe id>`
 * for Enhance). Real Pantry and Recipe reads; Idea rounds and write-ups are faked in memory (a Wish
 * containing "nothing" gives the free zero-Idea round). Route: /recipes/ideas-prototype.
 */
import { useSearchParams } from 'react-router-dom';
import { Spinner } from '@pocket-pantry/ui';
import { AppScreenHeader } from '../../../components/AppScreenHeader';
import { PrototypeSwitcher } from '../../../components/PrototypeSwitcher';
import {
  ENTRY_POINTS,
  useIdeasPrototype,
  type EntryPoint,
} from './ideasPrototypeModel';
import { VariantA, variantAName } from './VariantA';
import { VariantB, variantBName } from './VariantB';
import { VariantC, variantCName } from './VariantC';

const VARIANTS = [
  { key: 'A', label: variantAName },
  { key: 'B', label: variantBName },
  { key: 'C', label: variantCName },
];

const BACK: Record<EntryPoint, { label: string; href: string }> = {
  pantry: { label: 'Pantry', href: '/pantry' },
  'pantry-expiring': { label: 'Pantry', href: '/pantry' },
  recipes: { label: 'Recipes', href: '/recipes' },
  recipe: { label: 'Recipe', href: '/recipes' },
};

export function RecipeIdeasPrototypePage() {
  const [params] = useSearchParams();
  const variant = params.get('variant') ?? 'A';
  const entry = (params.get('from') ?? 'recipes') as EntryPoint;
  // Remount on entry-point change so its pre-selection applies fresh.
  return (
    <Page
      key={entry}
      variant={variant}
      entry={entry}
      baseParam={params.get('base')}
    />
  );
}

function Page({
  variant,
  entry,
  baseParam,
}: {
  variant: string;
  entry: EntryPoint;
  baseParam: string | null;
}) {
  const s = useIdeasPrototype(entry, baseParam);
  return (
    <>
      <AppScreenHeader
        title={s.base ? 'New take' : 'Recipe Ideas'}
        back={BACK[entry]}
      />
      {s.loading ? (
        <Spinner label="Loading" />
      ) : (
        <>
          {variant === 'A' && <VariantA s={s} />}
          {variant === 'B' && <VariantB s={s} />}
          {variant === 'C' && <VariantC s={s} />}
        </>
      )}
      <PrototypeSwitcher
        variants={VARIANTS}
        axis={{
          param: 'from',
          options: [...ENTRY_POINTS].sort((a) =>
            a.key === 'recipes' ? -1 : 0,
          ),
        }}
        state={s.debug}
      />
    </>
  );
}
