import {
  Box,
  canopy,
  canopyChipStyle,
  canopyFocusRing,
  CanopySearchField,
  color,
  InputAdornment,
  radius,
  SearchIcon,
  TagChip,
  TagIcon,
  TextField,
  tokens,
} from '@pocket-pantry/ui';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type RecipeBrowse } from '../../../lib/recipes';
import {
  usePickedTags,
  useTagScope,
  type TagScope,
} from '../../../lib/tagFilter';
import { CountBadge } from './CountBadge';
import { bleedSx } from './bleed';
import { TagStatus, TagsSheet } from './TagsSheet';

/** Wires the Tag filter into the block; leave it out for a search box alone (the Meal plan picker). */
export type TagFilterConfig = TagScope & {
  /** How many Recipes the page lists right now (the sheet's "Show n Recipes" and the status line). */
  resultCount: number | undefined;
};

type Props = {
  value: RecipeBrowse;
  onChange: (next: RecipeBrowse) => void;
  /** The search box's label, when not "Search Recipes" (Explore searches all of them). */
  searchLabel?: string;
  tags?: TagFilterConfig;
  /**
   * For the Canopy header (Explore): a recessed search field and a Tags button in the header's style,
   * not pinned. The picked Tags and the status line are left out; render `TagFilterRows` in the sheet.
   */
  onCanopy?: boolean;
};

/**
 * The search box with a Tags button beside it, and the picked Tags as chips below (tap one to
 * remove it), pinned to the top while the list scrolls. The Tags sheet holds the picking.
 */
export function RecipeFilters({
  value,
  onChange,
  searchLabel,
  tags,
  onCanopy = false,
}: Props) {
  const { t } = useTranslation('recipes');
  if (onCanopy) {
    return (
      <Box sx={{ display: 'flex', gap: '8px' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <CanopySearchField
            label={searchLabel ?? t('search')}
            placeholder={searchLabel ?? t('search')}
            value={value.search}
            maxLength={100}
            onChange={(search) => onChange({ ...value, search })}
          />
        </Box>
        {tags ? (
          <TagFilter value={value} onChange={onChange} onCanopy {...tags} />
        ) : null}
      </Box>
    );
  }
  return (
    <Box
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 2,
        bgcolor: canopy.sheetTop,
        ml: bleedSx.ml,
        mr: bleedSx.mr,
        pl: bleedSx.pl,
        pr: bleedSx.pr,
        py: '8px',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <TextField
            type="search"
            label={searchLabel ?? t('search')}
            value={value.search}
            slotProps={{
              htmlInput: { maxLength: 100 },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon size={18} />
                  </InputAdornment>
                ),
              },
            }}
            onChange={(event) =>
              onChange({ ...value, search: event.target.value })
            }
            sx={{ bgcolor: color.fieldBg, borderRadius: radius.control }}
          />
        </Box>
        {tags ? (
          <TagFilter value={value} onChange={onChange} {...tags} />
        ) : null}
      </Box>
      {tags ? (
        <TagFilterRows value={value} onChange={onChange} {...tags} />
      ) : null}
    </Box>
  );
}

/** The Tags button and the sheet it opens. */
function TagFilter({
  value,
  onChange,
  scope,
  showHidden,
  resultCount,
  onCanopy = false,
}: {
  value: RecipeBrowse;
  onChange: (next: RecipeBrowse) => void;
  onCanopy?: boolean;
} & TagFilterConfig) {
  const { t } = useTranslation('recipes');
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const { options, picked } = usePickedTags(scope, value.tagIds);
  const inScope = useTagScope(value, { scope, showHidden, enabled: open });
  const count = value.tagIds.length;
  return (
    <>
      <Box
        ref={button}
        component="button"
        type="button"
        aria-haspopup="dialog"
        aria-label={
          count > 0
            ? t('tags.buttonLabelCount', { count })
            : t('tags.buttonLabel')
        }
        onClick={() => setOpen(true)}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          flexShrink: 0,
          gap: '7px',
          boxSizing: 'border-box',
          font: 'inherit',
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer',
          ...(onCanopy
            ? {
                height: 46,
                px: '14px',
                borderRadius: radius.btn,
                ...canopyChipStyle,
                ...canopyFocusRing,
              }
            : {
                height: 50,
                pl: '12px',
                pr: '14px',
                borderRadius: radius.control,
                border: `${count > 0 ? '1.5px' : '1px'} solid ${count > 0 ? tokens.color.accent : tokens.color.line}`,
                bgcolor: count > 0 ? tokens.color.accentTint : color.fieldBg,
                color: count > 0 ? tokens.color.accentOnTint : tokens.color.ink,
              }),
        }}
      >
        <Box
          component="span"
          aria-hidden
          sx={{
            display: 'flex',
            color: onCanopy ? canopy.ink : tokens.color.accent,
          }}
        >
          <TagIcon size={18} />
        </Box>
        <span aria-hidden>{t('tags.button')}</span>
        {count > 0 ? (
          <CountBadge tone={onCanopy ? 'gold' : 'solid'}>{count}</CountBadge>
        ) : null}
      </Box>
      <TagsSheet
        open={open}
        onClose={() => setOpen(false)}
        onExited={() => button.current?.focus()}
        options={options}
        picked={picked}
        onChange={(tagIds) => onChange({ ...value, tagIds })}
        scopeRecipes={inScope.data?.recipes}
        resultCount={resultCount ?? 0}
        scope={scope}
      />
    </>
  );
}

/** The picked Tags as chips (tap to remove), and the status line that announces the result. */
export function TagFilterRows({
  value,
  onChange,
  scope,
  resultCount,
  bleed = true,
}: {
  value: RecipeBrowse;
  onChange: (next: RecipeBrowse) => void;
  /** Runs the row to the screen edges (inside the page gutter); off in the sheet, whose gutter is the sheet's own. */
  bleed?: boolean;
} & TagFilterConfig) {
  const { t } = useTranslation('recipes');
  const { picked } = usePickedTags(scope, value.tagIds);
  return (
    <>
      {picked.length > 0 ? (
        <Box
          sx={{
            ...(bleed ? bleedSx : {}),
            mt: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {picked.map((tag) => (
            <TagChip
              key={tag.id}
              kind={tag.kind}
              size="medium"
              sx={{ flexShrink: 0 }}
              removeLabel={t('tags.remove', { name: tag.name })}
              onRemove={() =>
                onChange({
                  ...value,
                  tagIds: value.tagIds.filter((id) => id !== tag.id),
                })
              }
            >
              {tag.name}
            </TagChip>
          ))}
        </Box>
      ) : null}
      <TagStatus picked={picked} resultCount={resultCount} />
    </>
  );
}
