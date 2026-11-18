import {
  Box,
  CheckIcon,
  IngredientsScanIcon,
  WarningIcon,
  palette,
  radius,
} from '@pocket-pantry/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { CookTonightCard } from '@/lib/cookTonight';
import type { CompactAllergyWarning } from '@/lib/recipes';
import { AllergenIndicator } from '@/components/allergy/AllergenIndicator/AllergenIndicator';

export function StatusPills({
  recipeId,
  card,
  warning,
  hideCanMake = false,
}: {
  recipeId: string;
  card: CookTonightCard | undefined;
  warning: CompactAllergyWarning | null;
  /** Inside a group that already says "You can make this". */
  hideCanMake?: boolean;
}) {
  const { t } = useTranslation('recipes');
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px', mt: '6px' }}>
      <AllergenIndicator warning={warning} />
      {!card ? null : card.canMake ? (
        hideCanMake ? null : (
          <Pill
            icon={<CheckIcon size={13} />}
            fg={palette('pp-accentOnTint')}
            bg={palette('pp-accentTint')}
          >
            {card.recipe.id === recipeId
              ? t('canMake')
              : t('canMakeVia', { title: card.recipe.title })}
          </Pill>
        )
      ) : card.missing ? (
        <Pill
          icon={<WarningIcon size={13} />}
          fg={palette('warning-main')}
          bg={palette('warning-light')}
        >
          {card.recipe.id === recipeId
            ? t('missingOne', { name: card.missing.name })
            : t('missingOneVia', {
                name: card.missing.name,
                title: card.recipe.title,
              })}
        </Pill>
      ) : null}
      {card && card.expiringCount > 0 ? (
        <Pill
          icon={<IngredientsScanIcon size={13} />}
          fg={palette('error-main')}
          bg={palette('error-light')}
        >
          {t('expiring', { count: card.expiringCount })}
        </Pill>
      ) : null}
    </Box>
  );
}

function Pill(props: {
  icon: ReactNode;
  fg: string;
  bg: string;
  children: ReactNode;
}) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        px: '8px',
        py: '3px',
        borderRadius: radius.tag,
        bgcolor: props.bg,
        color: props.fg,
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1.2,
      }}
    >
      {props.icon}
      {props.children}
    </Box>
  );
}
