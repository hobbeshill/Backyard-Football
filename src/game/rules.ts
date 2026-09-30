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