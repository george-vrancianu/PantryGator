/**
 * PROTOTYPE variant A, "One page form": every option is visible at once, top to bottom (Wish, Start from,
 * Must-use chips grouped by Aisle, Skip switch), a sticky Ask button above the Dock, Ideas below.
 */
import {
  Box,
  Button,
  Chip,
  TextField,
  Toggle,
  Typography,
  aboveDock,
  DOCK_HEIGHT,
  tokens,
} from '@pocket-pantry/ui';
import { useEffect, useRef } from 'react';
import { IdeasBlock, Price } from './IdeaBits';
import {
  ROUND_PRICE,
  WISH_MAX,
  groupByAisle,
  type IdeasPrototype,
} from './ideasPrototypeModel';

export const variantAName = 'One page form';

function Label({ children, end }: { children: string; end?: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        mb: 0.75,
      }}
    >
      <Typography
        component="h2"
        sx={{
          m: 0,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: tokens.color.muted,
        }}
      >
        {children}
      </Typography>
      {end}
    </Box>
  );
}

export function VariantA({ s }: { s: IdeasPrototype }) {
  const ideasRef = useRef<HTMLDivElement>(null);
  const expiring = s.items.filter((i) => i.expiringSoon);
  const groups = groupByAisle(s.items.filter((i) => !i.expiringSoon));
  useEffect(() => {
    if (s.round === 'thinking')
      ideasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [s.round]);

  const chip = (item: (typeof s.items)[number]) => (
    <Chip
      key={item.key}
      label={item.name}
      selected={s.selected.has(item.key)}
      onClick={() => s.toggle(item.key)}
      meta={
        item.expiringSoon && item.daysLeft !== null
          ? `${item.daysLeft}d`
          : undefined
      }
    />
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pb: 12 }}>
      <section>
        <Label
          end={
            <Typography sx={{ fontSize: 12, color: tokens.color.muted }}>
              {s.wish.length}/{WISH_MAX}
            </Typography>
          }
        >
          Anything in mind? (optional)
        </Label>
        <TextField
          fullWidth
          multiline
          minRows={1}
          maxRows={3}
          placeholder="e.g. vegetarian, no oven, ready in 20 min"
          value={s.wish}
          onChange={(e) => s.setWish(e.target.value)}
        />
      </section>

      <section>
        <Label>Start from a Recipe (optional)</Label>
        <TextField
          select
          fullWidth
          slotProps={{ select: { native: true } }}
          value={s.base?.id ?? ''}
          onChange={(e) => s.setBaseId(e.target.value || null)}
        >
          <option value="">Nothing, something new</option>
          {s.startingPoints.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
              {r.owner === 'catalog' ? '' : ' (yours)'}
            </option>
          ))}
        </TextField>
        {s.base ? (
          <Typography sx={{ fontSize: 13, color: tokens.color.muted, mt: 0.5 }}>
            Ideas will be new takes on {s.base.title}, saved as Variants.
          </Typography>
        ) : null}
      </section>

      <section>
        <Label
          end={
            s.selected.size > 0 ? (
              <Button size="sm" variant="ghost" onClick={s.clearSelection}>
                Clear ({s.selected.size})
              </Button>
            ) : undefined
          }
        >
          Must use
        </Label>
        <Typography sx={{ fontSize: 13, color: tokens.color.muted, mb: 1 }}>
          {s.selected.size === 0
            ? `None picked: Gator can use anything in your Pantry (${s.items.length}).`
            : `Every Idea will use all ${s.selected.size} picked, plus anything else it likes.`}
        </Typography>
        {expiring.length > 0 ? (
          <Box sx={{ mb: 1.5 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 0.5,
              }}
            >
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: tokens.color.soonFg,
                }}
              >
                Expiring soon
              </Typography>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => s.selectAll(expiring.map((i) => i.key))}
              >
                Pick all
              </Button>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {expiring.map(chip)}
            </Box>
          </Box>
        ) : null}
        {groups.map((group) => (
          <Box key={group.name} sx={{ mb: 1.5 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 0.5 }}>
              {group.name}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {group.items.map(chip)}
            </Box>
          </Box>
        ))}
      </section>

      <Box
        component="section"
        sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}
      >
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 700 }}>
            Skip what I already have
          </Typography>
          <Typography sx={{ fontSize: 13, color: tokens.color.muted }}>
            No Ideas for Recipes you can already make.
          </Typography>
        </Box>
        <Toggle
          checked={s.skipOwn}
          onChange={s.setSkipOwn}
          aria-label="Skip what I already have"
        />
      </Box>

      <Box ref={ideasRef} sx={{ scrollMarginTop: 80 }}>
        {s.round !== 'idle' || s.ideas.length > 0 ? (
          <>
            <Label>Ideas</Label>
            <IdeasBlock s={s} />
          </>
        ) : null}
      </Box>

      {s.ideas.length === 0 || s.changedSinceAsk ? (
        <Box
          sx={{
            position: 'fixed',
            left: 16,
            right: 16,
            bottom: aboveDock(DOCK_HEIGHT.xs),
            zIndex: 10,
          }}
        >
          <Button
            fullWidth
            disabled={s.round === 'thinking' || s.items.length === 0}
            onClick={s.ask}
          >
            {s.changedSinceAsk ? 'Ask again' : 'Get Ideas'}{' '}
            <Price n={ROUND_PRICE} />
          </Button>
        </Box>
      ) : null}
    </Box>
  );
}
