import {
  Box,
  Card,
  ChevronRightIcon,
  ListRow,
  ListRowItem,
  TagIcon,
  Typography,
} from '@pocket-pantry/ui';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  localName,
  type AdminCatalogTag,
  type AdminTagGroup,
} from '@/lib/admin';
import {
  CatalogSection,
  NewButton,
  RowEditButton,
  RowTile,
} from '../CatalogRowParts/CatalogRowParts';

type Props = {
  /** In display order. */
  groups: AdminTagGroup[];
  tags: AdminCatalogTag[];
  onCreate: () => void;
  onEdit: (id: string) => void;
};

/** The Catalog Tags, a Card of rows under each Tag Group heading, in group order. */
export function CatalogTagList({ groups, tags, onCreate, onEdit }: Props) {
  const { t, i18n } = useTranslation('admin');
  const headingId = useId();
  return (
    <CatalogSection
      id={headingId}
      title={t('tag.title')}
      count={tags.length}
      hint={t('tag.hint')}
    >
      {tags.length === 0 ? (
        <Card sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {t('tag.empty')}
          </Typography>
        </Card>
      ) : null}
      {groups.map((group) => {
        const inGroup = tags
          .filter((tag) => tag.groupId === group.id)
          .map((tag) => ({ tag, name: localName(tag, i18n.language) }))
          .sort((a, b) => a.name.localeCompare(b.name, i18n.language));
        if (inGroup.length === 0) return null;
        const groupName = localName(group, i18n.language);
        return (
          <Box key={group.id} sx={{ display: 'grid', gap: 0.5 }}>
            <Typography
              variant="sectionLabel"
              color="text.secondary"
              sx={{ px: 0.5 }}
            >
              {groupName}
            </Typography>
            <Card
              component="ul"
              variant="list"
              aria-label={groupName}
              sx={{ listStyle: 'none', m: 0, overflow: 'hidden' }}
            >
              {inGroup.map(({ tag, name }) => (
                <ListRowItem key={tag.id}>
                  <ListRow
                    leading={
                      <RowTile>
                        <TagIcon size={19} />
                      </RowTile>
                    }
                    title={
                      <RowEditButton
                        label={t('tag.edit', { name })}
                        onClick={() => onEdit(tag.id)}
                      >
                        {name}
                      </RowEditButton>
                    }
                    trailing={
                      <Box sx={{ pr: 1.5, display: 'flex' }}>
                        <ChevronRightIcon size={18} />
                      </Box>
                    }
                  />
                </ListRowItem>
              ))}
            </Card>
          </Box>
        );
      })}
      <Box sx={{ justifySelf: 'start' }}>
        <NewButton onClick={onCreate} disabled={groups.length === 0}>
          {t('tag.new')}
        </NewButton>
      </Box>
    </CatalogSection>
  );
}
