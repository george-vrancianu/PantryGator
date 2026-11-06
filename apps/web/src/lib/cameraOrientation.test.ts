import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubScreen } from '../test/screen';
import {
  cameraOrientation,
  readCameraOrientation,
  watchCameraOrientation,
} from './cameraOrientation';

const sizes = {
  ipadLandscape: { width: 1024, height: 768 },
  phonePortrait: { width: 390, height: 844 },
  phoneLandscape: { width: 844, height: 390 },
  tabletPortrait: { width: 820, height: 1180 },
  tabletLandscape: { width: 1180, height: 820 },
  desktop: { width: 1440, height: 900 },
  edgePhone: { width: 599, height: 1200 },
  edgeTablet: { width: 600, height: 1000 },
};

/** Screen and viewport of the same size, as on a window filling its screen. */
const input = (
  size: { width: number; height: number },
  angle: number,
  native: boolean,
) => ({
  screenWidth: size.width,
  screenHeight: size.height,
  viewportWidth: size.width,
  viewportHeight: size.height,
  angle,
  native,
});

describe('cameraOrientation locksPortrait', () => {
  it.each([
    ['phone in the app', sizes.phonePortrait, true, true],
    ['phone on the web', sizes.phonePortrait, false, false],
    ['tablet in the app', sizes.tabletPortrait, true, false],
    ['tablet on the web', sizes.tabletPortrait, false, false],
  ])('%s', (_name, size, native, locks) => {
    expect(cameraOrientation(input(size, 0, native)).locksPortrait).toBe(locks);
  });
});

describe('cameraOrientation device class and layout', () => {
  it.each([
    ['phone portrait', sizes.phonePortrait, 'phone', 'footer'],
    ['phone landscape (844 x 390)', sizes.phoneLandscape, 'phone', 'footer'],
    ['tablet portrait', sizes.tabletPortrait, 'tablet', 'footer'],
    ['tablet landscape', sizes.tabletLandscape, 'tablet', 'rail'],
    ['1024 x 768 tablet', sizes.ipadLandscape, 'tablet', 'rail'],
    ['desktop window', sizes.desktop, 'tablet', 'rail'],
    ['shortest side 599', sizes.edgePhone, 'phone', 'footer'],
    ['shortest side 600', sizes.edgeTablet, 'tablet', 'footer'],
  ] as const)('%s', (_name, size, deviceClass, layout) => {
    const result = cameraOrientation(input(size, 0, false));
    expect(result.deviceClass).toBe(deviceClass);
    expect(result.layout).toBe(layout);
  });

  it.each([
    ['500 px tall gets the rail', 500, 'rail'],
    ['499 px tall keeps the footer', 499, 'footer'],
  ] as const)('a wide tablet window %s', (_name, height, layout) => {
    const result = cameraOrientation({
      ...input(sizes.tabletLandscape, 0, false),
      viewportWidth: 1200,
      viewportHeight: height,
    });
    expect(result.layout).toBe(layout);
    expect(result.deviceClass).toBe('tablet');
  });

  it('a phone stays a phone when the screen turns', () => {
    for (const size of [sizes.phonePortrait, sizes.phoneLandscape]) {
      for (const angle of [0, 90, 180, 270]) {
        expect(cameraOrientation(input(size, angle, false)).deviceClass).toBe(
          'phone',
        );
      }
    }
  });
});

describe('cameraOrientation angles', () => {
  it.each([
    [0, 0],
    [90, 90],
    [180, 180],
    [270, 270],
  ])(
    'on a phone on the web, reported %i gives rotate-back and photo turn %i',
    (angle, expected) => {
      for (const size of [sizes.phonePortrait, sizes.phoneLandscape]) {
        const result = cameraOrientation(input(size, angle, false));
        expect(result.rotateBack).toBe(expected);
        expect(result.photoTurn).toBe(expected);
      }
    },
  );

  it.each([0, 90, 180, 270])(
    'in the app both angles are 0 (reported %i)',
    (angle) => {
      for (const size of Object.values(sizes)) {
        const result = cameraOrientation(input(size, angle, true));
        expect(result.rotateBack).toBe(0);
        expect(result.photoTurn).toBe(0);
      }
    },
  );

  it.each([0, 90, 180, 270])(
    'a tablet never gets a rotate-back or photo turn (reported %i)',
    (angle) => {
      for (const size of [
        sizes.tabletPortrait,
        sizes.tabletLandscape,
        sizes.desktop,
        sizes.edgeTablet,
      ]) {
        const result = cameraOrientation(input(size, angle, false));
        expect(result.rotateBack).toBe(0);
        expect(result.photoTurn).toBe(0);
      }
    },
  );

  it.each([
    [-90, 270],
    [-180, 180],
    [-270, 90],
    [450, 90],
    [360, 0],
    [45, 0],
    [Number.NaN, 0],
  ])(
    'normalises reported %s to %s on a phone on the web',
    (angle, expected) => {
      const result = cameraOrientation(
        input(sizes.phonePortrait, angle, false),
      );
      expect(result.rotateBack).toBe(expected);
      expect(result.photoTurn).toBe(expected);
    },
  );
});

