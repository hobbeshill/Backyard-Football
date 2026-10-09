import { SIGNATURE_PLAYS, signatureOffenseIds, signatureDefenseIds, type SignatureProOffenseId, type SignatureProDefenseId, type DefenseLandmark } from './signaturePlays';

export type TacticalMode = 'ELITE' | 'PRO';

export type ProOffensePlayId =
  | 'PRO_QUICK_SLANTS'
  | 'PRO_MESH'
  | 'PRO_VERTS'
  | 'PRO_DOUBLE_MOVES'
  | 'PRO_SCREEN'
  | 'PRO_JET_SWEEP'
  | 'PRO_DRAW'
  | SignatureProOffenseId;

export type ProDefensePlayId =
  | 'PRO_COVER2_HARD_FLAT'
  | 'PRO_COVER1_MAN'
  | 'PRO_COVER3_DEEP'
  | 'PRO_COVER4_QUARTERS'
  | 'PRO_BLITZ_ZERO'
  | 'PRO_RUN_STOP_BOX'
  | 'PRO_TAMPA2'
  | SignatureProDefenseId;

export type MatchupEffectiveness = 'SHUTDOWN' | 'EFFECTIVE' | 'MODERATE' | 'BIG_GAIN';

export interface ProOffensePlay {
  id: ProOffensePlayId;
  name: string;
  category: 'Short Pass' | 'Short/Medium Pass' | 'Deep Pass' | 'Run/Quick Pass' | 'Run';
  isRun: boolean;
  isDeepPass: boolean;
  description: string;
  counterDefenseId: ProDefensePlayId;
  counterDefenseName: string;
  alignment: 'SPREAD' | 'STACK' | 'TRIPS';
  leftRoute: string;
  rightRoute: string;
  centerRoute: string;
  slotRoute: string;
  rbRoute: string;
  routesSummary: string;
  matchups: Record<ProDefensePlayId, MatchupEffectiveness>;
}

export interface ProDefensePlay {
  id: ProDefensePlayId;
  name: string;
  scheme: 'Short Zone' | 'Man Defense' | 'Deep Zone' | 'Deep Zone / Match' | 'Blitz / Man' | 'Run Defense' | 'Balanced Zone';
  isRunDefense: boolean;
  isPassingDefense: boolean;
  description: string;
  exactCounterAgainst: ProOffensePlayId[];
  vulnerableAgainst: string;
  strengths: string;
  landmarks?: DefenseLandmark[];
}

