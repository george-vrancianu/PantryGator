import {
  Box,
  ChevronDownIcon,
  PlusIcon,
  Popper,
  Typography,
  tokens,
  border,
  color,
  insetFocusRing,
  radius,
  shadow,
} from '@pocket-pantry/ui';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { UNITS, type Unit } from '@/lib/catalog';
import {
  convertQuantity,
  parseTypedNumber,
  stepAmount,
  unitsInFamily,
  type AmountScale,
} from '@/lib/usualAmounts';
import { segmentSx, stripSx, STRIP_DIVIDER } from '../amountStrip';
import { UsualAmountRow } from '@/components/pantry/UsualAmountRow/UsualAmountRow';

const TYPED_UNITS: Record<string, Unit> = {
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
  pcs: 'pcs',
  pc: 'pcs',
  stk: 'pcs',
  buc: 'pcs',
};
/** Whether `alias` is still on its way to a unit the pattern takes. */
const continuesAlias = (alias: string) =>
  Object.keys(TYPED_UNITS).some(
    (known) => known.startsWith(alias) || `${known}.` === alias,
  );
// Android IMEs report typing as composition text.
const TYPED_INPUT_TYPES = new Set(['insertText', 'insertCompositionText']);
const TYPED_AMOUNT = /^(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|pcs|pc|stk|buc)\.?$/i;

/** A number as plain decimal text: `String` would turn 0.0000001 into "1e-7", which does not parse. */
const plainNumber = (value: number) =>
  value.toLocaleString('en-US', {
    useGrouping: false,
    maximumFractionDigits: 20,
  });

/** The strip's height in px, the same for unit toggles and values so the field never jumps. */
const STRIP_HEIGHT = 40;
/** The corner just inside the field's border. */
const INNER_RADIUS = `calc(${radius.control} - ${border.field})`;

export type AmountFieldProps = {
  /** The number input's id, for a host that moves focus to it; generated when left out. */
  id?: string;
  /** Name of the item whose amount this is, for the accessible names; empty before a pick. */
  name: string;
  quantity: string;
  unit: Unit | '';
  /** A typed unit ("500 g") arrives with the quantity, as one change. */
  onQuantityChange: (quantity: string, unit?: Unit | '') => void;
  onUnitChange: (unit: Unit | '') => void;
  /** Why the quantity is invalid, or null when it is fine. */
  error: string | null;
  /** Enter in the input. */
  onSubmit: () => void;
  /** A round button beside the field (the Add sheet's "+"); leave out when a footer saves. */
  submit?: { label: string; disabled: boolean };
  /** Offer "No unit" in the unit menu; off where a quantity always needs a unit (Finish Shopping, Pantry Batches). */
  allowNoUnit?: boolean;
  /** A visible label on the border, like the floating labels of the form fields around it. */
  label?: string;
  /** Input height in px; 56 matches the outlined form fields around it. */
  height?: number;
  /** The Ingredient's Amount Scale, which decides its Usual Amounts. Null or left out (an Unmatched name, the amount sheet) offers them from the unit alone. */
  amountScale?: AmountScale | null;
  /**
   * Whether switching the unit within a family converts the number (1.5 kg becomes 1500 g). On by default;
   * turn it off where the amount is being corrected, not converted (Scan and Voice review), so only the unit changes.
   */
  rescaleOnUnitChange?: boolean;
};

/**
 * The amount field: one block of two rows inside one border. Row 1 is the number input, with the
 * unit as a dropdown on its right once one is chosen. Row 2 is a strip of segments: one toggle per
 * unit while there is none, then the Usual Amounts for that unit. Taps in either row hand focus
 * back to the input, so the phone keyboard stays open and Enter still submits. It has no outer
 * padding: the host (the Add sheet's row, Finish Shopping, the amount sheet, the Pantry Batch
 * forms) places it.
 */
