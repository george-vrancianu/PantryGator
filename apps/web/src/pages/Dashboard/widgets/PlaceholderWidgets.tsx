import { Box, displayType, radius, palette, shade } from '@pocket-pantry/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { WidgetCard } from './WidgetCard';
import type { WidgetProps } from './types';

/** Static Widgets for features that do not exist yet, clearly marked as coming soon. */
function Placeholder({
  title,
  size,
  columns,
  children,
}: {
  title: string;
  size: WidgetProps['size'];
  columns: WidgetProps['columns'];
  children: ReactNode;
}) {
  const { t } = useTranslation('dashboard');
  return (
    <WidgetCard label={title} size={size} columns={columns}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          mb: '10px',
        }}
      >
        <Box
          component="span"
          sx={{
            fontSize: 13,
            fontWeight: 600,
            color: palette('text-secondary'),
          }}
        >
          {title}
        </Box>
        <Box
          component="span"
          sx={{
            fontSize: 11,
            fontWeight: 700,
            px: '8px',
            py: '2px',
            borderRadius: radius.tag,
            bgcolor: palette('warning-light'),
            color: palette('warning-main'),
            whiteSpace: 'nowrap',
          }}
        >
          {t('comingSoon')}
        </Box>
      </Box>
      {children}
    </WidgetCard>
  );
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <Box
      aria-hidden="true"
      sx={{
        height: 6,
        borderRadius: radius.tag,
        bgcolor: palette('background-default'),
      }}
    >
      <Box
        sx={{
          width: `${value}%`,
          height: '100%',
          borderRadius: radius.tag,
          bgcolor: color,
        }}
      />
    </Box>
  );
}

export function BudgetWidget({ size, columns }: WidgetProps) {
  const { t } = useTranslation('dashboard');
  return (
    <Placeholder
      title={t('widgets.budget.title')}
      size={size}
      columns={columns}
    >
      <Box
        component="p"
        sx={{
          m: 0,
          mb: '8px',
          ...displayType,
          fontSize: 28,
        }}
      >
        {t('widgets.budget.sample')}
      </Box>
      <Bar value={60} color={palette('pp-accent')} />
    </Placeholder>
  );
}

export function NutritionWidget({ size, columns }: WidgetProps) {
  const { t } = useTranslation('dashboard');
  return (
    <Placeholder
      title={t('widgets.nutrition.title')}
      size={size}
      columns={columns}
    >
      <Box sx={{ display: 'grid', gap: '8px' }}>
        {(
          [
            ['protein', 70],
            ['carbs', 45],
            ['fat', 30],
          ] as const
        ).map(([nutrient, value]) => (
          <Box key={nutrient}>
            <Box
              component="span"
              sx={{ fontSize: 11, color: palette('text-secondary') }}
            >
              {t(`widgets.nutrition.${nutrient}`)}
            </Box>
            <Bar value={value} color={shade.accentMid} />
          </Box>
        ))}
      </Box>
    </Placeholder>
  );
}
