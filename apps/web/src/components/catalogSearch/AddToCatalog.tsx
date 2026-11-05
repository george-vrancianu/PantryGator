import {
  Box,
  CloseIcon,
  IconButton,
  Sheet,
  radius,
  shadow,
  tokens,
  useBreakpointUp,
  useToast,
} from '@pocket-pantry/ui';
import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogSearchResult } from '../../lib/catalog';
import { AddToCatalogForm, type PickOutcome } from './AddToCatalogForm';

/** Marks the button that opens the popover, so a tap on it is not an "outside" tap. */
export const ADD_TO_CATALOG_TRIGGER = 'data-add-to-catalog-trigger';

export type AddToCatalogProps = {
  open: boolean;
  /** The text typed in the search field. */
  typed: string;
  /** The Ingredient to pick, added or already there. */
  onPicked: (result: CatalogSearchResult) => void;
  /** Dismissed without picking; the search field takes focus back. */
  onDismiss: () => void;
  /** Allergens to pre-tick in the Contains row (a proposal; nothing is tagged until the Member saves). */
  initialAllergenIds?: readonly string[];
};

/**
 * Add to your catalog: a popover under the search field from tablet up, the
 * Sheet molecule on phones. Escape, a tap outside, × and Cancel dismiss it.
 */
export function AddToCatalog({
  open,
  typed,
  onPicked,
  onDismiss,
  initialAllergenIds,
}: AddToCatalogProps) {
  const { t, i18n } = useTranslation('catalog');
  const toast = useToast();
  const wide = useBreakpointUp('md');
  const categoryRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const picked = (result: CatalogSearchResult, outcome: PickOutcome) => {
    if (outcome.kind === 'added') {
      toast.show(
        t('catalogAdd.added', {
          name: result.name,
          category: result.leafCategory.name,
        }),
      );
    } else if (outcome.kind === 'linked') {
      toast.show(
        t('catalogAdd.linked', {
          name: outcome.name,
          ingredient: result.name,
        }),
      );
    }
    onPicked(result);
  };

  // A tap outside the popover dismisses it (the Sheet has its own scrim).
  useEffect(() => {
    if (!open || !wide) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (
        !target ||
        popoverRef.current?.contains(target) ||
        target.closest(`[${ADD_TO_CATALOG_TRIGGER}]`)
      ) {
        return;
      }
      onDismiss();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, wide, onDismiss]);

  if (!open) return null;

  const title = t('catalogAdd.title');
  const header = (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
        p: '14px 8px 0 14px',
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box component="h2" sx={{ m: 0, fontSize: 18, fontWeight: 700 }}>
          {title}
        </Box>
        <Box sx={{ fontSize: 12.5, color: tokens.color.muted }}>
          {t('catalogAdd.subtitle')}
        </Box>
      </Box>
      <IconButton
        label={t('catalogAdd.close')}
        tone="plain"
        size={34}
        onClick={onDismiss}
      >
        <CloseIcon size={18} />
      </IconButton>
    </Box>
  );
  const form = (
    <AddToCatalogForm
      key={i18n.language}
      typed={typed}
      categoryRef={categoryRef as RefObject<HTMLInputElement | null>}
      onPicked={picked}
      onCancel={onDismiss}
      initialAllergenIds={initialAllergenIds}
      autoFocus={wide}
    />
  );

  if (!wide) {
    return (
      <Sheet
        open
        label={title}
        header={header}
        size="content"
        onClose={onDismiss}
        initialFocus={categoryRef}
      >
        {form}
      </Sheet>
    );
  }

  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    // Escape closes the popover before it clears the search or reaches the host.
    event.preventDefault();
    event.stopPropagation();
    onDismiss();
  };
  return (
    <Box
      ref={popoverRef}
      role="dialog"
      aria-label={title}
      onKeyDown={keyDown}
      sx={{
        position: 'absolute',
        top: 58,
        left: 0,
        right: 0,
        zIndex: 10,
        borderRadius: radius.card,
        border: `1px solid ${tokens.color.line}`,
        backgroundColor: tokens.color.surface,
        boxShadow: shadow.float,
      }}
    >
      {header}
      {form}
    </Box>
  );
}
