import {
  Box,
  color,
  displayType,
  radius,
  shadow,
  visuallyHidden,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { localIso } from '@/lib/pantry';

/**
 * Today as a tear-off calendar page beside the Pantry Health lights: the month on an ink band with two binding
 * holes, the day large, the weekday under it, and the edge of the next page peeking below. Screen readers hear
 * the full date once.
 */
export function CalendarDay({ date }: { date: Date }) {
  const { i18n } = useTranslation();
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(i18n.language, options).format(date);
  const hole = {
    position: 'absolute',
    top: '3px',
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    bgcolor: color.cardBg,
    opacity: 0.85,
  } as const;

  return (
    <Box
      component="time"
      dateTime={localIso(date)}
      data-testid="calendar-day"
      sx={{
        position: 'relative',
        flex: 'none',
        display: 'block',
        width: 62,
        mb: '4px',
        // The next page of the pad, just showing under this one.
        '&::before': {
          content: '""',
          position: 'absolute',
          left: '4px',
          right: '4px',
          bottom: '-4px',
          height: '12px',
          borderRadius: radius.btn,
          bgcolor: color.cardBg,
          border: `1px solid ${color.cardLine}`,
          opacity: 0.7,
        },
      }}
    >
      <Box component="span" sx={visuallyHidden}>
        {part({ weekday: 'long', day: 'numeric', month: 'long' })}
      </Box>
      <Box
        component="span"
        aria-hidden="true"
        sx={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          overflow: 'hidden',
          borderRadius: radius.btn,
          bgcolor: color.cardBg,
          border: `1px solid ${color.cardLine}`,
          boxShadow: shadow.card,
          color: 'text.primary',
        }}
      >
        <Box
          component="span"
          sx={{
            position: 'relative',
            alignSelf: 'stretch',
            height: 19,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pt: '3px',
            boxSizing: 'border-box',
            bgcolor: 'text.primary',
            color: color.cardBg,
            fontSize: 10,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          <Box component="span" sx={{ ...hole, left: '9px' }} />
          <Box component="span" sx={{ ...hole, right: '9px' }} />
          <Box component="span" sx={{ pl: '0.14em' }}>
            {part({ month: 'short' }).replace('.', '')}
          </Box>
        </Box>
        <Box
          component="span"
          sx={{
            ...displayType,
            mt: '5px',
            fontSize: 28,
            lineHeight: 1,
            letterSpacing: '-0.04em',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {part({ day: 'numeric' })}
        </Box>
        <Box
          component="span"
          sx={{
            mt: '3px',
            mb: '6px',
            fontSize: 9.5,
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: color.ink2,
          }}
        >
          {part({ weekday: 'short' }).replace('.', '')}
        </Box>
      </Box>
    </Box>
  );
}
