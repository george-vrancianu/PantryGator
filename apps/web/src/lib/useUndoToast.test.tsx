import { PocketPantryUiProvider } from '@pocket-pantry/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import { createI18n } from '../i18n';
import { useUndoToast } from './useUndoToast';

function Harness({ onUndo }: { onUndo: () => void }) {
  const { showUndo } = useUndoToast();
  return <button onClick={() => showUndo('Removed Milk', onUndo)}>go</button>;
}

describe('useUndoToast', () => {
  it('shows a polite status toast whose Undo runs the callback', async () => {
    const onUndo = vi.fn();
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={createI18n('en')}>
        <PocketPantryUiProvider>
          <Harness onUndo={onUndo} />
        </PocketPantryUiProvider>
      </I18nextProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'go' }));
    expect(screen.getByRole('status')).toHaveTextContent('Removed Milk');
    expect(screen.queryByRole('alert')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
