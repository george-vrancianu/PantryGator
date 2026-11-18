import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';

const teach = vi.hoisted(() => ({ teaching: false }));

vi.mock('@/components/voice/VoiceHost/VoiceHost', async (importActual) => ({
  ...(await importActual<
    typeof import('@/components/voice/VoiceHost/VoiceHost')
  >()),
  useMicTeach: () => ({
    teaching: teach.teaching,
    start: () => undefined,
    stop: () => undefined,
  }),
}));
vi.mock('@/components/voice/VoiceNote/VoiceNote', async (importActual) => ({
  ...(await importActual<
    typeof import('@/components/voice/VoiceNote/VoiceNote')
  >()),
  useShowsDockMic: () => true,
}));

import { MicTeachAnnouncement } from '@/components/voice/MicTeachCallout/MicTeachCallout';
import { AppDock } from './AppDock';

describe('AppDock mic teach announcement', () => {
  afterEach(() => {
    cleanup();
    teach.teaching = false;
  });

  it('has the live region mounted before the callout shows, so the text is announced when it fills', async () => {
    function Harness() {
      const [teaching, setTeaching] = useState(false);
      return (
        <>
          <button onClick={() => setTeaching(true)}>teach</button>
          <MicTeachAnnouncement teaching={teaching} />
        </>
      );
    }
    renderWithProviders(<Harness />);
    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();

    await userEvent.click(screen.getByRole('button', { name: 'teach' }));
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent(
      'Hold the mic, talk, let go Try “two litres of milk and a dozen eggs, in the fridge”.',
    );
  });

  it('is mounted in the Dock even when nothing is taught', () => {
    renderWithProviders(<AppDock activeKey="home" />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('hides the callout itself from assistive tech, so it is not read twice', () => {
    teach.teaching = true;
    renderWithProviders(<AppDock activeKey="home" />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    const callout = screen.getAllByText('Hold the mic, talk, let go')[1];
    expect(callout.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