export function AmountField({
  id,
  name,
  quantity,
  unit,
  onQuantityChange,
  onUnitChange,
  error,
  onSubmit,
  submit,
  allowNoUnit = true,
  label,
  height = 44,
  amountScale,
  rescaleOnUnitChange = true,
}: AmountFieldProps) {
  const { t } = useTranslation('common');
  const errorId = useId();
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  // The input row; the menu opens below it, over the strip.
  const [row, setRow] = useState<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Opened from the keyboard: focus moves into the menu, onto the current unit, and Escape
  // hands it back to the dropdown. Opened by a tap, Escape hands focus to the input.
  const fromKeyboard = useRef(false);
  const focusMenu = useRef(false);
  const open = menuOpen && unit !== '';
  // A tap while typing leaves focus on the input, so the phone keyboard stays open.
  const keepFocus = (event: MouseEvent) => {
    if (document.activeElement === input.current) event.preventDefault();
  };

  // What the last keystroke split off, so the next one can continue the unit
  // ("pc" then "s") or undo the split ("g" then "r" of "gram").
  const split = useRef<{
    quantity: string;
    original: string;
    alias: string;
    previousUnit: Unit | '';
  } | null>(null);
  const type = (text: string, typedAtEnd: boolean) => {
    // Only a character typed at the end continues or undoes a split; a paste
    // or an edit mid-text is a fresh amount.
    const last = typedAtEnd ? split.current : null;
    split.current = null;
    const rest = last ? text.slice(last.quantity.length) : '';
    if (
      last &&
      text.startsWith(last.quantity) &&
      rest.length === 1 &&
      !/\d/.test(rest)
    ) {
      const alias = last.alias + rest.toLowerCase();
      if (continuesAlias(alias)) {
        split.current = { ...last, alias, original: last.original + rest };
        onQuantityChange(last.quantity);
      } else {
        onQuantityChange(last.original + rest, last.previousUnit);
      }
      return;
    }
    const typed = TYPED_AMOUNT.exec(text);
    const typedUnit = typed?.[2] ? TYPED_UNITS[typed[2].toLowerCase()] : null;
    if (typed?.[1] && typed[2] && typedUnit) {
      split.current = {
        quantity: typed[1],
        original: text,
        alias: typed[2].toLowerCase(),
        previousUnit: unit,
      };
      onQuantityChange(typed[1], typedUnit);
    } else {
      onQuantityChange(text);
    }
  };

  const choose = (next: Unit | '') => {
    split.current = null;
    fromKeyboard.current = false;
    // Within a family the number is rescaled, so the amount stays the same (1.5 kg is 1500 g);
    // across families it is kept as typed.
    const value = parseTypedNumber(quantity);
    if (
      rescaleOnUnitChange &&
      unit &&
      next &&
      next !== unit &&
      value !== null &&
      unitsInFamily(unit).includes(next)
    ) {
      onQuantityChange(plainNumber(convertQuantity(value, unit, next)));
    }
    onUnitChange(next);
    setMenuOpen(false);
    input.current?.focus();
  };
  const pick = (value: number) => {
    split.current = null;
    onQuantityChange(String(value));
    input.current?.focus();
  };

  // A tap anywhere outside the field closes the menu; the input may never have lost focus.
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !focusMenu.current) return;
    focusMenu.current = false;
    menu.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, [open]);

  const keyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && open) {
      // The menu goes first; the sheet stays open.
      event.stopPropagation();
      setMenuOpen(false);
      (fromKeyboard.current ? trigger : input).current?.focus();
      fromKeyboard.current = false;
    }
  };
  // Up and down step the amount; an empty field only steps up.
  const step = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    split.current = null;
    const direction = event.key === 'ArrowUp' ? 1 : -1;
    const empty = quantity.trim() === '';
    if (empty && direction < 0) return;
    const current = empty ? 0 : parseTypedNumber(quantity);
    if (current === null) return;
    onQuantityChange(
      String(stepAmount(current, direction, unit, event.shiftKey)),
    );
  };
  const blur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false);
  };
  /** Moves focus among the shown buttons of `container` with `back` and `forward` keys. */
  const rove = (
    event: KeyboardEvent<HTMLElement>,
    back: string,
    forward: string,
  ) => {
    if (
      event.key !== back &&
      event.key !== forward &&
      event.key !== 'Home' &&
      event.key !== 'End'
    )
      return;
    const shown = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('button:not([hidden])'),
    );
    const at = shown.indexOf(event.target as HTMLElement);
    if (at < 0) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? shown.length - 1
          : event.key === forward
            ? Math.min(at + 1, shown.length - 1)
            : Math.max(at - 1, 0);
    shown[next].focus();
  };

  const unitLabel = (option: Unit) => t(`common:units.${option}`);
  const menuOptions: (Unit | '')[] = allowNoUnit ? [...UNITS, ''] : [...UNITS];
  const line = `${border.field} solid ${error ? tokens.color.urgentFg : tokens.color.line}`;

  return (
    <Box ref={root} onKeyDown={keyDown} onBlur={blur}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <Box
          sx={{
            position: 'relative',
            flex: 1,
            minWidth: 0,
            borderRadius: radius.control,
            border: line,
            backgroundColor: color.fieldBg,
            '&:focus-within': {
              borderColor: error ? tokens.color.urgentFg : tokens.color.accent,
              boxShadow: `0 0 0 3px ${tokens.color.accentTint}`,
            },
          }}
        >
          {label ? (
            <Box
              component="label"
              htmlFor={inputId}
              sx={{
                position: 'absolute',
                top: 0,
                left: 10,
                transform: 'translateY(-50%)',
                px: '4px',
                fontSize: 12,
                fontWeight: 600,
                lineHeight: 1,
                color: tokens.color.muted,
                backgroundColor: color.fieldBg,
                pointerEvents: 'none',
              }}
            >
              {label}
            </Box>
          ) : null}
          <Box ref={setRow} sx={{ display: 'flex', height }}>
            <Box
              component="input"
              id={inputId}
              ref={input}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              aria-label={
                name
                  ? t('common:amount.label', { name })
                  : t('common:amount.labelNoName')
              }
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              placeholder={t('common:amount.placeholder')}
              value={quantity}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                type(
                  event.target.value,
                  TYPED_INPUT_TYPES.has(
                    (event.nativeEvent as InputEvent).inputType,
                  ) &&
                    event.target.selectionStart === event.target.value.length,
                )
              }
              onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onSubmit();
                } else {
                  step(event);
                }
              }}
              sx={{
                flex: 1,
                minWidth: 0,
                height: '100%',
                pl: '12px',
                border: 0,
                outline: 0,
                background: 'transparent',
                font: 'inherit',
                fontSize: 16,
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
                color: tokens.color.ink,
              }}
            />
            {unit ? (
              <Box
                component="button"
                type="button"
                ref={trigger}
                aria-label={t('common:amount.unit', { unit: unitLabel(unit) })}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? menuId : undefined}
                onMouseDown={(event: MouseEvent) => {
                  fromKeyboard.current = false;
                  keepFocus(event);
                }}
                onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
                  if (event.key === 'ArrowDown' && !open) {
                    event.preventDefault();
                    fromKeyboard.current = true;
                    focusMenu.current = true;
                    setMenuOpen(true);
                  } else if (event.key === 'Enter' || event.key === ' ') {
                    // The click that follows opens the menu.
                    fromKeyboard.current = true;
                  }
                }}
                onClick={() => {
                  if (!open) focusMenu.current = fromKeyboard.current;
                  setMenuOpen(!open);
                }}
                sx={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  px: 1.5,
                  border: 0,
                  borderLeft: `${STRIP_DIVIDER}px solid ${tokens.color.line}`,
                  borderTopRightRadius: INNER_RADIUS,
                  background: 'transparent',
                  cursor: 'pointer',
                  font: 'inherit',
                  fontSize: 15,
                  fontWeight: 700,
                  color: tokens.color.ink,
                  ...insetFocusRing,
                }}
              >
                {unitLabel(unit)}
                <ChevronDownIcon size={14} />
              </Box>
            ) : null}
          </Box>
          <Popper open={open} anchorEl={row} placement="bottom-end">
            <Box
              ref={menu}
              id={menuId}
              role="menu"
              aria-label={t('common:amount.units')}
              onMouseDown={keepFocus}
              onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
                if (event.key === 'Tab') setMenuOpen(false);
                else rove(event, 'ArrowUp', 'ArrowDown');
              }}
              sx={{
                minWidth: 140,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                borderRadius: radius.control,
                border: `${border.width} solid ${tokens.color.line}`,
                backgroundColor: tokens.color.surface,
                boxShadow: shadow.float,
              }}
            >
              {menuOptions.map((option) => {
                const checked = option === unit;
                return (
                  <Box
                    key={option || 'none'}
                    component="button"
                    type="button"
                    role="menuitemradio"
                    aria-checked={checked}
                    tabIndex={-1}
                    onClick={() => choose(option)}
                    sx={{
                      ...segmentSx(checked),
                      flex: 'none',
                      height: 40,
                      px: 1.5,
                      textAlign: 'left',
                      fontVariantNumeric: 'normal',
                      ...(option
                        ? {}
                        : {
                            borderTop: `${STRIP_DIVIDER}px solid ${tokens.color.line}`,
                          }),
                    }}
                  >
                    {option ? unitLabel(option) : t('common:amount.noUnit')}
                  </Box>
                );
              })}
            </Box>
          </Popper>
          <Box
            onMouseDown={keepFocus}
            onKeyDown={(event: KeyboardEvent<HTMLElement>) =>
              rove(event, 'ArrowLeft', 'ArrowRight')
            }
            sx={{
              height: STRIP_HEIGHT,
              borderTop: `${STRIP_DIVIDER}px solid ${tokens.color.line}`,
              borderBottomLeftRadius: INNER_RADIUS,
              borderBottomRightRadius: INNER_RADIUS,
              overflow: 'hidden',
            }}
          >
            {unit ? (
              <UsualAmountRow
                name={name}
                scale={amountScale}
                unit={unit}
                quantity={quantity}
                onPick={pick}
              />
            ) : (
              <Box
                role="group"
                aria-label={t('common:amount.chooseUnit')}
                sx={stripSx}
              >
                {UNITS.map((option) => (
                  <Box
                    key={option}
                    component="button"
                    type="button"
                    // "No unit" is the state with none pressed.
                    aria-pressed={false}
                    onClick={() => choose(option)}
                    // Five toggles share the width evenly, down to a 320 px sheet.
                    sx={{
                      ...segmentSx(false),
                      flex: '1 1 0',
                      minWidth: 0,
                      px: 0,
                    }}
                  >
                    {unitLabel(option)}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>
        {submit ? (
          <Box
            component="button"
            type="button"
            aria-label={submit.label}
            disabled={submit.disabled}
            onClick={onSubmit}
            sx={{
              flexShrink: 0,
              width: 44,
              height: 44,
              display: 'grid',
              placeItems: 'center',
              border: 0,
              borderRadius: radius.control,
              cursor: 'pointer',
              backgroundColor: tokens.color.accent,
              color: color.accentInk,
              '&:disabled': { opacity: 0.5, cursor: 'default' },
            }}
          >
            <PlusIcon size={20} />
          </Box>
        ) : null}
      </Box>
      {error ? (
        <Typography
          id={errorId}
          variant="meta"
          sx={{ display: 'block', mt: 0.75, color: tokens.color.urgentFg }}
        >
          {error}
        </Typography>
      ) : null}
    </Box>
  );
}
