import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { stubMatchMedia } from '@/test/viewport';
import { PantryPage } from './PantryPage';
import { openOverlay, stubPantry } from '@/test/addBatch';
import { emitBarcode, fakeCamera } from '@/test/scan';

// The add-Batch camera's v3 chrome, opened from the Pantry's add-Batch form. Prefill itself is
// covered in AddBatchPrefill and AddBatchBarcode; here the camera closes on a result.
vi.mock('@/lib/camera', async () =>
  (await import('@/test/scan')).fakeCameraModule(),
);
vi.mock('@/lib/image', () => ({
  resizeImage: () => Promise.resolve('data:image/jpeg;base64,AAAA'),
}));

const bar = () => within(screen.getByTestId('scan-top-bar'));
const overlay = () => screen.queryByTestId('camera-overlay');

describe('The add-Batch camera chrome', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('has the glass top bar, the two-word slider and no stack, in Product', async () => {
    stubPantry();
    await openOverlay('product');
    expect(bar().getByRole('button', { name: 'Close scanner' })).toBeVisible();
    expect(bar().getByRole('button', { name: /^Torch/ })).toBeVisible();
    expect(bar().getByRole('button', { name: 'Reading as' })).toBeVisible();
    expect(
      bar().getByRole('button', { name: 'How scanning works' }),
    ).toBeVisible();
    expect(
      screen.getAllByRole('radio').map((radio) => radio.textContent),
    ).toEqual(['Product', 'Barcode']);
    expect(screen.queryByTestId('photo-stack')).toBeNull();
  });

  it('keeps Info and drops the language chip in Barcode', async () => {
    stubPantry();
    await openOverlay('barcode');
    expect(
      bar().getByRole('button', { name: 'How scanning works' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Reading as' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('shutter-ring')).toBeInTheDocument();
  });

  it('opens an Info sheet about Product and Barcode only, and Escape closes it, not the camera', async () => {
    stubPantry();
    const user = await openOverlay('product');
    await user.click(bar().getByRole('button', { name: 'How scanning works' }));
    const sheet = screen.getByRole('dialog', { name: 'Scanning your pantry' });
    expect(within(sheet).getByText('Product')).toBeInTheDocument();
    expect(within(sheet).getByText('Barcode')).toBeInTheDocument();
    expect(within(sheet).queryByText('Receipt')).toBeNull();
    expect(within(sheet).queryByText('Plate')).toBeNull();
    expect(sheet).not.toHaveTextContent(/stack/);
    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('dialog', { name: 'Scanning your pantry' }),
    ).toBeNull();
    expect(overlay()).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: 'Add to Pantry' }),
    ).toBeInTheDocument();
  });

  it('closes on a Product Scan that reads', async () => {
    stubPantry({
      'POST /api/scan/product': () =>
        Response.json({
          lines: [
            {
              name: 'Zorblax',
              sourceText: null,
              match: null,
              lowConfidence: false,
              quantity: null,
              unit: null,
              expiryDate: null,
              productDescription: null,
            },
          ],
        }),
    });
    await openOverlay('product');
    fireEvent.click(screen.getByRole('button', { name: 'Take photo' }));
    await waitFor(() => expect(overlay()).toBeNull());
  });

  it('closes on a decoded barcode once Use this is pressed', async () => {
    stubPantry({
      'GET /api/barcode-lookup/3017620422003': () =>
        Response.json({
          found: true,
          source: 'known_barcode',
          match: null,
          lowConfidence: false,
          allergens: [],
          missingAllergens: [],
          productDescription: 'Hazelnut spread',
          quantity: null,
          unit: null,
        }),
    });
    await openOverlay('barcode');
    await waitFor(() => expect(fakeCamera.emit).not.toBeNull());
    act(() => emitBarcode('3017620422003'));
    fireEvent.click(await screen.findByRole('button', { name: 'Use this' }));
    await waitFor(() => expect(overlay()).toBeNull());
  });
});

describe('The add-Batch camera hand-offs', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('says it adds to the Pantry, and Scan several closes the sheet and opens the Scan page in the same mode', async () => {
    stubPantry();
    const user = userEvent.setup();
    function Where() {
      const location = useLocation();
      return (
        <output data-testid="where">
          {location.pathname + location.search}
        </output>
      );
    }
    renderWithProviders(
      <>
        <PantryPage />
        <Where />
      </>,
      { route: '/pantry' },
    );
    await user.click(await screen.findByRole('button', { name: 'Add batch' }));
    await user.click(screen.getByRole('button', { name: 'Scan barcode' }));
    const pill = within(screen.getByTestId('adds-to-pantry'));
    expect(pill.getByText('Adds to your Pantry')).toBeVisible();
    await user.click(pill.getByRole('button', { name: 'Scan several' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/scan?mode=barcode');
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Add to Pantry' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('Scan several from Product opens the Scan page in Product mode', async () => {
    stubPantry();
    const user = userEvent.setup();
    function Where() {
      const location = useLocation();
      return (
        <output data-testid="where">
          {location.pathname + location.search}
        </output>
      );
    }
    renderWithProviders(
      <>
        <PantryPage />
        <Where />
      </>,
      { route: '/pantry' },
    );
    await user.click(await screen.findByRole('button', { name: 'Add batch' }));
    await user.click(screen.getByRole('button', { name: 'Take a photo' }));
    await user.click(screen.getByRole('button', { name: 'Scan several' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/scan?mode=product');
  });

  it('sweeps a scan line in the Barcode guide, and hides it in Product', async () => {
    stubPantry();
    const user = await openOverlay('barcode');
    expect(
      within(screen.getByTestId('scan-guide')).getByTestId('scan-line'),
    ).not.toHaveAttribute('data-static');
    await user.click(screen.getByRole('radio', { name: 'Product' }));
    expect(screen.queryByTestId('scan-line')).toBeNull();
  });

  it('holds the scan line still under reduced motion', async () => {
    stubMatchMedia((query) => query.includes('prefers-reduced-motion'));
    stubPantry();
    await openOverlay('barcode');
    expect(screen.getByTestId('scan-line')).toHaveAttribute(
      'data-static',
      'true',
    );
  });
});

describe('The add-Batch camera zoom pill', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('is hidden when the camera cannot zoom', async () => {
    stubPantry();
    await openOverlay('product');
    expect(screen.queryByRole('group', { name: 'Zoom' })).toBeNull();
  });

  it('switches between 1× and 2 with aria-pressed when it can', async () => {
    fakeCamera.zoomSupported = true;
    stubPantry();
    const user = await openOverlay('product');
    const pill = within(screen.getByRole('group', { name: 'Zoom' }));
    const one = pill.getByRole('button', { name: 'Zoom 1×' });
    const two = pill.getByRole('button', { name: 'Zoom 2×' });
    expect(one).toHaveAttribute('aria-pressed', 'true');
    expect(two).toHaveAttribute('aria-pressed', 'false');
    await user.click(two);
    expect(fakeCamera.zooms).toEqual([2]);
    expect(two).toHaveAttribute('aria-pressed', 'true');
    expect(one).toHaveAttribute('aria-pressed', 'false');
    await user.click(one);
    expect(fakeCamera.zooms).toEqual([2, 1]);
    expect(one).toHaveAttribute('aria-pressed', 'true');
  });
});
