import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/render';
import { authoredCss } from '../test/stickyHeader';
import { ReceiptCropper } from './ReceiptCropper';

describe('ReceiptCropper', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:photo');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());

  it('is padded by all four insets, so its instruction and buttons clear the island, notch and home indicator', () => {
    renderWithProviders(
      <ReceiptCropper
        photo={new Blob(['x'])}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    const css = authoredCss(screen.getByRole('dialog'));
    expect(css).toMatch(/padding-top:\s*env\(safe-area-inset-top/);
    expect(css).toMatch(/padding-bottom:\s*env\(safe-area-inset-bottom/);
    expect(css).toMatch(/padding-left:\s*env\(safe-area-inset-left/);
    expect(css).toMatch(/padding-right:\s*env\(safe-area-inset-right/);
  });
});
