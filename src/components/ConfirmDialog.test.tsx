import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LangProvider } from '../i18n';
import { ConfirmDialog } from './ConfirmDialog';

function renderDialog(onConfirm = vi.fn(), onCancel = vi.fn()) {
  render(
    <LangProvider initial="en">
      <button type="button" data-testid="opener">
        opener
      </button>
      <ConfirmDialog onConfirm={onConfirm} onCancel={onCancel}>
        Are you sure?
      </ConfirmDialog>
    </LangProvider>,
  );
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('describes itself via aria-describedby pointing at the body text', () => {
    renderDialog();
    const dialog = screen.getByTestId('confirm-dialog');
    const describedBy = dialog.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent('Are you sure?');
  });

  it('is an aria-modal alertdialog', () => {
    renderDialog();
    const dialog = screen.getByTestId('confirm-dialog');
    expect(dialog).toHaveAttribute('role', 'alertdialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('focuses cancel (the safe action) on open', () => {
    renderDialog();
    expect(screen.getByText('Cancel')).toHaveFocus();
  });

  it('calls onCancel on Escape', () => {
    const { onCancel, onConfirm } = renderDialog();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('traps Tab forward from confirm back to cancel', () => {
    renderDialog();
    const confirmBtn = screen.getByTestId('confirm-yes');
    confirmBtn.focus();
    expect(confirmBtn).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(screen.getByText('Cancel')).toHaveFocus();
  });

  it('traps Shift+Tab backward from cancel to confirm', () => {
    renderDialog();
    const cancelBtn = screen.getByText('Cancel');
    cancelBtn.focus();
    expect(cancelBtn).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(screen.getByTestId('confirm-yes')).toHaveFocus();
  });

  it('returns focus to the opener when the dialog closes', () => {
    function Wrapper() {
      const [open, setOpen] = useState(false);
      return (
        <LangProvider initial="en">
          <button type="button" data-testid="opener" onClick={() => setOpen(true)}>
            opener
          </button>
          {open && (
            <ConfirmDialog onConfirm={() => setOpen(false)} onCancel={() => setOpen(false)}>
              Are you sure?
            </ConfirmDialog>
          )}
        </LangProvider>
      );
    }
    render(<Wrapper />);
    const opener = screen.getByTestId('opener');
    opener.focus();
    expect(opener).toHaveFocus();
    fireEvent.click(opener);
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(opener).toHaveFocus();
  });
});
