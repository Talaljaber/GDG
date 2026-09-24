/**
 * D6 Event days (`SCREENS.md` §3): list of days with session counts; start a
 * new event day (label + confirm), disabled while a session is playing
 * (AC4.6).
 */
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { formatNumber, useT } from '../i18n';
import { ConfirmDialog } from '../components/ConfirmDialog';
import ui from '../components/ui.module.css';
import styles from './dashboard.module.css';
import { isNewDayBlocked } from './combinedResults';
import { adminStartNewDay, fetchEventDays, fetchPlayingSession, fetchSessionsForDay, type EventDayRow } from './api';

interface DayRow {
  day: EventDayRow;
  sessions: number;
}

export function DaysPanel() {
  const t = useT();
  const [rows, setRows] = useState<DayRow[] | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [label, setLabel] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      const [days, playing] = await Promise.all([fetchEventDays(), fetchPlayingSession()]);
      const withCounts = await Promise.all(
        days.map(async (day) => ({ day, sessions: (await fetchSessionsForDay(day.id)).length })),
      );
      setRows(withCounts);
      setBlocked(isNewDayBlocked(playing));
    } catch {
      setError('sys.generic_error');
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!label.trim() || blocked) return;
    setConfirming(true);
  };

  const confirmStart = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminStartNewDay(label.trim());
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
    <div className={styles.main} data-testid="dash-days">
      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>{t('dash.days.start_new')}</h2>
        <form className={styles.row} onSubmit={submit} data-testid="new-day-form">
          <label className={styles.field}>
            <span>{t('dash.days.label')}</span>
            <input
              className={ui.input}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={40}
              disabled={blocked}
              data-testid="new-day-input"
            />
          </label>
          <button type="submit" className={ui.button} disabled={blocked || !label.trim()} data-testid="new-day-submit">
            {t('dash.days.start_new')}
          </button>
        </form>
        {blocked ? (
          <p className={ui.error} role="status" data-testid="new-day-blocked">
            {t('dash.days.blocked_running')}
          </p>
        ) : null}
        {error ? (
          <p className={ui.error} role="alert">
            {t(error)}
          </p>
        ) : null}
        {confirming ? (
          <ConfirmDialog busy={busy} onCancel={() => setConfirming(false)} onConfirm={() => void confirmStart()}>
            {t('dash.days.confirm')}
          </ConfirmDialog>
        ) : null}
      </section>

      <section className={styles.card}>
        {!rows ? null : (
          <div className={styles.tableWrap}>
            <table className={styles.table} data-testid="days-table">
              <thead>
                <tr>
                  <th>{t('dash.results.filter_day')}</th>
                  <th>{t('dash.days.col.started')}</th>
                  <th>{t('dash.days.col.ended')}</th>
                  <th>{t('dash.days.col.sessions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ day, sessions }) => (
                  <tr key={day.id} data-testid="day-row">
                    <td>
                      {day.label}
                      {day.is_current ? <span className={styles.badge}> {t('dash.days.current_badge')}</span> : null}
                    </td>
                    <td>{new Date(day.started_at).toLocaleString()}</td>
                    <td>{day.ended_at ? new Date(day.ended_at).toLocaleString() : '–'}</td>
                    <td>{formatNumber(sessions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
