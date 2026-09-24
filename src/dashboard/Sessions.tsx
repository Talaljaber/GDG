/**
 * D2 session history and D3 session detail (`SCREENS.md` §3).
 */
import { useEffect, useMemo, useState } from 'react';
import { formatNumber, useLang, useT } from '../i18n';
import { displayName } from '../lib/boards';
import ui from '../components/ui.module.css';
import styles from './dashboard.module.css';
import { useDashApi } from './dashApi';
import { formatTime } from './format';
import { useRenderCount } from './renderCount';
import { Alert, EmptyState, Icon, PageHeader, Panel, Select, TableSkeleton } from './parts';
import type { EventDayRow, PlayerRow, RoundRow, ScoreRow, SessionRow, SessionWinner } from './api';

// ------------------------------------------------------------------ D2

interface SessionListRow {
  session: SessionRow;
  players: number;
  winner: SessionWinner | null;
}

function StatusTag({ status }: { status: SessionRow['status'] }) {
  const t = useT();
  return <span className={`${ui.badge} ${status === 'playing' ? styles.tagLive : ''}`}>{t(`status.${status}`)}</span>;
}

export function SessionsPanel({ onOpenSession }: { onOpenSession: (sessionId: string) => void }) {
  useRenderCount('SessionsPanel');
  const t = useT();
  const { lang } = useLang();
  const api = useDashApi();
  const [days, setDays] = useState<EventDayRow[]>([]);
  const [dayId, setDayId] = useState<string | null>(null);
  const [rows, setRows] = useState<SessionListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [all, current] = await Promise.all([api.fetchEventDays(), api.fetchCurrentEventDay()]);
        setDays(all);
        setDayId(current?.id ?? all[0]?.id ?? null);
      } catch {
        setError('sys.generic_error');
      }
    })();
  }, [api]);

  useEffect(() => {
    if (!dayId) return;
    let alive = true;
    // Rows are cleared by the day select's onChange, in the same render as the new day.
    void (async () => {
      try {
        const sessions = await api.fetchSessionsForDay(dayId);
        const detailed = await Promise.all(
          sessions.map(async (session) => {
            const [players, winner] = await Promise.all([
              api.countJoinedPlayersForSession(session.id),
              api.fetchSessionWinner(session.id),
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
  }, [dayId, api]);

  return (
    <div className={styles.page} data-testid="dash-sessions">
      <PageHeader title={t('dash.nav.sessions')} description={t('dash.sessions.desc')} />
      <div className={styles.filters}>
        <Select
          label={t('dash.results.filter_day')}
          value={dayId ?? ''}
          onChange={(e) => {
            setRows(null);
            setDayId(e.target.value);
          }}
          data-testid="sessions-day-select"
        >
          {days.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
              {d.is_current ? ` (${t('dash.days.current_badge')})` : ''}
            </option>
          ))}
        </Select>
        {rows && rows.length > 0 ? (
          <span className={styles.filterCount}>{t('dash.sessions.count', { n: rows.length })}</span>
        ) : null}
      </div>
      {error ? <Alert>{t(error)}</Alert> : null}
      <Panel flush>
        {!rows ? (
          error ? (
            <EmptyState title={t('dash.sessions.empty')} />
          ) : (
            <TableSkeleton columns={6} />
          )
        ) : rows.length === 0 ? (
          <EmptyState title={t('dash.sessions.empty')} hint={t('dash.sessions.empty_hint')} />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table} data-testid="sessions-table">
              <thead>
                <tr>
                  <th>{t('dash.sessions.col.start')}</th>
                  <th>{t('dash.sessions.col.code')}</th>
                  <th>{t('dash.sessions.col.games')}</th>
                  <th className={styles.num}>{t('dash.sessions.col.players')}</th>
                  <th>{t('dash.sessions.col.top')}</th>
                  <th>{t('dash.sessions.col.status')}</th>
                  <th className={styles.colAffordance}>
                    <span className="visually-hidden">{t('dash.sessions.open')}</span>
                  </th>
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
                    <td className={styles.tabular} data-label={t('dash.sessions.col.start')}>{formatTime(session.started_at ?? session.created_at, lang)}</td>
                    <td className={`${styles.code} ${styles.primaryCell}`} data-label={t('dash.sessions.col.code')}>
                      <span dir="ltr">{session.code}</span>
                    </td>
                    <td className={styles.cellWrap} data-label={t('dash.sessions.col.games')}>{session.lineup.map((g) => t(`game.${g}.name`)).join(' · ')}</td>
                    <td className={styles.num} data-label={t('dash.sessions.col.players')}>{formatNumber(players)}</td>
                    <td data-label={t('dash.sessions.col.top')}>
                      {winner ? (
                        <span className={styles.winner}>
                          <bdi className={styles.nameCell}>{displayName(winner.name, winner.displaySuffix)}</bdi>
                          <span className={styles.winnerScore}>{formatNumber(winner.total)}</span>
                        </span>
                      ) : (
                        <span className={styles.dim}>–</span>
                      )}
                    </td>
                    <td className={styles.statusCell}>
                      <StatusTag status={session.status} />
                    </td>
                    <td className={styles.colAffordance}>
                      <Icon name="chevron" mirror className={styles.rowChevron} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------------ D3

export function SessionDetailPanel({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  useRenderCount('SessionDetailPanel');
  const t = useT();
  const { lang } = useLang();
  const api = useDashApi();
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
          api.fetchSessionById(sessionId),
          api.fetchPlayersForSession(sessionId),
          api.fetchRoundsForSession(sessionId),
          api.fetchScoresForSession(sessionId),
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
  }, [sessionId, api]);

  const scoreFor = useMemo(() => {
    const byPlayerRound = new Map<string, number>();
    for (const s of scores) byPlayerRound.set(`${s.player_row_id}\u0000${s.round_id}`, s.score);
    return (playerRowId: string, roundId: string) => byPlayerRound.get(`${playerRowId}\u0000${roundId}`);
  }, [scores]);

  const activePlayers = players.filter((p) => p.status !== 'removed').length;

  return (
    <div className={styles.page} data-testid="dash-session-detail">
      <button type="button" className={styles.backLink} onClick={onBack} data-testid="session-back">
        <Icon name="chevron" mirror className={styles.backIcon} />
        {t('dash.nav.sessions')}
      </button>
      {error ? <Alert>{t(error)}</Alert> : null}
      {!session && !error ? <TableSkeleton columns={5} rows={4} /> : null}
      {session ? (
        <>
          <PageHeader
            title={t('dash.session.detail_title', { code: session.code })}
            actions={<StatusTag status={session.status} />}
          />
          <dl className={`${styles.meta} ${styles.metaBar}`}>
            <div className={styles.metaItem}>
              <dt className={ui.eyebrow}>{t('dash.sessions.col.start')}</dt>
              <dd className={styles.tabular}>{formatTime(session.started_at ?? session.created_at, lang)}</dd>
            </div>
            <div className={styles.metaItem}>
              <dt className={ui.eyebrow}>{t('dash.sessions.col.players')}</dt>
              <dd className={styles.tabular}>{formatNumber(activePlayers)}</dd>
            </div>
            <div className={styles.metaItem}>
              <dt className={ui.eyebrow}>{t('dash.sessions.col.code')}</dt>
              <dd className={styles.code}>
                <span dir="ltr">{session.code}</span>
              </dd>
            </div>
          </dl>

          <Panel title={t('dash.session.rounds')} flush>
            <ol className={styles.roundList}>
              {rounds.length > 0
                ? rounds.map((r) => (
                    <li key={r.id} className={styles.roundItem}>
                      <span className={styles.roundNo}>{t('dash.session.col.round', { n: r.round_no })}</span>
                      <span className={styles.roundGame}>{t(`game.${r.game}.name`)}</span>
                      <span className={styles.roundReason}>
                        {r.end_reason ? t(`dash.session.end_reason.${r.end_reason}`) : t(`status.${session.status}`)}
                      </span>
                    </li>
                  ))
                : session.lineup.map((g, i) => (
                    <li key={`${g}-${i}`} className={styles.roundItem}>
                      <span className={styles.roundNo}>{t('dash.session.col.round', { n: i + 1 })}</span>
                      <span className={styles.roundGame}>{t(`game.${g}.name`)}</span>
                      <span className={styles.roundReason}>–</span>
                    </li>
                  ))}
            </ol>
          </Panel>

          <Panel title={t('dash.stat.players')} flush>
            {players.length === 0 ? (
              <EmptyState title={t('dash.session.no_players')} />
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table} data-testid="session-players-table">
                  <thead>
                    <tr>
                      <th>{t('dash.results.col.name')}</th>
                      {rounds.map((r) => (
                        <th key={r.id} className={styles.num}>
                          <span className={styles.thStack}>
                            <span>{t('dash.session.col.round', { n: r.round_no })}</span>
                            <span className={styles.thSub}>{t(`game.${r.game}.name`)}</span>
                          </span>
                        </th>
                      ))}
                      <th className={styles.num}>{t('dash.session.col.total')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((p) => {
                      const roundScores = rounds.map((r) => scoreFor(p.id, r.id));
                      const total = roundScores.reduce<number>((sum, s) => sum + (s ?? 0), 0);
                      const removed = p.status === 'removed';
                      return (
                        <tr key={p.id} className={removed ? styles.rowRemoved : undefined} data-testid="session-player-row">
                          <td className={styles.primaryCell}>
                            <span className={styles.nameWithTag}>
                              <bdi className={styles.nameCell}>{displayName(p.name, p.display_suffix)}</bdi>
                              {removed ? <span className={ui.badge}> {t('dash.session.removed')}</span> : null}
                            </span>
                          </td>
                          {roundScores.map((s, i) => (
                            <td
                              key={rounds[i].id}
                              className={`${styles.num} ${s === undefined ? styles.dim : ''}`}
                              data-label={t('dash.session.col.round', { n: rounds[i].round_no })}
                            >
                              {s === undefined ? t('results.breakdown_missing') : formatNumber(s)}
                            </td>
                          ))}
                          <td className={`${styles.num} ${styles.strong}`} data-label={t('dash.session.col.total')}>
                            {formatNumber(total)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
