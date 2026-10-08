import type { DefensiveAssignment, Entity } from './types';
import { outsideRoutes, middleRoutes, runningBackRoutes } from './playbook';

export interface CpuOffensiveAudibleResult {
  audibleMessage?: string;
  rbFlipped?: boolean;
  blockersAssigned: string[];
  mismatchReceiver?: Entity;
  newPlayKey?: string;
}

export interface CpuFourthDownSituation {
  distanceToEndzoneYards: number;
  yardsToGo: number;
  quarter: number;
  secondsRemaining: number;
  scoreDifferential: number;
}

export interface CpuOffensiveTendencyPlay {
  play: string;
  isPass: boolean;
  isSuccessful?: boolean;
  isQbRun?: boolean;
  targetWasRb?: boolean;
  isFlatPass?: boolean;
  routes?: Record<string, string | undefined>;
}

export function getSuccessfulPlayCounter(recentPlays: readonly CpuOffensiveTendencyPlay[]): string | null {
  const sample = recentPlays.slice(-6);
  const isDeepPass = (play: CpuOffensiveTendencyPlay) => play.isPass && (
    ['DEEP_SHOT', 'POST_WHEEL'].includes(play.play) ||
    Object.values(play.routes ?? {}).some(route => ['GO', 'POST-L', 'POST-R', 'FLAG-L', 'FLAG-R', 'WHEEL'].includes(route || ''))
  );
  const tendencies: Array<{ defense: string; matches: (play: CpuOffensiveTendencyPlay) => boolean }> = [
    { defense: 'ZONE34', matches: play => Boolean(play.isQbRun) },
    { defense: 'ZONE151', matches: play => Boolean(play.targetWasRb || play.isFlatPass) },
    { defense: 'ZONE34', matches: play => !play.isPass && !play.isQbRun },
    { defense: 'ZONE232', matches: isDeepPass },
    { defense: 'ZONE151', matches: play => play.isPass && !isDeepPass(play) }
  ];

  for (const tendency of tendencies) {
    const attempts = sample.filter(tendency.matches);
    const successes = attempts.filter(play => play.isSuccessful).length;
    if (attempts.length >= 2 && successes >= 2 && successes / attempts.length >= 2 / 3) {
      return tendency.defense;
    }
  }
  return null;
}

export function getCpuCounterReason(
  recentPlays: readonly CpuOffensiveTendencyPlay[],
  defenseKey: string,
  isProMode: boolean
): string | null {
  if (!isProMode) {
    return getSuccessfulPlayCounter(recentPlays) === defenseKey ? 'repeated successful plays' : null;
  }

  const recent = recentPlays.slice(-4);
  const count = (plays: string[]) => recent.filter(play => plays.includes(play.play)).length;
  if (count(['PRO_SCREEN']) >= 2 && defenseKey === 'PRO_BLITZ_ZERO') return 'repeated screens';
  if (count(['PRO_JET_SWEEP', 'PRO_DRAW']) >= 2 && ['PRO_RUN_STOP_BOX', 'PRO_COVER1_MAN'].includes(defenseKey)) return 'repeated runs';
  if (count(['PRO_VERTS', 'PRO_DOUBLE_MOVES']) >= 2 && ['PRO_COVER4_QUARTERS', 'PRO_COVER3_DEEP'].includes(defenseKey)) return 'repeated deep passes';
  if (count(['PRO_QUICK_SLANTS']) >= 2 && defenseKey === 'PRO_COVER1_MAN') return 'repeated slants';
  if (count(['PRO_MESH']) >= 2 && defenseKey === 'PRO_COVER3_DEEP') return 'repeated crossing routes';
  return null;
}

