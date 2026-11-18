import {
  Box,
  Link,
  Stack,
  Typography,
  Card,
  Tag,
  palette,
} from '@pocket-pantry/ui';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { recipeHref } from '@/lib/recipeHref';
import type { PairingKind } from '@/lib/recipeVocabulary';
import type { DetailEatingMoment, DetailPairing } from '@/lib/recipes';
import { AllergensCard } from '../AllergensCard/AllergensCard';
import { Section } from '../Section/Section';
import type { SectionProps } from '../sections';

const KINDS: PairingKind[] = ['food', 'drink'];
const POLARITIES: DetailEatingMoment['polarity'][] = ['good_for', 'avoid'];

function PairingItem({ pairing }: { pairing: DetailPairing }) {
  const { t } = useTranslation('recipes');
  const { link } = pairing;
  return (
    <Box
      component="li"
      sx={{
        py: '10px',
        borderTop: `1px solid ${palette('divider')}`,
        '&:first-of-type': { borderTop: 0 },
      }}
    >
      <Box sx={{ fontSize: 15, fontWeight: 700 }}>
        {link?.type === 'recipe' ? (
          <Link
            href={recipeHref(link)}
            title={link.title}
            underline="none"
            sx={{ color: palette('pp-accent'), fontWeight: 700 }}
          >
            {pairing.label}
          </Link>
        ) : (
          pairing.label
        )}
        {link?.type === 'ingredient' &&
        !pairing.label.toLowerCase().includes(link.name.toLowerCase()) ? (
          <Typography variant="meta" color="text.secondary" component="span">
            {' · '}
            {link.name}
          </Typography>
        ) : null}
      </Box>
      {pairing.principle ? (
        <Box
          sx={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '.03em',
            textTransform: 'uppercase',
            color: palette('pp-accent'),
          }}
        >
          {t(`principles.${pairing.principle}`)}
        </Box>
      ) : null}
      <Box
        sx={{
          mt: '2px',
          fontSize: 13.5,
          lineHeight: 1.4,
          color: palette('text-secondary'),
        }}
      >
        {pairing.reason}
      </Box>
    </Box>
  );
}

function PairingsSection({ pairings }: { pairings: DetailPairing[] }) {
  const { t } = useTranslation('recipes');
  if (pairings.length === 0) return null;
  return (
    <Section title={t('sections.pairings')}>
      <Card variant="list" sx={{ py: '6px' }}>
        {KINDS.map((kind, index) => {
          const items = pairings.filter((p) => p.kind === kind);
          if (items.length === 0) return null;
          const label = t(`pairingKind.${kind}`);
          return (
            <div key={kind}>
              <Typography
                component="p"
                sx={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: palette('text-secondary'),
                  mt: index === 0 ? '8px' : '12px',
                }}
              >
                {label}
              </Typography>
              <Box
                component="ul"
                aria-label={label}
                sx={{ listStyle: 'none', m: 0, p: 0 }}
              >
                {items.map((pairing) => (
                  <PairingItem key={pairing.id} pairing={pairing} />
                ))}
              </Box>
            </div>
          );
        })}
      </Card>
    </Section>
  );
}

function WhenToEatSection({ moments }: { moments: DetailEatingMoment[] }) {
  const { t } = useTranslation('recipes');
  if (moments.length === 0) return null;
  // Good-for moments first, then the ones to avoid.
  const ordered = POLARITIES.flatMap((polarity) =>
    moments.filter((m) => m.polarity === polarity),
  );
  return (
    <Section card title={t('sections.whenToEat')}>
      <Stack component="ul" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {ordered.map((moment) => {
          const avoid = moment.polarity === 'avoid';
          return (
            <Box
              component="li"
              key={moment.eatingMomentId}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '4px',
              }}
            >
              <Tag
                tone={avoid ? 'soon' : 'ok'}
                sx={{
                  whiteSpace: 'normal',
                  maxWidth: '100%',
                  overflowWrap: 'anywhere',
                }}
              >
                {t(`eatingPolarity.${moment.polarity}`)} · {moment.name}
              </Tag>
              {moment.reason ? (
                <Typography
                  component="p"
                  sx={{
                    m: 0,
                    fontSize: 13.5,
                    lineHeight: 1.4,
                    color: palette('text-secondary'),
                  }}
                >
                  {moment.reason}
                </Typography>
              ) : null}
            </Box>
          );
        })}
      </Stack>
    </Section>
  );
}

/**
 * Pairings, When to Eat and Nutrition, the Allergens card, then the fixed
 * guidance disclaimer. Empty guidance parts and the disclaimer are left out
 * when there is no guidance; the Allergens card is always there.
 */
export function GuidanceSection({ recipe }: Pick<SectionProps, 'recipe'>) {
  const { t } = useTranslation('recipes');
  const { pairings, eatingMoments, nutritionNote } = recipe.guidance;
  const hasGuidance =
    pairings.length + eatingMoments.length > 0 || Boolean(nutritionNote);
  return (
    <Fragment>
      <PairingsSection pairings={pairings} />
      <WhenToEatSection moments={eatingMoments} />
      {nutritionNote ? (
        <Section card title={t('sections.nutrition')}>
          <Typography sx={{ lineHeight: 1.5 }}>{nutritionNote}</Typography>
        </Section>
      ) : null}
      <AllergensCard allergens={recipe.allergens} />
      {hasGuidance ? (
        <Typography variant="meta" color="text.secondary" component="p">
          {t('disclaimer')}
        </Typography>
      ) : null}
    </Fragment>
  );
}
