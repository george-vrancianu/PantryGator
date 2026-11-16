import { ScreenHeader, type ScreenHeaderProps } from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { dockStateFor } from '../lib/dockState';

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

/** The screen header; Home shows only where the Dock is hidden, since the Dock carries Home everywhere else. No header carries a logo (ADR 0042). */
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
  return (
    <ScreenHeader
      title={title}
      subtitle={subtitle}
      subline={subline}
      truncateTitle={truncateTitle}
      home={dockStateFor(pathname).visible ? undefined : { label: t('home') }}
      action={action}
      trailing={trailing}
      titleRef={titleRef}
      back={back}
      onCanopy={onCanopy}
    />
  );
}
