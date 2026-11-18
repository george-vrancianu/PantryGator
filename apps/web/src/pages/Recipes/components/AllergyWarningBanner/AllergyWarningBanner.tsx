import { Alert, Box, Stack, Typography } from '@pocket-pantry/ui';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { AllergyWarning, AllergyWarningEntry } from '@/lib/recipes';

/** Whose Allergy it is, as it reads in "Optional ingredient contains Milk: Mia". */
function whose(entry: AllergyWarningEntry, t: TFunction, count = 1): string {
  const { owner } = entry;
  if (owner.kind === 'own') return t('allergyWarning.whoOwn', { count });
  if (owner.kind === 'family') {
    return owner.label ?? t('allergyWarning.whoFamily');
  }
  return owner.name;
}

function personKey({ owner }: AllergyWarningEntry): string {
  if (owner.kind === 'own') return 'own';
  if (owner.kind === 'family') return `family:${owner.label ?? ''}`;
  return `member:${owner.memberId}`;
}

/** One person's Allergies in the Recipe, split by severity; names keep the API's order. */
type Person = {
  key: string;
  /** How the person reads, given how many Allergies the phrase covers ("your Allergy"/"your Allergies"). */
  who: (count: number) => string;
  own: boolean;
  strong: string[];
  soft: string[];
  /** The distinct optional lines behind `soft`, so the note can say "ingredient" or "ingredients". */
  softLines: Set<string>;
};

/** Groups entries by person, in the API's order (first appearance of each person). */
function peopleOf(entries: AllergyWarningEntry[], t: TFunction): Person[] {
  const people = new Map<string, Person>();
  for (const entry of entries) {
    const key = personKey(entry);
    let person = people.get(key);
    if (!person) {
      person = {
        key,
        who: (count) => whose(entry, t, count),
        own: entry.owner.kind === 'own',
        strong: [],
        soft: [],
        softLines: new Set(),
      };
      people.set(key, person);
    }
    person[entry.severity].push(entry.allergen.name);
    if (entry.severity === 'soft') {
      for (const line of entry.lines) person.softLines.add(line.lineId);
    }
  }
  return [...people.values()];
}

/**
 * The Allergy Warning above a Recipe's tabs (ADR 0014): strong when a required line contains one
 * of the Family's Allergies, softer when only optional or Unchecked lines might. Entries arrive
 * from the API already tiered and ordered: `yours` (own and Family) first, other Members' on a
 * quieter second line. Each person's Allergies read as one phrase. Never claims a Recipe is free
 * of anything; no warning means no banner.
 */
export function AllergyWarningBanner({ warning }: { warning: AllergyWarning }) {
  const { t } = useTranslation('recipes');
  const yours = peopleOf(
    warning.entries.filter((e) => e.tier === 'yours'),
    t,
  );
  const members = peopleOf(
    warning.entries.filter((e) => e.tier === 'members'),
    t,
  );
  const yoursStrong = yours.filter((p) => p.strong.length > 0);
  const yoursSoft = yours.filter((p) => p.soft.length > 0);
  return (
    <div
      role="group"
      aria-label={t('allergyWarning.title')}
      data-severity={warning.severity}
    >
      <Alert severity={warning.severity === 'strong' ? 'error' : 'warning'}>
        <Stack spacing={0.5}>
          {yoursStrong.length > 0 ? (
            <Box
              data-tier="yours"
              sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1.5 }}
            >
              {yoursStrong.map((p) => (
                <Typography
                  key={p.key}
                  component="span"
                  sx={{ fontWeight: 700 }}
                >
                  {t(
                    p.own
                      ? 'allergyWarning.strongOwn'
                      : 'allergyWarning.strongOther',
                    {
                      count: p.strong.length,
                      names: p.strong.join(', '),
                      who: p.who(p.strong.length),
                    },
                  )}
                </Typography>
              ))}
            </Box>
          ) : null}
          {yoursSoft.map((p) => (
            <Typography key={`optional-${p.key}`}>
              {t('allergyWarning.optionalLine', {
                count: p.softLines.size,
                names: p.soft.join(', '),
                who: p.who(p.soft.length),
              })}
            </Typography>
          ))}
          {members.length > 0 ? (
            <Box
              data-tier="members"
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                columnGap: 1.5,
                opacity: 0.85,
              }}
            >
              {members.flatMap((p) => [
                ...(p.strong.length > 0
                  ? [
                      <Typography key={p.key} component="span" variant="meta">
                        {t('allergyWarning.strongOther', {
                          names: p.strong.join(', '),
                          who: p.who(1),
                        })}
                      </Typography>,
                    ]
                  : []),
                ...(p.soft.length > 0
                  ? [
                      <Typography
                        key={`optional-${p.key}`}
                        component="span"
                        variant="meta"
                      >
                        {t('allergyWarning.memberOptional', {
                          names: p.soft.join(', '),
                          who: p.who(1),
                        })}
                      </Typography>,
                    ]
                  : []),
              ])}
            </Box>
          ) : null}
          {warning.uncheckedCount > 0 ? (
            <Typography>
              {t('allergyWarning.unchecked', { count: warning.uncheckedCount })}
            </Typography>
          ) : null}
        </Stack>
      </Alert>
    </div>
  );
}
