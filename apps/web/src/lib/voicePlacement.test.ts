import { describe, expect, it } from 'vitest';
import { aboveDock, DOCK_HEIGHT } from '@pocket-pantry/ui';
import {
  aboveMic,
  micBottom,
  STRIP_GAP,
  STRIP_HEIGHT,
  CARD_OFFSET,
  aboveStrip,
  voiceToast,
  VOICE_LAYER,
} from './voicePlacement';

describe('voice placement', () => {
  it('lifts the strip-aware spot clear of the Background Read strip and the air above it', () => {
    expect(aboveStrip).toEqual(
      aboveMic(CARD_OFFSET + STRIP_HEIGHT + STRIP_GAP),
    );
    expect(STRIP_HEIGHT).toBeGreaterThanOrEqual(56);
  });

  it('puts a voice toast just above the mic; the toast floor lifts it over the background strip', () => {
    expect(voiceToast()).toEqual({ polite: true, bottom: aboveMic(10) });
  });

  it('hangs the notices above the capsule that overhangs the Dock', () => {
    expect(micBottom.xs).toBe(aboveDock(DOCK_HEIGHT.xs));
    expect(micBottom.md).toBe(aboveDock(DOCK_HEIGHT.md));
    // No row between the capsule and the notices.
    expect(aboveMic(0).xs).toBe(`calc(${micBottom.xs} + 0px)`);
  });

  it('keeps the layers in order: scrim, then the cards', () => {
    expect(VOICE_LAYER.scrim).toBeLessThan(VOICE_LAYER.card);
  });
});
