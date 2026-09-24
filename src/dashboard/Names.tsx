/**
 * D5 Names (`SCREENS.md` §3): hide a name by typed text with a preview of
 * its current boards, confirm, `admin_hide_name`; hidden list with Unhide;
 * blocked words list with add (whole word / anywhere) and remove.
 *
 * `HideNameField` is also used standalone on D1 ("quick hide a name",
 * AC4.4: hide takes <= 10 s end to end including typing).
 */
import { memo, useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { formatNumber, useLang, useT } from '../i18n';
import { nameKey as computeNameKey } from '../lib/names';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Trans } from '../components/Trans';
import ui from '../components/ui.module.css';
import styles from './dashboard.module.css';
import { ApiError, type BlockedTermRow, type DayBoardRow, type HiddenNameRow, type TermMatch } from './api';
import { useDashApi } from './dashApi';
import { formatTime } from './format';
import { useRenderCount } from './renderCount';
import { Alert, EmptyState, PageHeader, Panel, TableSkeleton } from './parts';

// ------------------------------------------------------------------ hide a name (D1 quick field + D5)

/** Memoised (owns its own typing state): parents pass a stable `onHidden`, so their re-renders skip it. */
export const HideNameField = memo(function HideNameField({ onHidden }: { onHidden?: () => void }) {
  useRenderCount('HideNameField');
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
        className={`${ui.button} ${ui.buttonSmall} ${styles.ctl}`}
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
});

// ------------------------------------------------------------------ D5 full page

export function NamesPanel() {
  useRenderCount('NamesPanel');
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

  // Stable callbacks (with the memoised tables and HideNameField): typing in the blocked-word
  // field re-renders only this panel, not both lists and the hide field on every keystroke.
  const onHidden = useCallback(() => void reload(), [reload]);

  const unhide = useCallback(
    async (nameKey: string) => {
      setBusy(true);
      try {
        await api.adminUnhideName(nameKey);
        await reload();
      } catch {
        setError('sys.generic_error');
      } finally {
        setBusy(false);
      }
    },
    [api, reload],
  );

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

  const removeTerm = useCallback(
    async (termKey: string) => {
      setBusy(true);
      try {
        await api.adminRemoveBlockedTerm(termKey);
        await reload();
      } catch {
        setError('sys.generic_error');
      } finally {
        setBusy(false);
      }
    },
    [api, reload],
  );

  return (
    <div className={styles.page} data-testid="dash-names">
      <PageHeader title={t('dash.nav.names')} description={t('dash.names.desc')} />
      {error ? <Alert>{t(error)}</Alert> : null}
      <div className={styles.columns}>
        <div className={styles.stack}>
          <Panel title={t('dash.names.hide_title')}>
            <HideNameField onHidden={onHidden} />
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
              <HiddenTable hidden={hidden} busy={busy} onUnhide={unhide} />
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
              className={`${ui.button} ${ui.buttonSecondary} ${ui.buttonSmall} ${styles.ctl}`}
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
            <BlockedTable blocked={blocked} busy={busy} onRemove={removeTerm} />
          )}
        </Panel>
      </div>
    </div>
  );
}

const HiddenTable = memo(function HiddenTable({
  hidden,
  busy,
  onUnhide,
}: {
  hidden: HiddenNameRow[];
  busy: boolean;
  onUnhide: (nameKey: string) => Promise<void>;
}) {
  useRenderCount('HiddenTable');
  const t = useT();
  const { lang } = useLang();
  return (
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
              <td className={styles.primaryCell}>
                <bdi className={styles.nameCell}>{h.name_key}</bdi>
              </td>
              <td className={`${styles.tabular} ${styles.dim}`} data-label={t('dash.names.col.hidden_at')}>{formatTime(h.hidden_at, lang)}</td>
              <td className={styles.actionsCol}>
                <button
                  type="button"
                  className={`${ui.button} ${ui.buttonText} ${ui.buttonSmall} ${styles.ctl} ${styles.quiet}`}
                  disabled={busy}
                  onClick={() => void onUnhide(h.name_key)}
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
  );
});

const BlockedTable = memo(function BlockedTable({
  blocked,
  busy,
  onRemove,
}: {
  blocked: BlockedTermRow[];
  busy: boolean;
  onRemove: (termKey: string) => Promise<void>;
}) {
  useRenderCount('BlockedTable');
  const t = useT();
  return (
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
              <td className={styles.primaryCell}>
                <bdi className={styles.nameCell}>{b.term_key}</bdi>
              </td>
              <td className={styles.dim} data-label={t('dash.names.col.match')}>
                {t(b.match === 'word' ? 'dash.names.match_word' : 'dash.names.match_substring')}
              </td>
              <td className={styles.actionsCol}>
                <button
                  type="button"
                  className={`${ui.button} ${ui.buttonText} ${ui.buttonSmall} ${styles.ctl} ${styles.quiet}`}
                  disabled={busy}
                  onClick={() => void onRemove(b.term_key)}
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
  );
});
