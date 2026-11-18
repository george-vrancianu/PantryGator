import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Unit } from '@/lib/catalog';
import type { AmountScale } from '@/lib/usualAmounts';
import { renderWithProviders } from '@/test/render';
import { AmountField } from './AmountField';

// Value segments are 60 pt wide with a 1 pt divider and the strip is 250 pt: four fit
// (60+1+60+1+60+1+60 = 243; a fifth is 304).
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(250);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(60);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'vibrate');
});

const setupUser = () =>
  userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

type HarnessProps = {
  start?: string;
  unit?: Unit | '';
  scale?: AmountScale | null;
  allowNoUnit?: boolean;
  rescaleOnUnitChange?: boolean;
  error?: string | null;
  onQuantity?: (quantity: string, typedUnit?: Unit | '') => void;
  onUnit?: (unit: Unit | '') => void;
  onSubmit?: () => void;
};

/** A controlled field, so taps and unit changes show up in what the field displays. */
function Harness({
  start = '',
  unit: startUnit = 'g',
  scale = 'medium',
  allowNoUnit,
  rescaleOnUnitChange,
  error = null,
  onQuantity = () => {},
  onUnit = () => {},
  onSubmit = () => {},
}: HarnessProps) {
  const [quantity, setQuantity] = useState(start);
  const [unit, setUnit] = useState<Unit | ''>(startUnit);
  return (
    <AmountField
      name="Paprika"
      quantity={quantity}
      unit={unit}
      amountScale={scale}
      allowNoUnit={allowNoUnit}
      rescaleOnUnitChange={rescaleOnUnitChange}
      onQuantityChange={(next, typedUnit) => {
        onQuantity(next, typedUnit);
        setQuantity(next);
        if (typedUnit) setUnit(typedUnit);
      }}
      onUnitChange={(next) => {
        onUnit(next);
        setUnit(next);
      }}
      error={error}
      onSubmit={onSubmit}
    />
  );
}

const field = () => screen.getByRole('textbox');
const toggles = () => screen.getByRole('group', { name: 'Choose a unit' });
const toggle = (name: string) =>
  within(toggles()).getByRole('button', { name });
const usualGroup = () =>
  screen.getByRole('group', { name: 'Usual amounts for Paprika' });
const valueNames = () =>
  within(usualGroup())
    .getAllByRole('button')
    .map((value) => value.getAttribute('aria-label'));
const value = (name: string) =>
  within(usualGroup()).getByRole('button', { name });
const dropdown = (unit: string) =>
  screen.getByRole('button', { name: `Unit: ${unit}` });
const menu = () => screen.getByRole('menu', { name: 'Units' });
const menuEntries = () =>
  within(menu())
    .getAllByRole('menuitemradio')
    .map((entry) => entry.textContent);
const entry = (name: string) =>
  within(menu()).getByRole('menuitemradio', { name });

describe('AmountField with no unit', () => {
  it('shows one toggle per unit, none pressed, and no dropdown or values', () => {
    renderWithProviders(<Harness unit="" />);

    const units = within(toggles()).getAllByRole('button');
    expect(units.map((unit) => unit.textContent)).toEqual([
      'g',
      'kg',
      'ml',
      'L',
      'pcs',
    ]);
    for (const unit of units) {
      expect(unit).toHaveAttribute('aria-pressed', 'false');
    }
    expect(
      screen.queryByRole('button', { name: /^Unit:/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'Usual amounts for Paprika' }),
    ).not.toBeInTheDocument();
  });

  it('sets the unit on a toggle tap, swaps to values and the dropdown, and keeps focus on the input', async () => {
    const onUnit = vi.fn();
    renderWithProviders(<Harness unit="" scale={null} onUnit={onUnit} />);
    const user = setupUser();

    await user.click(field());
    await user.click(toggle('kg'));

    expect(onUnit).toHaveBeenLastCalledWith('kg');
    expect(dropdown('kg')).toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'Choose a unit' }),
    ).not.toBeInTheDocument();
    expect(valueNames()).toEqual(['1 kg', '2 kg', '3 kg', '4 kg']);
    expect(field()).toHaveFocus();
  });

  it('leaves focus alone when a toggle is tapped and the input never had it', async () => {
    renderWithProviders(<Harness unit="" scale={null} />);
    const user = setupUser();

    await user.click(toggle('g'));

    // The tap never takes focus from the input; here the input had none, so the code hands it over
    // after the unit is chosen (choose() focuses the input), which opens the keyboard on a phone.
    expect(dropdown('g')).toBeInTheDocument();
    expect(field()).toHaveFocus();
  });

  it('keeps the typed number when a toggle sets the unit', async () => {
    renderWithProviders(<Harness unit="" start="3" />);
    const user = setupUser();

    await user.click(toggle('pcs'));

    expect(field()).toHaveValue('3');
    expect(dropdown('pcs')).toBeInTheDocument();
  });
});

