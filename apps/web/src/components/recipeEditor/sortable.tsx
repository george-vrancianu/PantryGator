import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripIcon,
  shadow,
  palette,
  usePrefersReducedMotion,
} from '@pocket-pantry/ui';
import { createPortal } from 'react-dom';
import {
  createContext,
  useContext,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEventHandler,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
  type TouchEventHandler,
} from 'react';
import { useTranslation } from 'react-i18next';
import { haptic } from '../../lib/haptic';

/** How long a row is held before it lifts. */
export const HOLD_MS = 500;
/** How far (px) a held pointer may drift before the hold is cancelled. */
export const HOLD_TOLERANCE = 8;

const GRIP_ATTR = 'data-sortable-grip';
const CONTROLS = 'input, select, textarea, button, [role="button"]';

const onGrip = (target: EventTarget | null) =>
  target instanceof Element && target.closest(`[${GRIP_ATTR}]`) !== null;
const onControl = (target: EventTarget | null) =>
  target instanceof Element && target.closest(CONTROLS) !== null;

type Handler = (typeof PointerSensor.activators)[number]['handler'];

const activator =
  (accepts: (target: EventTarget | null) => boolean): Handler =>
  ({ nativeEvent: event }, { onActivation }) => {
    if (!event.isPrimary || event.button !== 0) return false;
    // A touch hold goes through HoldTouchSensor; only the grip stays here.
    if (event.pointerType === 'touch' && !onGrip(event.target)) return false;
    if (!accepts(event.target)) return false;
    onActivation?.({ event });
    return true;
  };

/**
 * Starts on a held row, never on a control inside it. The grip is the one
 * control that starts, and it skips the hold (see `bypassActivationConstraint`).
 * One sensor does both: dnd-kit keeps only one pointer-down handler.
 */
class HoldSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: activator((t) => onGrip(t) || !onControl(t)),
    },
  ];
}

/**
 * Touch hold. A pointer drag started by touch is cancelled by the browser's
 * first pan (touch-action is fixed at touch start), so touch uses touch events,
 * whose non-passive touchmove lets a lifted row stop the page scrolling.
 * The grip is left to HoldSensor.
 */
class HoldTouchSensor extends TouchSensor {
  static activators = [
    {
      eventName: 'onTouchStart' as const,
      handler: (({ nativeEvent: event }, { onActivation }) => {
        if (event.touches.length > 1) return false;
        if (onGrip(event.target) || onControl(event.target)) return false;
        onActivation?.({ event });
        return true;
      }) as (typeof TouchSensor.activators)[number]['handler'],
    },
  ];
}

type Ctx = { describedBy: string };
const SortableCtx = createContext<Ctx>({ describedBy: '' });

type ListProps = {
  /** Keys of the rows, in order. */
  keys: number[];
  /** What a row is called when announced. */
  nameOf: (key: number) => string;
  /** Called with the old and new index after a drop. */
  onReorder: (from: number, to: number) => void;
  /** A row was lifted (a keyboard pick-up counts). */
  onLift?: (key: number) => void;
  children: ReactNode;
};

