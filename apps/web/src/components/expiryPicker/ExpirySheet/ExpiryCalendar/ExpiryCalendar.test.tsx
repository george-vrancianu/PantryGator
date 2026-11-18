import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ExpiryCalendar } from './ExpiryCalendar';

const today = new Date(2026, 9, 15, 12);
const range = { min: '2026-10-17', max: '2026-10-20' };

const renderCalendar = (value: string | null = null) =>
  render(
    <ExpiryCalendar
      value={value}
      onChange={() => {}}
      today={today}
      usualDays={null}
      staleThresholdDays={3}
      range={range}
    />,
  );

const day = (name: RegExp) => screen.getByRole('button', { name });

describe('ExpiryCalendar with a range', () => {
  it('puts the Tab stop on the first selectable day when today is outside the range', () => {
    renderCalendar();
    expect(day(/Saturday, October 17/)).toHaveAttribute('tabindex', '0');
    expect(day(/Thursday, October 15/)).toHaveAttribute('tabindex', '-1');
  });

  it('keeps arrow keys on selectable days', async () => {
    renderCalendar('2026-10-17');
    const user = userEvent.setup();
    day(/Saturday, October 17/).focus();

    await user.keyboard('{ArrowLeft}');
    expect(day(/Saturday, October 17/)).toHaveFocus();

    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(day(/Tuesday, October 20/)).toHaveFocus();
  });

  it('lands Home, End and Page keys on the nearest selectable day', async () => {
    renderCalendar('2026-10-18');
    const user = userEvent.setup();
    day(/Sunday, October 18/).focus();

    await user.keyboard('{Home}');
    expect(day(/Saturday, October 17/)).toHaveFocus();
    await user.keyboard('{PageDown}');
    expect(document.activeElement).toBe(day(/Tuesday, October 20/));
  });
});