export const PRO_OFFENSE_PLAYS: Record<ProOffensePlayId, ProOffensePlay> = {
  PRO_QUICK_SLANTS: {
    id: 'PRO_QUICK_SLANTS',
    name: 'Quick Slants',
    category: 'Short/Medium Pass',
    isRun: false,
    isDeepPass: false,
    description: 'Inside slants and an intermediate comeback attack beyond the sticks, with a short slot checkdown.',
    counterDefenseId: 'PRO_COVER1_MAN',
    counterDefenseName: 'Cover 1 Man-Free',
    alignment: 'SPREAD',
    leftRoute: 'SLANT-R',
    rightRoute: 'SLANT-L',
    centerRoute: 'COMEBACK',
    slotRoute: 'HITCH',
    rbRoute: 'BLOCK',
    routesSummary: '12-yard inside slants and a comeback from 16 to 12 yards; slot settles at 6 yards for a checkdown.',
    matchups: {
      PRO_COVER2_HARD_FLAT: 'EFFECTIVE',
      PRO_COVER1_MAN: 'SHUTDOWN',
      PRO_COVER3_DEEP: 'MODERATE',
      PRO_COVER4_QUARTERS: 'MODERATE',
      PRO_BLITZ_ZERO: 'EFFECTIVE',
      PRO_RUN_STOP_BOX: 'MODERATE',
      PRO_TAMPA2: 'EFFECTIVE'
    }
  },
  PRO_MESH: {
    id: 'PRO_MESH',
    name: 'Mesh Concept',
    category: 'Short/Medium Pass',
    isRun: false,
    isDeepPass: false,
    description: 'Intermediate crossers create a natural rub while a deep post clears space for the short slot checkdown.',
    counterDefenseId: 'PRO_COVER3_DEEP',
    counterDefenseName: 'Cover 3 Deep Zone',
    alignment: 'SPREAD',
    leftRoute: 'CROSS-R',
    rightRoute: 'CROSS-L',
    centerRoute: 'POST-R',
    slotRoute: 'HITCH',
    rbRoute: 'BLOCK',
    routesSummary: 'Crossers break at 8 yards and finish at 12; center runs a 32-yard post, slot sits at 6 yards.',
    matchups: {
      PRO_COVER2_HARD_FLAT: 'EFFECTIVE',
      PRO_COVER1_MAN: 'MODERATE',
      PRO_COVER3_DEEP: 'SHUTDOWN',
      PRO_COVER4_QUARTERS: 'MODERATE',
      PRO_BLITZ_ZERO: 'EFFECTIVE',
      PRO_RUN_STOP_BOX: 'MODERATE',
      PRO_TAMPA2: 'EFFECTIVE'
    }
  },
  PRO_VERTS: {
    id: 'PRO_VERTS',
    name: 'Verts / 4-Verticals',
    category: 'Deep Pass',
    isRun: false,
    isDeepPass: true,
    description: 'All four primary receivers run vertical go-routes to stress deep zones and safeties.',
    counterDefenseId: 'PRO_COVER4_QUARTERS',
    counterDefenseName: 'Cover 4 Quarters',
    alignment: 'SPREAD',
    leftRoute: 'GO',
    rightRoute: 'GO',
    centerRoute: 'GO',
    slotRoute: 'GO',
    rbRoute: 'BLOCK',
    routesSummary: 'All four receivers stretch coverage to 35 yards and settle in bounds; RB protects the quarterback.',
    matchups: {
      PRO_COVER2_HARD_FLAT: 'MODERATE',
      PRO_COVER1_MAN: 'MODERATE',
      PRO_COVER3_DEEP: 'EFFECTIVE',
      PRO_COVER4_QUARTERS: 'SHUTDOWN',
      PRO_BLITZ_ZERO: 'BIG_GAIN',
      PRO_RUN_STOP_BOX: 'BIG_GAIN',
      PRO_TAMPA2: 'MODERATE'
    }
  },
  PRO_DOUBLE_MOVES: {
    id: 'PRO_DOUBLE_MOVES',
    name: 'Double Moves / Out-and-Up',
    category: 'Deep Pass',
    isRun: false,
    isDeepPass: true,
    description: 'Deep boundary corners and a post stretch the safeties, with a short slot hitch as the checkdown.',
    counterDefenseId: 'PRO_COVER2_HARD_FLAT',
    counterDefenseName: 'Cover 2 Hard Flat',
    alignment: 'SPREAD',
    leftRoute: 'FLAG-L',
    rightRoute: 'FLAG-R',
    centerRoute: 'POST-R',
    slotRoute: 'HITCH',
    rbRoute: 'BLOCK',
    routesSummary: 'Perimeter receivers break at 16 yards to 30-yard corners; center runs a 32-yard post, slot hitches at 6.',
    matchups: {
      PRO_COVER2_HARD_FLAT: 'SHUTDOWN',
      PRO_COVER1_MAN: 'MODERATE',
      PRO_COVER3_DEEP: 'MODERATE',
      PRO_COVER4_QUARTERS: 'EFFECTIVE',
      PRO_BLITZ_ZERO: 'BIG_GAIN',
      PRO_RUN_STOP_BOX: 'BIG_GAIN',
      PRO_TAMPA2: 'MODERATE'
    }
  },
  PRO_SCREEN: {
    id: 'PRO_SCREEN',
    name: 'Screen / Bubble Screen',
    category: 'Run/Quick Pass',
    isRun: false,
    isDeepPass: false,
    description: 'Quick screen behind a wall of blockers, with the outside receiver cutting across the middle on an inside slant.',
    counterDefenseId: 'PRO_BLITZ_ZERO',
    counterDefenseName: 'Aggressive Blitz / Zero Coverage',
    alignment: 'TRIPS',
    leftRoute: 'BLOCK',
    rightRoute: 'SLANT-L',
    centerRoute: 'BLOCK',
    slotRoute: 'BLOCK',
    rbRoute: 'BLOCK',
    routesSummary: 'Outside receiver slants across the middle while the remaining receivers and RB seal the blocking wall.',
    matchups: {
      PRO_COVER2_HARD_FLAT: 'MODERATE',
      PRO_COVER1_MAN: 'EFFECTIVE',
      PRO_COVER3_DEEP: 'EFFECTIVE',
      PRO_COVER4_QUARTERS: 'MODERATE',
      PRO_BLITZ_ZERO: 'SHUTDOWN',
      PRO_RUN_STOP_BOX: 'MODERATE',
      PRO_TAMPA2: 'EFFECTIVE'
    }
  },
  PRO_JET_SWEEP: {
    id: 'PRO_JET_SWEEP',
    name: 'Jet Sweep',
    category: 'Run',
    isRun: true,
    isDeepPass: false,
    description: 'Slot receiver motions across the backfield at full speed and takes a handoff heading toward the edge.',
    counterDefenseId: 'PRO_RUN_STOP_BOX',
    counterDefenseName: 'Run-Stop 6-1 / Box Stack',
    alignment: 'SPREAD',
    leftRoute: 'GO',
    rightRoute: 'GO',
    centerRoute: 'BLOCK',
    slotRoute: 'BLOCK',
    rbRoute: 'RUN',
    routesSummary: 'Speed motion horizontally across formation, taking immediate handoff to outrun the edge pursuit.',
    matchups: {
      PRO_COVER2_HARD_FLAT: 'MODERATE',
      PRO_COVER1_MAN: 'MODERATE',
      PRO_COVER3_DEEP: 'MODERATE',
      PRO_COVER4_QUARTERS: 'EFFECTIVE',
      PRO_BLITZ_ZERO: 'EFFECTIVE',
      PRO_RUN_STOP_BOX: 'SHUTDOWN',
      PRO_TAMPA2: 'MODERATE'
    }
  },
  PRO_DRAW: {
    id: 'PRO_DRAW',
    name: 'Draw / RB Fake-Pass Run',
    category: 'Run',
    isRun: true,
    isDeepPass: false,
    description: 'Play-action pass look designed to freeze coverage before the quarterback hands off late up the middle.',
    counterDefenseId: 'PRO_RUN_STOP_BOX',
    counterDefenseName: 'Run-Stop 6-1 / Box Stack',
    alignment: 'SPREAD',
    leftRoute: 'GO',
    rightRoute: 'GO',
    centerRoute: 'BLOCK',
    slotRoute: 'BLOCK',
    rbRoute: 'RUN',
    routesSummary: 'QB drops to pass to entice rushers upfield, slipping delayed handoff to RB through the A/B gap.',
    matchups: {
      PRO_COVER2_HARD_FLAT: 'MODERATE',
      PRO_COVER1_MAN: 'MODERATE',
      PRO_COVER3_DEEP: 'MODERATE',
      PRO_COVER4_QUARTERS: 'EFFECTIVE',
      PRO_BLITZ_ZERO: 'EFFECTIVE',
      PRO_RUN_STOP_BOX: 'SHUTDOWN',
      PRO_TAMPA2: 'MODERATE'
    }
  }
};

