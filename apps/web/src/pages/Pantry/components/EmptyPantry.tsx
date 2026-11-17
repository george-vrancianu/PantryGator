import {
  Box,
  Chip,
  color,
  Gator,
  MicIcon,
  ManualEntryIcon,
  radius,
  ReceiptIcon,
  shadow,
  focusRing,
  Typography,
} from '@pocket-pantry/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useShowsDockMic } from '../../../components/VoiceNote';
import { useMicTeach } from '../../../components/voice/VoiceHost';
import { LOCATIONS, type StorageLocation } from '../../../lib/catalog';
import { FILTERS } from '../../../lib/pantry';
import { useShoppingList } from '../../../lib/shopping';
import { ShelfCard } from './ShelfCard';
import { TickedBar } from './TickedBar';

type Props = {
  /** Type: the Add to Pantry sheet with nothing preset. */
  onType: () => void;
  /** A shelf card's "+". */
  onAddTo: (location: StorageLocation) => void;
  /** Owned by the page, so Gator's entrance plays once per visit to it, not once per session. */
  visit: PantryVisit;
};

export type PantryVisit = {
  entrancePlayed: () => boolean;
  markEntrancePlayed: () => void;
};

/** One visit to the Pantry page; make it once per mount. */
export function newPantryVisit(): PantryVisit {
  let played = false;
  return {
    entrancePlayed: () => played,
    markEntrancePlayed: () => {
      played = true;
    },
  };
}

/**
 * The Empty Pantry (no Batches): dimmed Location chips, the ticked-items bar, Gator's banner with the
 * quickest ways in, and one empty shelf per Location.
 */
export function EmptyPantry({ onType, onAddTo, visit }: Props) {
  const { t } = useTranslation(['pantry', 'common']);
  const navigate = useNavigate();
  const showsMic = useShowsDockMic();
  const micTeach = useMicTeach();
  const checked = useShoppingList().data?.summary.checked ?? 0;
  const [entrance] = useState(() => !visit.entrancePlayed());
  useEffect(() => {
    visit.markEntrancePlayed();
  }, [visit]);
  const [taps, setTaps] = useState(0);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* A preview of the page's shape: not a control while there is nothing to filter. */}
      <Box
        aria-hidden="true"
        inert
        sx={{ display: 'flex', gap: '8px', overflowX: 'auto', opacity: 0.55 }}
      >
        {FILTERS.map((chip) => (
          <Chip
            key={chip}
            selected={chip === 'all'}
            label={
              chip === 'all' ? t('pantry:all') : t(`common:locations.${chip}`)
            }
          />
        ))}
      </Box>
      {checked > 0 ? (
        <TickedBar
          count={checked}
          onMove={() => navigate('/shopping?finish=1')}
        />
      ) : null}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          minHeight: 132,
          p: '12px 12px 12px 0',
          overflow: 'hidden',
          borderRadius: radius.card,
          backgroundColor: 'pp.accentTint',
        }}
      >
        <Box
          component="button"
          type="button"
          aria-label={t('pantry:empty.gatorAlt')}
          onClick={() => setTaps((n) => n + 1)}
          sx={{
            flex: 'none',
            alignSelf: 'flex-end',
            p: 0,
            border: 0,
            background: 'none',
            cursor: 'pointer',
            m: '-4px -4px -12px -8px',
            ...focusRing,
          }}
        >
          <Gator
            mood="list-keeper"
            size={110}
            loop="signature"
            entrance={entrance}
            tapSignal={taps}
            decorative
          />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1.3,
              color: color.accentOnTint,
            }}
          >
            {t('pantry:empty.gatorLine')}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px', mt: 1 }}>
            <Pill
              icon={<ReceiptIcon size={16} />}
              label={t('pantry:empty.scan')}
              onClick={() => navigate('/scan?mode=receipt')}
            />
            {showsMic ? (
              <Pill
                icon={<MicIcon size={16} />}
                label={t('pantry:empty.sayIt')}
                onClick={micTeach.start}
              />
            ) : null}
            <Pill
              icon={<ManualEntryIcon size={16} />}
              label={t('pantry:empty.type')}
              onClick={onType}
            />
          </Box>
        </Box>
      </Box>
      {LOCATIONS.map((location) => (
        <ShelfCard key={location} location={location} onAdd={onAddTo} />
      ))}
    </Box>
  );
}

function Pill({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        height: 36,
        p: '0 11px 0 9px',
        font: 'inherit',
        fontSize: 13,
        fontWeight: 700,
        color: 'text.primary',
        backgroundColor: color.cardBg,
        border: 0,
        borderRadius: radius.chip,
        boxShadow: shadow.card,
        cursor: 'pointer',
        ...focusRing,
      }}
    >
      <Box aria-hidden="true" sx={{ display: 'grid', color: 'pp.accent' }}>
        {icon}
      </Box>
      {label}
    </Box>
  );
}
