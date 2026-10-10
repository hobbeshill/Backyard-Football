import type { DefOption, PlayOption } from './types';
import { SIGNATURE_PLAYS, signatureOffenseIds, signatureDefenseIds } from './signaturePlays';
import { SEC_TEAM_TECMO_PLAYS } from './tecmoPlaybook';

export const offensivePlaybook: Record<string, PlayOption> = {
  SHORT_PASS: {
    name: 'ALIGNMENT: SPREAD',
    type: 'PASS',
    alignment: 'SPREAD',
    left: 'SLANT-R',
    right: 'SLANT-L',
    center: 'COMEBACK',
    slot: 'HITCH',
    rbRoute: 'FLAT',
    desc: 'Intermediate inside slants and comeback with a short hitch and RB flat checkdown',
    risk: 'SAFE',
    routeType: 'MEDIUM',
    bestVs: ['ZONE34', 'ZONE232'],
    weakVs: ['COVER2', 'ZONE151'],
    expectedGain: [8, 16]
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
    center: 'POST-R',
    slot: 'HITCH',
    rbRoute: 'FLAT',
    desc: 'Intermediate crossing routes with a deep post and short hitch checkdown',
    risk: 'SAFE',
    routeType: 'MEDIUM',
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
  },
  PRO_QUICK_SLANTS: {
    name: 'Quick Slants',
    type: 'PASS',
    alignment: 'SPREAD',
    left: 'SLANT-R',
    right: 'SLANT-L',
    center: 'COMEBACK',
    slot: 'HITCH',
    rbRoute: 'BLOCK',
    desc: 'Inside slants to 12 yards and a 12-yard comeback, with a 6-yard slot hitch checkdown',
    risk: 'SAFE',
    routeType: 'MEDIUM',
    expectedGain: [8, 16]
  },
  PRO_MESH: {
    name: 'Mesh Concept',
    type: 'PASS',
    alignment: 'SPREAD',
    left: 'CROSS-R',
    right: 'CROSS-L',
    center: 'POST-R',
    slot: 'HITCH',
    rbRoute: 'BLOCK',
    desc: 'Two intermediate crossers create a rub while a deep post clears space for a short slot hitch',
    risk: 'SAFE',
    routeType: 'MEDIUM',
    expectedGain: [8, 20]
  },
  PRO_VERTS: {
    name: 'Verts / 4-Verticals',
    type: 'PASS',
    alignment: 'SPREAD',
    left: 'GO',
    right: 'GO',
    center: 'GO',
    slot: 'GO',
    rbRoute: 'BLOCK',
    desc: 'All four receivers run 35-yard go routes to stress deep zones; RB stays in protection',
    risk: 'EXPLOSIVE',
    routeType: 'VERTICAL',
    expectedGain: [15, 35]
  },
  PRO_DOUBLE_MOVES: {
    name: 'Double Moves / Out-and-Up',
    type: 'PASS',
    alignment: 'SPREAD',
    left: 'FLAG-L',
    right: 'FLAG-R',
    center: 'POST-R',
    slot: 'HITCH',
    rbRoute: 'BLOCK',
    desc: 'Deep boundary corners and a post stretch coverage, with a short slot hitch checkdown',
    risk: 'EXPLOSIVE',
    routeType: 'VERTICAL',
    expectedGain: [15, 35]
  },
  PRO_SCREEN: {
    name: 'Screen / Bubble Screen',
    type: 'PASS',
    alignment: 'TRIPS',
    left: 'BLOCK',
    right: 'SLANT-L',
    center: 'BLOCK',
    slot: 'BLOCK',
    rbRoute: 'BLOCK',
    desc: 'Quick screen behind a wall of blockers, with the outside receiver cutting across the middle on an inside slant',
    risk: 'SAFE',
    routeType: 'SHORT',
    expectedGain: [3, 8]
  },
  PRO_JET_SWEEP: {
    name: 'Jet Sweep',
    type: 'SWEEP',
    alignment: 'SPREAD',
    left: 'GO',
    right: 'GO',
    center: 'BLOCK',
    slot: 'BLOCK',
    rbRoute: 'FLAT',
    desc: 'Slot receiver motions across the backfield at full speed and takes a handoff heading toward the edge',
    risk: 'BALANCED',
    routeType: 'MEDIUM',
    expectedGain: [4, 12]
  },
  PRO_DRAW: {
    name: 'Draw / RB Fake-Pass Run',
    type: 'ISO',
    alignment: 'SPREAD',
    left: 'GO',
    right: 'GO',
    center: 'BLOCK',
    slot: 'BLOCK',
    rbRoute: 'FLAT',
    desc: 'Play-action pass look designed to freeze coverage before the quarterback hands off late up the middle',
    risk: 'BALANCED',
    routeType: 'MEDIUM',
    expectedGain: [4, 12]
  }
};

