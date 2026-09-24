/**
 * The one seam between the dashboard screens and Supabase: every panel reads
 * its api functions from this context. In the app (and in unit tests, where
 * `vi.mock('./api')` replaces the module) the default value is the real
 * `./api` module, so behaviour is unchanged; the dev-only design preview
 * (`src/dev/fixtures/dashboard.tsx`) provides fake functions instead, so the
 * screens render with fixture data and never touch the database.
 */
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import * as realApi from './api';

export type DashApi = Pick<
  typeof realApi,
  | 'adminAddBlockedTerm'
  | 'adminHideName'
  | 'adminRemoveBlockedTerm'
  | 'adminStartNewDay'
  | 'adminUnhideName'
  | 'countJoinedPlayers'
  | 'countJoinedPlayersForSession'
  | 'countScores'
  | 'fetchBlockedTerms'
  | 'fetchCombinedResults'
  | 'fetchCurrentEventDay'
  | 'fetchDayBoard'
  | 'fetchEventDays'
  | 'fetchHiddenNames'
  | 'fetchPlayersForSession'
  | 'fetchPlayingSession'
  | 'fetchRoundsForSession'
  | 'fetchScoresForSession'
  | 'fetchSessionById'
  | 'fetchSessionWinner'
  | 'fetchSessionsForDay'
>;

const DashApiContext = createContext<DashApi>(realApi);

export function DashApiProvider({ value, children }: { value: DashApi; children: ReactNode }) {
  return <DashApiContext.Provider value={value}>{children}</DashApiContext.Provider>;
}

export function useDashApi(): DashApi {
  return useContext(DashApiContext);
}
