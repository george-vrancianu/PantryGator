import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubScreen } from '../test/screen';
import {
  cameraOrientation,
  readCameraOrientation,
  watchCameraOrientation,
} from './cameraOrientation';

const sizes = {
  phonePortrait: { width: 390, height: 844 },
  phoneLandscape: { width: 844, height: 390 },
  tabletPortrait: { width: 820, height: 1180 },
  tabletLandscape: { width: 1180, height: 820 },
  desktop: { width: 1440, height: 900 },
  edgePhone: { width: 599, height: 1200 },
  edgeTablet: { width: 600, height: 1000 },
};

describe('cameraOrientation device class and layout', () => {
  it.each([
    ['phone portrait', sizes.phonePortrait, 'phone', 'footer'],
    ['phone landscape (844 x 390)', sizes.phoneLandscape, 'phone', 'footer'],
    ['tablet portrait', sizes.tabletPortrait, 'tablet', 'footer'],
    ['tablet landscape', sizes.tabletLandscape, 'tablet', 'rail'],
    ['desktop window', sizes.desktop, 'tablet', 'rail'],
    ['shortest side 599', sizes.edgePhone, 'phone', 'footer'],
    ['shortest side 600', sizes.edgeTablet, 'tablet', 'footer'],
  ] as const)('%s', (_name, size, deviceClass, layout) => {
    const result = cameraOrientation({ ...size, angle: 0, native: false });
    expect(result.deviceClass).toBe(deviceClass);
    expect(result.layout).toBe(layout);
  });

  it('a phone stays a phone when the screen turns', () => {
    for (const size of [sizes.phonePortrait, sizes.phoneLandscape]) {
      for (const angle of [0, 90, 180, 270]) {
        expect(
          cameraOrientation({ ...size, angle, native: false }).deviceClass,
        ).toBe('phone');
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
        const result = cameraOrientation({ ...size, angle, native: false });
        expect(result.rotateBack).toBe(expected);
        expect(result.photoTurn).toBe(expected);
      }
    },
  );

  it.each([0, 90, 180, 270])(
    'in the app both angles are 0 (reported %i)',
    (angle) => {
      for (const size of Object.values(sizes)) {
        const result = cameraOrientation({ ...size, angle, native: true });
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
        const result = cameraOrientation({ ...size, angle, native: false });
        expect(result.rotateBack).toBe(0);
        expect(result.photoTurn).toBe(0);
      }
    },
  );

  it('treats a missing or odd reported angle as 0', () => {
    expect(
      cameraOrientation({ ...sizes.phonePortrait, angle: 45, native: false })
        .rotateBack,
    ).toBe(0);
  });
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

  it('a tablet turned to landscape gets the rail', () => {
    const screen = stubScreen({ width: 820, height: 1180 });
    expect(readCameraOrientation().layout).toBe('footer');
    screen.rotate(90);
    expect(readCameraOrientation().layout).toBe('rail');
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
});
