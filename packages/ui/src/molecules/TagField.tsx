import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete';
import type { PopperProps } from '@mui/material/Popper';
import { forwardRef, useMemo, type ReactNode, type Ref } from 'react';
import { Box } from '../atoms/Layout';
import { PeopleIcon, PlusIcon, TagIcon } from '../atoms/icons';
import { TagChip, type TagChipKind } from '../atoms/TagChip';
import { TextField } from '../atoms/TextField';
import { bodyFont, palette, radius } from '../theme/themeVars';
import { visuallyHidden } from '../theme/visuallyHidden';

/** What the field needs of a Tag; the web's `RecipeTag` fits. */
export type TagFieldOption = {
  id: string;
  name: string;
  kind: TagChipKind;
  /** The Tag Group header the option sits under. Null on a Family Tag, which goes under "Your Tags". */
  groupName: string | null;
  /** Sorts the groups (Meal, Diet, Cuisine, Method, ...). */
  groupOrder?: number | null;
};

export type TagFieldLabels = {
  /** Accessible name of the input, e.g. "Filter by Tags". */
  field: string;
  /** Shown while nothing is picked, e.g. "Type to find a Tag". */
  placeholder: string;
  /** Header of the Family Tags group, e.g. "Your Tags". */
  yourTags: string;
  /** Its right-hand note, e.g. "only your family sees these". */
  yourTagsNote: string;
  /** Shown when typing matches nothing. */
  noOptions: string;
  /** Accessible name of the clear (x) indicator, e.g. "Clear Tags". */
  clear: string;
  /** Accessible name of a picked chip, e.g. "Remove Tag Vegan". */
  remove: (name: string) => string;
  /** Accessible name of the "+N" chip when `limitTags` cuts the list, e.g. "and 3 more Tags". */
  more: (count: number) => string;
  /** Accessible name of an option's count, e.g. "3 Recipes". */
  optionCount: (count: number) => string;
};

/** The editor's opt-in "Create" row: the filters never pass this. */
export type TagFieldCreate = {
  /** The row's text for what was typed, e.g. `Create “Sunday roast”`. */
  label: (name: string) => string;
  /** Longest name; the input stops there. */
  maxLength: number;
  /** Called with the trimmed name when the row is chosen. The parent makes the Tag and adds it to `value`. */
  onCreate: (name: string) => void;
  /** A Tag is being made: the row is dimmed and can't be chosen twice. */
  busy?: boolean;
};

export type TagFieldProps<T extends TagFieldOption = TagFieldOption> = {
  /** Every Tag that can be picked. Family Tags first, then the groups in order: they are grouped as given. */
  options: readonly T[];
  value: readonly T[];
  onChange: (next: T[]) => void;
  labels: TagFieldLabels;
  /**
   * How many Recipes a Member would see with this Tag added. Given, each unpicked option shows
   * its count and one at 0 is disabled (a picked Tag stays enabled so it can be removed). Omitted:
   * no counts and nothing is disabled, as in the Recipe editor.
   */
  countOf?: (tag: T) => number;
  /**
   * The key a typed name is compared on, to decide whether it already names a Tag (so no `Create`
   * row). Defaults to a built-in fold that matches the server's rule; the app can pass its own copy.
   */
  matchKey?: (text: string) => string;
  /**
   * `popup`: the list floats under the field while it is focused. `inline`: the list is always
   * open and rendered in place after the field, as in the Tags sheet.
   */
  list?: 'popup' | 'inline';
  /** Picked chips shown before "+N" while the field is not focused; -1 (default) shows them all. */
  limitTags?: number;
  /**
   * Adds `Create "…"` as the last row when the typed name matches no option (ignoring case,
   * accents, spaces and hyphens). Editor only.
   */
  create?: TagFieldCreate;
  /** The Member typed in the field (not a reset after a pick); the editor clears a stale refusal with it. */
  onTyped?: () => void;
  /** Escape in the open list; the Tags sheet closes itself with it. */
  onEscape?: () => void;
  autoFocus?: boolean;
};

