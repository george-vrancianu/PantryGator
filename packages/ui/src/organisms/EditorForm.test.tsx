import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithTheme as render } from '../test/render';
import { stubScreen } from '../test/stubScreen';
import { EditorForm, type EditorFormLabels } from './EditorForm';
import { EditorSheetContext } from './editorSheetContext';

const labels: EditorFormLabels = {
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  delete: 'Delete',
  deleteConfirm: 'Delete this for good?',
  confirmLabels: { confirm: 'Confirm', cancel: 'Keep' },
};

const base = {
  heading: 'Edit aisle',
  labels,
  errorMessage: null,
  canSave: true,
  saving: false,
  onSubmit: () => undefined,
  onCancel: () => undefined,
};

describe('EditorForm as a page', () => {
  afterEach(cleanup);

  it('draws a heading that takes focus, and the fields', () => {
    render(
      <EditorForm {...base}>
        <input aria-label="Name" />
      </EditorForm>,
    );
    const heading = screen.getByRole('heading', { name: 'Edit aisle' });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByLabelText('Name')).toBeTruthy();
  });

  it('submits through Save and cancels through Cancel', () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(
      <EditorForm {...base} onSubmit={onSubmit} onCancel={onCancel}>
        x
      </EditorForm>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('says Saving… while saving, or the given words', () => {
    const { rerender } = render(
      <EditorForm {...base} saving>
        x
      </EditorForm>,
    );
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeTruthy();
    rerender(
      <EditorForm {...base} saveLabel="Create" savingLabel="Creating…">
        x
      </EditorForm>,
    );
    expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy();
  });

  it('shows the error message, and none when there is none', () => {
    const { rerender } = render(
      <EditorForm {...base} errorMessage="Name taken">
        x
      </EditorForm>,
    );
    expect(screen.getByText('Name taken')).toBeTruthy();
    rerender(<EditorForm {...base}>x</EditorForm>);
    expect(screen.queryByText('Name taken')).toBeNull();
  });

  it('hides Save / Cancel when the page carries them', () => {
    render(
      <EditorForm {...base} hideActions onCancel={undefined}>
        x
      </EditorForm>,
    );
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('deletes behind a two-step confirm', () => {
    const onDelete = vi.fn();
    render(
      <EditorForm {...base} onDelete={onDelete}>
        x
      </EditorForm>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Delete this for good?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('runs the caller own delete step through onDeleteRequest', () => {
    const onDeleteRequest = vi.fn();
    render(
      <EditorForm {...base} onDeleteRequest={onDeleteRequest}>
        x
      </EditorForm>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDeleteRequest).toHaveBeenCalledTimes(1);
  });
});

describe('EditorForm in a sheet', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('draws a Sheet titled by the heading, with Save pinned and Delete as the destructive link', () => {
    stubScreen(false, false);
    const onClose = vi.fn();
    render(
      <EditorSheetContext.Provider value={{ onClose }}>
        <EditorForm {...base} onDelete={() => undefined}>
          x
        </EditorForm>
      </EditorSheetContext.Provider>,
    );
    expect(screen.getByRole('dialog', { name: 'Edit aisle' })).toBeTruthy();
    // The title is the Sheet's: no heading in the body, no Cancel in the form.
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('Delete this for good?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.queryByText('Delete this for good?')).toBeNull();
  });
});