export function shouldCpuGoForItOnFourthDown(situation: CpuFourthDownSituation): boolean {
  const isGoalLineOpportunity = situation.distanceToEndzoneYards <= 15 && situation.yardsToGo <= 3;
  if (isGoalLineOpportunity) return true;

  const isLateGame = situation.quarter === 4 && situation.secondsRemaining <= 45;
  if (isLateGame && situation.scoreDifferential < 0) return true;
  if (isLateGame && situation.scoreDifferential > 0) return false;

  if (isLateGame && situation.scoreDifferential === 0 &&
    situation.distanceToEndzoneYards <= 60 && situation.yardsToGo <= 2) return true;

  const isShortInScoringRange = situation.distanceToEndzoneYards <= 35 && situation.yardsToGo <= 2;
  const isShortNearMidfield = situation.distanceToEndzoneYards <= 55 && situation.yardsToGo <= 1;
  const isShortInSecondHalf = situation.distanceToEndzoneYards <= 70 &&
    situation.yardsToGo <= 1 && situation.quarter >= 3;
  return isShortInScoringRange || isShortNearMidfield || isShortInSecondHalf;
}

export interface ProDefensiveCallSituation {
  recentPlays: readonly { play: string }[];
  down: number;
  yardsToGo: number;
  previousCall: string;
}

export function getCoverageMistakeChance(mistakeRating: number): number {
  return Math.max(0.04, Math.min(0.30, 0.18 * mistakeRating));
}

export function chooseProDefensiveCall(
  situation: ProDefensiveCallSituation,
  random: () => number = Math.random
): string {
  const recentPlays = situation.recentPlays.slice(-4);
  const recentDeepCount = recentPlays.filter(play => play.play === 'PRO_VERTS' || play.play === 'PRO_DOUBLE_MOVES').length;
  const recentRunCount = recentPlays.filter(play => play.play === 'PRO_JET_SWEEP' || play.play === 'PRO_DRAW').length;
  const recentSlantsCount = recentPlays.filter(play => play.play === 'PRO_QUICK_SLANTS').length;
  const recentMeshCount = recentPlays.filter(play => play.play === 'PRO_MESH').length;
  const recentScreenCount = recentPlays.filter(play => play.play === 'PRO_SCREEN').length;
  const previousCallWasHeavy = situation.previousCall === 'PRO_BLITZ_ZERO' || situation.previousCall === 'PRO_RUN_STOP_BOX';
  const isCrucialShortDown = (situation.down === 3 || situation.down === 4) && situation.yardsToGo <= 3;
  const isLongDown = (situation.down === 3 || situation.down === 4) && situation.yardsToGo > 7;

  if (previousCallWasHeavy) {
    if (isLongDown) return random() < 0.5 ? 'PRO_COVER4_QUARTERS' : 'PRO_COVER3_DEEP';
    return 'PRO_TAMPA2';
  }
  if (isLongDown) return random() < 0.5 ? 'PRO_COVER4_QUARTERS' : 'PRO_COVER3_DEEP';
  if (isCrucialShortDown) return random() < 0.55 ? 'PRO_RUN_STOP_BOX' : 'PRO_COVER1_MAN';
  if (recentScreenCount >= 2) return 'PRO_BLITZ_ZERO';
  if (recentRunCount >= 2) return random() < 0.35 ? 'PRO_RUN_STOP_BOX' : 'PRO_COVER1_MAN';
  if (recentDeepCount >= 2) return random() < 0.7 ? 'PRO_COVER4_QUARTERS' : 'PRO_COVER3_DEEP';
  if (recentSlantsCount >= 2) return 'PRO_COVER1_MAN';
  if (recentMeshCount >= 2) return 'PRO_COVER3_DEEP';

  const balancedCalls = [
    'PRO_COVER2_HARD_FLAT',
    'PRO_COVER1_MAN',
    'PRO_COVER3_DEEP',
    'PRO_COVER4_QUARTERS',
    'PRO_TAMPA2'
  ];
  return balancedCalls[Math.floor(random() * balancedCalls.length)];
}

export interface CpuCarrierMoveResult {
  moveType?: 'JUKE' | 'TRUCK';
  announcement?: string;
  lateralVx?: number;
}

