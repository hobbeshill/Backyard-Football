import type { Entity, FumbleBall } from './types';

export function getCarrierFumbleChance(input: {
  isBlitzer: boolean;
  isBigHit: boolean;
  isFatiguedReceiver: boolean;
  stamina: number;
}): number {
  const baseChance = input.isBlitzer ? 0.17 : input.isBigHit ? 0.12 : 0.08;
  const fatigueBonus = input.isFatiguedReceiver
    ? Math.max(0, Math.min(100, 100 - input.stamina)) * 0.0015
    : 0;
  return Math.min(0.35, baseChance + fatigueBonus);
}

export function createFumbleBall(
  carrier: Entity,
  attackDirection: number,
  fumblingTeam: string,
  random: () => number = Math.random
): FumbleBall {
  const bounceAngle = random() * Math.PI * 2;
  const bounceSpeed = 2 + random() * 2;

  return {
    x: carrier.x,
    y: carrier.y,
    z: 6,
    vx: Math.cos(bounceAngle) * bounceSpeed,
    vy: Math.sin(bounceAngle) * bounceSpeed + (0.8 * attackDirection),
    timer: 0,
    fumblingTeam
  };
}