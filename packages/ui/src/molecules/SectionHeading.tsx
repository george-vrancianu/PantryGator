import type { ReactNode } from 'react';
import { Box } from '../atoms/Layout';
import { InfoIcon, PhoneIcon, UserIcon } from '../atoms/icons';
import { Typography } from '../atoms/Typography';

export type Scope = 'device' | 'you' | 'admins';

const SCOPE_ICON = {
  device: PhoneIcon,
  you: UserIcon,
  admins: InfoIcon,
} as const;

/** Who a section's change reaches: "This phone", "Only you" or "Admins". */
export function ScopeCaption({
  scope,
  label,
}: {
  scope: Scope;
  label: string;
}) {
  const Icon = SCOPE_ICON[scope];
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        fontSize: 11.5,
        fontWeight: 600,
        color: 'text.secondary',
        whiteSpace: 'nowrap',
      }}
    >
      <Icon size={13} />
      {label}
    </Box>
  );
}

/** A section's label row (12/700 caps) with an optional scope caption on the right. */
export function SectionHeading({
  id,
  title,
  scope,
}: {
  id: string;
  title: string;
  scope?: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1,
        px: 0.5,
      }}
    >
      <Typography
        id={id}
        variant="sectionLabel"
        component="h2"
        color="text.secondary"
      >
        {title}
      </Typography>
      {scope}
    </Box>
  );
}
