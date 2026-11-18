import { useToast } from '@pocket-pantry/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { voiceNote, type VoiceNotice } from '@/lib/voiceNote';
import { haptic } from '@/lib/haptic';
import { voiceToast } from '@/lib/voicePlacement';

/**
 * Mounted once at the app root: tells the Member what the Voice Note module reports (a toast, or
 * Voice Notes switched off on the server). Being at the root, it speaks on any page, with or
 * without a Voice Note button.
 */
export function VoiceNotices() {
  const { t } = useTranslation('voice');
  const toast = useToast();
  const queryClient = useQueryClient();
  const latest = useRef({ t, toast, queryClient });
  useLayoutEffect(() => {
    latest.current = { t, toast, queryClient };
  });

  useEffect(
    () =>
      voiceNote.attachNotifier((notice: VoiceNotice) => {
        const { t, toast, queryClient } = latest.current;
        switch (notice) {
          case 'recordingCancelled':
            return toast.show(t('listening.cancelled'), voiceToast());
          case 'stoppedAtLimit':
            // The note is about to be read, so the reading row and its Cancel come up here.
            return toast.show(
              `${t('listening.stopped')} · ${t('listening.stoppedHint')}`,
              voiceToast(),
            );
          case 'readCancelled':
            return toast.show(t('send.cancelled'), voiceToast());
          case 'discarded':
            return toast.show(t('send.discarded'), voiceToast());
          case 'noteReady':
            // No toast or sound: a short buzz where the device has one.
            return haptic(14);
          case 'inboxFull':
            return toast.show(t('inbox.full'), voiceToast());
          case 'switchedOff':
            // Hides the button and everything that offers a Voice Note.
            return queryClient.setQueryData(['voice', 'config'], {
              configured: false,
            });
        }
      }),
    [],
  );

  return null;
}
