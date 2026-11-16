import {
  Alert,
  Box,
  Button,
  Link,
  Spinner,
  Stack,
  TextField,
  Typography,
} from '@pocket-pantry/ui';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Screen } from '../../../components/layout/Screen';
import { translateApiError } from '../../../i18n/translateApiError';
import {
  MAX_TEMPLATES,
  useTemplateMutations,
  useTemplates,
} from '../../../lib/shoppingTemplates';

/** The Family's Shopping Templates: open one to edit it, or create a new one. */
export function TemplatesPage() {
  const { t } = useTranslation(['templates', 'common']);
  const navigate = useNavigate();
  const templates = useTemplates();
  const { create } = useTemplateMutations();
  const [name, setName] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { name: trimmed },
      { onSuccess: (made) => navigate(`/shopping/templates/${made.id}`) },
    );
  };

  const error = templates.error ?? create.error;
  const items = templates.data ?? [];

  return (
    <Screen
      title={t('templates:title')}
      back={{ label: t('screenHeader:back'), href: '/shopping' }}
    >
      <Stack spacing={2.5}>
        {error ? <Alert>{translateApiError(t, error)}</Alert> : null}
        <Box component="form" onSubmit={submit} noValidate>
          <Stack spacing={1.5}>
            <TextField
              label={t('templates:list.name')}
              value={name}
              onChange={(event) => setName(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />
            <Button
              type="submit"
              disabled={
                !name.trim() ||
                create.isPending ||
                items.length >= MAX_TEMPLATES
              }
            >
              {t('templates:list.create')}
            </Button>
          </Stack>
        </Box>
        {templates.isPending ? <Spinner label={t('common:loading')} /> : null}
        {templates.data && items.length === 0 ? (
          <Typography color="text.secondary">
            {t('templates:list.empty')}
          </Typography>
        ) : null}
        <Stack
          component="ul"
          spacing={1}
          sx={{ listStyle: 'none', m: 0, p: 0 }}
        >
          {items.map((template) => (
            <Box component="li" key={template.id}>
              <Link href={`/shopping/templates/${template.id}`}>
                {template.name}
              </Link>
              <Typography variant="meta" color="text.secondary">
                {t('templates:list.lines', { count: template.lineCount })}
              </Typography>
            </Box>
          ))}
        </Stack>
        <Link href="/shopping">{t('templates:list.back')}</Link>
      </Stack>
    </Screen>
  );
}