export const defensivePlaybook: Record<string, DefOption> = {
  MAN_FREE: {
    name: 'MAN-FREE DEFENSE',
    desc: 'Man coverage with one deep safety; trusts quick corners and attacks short routes',
    weakness: 'crossing rubs and double moves',
    vulnerableRouteType: 'VERTICAL'
  },
  DEEP_THIRDS: {
    name: 'DEEP THIRDS DEFENSE',
    desc: 'Three deep zones keep vertical threats in front; concedes underneath space',
    weakness: 'underneath crossers and flat routes',
    vulnerableRouteType: 'SHORT'
  },
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

export const proDefensivePlaybook: Record<string, DefOption> = {
  PRO_COVER2_HARD_FLAT: {
    name: 'Cover 2 Hard Flat',
    desc: 'Corners and flat defenders jump short routes immediately; vulnerable over top',
    weakness: 'deep sideline seams and vertical routes',
    vulnerableRouteType: 'VERTICAL'
  },
  PRO_COVER1_MAN: {
    name: 'Cover 1 Man-Free',
    desc: 'Single-high safety with man-to-man coverage across the board. Great for locking down short routes, vulnerable to deep double-moves',
    weakness: 'double-moves and crossing rubs',
    vulnerableRouteType: 'VERTICAL'
  },
  PRO_COVER3_DEEP: {
    name: 'Cover 3 Deep Zone',
    desc: 'Three deep defenders split the field into thirds; excellent for preventing deep bombs, vulnerable underneath',
    weakness: 'underneath crossers and flat routes',
    vulnerableRouteType: 'SHORT'
  },
  PRO_COVER4_QUARTERS: {
    name: 'Cover 4 Quarters',
    desc: 'Four deep defenders match vertical routes. Excellent against deep passes, but soft against runs and quick underneath routes',
    weakness: 'draw runs, jet sweeps, and underneath routes',
    vulnerableRouteType: 'SHORT'
  },
  PRO_BLITZ_ZERO: {
    name: 'Aggressive Blitz / Zero Coverage',
    desc: 'Heavy pressure scheme with zero deep safeties. Shuts down runs and quick passes instantly, but high risk against deep plays',
    weakness: 'deep vertical routes (4-verts, double-moves)',
    vulnerableRouteType: 'VERTICAL'
  },
  PRO_RUN_STOP_BOX: {
    name: 'Run-Stop 6-1 / Box Stack',
    desc: 'Linebackers and defensive backs crowd the line of scrimmage to completely stuff the run game',
    weakness: 'deep vertical passing plays',
    vulnerableRouteType: 'VERTICAL'
  },
  PRO_TAMPA2: {
    name: 'Cover 2 Zone-Vapor / Tampa 2',
    desc: 'Middle linebacker drops deep to help safeties while underneath zones play moderate depth. Good generalist defense',
    weakness: 'sideline boundary windows and overloaded seams',
    vulnerableRouteType: 'MEDIUM'
  }
};

export const eliteOffensiveKeys = ['SHORT_PASS', 'CONTROL_PASS', 'DEEP_SHOT', 'ISO', 'SWEEP', 'POWER', 'MESH', 'SMASH', 'POST_WHEEL'];
export const proOffensiveKeys = ['PRO_QUICK_SLANTS', 'PRO_MESH', 'PRO_VERTS', 'PRO_DOUBLE_MOVES', 'PRO_SCREEN', 'PRO_JET_SWEEP', 'PRO_DRAW'];
export const eliteDefensiveKeys = ['COVER2', 'ZONE34', 'ZONE232', 'ZONE151', 'MAN_FREE', 'DEEP_THIRDS'];
export const proDefensiveKeys = [
  'PRO_COVER2_HARD_FLAT',
  'PRO_COVER1_MAN',
  'PRO_COVER3_DEEP',
  'PRO_COVER4_QUARTERS',
  'PRO_BLITZ_ZERO',
  'PRO_RUN_STOP_BOX',
  'PRO_TAMPA2'
];

for (const [teamId, signature] of Object.entries(SIGNATURE_PLAYS)) {
  signatureOffenseIds(teamId).forEach((id, index) => {
    offensivePlaybook[id] = signature.offense[index];
    offensivePlaybook[`PRO_${id}`] = signature.offense[index];
    eliteOffensiveKeys.push(id);
    proOffensiveKeys.push(`PRO_${id}`);
  });
  signatureDefenseIds(teamId).forEach((id, index) => {
    defensivePlaybook[id] = signature.defense[index];
    proDefensivePlaybook[`PRO_${id}`] = signature.defense[index];
    eliteDefensiveKeys.push(id);
    proDefensiveKeys.push(`PRO_${id}`);
  });
}

export const allDefensivePlaybook: Record<string, DefOption> = {
  ...defensivePlaybook,
  ...proDefensivePlaybook
};

for (const plays of Object.values(SEC_TEAM_TECMO_PLAYS)) {
  for (const play of plays) {
    offensivePlaybook[play.id] = play;
    allDefensivePlaybook[play.id] = {
      name: `Defend: ${play.name}`,
      desc: `Defensive scheme aligned to defend against ${play.name} (${play.category})`,
      weakness: play.isRun ? 'deep vertical passing' : 'perimeter edge run',
      vulnerableRouteType: play.isRun ? 'VERTICAL' : 'SHORT'
    };
  }
}

export const defensiveKeys = Object.keys(defensivePlaybook);
export const offensiveKeys = Object.keys(offensivePlaybook);
export const wrRoutes = ['SLANT-L', 'SLANT-R', 'FLAG-L', 'FLAG-R', 'COMEBACK', 'CROSS-L', 'CROSS-R', 'GO', 'FLY', 'BLOCK'];
export const outsideRoutes = wrRoutes;
export const middleRoutes = wrRoutes;
export const runningBackRoutes = ['FLAT', 'GO', 'ANGLE', 'BLOCK'];
export const conceptRoutes = ['POST-L', 'POST-R', 'HITCH', 'WHEEL'];
export const allRoutes = [...wrRoutes, ...conceptRoutes];
