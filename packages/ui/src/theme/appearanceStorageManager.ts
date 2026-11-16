import type { StorageManager } from '@mui/material/styles';
import {
  readAppearance,
  subscribeAppearance,
  type Appearance,
} from './appearance';
import { THEME_META } from './themes';

type Slot = 'mode' | 'light' | 'dark';

/** MUI asks for its mode under one key and its light/dark scheme slots under `<key>-light` / `<key>-dark`. */
function slotOf(key: string): Slot {
  if (key.endsWith('-light')) return 'light';
  if (key.endsWith('-dark')) return 'dark';
  return 'mode';
}

/**
 * Both scheme slots are always seeded, because MUI's provider otherwise
 * assumes schemes literally named `light` and `dark`. With these slots MUI's
 * own mode logic reproduces `resolveTheme`.
 */
function slotValue(slot: Slot, appearance: Appearance): string {
  if (slot === 'light') return 'light';
  if (slot === 'dark') return 'dark';
  return appearance.matchSystem
    ? 'system'
    : THEME_META[appearance.theme].scheme;
}

/**
 * Maps the device's `pp.appearance` onto MUI's colour-scheme storage. The
 * appearance module owns persistence: MUI's writes back are ignored, so the
 * only way to change the Theme is `writeAppearance`.
 */
export const appearanceStorageManager: StorageManager = ({ key }) => {
  const slot = slotOf(key);
  return {
    get: () => slotValue(slot, readAppearance()),
    set: () => undefined,
    subscribe: (handler) =>
      subscribeAppearance((appearance) => handler(slotValue(slot, appearance))),
  };
};
