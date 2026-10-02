import type { Entity } from './types';

export interface PlayResultInput {
  lineOfScrimmageY: number;
  endingY: number;
  attackDirection: number;
  resultType: string;
  fieldHeight: number;
  endZoneHeight: number;
}

export interface PlayResult {
  endingY: number;
  yardsGained: number;
  isTouchdown: boolean;
}

export function calculateYardsToGo(lineOfScrimmageY: number, firstDownMarkerY: number, attackDirection: number): number {
  const remainingDistance = (firstDownMarkerY - lineOfScrimmageY) * attackDirection;
  return Math.max(0, Math.round(remainingDistance / 10));
}

export function getPassArcMaxHeight(targetDistance: number, isDeepRoute: boolean, isLob = false): number {
  const calculatedHeight = (isDeepRoute ? 32 + targetDistance * 0.10 : 26 + targetDistance * 0.08) + (isLob ? 10 : 0);
  return Math.min(isDeepRoute ? 50 : 42, Math.max(38, calculatedHeight));
}

export function getPassFlightFrames(targetDistance: number, throwSpeed: number, isLob = false): number {
  const standardFrames = Math.max(18, Math.round(targetDistance / throwSpeed));
  return isLob ? Math.round(standardFrames * 1.45) : standardFrames;
}

export function findTappedPassReceiver(receivers: Array<Entity | null | undefined>, x: number, y: number): Entity | null {
  return receivers
    .filter((receiver): receiver is Entity => Boolean(receiver && !receiver.isBlocker && receiver.routeType !== 'BLOCK'))
    .map(receiver => ({ receiver, distance: Math.hypot(receiver.x - x, receiver.y - y) }))
    .filter(({ receiver, distance }) => distance < receiver.radius + 20)
    .sort((first, second) => first.distance - second.distance)[0]?.receiver || null;
}

export function getPassArcHeight(maxHeight: number, progress: number): number {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const releaseZ = 20; // High overhand release above helmet (clears the line of scrimmage)
  const catchZ = 14;
  const baseHeight = releaseZ + (catchZ - releaseZ) * clampedProgress;
  const arcHeight = 4 * (maxHeight - ((releaseZ + catchZ) / 2)) * clampedProgress * (1 - clampedProgress);
  return Math.max(2, baseHeight + arcHeight);
}

export function getDefenderPassReachHeight(defenderType?: string): number {
  return defenderType === 'DL' ? 14 : 18;
}

export interface PassDeflectionInput {
  defenderType?: string;
  isPassRusher: boolean;
  isEngagedWithBlocker: boolean;
  distanceToBall: number;
  ballHeight: number;
}

export function canDefenderDeflectPass(input: PassDeflectionInput): boolean {
  if (input.isPassRusher || input.isEngagedWithBlocker) return false;
  return input.distanceToBall < 12 && input.ballHeight <= getDefenderPassReachHeight(input.defenderType);
}

export function resolvePlayResult(input: PlayResultInput): PlayResult {
  const yardsGained = Math.round(
    (input.endingY - input.lineOfScrimmageY) * input.attackDirection / 10
  );

  const crossedGoalLine = input.attackDirection === -1
    ? input.endingY <= input.endZoneHeight
    : input.endingY >= input.fieldHeight - input.endZoneHeight;

  return {
    endingY: input.endingY,
    yardsGained,
    isTouchdown: crossedGoalLine || input.resultType === 'TD'
  };
}

export interface TackleChanceInput {
  isRB: boolean;
  isBoosted: boolean;
  brokenCount: number;
  isBlitzer: boolean;
  isQB?: boolean;
}

export function canTackleQuarterback(tackleImmunity: number): boolean {
  return tackleImmunity <= 0;
}

export function calculateBrokenTackleChance(input: TackleChanceInput): number {
  if (input.isQB) {
    // Quarterbacks do not experience broken tackles against charging defenders
    return input.isBlitzer ? 0.01 : 0.04;
  }

  if (input.isBlitzer) {
    // Defenders labeled to blitz have high tackling success and experience less broken tackles
    const base = input.isBoosted ? 0.12 : 0.05;
    return input.brokenCount >= 1 ? base * 0.4 : base;
  }

  let breakChance = input.isRB ? 0.38 : 0.28;
  if (input.isBoosted) breakChance += 0.25;
  if (input.brokenCount === 1) breakChance *= 0.6;
  if (input.brokenCount >= 2) breakChance = 0.12;
  return breakChance;
}

