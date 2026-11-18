import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { authoredCss } from '@pocket-pantry/ui/test/authoredCss';
import { SetupCallout } from './SetupCallout';

describe('SetupCallout', () => {
  it('stays inside the left and right insets so a landscape notch never covers it', () => {
    render(
      <SetupCallout title="Hold" body="to talk" bottom="100px" role="status" />,
    );
    const css = authoredCss(screen.getByRole('status'));
    expect(css).toMatch(
      /max-width:\s*calc\(100% - max\(16px, env\(safe-area-inset-left[^)]*\)\) - max\(16px, env\(safe-area-inset-right/,
    );
  });
});
