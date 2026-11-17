import { Card, Stack, Typography } from '@pocket-pantry/ui';
import { forwardRef, useId } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * "Already in your Recipes": the link the Member gave is a Recipe of their Family. The Sheet's footer offers
 * Open or Read again anyway. The heading takes focus (the caller focuses it) so a screen
 * reader announces the panel as it appears.
 */
export const AlreadyInRecipes = forwardRef<
  HTMLHeadingElement,
  {
    // The Open and Read again actions are the Sheet's primary and secondary.
  }
>(function AlreadyInRecipes(_props, heading) {
  const { t } = useTranslation('recipes');
  const headingId = useId();
  const bodyId = useId();
  return (
    <Card
      component="section"
      aria-labelledby={headingId}
      aria-describedby={bodyId}
    >
      <Stack spacing={1.5}>
        <Typography
          id={headingId}
          component="h2"
          variant="h6"
          tabIndex={-1}
          ref={heading}
        >
          {t('fromLink.duplicate.heading')}
        </Typography>
        <Typography id={bodyId} color="text.secondary">
          {t('fromLink.duplicate.body')}
        </Typography>
      </Stack>
    </Card>
  );
});
