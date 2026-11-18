import type { ComponentType, SVGProps } from 'react';
import {
  Compass,
  House,
  LayoutGrid,
  Settings,
  LogOut,
  Image,
  Pencil,
  Zap,
  Clock,
  Layers,
  Leaf,
  Wallet,
  Apple,
  ChevronUp,
  GripVertical,
  TriangleAlert,
  CircleAlert,
  CircleCheck,
  ArrowLeft,
  ArrowRight,
  ArrowLeftRight,
  Users,
  GitBranch,
  Eye,
  BatteryLow,
  Mic,
  MicOff,
  WifiOff,
  Ear,
  Quote,
  Equal,
  Lock,
  Camera,
  ScanBarcode,
  Globe,
  ImagePlus,
  ReceiptText,
  Refrigerator,
  Snowflake,
  SquareSplitHorizontal,
  LeafyGreen,
  CalendarDays,
  Coins,
  Link2,
  Package,
  type LucideProps,
} from 'lucide-react';

type IconNode = readonly (readonly [
  'path' | 'circle' | 'rect',
  Readonly<Record<string, string>>,
])[];

/**
 * The Themes & icons handoff set (docs/handoffs/themes, `icons.tsx`): 24 px grid, 2 px stroke,
 * round caps and joins, `currentColor`; no fill except `star-fill` and the dots of `more`.
 * Same shapes as the handoff's `ICON_PATHS`, held as elements rather than markup strings.
 */
