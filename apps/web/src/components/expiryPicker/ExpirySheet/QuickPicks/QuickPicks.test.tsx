import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { QuickPicks } from './QuickPicks';

const today = new Date(2026, 9, 14);

const names = () =>
  screen.getAllByRole('button').map((tile) => tile.getAttribute('aria-label'));
const amounts = () =>
  screen
    .getAllByRole('button')
    .map((tile) => tile.querySelector('b')?.textContent);

describe('QuickPicks', () => {
  it('names the tiles with full, pluralised words', () => {
    renderWithProviders(
      <QuickPicks
        value={null}
        usualDays={null}
        today={today}
        onPick={() => {}}
      />,
    );
    expect(names()).toEqual([
      '3 days, Saturday, October 17',
      '5 days, Monday, October 19',
      '1 week, Wednesday, October 21',
      '2 weeks, Wednesday, October 28',
      '1 month, Friday, November 13',
    ]);
  });

  it('writes the visible unit in the plural of the locale', () => {
    renderWithProviders(
      <QuickPicks
        value={null}
        usualDays={null}
        today={today}
        onPick={() => {}}
      />,
      { locale: 'da' },
    );
    expect(amounts()).toEqual(['3d', '5d', '1uge', '2uger', '1md']);
  });

  it('uses the same day abbreviation as the tags in Romanian, and the few form', () => {
    renderWithProviders(
      <QuickPicks value={null} usualDays={3} today={today} onPick={() => {}} />,
      { locale: 'ro' },
    );
    expect(amounts()[0]).toBe('3d');
    expect(names()[0]).toBe('De obicei, 3 zile, sâmbătă, 17 octombrie');
    expect(names()[4]).toBe('2 săptămâni, miercuri, 28 octombrie');
  });
});
