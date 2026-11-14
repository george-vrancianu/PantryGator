/**
 * PROTOTYPE variant B, "Ask Gator": results first. Gator speaks at the top, the Ideas fill the page, and a
 * composer pinned above the Dock holds the Wish and Ask. The other options shrink to three summary chips,
 * all on (checked) by default: Whole Pantry and New recipe open a Sheet, Something new toggles in place.
 */
import {
  Box,
  Button,
  Checkbox,
  CheckIcon,
  Chip,
  Gator,
  Sheet,
  TextField,
  Typography,
  aboveDock,
  DOCK_HEIGHT,
  tokens,
} from '@pocket-pantry/ui';
import { useState } from 'react';
import { IdeasBlock, Price } from './IdeaBits';
import {
  ROUND_PRICE,
  WISH_MAX,
  type IdeasPrototype,
} from './ideasPrototypeModel';

export const variantBName = 'Ask Gator (composer)';

type Open = null | 'ingredients' | 'base';

export function VariantB({ s }: { s: IdeasPrototype }) {
  const [open, setOpen] = useState<Open>(null);
  const [filter, setFilter] = useState('');
  const sorted = [...s.items].sort(
    (a, b) =>
      Number(b.expiringSoon) - Number(a.expiringSoon) ||
      a.name.localeCompare(b.name),
  );
  const shown = sorted.filter((i) =>
    i.name.toLowerCase().includes(filter.toLowerCase()),
  );

  const say =
    s.round === 'thinking'
      ? 'Hmm, let me look in your Pantry…'
      : s.ideas.length > 0
        ? s.base
          ? `Here are some new takes on ${s.base.title}. Pick one and I’ll write it up.`
          : 'Here’s what your Pantry could make. Pick one and I’ll write it up.'
        : s.base
          ? `Want a new take on ${s.base.title}? Tell me what you fancy, or just ask.`
          : `I can cook up Ideas from your Pantry (${s.items.length} Ingredients). Tell me what you fancy, or just ask.`;

  return (
    <Box sx={{ pb: 26 }}>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-end', mb: 2 }}>
        <Gator
          decorative
          mood={s.round === 'thinking' ? 'thinking' : 'chef'}
          size={72}
          loop="idle"
        />
        <Box
          sx={{
            flex: 1,
            bgcolor: tokens.color.accentTint,
            color: tokens.color.accentOnTint,
            borderRadius: '16px 16px 16px 4px',
            px: 1.5,
            py: 1.25,
            fontSize: 15,
          }}
        >
          {say}
        </Box>
      </Box>

      {s.round === 'thinking' && s.ideas.length === 0 ? null : (
        <IdeasBlock s={s} />
      )}

      <Box
        sx={{
          position: 'fixed',
          left: 8,
          right: 8,
          bottom: aboveDock(DOCK_HEIGHT.xs),
          zIndex: 10,
          bgcolor: tokens.color.surface,
          border: `1px solid ${tokens.color.line}`,
          borderRadius: '20px',
          boxShadow: '0 8px 24px rgba(0,0,0,.12)',
          p: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
        }}
      >
        <Box sx={{ display: 'flex', gap: 0.75, overflowX: 'auto', pb: 0.25 }}>
          {/* A chip is on (selected, with a check) in its default state; changing it drops the check. */}
          <Chip
            label={
              s.selected.size === 0
                ? 'Whole Pantry'
                : `Must use ${s.selected.size}`
            }
            icon={s.selected.size === 0 ? <CheckIcon size={16} /> : undefined}
            selected={s.selected.size === 0}
            onClick={() => setOpen('ingredients')}
          />
          <Chip
            label={s.base ? `From: ${s.base.title}` : 'New recipe'}
            icon={s.base ? undefined : <CheckIcon size={16} />}
            selected={s.base === null}
            onClick={() => setOpen('base')}
          />
          <Chip
            label="Something new"
            icon={s.skipOwn ? <CheckIcon size={16} /> : undefined}
            selected={s.skipOwn}
            aria-pressed={s.skipOwn}
            title="Leave out Recipes your Family already has or can already make"
            onClick={() => s.setSkipOwn(!s.skipOwn)}
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
          <TextField
            fullWidth
            multiline
            maxRows={3}
            size="small"
            placeholder="Anything in mind? e.g. no oven"
            value={s.wish}
            onChange={(e) => s.setWish(e.target.value)}
            helperText={
              s.wish.length > 0 ? `${s.wish.length}/${WISH_MAX}` : undefined
            }
          />
          <Button
            disabled={s.round === 'thinking' || s.items.length === 0}
            onClick={s.ideas.length > 0 && !s.changedSinceAsk ? s.more : s.ask}
            sx={{ flexShrink: 0 }}
          >
            {s.ideas.length > 0 && !s.changedSinceAsk ? 'More' : 'Ask'}{' '}
            <Price n={ROUND_PRICE} />
          </Button>
        </Box>
      </Box>

      <Sheet
        open={open === 'ingredients'}
        onClose={() => setOpen(null)}
        label="Must use"
        size="tall"
        header={
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 18 }}>
              Must use
            </Typography>
            <Typography sx={{ fontSize: 13, color: tokens.color.muted }}>
              Pick none and Gator can use anything. Every Idea uses all you
              pick.
            </Typography>
            <TextField
              size="small"
              placeholder="Search your Pantry"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </Box>
        }
        footer={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="ghost" onClick={s.clearSelection}>
              Clear
            </Button>
            <Button fullWidth onClick={() => setOpen(null)}>
              {s.selected.size === 0
                ? 'Use whole Pantry'
                : `Use ${s.selected.size}`}
            </Button>
          </Box>
        }
      >
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {shown.map((item) => (
            <Box
              key={item.key}
              sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.25 }}
            >
              <Box sx={{ flex: 1 }}>
                <Checkbox
                  label={item.name}
                  checked={s.selected.has(item.key)}
                  onChange={() => s.toggle(item.key)}
                />
              </Box>
              {item.expiringSoon ? (
                <Typography
                  sx={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: tokens.color.soonFg,
                  }}
                >
                  {item.daysLeft === 0 ? 'today' : `${item.daysLeft}d left`}
                </Typography>
              ) : null}
            </Box>
          ))}
        </Box>
      </Sheet>

      <Sheet
        open={open === 'base'}
        onClose={() => setOpen(null)}
        label="Start from"
        size="tall"
        header={
          <Typography sx={{ fontWeight: 700, fontSize: 18 }}>
            Start from a Recipe
          </Typography>
        }
      >
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {[
            {
              id: '',
              title: 'New recipe',
              owner: 'catalog' as const,
            },
            ...s.startingPoints,
          ].map((r) => (
            <Box
              key={r.id || 'none'}
              component="button"
              type="button"
              onClick={() => {
                s.setBaseId(r.id || null);
                setOpen(null);
              }}
              sx={{
                all: 'unset',
                cursor: 'pointer',
                py: 1.25,
                borderBottom: `1px solid ${tokens.color.line}`,
                fontWeight: (s.base?.id ?? '') === r.id ? 700 : 400,
              }}
            >
              {(s.base?.id ?? '') === r.id ? '✓ ' : ''}
              {r.title}
            </Box>
          ))}
        </Box>
      </Sheet>
    </Box>
  );
}
