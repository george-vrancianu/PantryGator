import { useId, type ReactNode } from 'react';
import { Box } from '../atoms/Layout';
import { CheckIcon } from '../atoms/icons';
import { Typography } from '../atoms/Typography';
import { focusRingStyle, insetFocusRingStyle } from '../theme/focusRing';
import { color, palette, radius } from '../theme/themeVars';
import { visuallyHidden } from '../theme/visuallyHidden';

export type Choice<T extends string> = {
  value: T;
  label: ReactNode;
  /** A second line under the label, read as the radio's description. */
  description?: ReactNode;
  /** A mark before the text, decorative. */
  icon?: ReactNode;
  /** Language of the label, when it differs from the page's. */
  lang?: string;
};

type Props<T extends string> = {
  /** Accessible and visible name of the group. */
  label: string;
  /** A line under the label, read as the group's description. */
  hint?: string;
  choices: Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  /**
   * Rows one under another (the default), chips that wrap, or `list`: one bordered card with a
   * row per choice, divider lines between them and the picked row marked by a check on a tint.
   */
  layout?: 'rows' | 'chips' | 'list';
  /** Hide the visible name (the group keeps it for assistive technology). */
  hideLabel?: boolean;
  /**
   * `olive` is for the Intro's olive ground: the group's name is cream, the picked choice is a cream
   * card with a thick butter border, the others are the darker olive.
   */
  tone?: 'plain' | 'olive';
  /** Every choice is dimmed and cannot be picked; the group is marked disabled for assistive technology. */
  disabled?: boolean;
};

function choiceRadius(layout: Props<string>['layout']) {
  return layout === 'chips' ? radius.chip : radius.control;
}

/**
 * A real radio group: native radio inputs sharing one name, so the arrow keys move and pick and Tab
 * enters and leaves the group. The look is on the label; the input is hidden but stays focusable.
 */
export function ChoiceRadioGroup<T extends string>({
  label,
  hint,
  choices,
  value,
  onChange,
  layout = 'rows',
  hideLabel = false,
  tone = 'plain',
  disabled = false,
}: Props<T>) {
  const list = layout === 'list' && tone === 'plain';
  const olive = tone === 'olive';
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  return (
    <Box
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={hint ? hintId : undefined}
      aria-disabled={disabled || undefined}
      sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
    >
      <Typography
        id={labelId}
        variant="sectionLabel"
        color={olive ? undefined : 'text.secondary'}
        sx={
          hideLabel
            ? visuallyHidden
            : olive
              ? { color: color.cardBg }
              : undefined
        }
      >
        {label}
      </Typography>
      {hint ? (
        <Typography
          id={hintId}
          variant="meta"
          color={olive ? undefined : 'text.secondary'}
          sx={olive ? { color: color.cardBg } : undefined}
        >
          {hint}
        </Typography>
      ) : null}
      <Box
        sx={
          list
            ? {
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                borderRadius: radius.card,
                border: '1px solid',
                borderColor: 'pp.cardLine',
                backgroundColor: 'pp.cardBg',
              }
            : {
                display: 'flex',
                flexDirection: layout === 'chips' ? 'row' : 'column',
                flexWrap: 'wrap',
                gap: '8px',
              }
        }
      >
        {choices.map((choice, index) => {
          const selected = choice.value === value;
          const textId = `${id}-${choice.value}`;
          return (
            <Box
              key={choice.value}
              component="label"
              lang={choice.lang}
              sx={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                boxSizing: 'border-box',
                minHeight: layout === 'chips' ? 44 : 50,
                px: '16px',
                borderRadius: list ? 0 : choiceRadius(layout),
                ...(list
                  ? {
                      border: 0,
                      borderTop: index === 0 ? 0 : '1px solid',
                      borderColor: 'divider',
                      backgroundColor: selected
                        ? 'pp.accentTint'
                        : 'transparent',
                      color: selected ? color.accentOnTint : 'text.primary',
                    }
                  : olive
                    ? {
                        border: '3px solid',
                        borderColor: selected
                          ? palette('secondary-main')
                          : 'transparent',
                        backgroundColor: selected
                          ? 'pp.cardBg'
                          : color.accentOnTint,
                        color: selected ? 'text.primary' : color.cardBg,
                        py: '14px',
                      }
                    : {
                        border: '2px solid',
                        borderColor: selected ? 'pp.accent' : 'pp.cardLine',
                        backgroundColor: selected
                          ? 'pp.accentTint'
                          : 'pp.cardBg',
                        color: selected ? color.accentOnTint : 'text.primary',
                      }),
                fontWeight: selected ? 700 : 600,
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.45 : 1,
                '&:has(input:focus-visible)': list
                  ? insetFocusRingStyle
                  : focusRingStyle,
              }}
            >
              <Box
                component="input"
                type="radio"
                name={id}
                value={choice.value}
                checked={selected}
                disabled={disabled}
                onChange={() => {
                  if (!disabled) onChange(choice.value);
                }}
                aria-labelledby={
                  choice.description ? `${textId}-name` : undefined
                }
                aria-describedby={
                  choice.description ? `${textId}-hint` : undefined
                }
                sx={visuallyHidden}
              />
              {choice.icon ? (
                <Box
                  aria-hidden
                  sx={{
                    display: 'inline-flex',
                    flexShrink: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    backgroundColor: 'text.primary',
                    color: color.cardBg,
                  }}
                >
                  {choice.icon}
                </Box>
              ) : null}
              {choice.description ? (
                <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
                  <Box
                    component="span"
                    id={`${textId}-name`}
                    sx={{ display: 'block', fontWeight: 700 }}
                  >
                    {choice.label}
                  </Box>
                  <Box
                    component="span"
                    id={`${textId}-hint`}
                    sx={{ display: 'block', fontWeight: 400, mt: '2px' }}
                  >
                    {choice.description}
                  </Box>
                </Box>
              ) : (
                <span>{choice.label}</span>
              )}
              {selected ? (
                <Box
                  aria-hidden
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    backgroundColor: 'pp.accent',
                    color: color.accentInk,
                    flexShrink: 0,
                  }}
                >
                  <CheckIcon size={14} />
                </Box>
              ) : null}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
