/** PROTOTYPE (throwaway): pieces every variant shares: the Idea card (decided in the Ideas flow ticket), price, thinking state. */
import {
  Box,
  Button,
  CreditIcon,
  Gator,
  Tag,
  Typography,
  WarningIcon,
  tokens,
} from '@pocket-pantry/ui';
import type { Idea, IdeasPrototype } from './ideasPrototypeModel';

export function Price({ n }: { n: number }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.2em',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <CreditIcon size="1.1em" />
      {n}
    </Box>
  );
}

export function IdeaCard({
  idea,
  onWrite,
  dense = false,
}: {
  idea: Idea;
  onWrite: () => void;
  dense?: boolean;
}) {
  return (
    <Box
      component="li"
      sx={{
        listStyle: 'none',
        border: `1px solid ${tokens.color.line}`,
        borderRadius: '14px',
        bgcolor: tokens.color.surface,
        p: dense ? 1.25 : 1.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
        opacity: idea.status === 'drafted' ? 0.7 : 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Typography sx={{ fontWeight: 700, flex: 1, lineHeight: 1.25 }}>
          {idea.title}
        </Typography>
        {idea.allergy ? (
          <Box
            component="span"
            title="Uses an Ingredient with your Allergy"
            sx={{ color: tokens.color.urgentFg }}
          >
            <WarningIcon size={18} />
          </Box>
        ) : null}
      </Box>
      <Typography sx={{ fontSize: 14, color: tokens.color.muted }}>
        {idea.pitch}
      </Typography>
      {idea.usesUp.length > 0 || idea.needs.length > 0 ? (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0.75,
            alignItems: 'center',
          }}
        >
          {idea.usesUp.length > 0 ? (
            <Tag tone="soon">uses up: {idea.usesUp.join(', ')}</Tag>
          ) : null}
          {idea.needs.length > 0 ? (
            <Typography
              component="span"
              sx={{ fontSize: 13, color: tokens.color.muted }}
            >
              needs: {idea.needs.join(', ')}
            </Typography>
          ) : null}
        </Box>
      ) : null}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        {idea.status === 'new' ? (
          <Button size="sm" variant="tonal" onClick={onWrite}>
            Write it <Price n={1} />
          </Button>
        ) : idea.status === 'writing' ? (
          <Typography sx={{ fontSize: 13, color: tokens.color.muted }}>
            Writing…
          </Typography>
        ) : (
          <Typography
            sx={{ fontSize: 13, fontWeight: 700, color: tokens.color.accent }}
          >
            In your Drafts
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export function Thinking({
  label = 'Gator is thinking up Ideas…',
}: {
  label?: string;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        py: 2,
        justifyContent: 'center',
      }}
      role="status"
    >
      <Gator decorative mood="thinking" size={56} loop="idle" />
      <Typography sx={{ color: tokens.color.muted }}>{label}</Typography>
    </Box>
  );
}

/** The list, More ideas and the empty / Start over states, laid out plainly. */
export function IdeasBlock({
  s,
  dense,
}: {
  s: IdeasPrototype;
  dense?: boolean;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {s.emptyRound && s.ideas.length === 0 ? (
        <Typography
          sx={{ color: tokens.color.muted, textAlign: 'center', py: 2 }}
        >
          No Ideas fit your wish, try loosening it. (Nothing was charged.)
        </Typography>
      ) : null}
      <Box
        component="ul"
        sx={{ m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }}
      >
        {s.ideas.map((idea) => (
          <IdeaCard
            key={idea.id}
            idea={idea}
            dense={dense}
            onWrite={() => s.write(idea.id)}
          />
        ))}
      </Box>
      {s.round === 'thinking' ? <Thinking /> : null}
      {s.round === 'done' && s.ideas.length > 0 ? (
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          {s.moreExhausted ? (
            <Typography sx={{ fontSize: 13, color: tokens.color.muted }}>
              That’s every Idea Gator has for this.
            </Typography>
          ) : (
            <Button variant="secondary" size="sm" onClick={s.more}>
              More ideas <Price n={1} />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={s.startOver}>
            Start over
          </Button>
        </Box>
      ) : null}
    </Box>
  );
}
