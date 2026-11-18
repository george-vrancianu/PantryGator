import { Box } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import type { UnmatchedEntry } from '@/lib/unmatched';

/** "3 rows · Receipt, Typed". */
export function useUnmatchedMetaLine(entry: UnmatchedEntry): string {
  const { t, i18n } = useTranslation('admin');
  const sources = entry.sources
    .map((source) => t(`unmatched.sources.${source}`))
    .sort((a, b) => a.localeCompare(b, i18n.language))
    .join(', ');
  return t('review.rowMeta', {
    rows: t('unmatched.rows', { count: entry.count }),
    sources,
  });
}

/** "Printed: SMANTANA 20% 400G", when the rows carry printed text; nothing otherwise. */
export function UnmatchedPrinted({
  entry,
  block = false,
}: {
  entry: UnmatchedEntry;
  /** On its own line under a sibling, instead of inline text. */
  block?: boolean;
}) {
  const { t } = useTranslation('admin');
  if (!entry.sourceText) return null;
  return (
    <Box component="span" sx={{ display: block ? 'block' : undefined }}>
      {entry.sourceLanguage
        ? t('unmatched.printedIn', {
            text: entry.sourceText,
            language: t(`locales.${entry.sourceLanguage}`),
          })
        : t('unmatched.printed', { text: entry.sourceText })}
    </Box>
  );
}

/** "3 rows · Receipt, Typed", then "Printed: SMANTANA 20% 400G" when the rows carry printed text. */
export function UnmatchedMeta({ entry }: { entry: UnmatchedEntry }) {
  const line = useUnmatchedMetaLine(entry);
  return (
    <>
      {line}
      <UnmatchedPrinted entry={entry} block />
    </>
  );
}