export interface CpuPassReleaseSituation {
  hasTarget: boolean;
  isDeepShotOpportunity: boolean;
  hasOpenBreak: boolean;
  isUnderHeavyPressure: boolean;
  pressureFrames?: number;
  playClock: number;
  bestScore: number;
  isVerticalPlay?: boolean;
  isIntermediatePlay?: boolean;
  targetDepthYards?: number;
  targetSeparation?: number;
}

export function shouldCpuReleasePass(situation: CpuPassReleaseSituation): boolean {
  if (!situation.hasTarget) return false;
  const pressureReactionComplete = situation.isUnderHeavyPressure && (situation.pressureFrames ?? 0) >= 10;
  if (situation.isVerticalPlay) {
    if (pressureReactionComplete) return true;
    const hasDevelopedTarget = (situation.targetDepthYards ?? 0) >= 15 &&
      (situation.targetSeparation ?? 0) >= 14 && situation.bestScore > 35;
    return (situation.playClock >= 60 && hasDevelopedTarget) || situation.playClock >= 240;
  }
  if (situation.isIntermediatePlay) {
    return pressureReactionComplete || situation.isDeepShotOpportunity ||
      ((situation.targetDepthYards ?? 0) >= 8 && (situation.targetSeparation ?? 0) >= 14 && situation.bestScore > 15) ||
      situation.playClock >= 180;
  }
  return situation.isDeepShotOpportunity ||
    (situation.hasOpenBreak && situation.playClock >= 32) ||
    pressureReactionComplete ||
    (situation.playClock >= 44 && situation.bestScore > 15) ||
    situation.playClock >= 66;
}

export function isCpuPressureRecognized(isUnderHeavyPressure: boolean, playClock: number): boolean {
  return isUnderHeavyPressure && playClock >= 8;
}

export interface CpuScrambleSituation {
  playClock: number;
  bestScore: number;
  isUnderHeavyPressure: boolean;
  hasOpenBreak: boolean;
}

export function shouldCpuScramble(situation: CpuScrambleSituation, random: () => number = Math.random): boolean {
  if (situation.playClock < 28 || situation.bestScore > 30 || situation.hasOpenBreak) return false;
  const chance = situation.isUnderHeavyPressure ? 0.3 : situation.playClock >= 60 ? 0.08 : 0;
  return random() < chance;
}

export function scoreRunBlockTarget(
  blocker: Entity,
  runner: Entity,
  defender: Entity,
  attackDirection: number,
  isQbRunner: boolean
): number {
  const defenderDistance = Math.hypot(defender.x - runner.x, defender.y - runner.y);
  const blockerDistance = Math.hypot(defender.x - blocker.x, defender.y - blocker.y);
  const isInFront = (defender.y - runner.y) * attackDirection > 0;
  const leadBlockBonus = isQbRunner && isInFront ? 45 : 0;
  return blockerDistance + defenderDistance * 0.7 - leadBlockBonus;
}

/**
 * Evaluates the opposing defensive look pre-snap and audibles routes,
 * pass protection blockers, and RB alignment for the CPU offense.
 */