// Module-level so they keep their identity: Autocomplete resets the typed text when they change.
const optionLabel = (tag: TagFieldOption) => tag.name;
const sameTag = (a: TagFieldOption, b: TagFieldOption) => a.id === b.id;

/** Renders the list where Autocomplete puts it, in place, instead of in a floating popper. */
const InlinePopper = forwardRef(function InlinePopper(
  props: PopperProps,
  ref: Ref<HTMLDivElement>,
) {
  const { children, className } = props;
  return (
    <Box ref={ref} className={className} sx={{ width: '100%' }}>
      {typeof children === 'function'
        ? children({ placement: 'bottom' })
        : (children as ReactNode)}
    </Box>
  );
});

const CREATE_ID = '__tag-field-create__';
const CREATE_GROUP = '__tag-field-create-group__';
const isCreateRow = (tag: TagFieldOption) => tag.id === CREATE_ID;

/**
 * Case, accents, spaces and hyphens folded away, like the API's name matching. A copy of
 * `normalizeName` in apps/api/src/catalog/normalize.ts and apps/web/src/lib/normalizeName.ts;
 * the app can pass the web one as `matchKey` instead.
 */
const fold = (text: string) =>
  text
    .normalize('NFD')
    .toLowerCase()
    .replace(/a\u030a/g, 'aa')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const optionSx = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  minHeight: 44,
  px: 2,
  fontFamily: bodyFont,
  fontSize: 15,
  fontWeight: 600,
  color: palette('text-primary'),
  '&.Mui-focused, &:hover': { bgcolor: palette('pp-subtle') },
  '&.Mui-disabled, &[aria-disabled="true"]': { opacity: 0.42 },
} as const;

/** Family Tags first, then the groups by position and name (the order given breaks ties). */
function grouped<T extends TagFieldOption>(options: readonly T[]): T[] {
  return options
    .map((tag, index) => ({ tag, index }))
    .sort(
      (a, b) =>
        (a.tag.kind === b.tag.kind ? 0 : a.tag.kind === 'family' ? -1 : 1) ||
        (a.tag.groupOrder ?? 0) - (b.tag.groupOrder ?? 0) ||
        // Two groups sharing a position must not interleave, or a header would repeat.
        (a.tag.groupName ?? '').localeCompare(b.tag.groupName ?? '') ||
        a.index - b.index,
    )
    .map(({ tag }) => tag);
}

/**
 * The Tag field (ADR 0033, docs/handoffs/tags-filter section 4): a multi-select with a grouped
 * option list, Your Tags first. Shared by the Recipes and Explore filters (counts, inline list)
 * and the Recipe editor (popup list, `limitTags`, no counts). Matching ignores case and accents.
 * It offers `Create "…"` only when the editor passes `create`; the filters never do.
 */
