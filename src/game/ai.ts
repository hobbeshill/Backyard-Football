import type { DefensiveAssignment, Entity } from './types';
import { outsideRoutes, middleRoutes, runningBackRoutes } from './playbook';

export interface CpuOffensiveAudibleResult {
  audibleMessage?: string;
  rbFlipped?: boolean;
  blockersAssigned: string[];
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
  playClock: number;
  bestScore: number;
}

export function shouldCpuReleasePass(situation: CpuPassReleaseSituation): boolean {
  if (!situation.hasTarget) return false;
  return situation.isDeepShotOpportunity ||
    (situation.hasOpenBreak && situation.playClock >= 32) ||
    (situation.isUnderHeavyPressure && situation.playClock > 25) ||
    (situation.playClock > 38 && situation.bestScore > 8) ||
    situation.playClock >= 58;
}

export interface CpuScrambleSituation {
  playClock: number;
  bestScore: number;
  isUnderHeavyPressure: boolean;
  hasOpenBreak: boolean;
}

export function shouldCpuScramble(situation: CpuScrambleSituation, random: () => number = Math.random): boolean {
  if (situation.playClock < 28 || situation.bestScore > 30 || situation.hasOpenBreak) return false;
  const chance = situation.isUnderHeavyPressure ? 0.3 : situation.playClock >= 48 ? 0.08 : 0;
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
  const rushers = defenders.filter(d => d && (d.passRusher || d.defenseAssignment === 'BLITZ'));
  const rusherCount = rushers.length;

  // Find where rushers are aligned relative to center (170)
  const leftRushers = rushers.filter(d => d.x < 160).length;
  const rightRushers = rushers.filter(d => d.x > 180).length;

  // 1. ALL-OUT BLITZ / 3+ RUSHERS: Max Pass Protection
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
    // Exploit user all-out blitz: Hot route an outside receiver to GO to attack 1-on-1 single coverage deep
    const deepWr = receivers.find(r => r && !r.isBlocker);
    if (deepWr) {
      deepWr.routeType = 'GO';
      deepWr.routeIndex = Math.max(0, outsideRoutes.indexOf('GO'));
    }
    result.audibleMessage = 'CPU AUDIBLE: USER BLITZ COUNTERED! MAX PROTECT & DEEP SHOT 🛡️🚀';
    return result;
  }

  // 2. 2 RUSHERS / BOX PRESSURE: Assign RB as Pass Blocker & Deep Shot
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

  // 3. STANDARD 1-MAN RUSH: Release all receivers and check coverage for route audibles
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

  // Evaluate coverage depth for route audibles
  const deepDefenders = defenders.filter(d => {
    if (!d || d.passRusher) return false;
    const depth = (d.y - lineOfScrimmageY) * attackDirection;
    return depth > 90;
  });

  const manDefenders = defenders.filter(d => d && d.defenseAssignment === 'MAN');

  // If defense is sitting in deep soft zone (Cover 3/4) and down is short-to-medium:
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
  } else if (manDefenders.length >= 3) {
    // Facing tight press man: audible to separation beaters (Comeback or Flag)
    receivers.forEach((r, idx) => {
      if (r && !r.isBlocker) {
        const audibledRoute = idx === 0 ? 'COMEBACK' : 'FLAG-R';
        r.routeType = audibledRoute;
        r.routeIndex = Math.max(0, outsideRoutes.indexOf(audibledRoute));
      }
    });
    result.audibleMessage = 'CPU AUDIBLE: MAN-BEATER ROUTES CHECKED ⚡';
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
