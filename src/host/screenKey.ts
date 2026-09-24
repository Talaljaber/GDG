/** Screen keys for the host's shatter transitions (`DESIGN_SYSTEM.md` §6.2). */
import { LOADING_KEY } from '../components/ScreenTransition';
import type { HostController } from './useHost';

/**
 * Identity of the host screen for the shatter transition (DESIGN_SYSTEM §6.2):
 * H1 → H2 (round start), H2 → H3, each H3 step, H3 → H2 (next round start),
 * H3 → H4. H4 and H5 share one key: the day-board merge plays between them.
 */
export function hostScreenKey(host: Pick<HostController, 'data' | 'screen' | 'intermission'>): string {
  const { data, screen, intermission } = host;
  if (!data || screen === 'loading') return LOADING_KEY;
  switch (screen) {
    case 'lobby':
      return `lobby:${data.session.id}`;
    case 'round':
      return `round:${data.rounds.find((r) => r.status === 'playing')?.id ?? ''}`;
    case 'intermission': {
      if (!intermission) return LOADING_KEY; // spinner until the server offset is known
      const { step } = intermission.state;
      const part =
        intermission.next && (step === 'next_intro' || step === 'done') ? 'next' : step === 'session_total' ? 'total' : 'board';
      return `intermission:${intermission.round.id}:${part}`;
    }
    case 'results':
    case 'dayboard':
      return `end:${data.session.id}`;
  }
}

/** Screens that show the logo (H1, H4/H5): with reduced motion they swap instantly, the logo never fades (§5). */
export const showsLogo = (key: string): boolean => key.startsWith('lobby:') || key.startsWith('end:');
