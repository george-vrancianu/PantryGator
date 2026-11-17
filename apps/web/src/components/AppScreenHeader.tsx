import {
  GatorLogo,
  ScreenHeader,
  type ScreenHeaderProps,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';

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

/** The screen header. Every header without Back starts with the Gator logo, a link to Home (ADR 0042 amendment); it stands in for the old Home button. */
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
  return (
    <ScreenHeader
      title={title}
      subtitle={subtitle}
      subline={subline}
      truncateTitle={truncateTitle}
      leading={
        back ? undefined : <GatorLogo label={t('logo')} href="/" size={38} />
      }
      action={action}
      trailing={trailing}
      titleRef={titleRef}
      back={back}
      onCanopy={onCanopy}
    />
  );
}
