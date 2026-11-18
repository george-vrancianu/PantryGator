import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Alert,
  Box,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  GripIcon,
  IconButton,
  MinusIcon,
  PlusIcon,
  Spinner,
  Typography,
  tokens,
  usePrefersReducedMotion,
  visuallyHidden,
  border,
  radius,
} from '@pocket-pantry/ui';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../components/layout/Screen';
import { translateApiError } from '../../i18n/translateApiError';
import {
  useDashboardLayout,
  WIDGET_SIZES,
  type WidgetInstance,
  type WidgetSize,
} from '../../lib/dashboard';
import {
  addWidget,
  availableWidgetTypes,
  moveWidget,
  newWidgetId,
  nextSize,
  removeWidget,
  resizeWidget,
  useEditDashboardLayout,
} from '../../lib/dashboardLayout';
import {
  sizesAvailableAt,
  useGridColumns,
  widgetSpan,
} from '../../lib/layoutColumns';
import { WIDGET_CATALOG } from '@/components/dashboard/widgetCatalog';
import { WidgetPreview } from './WidgetPreview';

const FOCUS_RING = {
  '&:focus-visible': {
    outline: `3px solid ${tokens.color.accent}`,
    outlineOffset: 2,
  },
};

type RowProps = {
  widget: WidgetInstance;
  index: number;
  total: number;
  onMove: (to: number) => void;
  onResize: (size: WidgetSize) => void;
  onRemove: () => void;
};

function WidgetRow({
  widget,
  index,
  total,
  onMove,
  onResize,
  onRemove,
}: RowProps) {
  const { t } = useTranslation(['customise', 'dashboard']);
  const reduceMotion = usePrefersReducedMotion();
  const definition = WIDGET_CATALOG[widget.type] as
    (typeof WIDGET_CATALOG)[typeof widget.type] | undefined;
  const name = definition
    ? t(definition.nameKey, { ns: 'dashboard' })
    : widget.type;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });
  const columns = useGridColumns();
  const sizes =
    (
      WIDGET_SIZES[widget.type] as
        (typeof WIDGET_SIZES)[typeof widget.type] | undefined
    )?.sizes ?? [];
  const nextOne = nextSize(
    sizes,
    sizesAvailableAt(sizes, columns),
    widget.size,
  );
  const canResize = nextOne !== widget.size;
  const current = t(`size.${widget.size}`);
  const Icon = definition?.icon;

  return (
    <Box
      component="li"
      ref={setNodeRef}
      aria-label={name}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: reduceMotion ? undefined : transition,
      }}
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: '4px',
        minHeight: 58,
        borderTop: `1px solid ${tokens.color.divider}`,
        bgcolor: isDragging ? tokens.color.accentTint : tokens.color.surface,
        position: 'relative',
        zIndex: isDragging ? 1 : 0,
        '&:first-of-type': { borderTop: 0 },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          flex: '1 1 140px',
          minWidth: 0,
        }}
      >
        <IconButton
          ref={setActivatorNodeRef}
          data-handle={widget.id}
          {...attributes}
          {...listeners}
          label={t('reorder', { name })}
          tone="plain"
          style={{ touchAction: 'none', cursor: 'grab' }}
        >
          <GripIcon size={18} />
        </IconButton>
        {Icon ? (
          <Box
            data-testid="widget-icon"
            sx={{
              display: 'flex',
              flexShrink: 0,
              color: tokens.color.accent,
            }}
          >
            <Icon size={20} />
          </Box>
        ) : null}
        <Typography
          component="span"
          sx={{ flexGrow: 1, minWidth: 0, fontSize: 15, fontWeight: 600 }}
        >
          {name}
        </Typography>
      </Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          ml: 'auto',
        }}
      >
        <IconButton
          label={t('moveUp', { name })}
          tone="plain"
          ariaDisabled={index === 0}
          onClick={() => onMove(index - 1)}
        >
          <ChevronUpIcon size={18} />
        </IconButton>
        <IconButton
          label={t('moveDown', { name })}
          tone="plain"
          ariaDisabled={index === total - 1}
          onClick={() => onMove(index + 1)}
        >
          <ChevronDownIcon size={18} />
        </IconButton>
        {/* A Widget that comes in one size has nothing to toggle. */}
        {sizes.length > 1 ? (
          <Box
            component="button"
            type="button"
            aria-disabled={canResize ? undefined : true}
            aria-label={
              canResize
                ? t('sizeToggle', {
                    name,
                    current,
                    next: t(`size.${nextOne}`),
                  })
                : t('sizeLocked', { name, current })
            }
            onClick={canResize ? () => onResize(nextOne) : undefined}
            sx={{
              flexShrink: 0,
              minWidth: 44,
              height: 44,
              px: '12px',
              borderRadius: radius.control,
              border: `${border.width} solid ${tokens.color.line}`,
              bgcolor: tokens.color.subtle,
              color: canResize ? tokens.color.ink : tokens.color.muted,
              fontFamily: 'inherit',
              fontSize: 12,
              fontWeight: 600,
              cursor: canResize ? 'pointer' : 'default',
              opacity: canResize ? 1 : 0.6,
              ...FOCUS_RING,
            }}
          >
            {current}
          </Box>
        ) : null}
        <IconButton
          label={t('remove', { name })}
          tone="urgent"
          onClick={onRemove}
        >
          <MinusIcon size={18} />
        </IconButton>
      </Box>
    </Box>
  );
}

