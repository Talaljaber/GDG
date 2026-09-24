import styles from './ui.module.css';

/** A wordless busy indicator (the screen it stands in for has no text of its own yet). */
export function Spinner() {
  return (
    <div className={styles.spinnerWrap} aria-busy="true" data-testid="spinner">
      <div className={styles.spinner} />
    </div>
  );
}