export const PRO_DEFENSE_PLAYS: Record<ProDefensePlayId, ProDefensePlay> = {
  PRO_COVER2_HARD_FLAT: {
    id: 'PRO_COVER2_HARD_FLAT',
    name: 'Cover 2 Hard Flat',
    scheme: 'Short Zone',
    isRunDefense: false,
    isPassingDefense: true,
    description: 'Corners and flat defenders jump short routes immediately; vulnerable over top.',
    exactCounterAgainst: ['PRO_DOUBLE_MOVES'],
    vulnerableAgainst: 'Deep routes, vertical seam bombs, and post routes.',
    strengths: 'Shuts down Double Moves and jumps quick flats immediately.'
  },
  PRO_COVER1_MAN: {
    id: 'PRO_COVER1_MAN',
    name: 'Cover 1 Man-Free',
    scheme: 'Man Defense',
    isRunDefense: false,
    isPassingDefense: true,
    description: 'Single-high safety with man-to-man coverage across the board. Great for locking down short routes, vulnerable to deep double-moves.',
    exactCounterAgainst: ['PRO_QUICK_SLANTS'],
    vulnerableAgainst: 'Deep double-moves and crossing rubs that exploit trailing man leverage.',
    strengths: 'Blankets Quick Slants with tight man-to-man coverage.'
  },
  PRO_COVER3_DEEP: {
    id: 'PRO_COVER3_DEEP',
    name: 'Cover 3 Deep Zone',
    scheme: 'Deep Zone',
    isRunDefense: false,
    isPassingDefense: true,
    description: 'Three deep defenders split the field into thirds; excellent for preventing deep bombs, vulnerable underneath.',
    exactCounterAgainst: ['PRO_MESH'],
    vulnerableAgainst: 'Underneath rubs, curls, and intermediate sideline windows.',
    strengths: 'Shuts down Mesh Concept and caps all deep boundary shots.'
  },
  PRO_COVER4_QUARTERS: {
    id: 'PRO_COVER4_QUARTERS',
    name: 'Cover 4 Quarters',
    scheme: 'Deep Zone / Match',
    isRunDefense: false,
    isPassingDefense: true,
    description: 'Four deep defenders match vertical routes. Excellent against deep passes, but soft against runs and quick underneath routes.',
    exactCounterAgainst: ['PRO_VERTS'],
    vulnerableAgainst: 'Draw runs, jet sweeps, and quick underneath passes.',
    strengths: 'Completely eliminates Verts / 4-Verticals by matching 4 deep.'
  },
  PRO_BLITZ_ZERO: {
    id: 'PRO_BLITZ_ZERO',
    name: 'Aggressive Blitz / Zero Coverage',
    scheme: 'Blitz / Man',
    isRunDefense: true,
    isPassingDefense: false,
    description: 'Heavy pressure scheme with zero deep safeties. Shuts down runs and quick passes instantly, but high risk against deep plays.',
    exactCounterAgainst: ['PRO_SCREEN'],
    vulnerableAgainst: 'Deep shots (Verts and Double-Moves trigger massive big play mismatches).',
    strengths: 'Crushes Bubble Screen behind LOS with overwhelming rush numbers.'
  },
  PRO_RUN_STOP_BOX: {
    id: 'PRO_RUN_STOP_BOX',
    name: 'Run-Stop 6-1 / Box Stack',
    scheme: 'Run Defense',
    isRunDefense: true,
    isPassingDefense: false,
    description: 'Linebackers and defensive backs crowd the line of scrimmage to completely stuff the run game.',
    exactCounterAgainst: ['PRO_JET_SWEEP', 'PRO_DRAW'],
    vulnerableAgainst: 'Deep vertical passing plays (Verts and Double-Moves).',
    strengths: 'Completely stuffs Jet Sweep and Draw runs for 0-2 yds or TFL.'
  },
  PRO_TAMPA2: {
    id: 'PRO_TAMPA2',
    name: 'Cover 2 Zone-Vapor / Tampa 2',
    scheme: 'Balanced Zone',
    isRunDefense: false,
    isPassingDefense: true,
    description: 'Middle linebacker drops deep to help safeties while underneath zones play moderate depth. Good generalist defense.',
    exactCounterAgainst: [],
    vulnerableAgainst: 'Quick sideline timing and overloaded deep seam routes.',
    strengths: 'Reliable containment across both pass and run plays.'
  }
};

