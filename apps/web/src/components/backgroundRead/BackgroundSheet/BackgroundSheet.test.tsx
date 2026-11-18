import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BackgroundItem, BackgroundStatus } from '@/lib/backgroundItem';
import { renderWithProviders } from '@/test/render';
import { BackgroundSheet } from './BackgroundSheet';

const item = (status: BackgroundStatus): BackgroundItem => ({
  kind: 'voice',
  id: status,
  title: `Title ${status}`,
  detail: 'Detail',
  status,
  createdAt: 1,
  actions: [],
});

describe('BackgroundSheet', () => {
  it('draws each row status as a decorative icon, not a text glyph', () => {
    renderWithProviders(
      <BackgroundSheet
        open
        items={[item('reading'), item('ready'), item('failed')]}
        onClose={vi.fn()}
        onExited={vi.fn()}
      />,
    );
    for (const status of ['reading', 'ready', 'failed'] as const) {
      const row = screen.getByText(`Title ${status}`).closest('li')!;
      const slot = row.firstElementChild as HTMLElement;
      expect(slot).toHaveAttribute('aria-hidden', 'true');
      expect(slot.querySelector('svg')).not.toBeNull();
      expect(slot).toHaveTextContent('');
      expect(within(row).queryByText(/^[…✓!]$/)).toBeNull();
    }
  });
});