export function getThrowOffDistance(power: number, maxDistance: number): number {
  const minDistance = 100;
  const clampedPower = Math.max(0, Math.min(1, power));
  return minDistance + clampedPower * (maxDistance - minDistance);
}

export interface CatchContestParams {
  effectiveDefDist: number;
  effectiveBallDist: number;
  isTargetSpammed: boolean;
  isRbFlatSpammed: boolean;
  isRb: boolean;
  receiverX?: number;
  fieldWidth?: number;
  roll?: number;
}

export interface CatchContestResult {
  type: 'COMPLETE' | 'DROP' | 'BROKEN_UP' | 'BATTED_DOWN' | 'INTERCEPTED' | 'TACKLED_FOR_LOSS' | 'OUT_OF_BOUNDS';
  caught: boolean;
  announcement: string;
  color: string;
  resultType: string;
}

export function resolveCatchContestOutcome(params: CatchContestParams): CatchContestResult {
  const roll = params.roll !== undefined ? params.roll : Math.random();

  // 1. TIGHT BLANKET COVERAGE (< 14px separation or < 13px defender to ball)
  if (params.effectiveDefDist < 14 || params.effectiveBallDist < 13) {
    if (params.isRbFlatSpammed) {
      if (roll < 0.35) {
        return { type: 'BATTED_DOWN', caught: false, announcement: 'PASS BATTED DOWN IN THE FLAT! 🛑', color: '#ffaa00', resultType: 'BATTED_DOWN' };
      } else if (roll < 0.65) {
        return { type: 'INTERCEPTED', caught: false, announcement: 'INTERCEPTED IN THE FLAT!', color: '#ff3333', resultType: 'INT' };
      } else if (roll < 0.88) {
        return { type: 'BROKEN_UP', caught: false, announcement: 'BLOWN UP IN THE FLAT! PASS BROKEN UP! 💥', color: '#ff8888', resultType: 'BROKEN_UP' };
      } else {
        return { type: 'TACKLED_FOR_LOSS', caught: true, announcement: 'TACKLED IN THE FLAT FOR A LOSS! 🛑💥', color: '#ff3333', resultType: 'TACKLE' };
      }
    }

    if (params.isTargetSpammed) {
      if (roll < 0.35) {
        return { type: 'BATTED_DOWN', caught: false, announcement: 'PASS BATTED DOWN BY DEFENDER!', color: '#ffaa00', resultType: 'BATTED_DOWN' };
      } else if (roll < 0.62) {
        return { type: 'INTERCEPTED', caught: false, announcement: 'PICKED OFF! CONTESTED INTERCEPTION!', color: '#ff3333', resultType: 'INT' };
      } else if (roll < 0.88) {
        return { type: 'BROKEN_UP', caught: false, announcement: 'PASS BROKEN UP ON CONTACT!', color: '#ff8888', resultType: 'BROKEN_UP' };
      } else {
        return { type: 'COMPLETE', caught: true, announcement: 'SPECTACULAR CONTESTED CATCH!', color: '#00ffaa', resultType: 'COMPLETE' };
      }
    }

    if (roll < 0.25) {
      return { type: 'BATTED_DOWN', caught: false, announcement: 'PASS BATTED DOWN BY DEFENDER!', color: '#ffaa00', resultType: 'BATTED_DOWN' };
    } else if (roll < 0.40) {
      return { type: 'INTERCEPTED', caught: false, announcement: 'PICKED OFF! CONTESTED INTERCEPTION!', color: '#ff3333', resultType: 'INT' };
    } else if (roll < 0.68) {
      return { type: 'BROKEN_UP', caught: false, announcement: 'PASS BROKEN UP ON CONTACT! 💥', color: '#ff8888', resultType: 'BROKEN_UP' };
    } else {
      return { type: 'COMPLETE', caught: true, announcement: 'SPECTACULAR CONTESTED CATCH! 🔥', color: '#00ffaa', resultType: 'COMPLETE' };
    }
  }

  // 2. MODERATE / TIGHT NFL WINDOW (14px - 20px)
  if (params.effectiveDefDist < 20) {
    if (params.isTargetSpammed && roll < 0.60) {
      return { type: 'BROKEN_UP', caught: false, announcement: 'TIPPED PASS! INCOMPLETE!', color: '#aaaaaa', resultType: 'DEFLECT' };
    } else if (roll < 0.68) {
      return {
        type: 'COMPLETE',
        caught: true,
        announcement: params.isRb ? 'PASS COMPLETE TO RUNNING BACK! 🏈' : 'CATCH IN TIGHT WINDOW! 🎯',
        color: params.isRb ? '#00ffaa' : '#00ffff',
        resultType: 'COMPLETE'
      };
    } else if (roll < 0.80) {
      return { type: 'BROKEN_UP', caught: false, announcement: 'TIPPED PASS! INCOMPLETE! 💨', color: '#aaaaaa', resultType: 'DEFLECT' };
    } else if (roll < 0.90) {
      return { type: 'DROP', caught: false, announcement: 'DROPPED ON CONTACT! 💥 Hard hit jars ball loose!', color: '#ff8888', resultType: 'INCOMPLETE' };
    } else {
      return { type: 'INTERCEPTED', caught: false, announcement: 'TIPPED BALL INTERCEPTED! 😱', color: '#ffcc00', resultType: 'INT' };
    }
  }

  // 3. WIDE OPEN RECEIVER (>= 20px separation, no one around)
  // Requirement: "All passes should not be completed, even if the user is wide open with no one around. Build in some real life football mistakes."
  // Check sideline boundary mistake if catch occurs right on the chalk line
  const isNearSideline = params.receiverX !== undefined && params.fieldWidth !== undefined &&
    (params.receiverX < 32 || params.receiverX > params.fieldWidth - 32);

  if (isNearSideline && roll < 0.12) {
    return {
      type: 'OUT_OF_BOUNDS',
      caught: false,
      announcement: 'OUT OF BOUNDS! 🦶❌ Only got one foot in bounds along sideline!',
      color: '#ffaa66',
      resultType: 'INCOMPLETE'
    };
  }

  // Realistic football mistakes on wide-open passes (~9.5% drop / slip rate):
  // Even with nobody around, real NFL receivers drop passes, look upfield too early, bobble, or slip on turf cuts.
  if (roll < 0.095) {
    if (roll < 0.026) {
      return {
        type: 'DROP',
        caught: false,
        announcement: 'DROPPED PASS! 🤦 Looked upfield before securing the catch!',
        color: '#ff9999',
        resultType: 'INCOMPLETE'
      };
    } else if (roll < 0.052) {
      return {
        type: 'DROP',
        caught: false,
        announcement: 'BOBBLED & DROPPED! 💨 Off the fingertips wide open!',
        color: '#ff9999',
        resultType: 'INCOMPLETE'
      };
    } else if (roll < 0.075) {
      return {
        type: 'DROP',
        caught: false,
        announcement: 'INCOMPLETE! ❌ Slipped right through his hands in space!',
        color: '#ff9999',
        resultType: 'INCOMPLETE'
      };
    } else {
      return {
        type: 'DROP',
        caught: false,
        announcement: 'RECEIVER SLIPPED ON TURF! 👟🏈 Incomplete!',
        color: '#ffaa66',
        resultType: 'INCOMPLETE'
      };
    }
  }

  return {
    type: 'COMPLETE',
    caught: true,
    announcement: params.isRb ? 'PASS COMPLETE TO RUNNING BACK! 🏈' : 'PASS COMPLETE IN STRIDE! 🏈',
    color: params.isRb ? '#00ffaa' : '#00ffff',
    resultType: 'COMPLETE'
  };
}

