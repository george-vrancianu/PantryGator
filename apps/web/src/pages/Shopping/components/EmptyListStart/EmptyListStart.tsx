import {
  Box,
  Card,
  ChevronRightIcon,
  ImportIcon,
  SearchIcon,
  Typography,
  displayType,
  focusRing,
  radius,
  tokens,
} from '@pocket-pantry/ui';
import { forwardRef, type MouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

type TileProps = {
  icon: ReactNode;
  tint: string;
  ink: string;
  title: string;
  meta: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
};

const Tile = forwardRef<HTMLButtonElement, TileProps>(function Tile(
  { icon, tint, ink, title, meta, onClick },
  ref,
) {
  return (
    <Card sx={{ p: 0 }}>
      <Box
        ref={ref}
        component="button"
        type="button"
        onClick={onClick}
        sx={{
          width: '100%',
          p: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          border: 0,
          borderRadius: radius.card,
          backgroundColor: 'transparent',
          color: 'inherit',
          font: 'inherit',
          textAlign: 'left',
          cursor: 'pointer',
          ...focusRing,
        }}
      >
        <Box
          aria-hidden
          sx={{
            flexShrink: 0,
            width: 42,
            height: 42,
            display: 'grid',
            placeItems: 'center',
            borderRadius: radius.control,
            backgroundColor: tint,
            color: ink,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ fontSize: 15, fontWeight: 600 }}>{title}</Box>
          <Box
            sx={{
              fontSize: 12.5,
              color: tokens.color.muted,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {meta}
          </Box>
        </Box>
        <Box aria-hidden sx={{ display: 'flex', color: tokens.color.muted }}>
          <ChevronRightIcon size={18} />
        </Box>
      </Box>
    </Card>
  );
});

export type EmptyListStartProps = {
  /** Shopping Templates the Family has; the Import tile is hidden at 0. */
  templateCount: number;
  onAddItems: (event: MouseEvent<HTMLButtonElement>) => void;
  onImport: (event: MouseEvent<HTMLButtonElement>) => void;
};

/** What an empty Shopping List shows: a prompt and two ways to start. */
export function EmptyListStart({
  templateCount,
  onAddItems,
  onImport,
}: EmptyListStartProps) {
  const { t } = useTranslation('shopping');
  return (
    <Box>
      <Box sx={{ textAlign: 'center', pt: 2, pb: 2.5 }}>
        <Typography component="h2" sx={{ ...displayType, fontSize: 19 }}>
          {t('empty.title')}
        </Typography>
        <Typography variant="meta" color="text.secondary">
          {t('empty.hint')}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Tile
          icon={<SearchIcon size={20} />}
          tint={tokens.color.accentTint}
          ink={tokens.color.accentOnTint}
          title={t('empty.addTitle')}
          meta={t('empty.addMeta')}
          onClick={onAddItems}
        />
        {templateCount > 0 ? (
          <Tile
            icon={<ImportIcon size={20} />}
            tint={tokens.color.butter}
            ink={tokens.color.butterInk}
            title={t('empty.importTitle')}
            meta={t('empty.importMeta', { count: templateCount })}
            onClick={onImport}
          />
        ) : null}
      </Box>
    </Box>
  );
}
