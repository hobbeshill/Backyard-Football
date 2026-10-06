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
    bestVs: ['ZONE34', 'ZONE232'],
    weakVs: ['COVER2', 'ZONE151'],
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
    bestVs: ['COVER2', 'ZONE151'],
    weakVs: ['ZONE34', 'ZONE232'],
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
    bestVs: ['COVER2', 'ZONE151'],
    weakVs: ['ZONE34', 'ZONE232'],
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
    bestVs: ['ZONE151'],
    weakVs: ['ZONE34', 'COVER2'],
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
    bestVs: ['ZONE232'],
    weakVs: ['ZONE34', 'COVER2'],
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
    bestVs: ['ZONE151'],
    weakVs: ['ZONE34', 'ZONE232'],
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
    bestVs: ['COVER2', 'ZONE151', 'ZONE34'],
    weakVs: ['ZONE232'],
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
    desc: 'Hi-Lo corner and hitch combo that stresses Cover 2 flat defenders',
    risk: 'BALANCED',
    routeType: 'MEDIUM',
    bestVs: ['COVER2'],
    weakVs: ['ZONE151', 'ZONE232'],
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
    desc: 'Deep post and sideline wheel stretch that attacks 3-4 and 1-5-1 shells',
    risk: 'EXPLOSIVE',
    routeType: 'VERTICAL',
    bestVs: ['ZONE151', 'ZONE34'],
    weakVs: ['COVER2', 'ZONE232'],
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
  },
  FIELD_GOAL: {
    name: 'SPECIAL TEAMS: FIELD GOAL',
    type: 'FIELD_GOAL',
    alignment: 'SPREAD',
    left: 'BLOCK',
    right: 'BLOCK',
    center: 'BLOCK',
    rbRoute: 'BLOCK',
    desc: 'Field Goal: 3-point kick attempt through the uprights from up to 60 yards',
    risk: 'SAFE',
    routeType: 'SHORT',
    expectedGain: [0, 0]
  }
};

export const defensivePlaybook: Record<string, DefOption> = {
  COVER2: {
    name: '1-4-2 DEFENSE (COVER 2)',
    desc: 'One rusher, two middle linebackers, two flat corners, and two deep safeties',
    weakness: 'deep sideline seams',
    vulnerableRouteType: 'VERTICAL'
  },
  ZONE34: {
    name: '3-4 ZONE',
    desc: 'Three on the line rush or stunt while four defenders cover intermediate and deep zones',
    weakness: 'quick routes behind the rush',
    vulnerableRouteType: 'SHORT'
  },
  ZONE232: {
    name: '2-3-2 ZONE',
    desc: 'Two upfront, three across the middle, and two deep defenders tracking long balls',
    weakness: 'intermediate sideline windows',
    vulnerableRouteType: 'MEDIUM'
  },
  ZONE151: {
    name: '1-5-1 DEFENSE',
    desc: 'One rusher, five across the intermediate level, and one deep safety',
    weakness: 'deep middle and outside vertical routes',
    vulnerableRouteType: 'VERTICAL'
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
