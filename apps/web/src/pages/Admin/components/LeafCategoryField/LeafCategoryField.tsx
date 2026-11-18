import {
  Box,
  ChevronRightIcon,
  insetFocusRingStyle,
  radius,
  Sheet,
  Typography,
  palette,
} from '@pocket-pantry/ui';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localName, type AdminCatalog } from '@/lib/admin';

type Props = {
  catalog: AdminCatalog;
  /** The chosen Leaf Category's id. */
  value: string;
  onChange: (leafCategoryId: string) => void;
};

/**
 * The Ingredient's Leaf Category as a field-button (its name, and its Aisle underneath) that opens a
 * picker of every Leaf Category under its Parent, one choice at a time.
 */
export function LeafCategoryField({ catalog, value, onChange }: Props) {
  const { t, i18n } = useTranslation('admin');
  const locale = i18n.language;
  const labelId = useId();
  const valueId = useId();
  const [open, setOpen] = useState(false);
  const chosen = catalog.leafCategories.find((leaf) => leaf.id === value);
  const aisleOf = (parentId: string) => {
    const parent = catalog.parentCategories.find((p) => p.id === parentId);
    const aisle = catalog.aisles.find((a) => a.id === parent?.aisleId);
    return aisle ? localName(aisle, locale) : '';
  };
  const groups = catalog.parentCategories
    .map((parent) => ({
      parent,
      leaves: catalog.leafCategories.filter(
        (leaf) => leaf.parentId === parent.id,
      ),
    }))
    .filter((group) => group.leaves.length > 0);

  return (
    <Box>
      <Typography id={labelId} variant="sectionLabel" color="text.secondary">
        {t('ingredient.leafCategory')}
      </Typography>
      <Box
        component="button"
        type="button"
        aria-labelledby={`${labelId} ${valueId}`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        sx={{
          mt: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          width: '100%',
          p: 1.5,
          font: 'inherit',
          color: 'inherit',
          textAlign: 'start',
          cursor: 'pointer',
          backgroundColor: palette('background-paper'),
          border: `1px solid ${palette('pp-line')}`,
          borderRadius: radius.control,
        }}
      >
        <Box id={valueId} sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            component="span"
            sx={{ display: 'block', fontWeight: 700 }}
          >
            {chosen ? localName(chosen, locale) : ''}
          </Typography>
          {chosen ? (
            <Typography
              component="span"
              variant="meta"
              color="text.secondary"
              sx={{ display: 'block' }}
            >
              {aisleOf(chosen.parentId)}
            </Typography>
          ) : null}
        </Box>
        <ChevronRightIcon size={18} />
      </Box>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('ingredient.leafCategory')}
      >
        <Box sx={{ px: 3, pb: 3, display: 'grid', gap: 2 }}>
          {groups.map(({ parent, leaves }) => (
            <Box
              key={parent.id}
              role="group"
              aria-labelledby={`${labelId}-${parent.id}`}
              sx={{ display: 'grid', gap: 0.5 }}
            >
              <Typography
                id={`${labelId}-${parent.id}`}
                variant="sectionLabel"
                color="text.secondary"
              >
                {localName(parent, locale)}
              </Typography>
              {leaves.map((leaf) => (
                <Box
                  key={leaf.id}
                  component="button"
                  type="button"
                  aria-pressed={leaf.id === value}
                  onClick={() => {
                    onChange(leaf.id);
                    setOpen(false);
                  }}
                  sx={{
                    p: 1.5,
                    font: 'inherit',
                    textAlign: 'start',
                    cursor: 'pointer',
                    color: 'inherit',
                    border: 0,
                    borderRadius: radius.control,
                    fontWeight: leaf.id === value ? 700 : 400,
                    backgroundColor:
                      leaf.id === value ? palette('pp-chip') : 'transparent',
                    '&:focus-visible': insetFocusRingStyle,
                  }}
                >
                  {localName(leaf, locale)}
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      </Sheet>
    </Box>
  );
}
