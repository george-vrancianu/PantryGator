import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BangIcon,
  BatteryLowIcon,
  ClockIcon,
  CookIcon,
  HourglassIcon,
  LampExpiredIcon,
  LampFreshIcon,
  LampLowIcon,
  LampNothingNewIcon,
  LampSoonIcon,
  PulseIcon,
  CopyIcon,
  CalendarDaysIcon,
  CupboardIcon,
  FreezerIcon,
  FridgeIcon,
  ScanBarcodeIcon,
  SpicesIcon,
  EarIcon,
  EqualIcon,
  CompassIcon,
  GlobeIcon,
  ImagePlusIcon,
  LockIcon,
  LogoutIcon,
  MicIcon,
  MicOffIcon,
  QuoteIcon,
  WifiOffIcon,
  MinusIcon,
  PhoneIcon,
  PlusIcon,
  UserIcon,
} from '../index';

describe('icons', () => {
  afterEach(cleanup);

  it('are decorative by default, hidden from assistive technology', () => {
    const { container } = render(<PlusIcon />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('draw the handoff glyph in currentColor on its 24 px grid with a 2 px round stroke', () => {
    const { container } = render(<PlusIcon />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('fill')).toBe('none');
    expect(svg.getAttribute('stroke-width')).toBe('2');
    expect(svg.getAttribute('stroke-linecap')).toBe('round');
    expect(svg.getAttribute('stroke-linejoin')).toBe('round');
    expect(svg.querySelector('path')!.getAttribute('d')).toBe(
      'M12 5v14M5 12h14',
    );
  });

  it('expose a given title as their accessible name', () => {
    render(<PlusIcon title="Add" />);
    const svg = screen.getByRole('img', { name: 'Add' });
    expect(svg.getAttribute('aria-hidden')).toBeNull();
  });

  it('give icons still drawn by lucide the same accessibility and stroke', () => {
    const { container } = render(<ClockIcon />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('stroke-width')).toBe('2');
    cleanup();

    render(<ClockIcon title="Expires soon" />);
    expect(screen.getByRole('img', { name: 'Expires soon' })).toBeTruthy();
  });

  it('let the call site set size and stroke', () => {
    const { container } = render(<PlusIcon size={16} strokeWidth={2.4} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('16');
    expect(svg.getAttribute('stroke-width')).toBe('2.4');
  });

  it('draw the battery-low with a heavier charge bar', () => {
    const { container } = render(<BatteryLowIcon />);
    const paths = container.querySelectorAll('path');
    expect(container.querySelector('rect')).not.toBeNull();
    expect(paths[1]!.getAttribute('d')).toBe('M6.5 10.5v3');
    expect(paths[1]!.getAttribute('stroke-width')).toBe('3.2');
  });

  it('register the Pantry health glyphs from the handoff', () => {
    const glyphs = [
      [PulseIcon, 'M3 12h4l2-5 4 10 2-5h6'],
      [CookIcon, 'M4 11h16v3a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z'],
      [HourglassIcon, 'M7 3h10M7 21h10'],
    ] as const;
    for (const [Glyph, fragment] of glyphs) {
      const { container, unmount } = render(<Glyph />);
      expect(container.querySelector('path')!.getAttribute('d')).toContain(
        fragment,
      );
      unmount();
    }
  });

  it('register the Settings glyphs from the handoff set', () => {
    const glyphs = [
      [CopyIcon, 'M16 8V4H4v12h4'],
      [LogoutIcon, 'M14 4h5v16h-5'],
      [UserIcon, 'M4.5 21a7.5 7.5 0 0 1 15 0'],
      [PhoneIcon, 'M11 18.5h2'],
      [MinusIcon, 'M5 12h14'],
    ] as const;
    for (const [Glyph, fragment] of glyphs) {
      const { container, unmount } = render(<Glyph />);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
      expect(svg.getAttribute('stroke')).toBe('currentColor');
      expect(svg.getAttribute('stroke-width')).toBe('2');
      expect(svg.getAttribute('stroke-linecap')).toBe('round');
      const drawn = [...svg.querySelectorAll('path, rect, circle')]
        .map((node) => node.getAttribute('d') ?? '')
        .join(' ');
      expect(drawn).toContain(fragment);
      unmount();
    }
  });

  it('draw the Meal plan short marker', () => {
    const { container } = render(<BangIcon />);
    expect(container.querySelector('path')!.getAttribute('d')).toBe(
      'M12 6v8M12 18v.01',
    );
  });

  it('render the Voice Notes glyphs as decorative lucide icons', () => {
    const glyphs = [
      MicIcon,
      MicOffIcon,
      WifiOffIcon,
      EarIcon,
      QuoteIcon,
      EqualIcon,
      LockIcon,
      CompassIcon,
      GlobeIcon,
      ImagePlusIcon,
    ];
    for (const Glyph of glyphs) {
      const { container, unmount } = render(<Glyph />);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('stroke')).toBe('currentColor');
      expect(
        svg.querySelectorAll('path, rect, circle, line').length,
      ).toBeGreaterThan(0);
      unmount();
    }
  });

  it.each([
    ['Fridge', FridgeIcon],
    ['ScanBarcode', ScanBarcodeIcon],
    ['Freezer', FreezerIcon],
    ['Cupboard', CupboardIcon],
    ['CalendarDays', CalendarDaysIcon],
    ['Spices', SpicesIcon],
  ])('draw the %s Location as a decorative 2 px stroke glyph', (_, Glyph) => {
    const { container } = render(<Glyph />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('stroke-width')).toBe('2');
  });

  it.each([
    ['Expired', LampExpiredIcon],
    ['Use soon', LampSoonIcon],
    ['Running low', LampLowIcon],
    ['Fresh in', LampFreshIcon],
    ['Nothing new', LampNothingNewIcon],
  ])(
    'draw the %s light as a decorative glyph that takes a lighter stroke',
    (_, Glyph) => {
      const { container } = render(<Glyph size={22} strokeWidth={1.7} />);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('width')).toBe('22');
      expect(svg.getAttribute('stroke-width')).toBe('1.7');
      expect(svg.querySelectorAll('path, rect').length).toBeGreaterThan(0);
    },
  );
});
