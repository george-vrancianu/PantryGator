import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithTheme as render } from '../test/render';
import { ConfirmAction, ConfirmPrompt } from './ConfirmAction';

const labels = { confirm: 'Yes, do it', cancel: 'No' };

describe('ConfirmAction', () => {
  afterEach(cleanup);

  it('asks first, and moves focus to Confirm', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmAction
        label="Remove"
        message="Remove it for good?"
        confirmLabels={labels}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('Remove it for good?')).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Yes, do it' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes, do it' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('returns focus to the trigger on Cancel', () => {
    render(
      <ConfirmAction
        label="Remove"
        message="Sure?"
        confirmLabels={labels}
        onConfirm={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Remove' }),
    );
  });

  it('names the trigger by triggerName when the label alone is ambiguous', () => {
    render(
      <ConfirmAction
        label="Remove"
        triggerName="Remove Sam"
        message="Sure?"
        confirmLabels={labels}
        onConfirm={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Remove Sam' })).toBeTruthy();
  });
});

describe('ConfirmPrompt', () => {
  afterEach(cleanup);

  it('shows the message and the given words, with focus on Confirm', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmPrompt
        message="Leave?"
        labels={labels}
        onConfirm={() => undefined}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText('Leave?')).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Yes, do it' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
