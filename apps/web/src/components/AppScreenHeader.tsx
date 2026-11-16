import { ScreenHeader, type ScreenHeaderProps } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { dockStateFor } from '../lib/dockState';
import { useOptionalRefreshScreen } from '../lib/refresh';
import { RefreshMark } from './RefreshMark';

/** Dock tabs whose root screen carries the refresh mark: Home (`''`, the path minus its slash), Pantry, Shopping, Recipes. */
const REFRESH_ROOTS = ['', '/pantry', '/shopping', '/recipes'];

type Props = Pick<
  ScreenHeaderProps,
  | 'title'
  | 'subtitle'
  | 'subline'
  | 'truncateTitle'
  | 'action'
  | 'trailing'
  | 'titleRef'
  | 'back'
  | 'onCanopy'
>;

/** The screen header; Home shows only where the Dock is hidden, since the Dock carries Home everywhere else. */
export function AppScreenHeader({
  title,
  subtitle,
  subline,
  truncateTitle,
  action,
  trailing,
  titleRef,
  back,
  onCanopy,
}: Props) {
  const { t } = useTranslation('screenHeader');
  const { pathname } = useLocation();
  const inLayout = useOptionalRefreshScreen() !== undefined;
  const tabRoot =
    inLayout && REFRESH_ROOTS.includes(pathname.replace(/\/$/, ''));
  return (
    <ScreenHeader
      title={title}
      leading={tabRoot ? <RefreshMark size={42} /> : undefined}
      subtitle={subtitle}
      // A tab root keeps a one-line title, level with the mark: no subline there.
      subline={tabRoot ? undefined : subline}
      // With the mark, the Explore pill and the action in one row, a long title would break mid-word at 360 px.
      truncateTitle={tabRoot || truncateTitle}
      home={dockStateFor(pathname).visible ? undefined : { label: t('home') }}
      action={action}
      trailing={trailing}
      titleRef={titleRef}
      back={back}
      onCanopy={onCanopy}
    />
  );
}
