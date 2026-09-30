import type { Entity, FumbleBall } from './types';

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