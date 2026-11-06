import { Box, GlobeIcon, tokens, radius } from '@pocket-pantry/ui';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { SCAN_LANGUAGES, type ScanLanguage } from '../../../i18n/resources';
import { keyframesSx } from '../../../lib/keyframesSx';
import { SCAN_LANGUAGE_NAMES } from '../../../lib/scanLanguage';
import { glassFocusRing, translucent } from '../../../components/camera/glass';

type Props = {
  value: ScanLanguage;
  disabled: boolean;
  onChange: (language: ScanLanguage) => void;
};

/**
 * The language this Scan is read in: a pill with a globe and the language code that opens a menu of
 * the Scan Languages (handoff 2.3). Self-contained (value + onChange), so a host with or without a
 * Scan Session can mount it; what a pick means is the host's business.
 */
export function ScanLanguageChip({ value, disabled, onChange }: Props) {
  const { t } = useTranslation('scan');
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLDivElement | null)[]>([]);
  const isOpen = open && !disabled;

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) chip.current?.focus();
  };

  // Opening focuses the checked item.
  useEffect(() => {
    if (isOpen) items.current[SCAN_LANGUAGES.indexOf(value)]?.focus();
    // Only when it opens; a pick closes the menu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // A tap outside closes it.
  useEffect(() => {
    if (!isOpen) return;
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [isOpen]);

  // A lock while the menu is open closes it.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const pick = (language: ScanLanguage) => {
    close();
    onChange(language);
  };

  const onMenuKey = (event: ReactKeyboardEvent) => {
    const at = items.current.findIndex((el) => el === document.activeElement);
    const last = SCAN_LANGUAGES.length - 1;
    const move = (index: number) => {
      event.preventDefault();
      items.current[index]?.focus();
    };
    switch (event.key) {
      case 'ArrowDown':
        return move(at >= last ? 0 : at + 1);
      case 'ArrowUp':
        return move(at <= 0 ? last : at - 1);
      case 'Home':
        return move(0);
      case 'End':
        return move(last);
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        return close();
      case 'ArrowLeft':
      case 'ArrowRight':
        // The camera's mode must not change under an open menu.
        event.preventDefault();
        event.stopPropagation();
        return;
      case 'Tab':
        return close(false);
      default:
    }
  };

  return (
    <Box
      ref={root}
      sx={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        mx: '4px',
        color: tokens.color.ink,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Box
        component="button"
        ref={chip}
        type="button"
        aria-label={t('scanLanguage.label')}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen(!isOpen)}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          height: 28,
          minWidth: 44,
          boxSizing: 'border-box',
          px: '10px',
          borderRadius: radius.pill,
          border: `1.5px solid ${translucent(tokens.color.ink, 75)}`,
          backgroundColor: 'transparent',
          color: 'inherit',
          fontFamily: 'inherit',
          fontSize: 12.5,
          fontWeight: 800,
          letterSpacing: '0.06em',
          cursor: disabled ? 'default' : 'pointer',
          '&:focus-visible': glassFocusRing,
        }}
      >
        <GlobeIcon size={13} aria-hidden="true" />
        <span>{value.toUpperCase()}</span>
      </Box>
      {isOpen ? (
        <Box
          id={menuId}
          role="menu"
          tabIndex={-1}
          aria-label={t('scanLanguage.label')}
          onKeyDown={onMenuKey}
          sx={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            zIndex: 5,
            minWidth: 150,
            boxSizing: 'border-box',
            p: '6px',
            borderRadius: radius.card,
            border: `1px solid ${translucent(tokens.color.ink, 12)}`,
            backgroundColor: translucent(tokens.color.bg, 82),
            backdropFilter: 'blur(18px) saturate(1.2)',
            transformOrigin: 'top right',
            ...keyframesSx('pp-language-menu-in', '180ms ease-out both', {
              from: { opacity: 0, transform: 'scale(.92)' },
              to: { opacity: 1, transform: 'scale(1)' },
            }),
          }}
        >
          {SCAN_LANGUAGES.map((language, index) => {
            const checked = language === value;
            return (
              <Box
                key={language}
                ref={(el: HTMLDivElement | null) => {
                  items.current[index] = el;
                }}
                role="menuitemradio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                lang={language}
                onClick={() => pick(language)}
                onKeyDown={(event: ReactKeyboardEvent) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    pick(language);
                  }
                }}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  px: '12px',
                  py: '10px',
                  borderRadius: radius.control,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  '&:hover': {
                    backgroundColor: translucent(tokens.color.ink, 7),
                  },
                  '&:focus-visible': glassFocusRing,
                }}
              >
                <span>{SCAN_LANGUAGE_NAMES[language]}</span>
                <Box
                  component="span"
                  aria-hidden="true"
                  sx={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: checked ? tokens.color.accent : tokens.color.muted,
                  }}
                >
                  {language.toUpperCase()}
                </Box>
              </Box>
            );
          })}
        </Box>
      ) : null}
    </Box>
  );
}