export function evaluateCpuOffensiveAudibles(
  playType: string,
  receivers: Entity[],
  centerReceiver: Entity | null,
  rb: Entity | null,
  defenders: Entity[],
  down: number,
  yardsToGo: number,
  lineOfScrimmageY: number,
  attackDirection: number,
  fieldWidth = 340
): CpuOffensiveAudibleResult {
  const result: CpuOffensiveAudibleResult = {
    blockersAssigned: []
  };

  if (playType === 'PUNT') return result;

  // Read RB attention from the defender's position, not hidden assignment flags.
  const rbSpies = defenders.filter(d => d && !d.passRusher && rb &&
    Math.hypot(d.x - rb.x, d.y - rb.y) < 45 && Math.abs(d.y - lineOfScrimmageY) < 100);
  const rbSpyCount = rbSpies.length;

  // 1. MULTIPLE RB SPIES / RB BRACKET (2+ defenders dedicated to spying/shadowing the RB):
  // When defense dedicates 2 spies to the RB, running the ball or throwing to the RB is completely shut down.
  // BUT the secondary is severely shorthanded with 5 defenders trying to cover 3 WRs + QB!
  // Counter:
  // - Audible OUT of run plays into passing concepts (MESH or POST_WHEEL)
  // - Keep RB in max pass protection (BLOCK) so both spies are 100% neutralized
  // - Hot-route downfield receivers to attack open grass and shred the shorthanded secondary!
  if (rbSpyCount >= 2) {
    if (rb) {
      rb.isBlocker = true;
      rb.routeType = 'BLOCK';
      rb.routeIndex = runningBackRoutes.indexOf('BLOCK');
      result.blockersAssigned.push('RB');
    }
    if (receivers[0] && !receivers[0].isBlocker) {
      receivers[0].routeType = 'POST-R';
      receivers[0].routeIndex = Math.max(0, outsideRoutes.indexOf('POST-R') >= 0 ? outsideRoutes.indexOf('POST-R') : outsideRoutes.indexOf('GO'));
    }
    if (receivers[1] && !receivers[1].isBlocker) {
      receivers[1].routeType = 'CROSS-L';
      receivers[1].routeIndex = Math.max(0, middleRoutes.indexOf('CROSS-L'));
    }
    if (receivers[2] && !receivers[2].isBlocker) {
      receivers[2].routeType = 'GO';
      receivers[2].routeIndex = Math.max(0, outsideRoutes.indexOf('GO'));
    }
    if (centerReceiver && !centerReceiver.isBlocker) {
      centerReceiver.routeType = 'POST-R';
      centerReceiver.routeIndex = Math.max(0, middleRoutes.indexOf('POST-R'));
    }
    result.newPlayKey = 'MESH';
    result.audibleMessage = 'CPU AUDIBLE: 2 RB SPIES COUNTERED! RB BLOCKS, ATTACKING OPEN DOWNFIELD 🛡️🚀';
    return result;
  }

  // 2. SINGLE RB SPY VS RUN PLAY:
  // If defense is shadowing the RB with a spy and offense called a run play, audible to quick pass
  if (rbSpyCount === 1 && playType !== 'PASS') {
    result.newPlayKey = 'SHORT_PASS';
    result.audibleMessage = 'CPU AUDIBLE: RB SPY DETECTED! AUDIBLE TO QUICK PASS 🎯';
    return result;
  }

  if (playType !== 'PASS') {
    // Run play pre-snap adjustment: Check for box overload
    if (rb) {
      const rbSide = rb.side || (rb.x > fieldWidth / 2 ? 'right' : 'left');
      const boxDefenders = defenders.filter(d => {
        if (!d) return false;
        const depth = Math.abs(d.y - lineOfScrimmageY);
        return depth < 80;
      });
      const rightDefenders = boxDefenders.filter(d => d.x >= fieldWidth / 2).length;
      const leftDefenders = boxDefenders.filter(d => d.x < fieldWidth / 2).length;

      // If the running lane side is heavily stacked by defense, flip the RB to the open side
      if (rbSide === 'right' && rightDefenders >= leftDefenders + 2) {
        rb.side = 'left';
        rb.startX = 120;
        rb.x = 120;
        result.rbFlipped = true;
        result.audibleMessage = 'CPU AUDIBLE: RB FLIPPED TO WEAK SIDE 🔄';
      } else if (rbSide === 'left' && leftDefenders >= rightDefenders + 2) {
        rb.side = 'right';
        rb.startX = 220;
        rb.x = 220;
        result.rbFlipped = true;
        result.audibleMessage = 'CPU AUDIBLE: RB FLIPPED TO WEAK SIDE 🔄';
      }
    }
    return result;
  }

  // Count blitzers and rushers threatening the pocket
  const rushers = defenders.filter(d => d && !d.isEngagedWithBlocker && Math.abs(d.y - lineOfScrimmageY) <= 32);
  const rusherCount = rushers.length;

  // Find where rushers are aligned relative to center (170)
  const leftRushers = rushers.filter(d => d.x < 160).length;
  const rightRushers = rushers.filter(d => d.x > 180).length;

  // 2. ALL-OUT BLITZ / 3+ RUSHERS: Max Pass Protection
  if (rusherCount >= 3) {
    if (rb) {
      rb.isBlocker = true;
      rb.routeType = 'BLOCK';
      rb.routeIndex = runningBackRoutes.indexOf('BLOCK');
      result.blockersAssigned.push('RB');
    }
    if (centerReceiver) {
      centerReceiver.isBlocker = true;
      centerReceiver.routeType = 'BLOCK';
      centerReceiver.routeIndex = middleRoutes.indexOf('BLOCK');
      result.blockersAssigned.push('CENTER');
    }
    // Also flip RB to the side with the heavier blitz pressure
    if (rb && (rightRushers > leftRushers ? 'right' : 'left') !== rb.side) {
      rb.side = rightRushers > leftRushers ? 'right' : 'left';
      rb.startX = rb.side === 'right' ? 220 : 120;
      rb.x = rb.startX;
      result.rbFlipped = true;
    }
    // Leave a quick outlet against the extra rushers and keep a vertical route to punish vacated coverage.
    const eligibleReceivers = receivers.filter(receiver => receiver && !receiver.isBlocker);
    const hotReceiver = eligibleReceivers[0];
    if (hotReceiver) {
      hotReceiver.routeType = hotReceiver.x < fieldWidth / 2 ? 'SLANT-R' : 'SLANT-L';
      hotReceiver.routeIndex = Math.max(0, outsideRoutes.indexOf(hotReceiver.routeType));
    }
    const deepReceiver = eligibleReceivers[1];
    if (deepReceiver) {
      deepReceiver.routeType = 'GO';
      deepReceiver.routeIndex = Math.max(0, outsideRoutes.indexOf('GO'));
    }
    result.audibleMessage = 'CPU AUDIBLE: USER BLITZ COUNTERED! MAX PROTECT & DEEP SHOT 🛡️🚀';
    return result;
  }

  // 2. BLITZ OVERLOAD: 2+ rushers attacking one side with 0 on the other
  if ((leftRushers >= 2 && rightRushers === 0) || (rightRushers >= 2 && leftRushers === 0)) {
    const heavySide = leftRushers > rightRushers ? 'left' : 'right';
    if (rb) {
      rb.isBlocker = true;
      rb.routeType = 'BLOCK';
      rb.routeIndex = runningBackRoutes.indexOf('BLOCK');
      rb.side = heavySide;
      rb.startX = heavySide === 'right' ? 220 : 120;
      rb.x = rb.startX;
      result.rbFlipped = true;
      result.blockersAssigned.push('RB');
    }
    // Hot route opposite outside receiver to attack the vacated shallow zone
    const hotWr = receivers.find(r => r && !r.isBlocker && (heavySide === 'left' ? r.x > fieldWidth / 2 : r.x < fieldWidth / 2));
    if (hotWr) {
      hotWr.routeType = heavySide === 'left' ? 'SLANT-R' : 'SLANT-L';
      hotWr.routeIndex = Math.max(0, outsideRoutes.indexOf(hotWr.routeType));
    }
    result.audibleMessage = 'CPU AUDIBLE: OVERLOAD BLITZ DETECTED! SLIDE PROTECTION & HOT SLANT 🛡️⚡';
    return result;
  }

  // 3. 2 RUSHERS / BOX PRESSURE: Assign RB as Pass Blocker & Deep Shot
  if (rusherCount === 2) {
    if (rb) {
      rb.isBlocker = true;
      rb.routeType = 'BLOCK';
      rb.routeIndex = runningBackRoutes.indexOf('BLOCK');
      result.blockersAssigned.push('RB');

      // Slide RB to the side of the extra blitzer
      const extraBlitzer = rushers.find(d => d.type !== 'DL');
      if (extraBlitzer) {
        const blitzerSide = extraBlitzer.x > fieldWidth / 2 ? 'right' : 'left';
        if (rb.side !== blitzerSide) {
          rb.side = blitzerSide;
          rb.startX = blitzerSide === 'right' ? 220 : 120;
          rb.x = rb.startX;
          result.rbFlipped = true;
        }
      }
      // Counter the 2-man blitz with deep vertical streak on the single coverage side
      const deepWr = receivers.find(r => r && !r.isBlocker);
      if (deepWr) {
        deepWr.routeType = 'GO';
        deepWr.routeIndex = Math.max(0, outsideRoutes.indexOf('GO'));
      }
      result.audibleMessage = 'CPU AUDIBLE: BLITZ PICKUP & DEEP SHOT CALLED 🛡️🚀';
      return result;
    }
  }

  // 4. STANDARD 1-MAN RUSH: Release all receivers and check coverage for route audibles
  if (rb && rb.isBlocker && rusherCount <= 1) {
    // Release RB back into a route when blitz is not present
    rb.isBlocker = false;
    rb.routeType = 'FLAT';
    rb.routeIndex = runningBackRoutes.indexOf('FLAT');
  }
  if (centerReceiver && centerReceiver.isBlocker && rusherCount <= 2) {
    centerReceiver.isBlocker = false;
    centerReceiver.routeType = 'SLANT-R';
    centerReceiver.routeIndex = middleRoutes.indexOf('SLANT-R');
  }

  // 5. COVERAGE MISMATCH EXPLOITATION:
  // Detect if user assigned a slower lineman (DL) or linebacker (LB) to MAN coverage on a WR
  for (const d of defenders) {
    if (d && !d.passRusher && (d.type === 'DL' || d.type === 'LB')) {
      const mismatchedWr = receivers.find(r => r && !r.isBlocker && Math.hypot(r.x - d.x, r.y - d.y) < 45);
      if (mismatchedWr && !mismatchedWr.isBlocker) {
        mismatchedWr.routeType = 'GO';
        mismatchedWr.routeIndex = Math.max(0, outsideRoutes.indexOf('GO'));
        result.mismatchReceiver = mismatchedWr;
        result.audibleMessage = 'CPU AUDIBLE: COVERAGE MISMATCH EXPLOITED VS LINEMAN/LB! ⚡🚀';
        return result;
      }
    }
  }

  // Evaluate coverage depth for route audibles
  const deepDefenders = defenders.filter(d => {
    if (!d || d.passRusher) return false;
    const depth = (d.y - lineOfScrimmageY) * attackDirection;
    return depth > 90;
  });

  const manDefenders = defenders.filter(d => d && !d.passRusher &&
    receivers.some(receiver => !receiver.isBlocker && Math.hypot(receiver.x - d.x, receiver.y - d.y) < 40));

  // 6. DEEP MIDDLE VACATED (2-high safeties with open center of the field):
  if (deepDefenders.length === 2 && centerReceiver && !centerReceiver.isBlocker) {
    const hasMiddleSafety = defenders.some(d => d && (d.type === 'FS' || d.type === 'SS') && Math.abs(d.x - fieldWidth / 2) < 45 && Math.abs(d.y - lineOfScrimmageY) > 60);
    if (!hasMiddleSafety) {
      centerReceiver.routeType = 'POST-R';
      centerReceiver.routeIndex = Math.max(0, middleRoutes.indexOf('POST-R'));
      result.audibleMessage = 'CPU AUDIBLE: POST ROUTE ATTACKING OPEN MIDDLE! 🚀🏈';
      return result;
    }
  }

  // 7. HEAVY MAN COVERAGE (3+ MAN DEFENDERS): Audible to MESH / Rub Concept
  if (manDefenders.length >= 3) {
    if (receivers[0] && !receivers[0].isBlocker) {
      receivers[0].routeType = 'CROSS-R';
      receivers[0].routeIndex = Math.max(0, outsideRoutes.indexOf('CROSS-R'));
    }
    if (receivers[1] && !receivers[1].isBlocker) {
      receivers[1].routeType = 'CROSS-L';
      receivers[1].routeIndex = Math.max(0, outsideRoutes.indexOf('CROSS-L'));
    }
    if (centerReceiver && !centerReceiver.isBlocker) {
      centerReceiver.routeType = 'HITCH';
      centerReceiver.routeIndex = Math.max(0, middleRoutes.indexOf('HITCH'));
    }
    result.audibleMessage = 'CPU AUDIBLE: MESH CONCEPT TO SHRED MAN COVERAGE! 🎯⚡';
    return result;
  }

  // 8. DEEP SOFT ZONE (two-high shells) and down is short-to-medium:
  if (deepDefenders.length >= 3 && yardsToGo <= 8) {
    receivers.forEach(r => {
      if (r && !r.isBlocker) {
        // Audible to high-percentage underneath comeback or quick slant
        const audibledRoute = r.x < fieldWidth / 2 ? 'SLANT-R' : 'SLANT-L';
        r.routeType = audibledRoute;
        r.routeIndex = Math.max(0, outsideRoutes.indexOf(audibledRoute));
      }
    });
    result.audibleMessage = 'CPU AUDIBLE: UNDERNEATH TIMING ROUTES CALLED 🎯';
  }

  return result;
}