describe('reading the screen', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reads size, angle and app vs web from the screen', () => {
    const screen = stubScreen({ width: 390, height: 844, angle: 90 });
    expect(readCameraOrientation()).toMatchObject({
      deviceClass: 'phone',
      layout: 'footer',
      rotateBack: 90,
      photoTurn: 90,
    });
    screen.setNative(true);
    expect(readCameraOrientation()).toMatchObject({
      rotateBack: 0,
      photoTurn: 0,
    });
  });

  it('a phone turned to landscape stays a phone with the angle following', () => {
    const screen = stubScreen({ width: 390, height: 844 });
    screen.rotate(90);
    expect(readCameraOrientation()).toMatchObject({
      deviceClass: 'phone',
      layout: 'footer',
      rotateBack: 90,
    });
  });

  it('an Android tablet turned to landscape gets the rail', () => {
    const screen = stubScreen({ width: 820, height: 1180 });
    expect(readCameraOrientation().layout).toBe('footer');
    screen.rotate(90);
    expect(readCameraOrientation().layout).toBe('rail');
  });

  it('an iPad turned to landscape gets the rail though its screen size stays portrait', () => {
    const screen = stubScreen({
      width: 820,
      height: 1180,
      swapsOnRotate: false,
    });
    screen.rotate(90);
    expect(window.screen.height).toBeGreaterThan(window.screen.width);
    expect(readCameraOrientation()).toMatchObject({
      deviceClass: 'tablet',
      layout: 'rail',
    });
  });

  it('an iPhone turned to landscape stays a phone with the angle following', () => {
    const screen = stubScreen({
      width: 390,
      height: 844,
      swapsOnRotate: false,
    });
    screen.rotate(270);
    expect(readCameraOrientation()).toMatchObject({
      deviceClass: 'phone',
      layout: 'footer',
      rotateBack: 270,
    });
  });

  it('a narrow window on a landscape monitor gets no rail', () => {
    stubScreen({
      width: 1920,
      height: 1080,
      viewport: { width: 500, height: 900 },
    });
    expect(readCameraOrientation()).toMatchObject({
      deviceClass: 'tablet',
      layout: 'footer',
    });
  });

  it('a wide window gets the rail and resizing it narrow takes it away', () => {
    const screen = stubScreen({ width: 1920, height: 1080 });
    expect(readCameraOrientation().layout).toBe('rail');
    screen.resizeViewport({ width: 500, height: 900 });
    expect(readCameraOrientation().layout).toBe('footer');
  });

  it('reads the angle from window.orientation where screen.orientation is missing', () => {
    const screen = stubScreen({
      width: 390,
      height: 844,
      legacyOrientation: true,
    });
    screen.setAngle(270);
    expect(window.orientation).toBe(-90);
    expect(readCameraOrientation().rotateBack).toBe(270);
    screen.setAngle(90);
    expect(readCameraOrientation().rotateBack).toBe(90);
  });

  it('watches orientationchange where screen.orientation is missing', () => {
    const screen = stubScreen({
      width: 390,
      height: 844,
      legacyOrientation: true,
    });
    const seen: number[] = [];
    const stop = watchCameraOrientation((o) => seen.push(o.rotateBack));
    screen.setAngle(180);
    stop();
    screen.setAngle(90);
    expect(seen).toEqual([180]);
  });

  it('tells a watcher when the reported angle changes, until it stops', () => {
    const screen = stubScreen({ width: 390, height: 844 });
    const seen: number[] = [];
    const stop = watchCameraOrientation((o) => seen.push(o.rotateBack));
    screen.setAngle(180);
    stop();
    screen.setAngle(270);
    expect(seen).toEqual([180]);
  });

  it('tells a watcher when the window resizes, until it stops', () => {
    const screen = stubScreen({ width: 1920, height: 1080 });
    const seen: string[] = [];
    const stop = watchCameraOrientation((o) => seen.push(o.layout));
    screen.resizeViewport({ width: 500, height: 900 });
    stop();
    screen.resizeViewport({ width: 1200, height: 900 });
    expect(seen).toEqual(['footer']);
  });

  it('tells a watcher once, with the final reading, when the angle arrives before the window size', () => {
    const screen = stubScreen({ width: 820, height: 1180 });
    const seen: Array<[number, number, string]> = [];
    const stop = watchCameraOrientation((o) =>
      seen.push([o.viewportWidth, o.viewportHeight, o.layout]),
    );
    screen.inOneFrame(() => {
      // `change` fires while the window still has its old size, then the size follows.
      screen.setAngle(90);
      screen.resizeViewport({ width: 1180, height: 820 });
      window.dispatchEvent(new Event('orientationchange'));
    });
    stop();
    expect(seen).toEqual([[1180, 820, 'rail']]);
  });

  it('tells no one when the frame finds the reading unchanged', () => {
    const screen = stubScreen({ width: 390, height: 844 });
    const seen: number[] = [];
    const stop = watchCameraOrientation((o) => seen.push(o.rotateBack));
    screen.inOneFrame(() => {
      screen.setAngle(0);
      screen.resizeViewport({ width: 390, height: 844 });
    });
    stop();
    expect(seen).toEqual([]);
  });

  it('a stop before the frame runs tells no one', () => {
    const screen = stubScreen({ width: 390, height: 844 });
    const seen: number[] = [];
    const stop = watchCameraOrientation((o) => seen.push(o.rotateBack));
    screen.inOneFrame(() => {
      screen.setAngle(90);
      stop();
    });
    expect(seen).toEqual([]);
  });

  it('stop removes every listener it added', () => {
    stubScreen({ width: 390, height: 844 });
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const stop = watchCameraOrientation(() => undefined);
    stop();
    expect(remove.mock.calls).toEqual(add.mock.calls);
  });
});
