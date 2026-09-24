/**
 * D1 Today (`SCREENS.md` §3): the current event day, stat tiles, the running
 * session's summary (or "no session running"), and the quick hide-a-name
 * field (AC4.4).
 */
import { useCallback, useEffect, useState } from 'react';
import { formatNumber, useT } from '../i18n';
import styles from './dashboard.module.css';
import { HideNameField } from './Names';
import { useDashApi, type DashApi } from './apiContext';
import { Alert, EmptyState, PageHeader, Panel } from './parts';
import { formatTime } from './format';
import type { EventDayRow, SessionRow } from './api';

const RUNNING_STATUSES: SessionRow['status'][] = ['pending', 'lobby', 'playing', 'results'];

interface TodayData {
  day: EventDayRow | null;
  running: SessionRow | null;
  sessionCount: number;
  playerCount: number;
  scoreCount: number;
}

async function load(api: DashApi): Promise<TodayData> {
  const day = await api.fetchCurrentEventDay();
  if (!day) return { day: null, running: null, sessionCount: 0, playerCount: 0, scoreCount: 0 };
  const sessions = await api.fetchSessionsForDay(day.id);
  const running = [...sessions].reverse().find((s) => RUNNING_STATUSES.includes(s.status)) ?? null;
  const [playerCount, scoreCount] = await Promise.all([api.countJoinedPlayers(day.id), api.countScores(day.id)]);
  return { day, running, sessionCount: sessions.length, playerCount, scoreCount };
}

export function TodayPanel() {
  const t = useT();
  const api = useDashApi();
  const [data, setData] = useState<TodayData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await load(api));
      setError(null);
    } catch {
      setError('sys.generic_error');
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const stats: { id: string; label: string; value: number | undefined }[] = [
    { id: 'players', label: t('dash.stat.players'), value: data?.playerCount },
    { id: 'sessions', label: t('dash.stat.sessions'), value: data?.sessionCount },
    { id: 'scores', label: t('dash.stat.scores'), value: data?.scoreCount },
  ];

  return (
    <div className={styles.page} data-testid="dash-today">
      <PageHeader
        eyebrow={data?.day ? t('dash.days.current') : undefined}
        title={data?.day ? data.day.label : t('dash.nav.today')}
        description={
          data?.day ? t('dash.today.desc', { time: formatTime(data.day.started_at) }) : t('dash.today.desc_none')
        }
      />
      {error ? <Alert>{t(error)}</Alert> : null}

      <section className={styles.stats} aria-busy={!data}>
        {stats.map((s) => (
          <div key={s.id} className={styles.stat}>
            <span className={styles.eyebrow}>{s.label}</span>
            <span className={`${styles.statValue} ${!data ? styles.statValueLoading : ''}`} data-testid={`stat-${s.id}`}>
              {formatNumber(s.value ?? 0)}
            </span>
          </div>
        ))}
      </section>

      <div className={styles.split}>
        <Panel
          title={t('dash.today.running')}
          aside={
            data?.running ? (
              <span className={`${styles.tag} ${data.running.status === 'playing' ? styles.tagLive : ''}`}>
                {t(`status.${data.running.status}`)}
              </span>
            ) : null
          }
        >
          {!data ? (
            <div className={styles.skeletonBlock} aria-hidden="true" />
          ) : data.running ? (
            <dl className={styles.meta} data-testid="today-running">
              <div className={styles.metaItem}>
                <dt className={styles.eyebrow}>{t('dash.sessions.col.code')}</dt>
                <dd className={styles.metaCode} dir="ltr">
                  {data.running.code}
                </dd>
              </div>
              <div className={styles.metaItem}>
                <dt className={styles.eyebrow}>{t('dash.sessions.col.status')}</dt>
                <dd>{t(`status.${data.running.status}`)}</dd>
              </div>
              <div className={`${styles.metaItem} ${styles.metaWide}`}>
                <dt className={styles.eyebrow}>{t('dash.sessions.col.games')}</dt>
                <dd>
                  <ol className={styles.lineup}>
                    {data.running.lineup.map((g, i) => (
                      <li key={`${g}-${i}`}>
                        <span className={styles.lineupNo}>{formatNumber(i + 1)}</span>
                        {t(`game.${g}.name`)}
                      </li>
                    ))}
                  </ol>
                </dd>
              </div>
            </dl>
          ) : (
            <div data-testid="today-none">
              <EmptyState title={t('dash.today.none')} hint={t('dash.today.none_hint')} />
            </div>
          )}
        </Panel>

        <Panel title={t('dash.names.hide_title')}>
          <p className={styles.panelNote}>{t('dash.today.hide_note')}</p>
          <HideNameField onHidden={() => void reload()} />
        </Panel>
      </div>
    </div>
  );
}
