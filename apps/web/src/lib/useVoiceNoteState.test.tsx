import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useVoiceNoteState, voiceNote } from './voiceNote';

// The production hook on the default Voice Note (no test/voice: nothing here is swapped or mocked).
function Failed() {
  return <p>{`failed: ${useVoiceNoteState().inbox.failed}`}</p>;
}

describe('useVoiceNoteState', () => {
  afterEach(() => voiceNote.clear());

  it('re-renders a component when the Voice Note state changes', () => {
    render(<Failed />);
    expect(screen.getByText('failed: 0')).toBeVisible();

    act(() => voiceNote.fail('unavailable'));
    expect(screen.getByText('failed: 1')).toBeVisible();

    act(() => voiceNote.clear());
    expect(screen.getByText('failed: 0')).toBeVisible();
  });
});
