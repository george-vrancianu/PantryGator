import { Box, GalleryIcon, PlusIcon, tokens } from '@pocket-pantry/ui';
import { useRef, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Fading } from './Fading';
import {
  glassFocusRing,
  shade,
  translucent,
} from '../../../components/camera/glass';

type Props = {
  /** Barcode reads on its own: Import fades out and leaves the tab order, keeping its place. */
  hidden: boolean;
  /** A photo is being prepared, or the Scan Cap blocks scanning. A denied camera does not disable it. */
  disabled: boolean;
  /** The files the Member picked, always at least one. */
  onFiles: (files: File[]) => void;
};

/**
 * The round Import button right of the shutter (handoff 5.4): a photo icon with a green "+", so it
 * reads as "add photos" rather than "open a gallery". It opens the file picker for several images.
 */
export function ImportButton({ hidden, disabled, onFiles }: Props) {
  const { t } = useTranslation('scan');
  const input = useRef<HTMLInputElement>(null);
  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length > 0) onFiles(files);
  };
  return (
    <Fading hidden={hidden} justify="end">
      <Box
        component="button"
        type="button"
        aria-label={t('import.label')}
        disabled={disabled}
        onClick={() => input.current?.click()}
        sx={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 50,
          height: 50,
          p: 0,
          borderRadius: '50%',
          border: 0,
          backgroundColor: translucent(tokens.color.ink, 14),
          color: tokens.color.ink,
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          '&:focus-visible': glassFocusRing,
        }}
      >
        <GalleryIcon size={24} strokeWidth={1.9} />
        <Box
          component="span"
          aria-hidden="true"
          sx={{
            position: 'absolute',
            top: -3,
            right: -3,
            width: 20,
            height: 20,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: tokens.color.accent,
            color: tokens.color.bg,
            boxShadow: `0 0 0 2px ${shade(90)}`,
          }}
        >
          <PlusIcon size={12} strokeWidth={2.4} />
        </Box>
      </Box>
      <Box
        component="input"
        ref={input}
        type="file"
        accept="image/*"
        multiple
        tabIndex={-1}
        onChange={pick}
        data-testid="import-input"
        sx={{ display: 'none' }}
      />
    </Fading>
  );
}
