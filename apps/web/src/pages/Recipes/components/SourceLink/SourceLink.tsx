import {
  Box,
  Button,
  Link,
  LinkIcon,
  Stack,
  Typography,
  palette,
} from '@pocket-pantry/ui';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { languageName } from '@/lib/languageName';

/** The host of a link without a leading `www.`, or null when it is not a URL. */
export function sourceHost(sourceLink: string): string | null {
  try {
    return new URL(sourceLink).hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/** Whether the text is an http(s) address with a host, so it can be shown as a link. */
export function isSourceLink(href: string): boolean {
  return /^https?:/i.test(href) && sourceHost(href) !== null;
}

/** "From host ↗": where a Recipe was read from (its Source Link), opening the page in a new tab, with "Translated from French" beside it when the page was in another language. */
export function SourceLink({
  href,
  translatedFrom,
}: {
  href: string;
  /** Language code of the page, when the Recipe was translated from it. */
  translatedFrom?: string | null;
}) {
  const { t, i18n } = useTranslation('recipes');
  const host = sourceHost(href);
  // Only an http(s) page is linked; anything else is not shown as a link.
  if (host === null || !/^https?:/i.test(href)) return null;
  const link = (
    <Link href={href} target="_blank" rel="noopener noreferrer">
      {t('sourceLink.from', { host })}
    </Link>
  );
  if (!translatedFrom) return link;
  return (
    <Box component="span">
      {link}
      <Typography component="span" variant="meta" color="text.secondary">
        <span aria-hidden>{' · '}</span>
        {t('sourceLink.translatedFrom', {
          language: languageName(translatedFrom, i18n.resolvedLanguage ?? 'en'),
        })}
      </Typography>
    </Box>
  );
}

/**
 * A Source Link the Member may drop but never change: the link row with a "Remove link" button.
 * Removing swaps the row for a status line with Undo (focus moves to Undo, and back to "Remove link" after Undo); the caller holds
 * `removed` and applies it when the Member saves.
 */
export function RemovableSourceLink({
  href,
  translatedFrom,
  removed,
  onRemove,
  onUndo,
}: {
  href: string;
  translatedFrom?: string | null;
  removed: boolean;
  onRemove: () => void;
  onUndo: () => void;
}) {
  const { t } = useTranslation(['recipes', 'common']);
  const undoRef = useRef<HTMLButtonElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  // Undo / Remove link: the button Member pressed unmounts with its row, so focus goes to its twin.
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    if (!moved) return;
    (removed ? undoRef : removeRef).current?.focus();
  }, [removed, moved]);
  if (removed) {
    return (
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <Typography role="status" variant="body2">
          {t('recipes:sourceLink.removed')}
        </Typography>
        <Button
          ref={undoRef}
          variant="ghost"
          onClick={() => {
            setMoved(true);
            onUndo();
          }}
        >
          {t('common:row.undo')}
        </Button>
      </Stack>
    );
  }
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: 'center', fontSize: 13.5 }}
    >
      <Box
        component="span"
        aria-hidden
        sx={{ display: 'inline-flex', color: palette('text-secondary') }}
      >
        <LinkIcon size={16} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <SourceLink href={href} translatedFrom={translatedFrom} />
      </Box>
      <Button
        ref={removeRef}
        variant="ghost"
        onClick={() => {
          setMoved(true);
          onRemove();
        }}
      >
        {t('recipes:sourceLink.remove')}
      </Button>
    </Stack>
  );
}
