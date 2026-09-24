/**
 * D1 Today (`SCREENS.md` §3): the current event day, the running session's
 * summary (or "no session running"), stat tiles, and the quick hide-a-name
 * field (AC4.4).
 */
import { useCallback, useEffect, useState } from 'react';
import { formatNumber, useT } from '../i18n';
import ui from '../components/ui.module.css';
import styles from './dashboard.module.css';
import { HideNameField } from './Names';
import {
  countJoinedPlayers,
  countScores,
  fetchCurrentEventDay,
  fetchSessionsForDay,
  type EventDayRow,
  type SessionRow,
} from './api';

const RUNNING_STATUSES: SessionRow['status'][] = ['pending', 'lobby', 'playing', 'results'];

interface TodayData {
  day: EventDayRow | null;
  running: SessionRow | null;
  sessionCount: number;
  playerCount: number;
  scoreCount: number;
}

async function load(): Promise<TodayData> {
  const day = await fetchCurrentEventDay();
  if (!day) return { day: null, running: null, sessionCount: 0, playerCount: 0, scoreCount: 0 };
  const sessions = await fetchSessionsForDay(day.id);
  const running = [...sessions].reverse().find((s) => RUNNING_STATUSES.includes(s.status)) ?? null;
  const [playerCount, scoreCount] = await Promise.all([countJoinedPlayers(day.id), countScores(day.id)]);
  return { day, running, sessionCount: sessions.length, playerCount, scoreCount };
}

export function TodayPanel() {
  const t = useT();
  const [data, setData] = useState<TodayData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await load());
      setError(null);
    } catch {
      setError('sys.generic_error');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className={styles.main} data-testid="dash-today">
      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>{data?.day ? data.day.label : t('dash.title')}</h2>
        {error ? (
          <p className={ui.error} role="alert">
            {t(error)}
          </p>
        ) : null}
        {!data ? null : data.running ? (
          <div data-testid="today-running">
            <p>
              <strong>{t('dash.today.running')}</strong> · {data.running.code} ·{' '}
              {t(`status.${data.running.status}`)}
            </p>
            <p>{data.running.lineup.map((g) => t(`game.${g}.name`)).join(' · ')}</p>
          </div>
        ) : (
          <p className={ui.muted} data-testid="today-none">
            {t('dash.today.none')}
          </p>
        )}
      </section>

      <section className={`${styles.card} ${styles.statGrid}`}>
        <div className={styles.stat}>
          <span className={styles.statValue} data-testid="stat-players">
            {formatNumber(data?.playerCount ?? 0)}
          </span>
          <span className={styles.statLabel}>{t('dash.stat.players')}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue} data-testid="stat-sessions">
            {formatNumber(data?.sessionCount ?? 0)}
          </span>
          <span className={styles.statLabel}>{t('dash.stat.sessions')}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue} data-testid="stat-scores">
            {formatNumber(data?.scoreCount ?? 0)}
          </span>
          <span className={styles.statLabel}>{t('dash.stat.scores')}</span>
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>{t('dash.names.hide_title')}</h2>
        <HideNameField onHidden={() => void reload()} />
      </section>
    </div>
  );
}
