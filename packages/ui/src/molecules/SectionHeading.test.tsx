import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ScopeCaption, SectionHeading } from './SectionHeading';

describe('SectionHeading', () => {
  afterEach(cleanup);

  it('is an h2 carrying the id a section can name itself by', () => {
    render(<SectionHeading id="appearance" title="Appearance" />);
    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'Appearance',
    });
    expect(heading.id).toBe('appearance');
  });

  it('shows the scope caption on the right when given one', () => {
    render(
      <SectionHeading
        id="you"
        title="You"
        scope={<ScopeCaption scope="you" label="Only you" />}
      />,
    );
    expect(screen.getByText('Only you')).toBeTruthy();
  });
});
