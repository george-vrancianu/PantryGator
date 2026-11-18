import {
  Box,
  palette,
  usePrefersReducedMotion,
  visuallyHidden,
  focusRing,
  radius,
  readSafeInsets,
  Popper,
  shadow,
} from '@pocket-pantry/ui';
import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  useCatalogSearch,
  type CatalogAisle,
  type CatalogScopeName,
  type CatalogSearchResult,
} from '@/lib/catalog';
import { normalizeName } from '@/lib/normalizeName';
import { AddToCatalog } from '../AddToCatalog/AddToCatalog';
import { AddToCatalogRow } from '../AddToCatalogRow/AddToCatalogRow';
import { AisleViewHeader } from '../AisleView/AisleView';
import { CatalogSearchEmptyStateContext } from '../emptyState/context';
import { ErrorRow } from '../ErrorRow/ErrorRow';
import { NoMatchRow } from '../NoMatchRow/NoMatchRow';
import { SearchField } from '../SearchField/SearchField';
import { SearchResultRow } from '../SearchResultRow/SearchResultRow';
import { SearchSkeleton } from '../SearchSkeleton/SearchSkeleton';
import { UseTypedRow } from '../UseTypedRow/UseTypedRow';

/** How tall the results popover grows before it scrolls, inline or contained. */
const POPOVER_MAX_HEIGHT = 360;

export type CatalogSearchProps = {
  onSelect: (ingredient: CatalogSearchResult) => void;
  autoFocus?: boolean;
  /** Called with the text as the Member types it (not on selection). */
  onQueryChange?: (query: string) => void;
  /** Accessible name of the input and its listbox; defaults to the generic search label. */
  label?: string;
  /** Placeholder of the empty field; defaults to the generic one. */
  placeholder?: string;
  /** Id of an element that describes the input. */
  describedBy?: string;
  /** Show the default unit as a chip on each row (default true). */
  showUnit?: boolean;
  /**
   * The picked ingredient, shown as a token. The host owns it: the token is
   * cleared (by ×, a tap, Backspace/Delete or typing) by calling
   * `onQueryChange('')`, so a host passing `selected` must drop it when
   * `onQueryChange` reports an empty query (and may also drop it for any change).
   */
  selected?: CatalogSearchResult | null;
  /** A pill shown in the token after the name. */
  selectedTag?: ReactNode;
  /** Shown in the token in place of "{leaf} · {aisle}". */
  selectedMeta?: string;
  /**
   * Host blocks shown while the field is focused and empty. Blocks reach the
   * search through `useEmptyStateSearch` (pick, open an Aisle), not props.
   */
  emptyState?: ReactNode;
  /** When given, the no-match state ends with a "Use “…” as typed" option. */
  onUseTyped?: (name: string) => void;
  /** `shared` searches the shared Catalog only (Admin); default `family`. */
  scope?: CatalogScopeName;
  /**
   * A short pill for a row (for example "On list"), or null for none. Called
   * for each result (with its id) and for the Use as typed row (id null).
   */
  rowTag?: (row: {
    ingredientId: string | null;
    name: string;
  }) => string | null;
  /** Show the empty state before the field is focused (it then stays until typing, a pick or Escape). */
  defaultOpen?: boolean;
  /** The text the field starts with, for a host that keeps it across remounts. A later change to it replaces the text. */
  defaultQuery?: string;
  /** The search input, for a host that moves focus into it. */
  inputRef?: RefObject<HTMLInputElement | null>;
  /** DOM id of the search input, for a host that moves focus to it by id. */
  inputId?: string;
  /** Allergens a Family Ingredient created from this search starts with ticked (a proposal, not a tag). */
  newIngredientAllergenIds?: readonly string[];
  /**
   * Inline presentation: the empty state and the results float in a popover
   * under the field instead of pushing the page down. Default off.
   */
  inline?: boolean;
  /**
   * `row` is the compact row of an editor card: 50 pt, no floating well, the search icon in the
   * accent, × to clear. Implies `inline`; the popover is positioned by the design system's
   * `Popper` (not clipped by the card, flips up and stays inside the viewport near the bottom of a
   * short screen). Default `field`.
   */
  variant?: 'field' | 'row';
};

/**
 * Reusable Catalog search (WAI-ARIA combobox with a listbox popup). Names come
 * back in the Member's locale; ArrowUp/Down move (wrapping), Home/End jump,
 * Enter selects, Escape closes. A pick can be shown as a token the host owns.
 */
