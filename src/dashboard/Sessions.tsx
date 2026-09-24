/**
 * D2 session history and D3 session detail (`SCREENS.md` §3).
 */
import { useEffect, useMemo, useState } from 'react';
import { formatNumber, useT } from '../i18n';
import { displayName } from '../lib/boards';
import ui from '../components/ui.module.css';
import styles from './dashboard.module.css';
import {
  countJoinedPlayersForSession,
  fetchCurrentEventDay,
  fetchEventDays,
  fetchPlayersForSession,
  fetchRoundsForSession,
  fetchScoresForSession,
  fetchSessionById,
  fetchSessionWinner,
  fetchSessionsForDay,
  type EventDayRow,
  type PlayerRow,
  type RoundRow,
  type ScoreRow,
  type SessionRow,
  type SessionWinner,
} from './api';

// ------------------------------------------------------------------ D2

interface SessionListRow {
  session: SessionRow;
  players: number;
  winner: SessionWinner | null;
}

function formatTime(iso: string | null): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function SessionsPanel({ onOpenSession }: { onOpenSession: (sessionId: string) => void }) {
  const t = useT();
  const [days, setDays] = useState<EventDayRow[]>([]);
  const [dayId, setDayId] = useState<string | null>(null);
  const [rows, setRows] = useState<SessionListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [all, current] = await Promise.all([fetchEventDays(), fetchCurrentEventDay()]);
        setDays(all);
        setDayId(current?.id ?? all[0]?.id ?? null);
      } catch {
        setError('sys.generic_error');
      }
    })();
  }, []);

  useEffect(() => {
    if (!dayId) return;
    let alive = true;
    setRows(null);
    void (async () => {
      try {
        const sessions = await fetchSessionsForDay(dayId);
        const detailed = await Promise.all(
          sessions.map(async (session) => {
            const [players, winner] = await Promise.all([
              countJoinedPlayersForSession(session.id),
              fetchSessionWinner(session.id),
            ]);
            return { session, players, winner };
          }),
        );
        if (alive) setRows(detailed.reverse());
      } catch {
        if (alive) setError('sys.generic_error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [dayId]);

  return (
    <div className={styles.main} data-testid="dash-sessions">
      <section className={styles.card}>
        <div className={styles.row}>
          <label className={styles.field}>
            <span>{t('dash.results.filter_day')}</span>
            <select className={ui.input} value={dayId ?? ''} onChange={(e) => setDayId(e.target.value)} data-testid="sessions-day-select">
              {days.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                  {d.is_current ? ` (${t('dash.days.current_badge')})` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error ? (
          <p className={ui.error} role="alert">
            {t(error)}
          </p>
        ) : null}
        {!rows ? null : rows.length === 0 ? (
          <p className={ui.muted}>{t('dash.sessions.empty')}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table} data-testid="sessions-table">
              <thead>
                <tr>
                  <th>{t('dash.sessions.col.start')}</th>
                  <th>{t('dash.sessions.col.code')}</th>
                  <th>{t('dash.sessions.col.games')}</th>
                  <th>{t('dash.sessions.col.players')}</th>
                  <th>{t('dash.sessions.col.top')}</th>
                  <th>{t('dash.sessions.col.status')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ session, players, winner }) => (
                  <tr
                    key={session.id}
                    className={styles.tableRowClickable}
                    onClick={() => onOpenSession(session.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpenSession(session.id);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    data-testid="session-row"
                  >
                    <td>{formatTime(session.started_at ?? session.created_at)}</td>
                    <td dir="ltr">{session.code}</td>
                    <td>{session.lineup.map((g) => t(`game.${g}.name`)).join(' · ')}</td>
                    <td>{formatNumber(players)}</td>
                    <td>{winner ? <bdi>{displayName(winner.name, winner.displaySuffix)}</bdi> : '–'}</td>
                    <td>
                      <span className={styles.badge}>{t(`status.${session.status}`)}</span>
                    </td>
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

// ------------------------------------------------------------------ D3

export function SessionDetailPanel({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const t = useT();
  const [session, setSession] = useState<SessionRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [s, p, r, sc] = await Promise.all([
          fetchSessionById(sessionId),
          fetchPlayersForSession(sessionId),
          fetchRoundsForSession(sessionId),
          fetchScoresForSession(sessionId),
        ]);
        if (!alive) return;
        setSession(s);
        setPlayers(p);
        setRounds(r);
        setScores(sc);
      } catch {
        if (alive) setError('sys.generic_error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [sessionId]);

  const scoreFor = useMemo(() => {
    const byPlayerRound = new Map<string, number>();
    for (const s of scores) byPlayerRound.set(`${s.player_row_id}\u0000${s.round_id}`, s.score);
    return (playerRowId: string, roundId: string) => byPlayerRound.get(`${playerRowId}\u0000${roundId}`);
  }, [scores]);

  return (
    <div className={styles.main} data-testid="dash-session-detail">
      <button type="button" className={`${ui.linkButton} ${styles.backLink}`} onClick={onBack} data-testid="session-back">
        <svg className={styles.backIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M15 5 L9 12 L15 19"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {t('dash.nav.sessions')}
      </button>
      {error ? (
        <p className={ui.error} role="alert">
          {t(error)}
        </p>
      ) : null}
      {session ? (
        <>
          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>{t('dash.session.detail_title', { code: session.code })}</h2>
            <p>
              {rounds
                .map((r) => `${t('dash.session.col.round', { n: r.round_no })}: ${t(`game.${r.game}.name`)}${r.end_reason ? ` (${t(`dash.session.end_reason.${r.end_reason}`)})` : ''}`)
                .join(' · ')}
            </p>
          </section>
          <section className={styles.card}>
            <div className={styles.tableWrap}>
              <table className={styles.table} data-testid="session-players-table">
                <thead>
                  <tr>
                    <th>{t('dash.results.col.name')}</th>
                    {rounds.map((r) => (
                      <th key={r.id}>{t('dash.session.col.round', { n: r.round_no })}</th>
                    ))}
                    <th>{t('dash.session.col.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p) => {
                    const roundScores = rounds.map((r) => scoreFor(p.id, r.id));
                    const total = roundScores.reduce<number>((sum, s) => sum + (s ?? 0), 0);
                    return (
                      <tr key={p.id} data-testid="session-player-row">
                        <td>
                          <bdi>{displayName(p.name, p.display_suffix)}</bdi>
                          {p.status === 'removed' ? (
                            <span className={`${styles.badge} ${styles.badgeAmber}`}> {t('dash.session.removed')}</span>
                          ) : null}
                        </td>
                        {roundScores.map((s, i) => (
                          <td key={i}>{s === undefined ? t('results.breakdown_missing') : formatNumber(s)}</td>
                        ))}
                        <td>{formatNumber(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
