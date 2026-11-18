import {
  CupboardIcon,
  FreezerIcon,
  FridgeIcon,
  SpicesIcon,
} from '@pocket-pantry/ui';
import type { StorageLocation } from '@/lib/catalog';

const ICONS = {
  fridge: FridgeIcon,
  freezer: FreezerIcon,
  cupboard: CupboardIcon,
  spices: SpicesIcon,
} as const;

/** The icon of a storage Location. */
export function LocationIcon({
  location,
  size,
}: {
  location: StorageLocation;
  size: number;
}) {
  const Icon = ICONS[location];
  return <Icon size={size} />;
}
