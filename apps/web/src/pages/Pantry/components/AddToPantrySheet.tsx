import {
  Box,
  Button,
  CheckIcon,
  CloseIcon,
  displayType,
  IconButton,
  IngredientIcon,
  Sheet,
  useToast,
} from '@pocket-pantry/ui';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '../../../i18n/translateApiError';
import { formatRowAmount } from '../../../lib/amount';
import { flashRows } from '../../../lib/rowFlash';
import { UNDO_WINDOW_MS } from '../../../lib/useDeferredRemoval';
import { useDeleteBatch, type Batch } from '../../../lib/pantry';
import { useNavigate } from 'react-router-dom';
import type { StorageLocation } from '../../../lib/catalog';
import type { AddBatchStart } from '../hooks/useAddBatchForm';
import { useShowsDockMic } from '../../../components/VoiceNote';
import { useMicTeach } from '../../../components/voice/VoiceHost';
import { AddBatchForm, type SubmitState } from './AddBatchForm';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called once the sheet has slid away and focus is back on the opener. */
  onExited?: () => void;
  /** Start with an Ingredient picked, or an Unmatched name typed in; empty without. */
  start?: AddBatchStart;
  /** Every pick in this visit goes to this Location, camera picks included. */
  location?: StorageLocation;
};

/** Distance of the save toast from the bottom while the sheet is open, px (handoff 3.4). */
const TOAST_BOTTOM = 96;

/**
 * The Add to Pantry sheet: a modal bottom sheet over the Pantry. The title row is the header; the
 * body holds the add-Batch form, which focuses its search on open.
 *
 * A save keeps the sheet open: the form starts over (a new `key`, with no starting Ingredient), the
 * Added strip lists the Batch, and × becomes Done. Each save's toast offers Undo, which deletes that
 * Batch alone. On close the rows created this visit flash on the list.
 */
export function AddToPantrySheet({
  open,
  onClose,
  onExited,
  start,
  location,
}: Props) {
  const { t, i18n } = useTranslation('pantry');
  const toast = useToast();
  const searchRef = useRef<HTMLInputElement>(null);
  const deleteBatch = useDeleteBatch();
  // This visit: the Batches added (and not undone), and which form is showing (it starts over per save).
  const [added, setAdded] = useState<Batch[]>([]);
  const [formKey, setFormKey] = useState(0);
  // A new visit starts with an empty strip.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setAdded([]);
      setFormKey(0);
    }
  }
  // The footer's submit button: the form reports its label and whether it can save.
  const formId = useId();
  const [submit, setSubmit] = useState<SubmitState | null>(null);
  // The camera overlay owns Escape while it is up; the sheet must not close under it.
  const [cameraOpen, setCameraOpen] = useState(false);
  const showsMic = useShowsDockMic();
  const micTeach = useMicTeach();
  const leave = () => {
    flashRows(added.map((batch) => batch.id));
    onClose();
  };
  const navigate = useNavigate();
  const close = () => {
    if (!cameraOpen) leave();
  };
  const saved = (batch: Batch) => {
    setAdded((was) => [...was, batch]);
    setFormKey((was) => was + 1);
    const amount = formatRowAmount(batch, i18n.language, t);
    const parts = [
      batch.name,
      ...(amount ? [amount] : []),
      t(`common:locations.${batch.location}`),
    ];
    toast.show(t('form.addedToast', { details: parts.join(' · ') }), {
      polite: true,
      duration: UNDO_WINDOW_MS,
      bottom: TOAST_BOTTOM,
      action: {
        label: t('common:row.undo'),
        onClick: () => {
          setAdded((was) => was.filter((one) => one.id !== batch.id));
          deleteBatch.mutate(batch.id, {
            onError: (error) => toast.show(translateApiError(t, error)),
          });
        },
      },
    });
  };
  return (
    <Sheet
      open={open}
      onClose={close}
      onExited={onExited}
      initialFocus={searchRef}
      label={t('form.title')}
      header={
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            p: '4px 18px 10px',
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0, ...displayType, fontSize: 22 }}>
            {t('form.title')}
          </Box>
          {added.length > 0 ? (
            <Button size="sm" shape="pill" onClick={leave}>
              {t('form.done')}
            </Button>
          ) : (
            <IconButton
              label={t('form.close')}
              tone="neutral"
              size={40}
              onClick={leave}
            >
              <CloseIcon size={18} />
            </IconButton>
          )}
        </Box>
      }
      footer={
        submit ? (
          <Box sx={{ p: '12px 18px' }}>
            <Button
              type="submit"
              form={formId}
              fullWidth
              disabled={submit.disabled}
            >
              {submit.label}
            </Button>
          </Box>
        ) : null
      }
    >
      <Box sx={{ p: '0 18px 20px' }}>
        {added.length > 0 ? (
          <Box
            component="ul"
            aria-label={t('form.addedList', { count: added.length })}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              listStyle: 'none',
              m: '0 -18px 12px',
              p: '0 18px',
              overflowX: 'auto',
            }}
          >
            <Box
              component="li"
              aria-hidden
              sx={{
                flexShrink: 0,
                fontSize: 11.5,
                fontWeight: 700,
                textTransform: 'uppercase',
                color: 'text.secondary',
              }}
            >
              {t('form.added')}
            </Box>
            {added.map((batch) => (
              <Box
                component="li"
                key={batch.id}
                sx={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  height: 32,
                  p: '0 10px 0 4px',
                  borderRadius: '999px',
                  backgroundColor: 'pp.accentTint',
                  color: 'pp.accentOnTint',
                  fontSize: 12.5,
                  fontWeight: 700,
                }}
              >
                <IngredientIcon
                  size={24}
                  ingredientId={batch.ingredientId}
                  aisleId={batch.aisle?.id}
                />
                {batch.name}
                <CheckIcon size={16} />
              </Box>
            ))}
          </Box>
        ) : null}
        <AddBatchForm
          key={formKey}
          searchRef={searchRef}
          // The first form gets focus from the Sheet; the one after a save is the Member's doing.
          autoFocus={formKey > 0}
          start={formKey === 0 ? start : undefined}
          presetLocation={location}
          onSaved={saved}
          formId={formId}
          onSubmitChange={setSubmit}
          onCameraOpenChange={setCameraOpen}
          onSayIt={
            showsMic
              ? () => {
                  leave();
                  micTeach.start();
                }
              : undefined
          }
          onScanSeveral={(mode) => {
            leave();
            navigate(`/scan?mode=${mode}`);
          }}
        />
      </Box>
    </Sheet>
  );
}
