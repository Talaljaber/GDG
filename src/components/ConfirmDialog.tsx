import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useT } from '../i18n';
import styles from './ui.module.css';

/** Modal confirm with Cancel / "Yes, do it" (common.cancel / common.confirm). */
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
  const confirmRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancelRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={styles.backdrop} role="presentation" onClick={onCancel}>
      <div
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        data-testid="confirm-dialog"
      >
        <p>{children}</p>
        <div className={styles.dialogActions}>
          <button type="button" className={`${styles.button} ${styles.buttonSecondary}`} onClick={onCancel}>
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
