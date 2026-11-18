import { cleanup, fireEvent, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithTheme as render } from '../test/render';
import { ReviewActionBar } from './ReviewActionBar';

describe('ReviewActionBar', () => {
  afterEach(cleanup);

  it('shows the given words and calls Save and Discard', () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    render(
      <ReviewActionBar
        saveLabel="Save 3 items"
        discardLabel="Retake"
        canSave
        onSave={onSave}
        onDiscard={onDiscard}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save 3 items' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retake' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('disables Save when it cannot save', () => {
    render(
      <ReviewActionBar
        saveLabel="Save"
        discardLabel="Discard"
        canSave={false}
        onSave={() => undefined}
        onDiscard={() => undefined}
      />,
    );
    expect(
      (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('hands its element to the ref the app measures', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ReviewActionBar
        ref={ref}
        saveLabel="Save"
        discardLabel="Discard"
        canSave
        onSave={() => undefined}
        onDiscard={() => undefined}
      />,
    );
    expect(
      ref.current?.contains(screen.getByRole('button', { name: 'Save' })),
    ).toBe(true);
  });
});
