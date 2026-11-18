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
 * brings. `primary` carries a group action of a kind (Review all), `notice` its refusal; the sheet adds its note.
 */
export function BackgroundSheet({
  open,
  items,
  primary,
  notice,
  onClose,
  onExited,
}: {
  open: boolean;
  items: BackgroundItem[];
  primary?: { label: string; onClick: () => void };
  /** A message for the content's end, announced when it appears (the Review all refusal). */
  notice?: ReactNode;
  onClose: () => void;
  onExited: () => void;
}) {
  const { t } = useTranslation('background');
  const body = useRef<HTMLDivElement>(null);
  // A row's button can take its own row away; focus would fall to the page: the dialog itself takes it.
  const focusDialog = () =>
    body.current?.closest<HTMLElement>('[role="dialog"]')?.focus();

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
            requestAnimationFrame(focusDialog);
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
          else focusDialog();
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
      title={t('sheet.title')}
      subtitle={t('sheet.summary', {
        ready: counts.ready,
        reading: counts.reading,
        failed: counts.failed,
      })}
      {...(primary ? { primary } : {})}
    >
      <Box ref={body} sx={{ px: 2, pb: 2 }}>
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
        {notice ? (
          // Stays in view above the pinned Review all, whatever the list's length.
          <Box sx={{ position: 'sticky', bottom: 0, mt: 1 }}>{notice}</Box>
        ) : null}
        <Box
          sx={{
            pt: 2,
            fontSize: 12,
            color: 'text.secondary',
            textAlign: 'center',
          }}
        >
          {t('sheet.note')}
        </Box>
      </Box>
    </Sheet>
  );
}
