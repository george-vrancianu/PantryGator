import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vitest';
import { resetScanSession } from '../../lib/scanSession';
import { RAIL_WIDTH } from '../../lib/scanGuides';
import { renderWithProviders } from '../../test/render';
import { fakeCamera, resetFakeCamera, selected, slider } from '../../test/scan';
import { stubScreen } from '../../test/screen';
import { IntroCameraPage } from '../Intro/IntroCameraPage';
import { ScanPage } from './ScanPage';

// On a tablet or desktop window in landscape the controls reflow into a rail on the right. The
// add-Batch camera is covered in pages/Pantry/AddBatchRail.test.tsx.
vi.mock('../../lib/camera', async () =>
  (await import('../../test/scan')).fakeCameraModule(),
);

const TABLET = { width: 820, height: 1180 };
const PHONE = { width: 390, height: 844 };
const LANDSCAPE = { width: 1180, height: 820 };

function renderCamera(route: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => {})),
  );
  return renderWithProviders(
    <Routes>
      <Route path="/scan" element={<ScanPage />} />
      <Route path="/intro/camera" element={<IntroCameraPage />} />
    </Routes>,
    { route },
  );
}

const rail = () => screen.getByTestId('scan-rail');

describe('The Scan page in landscape on a tablet', () => {
  beforeEach(() => {
    localStorage.clear();
    resetScanSession();
    resetFakeCamera();
    fakeCamera.zoomSupported = true;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('puts the stack, zoom, shutter, modes and Import in the rail, top to bottom', () => {
    stubScreen({ ...TABLET, viewport: LANDSCAPE });
    renderCamera('/scan?mode=product');
    expect(screen.queryByTestId('scan-footer')).toBeNull();
    const inRail = within(rail());
    const order = [
      inRail.getByTestId('photo-stack'),
      inRail.getByRole('group', { name: 'Zoom' }),
      inRail.getByRole('button', { name: /take|shutter|scan/i }),
      inRail.getByRole('radiogroup', { name: 'Scan mode' }),
      inRail.getByRole('button', { name: /import|add from photos/i }),
    ];
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1].compareDocumentPosition(order[i]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it('keeps the top bar across the top, outside the rail', () => {
    stubScreen({ ...TABLET, viewport: LANDSCAPE });
    renderCamera('/scan?mode=product');
    expect(screen.getByTestId('scan-top-bar')).toBeInTheDocument();
    expect(rail()).not.toContainElement(screen.getByTestId('scan-top-bar'));
  });

  it('shows every mode in a vertical list, the chosen one selected, and changes mode by tap', async () => {
    stubScreen({ ...TABLET, viewport: LANDSCAPE });
    renderCamera('/scan?mode=product');
    expect(rail()).toContainElement(slider());
    expect(within(slider()).getAllByRole('radio')).toHaveLength(5);
    expect(selected()).toEqual(['Product']);
    await userEvent.click(
      within(slider()).getByRole('radio', { name: /^Receipt/ }),
    );
    expect(selected()).toEqual(['Receipt']);
  });

  it('keeps the arrow keys, and answers up and down too', async () => {
    stubScreen({ ...TABLET, viewport: LANDSCAPE });
    renderCamera('/scan?mode=product');
    await userEvent.keyboard('{ArrowRight}');
    expect(selected()).toEqual(['Barcode']);
    await userEvent.keyboard('{ArrowUp}');
    expect(selected()).toEqual(['Product']);
    await userEvent.keyboard('{ArrowLeft}');
    expect(selected()).toEqual(['Ingredients']);
    await userEvent.keyboard('{ArrowDown}');
    expect(selected()).toEqual(['Product']);
  });

  it('centres the guide left of the rail', () => {
    stubScreen({ ...TABLET, viewport: LANDSCAPE });
    renderCamera('/scan?mode=product');
    const guide = screen.getByTestId('scan-guide');
    const left = parseFloat(getComputedStyle(guide).left);
    const width = parseFloat(getComputedStyle(guide).width);
    expect(left + width / 2).toBeCloseTo((LANDSCAPE.width - RAIL_WIDTH) / 2, 0);
    expect(left + width).toBeLessThanOrEqual(LANDSCAPE.width - RAIL_WIDTH);
  });

  it('puts the status line in the feed, not in the rail', () => {
    stubScreen({ ...TABLET, viewport: LANDSCAPE });
    renderCamera('/scan?mode=barcode');
    const status = screen.getByText('Point the camera at the barcode.');
    expect(rail()).not.toContainElement(status);
    expect(screen.getByTestId('camera-frame')).toContainElement(status);
  });

  it('stops the status line short of the rail', () => {
    stubScreen({ ...TABLET, viewport: LANDSCAPE });
    renderCamera('/scan?mode=barcode');
    expect(getComputedStyle(screen.getByTestId('scan-status')).right).toContain(
      `${RAIL_WIDTH}px`,
    );
  });

  it('scrolls the chosen mode into view', () => {
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    onTestFinished(() => {
      // jsdom has no scrollIntoView; put it back as it was
      if (original) Element.prototype.scrollIntoView = original;
      else
        // @ts-expect-error removing the stub
        delete Element.prototype.scrollIntoView;
    });
    stubScreen({ ...TABLET, viewport: LANDSCAPE });
    renderCamera('/scan?mode=receipt');
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(
      scrollIntoView.mock.contexts.some(
        (el) => (el as HTMLElement).getAttribute('aria-checked') === 'true',
      ),
    ).toBe(true);
  });

  it('opens Info as a centred dialog', async () => {
    stubScreen({ ...TABLET, viewport: LANDSCAPE });
    renderCamera('/scan?mode=product');
    await userEvent.click(
      screen.getByRole('button', { name: 'How scanning works' }),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // It portals out of the camera's subtree, so it carries the dark Theme itself.
    expect(
      screen.getByRole('dialog').closest('.MuiDialog-root'),
    ).toHaveAttribute('data-theme', 'dark');
    expect(screen.queryByTestId('info-scrim')).toBeNull();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the footer in a landscape window under 500 px tall', () => {
    stubScreen({ ...TABLET, viewport: { width: 1180, height: 499 } });
    renderCamera('/scan?mode=product');
    expect(screen.getByTestId('scan-footer')).toBeInTheDocument();
    expect(screen.queryByTestId('scan-rail')).toBeNull();
  });

  it('drops the rail for the footer when a mounted landscape window is resized under 500 px tall', () => {
    const s = stubScreen({ ...TABLET, viewport: LANDSCAPE });
    renderCamera('/scan?mode=product');
    expect(screen.getByTestId('scan-rail')).toBeInTheDocument();
    act(() => s.resizeViewport({ width: 1180, height: 499 }));
    expect(screen.getByTestId('scan-footer')).toBeInTheDocument();
    expect(screen.queryByTestId('scan-rail')).toBeNull();
    act(() => s.resizeViewport({ width: 1180, height: 500 }));
    expect(screen.getByTestId('scan-rail')).toBeInTheDocument();
  });

  it('switches between footer and rail when the tablet rotates', () => {
    const s = stubScreen({ ...TABLET, swapsOnRotate: false });
    renderCamera('/scan?mode=product');
    expect(screen.getByTestId('scan-footer')).toBeInTheDocument();
    expect(screen.queryByTestId('scan-rail')).toBeNull();
    act(() => s.rotate(90));
    expect(screen.getByTestId('scan-rail')).toBeInTheDocument();
    expect(screen.queryByTestId('scan-footer')).toBeNull();
    // Tablets are never rotated back.
    expect(screen.getByTestId('camera-frame')).toHaveAttribute(
      'data-rotate-back',
      '0',
    );
    act(() => s.rotate(0));
    expect(screen.getByTestId('scan-footer')).toBeInTheDocument();
    expect(screen.queryByTestId('scan-rail')).toBeNull();
  });

  it('keeps the footer on a tablet in portrait and on a phone', () => {
    stubScreen({ ...TABLET });
    const first = renderCamera('/scan?mode=product');
    expect(screen.getByTestId('scan-footer')).toBeInTheDocument();
    first.unmount();
    vi.unstubAllGlobals();
    stubScreen({ ...PHONE });
    renderCamera('/scan?mode=product');
    expect(screen.getByTestId('scan-footer')).toBeInTheDocument();
    expect(screen.queryByTestId('scan-rail')).toBeNull();
  });
});

describe('The Intro camera in landscape on a tablet', () => {
  beforeEach(() => {
    localStorage.clear();
    resetScanSession();
    resetFakeCamera();
    fakeCamera.zoomSupported = true;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('offers only its modes and no Import in the rail', () => {
    stubScreen({ ...TABLET, viewport: LANDSCAPE });
    renderCamera('/intro/camera?mode=ingredients');
    expect(within(slider()).getAllByRole('radio')).toHaveLength(2);
    expect(rail()).toContainElement(screen.getByTestId('photo-stack'));
    const imports = within(rail()).queryByRole('button', {
      name: /import|add from photos/i,
    });
    // Import keeps its place only when the host offers it.
    expect(imports).toBeNull();
  });
});
