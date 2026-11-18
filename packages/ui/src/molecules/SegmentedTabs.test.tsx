import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { paintedColour } from '../test/colour';
import { renderWithTheme } from '../test/render';
import { authoredCss } from '../test/authoredCss';
import { SegmentedTabs } from './SegmentedTabs';

describe('SegmentedTabs', () => {
  afterEach(cleanup);

  it('uses `accessibleName` as the tab name in place of label and badge', () => {
    renderWithTheme(
      <SegmentedTabs
        label="Sections"
        id="t"
        value="a"
        onChange={() => {}}
        tabs={[
          {
            value: 'a',
            label: 'Ingredients',
            badge: '6',
            accessibleName: 'Ingredients, 6',
          },
          { value: 'b', label: 'Steps' },
        ]}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Ingredients, 6' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Steps' })).toBeTruthy();
  });

  it('paints a count badge accent and a "!" badge urgent', () => {
    renderWithTheme(
      <div data-theme="dark">
        <SegmentedTabs
          label="Sections"
          id="t"
          value="a"
          onChange={() => {}}
          tabs={[
            { value: 'a', label: 'Ingredients', badge: '6' },
            { value: 'b', label: 'Details', badge: '!', badgeTone: 'urgent' },
          ]}
        />
      </div>,
    );
    const paint = (name: string) => [
      paintedColour(screen.getByText(name), 'background-color'),
      paintedColour(screen.getByText(name), 'color'),
    ];
    expect(paint('6')).toEqual(['#1C3327', '#A8E6C0']);
    expect(paint('!')).toEqual(['#3A2118', '#FFAB8E']);
  });

  it('on the Canopy: a 44 high track of full-height tabs, the selected tab a 34 high tile', () => {
    renderWithTheme(
      <SegmentedTabs
        onCanopy
        label="Sections"
        id="t"
        value="a"
        onChange={() => {}}
        tabs={[
          { value: 'a', label: 'You' },
          { value: 'b', label: 'Family' },
        ]}
      />,
    );
    expect(authoredCss(screen.getByRole('tablist'))).toMatch(/height:\s*44px/);
    const you = screen.getByRole('tab', { name: 'You' });
    expect(authoredCss(you)).toMatch(/height:\s*100%/);
    expect(authoredCss(you.firstElementChild as HTMLElement)).toMatch(
      /height:\s*34px/,
    );
    expect(you.getAttribute('aria-selected')).toBe('true');
  });
});
