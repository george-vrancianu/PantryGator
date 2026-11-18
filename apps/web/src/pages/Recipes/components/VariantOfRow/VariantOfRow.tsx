import { Typography } from '@pocket-pantry/ui';
import { BoldTitle } from '../BoldTitle/BoldTitle';

/** Make a Variant: the read-only row naming the Catalog Base the Variant branches from. */
export function VariantOfRow({ title }: { title: string }) {
  return (
    <Typography variant="body2">
      <BoldTitle i18nKey="family.variantOf" title={title} />
    </Typography>
  );
}
