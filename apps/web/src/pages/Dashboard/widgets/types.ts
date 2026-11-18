import type { WidgetSize } from '@/lib/dashboard';
import type { GridColumns } from '@/lib/layoutColumns';

/** Every Widget component takes its size and the Dashboard's column count, and fetches its own data. */
export type WidgetProps = { size: WidgetSize; columns: GridColumns };
