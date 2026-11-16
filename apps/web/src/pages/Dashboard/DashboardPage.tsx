import {
  Alert,
  Box,
  Button,
  CustomiseIcon,
  HeaderButton,
  Link,
  SettingsIcon,
  Spinner,
  palette,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../components/layout/Screen';
import { translateApiError } from '../../i18n/translateApiError';
import { useDashboardLayout } from '../../lib/dashboard';
import { greetingKeyForHour } from '../../lib/greeting';
import { useGridColumns } from '../../lib/layoutColumns';
import { WIDGET_REGISTRY } from './widgets/registry';

/** The Dashboard: date, greeting, Settings in the top bar, the Member's grid of Widgets and the Customise link under them. */
export function DashboardPage() {
  const { t, i18n } = useTranslation('dashboard');
  const layout = useDashboardLayout();
  const columns = useGridColumns();
  // oxlint-disable-next-line react/purity -- "today" must follow the clock across midnight; freezing it would leave a Member on a stale day
  const now = new Date();
  const date = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);

  return (
    <Screen
      title={t(`greeting.${greetingKeyForHour(now.getHours())}`)}
      status={date}
      secondary={
        <HeaderButton href="/settings" icon={<SettingsIcon size={18} />}>
          {t('screenHeader:settings')}
        </HeaderButton>
      }
    >
      {layout.isPending ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <Spinner label={t('common:loading')} />
        </Box>
      ) : layout.error ? (
        <Box>
          <Alert severity="error">{translateApiError(t, layout.error)}</Alert>
          <Button
            variant="ghost"
            onClick={() => void layout.refetch()}
            sx={{ mt: 1 }}
          >
            {t('common:retry')}
          </Button>
        </Box>
      ) : (
        <>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              // Dense packing reorders cards on screen relative to the DOM, so use
              // it only on the 4-column grid, where tall cards leave gaps. On the
              // phone and 3-column grid visual order must match saved and tab
              // order (WCAG 1.3.2, 2.4.3).
              gridAutoFlow: columns === 4 ? 'dense' : 'row',
              // Tall cards span two rows: 2 x 150 + 16 gap = 316px, as in the mockup.
              gridAutoRows: columns === 4 ? 'minmax(150px, auto)' : undefined,
              gap: { xs: '12px', md: '16px' },
              pb: 2,
            }}
          >
            {layout.data.widgets.map(({ id, type, size }) => {
              // A layout saved by a newer app version may hold a type this one lacks.
              const definition = WIDGET_REGISTRY[type] as
                (typeof WIDGET_REGISTRY)[typeof type] | undefined;
              if (!definition) return null;
              const Widget = definition.component;
              return <Widget key={id} size={size} columns={columns} />;
            })}
          </Box>
          <Link
            href="/customise"
            underline="none"
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '7px',
              minHeight: 44,
              color: palette('text-secondary'),
              fontSize: 13,
              fontWeight: 700,
              '&:hover': { color: palette('text-primary') },
            }}
          >
            <CustomiseIcon size={16} />
            {t('customise')}
          </Link>
        </>
      )}
    </Screen>
  );
}