const signatureCounters = new Map<ProDefensePlayId, ProDefensePlayId>();
for (const [teamId, signature] of Object.entries(SIGNATURE_PLAYS)) {
  const offenseIds = signatureOffenseIds(teamId);
  signatureDefenseIds(teamId).forEach((eliteId, index) => {
    const id: ProDefensePlayId = `PRO_${eliteId}`;
    const definition = signature.defense[index];
    const base = PRO_DEFENSE_PLAYS[definition.counter];
    signatureCounters.set(id, definition.counter);
    PRO_DEFENSE_PLAYS[id] = {
      ...base, id, name: definition.name, description: definition.desc,
      strengths: definition.desc, vulnerableAgainst: definition.weakness,
      exactCounterAgainst: [...base.exactCounterAgainst], landmarks: definition.landmarks
    };
  });
  offenseIds.forEach((eliteId, index) => {
    const id: ProOffensePlayId = `PRO_${eliteId}`;
    const play = signature.offense[index];
    const isRun = play.type !== 'PASS';
    const isDeepPass = play.routeType === 'VERTICAL';
    const counterDefenseId: ProDefensePlayId = isRun ? 'PRO_RUN_STOP_BOX'
      : isDeepPass ? 'PRO_COVER4_QUARTERS' : play.left === 'BLOCK' ? 'PRO_BLITZ_ZERO' : 'PRO_COVER1_MAN';
    PRO_OFFENSE_PLAYS[id] = {
      id, name: play.name, category: isRun ? 'Run' : isDeepPass ? 'Deep Pass' : 'Short/Medium Pass',
      isRun, isDeepPass, description: play.desc, counterDefenseId,
      counterDefenseName: PRO_DEFENSE_PLAYS[counterDefenseId].name,
      alignment: play.alignment, leftRoute: play.left, rightRoute: play.right,
      centerRoute: play.center, slotRoute: play.slot, rbRoute: play.rbRoute,
      routesSummary: `${play.desc} Routes: ${play.left}, ${play.right}, ${play.center}, ${play.slot}.`,
      matchups: {
        PRO_COVER2_HARD_FLAT: 'EFFECTIVE', PRO_COVER1_MAN: 'EFFECTIVE', PRO_COVER3_DEEP: 'EFFECTIVE',
        PRO_COVER4_QUARTERS: 'EFFECTIVE', PRO_BLITZ_ZERO: 'MODERATE',
        PRO_RUN_STOP_BOX: 'MODERATE', PRO_TAMPA2: 'EFFECTIVE'
      }
    };
  });
}

