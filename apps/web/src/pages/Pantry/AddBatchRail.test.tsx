import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RAIL_WIDTH } from '../../lib/scanGuides';
import { openOverlay, stubPantry } from '../../test/addBatch';
import { emitBarcode, fakeCamera, selected } from '../../test/scan';
import { stubScreen } from '../../test/screen';

// The add-Batch camera reflows into a rail on a tablet or desktop window in landscape, as the Scan
// page does (pages/Scan/CameraRail.test.tsx).
vi.mock('../../lib/camera', async () =>
  (await import('../../test/scan')).fakeCameraModule(),
);

const TABLET = { width: 820, height: 1180 };
const LANDSCAPE = { width: 1180, height: 820 };
const rail = () => screen.getByTestId('scan-rail');

describe('The add-Batch camera in landscape on a tablet', () => {
  beforeEach(() => {
    localStorage.clear();
    stubPantry();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('holds the shutter and the Product and Barcode list in the rail, with no stack', async () => {
    stubScreen({ ...TABLET, viewport: LANDSCAPE });
    await openOverlay('product');
    expect(screen.queryByTestId('scan-footer')).toBeNull();
    expect(
      within(rail())
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Product', 'Barcode']);
    expect(within(rail()).queryByTestId('photo-stack')).toBeNull();
    await userEvent.click(
      within(rail()).getByRole('radio', { name: /Barcode/ }),
    );
    expect(selected()).toEqual(['Barcode']);
  });

  it('centres the guide left of the rail and opens Info as a dialog', async () => {
    stubScreen({ ...TABLET, viewport: LANDSCAPE });
    await openOverlay('product');
    const guide = screen.getByTestId('scan-guide');
    expect(
      parseFloat(getComputedStyle(guide).left) +
        parseFloat(getComputedStyle(guide).width) / 2,
    ).toBeCloseTo((LANDSCAPE.width - RAIL_WIDTH) / 2, 0);
    await userEvent.click(
      screen.getByRole('button', { name: 'How scanning works' }),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByTestId('info-scrim')).toBeNull();
  });

  it('centres the "adds to pantry" pill on the feed, left of the rail', async () => {
    stubScreen({ ...TABLET, viewport: LANDSCAPE });
    await openOverlay('product');
    const row = screen.getByTestId('adds-to-pantry').parentElement!;
    expect(parseFloat(getComputedStyle(row).left)).toBe(0);
    expect(getComputedStyle(row).right).toContain(`${RAIL_WIDTH}px`);
  });

  it('keeps the "adds to pantry" pill centred on the window under a footer', async () => {
    stubScreen({ ...TABLET });
    await openOverlay('product');
    const row = screen.getByTestId('adds-to-pantry').parentElement!;
    expect(parseFloat(getComputedStyle(row).right)).toBe(0);
  });

  it('closes the Info dialog on Escape, not the camera', async () => {
    stubScreen({ ...TABLET, viewport: LANDSCAPE });
    await openOverlay('product');
    await userEvent.click(
      screen.getByRole('button', { name: 'How scanning works' }),
    );
    expect(
      screen.getByRole('dialog', { name: 'Scanning your pantry' }),
    ).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(
      screen.queryByRole('dialog', { name: 'Scanning your pantry' }),
    ).toBeNull();
    expect(screen.getByTestId('camera-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('scan-rail')).toBeInTheDocument();
  });

  it('shows the barcode result card in the feed, not in the rail', async () => {
    stubPantry({
      'GET /api/barcode-lookup/5941234567899': () =>
        Response.json({ found: false }),
    });
    stubScreen({ ...TABLET, viewport: LANDSCAPE });
    await openOverlay('barcode');
    await waitFor(() => expect(fakeCamera.emit).not.toBeNull());
    act(() => emitBarcode('5941234567899'));
    const card = await screen.findByTestId('barcode-card');
    expect(rail()).not.toContainElement(card);
    expect(screen.getByTestId('camera-frame')).toContainElement(card);
    expect(getComputedStyle(card).right).toContain(`${RAIL_WIDTH}px`);
  });

  it('switches to the footer when the tablet turns to portrait', async () => {
    const s = stubScreen({
      ...TABLET,
      viewport: LANDSCAPE,
      swapsOnRotate: false,
    });
    await openOverlay('product');
    expect(screen.getByTestId('scan-rail')).toBeInTheDocument();
    act(() => s.resizeViewport(TABLET));
    expect(screen.getByTestId('scan-footer')).toBeInTheDocument();
    expect(screen.queryByTestId('scan-rail')).toBeNull();
  });
});
