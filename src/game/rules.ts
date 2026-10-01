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