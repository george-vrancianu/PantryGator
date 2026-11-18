import {
  Alert,
  Box,
  Button,
  Card,
  CloseIcon,
  DeleteIcon,
  Sheet,
  IconButton,
  Stack,
  TextField,
  Typography,
  useToast,
} from '@pocket-pantry/ui';
import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';
import { ApiError } from '@/lib/api';
import {
  useDeleteFamilyTag,
  useFamilyTags,
  useRenameFamilyTag,
  useRestoreFamilyTag,
  type DeletedTag,
  type ManagedTag,
} from '@/lib/familyTags';
import { MAX_TAG_NAME_LENGTH } from '@/lib/tags';
import { UNDO_WINDOW_MS } from '@/lib/useDeferredRemoval';
import { SectionHeading } from '@/components/SectionHeading';

type Editing = { id: string; value: string };
type Merging = { id: string; from: string; name: string };

/**
 * Manage Tags: the Family's own Tags with how many Recipes carry each. Rename inline (a name another
 * Tag already has asks before merging), delete with an Undo toast. Every Member can do all of it.
 */
export function ManageTagsSection() {
  const { t } = useTranslation(['settings', 'common']);
  const id = useId();
  const toast = useToast();
  const list = useFamilyTags();
  const rename = useRenameFamilyTag();
  const remove = useDeleteFamilyTag();
  const restore = useRestoreFamilyTag();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [merging, setMerging] = useState<Merging | null>(null);
  const [error, setError] = useState<string | null>(null);
  const headingId = `${id}-heading`;

  const send = (
    tag: Pick<ManagedTag, 'id' | 'name'>,
    name: string,
    merge: boolean,
  ) =>
    rename.mutate(
      { id: tag.id, name, merge },
      {
        onSuccess: () => {
          setEditing(null);
          setMerging(null);
          setError(null);
        },
        onError: (failure) => {
          if (
            !merge &&
            failure instanceof ApiError &&
            failure.code === 'tags.name_taken'
          ) {
            setMerging({ id: tag.id, from: tag.name, name });
            return;
          }
          setMerging(null);
          setError(translateApiError(t, failure));
        },
      },
    );

  const submit = (tag: ManagedTag, event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const name = editing.value.trim();
    if (name === '' || name === tag.name) {
      setEditing(null);
      return;
    }
    send(tag, name, false);
  };

  const undo = (deleted: DeletedTag) =>
    restore.mutate(deleted, {
      onError: (failure) =>
        toast.show(translateApiError(t, failure), { polite: true }),
    });

  const erase = (tag: ManagedTag) => {
    setError(null);
    remove.mutate(tag.id, {
      onSuccess: (deleted) =>
        toast.show(
          deleted.recipeCount === 0
            ? t('settings:manageTags.deletedUnused', { name: tag.name })
            : t('settings:manageTags.deleted', {
                name: tag.name,
                count: deleted.recipeCount,
              }),
          {
            polite: true,
            duration: UNDO_WINDOW_MS,
            action: {
              label: t('common:row.undo'),
              onClick: () => undo(deleted),
            },
          },
        ),
      onError: (failure) => setError(translateApiError(t, failure)),
    });
  };

  const tags = list.data ?? [];
  return (
    <Stack component="section" spacing={1} aria-labelledby={headingId}>
      <SectionHeading id={headingId} title={t('settings:manageTags.title')} />
      <Card>
        <Stack spacing={1.5}>
          <Typography variant="meta" color="text.secondary">
            {t('settings:manageTags.hint')}
          </Typography>
          {list.error ? (
            <Alert>{translateApiError(t, list.error)}</Alert>
          ) : null}
          {error ? <Alert>{error}</Alert> : null}
          {list.data && tags.length === 0 ? (
            <Typography color="text.secondary">
              {t('settings:manageTags.empty')}
            </Typography>
          ) : null}
          {tags.length > 0 ? (
            <Stack component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
              {tags.map((tag) => (
                <Stack
                  component="li"
                  key={tag.id}
                  direction="row"
                  spacing={1}
                  sx={{
                    alignItems: 'center',
                    minHeight: 52,
                    borderTop: 1,
                    borderColor: 'divider',
                  }}
                >
                  {editing?.id === tag.id ? (
                    <Box
                      component="form"
                      onSubmit={(event: FormEvent) => submit(tag, event)}
                      sx={{
                        display: 'flex',
                        flex: 1,
                        gap: 1,
                        alignItems: 'center',
                        py: 1,
                      }}
                    >
                      <TextField
                        autoFocus
                        size="small"
                        label={t('settings:manageTags.nameLabel')}
                        value={editing.value}
                        onChange={(event) =>
                          setEditing({ id: tag.id, value: event.target.value })
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') setEditing(null);
                        }}
                        slotProps={{
                          htmlInput: { maxLength: MAX_TAG_NAME_LENGTH },
                        }}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        disabled={rename.isPending}
                      >
                        {t('common:edit.save')}
                      </Button>
                      <IconButton
                        label={t('settings:manageTags.cancelRename', {
                          name: tag.name,
                        })}
                        size={40}
                        onClick={() => setEditing(null)}
                      >
                        <CloseIcon size={18} />
                      </IconButton>
                    </Box>
                  ) : (
                    <>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                          {tag.name}
                        </Typography>
                        <Typography variant="meta" color="text.secondary">
                          {t('settings:manageTags.recipes', {
                            count: tag.recipeCount,
                          })}
                        </Typography>
                      </Box>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t('settings:manageTags.rename', {
                          name: tag.name,
                        })}
                        onClick={() => {
                          setError(null);
                          setEditing({ id: tag.id, value: tag.name });
                        }}
                      >
                        {t('settings:manageTags.renameButton')}
                      </Button>
                      <IconButton
                        label={t('settings:manageTags.delete', {
                          name: tag.name,
                        })}
                        size={40}
                        disabled={remove.isPending}
                        onClick={() => erase(tag)}
                      >
                        <DeleteIcon size={18} />
                      </IconButton>
                    </>
                  )}
                </Stack>
              ))}
            </Stack>
          ) : null}
        </Stack>
      </Card>
      <Sheet
        open={merging !== null}
        size="content"
        onClose={() => setMerging(null)}
        title={t('settings:manageTags.merge.title', { name: merging?.name })}
        primary={{
          label: t('settings:manageTags.merge.confirm'),
          pending: rename.isPending,
          onClick: () =>
            merging &&
            send({ id: merging.id, name: merging.from }, merging.name, true),
        }}
      >
        <Typography>
          {t('settings:manageTags.merge.body', {
            name: merging?.name,
            from: merging?.from,
          })}
        </Typography>
      </Sheet>
    </Stack>
  );
}
