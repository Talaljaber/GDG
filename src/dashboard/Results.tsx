/**
 * D4 Combined results (`SCREENS.md` §3): every score of the selected
 * day(s), sortable columns, day/game filters, "Best per name" toggle
 * (AC4.2), and a client-side CSV export of exactly what's shown (AC4.3).
 */
import { useEffect, useMemo, useState } from 'react';
import { formatNumber, useT } from '../i18n';
import { displayName } from '../lib/boards';
import ui from '../components/ui.module.css';
import styles from './dashboard.module.css';
import { buildCsv, csvFilename, downloadCsv } from './csv';
import { bestPerName, formatTimestamp, rowsToCsv, sortCombined, type SortDir, type SortKey } from './combinedResults';
import {
  fetchCombinedResults,
  fetchCurrentEventDay,
  fetchEventDays,
  type CombinedScoreRow,
  type EventDayRow,
  type GameId,
} from './api';

const ALL_DAYS = 'all';
const ALL_GAMES = 'all';
/** Sentinel for "the day filter isn't decided yet" (before the current-day fetch resolves), so the results effect doesn't fetch twice (once for a placeholder, once for the real default). */
const DAY_FILTER_UNSET = '';
const GAME_IDS: GameId[] = ['odd_one_out', 'stop_the_clock', 'simon', 'perfect_circle', 'trivia'];

export function ResultsPanel() {
  const t = useT();
  const [days, setDays] = useState<EventDayRow[]>([]);
  const [currentDay, setCurrentDay] = useState<EventDayRow | null>(null);
  const [dayFilter, setDayFilter] = useState<string>(DAY_FILTER_UNSET);
  const [gameFilter, setGameFilter] = useState<GameId | typeof ALL_GAMES>(ALL_GAMES);
  const [bestOnly, setBestOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [rows, setRows] = useState<CombinedScoreRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [all, current] = await Promise.all([fetchEventDays(), fetchCurrentEventDay()]);
        setDays(all);
        setCurrentDay(current);
        setDayFilter(current?.id ?? ALL_DAYS);
      } catch {
        setError('sys.generic_error');
      }
    })();
  }, []);

  useEffect(() => {
    if (dayFilter === DAY_FILTER_UNSET) return;
    let alive = true;
    setRows(null);
    void (async () => {
      try {
        const data = await fetchCombinedResults({
          eventDayId: dayFilter === ALL_DAYS ? null : dayFilter,
          game: gameFilter === ALL_GAMES ? null : gameFilter,
        });
        if (alive) setRows(data);
      } catch {
        if (alive) setError('sys.generic_error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [dayFilter, gameFilter]);

  const shown = useMemo(() => {
    if (!rows) return [];
    const reduced = bestOnly ? bestPerName(rows) : rows;
    return sortCombined(reduced, sortKey, sortDir);
  }, [rows, bestOnly, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'score' ? 'desc' : 'asc');
    }
  };

  const ariaSort = (key: SortKey): 'ascending' | 'descending' | 'none' =>
    key !== sortKey ? 'none' : sortDir === 'asc' ? 'ascending' : 'descending';

  const exportCsv = () => {
    const dayLabel = dayFilter === ALL_DAYS ? 'all-days' : (days.find((d) => d.id === dayFilter)?.label ?? currentDay?.label ?? 'day');
    const { headers, body } = rowsToCsv(shown, (g) => t(`game.${g}.name`));
    const csv = buildCsv(headers, body);
    downloadCsv(csvFilename(dayLabel, bestOnly ? 'best' : 'all'), csv);
  };

  const columns: { key: SortKey; label: string }[] = [
    { key: 'name', label: t('dash.results.col.name') },
    { key: 'game', label: t('dash.results.col.game') },
    { key: 'score', label: t('dash.results.col.score') },
    { key: 'time', label: t('dash.results.col.time') },
    { key: 'session', label: t('dash.results.col.session') },
  ];

  return (
    <div className={styles.main} data-testid="dash-results">
      <section className={styles.card}>
        <div className={styles.row}>
          <label className={styles.field}>
            <span>{t('dash.results.filter_day')}</span>
            <select className={ui.input} value={dayFilter} onChange={(e) => setDayFilter(e.target.value)} data-testid="results-day-select">
              <option value={ALL_DAYS}>{t('dash.results.all')}</option>
              {days.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                  {d.is_current ? ` (${t('dash.days.current_badge')})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>{t('dash.results.filter_game')}</span>
            <select
              className={ui.input}
              value={gameFilter}
              onChange={(e) => setGameFilter(e.target.value as GameId | typeof ALL_GAMES)}
              data-testid="results-game-select"
            >
              <option value={ALL_GAMES}>{t('dash.results.all')}</option>
              {GAME_IDS.map((g) => (
                <option key={g} value={g}>
                  {t(`game.${g}.name`)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.checkbox}>
            <input type="checkbox" checked={bestOnly} onChange={(e) => setBestOnly(e.target.checked)} data-testid="best-toggle" />
            {t('dash.results.best_toggle')}
          </label>
          <button type="button" className={ui.button} onClick={exportCsv} disabled={!rows || shown.length === 0} data-testid="export-csv">
            {t('dash.export')}
          </button>
        </div>
        {error ? (
          <p className={ui.error} role="alert">
            {t(error)}
          </p>
        ) : null}
        {!rows ? null : shown.length === 0 ? (
          <p className={ui.muted}>{t('dash.results.empty')}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table} data-testid="results-table">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.key}>
                      <button
                        type="button"
                        className={styles.sortButton}
                        aria-sort={ariaSort(c.key)}
                        onClick={() => toggleSort(c.key)}
                        data-testid={`sort-${c.key}`}
                      >
                        {c.label}
                        {sortKey === c.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} data-testid="results-row">
                    <td>
                      <bdi>{displayName(r.name, r.displaySuffix)}</bdi>
                    </td>
                    <td>{t(`game.${r.game}.name`)}</td>
                    <td>{formatNumber(r.score)}</td>
                    <td>{formatTimestamp(r.createdAt)}</td>
                    <td dir="ltr">{r.sessionCode ?? '–'}</td>
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
