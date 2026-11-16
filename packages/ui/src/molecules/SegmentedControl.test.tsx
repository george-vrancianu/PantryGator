import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from '../index';
import { paintedColour } from '../test/colour';
import { renderWithTheme as render } from '../test/render';

/** The value a property has in the element's own Emotion rule, as written. */
function ownRule(element: HTMLElement, property: string) {
  const css = [...document.querySelectorAll('style')]
    .map((style) => style.textContent ?? '')
    .join('');
  for (const name of element.classList) {
    const rule = new RegExp(`\\.${name}\\{([^}]*)\\}`).exec(css);
    const value = rule
      ? new RegExp(`(?:^|;)${property}:([^;]*)`).exec(rule[1])
      : null;
    if (value) return value[1];
  }
  return null;
}

const options = [
  { value: 'ingredients', label: 'Ingredients' },
  { value: 'templates', label: 'Templates' },
] as const;

describe('SegmentedControl', () => {
  afterEach(cleanup);

  it('presses exactly the chosen option and reports a new choice', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Add from"
        options={[...options]}
        value="ingredients"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('group', { name: 'Add from' })).toBeTruthy();
    const pressed = (name: string) =>
      screen.getByRole('button', { name }).getAttribute('aria-pressed');
    expect(pressed('Ingredients')).toBe('true');
    expect(pressed('Templates')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));
    expect(onChange).toHaveBeenCalledWith('templates');
  });

  it('sits on the Theme chip track with the selected segment in seg-on', () => {
    render(
      <div data-theme="light">
        <SegmentedControl
          label="Add from"
          options={[...options]}
          value="ingredients"
          onChange={() => undefined}
        />
      </div>,
    );
    const track = screen.getByRole('group', { name: 'Add from' });
    expect(paintedColour(track, 'background-color')).toBe('#E8E7DF');
    expect(getComputedStyle(track).borderRadius).toBe('var(--pp-r-ctl)');
    const selected = screen.getByRole('button', { name: 'Ingredients' });
    expect(paintedColour(selected, 'background-color')).toBe('#FFFFFF');
    expect(paintedColour(selected, 'color')).toBe('#141A16');
    const other = screen.getByRole('button', { name: 'Templates' });
    expect(paintedColour(other, 'color')).toBe('#586159');
  });

  it('keeps its usual padding and minimum width without dense', () => {
    render(
      <SegmentedControl
        label="Add from"
        options={[...options]}
        value="ingredients"
        onChange={() => undefined}
      />,
    );
    const style = getComputedStyle(
      screen.getByRole('button', { name: 'Templates' }),
    );
    expect(style.paddingLeft).toBe('16px');
    expect(style.minWidth).toBe('56px');
    expect(style.fontSize).toBe('14px');
  });

  it('packs the segments tighter when dense, sharing the width by label length', () => {
    render(
      <SegmentedControl
        label="Location"
        options={[...options]}
        value="ingredients"
        onChange={() => undefined}
        fullWidth
        dense
      />,
    );
    const style = getComputedStyle(
      screen.getByRole('button', { name: 'Templates' }),
    );
    expect(style.paddingLeft).toBe('2px');
    expect(style.paddingRight).toBe('2px');
    expect(style.minWidth).toBe('0px');
    expect(style.flexBasis).toBe('auto');
    expect(style.flexGrow).toBe('1');
    expect(style.whiteSpace).not.toBe('nowrap');
    expect(style.textOverflow).not.toBe('ellipsis');
  });

  it('shrinks a dense label with the track width, from 13 px down to no less than 11 px, leaving room for the bold pressed option', () => {
    render(
      <SegmentedControl
        label="Location"
        options={[...options]}
        value="ingredients"
        onChange={() => undefined}
        dense
      />,
    );
    const track = screen.getByRole('group', { name: 'Location' });
    // Dense always stretches to the width it sizes its labels against.
    expect(getComputedStyle(track).display).toBe('flex');
    expect(getComputedStyle(track).containerType).toBe('inline-size');
    // 'Ingredients' + 'Templates' is 20 characters at 0.6 em, plus 10 % of the longest (11) for bold;
    // 2 segments of 2 px padding a side and one 2 px gap.
    // jsdom cannot compute clamp() or cqi, so read the rule as written.
    expect(
      ownRule(screen.getByRole('button', { name: 'Templates' }), 'font-size'),
    ).toBe('clamp(11px, calc((100cqi - 10px) / 12.66), 13px)');
  });

  it('leaves room for each badge when sizing a dense label, and only then', () => {
    render(
      <SegmentedControl
        label="Kind"
        options={[
          { value: 'ingredients', label: 'Ingredients', badge: 7 },
          { value: 'templates', label: 'Templates', badge: 0 },
        ]}
        value="ingredients"
        onChange={() => undefined}
        dense
      />,
    );
    // One badge shown: 25 px more come off the track than the 10 px of gaps and padding.
    expect(
      ownRule(screen.getByRole('button', { name: /Templates/ }), 'font-size'),
    ).toBe('clamp(11px, calc((100cqi - 35px) / 12.66), 13px)');
  });

  it('can be named by a visible caption elsewhere on the page', () => {
    render(
      <>
        <div id="caption">Location</div>
        <SegmentedControl
          labelledBy="caption"
          options={[...options]}
          value="ingredients"
          onChange={() => undefined}
        />
      </>,
    );
    const track = screen.getByRole('group', { name: 'Location' });
    expect(track.getAttribute('aria-labelledby')).toBe('caption');
    expect(track.hasAttribute('aria-label')).toBe(false);
  });

  it('draws an option icon above its full label', () => {
    render(
      <SegmentedControl
        label="Location"
        options={[
          {
            value: 'freezer',
            label: 'Congelator',
            icon: <svg data-testid="snowflake" />,
          },
          { value: 'fridge', label: 'Frigider' },
        ]}
        value="freezer"
        onChange={() => undefined}
      />,
    );
    const freezer = screen.getByRole('button', { name: 'Congelator' });
    expect(freezer.textContent).toBe('Congelator');
    expect(freezer.getAttribute('aria-pressed')).toBe('true');
    expect(within(freezer).getByTestId('snowflake')).toBeTruthy();
  });

  it('adds the badge count to the accessible name, with the label unchanged, and hides it at 0', () => {
    render(
      <SegmentedControl
        label="Sections"
        value="a"
        onChange={() => {}}
        options={[
          {
            value: 'a',
            label: 'To review',
            badge: 11,
            badgeLabel: '11 waiting',
          },
          { value: 'b', label: 'Catalog', badge: 3 },
          { value: 'c', label: 'Codes', badge: 0 },
        ]}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'To review, 11 waiting' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Catalog, 3' })).toBeTruthy();
    const codes = screen.getByRole('button', { name: 'Codes' });
    expect(codes.textContent).toBe('Codes');
  });
});