export interface QbAccuracyInput {
  throwDist: number;
  isUnderPressure: boolean;
  isDeepShot: boolean;
  isHitAsThrown?: boolean;
  passProtectionRating?: number;
  roll?: number;
}

export interface QbAccuracyResult {
  isOffTarget: boolean;
  mistakeType?: 'OVERTHROWN' | 'UNDERTHROWN' | 'OFF_TARGET_WIDE' | 'HIT_AS_THROWN';
  offsetX: number;
  offsetY: number;
  announcement?: string;
}

export function evaluateQbThrowAccuracy(input: QbAccuracyInput, attackDirection: number): QbAccuracyResult {
  const roll = input.roll !== undefined ? input.roll : Math.random();
  const proMod = input.passProtectionRating ? (2 - input.passProtectionRating) : 1.0;

  // Real-life NFL QB football mistakes:
  // - If QB is hit as he throws:
  if (input.isHitAsThrown) {
    const hitRoll = input.roll !== undefined ? input.roll : Math.random();
    if (hitRoll < 0.85) {
      return {
        isOffTarget: true,
        mistakeType: 'HIT_AS_THROWN',
        offsetX: (Math.random() - 0.5) * 35,
        offsetY: -35 * attackDirection,
        announcement: 'QB HIT AS HE THROWS! 💥 Fluttering duck falls short!'
      };
    }
  }

  // Baseline inaccuracy: clean short/medium passes (~8%), deep balls (~16%), under heavy rusher pressure (~28%)
  const baseRate = Math.min(0.45, (input.isUnderPressure ? 0.28 : input.isDeepShot ? 0.16 : 0.08) * proMod);

  if (roll >= baseRate) {
    return { isOffTarget: false, offsetX: 0, offsetY: 0 };
  }

  const subRoll = (roll / baseRate);
  if (subRoll < 0.42) {
    return {
      isOffTarget: true,
      mistakeType: 'OVERTHROWN',
      offsetX: (Math.random() - 0.5) * 16,
      offsetY: 36 * attackDirection,
      announcement: 'OVERTHROWN! 💨 Ball sailed high and deep!'
    };
  } else if (subRoll < 0.74) {
    return {
      isOffTarget: true,
      mistakeType: 'UNDERTHROWN',
      offsetX: (Math.random() - 0.5) * 14,
      offsetY: -28 * attackDirection,
      announcement: 'THROWN SHORT! 🏈 Skipped off the turf!'
    };
  } else {
    const side = Math.random() < 0.5 ? 1 : -1;
    return {
      isOffTarget: true,
      mistakeType: 'OFF_TARGET_WIDE',
      offsetX: side * 30,
      offsetY: -6 * attackDirection,
      announcement: 'OFF-TARGET THROW! ❌ Thrown behind receiver!'
    };
  }
}

