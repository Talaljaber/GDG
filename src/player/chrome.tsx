/**
 * Phone chrome shared by the player screens (DESIGN_SYSTEM §0.3, ADR-131):
 * the eyebrow + title header every screen starts with, the thin facing
 * chevrons that frame one hero per screen (§0.1 rule 7), and the label ·
 * value list used for breakdowns. Presentation only.
 */
import type { ReactNode } from 'react';
import styles from './player.module.css';

/** Eyebrow + title (the one h1 on the screen), optionally a lead line under it. */
export function ScreenHeader({
  eyebrow,
  title,
  lead,
  center = false,
  titleTestId,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  center?: boolean;
  titleTestId?: string;
}) {
  return (
    <header className={`${styles.header} ${center ? styles.headerCenter : ''}`}>
      {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
      <h1 className={styles.title} data-testid={titleTestId}>
        {title}
      </h1>
      {lead ? <p className={styles.lead}>{lead}</p> : null}
    </header>
  );
}

/**
 * One thin chevron glyph: blue `<` at the inline-start, amber `>` at the
 * inline-end (mirrored in RTL with the frame, DESIGN_SYSTEM §8). Not the logo.
 */
export function Chevron({ end = false, size = 'hero' }: { end?: boolean; size?: 'hero' | 'title' }) {
  return (
    <svg
      className={[
        styles.chevron,
        end ? styles.chevronEnd : styles.chevronStart,
        size === 'title' ? styles.chevronTitle : styles.chevronHero,
      ].join(' ')}
      viewBox="0 0 20 48"
      aria-hidden="true"
      focusable="false"
    >
      <polyline
        points={end ? '4,4 16,24 4,44' : '16,4 4,24 16,44'}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Facing chevrons around one hero (a score, a total, a game name). */
export function ChevronFrame({
  children,
  size = 'hero',
}: {
  children: ReactNode;
  size?: 'hero' | 'title';
}) {
  return (
    <div className={`${styles.frame} ${size === 'title' ? styles.frameTitle : ''}`}>
      <Chevron size={size} />
      {children}
      <Chevron end size={size} />
    </div>
  );
}

/** Small uppercase label (Latin) above a value or section. */
export function Eyebrow({ children, as: Tag = 'p' }: { children: ReactNode; as?: 'p' | 'h2' | 'span' }) {
  return <Tag className={styles.eyebrow}>{children}</Tag>;
}

export interface DetailRow {
  key: string;
  label: ReactNode;
  value: ReactNode;
  /** A muted note under the value (e.g. "incl. 2 s penalty"). */
  note?: ReactNode;
  /** The row to point out (amber tint + inline-start rule), e.g. the closest guess. */
  best?: boolean;
  testId?: string;
  data?: Record<`data-${string}`, string>;
}

/** Two-column label · value list inside a panel (breakdowns, P7/P9). */
export function DetailList({ rows, testId }: { rows: readonly DetailRow[]; testId?: string }) {
  return (
    <ul className={styles.kv} data-testid={testId}>
      {rows.map((r) => (
        <li
          key={r.key}
          className={`${styles.kvRow} ${r.best ? styles.kvBest : ''}`}
          data-testid={r.testId}
          data-best={r.best ? 'true' : undefined}
          {...r.data}
        >
          <span className={styles.kvLabel}>{r.label}</span>
          <span className={styles.kvValue}>
            {r.value}
            {r.note ? <span className={styles.kvNote}>{r.note}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
