/**
 * PROTOTYPE variant C, "Pantry checklist": the page reads like the Pantry itself. A compact options card
 * (Start from, Skip, Wish behind "Add a wish"), then every Ingredient as a row with icon, expiry and a tick
 * box (Expiring Soon section first, then by Aisle). Once Ideas arrive, a segmented control flips between
 * "Ingredients" and "Ideas". A bottom bar says what will be sent.
 */
import {
  Box,
  Button,
  IngredientIcon,
  SegmentedControl,
  TextField,
  Toggle,
  Typography,
  aboveDock,
  DOCK_HEIGHT,
  tokens,
} from '@pocket-pantry/ui';
import { useState } from 'react';
import { IdeasBlock, Price, Thinking } from './IdeaBits';
import {
  ROUND_PRICE,
  WISH_MAX,
  groupByAisle,
  type IdeasPrototype,
  type PantryIngredient,
} from './ideasPrototypeModel';

export const variantCName = 'Pantry checklist + tabs';

type Tab = 'ingredients' | 'ideas';

function Row({ item, s }: { item: PantryIngredient; s: IdeasPrototype }) {
  const checked = s.selected.has(item.key);
  return (
    <Box
      component="label"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        py: 1,
        px: 1,
        borderRadius: '10px',
        cursor: 'pointer',
        bgcolor: checked
          ? tokens.color.accentTint
          : item.expiringSoon
            ? tokens.color.soonRow
            : 'transparent',
      }}
    >
      <IngredientIcon
        ingredientId={item.ingredientId}
        aisleId={item.aisleId}
        size={32}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600 }}>{item.name}</Typography>
        {item.daysLeft !== null ? (
          <Typography
            sx={{
              fontSize: 12,
              color: item.expiringSoon
                ? tokens.color.soonFg
                : tokens.color.muted,
            }}
          >
            {item.daysLeft === 0
              ? 'expires today'
              : `${item.daysLeft} days left`}
          </Typography>
        ) : null}
      </Box>
      <input
        type="checkbox"
        checked={checked}
        onChange={() => s.toggle(item.key)}
        style={{ width: 22, height: 22 }}
      />
    </Box>
  );
}

function Section({
  title,
  items,
  s,
  tone,
}: {
  title: string;
  items: PantryIngredient[];
  s: IdeasPrototype;
  tone?: 'soon';
}) {
  if (items.length === 0) return null;
  const allPicked = items.every((i) => s.selected.has(i.key));
  return (
    <Box component="section" sx={{ mb: 1.5 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          px: 1,
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
            color: tone === 'soon' ? tokens.color.soonFg : tokens.color.muted,
          }}
        >
          {title} · {items.length}
        </Typography>
        {!allPicked ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => s.selectAll(items.map((i) => i.key))}
          >
            Pick all
          </Button>
        ) : null}
      </Box>
      {items.map((item) => (
        <Row key={item.key} item={item} s={s} />
      ))}
    </Box>
  );
}

export function VariantC({ s }: { s: IdeasPrototype }) {
  const [tab, setTab] = useState<Tab>('ingredients');
  const [wishOpen, setWishOpen] = useState(s.wish.length > 0);
  const hasIdeas = s.ideas.length > 0 || s.round !== 'idle';
  const expiring = s.items.filter((i) => i.expiringSoon);
  const groups = groupByAisle(s.items.filter((i) => !i.expiringSoon));

  return (
    <Box sx={{ pb: 14 }}>
      <Box
        sx={{
          border: `1px solid ${tokens.color.line}`,
          borderRadius: '14px',
          p: 1.25,
          mb: 1.5,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          bgcolor: tokens.color.surface,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography
            sx={{
              fontSize: 14,
              color: tokens.color.muted,
              width: 84,
              flexShrink: 0,
            }}
          >
            Start from
          </Typography>
          <Box
            component="select"
            value={s.base?.id ?? ''}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              s.setBaseId(e.target.value || null)
            }
            sx={{
              flex: 1,
              minWidth: 0,
              fontSize: 15,
              p: 0.75,
              borderRadius: '8px',
              border: `1px solid ${tokens.color.line}`,
              bgcolor: 'transparent',
              color: 'inherit',
            }}
          >
            <option value="">Something new</option>
            {s.startingPoints.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontSize: 14, flex: 1 }}>
            Skip what I already have
          </Typography>
          <Toggle
            checked={s.skipOwn}
            onChange={s.setSkipOwn}
            aria-label="Skip what I already have"
          />
        </Box>
        {wishOpen ? (
          <TextField
            size="small"
            fullWidth
            autoFocus
            placeholder="Anything in mind? e.g. vegetarian"
            value={s.wish}
            onChange={(e) => s.setWish(e.target.value)}
            helperText={`${s.wish.length}/${WISH_MAX}`}
          />
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setWishOpen(true)}
            sx={{ alignSelf: 'flex-start' }}
          >
            + Add a wish
          </Button>
        )}
      </Box>

      {hasIdeas ? (
        <Box sx={{ mb: 1.5 }}>
          <SegmentedControl<Tab>
            label="Show"
            fullWidth
            value={tab}
            onChange={setTab}
            options={[
              {
                value: 'ingredients',
                label: 'Ingredients',
                badge: s.selected.size || undefined,
              },
              {
                value: 'ideas',
                label: 'Ideas',
                badge: s.ideas.length || undefined,
              },
            ]}
          />
        </Box>
      ) : null}

      {tab === 'ingredients' || !hasIdeas ? (
        <>
          <Typography
            sx={{ fontSize: 13, color: tokens.color.muted, px: 1, mb: 1 }}
          >
            Tick what Ideas must use, or tick nothing and Gator uses the whole
            Pantry.
          </Typography>
          <Section title="Expiring soon" items={expiring} s={s} tone="soon" />
          {groups.map((g) => (
            <Section key={g.name} title={g.name} items={g.items} s={s} />
          ))}
        </>
      ) : s.round === 'thinking' && s.ideas.length === 0 ? (
        <Thinking />
      ) : (
        <IdeasBlock s={s} dense />
      )}

      {tab === 'ingredients' || !hasIdeas || s.changedSinceAsk ? (
        <Box
          sx={{
            position: 'fixed',
            left: 8,
            right: 8,
            bottom: aboveDock(DOCK_HEIGHT.xs),
            zIndex: 10,
            bgcolor: tokens.color.surface,
            border: `1px solid ${tokens.color.line}`,
            borderRadius: '16px',
            boxShadow: '0 8px 24px rgba(0,0,0,.12)',
            p: 1,
            pl: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Typography sx={{ flex: 1, fontSize: 13, lineHeight: 1.3 }}>
            {s.selected.size === 0
              ? 'Whole Pantry'
              : `Must use ${s.selected.size}`}
            {s.base ? ` · from ${s.base.title}` : ''}
            {s.wish.trim() ? ' · with a wish' : ''}
          </Typography>
          <Button
            disabled={s.round === 'thinking' || s.items.length === 0}
            onClick={() => {
              s.ask();
              setTab('ideas');
            }}
          >
            {s.changedSinceAsk ? 'Ask again' : 'Get Ideas'}{' '}
            <Price n={ROUND_PRICE} />
          </Button>
        </Box>
      ) : null}
    </Box>
  );
}
