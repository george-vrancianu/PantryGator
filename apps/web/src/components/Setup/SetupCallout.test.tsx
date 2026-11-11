import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { authoredCss } from '../../test/stickyHeader';
import { SetupCallout } from './SetupCallout';

describe('SetupCallout', () => {
  it('stays inside the left and right insets so a landscape notch never covers it', () => {
    render(
      <SetupCallout title="Hold" body="to talk" bottom="100px" role="status" />,
    );
    const css = authoredCss(screen.getByRole('status'));
    expect(css).toMatch(/left:\s*env\(safe-area-inset-left/);
    expect(css).toMatch(/right:\s*env\(safe-area-inset-right/);
    expect(css).toMatch(
      /max-width:\s*calc\(100% - 32px - env\(safe-area-inset-left/,
    );
  });
});
