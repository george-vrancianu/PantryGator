import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FieldUnit, InputAdornment, TextField } from '../index';
import { paintedColour } from '../test/colour';
import { renderWithTheme as render } from '../test/render';

describe('TextField', () => {
  afterEach(cleanup);

  /** The painted field around the native input. */
  const field = (name: string) =>
    screen.getByRole('textbox', { name }).parentElement!;

  it('is a 50 high field in the Theme field colour and control radius', () => {
    render(
      <div data-theme="dark">
        <TextField label="Name" />
      </div>,
    );
    const frame = field('Name');
    expect(paintedColour(frame, 'background-color')).toBe('#0D120F');
    expect(getComputedStyle(frame).borderRadius).toBe('var(--pp-r-ctl)');
    expect(getComputedStyle(frame).minHeight).toBe('50px');
  });

  it('is 44 high in the editor density and 50 high otherwise', () => {
    render(
      <>
        <TextField label="Link" density="editor" />
        <TextField label="Plain" />
      </>,
    );
    expect(getComputedStyle(field('Link')).minHeight).toBe('44px');
    expect(getComputedStyle(field('Plain')).minHeight).toBe('50px');
  });

  it('keeps a host sx next to the editor density', () => {
    render(<TextField label="Link" density="editor" sx={{ mt: '7px' }} />);
    const root = field('Link').parentElement!;
    expect(getComputedStyle(root).marginTop).toBe('7px');
    expect(getComputedStyle(field('Link')).minHeight).toBe('44px');
  });

  it('rings the focused field in the accent tint', () => {
    render(<TextField label="Name" />);
    expect(getComputedStyle(field('Name')).boxShadow).toBe('');
    fireEvent.focus(screen.getByRole('textbox', { name: 'Name' }));
    expect(getComputedStyle(field('Name')).boxShadow.toLowerCase()).toBe(
      '0 0 0 3px var(--mui-palette-pp-accenttint)',
    );
  });

  it('floats a native select label above an empty "None" option', () => {
    render(
      <TextField
        select
        label="Colour"
        value=""
        slotProps={{ select: { native: true } }}
      >
        <option value="">None</option>
        <option value="red">Red</option>
      </TextField>,
    );
    expect(
      screen
        .getByText('Colour', { selector: 'label' })
        .getAttribute('data-shrink'),
    ).toBe('true');
  });

  it('keeps a caller inputLabel prop on a native select', () => {
    render(
      <TextField
        select
        label="Colour"
        value=""
        slotProps={{
          select: { native: true },
          inputLabel: { className: 'mine' },
        }}
      >
        <option value="">None</option>
      </TextField>,
    );
    const label = screen.getByText('Colour', { selector: 'label' });
    expect(label.getAttribute('data-shrink')).toBe('true');
    expect(label.classList).toContain('mine');
  });

  it('leaves an empty text field label inside the field', () => {
    render(<TextField label="Name" value="" />);
    expect(
      screen
        .getByText('Name', { selector: 'label' })
        .getAttribute('data-shrink'),
    ).toBe('false');
  });
});

describe('FieldUnit', () => {
  afterEach(cleanup);

  it('is a chip button inside the field', () => {
    render(
      <div data-theme="light">
        <TextField
          label="Amount"
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <FieldUnit aria-label="Unit: kg">kg</FieldUnit>
                </InputAdornment>
              ),
            },
          }}
        />
      </div>,
    );
    const unit = screen.getByRole('button', { name: 'Unit: kg' });
    expect(paintedColour(unit, 'background-color')).toBe('#E8E7DF');
    expect(getComputedStyle(unit).borderRadius).toBe(
      'max(2px, calc(var(--pp-r-ctl) - 5px))',
    );
  });
});