export interface KickPhysicsResult {
  distanceYards: number;
  flightFrames: number;
  maxZ: number;
  isTouchback: boolean;
}

export function calculateKickoffFlight(power: number, kickerRating = 1.0): KickPhysicsResult {
  const clampedPower = Math.max(0.15, Math.min(1.0, power));
  // Standard kickoff from 35-yard line: 65 yards reaches opponent goal line
  const baseDistance = 42 + clampedPower * 28; // 42 to 70 yards
  const distanceYards = Math.round(baseDistance * Math.max(0.85, Math.min(1.15, kickerRating)));
  const flightFrames = Math.max(38, Math.round(36 + clampedPower * 30));
  const maxZ = Math.round(32 + clampedPower * 28);
  const isTouchback = distanceYards >= 65;

  return { distanceYards, flightFrames, maxZ, isTouchback };
}

export function calculatePuntFlight(power: number, punterRating = 1.0): KickPhysicsResult {
  const clampedPower = Math.max(0.2, Math.min(1.0, power));
  // Punts travel ~35 to 54 yards with high hangtime
  const baseDistance = 32 + clampedPower * 20;
  const distanceYards = Math.round(baseDistance * Math.max(0.85, Math.min(1.15, punterRating)));
  const flightFrames = Math.max(42, Math.round(44 + clampedPower * 26));
  const maxZ = Math.round(38 + clampedPower * 20);
  const isTouchback = distanceYards >= 55;

  return { distanceYards, flightFrames, maxZ, isTouchback };
}

export function getTouchbackYardLineY(
  fieldHeight: number,
  endZoneHeight: number,
  attackDirection: number,
  touchbackYards = 25
): number {
  // AttackDirection -1: moving up towards y=0. Own goal line is at (fieldHeight - endZoneHeight). 25 yards up: - 250
  // AttackDirection 1: moving down towards y=fieldHeight. Own goal line is at endZoneHeight. 25 yards down: + 250
  const ownGoalLineY = attackDirection === -1 ? (fieldHeight - endZoneHeight) : endZoneHeight;
  return ownGoalLineY + (touchbackYards * 10 * attackDirection);
}

