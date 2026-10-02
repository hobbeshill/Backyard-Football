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

export function getPassArcHeight(maxHeight: number, progress: number): number {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const releaseZ = 16;
  const catchZ = 14;
  const baseHeight = releaseZ + (catchZ - releaseZ) * clampedProgress;
  const arcHeight = 4 * (maxHeight - ((releaseZ + catchZ) / 2)) * clampedProgress * (1 - clampedProgress);
  return Math.max(2, baseHeight + arcHeight);
}

export function getDefenderPassReachHeight(defenderType?: string): number {
  return defenderType === 'DL' ? 16 : 22;
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
  return input.distanceToBall < 16 && input.ballHeight <= getDefenderPassReachHeight(input.defenderType);
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