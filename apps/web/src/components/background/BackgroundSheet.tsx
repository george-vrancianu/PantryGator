import {
  ActionMenu,
  Box,
  Button,
  Gator,
  Sheet,
  Typography,
  palette,
  radius,
} from '@pocket-pantry/ui';
import { useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  countBackground,
  newestFirst,
  type BackgroundAction,
  type BackgroundItem,
  type BackgroundStatus,
} from '@/lib/backgroundItem';

const glyph: Record<BackgroundStatus, string> = {
  reading: '…',
  ready: '✓',
  failed: '!',
};

/** The sheet's groups, in the order they are shown. */
const GROUPS: BackgroundStatus[] = ['ready', 'reading', 'failed'];

/**
 * The Review sheet: the Jobs in three groups (Ready to review, Being read, Could not be read), each
 * only when it has Jobs, newest first, a row with its title, detail and the buttons its kind
 * brings. `footer` carries a group action of a kind (Review all); the sheet adds its note.
 */
export function BackgroundSheet({
  open,
  items,
  footer,
  onClose,
  onExited,
}: {
  open: boolean;
  items: BackgroundItem[];
  footer?: ReactNode;
  onClose: () => void;
  onExited: () => void;
}) {
  const { t } = useTranslation('background');
  const title = useRef<HTMLHeadingElement>(null);
  // A row's button can take its own row away; focus would fall to the page.
  const focusTitle = () => title.current?.focus();

  const renderAction = (action: BackgroundAction, index: number) =>
    action.type === 'menu' ? (
      <ActionMenu
        key={index}
        label={action.label}
        icon={action.icon}
        items={action.items.map((item) => ({
          label: item.label,
          onClick: () => {
            // The menu returns focus to its trigger, which is gone once the row is read again.
            requestAnimationFrame(focusTitle);
            item.onClick();
          },
        }))}
      />
    ) : (
      <Button
        key={index}
        size="sm"
        variant={action.tone === 'secondary' ? 'secondary' : undefined}
        aria-label={action.ariaLabel}
        onClick={() => {
          if (action.closesSheet) onClose();
          else focusTitle();
          action.onClick();
        }}
      >
        {action.label}
      </Button>
    );

  const counts = countBackground(items);
  const row = (item: BackgroundItem) => (
    <Box
      component="li"
      key={`${item.kind}-${item.id}`}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        minHeight: 62,
        py: 1,
        borderBottom: `1px solid ${palette('pp-line')}`,
      }}
    >
      <Box
        aria-hidden
        sx={{
          flex: 'none',
          width: 36,
          height: 36,
          display: 'grid',
          placeItems: 'center',
          borderRadius: radius.control,
          backgroundColor:
            item.status === 'failed'
              ? palette('error-light')
              : palette('background-paper'),
          color: item.status === 'failed' ? palette('error-main') : undefined,
          fontWeight: 700,
        }}
      >
        {item.art ?? glyph[item.status]}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box
          sx={{
            fontSize: 15.5,
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.title}
        </Box>
        <Box sx={{ fontSize: 12, color: 'text.secondary' }}>{item.detail}</Box>
      </Box>
      {item.open ? (
        <Button
          size="sm"
          aria-label={item.open.ariaLabel}
          onClick={() => {
            onClose();
            item.open?.onClick();
          }}
        >
          {item.open.label}
        </Button>
      ) : item.actions.length > 0 ? (
        <Box sx={{ display: 'flex', gap: '8px', flex: 'none' }}>
          {item.actions.map(renderAction)}
        </Box>
      ) : null}
    </Box>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      onExited={onExited}
      initialFocus={title}
      label={t('sheet.title')}
      footer={
        <>
          {footer}
          <Box
            sx={{
              px: 2.5,
              pb: 1.5,
              pt: footer ? 0 : 1.5,
              fontSize: 12,
              color: 'text.secondary',
              textAlign: 'center',
            }}
          >
            {t('sheet.note')}
          </Box>
        </>
      }
      header={
        <Box
          sx={{
            px: 2.5,
            pt: 1.5,
            pb: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          <Box
            aria-hidden
            sx={{
              flex: 'none',
              width: 52,
              height: 52,
              borderRadius: '50%',
              overflow: 'hidden',
              display: 'grid',
              placeItems: 'center',
              background: 'var(--pp-bubble-face)',
            }}
          >
            <Gator
              mood="thinking"
              size={54}
              loop="idle"
              entrance={false}
              decorative
            />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              component="h2"
              variant="h2"
              tabIndex={-1}
              ref={title}
              sx={{ outline: 'none' }}
            >
              {t('sheet.title')}
            </Typography>
            <Box sx={{ fontSize: 13, color: 'text.secondary' }}>
              {t('sheet.summary', {
                ready: counts.ready,
                reading: counts.reading,
                failed: counts.failed,
              })}
            </Box>
          </Box>
        </Box>
      }
    >
      <Box sx={{ px: 2, pb: 2 }}>
        {GROUPS.map((status) => {
          const group = newestFirst(items.filter((i) => i.status === status));
          if (group.length === 0) return null;
          const heading = t(`sheet.group.${status}`);
          return (
            <Box component="section" key={status} aria-label={heading}>
              <Typography
                component="h3"
                sx={{
                  m: 0,
                  pt: 1.5,
                  pb: 0.5,
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  color: 'text.secondary',
                }}
              >
                {heading}
              </Typography>
              <Box
                component="ul"
                aria-label={heading}
                sx={{ m: 0, p: 0, listStyle: 'none' }}
              >
                {group.map(row)}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Sheet>
  );
}
