import {
  Box,
  ChevronDownIcon,
  QuoteIcon,
  Typography,
  radius,
  shadow,
  color,
  focusRing,
  palette,
} from '@pocket-pantry/ui';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScanLanguage } from '../../i18n/resources';
import type { MergedNote } from '../../lib/voiceNote';
import { formatClock } from '../../lib/voice';
import { noteHeardMeta } from './noteMeta';
import { usePreferredSpokenLanguage } from '../../lib/usePreferredSpokenLanguage';

/**
 * "What I heard": a card that shows the first line of the transcript and opens to
 * all of it, in the Spoken Language it was read in, with that language and its length.
 */
export function HeardCard({
  transcript,
  language,
  durationMs,
  defaultOpen,
}: {
  transcript: string;
  language: ScanLanguage;
  durationMs: number | undefined;
  defaultOpen: boolean;
}) {
  const { t } = useTranslation(['voice', 'settings']);
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const firstLine = transcript.split('\n')[0];
  const meta = t('voice:review.heardMeta', {
    language: t(`settings:languageNames.${language}`),
    duration: formatClock(durationMs ?? 0),
  });

  return (
    <Box
      sx={{
        backgroundColor: color.fieldBg,
        boxShadow: shadow.recess,
        borderRadius: radius.control,
        overflow: 'hidden',
      }}
    >
      <Box
        component="button"
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '11px',
          width: '100%',
          p: '12px 14px',
          border: 0,
          background: 'none',
          font: 'inherit',
          color: palette('text-primary'),
          textAlign: 'left',
          cursor: 'pointer',
          ...focusRing,
        }}
      >
        <Box
          aria-hidden
          sx={{
            width: 30,
            height: 30,
            flexShrink: 0,
            borderRadius: radius.control,
            display: 'grid',
            placeItems: 'center',
            backgroundColor: palette('pp-chip'),
            color: palette('text-secondary'),
          }}
        >
          <QuoteIcon size={16} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ fontSize: 14, fontWeight: 700 }}>
            {t('voice:review.heard')}
          </Box>
          {open ? null : (
            <Box
              lang={language}
              sx={{
                fontSize: 12.5,
                color: palette('text-secondary'),
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {firstLine}
            </Box>
          )}
        </Box>
        <Box
          component="span"
          aria-hidden
          sx={{
            display: 'flex',
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 220ms',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          }}
        >
          <ChevronDownIcon size={18} />
        </Box>
      </Box>
      <Box id={bodyId} hidden={!open} sx={{ p: '0 16px 14px 55px' }}>
        {open ? (
          <>
            <Typography
              lang={language}
              sx={{ fontSize: 14, fontStyle: 'italic', lineHeight: 1.45 }}
            >
              {transcript}
            </Typography>
            <Typography
              sx={{
                mt: '6px',
                fontSize: 12,
                fontWeight: 600,
                color: palette('text-secondary'),
              }}
            >
              {meta}
            </Typography>
          </>
        ) : null}
      </Box>
    </Box>
  );
}

/**
 * "What I heard" for Review all: every Voice Note's transcript in recording order, each with the list
 * it was recorded for, its Spoken Language and length.
 */
export function MergedHeardCard({ notes }: { notes: MergedNote[] }) {
  const { t } = useTranslation(['voice', 'settings']);
  const { spokenLanguage } = usePreferredSpokenLanguage();
  return (
    <Box
      component="section"
      aria-label={t('voice:review.heard')}
      sx={{
        backgroundColor: color.fieldBg,
        boxShadow: shadow.recess,
        borderRadius: radius.control,
        p: '12px 14px',
      }}
    >
      <Box sx={{ fontSize: 14, fontWeight: 700, mb: '6px' }}>
        {t('voice:review.heard')}
      </Box>
      <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none' }}>
        {notes.map((note) => {
          const language = note.spokenLanguage ?? spokenLanguage;
          return (
            <Box
              component="li"
              key={note.id}
              sx={{
                py: '8px',
                '& + &': { borderTop: `1px solid ${palette('divider')}` },
              }}
            >
              <Typography
                lang={language}
                sx={{ fontSize: 15, fontWeight: 500, lineHeight: 1.4 }}
              >
                {note.transcript}
              </Typography>
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: palette('text-secondary'),
                }}
              >
                {noteHeardMeta(
                  t,
                  note.defaultTarget,
                  language,
                  note.durationMs ?? 0,
                )}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