describe('AmountField unit dropdown', () => {
  it('lists every unit and "No unit", with the current unit checked', async () => {
    renderWithProviders(<Harness unit="g" start="250" />);
    const user = setupUser();

    await user.click(dropdown('g'));

    expect(dropdown('g')).toHaveAttribute('aria-expanded', 'true');
    expect(menuEntries()).toEqual(['g', 'kg', 'ml', 'L', 'pcs', 'No unit']);
    expect(entry('g')).toHaveAttribute('aria-checked', 'true');
    expect(entry('kg')).toHaveAttribute('aria-checked', 'false');
  });

  it('offers no "No unit" where the host needs a unit', async () => {
    renderWithProviders(<Harness unit="g" start="250" allowNoUnit={false} />);
    const user = setupUser();

    await user.click(dropdown('g'));

    expect(menuEntries()).toEqual(['g', 'kg', 'ml', 'L', 'pcs']);
  });

  it('brings the toggles back with "No unit", keeping the number and focus on the input', async () => {
    const onUnit = vi.fn();
    renderWithProviders(<Harness unit="g" start="250" onUnit={onUnit} />);
    const user = setupUser();

    await user.click(field());
    await user.click(dropdown('g'));
    await user.click(entry('No unit'));

    expect(onUnit).toHaveBeenLastCalledWith('');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(toggle('g')).toHaveAttribute('aria-pressed', 'false');
    expect(field()).toHaveValue('250');
    expect(field()).toHaveFocus();
  });

  it('rescales the number within a family, without an Amount Scale too', async () => {
    const onQuantity = vi.fn();
    const onUnit = vi.fn();
    renderWithProviders(
      <Harness
        unit="kg"
        start="1.5"
        scale={null}
        onQuantity={onQuantity}
        onUnit={onUnit}
      />,
    );
    const user = setupUser();

    await user.click(field());
    await user.click(dropdown('kg'));
    await user.click(entry('g'));

    expect(onQuantity).toHaveBeenLastCalledWith('1500', undefined);
    expect(onUnit).toHaveBeenLastCalledWith('g');
    expect(field()).toHaveValue('1500');
    expect(dropdown('g')).toBeInTheDocument();
    expect(field()).toHaveFocus();
  });

  it('keeps the number within a family when rescaleOnUnitChange is off', async () => {
    const onQuantity = vi.fn();
    const onUnit = vi.fn();
    renderWithProviders(
      <Harness
        unit="kg"
        start="500"
        rescaleOnUnitChange={false}
        onQuantity={onQuantity}
        onUnit={onUnit}
      />,
    );
    const user = setupUser();

    await user.click(dropdown('kg'));
    await user.click(entry('g'));

    expect(onQuantity).not.toHaveBeenCalled();
    expect(onUnit).toHaveBeenLastCalledWith('g');
    expect(field()).toHaveValue('500');
  });

  it('writes a tiny converted amount as plain decimals, never with an exponent', async () => {
    const onQuantity = vi.fn();
    renderWithProviders(
      <Harness unit="g" start="0.0001" scale={null} onQuantity={onQuantity} />,
    );
    const user = setupUser();

    await user.click(dropdown('g'));
    await user.click(entry('kg'));

    expect(onQuantity).toHaveBeenLastCalledWith('0.0000001', undefined);
  });

  it('keeps the number when the unit changes to another family', async () => {
    const onQuantity = vi.fn();
    renderWithProviders(
      <Harness unit="g" start="500" onQuantity={onQuantity} />,
    );
    const user = setupUser();

    await user.click(dropdown('g'));
    await user.click(entry('pcs'));

    expect(onQuantity).not.toHaveBeenCalled();
    expect(field()).toHaveValue('500');
    expect(dropdown('pcs')).toBeInTheDocument();
  });

  it('closes the menu on a second tap of the dropdown', async () => {
    renderWithProviders(<Harness unit="g" />);
    const user = setupUser();

    await user.click(dropdown('g'));
    await user.click(dropdown('g'));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(dropdown('g')).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes a tapped-open menu on Escape and hands focus to the input', async () => {
    renderWithProviders(<Harness unit="g" />);
    const user = setupUser();

    await user.click(dropdown('g'));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(field()).toHaveFocus();
  });

  it('opens with ArrowDown from the dropdown', async () => {
    renderWithProviders(<Harness unit="ml" />);
    const user = setupUser();

    dropdown('ml').focus();
    await user.keyboard('{ArrowDown}');

    expect(entry('ml')).toHaveFocus();
  });

  it('opens on Enter with focus on the checked unit, moves with the arrow keys, and closes on Escape', async () => {
    // A sheet around the field listens for Escape further up.
    const outer = vi.fn();
    const listen = (event: KeyboardEvent) => outer(event.key);
    document.addEventListener('keydown', listen);
    renderWithProviders(<Harness unit="kg" start="2" />);
    const user = setupUser();

    dropdown('kg').focus();
    await user.keyboard('{Enter}');
    expect(entry('kg')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(entry('ml')).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(entry('g')).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(dropdown('kg')).toHaveFocus();
    // The menu takes Escape first, so a sheet around the field stays open.
    expect(outer).not.toHaveBeenCalledWith('Escape');
    document.removeEventListener('keydown', listen);
  });

  it('picks a unit with Enter from the menu and returns focus to the input', async () => {
    renderWithProviders(<Harness unit="kg" start="2" />);
    const user = setupUser();

    dropdown('kg').focus();
    await user.keyboard('{Enter}{ArrowUp}{Enter}');

    expect(field()).toHaveValue('2000');
    expect(dropdown('g')).toBeInTheDocument();
    expect(field()).toHaveFocus();
  });
});

describe('AmountField Usual Amount values', () => {
  it('shows values with an empty quantity, ascending, numbers only, announced with the unit', () => {
    renderWithProviders(<Harness unit="g" start="" />);

    expect(valueNames()).toEqual(['100 g', '250 g', '500 g', '1,000 g']);
    expect(
      within(usualGroup())
        .getAllByRole('button')
        .map((segment) => segment.textContent),
    ).toEqual(['100', '250', '500', '1,000']);
    for (const name of valueNames()) {
      expect(value(name ?? '')).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('formats the numbers for the language', () => {
    renderWithProviders(<Harness unit="kg" start="" scale="large" />, {
      locale: 'ro',
    });

    const group = screen.getByRole('group', {
      name: 'Cantități obișnuite pentru Paprika',
    });
    expect(
      within(group)
        .getAllByRole('button')
        .map((segment) => segment.textContent),
    ).toEqual(['0,5', '1', '2', '5']);
    expect(within(group).getByRole('button', { name: '0,5 kg' })).toBeVisible();
  });

  it('keeps the matching value pressed in a narrow strip', () => {
    renderWithProviders(<Harness unit="g" start="750" />);
    // 750 is priority index 6, so it is kept first; then 250, 500 and 100 fill the rest.
    expect(valueNames()).toEqual(['100 g', '250 g', '500 g', '750 g']);
    expect(value('750 g')).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the matching unit-only value pressed in a narrow strip', () => {
    renderWithProviders(<Harness unit="pcs" start="12" scale={null} />);
    expect(valueNames()).toEqual(['1 pcs', '2 pcs', '3 pcs', '12 pcs']);
    expect(value('12 pcs')).toHaveAttribute('aria-pressed', 'true');
  });

  it('takes the values that do not fit out of the accessibility tree', () => {
    renderWithProviders(<Harness unit="g" start="250" />);

    expect(within(usualGroup()).getByLabelText('200 g')).not.toBeVisible();
    expect(
      within(usualGroup()).queryByRole('button', { name: '200 g' }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ['g', ['100 g', '250 g', '500 g', '1,000 g']],
    ['ml', ['100 ml', '250 ml', '500 ml', '1,000 ml']],
    ['kg', ['1 kg', '2 kg', '3 kg', '4 kg']],
    ['l', ['1 L', '2 L', '3 L', '4 L']],
    ['pcs', ['1 pcs', '2 pcs', '3 pcs', '4 pcs']],
  ] as const)(
    'offers %s values from the unit alone when no Amount Scale is given',
    (unit, expected) => {
      renderWithProviders(<Harness unit={unit} scale={null} />);
      expect(valueNames()).toEqual(expected);
    },
  );

  it('sets the amount on a tap, presses that value, and returns focus to the input so Enter submits', async () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrate,
      configurable: true,
    });
    const onQuantity = vi.fn();
    const onSubmit = vi.fn();
    renderWithProviders(
      <Harness unit="g" start="" onQuantity={onQuantity} onSubmit={onSubmit} />,
    );
    const user = setupUser();

    await user.click(field());
    await user.click(value('500 g'));

    expect(onQuantity).toHaveBeenLastCalledWith('500', undefined);
    expect(field()).toHaveValue('500');
    expect(value('500 g')).toHaveAttribute('aria-pressed', 'true');
    expect(value('250 g')).toHaveAttribute('aria-pressed', 'false');
    expect(field()).toHaveFocus();
    expect(vibrate).toHaveBeenCalledWith(6);

    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('presses no value for a typed number that is not a usual amount', async () => {
    renderWithProviders(<Harness unit="g" start="250" />);
    const user = setupUser();

    await user.clear(field());
    await user.type(field(), '260');

    for (const name of ['100 g', '250 g', '500 g', '1,000 g']) {
      expect(value(name)).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('fits the values again when only the language changes', async () => {
    const { i18n } = renderWithProviders(<Harness unit="g" start="250" />);
    const reads = vi.fn(() => 60);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(
      reads,
    );

    await act(() => i18n.changeLanguage('ro'));

    expect(reads).toHaveBeenCalled();
  });
});

describe('AmountField input', () => {
  it('splits a typed "500 g" into the number and the unit', async () => {
    const onQuantity = vi.fn();
    renderWithProviders(<Harness unit="" start="" onQuantity={onQuantity} />);
    const user = setupUser();

    await user.type(field(), '500 g');

    expect(onQuantity).toHaveBeenLastCalledWith('500', 'g');
    expect(field()).toHaveValue('500');
    expect(dropdown('g')).toBeInTheDocument();
  });

  it('splits a typed pieces alias', async () => {
    renderWithProviders(<Harness unit="" start="" />);
    const user = setupUser();

    await user.type(field(), '6 buc');

    expect(field()).toHaveValue('6');
    expect(dropdown('pcs')).toBeInTheDocument();
  });

  it('steps the amount with the arrow keys, five steps with Shift', async () => {
    const onQuantity = vi.fn();
    renderWithProviders(
      <Harness unit="g" start="250" scale={null} onQuantity={onQuantity} />,
    );
    const user = setupUser();

    await user.click(field());
    await user.keyboard('{ArrowUp}');
    expect(onQuantity).toHaveBeenLastCalledWith('260', undefined);
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
    expect(onQuantity).toHaveBeenLastCalledWith('210', undefined);
  });

  it('steps a field with no Amount Scale and no unit by one', async () => {
    const onQuantity = vi.fn();
    renderWithProviders(
      <Harness unit="" start="" scale={null} onQuantity={onQuantity} />,
    );
    const user = setupUser();

    await user.click(field());
    await user.keyboard('{ArrowUp}');
    expect(onQuantity).toHaveBeenLastCalledWith('1', undefined);
  });

  it('keeps a zero amount at zero when stepping down', async () => {
    const onQuantity = vi.fn();
    renderWithProviders(<Harness unit="g" start="0" onQuantity={onQuantity} />);
    const user = setupUser();

    await user.click(field());
    await user.keyboard('{ArrowDown}');
    expect(onQuantity).toHaveBeenLastCalledWith('0', undefined);
  });

  it('shows the error beneath both rows and ties it to the input', () => {
    renderWithProviders(
      <Harness unit="g" start="abc" error="Enter a number" />,
    );

    const message = screen.getByText('Enter a number');
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(field()).toHaveAccessibleDescription('Enter a number');
    expect(
      usualGroup().compareDocumentPosition(message) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows no error line while the amount is fine', () => {
    renderWithProviders(<Harness unit="g" start="250" />);

    expect(field()).not.toHaveAttribute('aria-invalid');
    expect(field()).not.toHaveAccessibleDescription();
  });

  it('keeps the "+" beside the field, submitting on a tap', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <AmountField
        name="Paprika"
        quantity="2"
        unit=""
        onQuantityChange={() => {}}
        onUnitChange={() => {}}
        error={null}
        onSubmit={onSubmit}
        submit={{ label: 'Add Paprika', disabled: false }}
      />,
    );
    const user = setupUser();

    await user.click(screen.getByRole('button', { name: 'Add Paprika' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('AmountField keyboard access and motion', () => {
  it('reaches the toggles with Tab, moves with the arrow keys and picks with Space', async () => {
    const onUnit = vi.fn();
    renderWithProviders(<Harness unit="" onUnit={onUnit} />);
    const user = setupUser();

    field().focus();
    await user.tab();
    expect(toggle('g')).toHaveFocus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(toggle('ml')).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(toggle('kg')).toHaveFocus();
    await user.keyboard(' ');

    expect(onUnit).toHaveBeenLastCalledWith('kg');
    expect(field()).toHaveFocus();
  });

  it('reaches the values with Tab after the dropdown, moves with the arrow keys and picks with Enter', async () => {
    renderWithProviders(<Harness unit="g" start="5" />);
    const user = setupUser();

    field().focus();
    await user.tab();
    expect(dropdown('g')).toHaveFocus();
    await user.tab();
    expect(value('100 g')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(value('250 g')).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(field()).toHaveValue('250');
    expect(value('250 g')).toHaveAttribute('aria-pressed', 'true');
    expect(field()).toHaveFocus();
  });

  it.each([
    ['a value', () => value('250 g'), 'g'],
    ['a unit toggle', () => toggle('g'), ''],
  ] as const)(
    'removes the transitions on %s when the Member prefers reduced motion',
    (_, segment, unit) => {
      renderWithProviders(<Harness unit={unit} start="250" />);
      const css = Array.from(document.querySelectorAll('style'))
        .map((style) => style.textContent ?? '')
        .join('\n');
      const classes = Array.from(segment().classList);

      expect(
        classes.some((c) =>
          new RegExp(`\\.${c}\\{[^}]*transition:background-color`).test(css),
        ),
      ).toBe(true);
      expect(
        classes.some((c) =>
          new RegExp(
            `@media \\(prefers-reduced-motion: reduce\\)\\{\\.${c}\\{[^}]*transition:none`,
          ).test(css),
        ),
      ).toBe(true);
    },
  );
});
