import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  Popper,
  containedHeight,
  pickSide,
  placementOnSide,
  roomOnSide,
} from './Popper';

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

describe('pickSide', () => {
  it('opens below when the content fits there', () => {
    expect(pickSide({ top: 100, bottom: 150 }, 700, 300, 8)).toBe('bottom');
  });

  it('opens below when a comfortable height is there, even if the content is taller', () => {
    expect(pickSide({ top: 300, bottom: 350 }, 700, 900, 8)).toBe('bottom');
  });

  it('opens above when neither side fits the content and above has more room', () => {
    expect(pickSide({ top: 500, bottom: 550 }, 700, 900, 8)).toBe('top');
  });

  it('stays below when neither side fits and below has more room', () => {
    expect(pickSide({ top: 100, bottom: 150 }, 300, 900, 8)).toBe('bottom');
  });

  it('only needs the content height, not a comfortable one, when the content is short', () => {
    expect(pickSide({ top: 500, bottom: 550 }, 700, 100, 8)).toBe('bottom');
  });
});

describe('placementOnSide', () => {
  it('moves to the other side and keeps the alignment', () => {
    expect(placementOnSide('bottom-start', 'top')).toBe('top-start');
    expect(placementOnSide('top-end', 'bottom')).toBe('bottom-end');
    expect(placementOnSide('bottom', 'top')).toBe('top');
  });

  it('is null when already on that side', () => {
    expect(placementOnSide('bottom-start', 'bottom')).toBeNull();
  });
});

describe('containedHeight', () => {
  it('is the room, but never under the minimum', () => {
    expect(containedHeight(300)).toBe(300);
    expect(containedHeight(10)).toBe(120);
  });

  it('is capped by an explicit maxHeight', () => {
    expect(containedHeight(500, 360)).toBe(360);
    expect(containedHeight(200, 360)).toBe(200);
  });
});

describe('Popper', () => {
  afterEach(cleanup);

  function Host({
    contain,
  }: {
    contain?: boolean | { inset?: number; maxHeight?: number };
  }) {
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

  it('respects an explicit maxHeight below the room on its side', async () => {
    const { rerender } = render(<Host contain={{ maxHeight: 90 }} />);
    rerender(<Host contain={{ maxHeight: 90 }} />);
    const popup = await screen.findByText('popup');
    await waitFor(() => {
      expect(popup.parentElement!.style.maxHeight).toBe('90px');
    });
  });
});
