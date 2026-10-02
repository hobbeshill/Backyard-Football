import type { DefOption, PlayOption } from './types';

export const offensivePlaybook: Record<string, PlayOption> = {
  SHORT_PASS: {
    name: 'ALIGNMENT: SPREAD',
    type: 'PASS',
    alignment: 'SPREAD',
    left: 'SLANT-L',
    right: 'SLANT-R',
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
    center: 'BLOCK',
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
    center: 'BLOCK',
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
    center: 'BLOCK',
    rbRoute: 'FLAT',
    desc: 'Off-tackle smash with WR blocking',
    risk: 'SAFE',
    routeType: 'MEDIUM',
    bestVs: ['BLITZ', 'ROBBER'],
    weakVs: ['COVER2MAN', 'QUARTERS'],
    expectedGain: [4, 10]
  },
  MESH: {
    name: 'CONCEPT: MESH',
    type: 'PASS',
    alignment: 'SPREAD',
    left: 'CROSS-R',
    right: 'CROSS-L',
    center: 'HITCH',
    rbRoute: 'FLAT',
    desc: 'Dual crossing drags pick man coverage with center hitch',
    risk: 'SAFE',
    routeType: 'SHORT',
    bestVs: ['COVER2MAN', 'ROBBER', 'BLITZ'],
    weakVs: ['QUARTERS', 'TAMPA2'],
    expectedGain: [6, 14]
  },
  SMASH: {
    name: 'CONCEPT: SMASH',
    type: 'PASS',
    alignment: 'SPREAD',
    left: 'HITCH',
    right: 'FLAG-R',
    center: 'CROSS-L',
    rbRoute: 'FLAT',
    desc: 'Hi-Lo corner + hitch combo that shreds Cover 2 / Tampa 2',
    risk: 'BALANCED',
    routeType: 'MEDIUM',
    bestVs: ['TAMPA2', 'COVER3'],
    weakVs: ['QUARTERS', 'BLITZ'],
    expectedGain: [10, 22]
  },
  POST_WHEEL: {
    name: 'CONCEPT: POST-WHEEL',
    type: 'PASS',
    alignment: 'TRIPS',
    left: 'POST-R',
    right: 'FLAG-R',
    center: 'WHEEL',
    rbRoute: 'FLAT',
    desc: 'Deep post & sideline wheel stretch that attacks Cover 3 & single-high',
    risk: 'EXPLOSIVE',
    routeType: 'VERTICAL',
    bestVs: ['COVER3', 'ROBBER', 'QUARTERS'],
    weakVs: ['BLITZ', 'COVER2MAN'],
    expectedGain: [18, 38]
  },
  PUNT: {
    name: 'SPECIAL TEAMS: PUNT',
    type: 'PUNT',
    alignment: 'SPREAD',
    left: 'GO',
    right: 'GO',
    center: 'BLOCK',
    rbRoute: 'BLOCK',
    desc: '4th Down Punt: High soaring spiral punt to flip field position',
    risk: 'SAFE',
    routeType: 'VERTICAL',
    expectedGain: [35, 55]
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
export const wrRoutes = ['SLANT-L', 'SLANT-R', 'FLAG-L', 'FLAG-R', 'COMEBACK', 'CROSS-L', 'CROSS-R', 'GO', 'BLOCK'];
export const outsideRoutes = wrRoutes;
export const middleRoutes = wrRoutes;
export const runningBackRoutes = ['FLAT', 'GO', 'ANGLE', 'BLOCK'];
export const conceptRoutes = ['POST-L', 'POST-R', 'HITCH', 'WHEEL'];
export const allRoutes = [...wrRoutes, ...conceptRoutes];