/** The customise screen: reorder, resize and remove Widgets, and add the types not yet on the Dashboard. */
export function CustomisePage() {
  const { t } = useTranslation(['customise', 'dashboard']);
  const layout = useDashboardLayout();
  const editor = useEditDashboardLayout();
  const columns = useGridColumns();
  const [status, setStatus] = useState('');
  const [focus, setFocus] = useState<
    | { kind: 'row'; id: string; index?: number }
    | { kind: 'removed'; id: string; index: number }
    | null
  >(null);
  const listRef = useRef<HTMLUListElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Adding or removing unmounts the focused control, so hand focus to a sensible neighbour.
  useEffect(() => {
    if (!focus || !layout.data) return;
    const ids = layout.data.widgets.map((w) => w.id);
    // The edit applies a moment after the click, so keep waiting until it has:
    // focusing a row before React reorders it would lose focus again.
    const pending =
      focus.kind === 'row'
        ? focus.index === undefined
          ? !ids.includes(focus.id)
          : ids.includes(focus.id) && ids.indexOf(focus.id) !== focus.index
        : ids.includes(focus.id);
    if (pending) return;
    const target =
      focus.kind === 'row'
        ? focus.id
        : ids[Math.min(focus.index, ids.length - 1)];
    const handle = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[data-handle]') ?? [],
    ).find((candidate) => candidate.dataset.handle === target);
    (handle ?? headingRef.current)?.focus();
    // oxlint-disable-next-line react/set-state-in-effect -- one-shot focus request: cleared once the row is focused
    setFocus(null);
  }, [focus, layout.data]);

  if (layout.isPending) {
    return (
      <Screen title={t('title')}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <Spinner label={t('common:loading')} />
        </Box>
      </Screen>
    );
  }
  if (layout.error) {
    return (
      <Screen title={t('title')}>
        <Alert severity="error">{translateApiError(t, layout.error)}</Alert>
      </Screen>
    );
  }

  const widgets = layout.data.widgets;
  const nameOf = (widget: Pick<WidgetInstance, 'type'>) => {
    const definition = WIDGET_CATALOG[widget.type] as
      (typeof WIDGET_CATALOG)[typeof widget.type] | undefined;
    return definition
      ? t(definition.nameKey, { ns: 'dashboard' })
      : widget.type;
  };
  const nameById = (id: UniqueIdentifier) => {
    const widget = widgets.find((w) => w.id === id);
    return widget ? nameOf(widget) : '';
  };
  const position = (id: UniqueIdentifier | undefined) =>
    widgets.findIndex((w) => w.id === id) + 1;

  const move = (id: string, to: number) => {
    editor.edit((current) => moveWidget(current, id, to));
    setStatus(
      t('announce.movedTo', {
        name: nameById(id),
        position: to + 1,
        total: widgets.length,
      }),
    );
    setFocus({
      kind: 'row',
      id,
      index: Math.max(0, Math.min(to, widgets.length - 1)),
    });
  };
  const remove = (id: string, index: number) => {
    setStatus(t('announce.removed', { name: nameById(id) }));
    editor.edit((current) => removeWidget(current, id));
    setFocus({ kind: 'removed', id, index });
  };
  const resize = (widget: WidgetInstance, size: WidgetSize) => {
    editor.edit((current) => resizeWidget(current, widget.id, size));
    setStatus(
      t('announce.resized', {
        name: nameOf(widget),
        size: t(`size.${size}`),
      }),
    );
  };
  const add = (type: WidgetInstance['type']) => {
    const id = newWidgetId();
    editor.edit((current) => addWidget(current, type, () => id));
    setStatus(t('announce.added', { name: nameOf({ type }) }));
    setFocus({ kind: 'row', id });
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const to = widgets.findIndex((w) => w.id === over.id);
    editor.edit((current) =>
      arrayMove(
        current,
        current.findIndex((w) => w.id === active.id),
        to,
      ),
    );
    setFocus({ kind: 'row', id: String(active.id), index: to });
  };

  const available = availableWidgetTypes(widgets);

  return (
    <Screen
      title={t('title')}
      back={{ label: t('screenHeader:back'), href: '/' }}
      primary={{ label: t('done'), icon: <CheckIcon size={20} />, href: '/' }}
    >
      <Typography variant="meta" color="text.secondary" sx={{ mb: '16px' }}>
        {t('hint')}
      </Typography>

      {editor.error ? (
        <Box sx={{ mb: 1 }}>
          <Alert severity="error">{translateApiError(t, editor.error)}</Alert>
        </Box>
      ) : null}

      <Typography
        id="customise-on-dashboard"
        component="h2"
        ref={headingRef}
        tabIndex={-1}
        sx={{
          mb: '8px',
          fontSize: 12,
          fontWeight: 700,
          color: tokens.color.muted,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          '&:focus-visible': { outline: `3px solid ${tokens.color.accent}` },
        }}
      >
        {t('onDashboard')}
      </Typography>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{
          screenReaderInstructions: { draggable: t('dragInstructions') },
          announcements: {
            onDragStart: ({ active }) =>
              t('announce.pickedUp', { name: nameById(active.id) }),
            onDragOver: ({ active, over }) =>
              over
                ? t('announce.movedTo', {
                    name: nameById(active.id),
                    position: position(over.id),
                    total: widgets.length,
                  })
                : undefined,
            onDragEnd: ({ active, over }) =>
              over
                ? t('announce.dropped', {
                    name: nameById(active.id),
                    position: position(over.id),
                    total: widgets.length,
                  })
                : undefined,
            onDragCancel: () => t('announce.cancelled'),
          },
        }}
      >
        <SortableContext
          items={widgets.map((w) => w.id)}
          strategy={verticalListSortingStrategy}
        >
          <Box
            component="ul"
            ref={listRef}
            aria-labelledby="customise-on-dashboard"
            sx={{
              listStyle: 'none',
              m: 0,
              p: '0 10px',
              bgcolor: tokens.color.surface,
              border: `1px solid ${tokens.color.line}`,
              borderRadius: radius.card,
              overflow: 'hidden',
            }}
          >
            {widgets.map((widget, index) => (
              <WidgetRow
                key={widget.id}
                widget={widget}
                index={index}
                total={widgets.length}
                onMove={(to) => move(widget.id, to)}
                onResize={(size) => resize(widget, size)}
                onRemove={() => remove(widget.id, index)}
              />
            ))}
          </Box>
        </SortableContext>
      </DndContext>
      {widgets.length === 0 ? (
        <Typography variant="meta" color="text.secondary" sx={{ mt: 1 }}>
          {t('emptyList')}
        </Typography>
      ) : null}

      <Box
        component="section"
        aria-labelledby="customise-add"
        sx={{ mt: '22px', pb: 3 }}
      >
        <Typography
          id="customise-add"
          component="h2"
          sx={{
            mb: '8px',
            fontSize: 12,
            fontWeight: 700,
            color: tokens.color.muted,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {t('addWidgets')}
        </Typography>
        {available.length === 0 ? (
          <Typography variant="meta" color="text.secondary">
            {t('allAdded')}
          </Typography>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gap: '12px',
            }}
          >
            {available.map((type) => {
              const name = nameOf({ type });
              return (
                <Box
                  key={type}
                  sx={{
                    gridColumn: `span ${widgetSpan(WIDGET_SIZES[type].defaultSize, columns).columns}`,
                    bgcolor: tokens.color.surface,
                    border: `1px solid ${tokens.color.line}`,
                    borderRadius: radius.card,
                    p: '10px',
                  }}
                >
                  <WidgetPreview type={type} />
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      mt: '8px',
                      gap: '4px',
                    }}
                  >
                    <Typography
                      component="span"
                      sx={{ fontSize: 14, fontWeight: 700, pl: '4px' }}
                    >
                      {name}
                    </Typography>
                    <IconButton
                      label={t('add', { name })}
                      tone="accent"
                      onClick={() => add(type)}
                    >
                      <PlusIcon size={18} />
                    </IconButton>
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
      <Box role="status" sx={visuallyHidden}>
        {status}
      </Box>
    </Screen>
  );
}
