/**
 * The one seam between the dashboard screens and Supabase: every panel reads
 * its api functions through `useDashApi()`. In the app (and in unit tests,
 * where `vi.mock('./api')` replaces the module) the value is the real `./api`
 * module, so behaviour is unchanged; the dev-only design preview
 * (`src/dev/fixtures/dashboard.tsx`) wraps screens in `DashApiProvider`
 * (`./apiContext.tsx`) with fake functions, so they render fixture data and
 * never touch the database.
 */
import { createContext, useContext } from 'react';
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

export const DashApiContext = createContext<DashApi>(realApi);

export function useDashApi(): DashApi {
  return useContext(DashApiContext);
}
