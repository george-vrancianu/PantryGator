import {
  Box,
  CameraIcon,
  color,
  MicIcon,
  focusRing,
  radius,
  ScanBarcodeIcon,
  shadow,
} from '@pocket-pantry/ui';
import type { MouseEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { CameraMode } from '@/lib/cameraMode';

type Props = {
  /** Set to the tile that opened the camera, so focus can return to it. */
  openerRef: { current: HTMLButtonElement | null };
  onOpen: (mode: CameraMode) => void;
  /** Present when the Dock has a mic: closes the sheet and lights it. */
  onSayIt?: () => void;
};

/** The Add to Pantry sheet's fastest ways in: the camera on Product, or on Barcode, or Say it, which lights the Dock mic. */
export function QuickRow({ openerRef, onOpen, onSayIt }: Props) {
  const { t } = useTranslation('pantry');
  return (
    <Box
      role="group"
      aria-label={t('form.quick.label')}
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${onSayIt ? 3 : 2}, minmax(0, 1fr))`,
        gap: '10px',
      }}
    >
      <Tile
        label={t('form.quick.photo')}
        icon={<CameraIcon size={22} />}
        openerRef={openerRef}
        onOpen={() => onOpen('product')}
      />
      <Tile
        label={t('form.quick.barcode')}
        icon={<ScanBarcodeIcon size={22} />}
        openerRef={openerRef}
        onOpen={() => onOpen('barcode')}
      />
      {onSayIt ? (
        <Tile
          label={t('form.quick.sayIt')}
          icon={<MicIcon size={22} />}
          openerRef={openerRef}
          onOpen={onSayIt}
        />
      ) : null}
    </Box>
  );
}

function Tile({
  label,
  icon,
  openerRef,
  onOpen,
}: {
  label: string;
  icon: ReactNode;
  openerRef: { current: HTMLButtonElement | null };
  onOpen: () => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        openerRef.current = event.currentTarget;
        onOpen();
      }}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '11px',
        height: 96,
        p: 0,
        font: 'inherit',
        fontSize: 13.5,
        lineHeight: 1.15,
        fontWeight: 700,
        color: 'text.primary',
        backgroundColor: color.cardBg,
        border: `1px solid ${color.cardLine}`,
        borderRadius: radius.card,
        boxShadow: shadow.card,
        cursor: 'pointer',
        '&:hover': { backgroundColor: 'pp.subtle' },
        ...focusRing,
      }}
    >
      <Box
        aria-hidden="true"
        sx={{
          width: 40,
          height: 40,
          display: 'grid',
          placeItems: 'center',
          borderRadius: radius.control,
          backgroundColor: 'pp.accentTint',
          color: 'pp.accent',
        }}
      >
        {icon}
      </Box>
      {label}
    </Box>
  );
}
