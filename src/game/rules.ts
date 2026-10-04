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
  if (input.isReturner) return 0;
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
    const interceptionChance = contested ? (params.ballSideDefender ? 0.08 : 0.04) : 0;
    if (roll < interceptionChance) {
      return { type: 'INTERCEPTED', caught: false, announcement: 'INTERCEPTED AT THE CATCH POINT!', color: '#ff3333', resultType: 'INT' };
    }
    if (contested && roll >= 0.095) {
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
    const hitOffTargetChance = input.isCpuThrow ? 0.35 : 0.55;
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
  const baseRate = Math.min(0.45, ((input.isUnderPressure ? 0.28 : input.isDeepShot ? 0.16 : 0.08) + (input.isMoving ? 0.07 : 0)) * proMod);

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

