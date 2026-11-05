import {
  Alert,
  BookmarkIcon,
  Box,
  Button,
  Sheet,
  TextField,
  Typography,
  displayType,
  radius,
  tokens,
  useToast,
} from '@pocket-pantry/ui';
import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { translateApiError } from '../../../i18n/translateApiError';
import {
  SHOPPING_TOAST_MS,
  useShoppingList,
  type ShoppingItem,
} from '../../../lib/shopping';
import {
  MAX_TEMPLATES,
  useTemplateMutations,
  useTemplates,
} from '../../../lib/shoppingTemplates';

export type SaveTemplateSheetProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * The short "Save as template" sheet: names the Shopping List and saves every
 * item on it, checked ones too, as a Shopping Template. A save closes the
 * sheet and toasts with an Edit action to the template editor.
 */
export function SaveTemplateSheet({ open, onClose }: SaveTemplateSheetProps) {
  const { t } = useTranslation('templates');
  const [form, setForm] = useState(0);
  // The body remounts on each opening so the name and any error start clean.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm((n) => n + 1);
  }
  return (
    <SaveForm
      key={form}
      open={open}
      onClose={onClose}
      title={t('save.title')}
    />
  );
}

function SaveForm({
  open,
  onClose,
  title,
}: SaveTemplateSheetProps & { title: string }) {
  const nameRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation(['templates', 'common', 'errors']);
  const toast = useToast();
  const navigate = useNavigate();
  const shoppingList = useShoppingList();
  const templates = useTemplates();
  const { createFromList } = useTemplateMutations();
  const [name, setName] = useState('');

  const items: ShoppingItem[] = (shoppingList.data?.groups ?? []).flatMap(
    (group) => group.items,
  );
  const atLimit = (templates.data?.length ?? 0) >= MAX_TEMPLATES;
  const trimmed = name.trim();
  const canSave =
    trimmed !== '' && items.length > 0 && !createFromList.isPending && !atLimit;

  const amountOf = (item: ShoppingItem) =>
    item.quantity === null
      ? ''
      : item.unit
        ? `${item.quantity} ${t(`common:units.${item.unit}`)}`
        : String(item.quantity);
  const preview = items
    .map((item) => {
      const amount = amountOf(item);
      return amount ? `${item.name} (${amount})` : item.name;
    })
    .join(', ');

  const save = (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSave) return;
    createFromList.mutate(trimmed, {
      onSuccess: (created) => {
        onClose();
        toast.show(t('templates:save.saved', { name: trimmed }), {
          duration: SHOPPING_TOAST_MS,
          action: {
            label: t('templates:save.edit'),
            onClick: () => navigate(`/shopping/templates/${created.id}`),
          },
        });
      },
    });
  };

  const header = (
    <Box
      sx={{
        p: '10px 16px 10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1.5,
      }}
    >
      <Typography component="h2" sx={{ ...displayType, fontSize: 22 }}>
        {title}
      </Typography>
      <Box
        component="button"
        type="button"
        onClick={onClose}
        sx={{
          height: 36,
          px: 2,
          border: 0,
          borderRadius: radius.pill,
          cursor: 'pointer',
          backgroundColor: tokens.color.ink,
          color: tokens.color.bg,
          font: 'inherit',
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        {t('templates:save.cancel')}
      </Box>
    </Box>
  );

  const footer = (
    <Box sx={{ p: '12px 20px 20px' }}>
      <Button
        fullWidth
        startIcon={<BookmarkIcon size={18} />}
        disabled={!canSave}
        onClick={() => save()}
        sx={{ minHeight: 48, borderRadius: radius.control }}
      >
        {createFromList.isPending
          ? t('templates:save.saving')
          : t('templates:save.submit')}
      </Button>
    </Box>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      label={title}
      size="content"
      initialFocus={nameRef}
      header={header}
      footer={footer}
    >
      <Box
        component="form"
        onSubmit={save}
        noValidate
        sx={{
          p: '4px 20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {createFromList.error ? (
          <Alert>{translateApiError(t, createFromList.error)}</Alert>
        ) : null}
        <Box>
          <TextField
            label={t('templates:save.name')}
            placeholder={t('templates:save.placeholder')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            inputRef={nameRef}
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          {atLimit ? (
            <Typography
              variant="meta"
              sx={{ mt: 0.75, color: tokens.color.muted }}
            >
              {t('errors:shopping.template_limit_reached', {
                max: MAX_TEMPLATES,
              })}
            </Typography>
          ) : null}
        </Box>
        <Box component="section">
          <Typography
            component="h3"
            variant="sectionLabel"
            sx={{ mx: 0.5, mb: 1, color: tokens.color.muted }}
          >
            {t('templates:save.preview', { count: items.length })}
          </Typography>
          <Box
            sx={{ fontSize: 13.5, lineHeight: 1.5, color: tokens.color.muted }}
          >
            {preview}
          </Box>
        </Box>
      </Box>
    </Sheet>
  );
}
