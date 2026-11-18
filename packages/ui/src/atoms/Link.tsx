import MuiLink, { type LinkProps as MuiLinkProps } from '@mui/material/Link';
import { palette, shade } from '../theme/themeVars';

export type LinkProps = MuiLinkProps;

export function Link({ sx, ...props }: LinkProps) {
  return (
    <MuiLink
      underline="hover"
      sx={[
        {
          color: palette('pp-accent'),
          fontWeight: 700,
          '&:hover': { color: shade.accentHover },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...props}
    />
  );
}
