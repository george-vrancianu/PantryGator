import {
  Box,
  BookPlusIcon,
  CloseIcon,
  IconButton,
  SearchIcon,
  palette,
  visuallyHidden,
  radius,
  shadow,
  border,
  color as themeColor,
} from '@pocket-pantry/ui';
import type { ChangeEvent, KeyboardEvent, ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogSearchResult } from '@/lib/catalog';
import { ADD_TO_CATALOG_TRIGGER } from '../AddToCatalog/AddToCatalog';
import { SelectedToken } from '../SelectedToken/SelectedToken';

export type SearchFieldProps = {
  inputRef: Ref<HTMLInputElement>;
  /** DOM id of the input, for a host that moves focus to it by id. */
  inputId?: string;
  /** Accessible name when nothing is selected. */
  label: string;
  /** Placeholder when empty; defaults to the generic search one. */
  placeholder?: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  autoFocus?: boolean;
  describedBy?: string;
  /** Combobox wiring: the listbox it controls and whether it is showing. */
  listboxId: string;
  expanded: boolean;
  activeOptionId?: string;
  /** The picked ingredient; the field then shows it as a token over a hidden input. */
  selected: CatalogSearchResult | null;
  /** Shown in the token after the name. */
  selectedTag?: ReactNode;
  /** Shown in the token in place of the leaf and Aisle. */
  selectedMeta?: string;
  /** Clears the text (and the selection); wired to × and to the token. */
  onClear: () => void;
  /** Show the clear × even with no text (an Aisle is open). */
  canClear?: boolean;
  /** The "Add to your catalog" button, shown before the clear × while text is typed. */
  addToCatalog?: { label: string; open: boolean; onOpen: () => void } | null;
  /** Rows are showing while newer results load: the spinner takes the right slot. */
  refetching: boolean;
  reducedMotion: boolean;
};

const SPINNER_SIZE = 18;

/** The 48 pt search input: search icon, a right slot (spinner or clear ×), and the selected token. */
export function SearchField({
  inputRef,
  inputId,
  label,
  placeholder,
  value,
  onChange,
  onKeyDown,
  onFocus,
  autoFocus,
  describedBy,
  listboxId,
  expanded,
  activeOptionId,
  selected,
  selectedTag,
  selectedMeta,
  onClear,
  canClear = false,
  addToCatalog = null,
  refetching,
  reducedMotion,
}: SearchFieldProps) {
  const { t } = useTranslation('catalog');

  const rightSlot = selected ? null : refetching ? (
    <Box
      data-testid="search-spinner"
      data-spinning={reducedMotion ? 'false' : 'true'}
      aria-hidden="true"
      sx={{
        width: SPINNER_SIZE,
        height: SPINNER_SIZE,
        m: '9px',
        boxSizing: 'border-box',
        borderRadius: '50%',
        border: `2px solid ${palette('pp-accentTint')}`,
        borderTopColor: palette('pp-accent'),
        ...(reducedMotion
          ? { opacity: 0.7 }
          : {
              '@keyframes pp-search-spin': {
                to: { transform: 'rotate(360deg)' },
              },
              animation: 'pp-search-spin 800ms linear infinite',
            }),
      }}
    />
  ) : value || canClear ? (
    <IconButton
      label={t('search.clear')}
      tone="plain"
      size={34}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClear}
    >
      <CloseIcon size={18} />
    </IconButton>
  ) : null;

  return (
    <Box
      sx={{
        position: 'relative',
        height: 48,
        display: 'flex',
        alignItems: 'center',
        borderRadius: radius.control,
        border: `${border.field} solid transparent`,
        // A recessed well (Canopy 5: Field on a sheet).
        backgroundColor: themeColor.fieldBg,
        boxShadow: shadow.recess,
        '&:focus-within': {
          boxShadow: `${shadow.recess}, 0 0 0 3px ${palette('pp-accentTint')}`,
        },
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          left: 14,
          display: 'flex',
          color: palette('text-secondary'),
        }}
      >
        <SearchIcon size={20} />
      </Box>
      <Box
        component="input"
        ref={inputRef}
        id={inputId}
        role="combobox"
        aria-label={
          selected ? t('search.selectedLabel', { name: selected.name }) : label
        }
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listboxId}
        aria-describedby={describedBy}
        aria-activedescendant={activeOptionId}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        autoFocus={autoFocus}
        placeholder={placeholder ?? t('search.placeholder')}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        sx={{
          flex: 1,
          minWidth: 0,
          height: '100%',
          pl: '46px',
          pr: addToCatalog && !selected ? '88px' : '44px',
          border: 0,
          outline: 0,
          background: 'transparent',
          font: 'inherit',
          fontSize: 16,
          fontWeight: 500,
          color: palette('text-primary'),
          '&::placeholder': { color: palette('text-secondary') },
          // As a token the real input stays for focus and semantics, but unseen.
          ...(selected ? visuallyHidden : {}),
        }}
      />
      <Box sx={{ position: 'absolute', right: 6, display: 'flex', gap: '2px' }}>
        {addToCatalog && !selected ? (
          <IconButton
            {...{ [ADD_TO_CATALOG_TRIGGER]: '' }}
            label={addToCatalog.label}
            aria-haspopup="dialog"
            aria-expanded={addToCatalog.open}
            tone={addToCatalog.open ? 'accent' : 'accentOutline'}
            size={34}
            onMouseDown={(event) => event.preventDefault()}
            onClick={addToCatalog.onOpen}
          >
            <BookPlusIcon size={18} />
          </IconButton>
        ) : null}
        {rightSlot}
      </Box>
      {selected ? (
        <SelectedToken
          selected={selected}
          onClear={onClear}
          tag={selectedTag}
          meta={selectedMeta}
        />
      ) : null}
    </Box>
  );
}
