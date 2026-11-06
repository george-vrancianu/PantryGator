import { describe, expect, it } from 'vitest';
import { CAMERA_MODES } from './cameraMode';
import {
  FOOTER_HEIGHT,
  FOOTER_MIN_BOTTOM,
  GUIDE_LIFT,
  MODE_SLIDER_HEIGHT,
  RAIL_WIDTH,
  SCAN_GUIDES,
  SHUTTER_ROW_HEIGHT,
  TOP_BAR_HEIGHT,
  clearArea,
  clearBox,
  guideRect,
} from './scanGuides';

describe('bar heights', () => {
  it('follow the handoff: a 52 pt top bar, a 104 + 40 pt footer and at least 20 pt under it', () => {
    expect(TOP_BAR_HEIGHT).toBe(52);
    expect(SHUTTER_ROW_HEIGHT).toBe(104);
    expect(MODE_SLIDER_HEIGHT).toBe(40);
    expect(FOOTER_HEIGHT).toBe(144);
    expect(FOOTER_MIN_BOTTOM).toBe(20);
    expect(GUIDE_LIFT).toBe(14);
  });
});

describe('SCAN_GUIDES', () => {
  it('sizes each camera mode as a fraction of screen width x clear-area height', () => {
    expect(SCAN_GUIDES).toEqual({
      receipt: { width: 0.56, height: 0.78 },
      product: { width: 0.62, height: 0.56 },
      ingredients: { width: 0.88, height: 0.5 },
      plate: { width: 0.8, height: 0.6 },
      barcode: { width: 0.8, height: 0.3 },
    });
    expect(Object.keys(SCAN_GUIDES).sort()).toEqual([...CAMERA_MODES].sort());
  });
});

describe('clearArea', () => {
  it('runs from under the top bar to above the footer, safe areas included', () => {
    // 390 x 844 phone: 47 pt status bar, 34 pt home indicator.
    const clear = clearArea({
      width: 390,
      height: 844,
      insets: { top: 47, bottom: 34 },
    });
    expect(clear.top).toBe(47 + 52);
    expect(clear.top + clear.height).toBe(844 - (34 + 144));
  });

  it('treats missing insets as zero, keeping the least room under the footer', () => {
    expect(clearArea({ width: 390, height: 844 })).toEqual({
      top: 52,
      height: 844 - (20 + 144) - 52,
    });
  });

  it('keeps the least room under the footer when the bottom inset is smaller', () => {
    const clear = clearArea({
      width: 390,
      height: 844,
      insets: { top: 0, bottom: 8 },
    });
    expect(clear.top + clear.height).toBe(844 - (20 + 144));
  });
});

describe('guideRect', () => {
  const phone = { width: 390, height: 844, insets: { top: 47, bottom: 34 } };
  const clear = clearArea(phone);

  it.each(CAMERA_MODES)(
    'sizes and centres the %s guide in the clear area, 14 pt above its middle',
    (mode) => {
      const { x, y, width, height } = guideRect(mode, phone);
      expect(width).toBeCloseTo(phone.width * SCAN_GUIDES[mode].width);
      expect(height).toBeCloseTo(clear.height * SCAN_GUIDES[mode].height);
      expect(x + width / 2).toBeCloseTo(phone.width / 2);
      expect(y + height / 2).toBeCloseTo(clear.top + clear.height / 2 - 14);
    },
  );

  it('gives the Receipt guide on a 390 x 844 phone its handoff numbers', () => {
    const rect = guideRect('receipt', phone);
    expect(rect.width).toBeCloseTo(218.4);
    expect(rect.height).toBeCloseTo(0.78 * clear.height);
    expect(rect.x).toBeCloseTo((390 - 218.4) / 2);
  });

  it('stays inside the clear area for every mode', () => {
    for (const mode of CAMERA_MODES) {
      const { y, height } = guideRect(mode, phone);
      expect(y).toBeGreaterThanOrEqual(clear.top);
      expect(y + height).toBeLessThanOrEqual(clear.top + clear.height);
    }
  });

  it('moves down with the top safe area and up with the bottom one', () => {
    const plain = guideRect('product', { width: 390, height: 844 });
    const notched = guideRect('product', {
      width: 390,
      height: 844,
      insets: { top: 47, bottom: 34 },
    });
    // Centre shifts by half the difference of the insets, the bottom one floored at 20: (47 - (34 - 20)) / 2.
    expect(notched.y + notched.height / 2).toBeCloseTo(
      plain.y + plain.height / 2 + (47 - (34 - 20)) / 2,
      0,
    );
  });
});

