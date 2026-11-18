import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '@/test/render';
import { languageChip, selected, slider } from '@/test/scan';
import { ScanPage } from './ScanPage';

vi.mock('@/lib/camera', async () =>
  (await import('@/test/scan')).fakeCameraModule(),
);
vi.mock('@/lib/image', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/image')>()),
  resizeImage: () => Promise.resolve('data:image/jpeg;base64,YQ=='),
}));
vi.mock('react-easy-crop', () => ({
  default: () => <div data-testid="cropper" />,
}));

function setup(route: string, routes: Record<string, () => Response> = {}) {
  const { fetchMock } = stubApi({
    'GET /api/catalog/parents': () => Response.json({ parents: [] }),
    ...routes,
  });
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(
    <Routes>
      <Route path="/scan" element={<ScanPage />} />
    </Routes>,
    { route },
  );
}

describe('Scan mode slider: when arrows must not change the mode', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:photo');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('ignores arrows while the Info sheet is open', async () => {
    setup('/scan?mode=product');
    await userEvent.click(
      screen.getByRole('button', { name: 'How scanning works' }),
    );
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(selected()).toEqual(['Product']);
  });

  it('leaves arrows to the Scan Language menu while it is open', async () => {
    setup('/scan?mode=product');
    await userEvent.click(languageChip());
    await userEvent.keyboard('{ArrowDown}{ArrowRight}{ArrowLeft}');
    expect(selected()).toEqual(['Product']);
  });

  it('leaves arrows to a textarea and an editable element', async () => {
    setup('/scan?mode=product');
    const area = document.createElement('textarea');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.append(area, editable);
    try {
      area.focus();
      await userEvent.keyboard('{ArrowRight}');
      fireEvent.keyDown(editable, { key: 'ArrowRight' });
      expect(selected()).toEqual(['Product']);
    } finally {
      area.remove();
      editable.remove();
    }
  });

  it.each(['altKey', 'ctrlKey', 'metaKey'])(
    'ignores an arrow pressed with %s',
    (modifier) => {
      setup('/scan?mode=product');
      fireEvent.keyDown(document.body, { key: 'ArrowLeft', [modifier]: true });
      expect(selected()).toEqual(['Product']);
    },
  );

  it('ignores an arrow another handler already handled', () => {
    setup('/scan?mode=product');
    const handled = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    handled.preventDefault();
    document.body.dispatchEvent(handled);
    expect(selected()).toEqual(['Product']);
  });

  it('moves focus to the newly selected radio after an arrow press', async () => {
    setup('/scan?mode=product');
    within(slider()).getByRole('radio', { name: 'Product' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() =>
      expect(
        within(slider()).getByRole('radio', { name: 'Barcode' }),
      ).toHaveFocus(),
    );
  });

  it('announces the change in the slider status, naming the new mode', async () => {
    setup('/scan?mode=product');
    await userEvent.click(
      within(slider()).getByRole('radio', { name: 'Plate' }),
    );
    const live = screen
      .getAllByRole('status')
      .filter((el) => el.textContent?.trim() === 'Plate mode');
    expect(live).toHaveLength(1);
  });
});
