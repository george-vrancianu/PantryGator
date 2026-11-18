import { Card, Typography } from '@pocket-pantry/ui';
import { useId, type ReactNode } from 'react';

/** A titled block of the detail page. */
export function Section({
  title,
  card = false,
  children,
}: {
  title: string;
  /** Sets the content in a white card. */
  card?: boolean;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <Typography variant="sectionLabel" component="h2" id={headingId}>
        {title}
      </Typography>
      {card ? (
        <Card variant="list" sx={{ py: '8px' }}>
          {children}
        </Card>
      ) : (
        children
      )}
    </section>
  );
}
