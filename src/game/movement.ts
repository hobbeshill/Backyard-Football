import type { Entity } from './types';

export const GAME_SPEED_SCALE = 0.95;

export function distToSegment(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  point: { x: number; y: number }
): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(point.x - p1.x, point.y - p1.y);
  let t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(point.x - (p1.x + t * dx), point.y - (p1.y + t * dy));
}

export function moveToward(
  entity: Entity,
  targetX: number,
  targetY: number,
  accel: number,
  maxSpeed: number,
  time = Date.now()
): void {
  if (entity.vx === undefined) entity.vx = 0;
  if (entity.vy === undefined) entity.vy = 0;

  const adjustedSpeed = maxSpeed * 0.68 * GAME_SPEED_SCALE;
  const angle = Math.atan2(targetY - entity.y, targetX - entity.x);
  const targetVx = Math.cos(angle) * adjustedSpeed;
  const targetVy = Math.sin(angle) * adjustedSpeed;

  entity.vx += (targetVx - entity.vx) * accel;
  entity.vy += (targetVy - entity.vy) * accel;
  entity.x += entity.vx;
  entity.y += entity.vy;
  entity.x += Math.sin(time * 0.01 + entity.x) * 0.12;
}

export function resolveCollisions(
  allEntities: Entity[],
  includeReceivers: boolean,
  receiverEntities: Entity[],
  defenders: Entity[],
  ballCarrier: Entity | null = null
): void {
  for (let i = 0; i < allEntities.length; i++) {
    for (let j = i + 1; j < allEntities.length; j++) {
      const first = allEntities[i];
      const second = allEntities[j];
      if (!first || !second) continue;

      if (!includeReceivers) {
        const isFirstReceiver = receiverEntities.includes(first);
        const isSecondReceiver = receiverEntities.includes(second);
        const isFirstDefender = defenders.includes(first);
        const isSecondDefender = defenders.includes(second);
        if ((isFirstReceiver && isSecondDefender) || (isSecondReceiver && isFirstDefender)) continue;
      }

      const isFirstDefender = defenders.includes(first);
      const isSecondDefender = defenders.includes(second);
      if ((first === ballCarrier && isSecondDefender) || (second === ballCarrier && isFirstDefender)) continue;

      const dx = second.x - first.x;
      const dy = second.y - first.y;
      const distance = Math.hypot(dx, dy);
      const minDistance = (first.radius || 10) + (second.radius || 10);

      if (distance < minDistance && distance > 0) {
        const overlap = minDistance - distance;
        const nx = dx / distance;
        const ny = dy / distance;
        first.x -= nx * overlap * 0.5;
        first.y -= ny * overlap * 0.5;
        second.x += nx * overlap * 0.5;
        second.y += ny * overlap * 0.5;
      }
    }
  }
}

export function updateRouteMovement(
  receiver: Entity | null,
  phase: string,
  attackDirection: number,
  defenders: Entity[],
  fieldWidth: number
): void {
  if (!receiver || receiver.caught || (phase !== 'QB_DROP' && phase !== 'THROWN')) return;
  receiver.timer = (receiver.timer || 0) + 1;
  const direction = attackDirection;

  let isCutting = false;
  if (receiver.routeType === 'SLANT-L' || receiver.routeType === 'SLANT-R') {
    isCutting = receiver.timer >= 38 && receiver.timer <= 58;
  } else if (receiver.routeType === 'FLAG-L' || receiver.routeType === 'FLAG-R') {
    isCutting = receiver.timer >= 55 && receiver.timer <= 76;
  } else if (receiver.routeType === 'COMEBACK') {
    isCutting = receiver.timer >= 60 && receiver.timer <= 80;
  } else if (receiver.routeType === 'CROSS-L' || receiver.routeType === 'CROSS-R') {
    isCutting = receiver.timer >= 50 && receiver.timer <= 72;
  }
  receiver.isCutting = isCutting;

  let isChucked = false;
  if (receiver.isCenter && isCutting) {
    for (const defender of defenders) {
      if (defender && !defender.passRusher && Math.hypot(defender.x - receiver.x, defender.y - receiver.y) < 22) {
        isChucked = true;
        break;
      }
    }
  }

  const isDeepRoute = receiver.routeType === 'GO' || receiver.routeType === 'FLAG-L' || receiver.routeType === 'FLAG-R';
  const speed = isDeepRoute
    ? (isChucked ? 1.40 : 1.95)
    : (isCutting ? (isChucked ? 1.15 : 1.55) : 1.40);
  let targetX = receiver.x;
  let targetY = receiver.y;

  if (receiver.routeType === 'SLANT-L') {
    if (receiver.timer < 35) targetY += speed * direction;
    else { targetY += speed * 0.45 * direction; targetX -= speed * 1.1; }
  } else if (receiver.routeType === 'SLANT-R') {
    if (receiver.timer < 35) targetY += speed * direction;
    else { targetY += speed * 0.45 * direction; targetX += speed * 1.1; }
  } else if (receiver.routeType === 'FLAG-L') {
    if (receiver.timer < 45) targetY += speed * 1.1 * direction;
    else { targetY += speed * 0.7 * direction; targetX -= speed * 1.35; }
  } else if (receiver.routeType === 'FLAG-R') {
    if (receiver.timer < 45) targetY += speed * 1.1 * direction;
    else { targetY += speed * 0.7 * direction; targetX += speed * 1.35; }
  } else if (receiver.routeType === 'COMEBACK') {
    if (receiver.timer < 55) targetY += speed * 1.15 * direction;
    else targetY -= speed * 0.75 * direction;
  } else if (receiver.routeType === 'CROSS-L') {
    if (receiver.timer < 45) targetY += speed * direction;
    else { targetY += speed * 0.35 * direction; targetX -= speed * 1.4; }
  } else if (receiver.routeType === 'CROSS-R') {
    if (receiver.timer < 45) targetY += speed * direction;
    else { targetY += speed * 0.35 * direction; targetX += speed * 1.4; }
  } else if (receiver.routeType === 'GO') {
    targetY += speed * 1.25 * direction;
  }

  moveToward(receiver, targetX, targetY, isCutting ? 0.35 : 0.25, speed);
  receiver.x = Math.max(30, Math.min(fieldWidth - 30, receiver.x));
}