/** Marks the voice button, so focus can be handed back to it. */
export const VOICE_BUTTON_ATTRIBUTE = 'data-voice-button';

/** Puts focus on the voice button once the page has rendered it enabled again. */
export function focusVoiceButton() {
  setTimeout(() => {
    document.querySelector<HTMLElement>(`[${VOICE_BUTTON_ATTRIBUTE}]`)?.focus();
  }, 0);
}