const ICON_NODES = {
  plus: [['path', { d: 'M12 5v14M5 12h14' }]],
  minus: [['path', { d: 'M5 12h14' }]],
  copy: [
    ['rect', { x: '8', y: '8', width: '12', height: '12', rx: '2' }],
    ['path', { d: 'M16 8V4H4v12h4' }],
  ],
  logout: [
    ['path', { d: 'M14 4h5v16h-5' }],
    ['path', { d: 'M10 8l-4 4 4 4M6 12h10' }],
  ],
  user: [
    ['circle', { cx: '12', cy: '8', r: '4' }],
    ['path', { d: 'M4.5 21a7.5 7.5 0 0 1 15 0' }],
  ],
  phone: [
    ['rect', { x: '6', y: '2.5', width: '12', height: '19', rx: '2.5' }],
    ['path', { d: 'M11 18.5h2' }],
  ],
  close: [['path', { d: 'M6 6l12 12M18 6L6 18' }]],
  'book-plus': [
    [
      'path',
      {
        d: 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20',
      },
    ],
    ['path', { d: 'M9 10h6M12 7v6' }],
  ],
  check: [['path', { d: 'M5 12l5 5 9-10' }]],
  search: [
    ['circle', { cx: '11', cy: '11', r: '7' }],
    ['path', { d: 'M20 20l-3.5-3.5' }],
  ],
  'chevron-down': [['path', { d: 'M6 9l6 6 6-6' }]],
  'chevron-right': [['path', { d: 'M9 6l6 6-6 6' }]],
  'chevron-left': [['path', { d: 'M15 6l-6 6 6 6' }]],
  star: [
    [
      'path',
      {
        d: 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z',
      },
    ],
  ],
  'star-fill': [
    [
      'path',
      {
        fill: 'currentColor',
        stroke: 'none',
        d: 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z',
      },
    ],
  ],
  bookmark: [['path', { d: 'M6 3h12v18l-6-4-6 4z' }]],
  basket: [
    ['path', { d: 'M4 10h16l-1.5 9h-13z' }],
    ['path', { d: 'M8 10V7a4 4 0 0 1 8 0v3' }],
  ],
  pantry: [
    ['path', { d: 'M4 7h16v13H4z' }],
    ['path', { d: 'M4 12h16M9 7V4h6v3' }],
  ],
  recipes: [
    ['path', { d: 'M5 4h14v16H5z' }],
    ['path', { d: 'M8 9h8M8 13h8M8 17h5' }],
  ],
  /** The open book with a ribbon on the right page: the Recipes tab. */
  cookbook: [
    [
      'path',
      {
        d: 'M12 7c-1.7-1.6-4.2-2.3-8-2.3V18c3.8 0 6.3.7 8 2.3 1.7-1.6 4.2-2.3 8-2.3V4.7c-3.8 0-6.3.7-8 2.3z',
      },
    ],
    ['path', { d: 'M12 7v13.3' }],
    ['path', { d: 'M15.2 5v4.6l-1.3-1-1.3 1V5.3' }],
  ],
  scan: [
    ['path', { d: 'M4 8V5h3M20 8V5h-3M4 16v3h3M20 16v3h-3' }],
    ['path', { d: 'M8 12h8' }],
  ],
  info: [
    ['circle', { cx: '12', cy: '12', r: '9' }],
    ['path', { d: 'M12 11v5M12 8h.01' }],
  ],
  trash: [['path', { d: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13' }]],
  more: [
    ['circle', { cx: '5', cy: '12', r: '1.3', fill: 'currentColor' }],
    ['circle', { cx: '12', cy: '12', r: '1.3', fill: 'currentColor' }],
    ['circle', { cx: '19', cy: '12', r: '1.3', fill: 'currentColor' }],
  ],
  sliders: [
    ['path', { d: 'M4 7h9M19 7h1M4 17h3M13 17h7' }],
    ['circle', { cx: '16', cy: '7', r: '2.5' }],
    ['circle', { cx: '10', cy: '17', r: '2.5' }],
  ],
  template: [
    ['path', { d: 'M4 5h16v14H4z' }],
    ['path', { d: 'M4 10h16M10 10v9' }],
  ],
  /** A tray with an arrow dropping into it: the shopping import handoff's `imp`. */
  import: [
    ['path', { d: 'M12 4v10M8 10.5l4 4 4-4' }],
    [
      'path',
      { d: 'M4.5 14.5v3A2.5 2.5 0 0 0 7 20h10a2.5 2.5 0 0 0 2.5-2.5v-3' },
    ],
  ],
  undo: [
    ['path', { d: 'M4 10h11a5 5 0 0 1 0 10h-3' }],
    ['path', { d: 'M8 6l-4 4 4 4' }],
  ],
  /** Not in the handoff set: the expiry handoff's calendar, drawn on the same grid. */
  calendar: [
    ['rect', { x: '3', y: '5', width: '18', height: '16', rx: '3' }],
    ['path', { d: 'M3 10h18M8 3v4M16 3v4' }],
  ],
  /** Not in the handoff set: the Pantry batches handoff's battery-low, the Running low flag. */
  'battery-low': [
    ['rect', { x: '2.5', y: '7', width: '17', height: '10', rx: '2.5' }],
    ['path', { d: 'M22 10.5v3' }],
    ['path', { d: 'M6.5 10.5v3', strokeWidth: '3.2' }],
  ],
  /** Not in the handoff set: the Meal plan handoff's short marker, drawn at 10 to 12 px with a heavier stroke. */
  bang: [['path', { d: 'M12 6v8M12 18v.01' }]],
  /** Not in the handoff set: the Pantry health handoff's pulse, the Pantry health Widget's mark. */
  pulse: [['path', { d: 'M3 12h4l2-5 4 10 2-5h6' }]],
  /** Not in the handoff set: the Pantry health handoff's cook, the Expiring Soon Health To-do. */
  cook: [
    ['path', { d: 'M4 11h16v3a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z' }],
    ['path', { d: 'M9 7c0-1 1-1 1-2M14 7c0-1 1-1 1-2' }],
  ],
  /** Not in the handoff set: the Pantry health handoff's hourglass, a Forgotten Batch. */
  hourglass: [
    [
      'path',
      {
        d: 'M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9',
      },
    ],
  ],
  /** Tags button and Tag field (docs/handoffs/tags-filter): stroke 1.9, the hole is a filled dot. */
  tag: [
    [
      'path',
      {
        strokeWidth: '1.9',
        d: 'M3.5 12.3V5a1.5 1.5 0 0 1 1.5-1.5h7.3a1.5 1.5 0 0 1 1 .4l7.3 7.3a1.5 1.5 0 0 1 0 2.1l-7.3 7.3a1.5 1.5 0 0 1-2.1 0L3.9 13.3a1.5 1.5 0 0 1-.4-1z',
      },
    ],
    [
      'circle',
      { cx: '8.2', cy: '8.2', r: '1.4', fill: 'currentColor', stroke: 'none' },
    ],
  ],
  /** Pantry Health lights (Canopy handoff section 6.4), drawn at 22 px with stroke 1.7. Expired: a jar with an exclamation mark. */
  'lamp-expired': [
    ['rect', { x: '8', y: '3', width: '8', height: '2.6', rx: '0.9' }],
    [
      'path',
      {
        d: 'M7.8 5.6C6.5 6.5 5.5 7.8 5.5 9.5v9a2.5 2.5 0 0 0 2.5 2.5h8a2.5 2.5 0 0 0 2.5-2.5v-9c0-1.7-1-3-2.3-3.9',
      },
    ],
    ['path', { d: 'M12 10v5M12 17.8v.2' }],
  ],
  /** Use soon: an hourglass with a little sand left. */
  'lamp-soon': [
    [
      'path',
      {
        d: 'M7 3.5h10M7 20.5h10M8.5 3.5v2.5c0 2.5 3.5 3.7 3.5 6s-3.5 3.5-3.5 6v2.5M15.5 3.5v2.5c0 2.5-3.5 3.7-3.5 6s3.5 3.5 3.5 6v2.5M10.5 18h3',
      },
    ],
  ],
  /** Running low: the jar with a low level line and a down arrow. */
  'lamp-low': [
    ['rect', { x: '8', y: '3', width: '8', height: '2.6', rx: '0.9' }],
    [
      'path',
      {
        d: 'M7.8 5.6C6.5 6.5 5.5 7.8 5.5 9.5v9a2.5 2.5 0 0 0 2.5 2.5h8a2.5 2.5 0 0 0 2.5-2.5v-9c0-1.7-1-3-2.3-3.9',
      },
    ],
    ['path', { d: 'M5.5 17.8h13M12 9.2v5.2M9.7 12.2l2.3 2.3 2.3-2.3' }],
  ],
  /** Fresh in: an arrow dropping into a basket. */
  'lamp-fresh': [
    ['path', { d: 'M12 2.5V11M8.5 7.5 12 11l3.5-3.5' }],
    ['path', { d: 'M3.5 13.5h17l-1.4 6.7a1 1 0 0 1-1 .8H5.9a1 1 0 0 1-1-.8z' }],
  ],
  /** Nothing new: the same basket asleep ("z z"). */
  'lamp-stale': [
    ['path', { d: 'M7 4.5h5.5l-5.5 6h5.5M15.5 2.5h3.5l-3.5 4h3.5' }],
    ['path', { d: 'M3.5 13.5h17l-1.4 6.7a1 1 0 0 1-1 .8H5.9a1 1 0 0 1-1-.8z' }],
  ],
  /** Not in the handoff set: a tree elbow that marks a row as belonging to the one above. */
  'sub-item': [['path', { d: 'M6 3v8a5 5 0 0 0 5 5h9' }]],
} as const satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICON_NODES;

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'ref' | 'name'> & {
  size?: number | string;
  /** Gives the icon an accessible name; without one it is decorative and hidden. */
  title?: string;
};

/** 22 px suits the four-tab dock; other sizes are passed at the call site. */
const DEFAULT_SIZE = 22;

function accessibility(title: string | undefined) {
  return title
    ? ({ role: 'img' } as const)
    : ({ 'aria-hidden': true, focusable: 'false' } as const);
}

export function Icon({
  name,
  size = DEFAULT_SIZE,
  title,
  ...rest
}: IconProps & { name: IconName }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...accessibility(title)}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {ICON_NODES[name].map(([Tag, attrs], i) => (
        <Tag key={i} {...attrs} />
      ))}
    </svg>
  );
}

function handoff(name: IconName) {
  return function PocketPantryIcon(props: IconProps) {
    return <Icon name={name} {...props} />;
  };
}

/** No handoff equivalent yet: a lucide glyph with the set's defaults, until the designer draws one. */
function lucide(Glyph: ComponentType<LucideProps>) {
  return function PocketPantryIcon({
    size = DEFAULT_SIZE,
    title,
    ...rest
  }: IconProps) {
    return (
      <Glyph
        size={size}
        strokeWidth={2}
        {...accessibility(title)}
        {...(rest as LucideProps)}
      >
        {title ? <title>{title}</title> : null}
      </Glyph>
    );
  };
}

export const PlusIcon = handoff('plus');
export const MinusIcon = handoff('minus');
export const CopyIcon = handoff('copy');
export const LogoutIcon = handoff('logout');
export const UserIcon = handoff('user');
export const PhoneIcon = handoff('phone');
export const CloseIcon = handoff('close');
export const BookPlusIcon = handoff('book-plus');
export const CheckIcon = handoff('check');
export const SearchIcon = handoff('search');
export const ChevronDownIcon = handoff('chevron-down');
export const ChevronRightIcon = handoff('chevron-right');
export const BackIcon = handoff('chevron-left');
export const StarIcon = handoff('star');
export const StarFillIcon = handoff('star-fill');
export const BookmarkIcon = handoff('bookmark');
export const ShoppingIcon = handoff('basket');
export const PantryIcon = handoff('pantry');
export const RecipesIcon = handoff('recipes');
export const CookbookIcon = handoff('cookbook');
export const ScanIcon = handoff('scan');
export const InfoIcon = handoff('info');
export const DeleteIcon = handoff('trash');
export const MoreIcon = handoff('more');
export const TemplateIcon = handoff('template');
export const ImportIcon = handoff('import');
export const UndoIcon = handoff('undo');
export const CalendarIcon = handoff('calendar');
export const BatteryLowIcon = handoff('battery-low');
export const PulseIcon = handoff('pulse');
export const LampExpiredIcon = handoff('lamp-expired');
export const LampSoonIcon = handoff('lamp-soon');
export const LampLowIcon = handoff('lamp-low');
export const LampFreshIcon = handoff('lamp-fresh');
export const LampNothingNewIcon = handoff('lamp-stale');
export const BangIcon = handoff('bang');
export const CookIcon = handoff('cook');
export const HourglassIcon = handoff('hourglass');
export const SubItemIcon = handoff('sub-item');
export const TagIcon = handoff('tag');

export const HomeIcon = lucide(House);
export const CustomiseIcon = lucide(LayoutGrid);
export const SettingsIcon = lucide(Settings);
export const SignOutIcon = lucide(LogOut);
export const GalleryIcon = lucide(Image);
export const ManualEntryIcon = lucide(Pencil);
export const FlashIcon = lucide(Zap);
export const ClockIcon = lucide(Clock);
/** Aisles row on the Admin Catalog index. */
export const LayersIcon = lucide(Layers);
export const IngredientsScanIcon = lucide(Leaf);
export const BudgetIcon = lucide(Wallet);
export const NutritionIcon = lucide(Apple);
export const ChevronUpIcon = lucide(ChevronUp);
export const GripIcon = lucide(GripVertical);
export const WarningIcon = lucide(TriangleAlert);
export const AlertIcon = lucide(CircleAlert);
export const CheckCircleIcon = lucide(CircleCheck);
export const ArrowLeftIcon = lucide(ArrowLeft);
export const ArrowRightIcon = lucide(ArrowRight);
export const SwapIcon = lucide(ArrowLeftRight);
export const PeopleIcon = lucide(Users);
export const BranchIcon = lucide(GitBranch);
/** A Recipe's Source Link row. */
export const LinkIcon = lucide(Link2);
export const EyeIcon = lucide(Eye);
export const RunningLowIcon = lucide(BatteryLow);

/** Voice Notes: the voice button, the intro sheet hero and its Allow button. */
export const MicIcon = lucide(Mic);
/** Voice Notes: microphone permission denied. */
export const MicOffIcon = lucide(MicOff);
/** Voice Notes status pill: "Couldn't send". */
export const WifiOffIcon = lucide(WifiOff);
/** Voice Notes status pill: "Didn't catch anything". */
export const EarIcon = lucide(Ear);
/** Voice Notes Review: the "What I heard" tile. */
export const QuoteIcon = lucide(Quote);
/** Voice Notes Review: the Set quantity op tile. */
export const EqualIcon = lucide(Equal);
/** Locked / unavailable marker. */
export const LockIcon = lucide(Lock);
/** The Dock's stacked Camera/Mic button: open the camera. */
export const CameraIcon = lucide(Camera);
/** Add to Pantry quick row: "Scan barcode". */
export const ScanBarcodeIcon = lucide(ScanBarcode);
/** Scan camera: the Scan Language chip's globe. */
export const GlobeIcon = lucide(Globe);
/** Explore: the header pill, the "+" menu item and the empty Recipes page. */
export const CompassIcon = lucide(Compass);
/** Review overview: "Add from photos". */
export const ImagePlusIcon = lucide(ImagePlus);
export const ReceiptIcon = lucide(ReceiptText);
/** The four Locations, drawn above their labels where the label alone would not fit. */
export const FridgeIcon = lucide(Refrigerator);
export const FreezerIcon = lucide(Snowflake);
export const CupboardIcon = lucide(SquareSplitHorizontal);
export const SpicesIcon = lucide(LeafyGreen);
/** Add to Pantry: the resolved expiry line and the calendar chip. */
export const CalendarDaysIcon = lucide(CalendarDays);
/** A Credit Price: the icon stands in for the word "Credits" beside the number. */
export const CreditIcon = lucide(Coins);
/** A box: what a Scan adds to the Pantry (the camera's "Adds to your Pantry" pill). */
export const BoxIcon = lucide(Package);