/**
 * Evaluates active CPU ball carrier to trigger intelligent juke moves or power truck boosts.
 */
export function evaluateCpuBallCarrierMoves(
  carrier: Entity,
  defenders: Entity[],
  attackDirection: number,
  down: number,
  yardsToGo: number,
  lineOfScrimmageY: number,
  fieldWidth = 340
): CpuCarrierMoveResult {
  const result: CpuCarrierMoveResult = {};

  if (!carrier || (carrier.tackleImmunity || 0) > 0 || (carrier.jukeCooldownTimer || 0) > 0 || (carrier.jukeCount || 0) >= 1) {
    return result;
  }

  // Find nearest pursuing defender
  let nearestDefender: Entity | null = null;
  let minDistance = Infinity;

  defenders.forEach(d => {
    if (!d) return;
    const dist = Math.hypot(d.x - carrier.x, d.y - carrier.y);
    if (dist < minDistance) {
      minDistance = dist;
      nearestDefender = d;
    }
  });

  if (!nearestDefender || minDistance > 38 || minDistance < 12) {
    return result;
  }

  const def = nearestDefender as Entity;
  // Calculate relative approach angle
  const deltaX = def.x - carrier.x;
  const deltaY = (def.y - carrier.y) * attackDirection;

  // Defender is in front or closing fast
  const yardsToGain = Math.max(0, yardsToGo);
  const isCrucialDown = (down === 3 || down === 4) && yardsToGain <= 4;
  const isNearFirstDown = Math.abs((carrier.y - lineOfScrimmageY) * attackDirection / 10 - yardsToGo) < 3.5;

  // Decide between Power Truck Boost and Lateral Juke
  if ((isCrucialDown || isNearFirstDown) && (carrier.powerBoostTimer || 0) <= 0) {
    // Power truck through contact
    carrier.powerBoostTimer = 32;
    carrier.brokenTacklesCount = (carrier.brokenTacklesCount || 0) + 1;
    result.moveType = 'TRUCK';
    result.announcement = 'CPU POWER TRUCK BOOST! ⚡💪';
    return result;
  }

  // Lateral Juke to evade the diving defender (max 1 per carry, with cooldown)
  if ((carrier.tackleImmunity || 0) <= 0) {
    // Juke away from the defender's angle
    const jukeDir = deltaX > 0 ? -1 : 1;
    // Keep within field bounds
    const safeJukeDir = (carrier.x < 55 && jukeDir === -1)
      ? 1
      : (carrier.x > fieldWidth - 55 && jukeDir === 1)
        ? -1
        : jukeDir;

    carrier.tackleImmunity = 4;
    carrier.jukeCount = (carrier.jukeCount || 0) + 1;
    carrier.jukeCooldownTimer = 140;
    result.moveType = 'JUKE';
    result.lateralVx = safeJukeDir * 1.8;
    result.announcement = 'CPU JUKE MOVE! 💨';
    return result;
  }

  return result;
}
