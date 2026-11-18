import { Box, insetFocusRing, palette } from '@pocket-pantry/ui';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { displayName, type ReviewLine } from '@/lib/review';
import { EXCLUDED_TOGGLE_ID } from '../layout';

type Props = {
  lines: ReviewLine[];
  onRestore: (key: string) => void;
};

/**
 * Last in the table: lines left out of the Pantry, collapsed. That is receipt
 * lines the Scan excluded (carrier bags, fees, unreadable lines) and lines the
 * Member removed. Each can be added back.
 */
export function ExcludedRow({ lines, onRestore }: Props) {
  const { t } = useTranslation('review');
  const listId = useId();
  const [open, setOpen] = useState(false);
  if (lines.length === 0) return null;

  return (
    <Box
      component="section"
      aria-label={t('excluded.title', { count: lines.length })}
      sx={{ borderTop: `1px solid ${palette('divider')}` }}
    >
      <Box
        component="button"
        type="button"
        aria-expanded={open}
        id={EXCLUDED_TOGGLE_ID}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((was) => !was)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          minHeight: 52,
          px: '12px',
          border: 0,
          bgcolor: palette('pp-subtle'),
          fontFamily: 'inherit',
          textAlign: 'left',
          cursor: 'pointer',
          ...insetFocusRing,
        }}
      >
        <Box>
          <Box
            sx={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: palette('text-secondary'),
            }}
          >
            {t('excluded.title', { count: lines.length })}
          </Box>
          <Box sx={{ fontSize: 12, color: palette('text-secondary') }}>
            {t('excluded.hint')}
          </Box>
        </Box>
        <Box
          sx={{ fontSize: 13, fontWeight: 700, color: palette('pp-accent') }}
        >
          {t(open ? 'excluded.hide' : 'excluded.show')}
        </Box>
      </Box>
      <Box
        id={listId}
        component="ul"
        hidden={!open}
        sx={{ m: 0, p: 0, listStyle: 'none' }}
      >
        {open
          ? lines.map((line) => {
              const name = displayName(line);
              return (
                <Box
                  key={line.key}
                  component="li"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    px: '12px',
                    py: '8px',
                    borderTop: `1px solid ${palette('divider')}`,
                  }}
                >
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Box sx={{ fontSize: 14, fontWeight: 600 }}>{name}</Box>
                    <Box
                      sx={{ fontSize: 12, color: palette('text-secondary') }}
                    >
                      {t(`excluded.reason.${line.excluded?.reason ?? 'other'}`)}
                    </Box>
                  </Box>
                  <Box
                    component="button"
                    type="button"
                    aria-label={t('excluded.restoreFor', { name })}
                    onClick={() => onRestore(line.key)}
                    sx={{
                      minHeight: 40,
                      px: '10px',
                      border: 0,
                      bgcolor: 'transparent',
                      color: palette('pp-accent'),
                      fontFamily: 'inherit',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      ...insetFocusRing,
                    }}
                  >
                    {t('excluded.restore')}
                  </Box>
                </Box>
              );
            })
          : null}
      </Box>
    </Box>
  );
}
