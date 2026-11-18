import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Popper, roomOnSide } from './Popper';

describe('roomOnSide', () => {
  const anchor = { top: 500, bottom: 550 };

  it('measures below the anchor for a bottom placement, less the inset', () => {
    expect(roomOnSide('bottom-start', anchor, 700, 8)).toBe(142);
  });

  it('measures above the anchor for a top placement, less the inset', () => {
    expect(roomOnSide('top-end', anchor, 700, 8)).toBe(492);
  });

  it('is never negative', () => {
    expect(roomOnSide('bottom', { top: 690, bottom: 700 }, 700, 24)).toBe(0);
  });

  it('keeps a larger inset, such as one that clears the Dock', () => {
    expect(roomOnSide('bottom', anchor, 700, 100)).toBe(50);
  });
});

describe('Popper', () => {
  afterEach(cleanup);

  function Host({ contain }: { contain?: boolean | { inset?: number } }) {
    return (
      <>
        <button type="button" id="anchor">
          anchor
        </button>
        <Popper
          open
          anchorEl={document.getElementById('anchor')}
          contain={contain}
        >
          <div>popup</div>
        </Popper>
      </>
    );
  }

  it('leaves the popup uncapped by default', () => {
    const { rerender } = render(<Host />);
    rerender(<Host />);
    expect(screen.getByText('popup').parentElement!.style.maxHeight).toBe('');
  });

  it('caps the popup to the room on its side when asked to contain it', async () => {
    const { rerender } = render(<Host contain />);
    rerender(<Host contain={{ inset: 8 }} />);
    const popup = await screen.findByText('popup');
    await waitFor(() => {
      expect(popup.parentElement!.style.maxHeight).toMatch(/^\d+px$/);
    });
    expect(popup.parentElement!.style.overflowY).toBe('auto');
  });
});
