/**
 * D6 Event days (`SCREENS.md` §3): list of days with session counts; start a
 * new event day (label + confirm), disabled while a session is playing
 * (AC4.6).
 */
import { memo, useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { formatNumber, useLang, useT } from '../i18n';
import { ConfirmDialog } from '../components/ConfirmDialog';
import ui from '../components/ui.module.css';
import styles from './dashboard.module.css';
import { isNewDayBlocked } from './combinedResults';
import { useDashApi } from './dashApi';
import { formatDateTime } from './format';
import { useRenderCount } from './renderCount';
import { Alert, PageHeader, Panel, TableSkeleton } from './parts';
import type { EventDayRow } from './api';

interface DayRow {
  day: EventDayRow;
  sessions: number;
}

export function DaysPanel() {
  useRenderCount('DaysPanel');
  const t = useT();
  const api = useDashApi();
  const [rows, setRows] = useState<DayRow[] | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [label, setLabel] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [days, playing] = await Promise.all([api.fetchEventDays(), api.fetchPlayingSession()]);
      const withCounts = await Promise.all(
        days.map(async (day) => ({ day, sessions: (await api.fetchSessionsForDay(day.id)).length })),
      );
      setRows(withCounts);
      setBlocked(isNewDayBlocked(playing));
    } catch {
      setError('sys.generic_error');
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!label.trim() || blocked) return;
    setConfirming(true);
  };

  const confirmStart = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.adminStartNewDay(label.trim());
      setLabel('');
      setConfirming(false);
      await reload();
    } catch {
      setError('sys.generic_error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page} data-testid="dash-days">
      <PageHeader title={t('dash.nav.days')} description={t('dash.days.desc')} />
      {error ? <Alert>{t(error)}</Alert> : null}

      <Panel title={t('dash.days.start_new')}>
        <p className={styles.panelNote}>{t('dash.days.note')}</p>
        <form className={styles.inlineForm} onSubmit={submit} data-testid="new-day-form">
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t('dash.days.label')}</span>
            <input
              className={styles.input}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={40}
              disabled={blocked}
              data-testid="new-day-input"
            />
          </label>
          <button
            type="submit"
            className={`${ui.button} ${ui.buttonSmall} ${styles.ctl}`}
            disabled={blocked || !label.trim()}
            data-testid="new-day-submit"
          >
            {t('dash.days.start_new')}
          </button>
        </form>
        {blocked ? (
          <Alert role="status" testId="new-day-blocked">
            {t('dash.days.blocked_running')}
          </Alert>
        ) : null}
        {confirming ? (
          <ConfirmDialog busy={busy} onCancel={() => setConfirming(false)} onConfirm={() => void confirmStart()}>
            {t('dash.days.confirm')}
          </ConfirmDialog>
        ) : null}
      </Panel>

      <Panel flush>
        {!rows ? (
          <TableSkeleton columns={4} rows={3} />
        ) : (
          <DaysTable rows={rows} />
        )}
      </Panel>
    </div>
  );
}

/** Memoised so typing the new day's label (DaysPanel state) doesn't re-render the table. */
const DaysTable = memo(function DaysTable({ rows }: { rows: DayRow[] }) {
  useRenderCount('DaysTable');
  const t = useT();
  const { lang } = useLang();
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table} data-testid="days-table">
        <thead>
          <tr>
            <th>{t('dash.results.filter_day')}</th>
            <th>{t('dash.days.col.started')}</th>
            <th>{t('dash.days.col.ended')}</th>
            <th className={styles.num}>{t('dash.days.col.sessions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ day, sessions }) => (
            <tr key={day.id} data-testid="day-row">
              <td className={styles.primaryCell}>
                <span className={styles.nameWithTag}>
                  <span className={styles.strong}>{day.label}</span>
                  {day.is_current ? (
                    <span className={`${ui.badge} ${styles.tagLive}`}> {t('dash.days.current_badge')}</span>
                  ) : null}
                </span>
              </td>
              <td className={`${styles.tabular} ${styles.dim}`} data-label={t('dash.days.col.started')}>
                {formatDateTime(day.started_at, lang)}
              </td>
              <td className={`${styles.tabular} ${styles.dim}`} data-label={t('dash.days.col.ended')}>
                {formatDateTime(day.ended_at, lang)}
              </td>
              <td className={styles.num} data-label={t('dash.days.col.sessions')}>
                {formatNumber(sessions)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
