import { Box, palette, radius } from '@pocket-pantry/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** The small butter pill after an ingredient's name: "Family", "Unmatched". */
export function NamePill({ children }: { children: ReactNode }) {
  return (
    <Box
      component="span"
      sx={{
        flexShrink: 0,
        ml: '7px',
        px: '7px',
        py: '2px',
        borderRadius: radius.tag,
        backgroundColor: palette('secondary-main'),
        color: palette('secondary-contrastText'),
        fontSize: 10.5,
        fontWeight: 700,
        verticalAlign: 'middle',
      }}
    >
      {children}
    </Box>
  );
}

/** The "Family" pill after the name of a Family Ingredient: row, token. */
export function FamilyTag() {
  const { t } = useTranslation('catalog');
  return <NamePill>{t('search.familyTag')}</NamePill>;
}
