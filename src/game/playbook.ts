import type { DefOption, PlayOption } from './types';

export const offensivePlaybook: Record<string, PlayOption> = {
  SHORT_PASS: {
    name: 'ALIGNMENT: SPREAD',
    type: 'PASS',
    alignment: 'SPREAD',
    left: 'SLANT-L',
    right: 'QUICK-OUT',
    center: 'SLANT-R',
    rbRoute: 'FLAT',
    desc: 'Balanced spacing with quick timing routes',
    risk: 'SAFE',
    routeType: 'SHORT',
    bestVs: ['COVER2MAN', 'ROBBER'],
    weakVs: ['QUARTERS', 'BLITZ'],
    expectedGain: [4, 9]
  },
  CONTROL_PASS: {
    name: 'ALIGNMENT: STACK',
    type: 'PASS',
    alignment: 'STACK',
    left: 'COMEBACK',
    right: 'CROSS-L',
    center: 'CROSS-R',
    rbRoute: 'FLAT',
    desc: 'Compressed alignment for controlled throws',
    risk: 'BALANCED',
    routeType: 'MEDIUM',
    bestVs: ['COVER3', 'TAMPA2'],
    weakVs: ['BLITZ', 'COVER2MAN'],
    expectedGain: [8, 16]
  },
  DEEP_SHOT: {
    name: 'ALIGNMENT: TRIPS',
    type: 'PASS',
    alignment: 'TRIPS',
    left: 'FLAG-L',
    right: 'FLAG-R',
    center: 'GO',
    rbRoute: 'FLAT',
    desc: 'Three-receiver vertical stretch',
    risk: 'EXPLOSIVE',
    routeType: 'VERTICAL',
    bestVs: ['QUARTERS', 'COVER3'],
    weakVs: ['BLITZ', 'COVER2MAN'],
    expectedGain: [18, 35]
  },
  ISO: {
    name: 'RUN PLAY',
    type: 'ISO',
    left: 'GO',
    right: 'GO',
    center: 'SLANT-R',
    rbRoute: 'FLAT',
    desc: 'Tap the RB to choose the inside or angle path',
    risk: 'BALANCED',
    routeType: 'MEDIUM',
    bestVs: ['ROBBER', 'BLITZ'],
    weakVs: ['COVER2MAN', 'TAMPA2'],
    expectedGain: [5, 12]
  },
  SWEEP: {
    name: 'RUN: SWEEP',
    type: 'SWEEP',
    left: 'GO',
    right: 'GO',
    center: 'SLANT-R',
    rbRoute: 'FLAT',
    desc: 'Outside edge attack vs coverage',
    risk: 'BALANCED',
    routeType: 'MEDIUM',
    bestVs: ['COVER3', 'QUARTERS'],
    weakVs: ['BLITZ', 'ROBBER'],
    expectedGain: [6, 14]
  },
  POWER: {
    name: 'RUN: POWER',
    type: 'POWER',
    left: 'GO',
    right: 'GO',
    center: 'SLANT-R',
    rbRoute: 'FLAT',
    desc: 'Off-tackle smash with WR blocking',
    risk: 'SAFE',
    routeType: 'MEDIUM',
    bestVs: ['BLITZ', 'ROBBER'],
    weakVs: ['COVER2MAN', 'QUARTERS'],
    expectedGain: [4, 10]
  }
};

export const defensivePlaybook: Record<string, DefOption> = {
  COVER3: {
    name: 'COVER 3',
    desc: '3 deep zones, 4 underneath',
    weakness: 'deep middle / seam',
    vulnerableRouteType: 'VERTICAL'
  },
  COVER2MAN: {
    name: 'COVER 2 MAN',
    desc: 'Man coverage with 2 deep safeties',
    weakness: 'boundary / quick routes',
    vulnerableRouteType: 'SHORT'
  },
  TAMPA2: {
    name: 'TAMPA 2',
    desc: 'MLB drops deep to plug seams',
    weakness: 'middle / intermediate throws',
    vulnerableRouteType: 'MEDIUM'
  },
  BLITZ: {
    name: 'ZERO BLITZ',
    desc: 'All-out rush (multiple rushers)',
    weakness: 'quick pass / scramble',
    vulnerableRouteType: 'SHORT'
  },
  QUARTERS: {
    name: 'COVER 4',
    desc: '4 independent deep quadrants',
    weakness: 'deep outside / vertical',
    vulnerableRouteType: 'VERTICAL'
  },
  ROBBER: {
    name: 'MAN ROBBER',
    desc: 'Man coverage with middle safety robber',
    weakness: 'middle-of-field / slants',
    vulnerableRouteType: 'MEDIUM'
  }
};

export const defensiveKeys = Object.keys(defensivePlaybook);
export const offensiveKeys = Object.keys(offensivePlaybook);
export const outsideRoutes = ['SLANT-L', 'SLANT-R', 'FLAG-L', 'FLAG-R', 'COMEBACK', 'GO'];
export const middleRoutes = ['SLANT-L', 'SLANT-R', 'CROSS-L', 'CROSS-R', 'COMEBACK'];
export const runningBackRoutes = ['FLAT', 'ANGLE'];
