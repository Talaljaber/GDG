/**
 * Small presentational building blocks shared by the dashboard pages
 * (DESIGN_SYSTEM §0.4): page header, panels, filter-row select, table
 * loading/empty states, inline alerts and the few line icons we draw inline.
 * No data logic here.
 */
import type { ReactNode, SelectHTMLAttributes } from 'react';
import { useT } from '../i18n';
import ui from '../components/ui.module.css';
import styles from './dashboard.module.css';

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeaderText}>
        {eyebrow ? <span className={ui.eyebrow}>{eyebrow}</span> : null}
        <h1 className={styles.pageTitle}>{title}</h1>
        {description ? <p className={styles.pageDescription}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.pageActions}>{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  aside,
  children,
  flush = false,
  className,
  testId,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  /** No inner padding: for a table that runs edge to edge. */
  flush?: boolean;
  className?: string;
  testId?: string;
}) {
  return (
    <section className={`${styles.panel} ${className ?? ''}`} data-testid={testId}>
      {title || aside ? (
        <div className={styles.panelHeader}>
          {title ? <h2 className={styles.panelTitle}>{title}</h2> : <span />}
          {aside ? <div className={styles.panelAside}>{aside}</div> : null}
        </div>
      ) : null}
      <div className={flush ? styles.panelBodyFlush : styles.panelBody}>{children}</div>
    </section>
  );
}

/** A native select with a drawn chevron at the inline end (keeps keyboard and screen-reader behaviour). */
export function Select({ label, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: ReactNode }) {
  return (
    <label className={styles.filter}>
      <span className={styles.filterLabel}>{label}</span>
      <span className={styles.selectWrap}>
        <select className={styles.select} {...props} />
        <Icon name="expand" className={styles.selectIcon} />
      </span>
    </label>
  );
}

/** Placeholder rows while a table loads: same row height as data, no text. */
export function TableSkeleton({ columns, rows = 6 }: { columns: number; rows?: number }) {
  const t = useT();
  return (
    <div className={styles.skeleton} role="status" aria-live="polite" data-testid="dash-loading">
      <span className="visually-hidden">{t('dash.loading')}</span>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className={styles.skeletonRow} aria-hidden="true">
          {Array.from({ length: columns }, (_, c) => (
            <span key={c} className={styles.skeletonCell} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: ReactNode; hint?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>{title}</p>
      {hint ? <p className={styles.emptyHint}>{hint}</p> : null}
    </div>
  );
}

export function Alert({ children, role = 'alert', testId }: { children: ReactNode; role?: 'alert' | 'status'; testId?: string }) {
  return (
    <p className={`${ui.error} ${styles.alert}`} role={role} data-testid={testId}>
      {children}
    </p>
  );
}

export type IconName = 'chevron' | 'expand' | 'download' | 'logout' | 'language' | 'sort' | 'sortUp' | 'sortDown';

const PATHS: Record<IconName, string> = {
  // Points toward the inline end in LTR; mirrored in RTL by .iconMirror.
  chevron: 'M9 5 L16 12 L9 19',
  expand: 'M6 9 L12 15 L18 9',
  download: 'M12 4 V15 M7 10 L12 15 L17 10 M5 20 H19',
  logout: 'M10 5 H6 V19 H10 M14 8 L18 12 L14 16 M18 12 H9',
  language: 'M4 6 H14 M9 4 V6 M12 6 C11 11 8 14 4 16 M7 10 C8.5 12.5 10.5 14 13 15 M13 20 L16.5 11 L20 20 M14.2 17 H18.8',
  sort: 'M8 10 L12 6 L16 10 M8 14 L12 18 L16 14',
  sortUp: 'M8 14 L12 10 L16 14',
  sortDown: 'M8 10 L12 14 L16 10',
};

export function Icon({ name, className, mirror = false }: { name: IconName; className?: string; mirror?: boolean }) {
  return (
    <svg
      className={`${styles.icon} ${mirror ? styles.iconMirror : ''} ${className ?? ''}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
