import type { Entity } from './types';
import { updateRouteMovement } from './movement';

export const FIELD_SIDELINE_INSET = 20;

export function isPlayerOutOfBounds(player: Entity, fieldWidth: number): boolean {
  return player.x - player.radius <= FIELD_SIDELINE_INSET
    || player.x + player.radius >= fieldWidth - FIELD_SIDELINE_INSET;
}

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

export function getDriveStartY(attackDirection: number, fieldHeight: number, endZoneHeight: number): number {
  const twentyYards = (fieldHeight - 2 * endZoneHeight) * 0.2;
  return attackDirection === -1
    ? fieldHeight - endZoneHeight - twentyYards
    : endZoneHeight + twentyYards;
}

export function getSnapBallPosition(center: Entity, quarterback: Entity, attackDirection: number, progress: number): { x: number; y: number } {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const startY = center.y - attackDirection * (center.radius + 5);
  const catchX = quarterback.x - attackDirection * (quarterback.radius + 5);
  return {
    x: center.x + (catchX - center.x) * clampedProgress,
    y: startY + (quarterback.y - startY) * clampedProgress
  };
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

export function shouldReleaseUserPass(pointerDistance: number, isTapThrow: boolean): boolean {
  return isTapThrow || pointerDistance >= 24;
}

export function getPassLeadTarget(receiver: Entity, flightFrames: number, leadFactor = 0.9): { x: number; y: number } {
  return {
    x: receiver.x + (receiver.vx || 0) * flightFrames * leadFactor,
    y: receiver.y + (receiver.vy || 0) * flightFrames * leadFactor
  };
}

export function getRoutePassLeadTarget(receiver: Entity, flightFrames: number, attackDirection: number, fieldWidth: number, defenders: Entity[]): { x: number; y: number } {
  if (receiver.isRB || !receiver.routeType || receiver.isBlocker || receiver.routeType === 'BLOCK') {
    return getPassLeadTarget(receiver, flightFrames);
  }
  const predictedReceiver = { ...receiver };
  for (let frame = 0; frame < flightFrames; frame++) {
    updateRouteMovement(predictedReceiver, 'THROWN', attackDirection, defenders, fieldWidth);
  }
  return { x: predictedReceiver.x, y: predictedReceiver.y };
}

export function getPassArcHeight(maxHeight: number, progress: number): number {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const releaseZ = 20; // High overhand release above helmet (clears the line of scrimmage)
  const catchZ = 14;
  const baseHeight = releaseZ + (catchZ - releaseZ) * clampedProgress;
  const arcHeight = 4 * (maxHeight - ((releaseZ + catchZ) / 2)) * clampedProgress * (1 - clampedProgress);
  return Math.max(2, baseHeight + arcHeight);
}

export function getFieldGoalBallHeight(maxHeight: number, arrivalHeight: number, progress: number): number {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  return getPassArcHeight(maxHeight, clampedProgress) + (arrivalHeight - 14) * clampedProgress;
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

export function isSafety(endingY: number, attackDirection: number, fieldHeight: number, endZoneHeight: number, resultType: string): boolean {
  if (resultType !== 'TACKLE' && resultType !== 'SACK') return false;
  return attackDirection === -1
    ? endingY >= fieldHeight - endZoneHeight
    : endingY <= endZoneHeight;
}

export interface TackleChanceInput {
  isRB: boolean;
  isBoosted: boolean;
  brokenCount: number;
  isBlitzer: boolean;
  isQB?: boolean;
  isReturner?: boolean;
}

export function canTackleQuarterback(tackleImmunity: number): boolean {
  return tackleImmunity <= 0;
}

export function calculateBrokenTackleChance(input: TackleChanceInput): number {
  if (input.isReturner) {
    let breakChance = 0.14;
    if (input.isBoosted) breakChance += 0.12;
    if (input.brokenCount === 1) breakChance *= 0.6;
    if (input.brokenCount >= 2) breakChance = 0.04;
    return breakChance;
  }
  if (input.isQB) {
    // Quarterbacks do not experience broken tackles against charging defenders
    return input.isBlitzer ? 0.01 : 0.04;
  }

  if (input.isBlitzer) {
    // Defenders labeled to blitz have high tackling success and experience less broken tackles
    const base = input.isBoosted ? 0.12 : 0.05;
    return input.brokenCount >= 1 ? base * 0.4 : base;
  }

  let breakChance = input.isRB ? 0.30 : 0.14;
  if (input.isBoosted) breakChance += 0.12;
  if (input.brokenCount === 1) breakChance *= 0.6;
  if (input.brokenCount >= 2) breakChance = 0.04;
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
  receiverRadius?: number;
  defenderCount?: number;
  ballSideDefender?: boolean;
  archetype?: string;
  stamina?: number;
  distanceToCatch?: number;
  roll?: number;
  isProMode?: boolean;
}

export interface CatchContestResult {
  type: 'COMPLETE' | 'DROP' | 'BROKEN_UP' | 'BATTED_DOWN' | 'INTERCEPTED' | 'TACKLED_FOR_LOSS' | 'OUT_OF_BOUNDS';
  caught: boolean;
  announcement: string;
  color: string;
  resultType: string;
}

export function getCatchCompletionChance(params: CatchContestParams): number {
  const separation = Math.min(params.effectiveDefDist, params.effectiveBallDist);
  const openness = Math.max(0, Math.min(1, (separation - 12) / 43));
  const coverageCurve = openness * openness * (3 - 2 * openness);
  const handsBonus = params.archetype === 'POSSESSION' || params.archetype === 'TIGHT_END' ? 0.06 : params.archetype === 'SPEEDSTER' ? -0.03 : 0;
  const fatiguePenalty = Math.max(0, (55 - (params.stamina ?? 100)) / 55) * 0.06;
  const doubleCoveragePenalty = Math.min(2, Math.max(0, (params.defenderCount ?? 1) - 1)) * 0.10;
  const positionPenalty = params.ballSideDefender ? 0.08 : 0;
  const reachPenalty = Math.max(0, (params.distanceToCatch ?? 0) - 12) * 0.008;

  if (params.isProMode) {
    // In Pro Mode, pass catch rate is boosted significantly for high-octane fun!
    // Base catch rate starts high (~72%) even in tight coverage, and reaches 98% on open looks.
    const proBase = 0.72;
    const proOpenBoost = 0.26 * coverageCurve;
    const handsMod = params.archetype === 'POSSESSION' || params.archetype === 'TIGHT_END' ? 0.05 : 0;
    const fatigueMod = Math.max(0, (50 - (params.stamina ?? 100)) / 50) * 0.03;
    const doubleCovMod = Math.min(2, Math.max(0, (params.defenderCount ?? 1) - 1)) * 0.04;
    const reachMod = Math.max(0, (params.distanceToCatch ?? 0) - 16) * 0.004;
    return Math.max(0.65, Math.min(0.98, proBase + proOpenBoost + handsMod - fatigueMod - doubleCovMod - reachMod));
  }

  return Math.max(0.10, Math.min(0.905, 0.30 + 0.605 * coverageCurve + (handsBonus - fatiguePenalty - doubleCoveragePenalty - positionPenalty) * (1 - coverageCurve) - reachPenalty));
}

export function resolveCatchContestOutcome(params: CatchContestParams): CatchContestResult {
  const roll = params.roll !== undefined ? params.roll : Math.random();
  const outsideBoundary = params.receiverX !== undefined && params.fieldWidth !== undefined &&
    (params.receiverX - (params.receiverRadius ?? 10) < 20 || params.receiverX + (params.receiverRadius ?? 10) > params.fieldWidth - 20);
  if (outsideBoundary) {
    return {
      type: 'OUT_OF_BOUNDS',
      caught: false,
      announcement: 'CATCH OUT OF BOUNDS!',
      color: '#ffaa66',
      resultType: 'INCOMPLETE'
    };
  }
  const contested = Math.min(params.effectiveDefDist, params.effectiveBallDist) < 45;
  const completionChance = getCatchCompletionChance(params);
  if (roll < 1 - completionChance) {
    const isPro = Boolean(params.isProMode);
    const interceptionChance = contested ? (params.ballSideDefender ? (isPro ? 0.02 : 0.08) : (isPro ? 0.01 : 0.04)) : 0;
    if (roll < interceptionChance) {
      return { type: 'INTERCEPTED', caught: false, announcement: 'INTERCEPTED AT THE CATCH POINT!', color: '#ff3333', resultType: 'INT' };
    }
    if (contested && roll >= (isPro ? 0.04 : 0.095)) {
      return { type: 'BROKEN_UP', caught: false, announcement: 'PASS BROKEN UP ON CONTACT!', color: '#ff8888', resultType: 'DEFLECT' };
    }
    return { type: 'DROP', caught: false, announcement: roll >= 0.075 ? 'RECEIVER SLIPPED ON TURF! INCOMPLETE!' : 'DROPPED PASS!', color: '#ff9999', resultType: 'INCOMPLETE' };
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
  isCpuThrow?: boolean;
  isMoving?: boolean;
  passProtectionRating?: number;
  roll?: number;
  isProMode?: boolean;
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
    const hitOffTargetChance = input.isProMode ? (input.isCpuThrow ? 0.18 : 0.28) : (input.isCpuThrow ? 0.35 : 0.55);
    if (hitRoll < hitOffTargetChance) {
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
  let baseRate = Math.min(0.45, ((input.isUnderPressure ? 0.28 : input.isDeepShot ? 0.16 : 0.08) + (input.isMoving ? 0.07 : 0)) * proMod);
  if (input.isProMode) {
    baseRate = baseRate * 0.45;
  }

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

export function getCpuThrowAimVariance(throwDist: number, isUnderPressure: boolean): number {
  const distanceVariance = throwDist > 240 ? 9 : throwDist > 140 ? 6 : 4;
  return distanceVariance * (isUnderPressure ? 1.5 : 1);
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
  const baseDistance = 35 + clampedPower * 35; // 35 to 70 yards
  const distanceYards = Math.round(baseDistance * Math.max(0.85, Math.min(1.15, kickerRating)));
  const flightFrames = Math.max(38, Math.round(36 + clampedPower * 30));
  const maxZ = Math.round(30 + clampedPower * 28);
  const isTouchback = distanceYards >= 65;

  return { distanceYards, flightFrames, maxZ, isTouchback };
}

export function calculatePuntFlight(power: number, punterRating = 1.0): KickPhysicsResult {
  const clampedPower = Math.max(0.2, Math.min(1.0, power));
  // Punts travel ~25 to 55 yards with high hangtime
  const baseDistance = 25 + clampedPower * 30;
  const distanceYards = Math.round(baseDistance * Math.max(0.85, Math.min(1.15, punterRating)));
  const flightFrames = Math.max(42, Math.round(42 + clampedPower * 28));
  const maxZ = Math.round(35 + clampedPower * 22);
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

export function getInterceptionTouchbackY(
  interceptionY: number,
  fieldHeight: number,
  endZoneHeight: number,
  offenseAttackDirection: number
): number | null {
  const wasInterceptedInEndZone = offenseAttackDirection === -1
    ? interceptionY <= endZoneHeight
    : interceptionY >= fieldHeight - endZoneHeight;
  if (!wasInterceptedInEndZone) return null;
  return getTouchbackYardLineY(fieldHeight, endZoneHeight, -offenseAttackDirection, 20);
}

export function getKickoffLineY(
  fieldHeight: number,
  endZoneHeight: number,
  kickAttackDirection: number,
  kickoffYardLine = 35
): number {
  // Kickoff from kicking team's own 35-yard line
  // If kickAttackDirection -1: own goal line at fieldHeight - endZoneHeight (1100). 35 yards upfield: 1100 - 350 = 750
  // If kickAttackDirection 1: own goal line at endZoneHeight (100). 35 yards downfield: 100 + 350 = 450
  const ownGoalLineY = kickAttackDirection === -1 ? (fieldHeight - endZoneHeight) : endZoneHeight;
  return ownGoalLineY + (kickoffYardLine * 10 * kickAttackDirection);
}

export const GOALPOST_CENTER_X = 170;
export const GOALPOST_LEFT_UPRIGHT_X = 151;
export const GOALPOST_RIGHT_UPRIGHT_X = 189;
export const GOALPOST_CROSSBAR_HEIGHT_Z = 22;

export interface FieldGoalFlightResult {
  distanceYards: number;
  flightFrames: number;
  maxZ: number;
  arrivalZ: number;
  targetX: number;
  targetY: number;
  isGood: boolean;
  missReason?: 'WIDE_LEFT' | 'WIDE_RIGHT' | 'SHORT' | 'UPRIGHT_DOINK';
}

export function getFieldGoalDistanceYards(
  lineOfScrimmageY: number,
  attackDirection: number,
  fieldHeight: number,
  endZoneHeight: number
): number {
  const oppGoalLineY = attackDirection === -1 ? endZoneHeight : (fieldHeight - endZoneHeight);
  const distToGoalLineYards = Math.round(Math.abs(lineOfScrimmageY - oppGoalLineY) / 10);
  return distToGoalLineYards + 17;
}

export function calculateFieldGoalFlight(
  distanceYards: number,
  aimOffset: number, // -1.0 to 1.0 (0 is dead center)
  power: number,     // 0.0 to 1.0 (power/distance meter)
  attackDirection: number,
  kickerRating = 1.0
): FieldGoalFlightResult {
  const clampedDistance = Math.max(15, Math.min(65, distanceYards));
  const clampedPower = Math.max(0, Math.min(1.0, power));
  const clampedAim = Math.max(-1.0, Math.min(1.0, aimOffset));

  // A 60-yard kick can be made! Max distance with 1.0 power is ~62 yards.
  const maxKickingDistance = 62.5 * Math.max(0.92, Math.min(1.12, kickerRating));
  const effectiveDistance = clampedPower * maxKickingDistance;

  // Flight duration and vertical apex
  const flightFrames = Math.max(38, Math.round(36 + (clampedDistance / 60) * 26));
  const maxZ = Math.round(32 + clampedPower * 30);

  // Distance / Elevation clearance
  // If effectiveDistance >= clampedDistance, arrival height clears crossbar (z >= 22).
  // If effectiveDistance < clampedDistance, ball drops short of crossbar.
  const distanceMargin = effectiveDistance - clampedDistance;
  const arrivalZ = distanceMargin >= 0
    ? GOALPOST_CROSSBAR_HEIGHT_Z + Math.min(26, distanceMargin * 2.2)
    : Math.max(0, GOALPOST_CROSSBAR_HEIGHT_Z + distanceMargin * 4.2);

  // Lateral drift: As distance increases, aim deviations carry wider over the long flight
  // At 20 yds: driftScale ~ 42 (requires Math.abs(aim) <= 0.45 to stay inside 151-189)
  // At 60 yds: driftScale ~ 82 (requires Math.abs(aim) <= 0.23 to stay inside 151-189)
  const distanceRatio = Math.max(0, Math.min(1, (clampedDistance - 15) / 45));
  const driftScale = 38 + distanceRatio * 44;
  const lateralDrift = clampedAim * driftScale;
  const targetX = GOALPOST_CENTER_X + lateralDrift;
  const targetY = attackDirection === -1 ? 0 : 1200;

  let isGood = false;
  let missReason: 'WIDE_LEFT' | 'WIDE_RIGHT' | 'SHORT' | 'UPRIGHT_DOINK' | undefined;

  if (arrivalZ < GOALPOST_CROSSBAR_HEIGHT_Z) {
    missReason = 'SHORT';
  } else if (Math.abs(targetX - GOALPOST_LEFT_UPRIGHT_X) < 1.8 || Math.abs(targetX - GOALPOST_RIGHT_UPRIGHT_X) < 1.8) {
    missReason = 'UPRIGHT_DOINK';
  } else if (targetX < GOALPOST_LEFT_UPRIGHT_X) {
    missReason = 'WIDE_LEFT';
  } else if (targetX > GOALPOST_RIGHT_UPRIGHT_X) {
    missReason = 'WIDE_RIGHT';
  } else {
    isGood = true;
  }

  return {
    distanceYards: clampedDistance,
    flightFrames,
    maxZ,
    arrivalZ,
    targetX,
    targetY,
    isGood,
    missReason
  };
}


