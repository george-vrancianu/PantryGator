import { Alert, TagField, Typography } from '@pocket-pantry/ui';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';
import { normalizeName } from '@/lib/normalizeName';
import { useResolveTag, usePickableTags } from '@/lib/recipes';
import {
  MAX_RECIPE_TAGS,
  MAX_TAG_NAME_LENGTH,
  type RecipeTag,
} from '@/lib/tags';

type Props = {
  /** `family`: Catalog Tags plus the Family's own, and a typed name can make a Family Tag. `admin`: Catalog Tags only. */
  scope: 'family' | 'admin';
  /** The picked Tag ids. */
  value: string[];
  onChange: (tagIds: string[]) => void;
};

/**
 * The Tag field of the Recipe editors (Family and Admin): the shared `TagField` as an inline
 * popup, one line at rest (two chips, then "+N"), no counts, grouped by Tag Group. It stops at
 * the 10-Tag cap and says so. In the Family editor a name that matches no Tag offers `Create "…"`;
 * the API decides whether that is a Catalog Tag, the Family's own, or a new Family Tag.
 */
export function RecipeTagsField({ scope, value, onChange }: Props) {
  const { t } = useTranslation(['recipes', 'errors']);
  const loaded = usePickableTags(scope).data ?? [];
  const resolve = useResolveTag();
  // Tags just resolved: kept here too, so the stale-id check below never sees an id its options lack.
  const [resolved, setResolved] = useState<RecipeTag[]>([]);
  const options = [
    ...loaded,
    ...resolved.filter((tag) => !loaded.some((l) => l.id === tag.id)),
  ];
  // In option order (Your Tags first, then Tag Groups), like a row, not in id order.
  const picked = options.filter((tag) => value.includes(tag.id));
  // A Tag that is gone (e.g. a resumed Draft's) would make every Save fail: drop it once the
  // options are in.
  useEffect(() => {
    if (loaded.length > 0 && picked.length !== value.length)
      onChange(picked.map((tag) => tag.id));
  });
  // The latest picks, for a Create answer that arrives after the Member changed them.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  });
  const claimsAllergenFree = picked.filter((tag) => tag.claimsAllergenFree);
  return (
    <>
      <TagField
        list="popup"
        matchKey={normalizeName}
        limitTags={2}
        options={options}
        value={picked}
        onChange={(next) => {
          if (resolve.isError) resolve.reset();
          if (next.length <= MAX_RECIPE_TAGS)
            onChange(next.map((tag) => tag.id));
        }}
        onTyped={() => {
          if (resolve.isError) resolve.reset();
        }}
        create={
          scope === 'family' && picked.length < MAX_RECIPE_TAGS
            ? {
                label: (name) => t('tags.create', { name }),
                maxLength: MAX_TAG_NAME_LENGTH,
                busy: resolve.isPending,
                onCreate: (name) => {
                  resolve.mutate(name, {
                    onSuccess: (tag) => {
                      setResolved((all) => [...all, tag]);
                      // Not past the cap: a pick made while this was pending may have filled it.
                      if (
                        !latest.current.includes(tag.id) &&
                        latest.current.length < MAX_RECIPE_TAGS
                      )
                        onChange([...latest.current, tag.id]);
                    },
                  });
                },
              }
            : undefined
        }
        labels={{
          field: t('tags.editorField'),
          placeholder: t('tags.editorPlaceholder'),
          yourTags: t('tags.yourTags'),
          yourTagsNote: t('tags.yourTagsNote'),
          noOptions: t('tags.editorNoOptions'),
          clear: t('tags.clearAll'),
          remove: (name) => t('tags.remove', { name }),
          more: (count) => t('tags.more', { count }),
          optionCount: (count) => t('tags.optionCount', { count }),
        }}
      />
      {resolve.isError ? (
        <Alert>{translateApiError(t, resolve.error)}</Alert>
      ) : null}
      {/* Always mounted, so a screen reader hears the cap when it is reached. */}
      <div role="status">
        {picked.length >= MAX_RECIPE_TAGS ? (
          <Typography variant="caption">
            {t('tags.editorLimit', { max: MAX_RECIPE_TAGS })}
          </Typography>
        ) : null}
        {claimsAllergenFree.map((tag) => (
          <div key={tag.id}>
            <Typography variant="caption">
              {t('tags.allergenFree', { name: tag.name })}
            </Typography>
          </div>
        ))}
      </div>
    </>
  );
}