export function TagField<T extends TagFieldOption = TagFieldOption>({
  options,
  value,
  onChange,
  labels,
  countOf,
  matchKey = fold,
  list = 'popup',
  limitTags = -1,
  create,
  onTyped,
  onEscape,
  autoFocus,
}: TagFieldProps<T>) {
  const inline = list === 'inline';
  const filter = useMemo(
    () => createFilterOptions<T>({ ignoreCase: true, ignoreAccents: true }),
    [],
  );
  const filterWithCreate = (
    all: T[],
    state: Parameters<typeof filter>[1],
  ): T[] => {
    const shown = filter(all, state);
    const typed = state.inputValue.trim().replace(/\s+/g, ' ');
    if (!create || matchKey(typed) === '') return shown;
    const key = matchKey(typed);
    if (all.some((tag) => matchKey(tag.name) === key)) return shown;
    const row: TagFieldOption = {
      id: CREATE_ID,
      name: typed,
      kind: 'family',
      groupName: null,
    };
    return [...shown, row as T];
  };
  const sorted = useMemo(() => grouped(options), [options]);
  const picked = new Set(value.map((tag) => tag.id));
  const blocked = (tag: T) =>
    countOf !== undefined && !picked.has(tag.id) && countOf(tag) === 0;
  const groupOf = (tag: TagFieldOption) =>
    isCreateRow(tag)
      ? CREATE_GROUP
      : tag.kind === 'family'
        ? labels.yourTags
        : (tag.groupName ?? '');
  return (
    <Box>
      <Autocomplete<T, true, false, false>
        multiple
        options={sorted}
        value={value as T[]}
        onChange={(_event, next) => {
          const row = next.find(isCreateRow);
          if (row) {
            if (!create?.busy) create?.onCreate(row.name);
            return;
          }
          // Only pointer-events keep a click off a dimmed option, so refuse it here too.
          onChange(next.filter((tag) => picked.has(tag.id) || !blocked(tag)));
        }}
        onInputChange={(_event, _text, reason) => {
          if (reason === 'input') onTyped?.();
        }}
        filterOptions={filterWithCreate}
        groupBy={groupOf}
        getOptionLabel={optionLabel}
        isOptionEqualToValue={sameTag}
        getOptionDisabled={(tag) =>
          isCreateRow(tag) ? !!create?.busy : blocked(tag)
        }
        limitTags={limitTags}
        getLimitTagsText={(count) => (
          <>
            <Box
              component="span"
              aria-hidden
              data-testid="tag-field-more"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 26,
                px: '9px',
                borderRadius: radius.tag,
                bgcolor: palette('pp-subtle'),
                border: `1px solid ${palette('pp-line')}`,
                fontSize: 12.5,
                fontWeight: 700,
                color: palette('pp-accentOnTint'),
              }}
            >
              +{count}
            </Box>
            <Box component="span" sx={visuallyHidden}>
              {labels.more(count)}
            </Box>
          </>
        )}
        disableCloseOnSelect
        autoHighlight
        openOnFocus
        forcePopupIcon={false}
        clearText={labels.clear}
        noOptionsText={labels.noOptions}
        {...(inline ? { open: true, disablePortal: true } : {})}
        onClose={(_event, reason) => {
          if (reason === 'escape') onEscape?.();
        }}
        slots={inline ? { popper: InlinePopper } : undefined}
        slotProps={
          inline
            ? {
                // The list lives in the sheet body, which owns the scroll: no nested 40vh
                // scroller, and no raised Paper under it.
                listbox: {
                  sx: { maxHeight: 'none', overflow: 'visible', p: 0 },
                },
                paper: {
                  elevation: 0,
                  sx: {
                    bgcolor: 'transparent',
                    backgroundImage: 'none',
                    boxShadow: 'none',
                    borderRadius: 0,
                  },
                },
              }
            : undefined
        }
        sx={{
          // A touch screen has no hover: keep the clear (x) in view whenever there is a pick.
          '& .MuiAutocomplete-clearIndicator': {
            visibility: 'visible',
            color: palette('text-secondary'),
            width: 32,
            height: 32,
          },
          '& .MuiOutlinedInput-root': {
            minHeight: 48,
            gap: '5px',
            py: '7px',
            pl: '12px',
            pr: '6px',
            flexWrap: 'wrap',
          },
          '& .MuiAutocomplete-input': { minWidth: 80, p: '4px !important' },
          '& .MuiAutocomplete-tag': { margin: 0 },
        }}
        renderValue={(tags, getItemProps) =>
          tags.map((tag, index) => {
            const { key, onDelete, className, ...rest } = getItemProps({
              index,
            });
            return (
              <TagChip
                key={key}
                kind={tag.kind}
                size="medium"
                className={className}
                data-item-index={rest['data-item-index']}
                tabIndex={rest.tabIndex}
                onRemove={() => onDelete({} as never)}
                removeLabel={labels.remove(tag.name)}
                sx={{ maxWidth: 132, fontSize: 12.5 }}
              >
                {tag.name}
              </TagChip>
            );
          })
        }
        renderGroup={(params) =>
          params.group === CREATE_GROUP ? (
            <li key={params.key}>
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {params.children}
              </Box>
            </li>
          ) : (
            <li key={params.key}>
              <Box
                sx={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  px: inline ? 2.5 : 2,
                  pt: '12px',
                  pb: '4px',
                  // Inline, the list sits on the sheet itself, so the header matches it.
                  bgcolor: inline
                    ? palette('background-default')
                    : palette('background-paper'),
                  fontSize: 11.5,
                  fontWeight: 700,
                  letterSpacing: '.07em',
                  textTransform: 'uppercase',
                  color: palette('text-secondary'),
                }}
              >
                {params.group === labels.yourTags ? (
                  <>
                    <Box
                      component="span"
                      aria-hidden
                      sx={{
                        display: 'flex',
                        color: palette('secondary-contrastText'),
                      }}
                    >
                      <PeopleIcon size={13} />
                    </Box>
                    <span>{params.group}</span>
                    <Box
                      component="em"
                      sx={{
                        ml: 'auto',
                        fontStyle: 'normal',
                        fontWeight: 500,
                        textTransform: 'none',
                        letterSpacing: 0,
                      }}
                    >
                      {labels.yourTagsNote}
                    </Box>
                  </>
                ) : (
                  <span>{params.group}</span>
                )}
              </Box>
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {params.children}
              </Box>
            </li>
          )
        }
        renderOption={(props, tag, { selected }) => {
          const { key, ...li } = props;
          if (isCreateRow(tag)) {
            return (
              <Box
                component="li"
                key={key}
                {...li}
                sx={{ ...optionSx, px: inline ? 2.5 : 2 }}
              >
                <Box
                  component="span"
                  aria-hidden
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    width: 20,
                    height: 20,
                    color: palette('pp-accent'),
                  }}
                >
                  <PlusIcon size={16} />
                </Box>
                <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
                  {create?.label(tag.name)}
                </Box>
              </Box>
            );
          }
          const count = countOf?.(tag);
          return (
            <Box
              component="li"
              key={key}
              {...li}
              sx={{ ...optionSx, px: inline ? 2.5 : 2 }}
            >
              <Box
                component="span"
                aria-hidden
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  width: 20,
                  height: 20,
                  borderRadius: radius.box,
                  border: `1.5px solid ${selected ? palette('pp-accent') : palette('pp-lineStrong')}`,
                  bgcolor: selected ? palette('pp-accent') : 'transparent',
                  color: palette('pp-accentInk'),
                }}
              >
                {selected ? <CheckMark /> : null}
              </Box>
              <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
                {tag.name}
              </Box>
              {count !== undefined && !selected ? (
                <Box
                  component="span"
                  sx={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: palette('text-secondary'),
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  <span aria-hidden>{count}</span>
                  <Box component="span" sx={visuallyHidden}>
                    {labels.optionCount(count)}
                  </Box>
                </Box>
              ) : null}
            </Box>
          );
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            autoFocus={autoFocus}
            placeholder={value.length > 0 ? undefined : labels.placeholder}
            slotProps={{
              ...params.slotProps,
              htmlInput: {
                ...params.slotProps.htmlInput,
                'aria-label': labels.field,
                ...(create ? { maxLength: create.maxLength } : {}),
              },
              input: {
                ...params.slotProps.input,
                startAdornment: (
                  <>
                    <Box
                      component="span"
                      aria-hidden
                      sx={{
                        display: 'flex',
                        color: palette('pp-accent'),
                        borderRadius: radius.chip,
                      }}
                    >
                      <TagIcon size={18} />
                    </Box>
                    {params.slotProps.input.startAdornment}
                  </>
                ),
              },
            }}
          />
        )}
      />
    </Box>
  );
}

function CheckMark() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
