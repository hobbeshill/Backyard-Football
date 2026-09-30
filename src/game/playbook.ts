import type { DefOption, PlayOption } from './types';

export const offensivePlaybook: Record<string, PlayOption> = {
  SHORT_PASS: { name: 'SHORT PASS', type: 'PASS', left: 'SLANT-L', right: 'QUICK-OUT', center: 'SLANT-R', rbRoute: 'FLAT', desc: 'Quick short timing routes' },
  CONTROL_PASS: { name: 'CONTROL PASS', type: 'PASS', left: 'COMEBACK', right: 'CROSS-L', center: 'CROSS-R', rbRoute: 'FLAT', desc: 'Reliable chain movers' },
  DEEP_SHOT: { name: 'DEEP SHOT', type: 'PASS', left: 'FLAG-L', right: 'FLAG-R', center: 'GO', rbRoute: 'FLAT', desc: 'Vertical stretch (zooms out)' },
  ISO: { name: 'RUN: ISO', type: 'ISO', left: 'GO', right: 'GO', center: 'SLANT-R', rbRoute: 'FLAT', desc: 'Direct handoff up middle' },
  SWEEP: { name: 'RUN: SWEEP', type: 'SWEEP', left: 'GO', right: 'GO', center: 'SLANT-R', rbRoute: 'FLAT', desc: 'Outside edge attack vs coverage' },
  POWER: { name: 'RUN: POWER', type: 'POWER', left: 'GO', right: 'GO', center: 'SLANT-R', rbRoute: 'FLAT', desc: 'Off-tackle smash with WR blocking' }
};

export const defensivePlaybook: Record<string, DefOption> = {
  COVER3: { name: 'COVER 3', desc: '3 deep zones, 4 underneath' },
  COVER2MAN: { name: 'COVER 2 MAN', desc: 'Man coverage with 2 deep safeties' },
  TAMPA2: { name: 'TAMPA 2', desc: 'MLB drops deep to plug seams' },
  BLITZ: { name: 'ZERO BLITZ', desc: 'All-out rush (multiple rushers)' },
  QUARTERS: { name: 'COVER 4', desc: '4 independent deep quadrants' },
  ROBBER: { name: 'MAN ROBBER', desc: 'Man coverage with middle safety robber' }
};

export const defensiveKeys = Object.keys(defensivePlaybook);
export const offensiveKeys = Object.keys(offensivePlaybook);
export const outsideRoutes = ['SLANT-L', 'SLANT-R', 'FLAG-L', 'FLAG-R', 'COMEBACK', 'GO'];
export const middleRoutes = ['SLANT-L', 'SLANT-R', 'CROSS-L', 'CROSS-R', 'COMEBACK'];