for (const offense of Object.values(PRO_OFFENSE_PLAYS)) {
  for (const defense of Object.values(PRO_DEFENSE_PLAYS)) {
    if (offense.id.startsWith('PRO_TEAM_') &&
      (defense.id === offense.counterDefenseId || signatureCounters.get(defense.id) === offense.counterDefenseId)) {
      defense.exactCounterAgainst.push(offense.id);
    }
    if (!offense.id.startsWith('PRO_TEAM_') && !defense.id.startsWith('PRO_TEAM_')) continue;
    offense.matchups[defense.id] = defense.exactCounterAgainst.includes(offense.id) ? 'SHUTDOWN'
      : offense.isDeepPass && defense.isRunDefense ? 'BIG_GAIN'
      : !offense.isRun && defense.isPassingDefense ? 'EFFECTIVE' : 'MODERATE';
  }
}

export interface ProMatchupResult {
  effectiveness: MatchupEffectiveness;
  isExactCounter: boolean;
  isBigGainMismatch: boolean;
  bigGainSuccess: boolean;
  expectedYardsRange: [number, number];
  summaryText: string;
  badgeLabel: string;
  badgeColor: string;
}

/**
 * Evaluates the 8-on-8 rock-paper-scissors matchup according to the game engine rules:
 * 1. Exact Counter Rule: If Offense == Counter(Defense), yards = -1 to +2 yards (or incomplete).
 * 2. Run vs Deep Pass Mismatch Rule: Deep Pass vs Run Defense triggers Big Gain Event:
 *    - 80% chance of 20+ yard gain or touchdown.
 *    - 20% chance QB is rushed into throwaway or sack.
 * 3. Passing Defense vs Passing Offense Rule: Containment defense gains 4 to 9 yards; big plays suppressed.
 */
