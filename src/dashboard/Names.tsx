/**
 * D5 Names (`SCREENS.md` §3): hide a name by typed text with a preview of
 * its current boards, confirm, `admin_hide_name`; hidden list with Unhide;
 * blocked words list with add (whole word / anywhere) and remove.
 *
 * `HideNameField` is also used standalone on D1 ("quick hide a name",
 * AC4.4: hide takes <= 10 s end to end including typing).
 */
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { formatNumber, useT } from '../i18n';
import { nameKey as computeNameKey } from '../lib/names';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Trans } from '../components/Trans';
import ui from '../components/ui.module.css';
import styles from './dashboard.module.css';
import {
  ApiError,
  adminAddBlockedTerm,
  adminHideName,
  adminRemoveBlockedTerm,
  adminUnhideName,
  fetchBlockedTerms,
  fetchCurrentEventDay,
  fetchDayBoard,
  fetchHiddenNames,
  type BlockedTermRow,
  type DayBoardRow,
  type HiddenNameRow,
  type TermMatch,
} from './api';

// ------------------------------------------------------------------ hide a name (D1 quick field + D5)

export function HideNameField({ onHidden }: { onHidden?: () => void }) {
  const t = useT();
  const [typed, setTyped] = useState('');
  const [preview, setPreview] = useState<DayBoardRow[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = computeNameKey(typed);

  const preview_ = async (e: FormEvent) => {
    e.preventDefault();
    if (!key) return;
    setError(null);
    setPreviewing(true);
    try {
      const day = await fetchCurrentEventDay();
      const rows = day ? await fetchDayBoard(day.id) : [];
      setPreview(rows.filter((r) => r.nameKey === key));
      setConfirming(true);
    } catch {
      setError('sys.generic_error');
    } finally {
      setPreviewing(false);
    }
  };

  const confirmHide = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminHideName(key);
      setConfirming(false);
      setTyped('');
      setPreview(null);
      onHidden?.();
    } catch {
      setError('sys.generic_error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={styles.row} onSubmit={(e) => void preview_(e)} data-testid="hide-name-form">
      <label className={styles.field}>
        <span>{t('dash.names.hide_input')}</span>
        <input
          className={ui.input}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          data-testid="hide-name-input"
        />
      </label>
      <button
        type="submit"
        className={ui.button}
        disabled={!key || previewing}
        data-testid="hide-name-preview-btn"
      >
        {t('dash.names.hide_btn')}
      </button>
      {error ? (
        <p className={ui.error} role="alert">
          {t(error)}
        </p>
      ) : null}
      {confirming ? (
        <ConfirmDialog busy={busy} onCancel={() => setConfirming(false)} onConfirm={() => void confirmHide()}>
          <Trans k="dash.hide_confirm" nodes={{ name: <bdi>{typed.trim()}</bdi> }} />
          <span className={ui.muted} data-testid="hide-name-preview">
            {preview && preview.length > 0
              ? preview.map((r) => `${t(`game.${r.game}.name`)}: ${formatNumber(r.score)}`).join(' · ')
              : t('dash.names.hide_preview_empty')}
          </span>
        </ConfirmDialog>
      ) : null}
    </form>
  );
}

// ------------------------------------------------------------------ D5 full page

export function NamesPanel() {
  const t = useT();
  const [hidden, setHidden] = useState<HiddenNameRow[] | null>(null);
  const [blocked, setBlocked] = useState<BlockedTermRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newTerm, setNewTerm] = useState('');
  const [newMatch, setNewMatch] = useState<TermMatch>('word');
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    try {
      const [h, b] = await Promise.all([fetchHiddenNames(), fetchBlockedTerms()]);
      setHidden(h);
      setBlocked(b);
    } catch {
      setError('sys.generic_error');
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const unhide = async (nameKey: string) => {
    setBusy(true);
    try {
      await adminUnhideName(nameKey);
      await reload();
    } catch {
      setError('sys.generic_error');
    } finally {
      setBusy(false);
    }
  };

  const addTerm = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTerm.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await adminAddBlockedTerm(newTerm, newMatch);
      setNewTerm('');
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.mapped.copyKey : 'sys.generic_error');
    } finally {
      setBusy(false);
    }
  };

  const removeTerm = async (termKey: string) => {
    setBusy(true);
    try {
      await adminRemoveBlockedTerm(termKey);
      await reload();
    } catch {
      setError('sys.generic_error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.main} data-testid="dash-names">
      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>{t('dash.names.hide_title')}</h2>
        <HideNameField onHidden={() => void reload()} />
        {error ? (
          <p className={ui.error} role="alert">
            {t(error)}
          </p>
        ) : null}
      </section>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>{t('dash.names.hidden_list')}</h2>
        {!hidden ? null : hidden.length === 0 ? (
          <p className={ui.muted}>{t('dash.names.hidden_empty')}</p>
        ) : (
          <ul className={styles.list} data-testid="hidden-list">
            {hidden.map((h) => (
              <li key={h.name_key} className={styles.listItem} data-testid="hidden-row">
                <bdi>{h.name_key}</bdi>
                <button
                  type="button"
                  className={`${ui.button} ${ui.buttonSecondary}`}
                  disabled={busy}
                  onClick={() => void unhide(h.name_key)}
                  data-testid="unhide-btn"
                >
                  {t('dash.names.unhide')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>{t('dash.names.blocked_title')}</h2>
        <form className={styles.row} onSubmit={(e) => void addTerm(e)} data-testid="blocked-form">
          <label className={styles.field}>
            <span>{t('dash.names.blocked_add')}</span>
            <input
              className={ui.input}
              value={newTerm}
              onChange={(e) => setNewTerm(e.target.value)}
              data-testid="blocked-input"
            />
          </label>
          <label className={styles.checkbox}>
            <input
              type="radio"
              name="match"
              checked={newMatch === 'word'}
              onChange={() => setNewMatch('word')}
            />
            {t('dash.names.match_word')}
          </label>
          <label className={styles.checkbox}>
            <input
              type="radio"
              name="match"
              checked={newMatch === 'substring'}
              onChange={() => setNewMatch('substring')}
            />
            {t('dash.names.match_substring')}
          </label>
          <button type="submit" className={ui.button} disabled={busy || !newTerm.trim()} data-testid="blocked-add-btn">
            {t('dash.names.blocked_add')}
          </button>
        </form>
        {!blocked ? null : blocked.length === 0 ? (
          <p className={ui.muted}>{t('dash.names.blocked_empty')}</p>
        ) : (
          <ul className={styles.list} data-testid="blocked-list">
            {blocked.map((b) => (
              <li key={b.term_key} className={styles.listItem} data-testid="blocked-row">
                <span>
                  {b.term_key} ({t(b.match === 'word' ? 'dash.names.match_word' : 'dash.names.match_substring')})
                </span>
                <button
                  type="button"
                  className={`${ui.button} ${ui.buttonSecondary}`}
                  disabled={busy}
                  onClick={() => void removeTerm(b.term_key)}
                  data-testid="blocked-remove-btn"
                >
                  {t('dash.names.remove')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