/** Reorders its rows by hold, grip drag or keyboard; rows use `useSortableRow`. */
export function SortableList({
  keys,
  nameOf,
  onReorder,
  onLift,
  children,
}: ListProps) {
  const { t } = useTranslation('admin');
  const hintId = useId();
  const dndId = useId();
  const sensors = useSensors(
    useSensor(HoldSensor, {
      activationConstraint: { delay: HOLD_MS, tolerance: HOLD_TOLERANCE },
      bypassActivationConstraint: ({ event }) => onGrip(event.target),
    }),
    useSensor(HoldTouchSensor, {
      activationConstraint: { delay: HOLD_MS, tolerance: HOLD_TOLERANCE },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const position = (id: string | number) => keys.indexOf(Number(id)) + 1;
  const name = (id: string | number) => nameOf(Number(id));

  const onDragStart = ({ active }: DragStartEvent) => {
    haptic(10);
    onLift?.(Number(active.id));
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onReorder(keys.indexOf(Number(active.id)), keys.indexOf(Number(over.id)));
  };

  return (
    <SortableCtx.Provider value={{ describedBy: hintId }}>
      {createPortal(
        <span id={hintId} hidden>
          {t('recipe.reorder.hold')}
        </span>,
        document.body,
      )}
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragOver={({ active, over }) => {
          if (over && over.id !== active.id) haptic(6);
        }}
        onDragEnd={onDragEnd}
        accessibility={{
          screenReaderInstructions: {
            draggable: t('recipe.reorder.instructions'),
          },
          announcements: {
            onDragStart: ({ active }) =>
              t('recipe.reorder.pickedUp', { name: name(active.id) }),
            onDragOver: ({ active, over }) =>
              over
                ? t('recipe.reorder.movedTo', {
                    name: name(active.id),
                    position: position(over.id),
                    total: keys.length,
                  })
                : undefined,
            onDragEnd: ({ active, over }) =>
              over
                ? t('recipe.reorder.dropped', {
                    name: name(active.id),
                    position: position(over.id),
                    total: keys.length,
                  })
                : undefined,
            onDragCancel: () => t('recipe.reorder.cancelled'),
          },
        }}
      >
        <SortableContext items={keys} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>
      </DndContext>
    </SortableCtx.Provider>
  );
}

/** Props to spread on a row element and its grip. */
export function useSortableRow(key: number, gripLabel: string) {
  const { describedBy } = useContext(SortableCtx);
  const reduceMotion = usePrefersReducedMotion();
  const { t } = useTranslation('admin');
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: key,
    attributes: { roleDescription: t('recipe.reorder.roleDescription') },
  });
  const [holding, setHolding] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  const stop = () => {
    start.current = null;
    setHolding(false);
  };
  const row = {
    ref: setNodeRef as Ref<HTMLLIElement>,
    'aria-describedby': describedBy,
    'data-lifted': isDragging || undefined,
    style: {
      transform: transform
        ? `${CSS.Translate.toString(transform)}${isDragging ? ' scale(1.02)' : ''}`
        : undefined,
      transition: reduceMotion ? undefined : transition,
      touchAction: isDragging ? 'none' : undefined,
    } as CSSProperties,
    onPointerDown: (event: ReactPointerEvent<HTMLLIElement>) => {
      listeners?.onPointerDown?.(event);
      if (
        event.isPrimary &&
        event.button === 0 &&
        !onGrip(event.target) &&
        !onControl(event.target)
      ) {
        start.current = { x: event.clientX, y: event.clientY };
        setHolding(true);
      }
    },
    onTouchStart: listeners?.onTouchStart as
      TouchEventHandler<HTMLLIElement> | undefined,
    onPointerMove: (event: ReactPointerEvent<HTMLLIElement>) => {
      const from = start.current;
      if (
        from &&
        Math.hypot(event.clientX - from.x, event.clientY - from.y) >
          HOLD_TOLERANCE
      )
        stop();
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onKeyDown: listeners?.onKeyDown as
      KeyboardEventHandler<HTMLLIElement> | undefined,
    sx: {
      position: 'relative' as const,
      zIndex: isDragging ? 1 : 0,
      bgcolor:
        isDragging || holding
          ? palette('pp-accentTint')
          : palette('background-paper'),
      userSelect: 'none' as const,
      WebkitUserSelect: 'none' as const,
      WebkitTouchCallout: 'none' as const,
      '& input, & textarea, & select': {
        userSelect: 'text' as const,
        WebkitUserSelect: 'text' as const,
      },
      transition:
        holding && !isDragging
          ? `background-color ${HOLD_MS}ms linear`
          : undefined,
      boxShadow: isDragging ? shadow.float : undefined,
    },
  };
  const grip = {
    ref: setActivatorNodeRef as Ref<HTMLButtonElement>,
    ...attributes,
    [GRIP_ATTR]: '',
    'aria-label': gripLabel,
    type: 'button' as const,
    sx: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 28,
      minHeight: 40,
      p: 0,
      border: 0,
      bgcolor: 'transparent',
      cursor: isDragging ? 'grabbing' : 'grab',
      touchAction: 'none',
      color: isDragging ? palette('pp-accent') : 'inherit',
      opacity: isDragging ? 1 : 0.55,
    },
  };
  return { row, grip, lifted: isDragging };
}

/** The icon inside a grip button. */
export function GripGlyph() {
  return <GripIcon size={18} aria-hidden />;
}

type Parts = ReturnType<typeof useSortableRow>;

/** One sortable row: calls `children` with the props for the row and its grip. */
export function SortableItem({
  id,
  gripLabel,
  children,
}: {
  id: number;
  gripLabel: string;
  children: (parts: Parts) => ReactNode;
}) {
  return <>{children(useSortableRow(id, gripLabel))}</>;
}
