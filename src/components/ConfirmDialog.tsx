import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { useT } from '../i18n';
import styles from './ui.module.css';

/** Modal confirm with Cancel / "Yes, do it" (common.cancel / common.confirm).
 * Cancel gets initial focus (it's the safe action); Tab/Shift+Tab are
 * trapped between the two buttons; Escape cancels; focus returns to
 * whatever opened the dialog once it closes. */
export function ConfirmDialog({
  children,
  onConfirm,
  onCancel,
  busy = false,
}: {
  children: ReactNode;
  onConfirm(): void;
  onCancel(): void;
  busy?: boolean;
}) {
  const t = useT();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancelRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const first = cancelRef.current;
      const last = confirmRef.current;
      if (!first || !last) return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, []);

  return (
    <div className={styles.backdrop} role="presentation" onClick={onCancel}>
      <div
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-describedby={descriptionId}
        onClick={(e) => e.stopPropagation()}
        data-testid="confirm-dialog"
      >
        <p id={descriptionId}>{children}</p>
        <div className={styles.dialogActions}>
          <button
            type="button"
            ref={cancelRef}
            className={`${styles.button} ${styles.buttonSecondary}`}
            onClick={onCancel}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            ref={confirmRef}
            className={styles.button}
            onClick={onConfirm}
            disabled={busy}
            data-testid="confirm-yes"
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