describe('guideRect on a tablet', () => {
  const reference = { width: 390, height: 844 };
  const ratioOf = (mode: (typeof CAMERA_MODES)[number]) => {
    const r = guideRect(mode, reference);
    return r.width / r.height;
  };
  const views = [
    { name: 'iPad portrait', width: 768, height: 1024 },
    { name: 'tablet portrait', width: 820, height: 1180 },
    { name: 'tablet landscape', width: 1024, height: 768 },
    { name: 'iPad Pro landscape', width: 1366, height: 1024 },
    { name: 'desktop window', width: 1440, height: 900 },
  ];

  describe.each(views)('$name', ({ width, height }) => {
    const view = { width, height, deviceClass: 'tablet' as const };
    const clear = clearBox(view);

    it.each(CAMERA_MODES)(
      '%s keeps its phone ratio, fits and is centred then lifted',
      (mode) => {
        const rect = guideRect(mode, view);
        expect(rect.width / rect.height).toBeCloseTo(ratioOf(mode), 6);
        expect(rect.height).toBeLessThanOrEqual(clear.height * 0.8 + 1e-9);
        expect(rect.width).toBeLessThanOrEqual(clear.width + 1e-9);
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width / 2).toBeCloseTo(width / 2);
        expect(rect.y + rect.height / 2).toBeCloseTo(
          clear.top + clear.height / 2 - GUIDE_LIFT,
        );
      },
    );

    it('keeps the Receipt guide taller than wide', () => {
      const rect = guideRect('receipt', view);
      expect(rect.height).toBeGreaterThan(rect.width);
    });
  });

  it('fills 80% of the clear height when the width allows', () => {
    const view = { width: 1024, height: 768, deviceClass: 'tablet' as const };
    expect(guideRect('receipt', view).height).toBeCloseTo(
      clearBox(view).height * 0.8,
    );
  });

  it('is held to 90% of the clear width for the wide Barcode guide', () => {
    const view = { width: 768, height: 1024, deviceClass: 'tablet' as const };
    expect(guideRect('barcode', view).width).toBeCloseTo(768 * 0.9);
  });

  describe('in the rail layout', () => {
    const view = {
      width: 1024,
      height: 768,
      deviceClass: 'tablet' as const,
      layout: 'rail' as const,
    };

    it('has no footer and gives the rail its width', () => {
      expect(clearBox(view)).toEqual({
        left: 0,
        top: TOP_BAR_HEIGHT,
        width: 1024 - RAIL_WIDTH,
        height: 768 - TOP_BAR_HEIGHT,
      });
    });

    it('keeps the bottom safe area clear, not the footer', () => {
      expect(
        clearBox({ ...view, insets: { top: 24, bottom: 20 } }),
      ).toMatchObject({
        top: 24 + TOP_BAR_HEIGHT,
        height: 768 - 20 - 24 - TOP_BAR_HEIGHT,
      });
    });

    it('centres the guide in the clear area, left of the rail', () => {
      for (const mode of CAMERA_MODES) {
        const rect = guideRect(mode, view);
        const clear = clearBox(view);
        expect(rect.x + rect.width / 2).toBeCloseTo(clear.width / 2);
        expect(rect.y + rect.height / 2).toBeCloseTo(
          clear.top + clear.height / 2,
        );
        expect(rect.x + rect.width).toBeLessThanOrEqual(clear.width);
      }
    });
  });

  it('the footer layout is the default and unchanged', () => {
    const view = { width: 1024, height: 768, deviceClass: 'tablet' as const };
    for (const mode of CAMERA_MODES) {
      expect(guideRect(mode, { ...view, layout: 'footer' })).toEqual(
        guideRect(mode, view),
      );
    }
  });

  it("an explicit phone device class gives today's guide", () => {
    const phone = { width: 390, height: 844, insets: { top: 47, bottom: 34 } };
    for (const mode of CAMERA_MODES) {
      expect(guideRect(mode, { ...phone, deviceClass: 'phone' })).toEqual(
        guideRect(mode, phone),
      );
    }
  });
});
