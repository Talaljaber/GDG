/**
 * D5 Names (`SCREENS.md` §3): hide a name by typed text with a preview of
 * its current boards, confirm, `admin_hide_name`; hidden list with Unhide;
 * blocked words list with add (whole word / anywhere) and remove.
 *
 * `HideNameField` is also used standalone on D1 ("quick hide a name",
 * AC4.4: hide takes <= 10 s end to end including typing).
 */
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { formatNumber, useT } from '../i18n';
import { nameKey as computeNameKey } from '../lib/names';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Trans } from '../components/Trans';
import styles from './dashboard.module.css';
import { ApiError, type BlockedTermRow, type DayBoardRow, type HiddenNameRow, type TermMatch } from './api';
import { useDashApi } from './apiContext';
import { formatTime } from './format';
import { Alert, EmptyState, PageHeader, Panel, TableSkeleton } from './parts';

// ------------------------------------------------------------------ hide a name (D1 quick field + D5)

export function HideNameField({ onHidden }: { onHidden?: () => void }) {
  const t = useT();
  const api = useDashApi();
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
      const day = await api.fetchCurrentEventDay();
      const rows = day ? await api.fetchDayBoard(day.id) : [];
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
      await api.adminHideName(key);
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
    <form className={styles.inlineForm} onSubmit={(e) => void preview_(e)} data-testid="hide-name-form">
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('dash.names.hide_input')}</span>
        <input
          className={styles.input}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          data-testid="hide-name-input"
        />
      </label>
      <button
        type="submit"
        className={`${styles.btn} ${styles.btnPrimary}`}
        disabled={!key || previewing}
        data-testid="hide-name-preview-btn"
      >
        {t('dash.names.hide_btn')}
      </button>
      {error ? <Alert>{t(error)}</Alert> : null}
      {confirming ? (
        <ConfirmDialog busy={busy} onCancel={() => setConfirming(false)} onConfirm={() => void confirmHide()}>
          <Trans k="dash.hide_confirm" nodes={{ name: <bdi>{typed.trim()}</bdi> }} />
          <span className={styles.previewList} data-testid="hide-name-preview">
            {preview && preview.length > 0
              ? preview.map((r) => (
                  <span key={r.game} className={styles.previewItem}>
                    {t(`game.${r.game}.name`)}: <span className={styles.tabular}>{formatNumber(r.score)}</span>
                  </span>
                ))
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
  const api = useDashApi();
  const [hidden, setHidden] = useState<HiddenNameRow[] | null>(null);
  const [blocked, setBlocked] = useState<BlockedTermRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newTerm, setNewTerm] = useState('');
  const [newMatch, setNewMatch] = useState<TermMatch>('word');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [h, b] = await Promise.all([api.fetchHiddenNames(), api.fetchBlockedTerms()]);
      setHidden(h);
      setBlocked(b);
    } catch {
      setError('sys.generic_error');
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const unhide = async (nameKey: string) => {
    setBusy(true);
    try {
      await api.adminUnhideName(nameKey);
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
      await api.adminAddBlockedTerm(newTerm, newMatch);
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
      await api.adminRemoveBlockedTerm(termKey);
      await reload();
    } catch {
      setError('sys.generic_error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page} data-testid="dash-names">
      <PageHeader title={t('dash.nav.names')} description={t('dash.names.desc')} />
      {error ? <Alert>{t(error)}</Alert> : null}
      <div className={styles.columns}>
        <div className={styles.stack}>
          <Panel title={t('dash.names.hide_title')}>
            <HideNameField onHidden={() => void reload()} />
          </Panel>

          <Panel
            title={t('dash.names.hidden_list')}
            aside={hidden && hidden.length > 0 ? <span className={styles.count}>{formatNumber(hidden.length)}</span> : null}
            flush
          >
            {!hidden ? (
              <TableSkeleton columns={3} rows={3} />
            ) : hidden.length === 0 ? (
              <EmptyState title={t('dash.names.hidden_empty')} />
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table} data-testid="hidden-list">
                  <thead>
                    <tr>
                      <th>{t('dash.results.col.name')}</th>
                      <th>{t('dash.names.col.hidden_at')}</th>
                      <th className={styles.actionsCol}>
                        <span className="visually-hidden">{t('dash.names.col.action')}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {hidden.map((h) => (
                      <tr key={h.name_key} data-testid="hidden-row">
                        <td>
                          <bdi className={styles.nameCell}>{h.name_key}</bdi>
                        </td>
                        <td className={`${styles.tabular} ${styles.dim}`}>{formatTime(h.hidden_at)}</td>
                        <td className={styles.actionsCol}>
                          <button
                            type="button"
                            className={`${styles.btn} ${styles.btnGhost} ${styles.btnSmall}`}
                            disabled={busy}
                            onClick={() => void unhide(h.name_key)}
                            data-testid="unhide-btn"
                          >
                            {t('dash.names.unhide')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <Panel
          title={t('dash.names.blocked_title')}
          aside={blocked && blocked.length > 0 ? <span className={styles.count}>{formatNumber(blocked.length)}</span> : null}
          flush
        >
          <form className={`${styles.inlineForm} ${styles.panelForm}`} onSubmit={(e) => void addTerm(e)} data-testid="blocked-form">
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('dash.names.blocked_add')}</span>
              <input
                className={styles.input}
                value={newTerm}
                onChange={(e) => setNewTerm(e.target.value)}
                data-testid="blocked-input"
              />
            </label>
            <div className={styles.segmented}>
              <label className={styles.segment}>
                <input
                  type="radio"
                  name="match"
                  className="visually-hidden"
                  checked={newMatch === 'word'}
                  onChange={() => setNewMatch('word')}
                />
                {t('dash.names.match_word')}
              </label>
              <label className={styles.segment}>
                <input
                  type="radio"
                  name="match"
                  className="visually-hidden"
                  checked={newMatch === 'substring'}
                  onChange={() => setNewMatch('substring')}
                />
                {t('dash.names.match_substring')}
              </label>
            </div>
            <button
              type="submit"
              className={`${styles.btn} ${styles.btnSecondary}`}
              disabled={busy || !newTerm.trim()}
              data-testid="blocked-add-btn"
            >
              {t('dash.names.blocked_add')}
            </button>
          </form>
          {!blocked ? (
            <TableSkeleton columns={3} rows={4} />
          ) : blocked.length === 0 ? (
            <EmptyState title={t('dash.names.blocked_empty')} />
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table} data-testid="blocked-list">
                <thead>
                  <tr>
                    <th>{t('dash.names.col.word')}</th>
                    <th>{t('dash.names.col.match')}</th>
                    <th className={styles.actionsCol}>
                      <span className="visually-hidden">{t('dash.names.col.action')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {blocked.map((b) => (
                    <tr key={b.term_key} data-testid="blocked-row">
                      <td>
                        <bdi className={styles.nameCell}>{b.term_key}</bdi>
                      </td>
                      <td className={styles.dim}>
                        {t(b.match === 'word' ? 'dash.names.match_word' : 'dash.names.match_substring')}
                      </td>
                      <td className={styles.actionsCol}>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnGhost} ${styles.btnSmall}`}
                          disabled={busy}
                          onClick={() => void removeTerm(b.term_key)}
                          data-testid="blocked-remove-btn"
                        >
                          {t('dash.names.remove')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
