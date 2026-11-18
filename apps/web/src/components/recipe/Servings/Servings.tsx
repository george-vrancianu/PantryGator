import {
  IconButton,
  MinusIcon,
  PlusIcon,
  Stack,
  palette,
  radius,
} from '@pocket-pantry/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** The most Servings the API will match or add for (keep in step with MAX_MATCH_SERVINGS in apps/api/src/recipes/recipe-pantry.schemas.ts). */
export const MAX_SERVINGS = 100;

/** How many servings a Recipe makes. */
export function Servings({ servings }: { servings: number }) {
  const { t } = useTranslation('recipes');
  return <span>{t('servings', { count: servings })}</span>;
}

type StepperPillProps = {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  fewerLabel: string;
  moreLabel: string;
  /** Both buttons off, say while a write is pending. */
  disabled?: boolean;
  /** The words between the buttons. */
  children: ReactNode;
};

/** A count with a minus and a plus, as a white pill: the Servings stepper, and the Meal plan's Days stepper. */
export function StepperPill({
  value,
  min,
  max,
  onChange,
  fewerLabel,
  moreLabel,
  disabled = false,
  children,
}: StepperPillProps) {
  return (
    <Stack
      sx={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 1,
        height: 40,
        px: '3px',
        bgcolor: palette('background-paper'),
        border: `1px solid ${palette('pp-line')}`,
        borderRadius: radius.control,
        fontSize: 13.5,
        fontWeight: 700,
      }}
    >
      <IconButton
        label={fewerLabel}
        size={34}
        tone="plain"
        ariaDisabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
      >
        <MinusIcon size={16} />
      </IconButton>
      {children}
      <IconButton
        label={moreLabel}
        size={34}
        tone="plain"
        ariaDisabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        <PlusIcon size={16} />
      </IconButton>
    </Stack>
  );
}

/** Servings with a stepper, as a white pill; the Pantry status and quantities follow it. */
export function ServingsStepper({
  servings,
  onChange,
  disabled,
}: {
  servings: number;
  onChange: (servings: number) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation('recipes');
  return (
    <StepperPill
      value={servings}
      min={1}
      max={MAX_SERVINGS}
      onChange={onChange}
      fewerLabel={t('fewerServings')}
      moreLabel={t('moreServings')}
      disabled={disabled}
    >
      <Servings servings={servings} />
    </StepperPill>
  );
}
