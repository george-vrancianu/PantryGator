import {
  Alert,
  Box,
  aisleTint,
  Card,
  ChevronDownIcon,
  ChevronUpIcon,
  IconButton,
  ListRow,
  ListRowItem,
  Tag,
  Typography,
  visuallyHidden,
  type IconProps,
} from '@pocket-pantry/ui';
import { useId, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';
import {
  CatalogCard,
  CatalogSection,
  NewButton,
  OrderNumber,
  RowControls,
  RowEditButton,
  RowTile,
} from '../CatalogRowParts/CatalogRowParts';

export type ReorderItem = {
  id: string;
  name: string;
  badge?: string;
  /** Tints the row's tile with this Aisle's colours (Aisles only). */
  aisleId?: string;
};

export type ReorderLabels = {
  title: string;
  hint: string;
  newLabel: string;
  empty?: string;
  edit: (name: string) => string;
  moveUp: (name: string) => string;
  moveDown: (name: string) => string;
  moved: (name: string, position: number, total: number) => string;
};

type Props = {
  /** In order. */
  items: ReorderItem[];
  labels: ReorderLabels;
  icon: ComponentType<IconProps>;
  reorder: {
    mutate: (ids: string[], options: { onSuccess: () => void }) => void;
    isPending: boolean;
    error: unknown;
  };
  onCreate: () => void;
  onEdit: (id: string) => void;
};

/**
 * A numbered Card of rows with Move up / Move down buttons (Aisles, Eating Moments, Tag Groups).
 * Each move sends the whole new order and then announces the new place in a live region.
 */
export function ReorderList({
  items,
  labels,
  icon: Icon,
  reorder,
  onCreate,
  onEdit,
}: Props) {
  const { t } = useTranslation(['admin', 'errors']);
  const [announcement, setAnnouncement] = useState('');
  const headingId = useId();

  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (reorder.isPending || target < 0 || target >= items.length) return;
    const ids = items.map((item) => item.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    const name = items[index].name;
    reorder.mutate(ids, {
      onSuccess: () =>
        setAnnouncement(labels.moved(name, target + 1, items.length)),
    });
  };

  return (
    <CatalogSection
      id={headingId}
      title={labels.title}
      count={items.length}
      hint={labels.hint}
    >
      {reorder.error ? (
        <Alert>{translateApiError(t, reorder.error)}</Alert>
      ) : null}
      <Box role="status" sx={visuallyHidden}>
        {announcement}
      </Box>
      {items.length === 0 && labels.empty ? (
        <Card sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {labels.empty}
          </Typography>
        </Card>
      ) : null}
      {items.length > 0 ? (
        <CatalogCard ordered labelledBy={headingId}>
          {items.map((item, index) => (
            <ListRowItem key={item.id}>
              <ListRow
                leading={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <OrderNumber value={index + 1} />
                    <RowTile
                      {...(item.aisleId
                        ? {
                            background: aisleTint(item.aisleId).bg,
                            color: aisleTint(item.aisleId).fg,
                          }
                        : {})}
                    >
                      <Icon size={19} />
                    </RowTile>
                  </Box>
                }
                title={
                  <RowEditButton
                    label={labels.edit(item.name)}
                    onClick={() => onEdit(item.id)}
                  >
                    {item.name}
                  </RowEditButton>
                }
                tags={
                  item.badge ? <Tag tone="neutral">{item.badge}</Tag> : null
                }
                trailing={
                  <RowControls>
                    <IconButton
                      tone="plain"
                      size={40}
                      label={labels.moveUp(item.name)}
                      ariaDisabled={index === 0 || reorder.isPending}
                      onClick={() => move(index, -1)}
                    >
                      <ChevronUpIcon />
                    </IconButton>
                    <IconButton
                      tone="plain"
                      size={40}
                      label={labels.moveDown(item.name)}
                      ariaDisabled={
                        index === items.length - 1 || reorder.isPending
                      }
                      onClick={() => move(index, 1)}
                    >
                      <ChevronDownIcon />
                    </IconButton>
                  </RowControls>
                }
              />
            </ListRowItem>
          ))}
        </CatalogCard>
      ) : null}
      <Box sx={{ justifySelf: 'start' }}>
        <NewButton onClick={onCreate}>{labels.newLabel}</NewButton>
      </Box>
    </CatalogSection>
  );
}