export function evaluateProMatchup(
  offPlayId: ProOffensePlayId,
  defPlayId: ProDefensePlayId,
  randomRoll = Math.random()
): ProMatchupResult {
  const offPlay = PRO_OFFENSE_PLAYS[offPlayId];
  const defPlay = PRO_DEFENSE_PLAYS[defPlayId];

  if (!offPlay || !defPlay) {
    return {
      effectiveness: 'EFFECTIVE',
      isExactCounter: false,
      isBigGainMismatch: false,
      bigGainSuccess: false,
      expectedYardsRange: [3, 7],
      summaryText: 'Standard play matchup execution.',
      badgeLabel: 'EFFECTIVE (3-7 YDS)',
      badgeColor: '#38bdf8'
    };
  }

  // 1. Exact Counter Rule
  const isExactCounter = defPlay.exactCounterAgainst.includes(offPlayId);
  if (isExactCounter) {
    return {
      effectiveness: 'SHUTDOWN',
      isExactCounter: true,
      isBigGainMismatch: false,
      bigGainSuccess: false,
      expectedYardsRange: [-1, 2],
      summaryText: `EXACT COUNTER SHUTDOWN! ${defPlay.name} completely neutralizes ${offPlay.name} (TFL / 0-2 YDS)!`,
      badgeLabel: 'SHUTDOWN COUNTER (0-2 YDS / TFL)',
      badgeColor: '#ef4444'
    };
  }

  // 2. Run vs Deep Pass Mismatch Rule
  // If Offense calls a Deep Pass (Verts or Double Moves) and Defense calls a Run Defense (Run-Stop Box or Blitz)
  if (offPlay.isDeepPass && defPlay.isRunDefense) {
    const isSuccess = randomRoll <= 0.80;
    if (isSuccess) {
      return {
        effectiveness: 'BIG_GAIN',
        isExactCounter: false,
        isBigGainMismatch: true,
        bigGainSuccess: true,
        expectedYardsRange: [20, 42],
        summaryText: `BIG GAIN MISMATCH! ${offPlay.name} burns ${defPlay.name} deep downfield! (+20+ YDS / TD OPPORTUNITY)`,
        badgeLabel: 'BIG GAIN MISMATCH (20+ YDS)',
        badgeColor: '#10b981'
      };
    }
    return {
      effectiveness: 'BIG_GAIN',
      isExactCounter: false,
      isBigGainMismatch: true,
      bigGainSuccess: false,
      expectedYardsRange: [-6, 0],
      summaryText: `PRESSURE COLLAPSE! ${defPlay.name} rush penetrated before ${offPlay.name} could develop deep! (Sack / Throwaway)`,
      badgeLabel: 'QB RUSHED / SACK (-6 YDS)',
      badgeColor: '#f97316'
    };
  }

  // 3. Passing Defense vs Passing Offense Rule
  // If defense calls any passing defense vs passing play that is not exact counter: containment defense (4-9 yds)
  if (!offPlay.isRun && defPlay.isPassingDefense) {
    return {
      effectiveness: 'EFFECTIVE',
      isExactCounter: false,
      isBigGainMismatch: false,
      bigGainSuccess: false,
      expectedYardsRange: [4, 9],
      summaryText: `CONTAINMENT DEFENSE: ${defPlay.name} limits ${offPlay.name} to positive intermediate yardage (4-9 YDS).`,
      badgeLabel: 'CONTAINMENT (4-9 YDS)',
      badgeColor: '#38bdf8'
    };
  }

  // Fallback to table lookup
  const effectiveness = offPlay.matchups[defPlayId] || 'MODERATE';
  if (effectiveness === 'EFFECTIVE') {
    return {
      effectiveness: 'EFFECTIVE',
      isExactCounter: false,
      isBigGainMismatch: false,
      bigGainSuccess: false,
      expectedYardsRange: [3, 7],
      summaryText: `EFFECTIVE CALL: ${offPlay.name} vs ${defPlay.name} results in solid yardage (3-7 YDS).`,
      badgeLabel: 'EFFECTIVE (3-7 YDS)',
      badgeColor: '#38bdf8'
    };
  }

  return {
    effectiveness: 'MODERATE',
    isExactCounter: false,
    isBigGainMismatch: false,
    bigGainSuccess: false,
    expectedYardsRange: [8, 14],
    summaryText: `MODERATE ADVANTAGE: ${offPlay.name} exploits space in ${defPlay.name} (8-14 YDS).`,
    badgeLabel: 'MODERATE GAIN (8-14 YDS)',
    badgeColor: '#eab308'
  };
}
