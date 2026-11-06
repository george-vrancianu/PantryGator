import {
  ActionMenu,
  Box,
  Button,
  Sheet,
  Typography,
  palette,
  radius,
} from '@pocket-pantry/ui';
import { useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  newestFirst,
  type BackgroundAction,
  type BackgroundItem,
  type BackgroundStatus,
} from './backgroundItem';

const glyph: Record<BackgroundStatus, string> = {
  reading: '…',
  ready: '✓',
  failed: '!',
};

/**
 * The background sheet, "In the background": one row per item, newest first, with its title, detail
 * and the buttons its kind brings. `footer` carries a group action of a kind (Review all).
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
        shape="pill"
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

  return (
    <Sheet
      open={open}
      onClose={onClose}
      onExited={onExited}
      initialFocus={title}
      label={t('sheetTitle')}
      footer={footer}
      header={
        <Box sx={{ px: 2.5, pt: 1.5, pb: 1.5 }}>
          <Typography
            component="h2"
            variant="h2"
            tabIndex={-1}
            ref={title}
            sx={{ outline: 'none' }}
          >
            {t('sheetTitle')}
          </Typography>
        </Box>
      }
    >
      <Box
        component="ul"
        aria-label={t('sheetTitle')}
        sx={{ m: 0, px: 2, pb: 2, listStyle: 'none' }}
      >
        {newestFirst(items).map((item) => (
          <Box
            component="li"
            key={`${item.kind}-${item.id}`}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              py: 1.25,
              borderBottom: `1px solid ${palette('pp-line')}`,
            }}
          >
            <Box
              aria-hidden
              sx={{
                flex: 'none',
                width: 32,
                height: 32,
                display: 'grid',
                placeItems: 'center',
                borderRadius: radius.control,
                backgroundColor: palette('background-paper'),
                fontWeight: 700,
              }}
            >
              {item.art ?? glyph[item.status]}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box
                sx={{
                  fontSize: 14,
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.title}
              </Box>
              <Box sx={{ fontSize: 12, color: 'text.secondary' }}>
                {item.detail}
              </Box>
            </Box>
            {item.open ? (
              <Button
                size="sm"
                shape="pill"
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
        ))}
      </Box>
    </Sheet>
  );
}
