import { Button, Card, Stack, Typography } from '@pocket-pantry/ui';
import { forwardRef, useId } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * "Already in your Recipes": the link the Member gave is a Recipe of their Family. They can open
 * it or read the page again anyway. The heading takes focus (the caller focuses it) so a screen
 * reader announces the panel as it appears.
 */
export const AlreadyInRecipes = forwardRef<
  HTMLHeadingElement,
  {
    recipeId: string;
    onReadAgain: () => void;
    /** Called when Open is pressed (the caller closes whatever shows this). */
    onOpen?: () => void;
  }
>(function AlreadyInRecipes({ recipeId, onReadAgain, onOpen }, heading) {
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
        <Stack direction="row" spacing={1.5}>
          <Button fullWidth href={`/recipes/${recipeId}`} onClick={onOpen}>
            {t('fromLink.duplicate.open')}
          </Button>
          <Button
            variant="secondary"
            fullWidth
            sx={{ height: 52 }}
            onClick={onReadAgain}
          >
            {t('fromLink.duplicate.readAgain')}
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
});