export function CatalogSearch({
  onSelect,
  autoFocus,
  onQueryChange,
  label,
  placeholder,
  describedBy,
  showUnit = true,
  selected = null,
  selectedTag,
  selectedMeta,
  emptyState,
  onUseTyped,
  scope = 'family',
  defaultQuery = '',
  rowTag,
  defaultOpen = false,
  inputRef: hostInputRef,
  inputId,
  newIngredientAllergenIds,
  inline: inlineProp = false,
  variant = 'field',
}: CatalogSearchProps) {
  const row = variant === 'row';
  const inline = inlineProp || row;
  const { t } = useTranslation('catalog');
  const id = useId();
  const name = label ?? t('search.label');
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${index}`;
  const ownInputRef = useRef<HTMLInputElement>(null);
  const inputRef = hostInputRef ?? ownInputRef;
  const reducedMotion = usePrefersReducedMotion();
  // The row's popover hangs from the whole row; it keeps clear of the bottom edge and the home indicator.
  // The Dock is hidden on the Recipe editor routes (dockState), so the row clears only the safe inset,
  // not `dockBottomPx()`; the inset is read once, so it does not follow a rotation.
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [viewportInset] = useState(() =>
    row ? readSafeInsets().bottom + 8 : 8,
  );

  const [query, setQuery] = useState(defaultQuery);
  // The host can set the text after the first render (a Barcode Lookup's product name): a new
  // `defaultQuery` replaces the typed text. Typing never changes the prop, so it is not undone.
  const [seenDefault, setSeenDefault] = useState(defaultQuery);
  if (seenDefault !== defaultQuery) {
    setSeenDefault(defaultQuery);
    setQuery(defaultQuery);
  }
  const [open, setOpen] = useState(defaultOpen);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Add to your catalog is showing (popover or Sheet).
  const [adding, setAdding] = useState(false);
  // The aisle view (Browse by aisle): an Aisle opened from the empty state, and the Parent Category narrowing it.
  const [aisle, setAisle] = useState<CatalogAisle | null>(null);
  const [parentCategoryId, setParentCategoryId] = useState<string | null>(null);
  const search = useCatalogSearch(
    query,
    scope,
    aisle ? { aisleId: aisle.id, parentCategoryId } : null,
  );
  const typed = query.trim();
  // Something to list: the typed text, or an opened Aisle.
  const querying = typed !== '' || aisle !== null;

  // A failed search keeps the rows that were already showing, under the error row.
  const [lastRows, setLastRows] = useState<CatalogSearchResult[]>([]);
  if (search.data && search.data !== lastRows) setLastRows(search.data);
  const failed = querying && search.active && search.isError;
  const loaded = search.data ?? (failed ? lastRows : undefined);
  // The debounce lags a cleared field, so go by what is typed now.
  const results = querying && search.active ? (loaded ?? []) : [];

  const firstLoad = querying && search.active && !search.data && !failed;
  // Any data on hand (even none matching) keeps the panel and shows the spinner.
  const refetching =
    querying &&
    search.active &&
    search.data !== undefined &&
    search.isSearching &&
    !failed;
  const noMatch =
    typed !== '' &&
    search.active &&
    search.data !== undefined &&
    results.length === 0 &&
    !failed;

  // "Use as typed" ends the list unless a result already has the typed name.
  const useTypedOffered =
    onUseTyped !== undefined &&
    typed !== '' &&
    search.active &&
    search.data !== undefined &&
    !failed &&
    !results.some(
      (result) => normalizeName(result.name) === normalizeName(typed),
    );
  // Add to your catalog: a button in the field, and the first option when nothing matches.
  const canAdd = scope !== 'shared' && !selected;
  const addOptionOffered = canAdd && noMatch;
  const addOffset = addOptionOffered ? 1 : 0;
  const optionCount = addOffset + results.length + (useTypedOffered ? 1 : 0);

  const showPanel = open && !selected;
  const expanded = showPanel && optionCount > 0;
  const aisleShown = aisle !== null && showPanel;
  const emptyShown =
    Boolean(emptyState) && open && typed === '' && !selected && !aisle;
  const active = activeIndex < optionCount ? activeIndex : -1;

  const change = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
    onQueryChange?.(event.target.value);
    setOpen(true);
    setActiveIndex(-1);
  };

  const clear = () => {
    setAisle(null);
    setParentCategoryId(null);
    setQuery('');
    setOpen(true);
    setActiveIndex(-1);
    onQueryChange?.('');
    inputRef.current?.focus();
  };

  const leaveAisle = () => {
    setAisle(null);
    setParentCategoryId(null);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const select = (ingredient: CatalogSearchResult) => {
    setAisle(null);
    setParentCategoryId(null);
    setQuery(ingredient.name);
    setOpen(false);
    setActiveIndex(-1);
    onSelect(ingredient);
  };

  const openAdd = () => {
    setAdding(true);
    setOpen(false);
    setActiveIndex(-1);
  };

  /** Closes Add to your catalog; the typed text stays and the field takes focus back. */
  const dismissAdd = () => {
    setAdding(false);
    // A tap outside moves focus after this handler runs, so wait for it.
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const pickAdded = (ingredient: CatalogSearchResult) => {
    setAdding(false);
    select(ingredient);
  };

  const pickTyped = () => {
    setOpen(false);
    setActiveIndex(-1);
    onUseTyped?.(typed);
  };

  /** Picks option `index`: "Add to your catalog" first when offered, then the results, then "Use as typed". */
  const pick = (index: number) => {
    if (addOptionOffered && index === 0) openAdd();
    else if (index - addOffset < results.length) {
      select(results[index - addOffset]);
    } else pickTyped();
  };

  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (selected) {
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        clear();
      } else if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        // Typing over a token replaces it; the key then lands in the emptied input.
        clear();
      }
      return;
    }
    if (event.key === 'ArrowDown' && optionCount > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((active + 1) % optionCount);
    } else if (event.key === 'ArrowUp' && optionCount > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(active <= 0 ? optionCount - 1 : active - 1);
    } else if (event.key === 'Home' && expanded && active >= 0) {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End' && expanded && active >= 0) {
      event.preventDefault();
      setActiveIndex(optionCount - 1);
    } else if (event.key === 'Enter' && expanded && active >= 0) {
      event.preventDefault();
      pick(active);
    } else if (event.key === 'Enter' && expanded && !search.isSearching) {
      // No row is active: pick the first option (the first result; with no
      // match, "Use as typed" or "Add to your catalog"), once the results for
      // what is typed have arrived.
      event.preventDefault();
      pick(0);
    } else if (
      event.key === 'Escape' &&
      open &&
      (typed !== '' || emptyShown || aisleShown)
    ) {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    } else if (event.key === 'Escape' && !open && aisle) {
      // A second Escape drops the aisle the first one hid, so it can't come back unseen.
      event.preventDefault();
      setAisle(null);
      setParentCategoryId(null);
    }
  };

  let status = '';
  if (showPanel && querying && search.active) {
    if (failed) status = t('search.failed');
    else if (firstLoad || (results.length === 0 && search.isSearching)) {
      status = t('search.searching');
    } else if (results.length === 0) status = t('search.noResults');
    else status = t('search.resultCount', { count: results.length });
  } else if (showPanel && querying) {
    // Typing ahead of the debounce.
    status = t('search.searching');
  }

  const panelVisible =
    showPanel &&
    (aisleShown ||
      (typed !== '' && (expanded || firstLoad || failed || noMatch)));

  const cardSurface = {
    borderRadius: radius.card,
    border: `1px solid ${palette('pp-line')}`,
    backgroundColor: palette('background-paper'),
  };
  const floatingSurface = { ...cardSurface, boxShadow: shadow.float };
  const popoverSx =
    inline && !row
      ? {
          position: 'absolute' as const,
          left: 0,
          right: 0,
          top: '100%',
          zIndex: 5,
          maxHeight: POPOVER_MAX_HEIGHT,
          overflowY: 'auto' as const,
          ...floatingSurface,
        }
      : null;
  const popoverOpen = inline && (emptyShown || panelVisible);
  const rowPopoverSx = {
    width: anchor?.offsetWidth,
    maxWidth: '100%',
    boxSizing: 'border-box' as const,
    ...floatingSurface,
  };

  const popoverContent = (
    <>
      {emptyShown ? (
        // Taps inside land without the field losing focus. A block that renders nothing leaves no gap.
        <Box
          onMouseDown={(event) => event.preventDefault()}
          sx={{
            mt: inline ? 0 : 2,
            p: inline ? '12px 12px 4px' : 0,
            '&:empty': { display: 'none' },
          }}
        >
          <CatalogSearchEmptyStateContext.Provider
            value={{
              select,
              scope,
              openAisle: (opened) => {
                setAisle(opened);
                setParentCategoryId(null);
                setActiveIndex(-1);
                // The chip that opened it is gone; keep keyboard focus in the field.
                inputRef.current?.focus();
              },
            }}
          >
            {emptyState}
          </CatalogSearchEmptyStateContext.Provider>
        </Box>
      ) : null}
      <Box
        hidden={!panelVisible}
        sx={
          inline
            ? { overflow: 'hidden' }
            : {
                mt: 1,
                ...cardSurface,
                overflow: 'hidden',
              }
        }
      >
        {inline && aisle && aisleShown ? (
          <Box
            component="button"
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={leaveAisle}
            sx={{
              display: 'block',
              border: 0,
              background: 'transparent',
              color: palette('pp-accent'),
              font: 'inherit',
              fontSize: 13,
              fontWeight: 600,
              p: '10px 14px 0',
              cursor: 'pointer',
              ...focusRing,
            }}
          >
            {`‹ ${t('search.backToAisles')}`}
          </Box>
        ) : null}
        {aisle && aisleShown ? (
          <AisleViewHeader
            aisle={aisle}
            parentCategoryId={parentCategoryId}
            onParentCategory={(id) => {
              setParentCategoryId(id);
              setActiveIndex(-1);
            }}
            failed={failed}
            query={search.query}
            count={
              search.data && !search.isSearching && !failed
                ? search.data.length
                : null
            }
            onLeave={leaveAisle}
          />
        ) : null}
        {failed ? (
          <ErrorRow
            onRetry={() => {
              // The error row unmounts as the refetch starts; keep focus in the field.
              inputRef.current?.focus();
              void search.refetch();
            }}
          />
        ) : null}
        {firstLoad ? <SearchSkeleton animate={!reducedMotion} /> : null}
        {noMatch ? (
          <NoMatchRow query={search.query} inAisle={aisle !== null} />
        ) : null}
        <Box
          component="ul"
          id={listId}
          role="listbox"
          aria-label={name}
          hidden={!expanded}
          sx={{ listStyle: 'none', m: 0, p: 0 }}
        >
          {addOptionOffered ? (
            <AddToCatalogRow
              id={optionId(0)}
              name={typed}
              active={active === 0}
              onSelect={openAdd}
            />
          ) : null}
          {expanded &&
            results.map((result, index) => (
              <SearchResultRow
                key={result.id}
                id={optionId(addOffset + index)}
                result={result}
                query={typed}
                showUnit={showUnit}
                active={addOffset + index === active}
                dimmed={
                  refetching && !reducedMotion && addOffset + index !== active
                }
                first={index === 0}
                tag={rowTag?.({ ingredientId: result.id, name: result.name })}
                onSelect={() => select(result)}
              />
            ))}
          {useTypedOffered ? (
            <UseTypedRow
              id={optionId(addOffset + results.length)}
              name={typed}
              active={addOffset + results.length === active}
              first={addOffset + results.length === 0}
              tag={rowTag?.({ ingredientId: null, name: typed })}
              onSelect={pickTyped}
            />
          ) : null}
        </Box>
      </Box>
    </>
  );

  return (
    <Box
      ref={setAnchor}
      sx={{ position: 'relative' }}
      onBlur={
        inline
          ? (event) => {
              // Focus left the search (a tap or click outside, or Tab away): close the popover.
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setOpen(false);
                setActiveIndex(-1);
              }
            }
          : undefined
      }
    >
      <SearchField
        inputRef={inputRef}
        inputId={inputId}
        label={name}
        placeholder={placeholder}
        value={query}
        onChange={change}
        onKeyDown={keyDown}
        onFocus={() => setOpen(true)}
        autoFocus={autoFocus}
        describedBy={describedBy}
        listboxId={listId}
        expanded={expanded}
        activeOptionId={expanded && active >= 0 ? optionId(active) : undefined}
        selected={selected}
        selectedTag={selectedTag}
        selectedMeta={selectedMeta}
        onClear={clear}
        canClear={aisle !== null}
        addToCatalog={
          canAdd && typed !== ''
            ? {
                label: t('search.addToCatalog', { query: typed }),
                open: adding,
                onOpen: adding ? dismissAdd : openAdd,
              }
            : null
        }
        refetching={refetching}
        variant={variant}
        reducedMotion={reducedMotion}
      />
      <Box role="status" aria-live="polite" sx={visuallyHidden}>
        {status}
      </Box>
      {row ? (
        <Popper
          open={popoverOpen}
          anchorEl={anchor}
          placement="bottom-start"
          // As tall as the inline popover was; the Popper is the only scroller.
          contain={{ inset: viewportInset, maxHeight: POPOVER_MAX_HEIGHT }}
        >
          <Box
            sx={rowPopoverSx}
            // Taps inside the popover keep focus in the field, so they don't read as leaving it.
            onMouseDown={(event) => event.preventDefault()}
          >
            {popoverContent}
          </Box>
        </Popper>
      ) : (
        <Box
          sx={popoverOpen ? popoverSx : undefined}
          hidden={inline && !popoverOpen}
          // Taps inside the popover keep focus in the field, so they don't read as leaving it.
          onMouseDown={inline ? (event) => event.preventDefault() : undefined}
        >
          {popoverContent}
        </Box>
      )}
      <AddToCatalog
        open={adding && canAdd}
        typed={typed}
        onPicked={pickAdded}
        onDismiss={dismissAdd}
        initialAllergenIds={newIngredientAllergenIds}
      />
    </Box>
  );
}
