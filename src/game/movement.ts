import type { Entity } from './types';

export const GAME_SPEED_SCALE = 0.90;
export const USER_CONTROL_SPEED_MULTIPLIER = 1.12;

export function getFatigueSpeedMultiplier(stamina = 100): number {
  return 1 - Math.min(1, Math.max(0, (70 - stamina) / 70)) * 0.35;
}

export function updatePlayerStamina(stamina: number, distance: number, endurance = 1, recovery = 0): number {
  return Math.max(0, Math.min(100, stamina - distance * 0.06 / endurance + recovery));
}

export function updateReceiverTargetStamina(stamina: number, wasTargeted: boolean): number {
  return Math.max(0, Math.min(100, stamina + (wasTargeted ? -100 / 3 : 50)));
}

export function updateRunningBackStamina(stamina: number, wasCarrier: boolean, yardsCarried = 0): number {
  const change = wasCarrier ? -(35 + Math.max(0, yardsCarried) * 1.2) : 50;
  return Math.max(0, Math.min(100, stamina + change));
}

export function createSimulationClock() {
  let lastTimestamp: number | null = null;
  let accumulatedTime = 0;
  const stepMilliseconds = 1000 / 60;
  return (timestamp: number, paused: boolean): number => {
    const elapsed = lastTimestamp === null ? 0 : Math.max(0, timestamp - lastTimestamp);
    lastTimestamp = timestamp;
    if (paused) {
      accumulatedTime = 0;
      return 0;
    }
    accumulatedTime += Math.min(elapsed, stepMilliseconds * 5);
    const steps = Math.floor((accumulatedTime + 0.000001) / stepMilliseconds);
    accumulatedTime = Math.max(0, accumulatedTime - steps * stepMilliseconds);
    return steps;
  };
}

export function getBallCarrierRunSpeed(isReturner: boolean, isBoosted: boolean): number {
  if (isReturner) {
    return 1.4 * 1.18 * 0.68;
  }
  return isBoosted ? 2.15 : 1.84;
}

export function getDesignedRunLateralBias(playType: string, currentX: number, side: 'left' | 'right', fieldWidth = 340): number {
  if (playType !== 'SWEEP') return 0;
  const targetX = side === 'right' ? fieldWidth - 85 : 85;
  return Math.max(-1.15, Math.min(1.15, (targetX - currentX) * 0.12));
}

// Direction-only input: analog sticks and d-pads both produce a unit heading (or none).
export function getDirectionalInput(x: number, y: number, deadzone = 0.05): { x: number; y: number } {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= deadzone) return { x: 0, y: 0 };
  return { x: x / magnitude, y: y / magnitude };
}

// User-controlled carriers move exactly where the stick points with no carried momentum.
export function getUserRunnerVelocity(
  inputX: number,
  inputY: number,
  maxSpeed: number,
  attackDirection: number
): { vx: number; vy: number } {
  const direction = getDirectionalInput(inputX, inputY);
  if (direction.x === 0 && direction.y === 0) return { vx: 0, vy: maxSpeed * attackDirection };
  const speed = maxSpeed * getRunDirectionSpeedFactor(direction.y, attackDirection);
  return { vx: direction.x * speed, vy: direction.y * speed };
}

export function getRunDirectionSpeedFactor(inputY: number, attackDirection: number): number {
  return Math.max(0.70, Math.min(1.05, 0.90 + (inputY * attackDirection) * 0.25));
}

export function getUserDefenderSpeed(speedMultiplier = 1, stamina = 100): number {
  return 2.05 * 0.68 * GAME_SPEED_SCALE * USER_CONTROL_SPEED_MULTIPLIER *
    speedMultiplier * getFatigueSpeedMultiplier(stamina);
}

export function shouldApplyRunBlockStun(blocker: Entity, target: Entity): boolean {
  return !blocker.isEngagedWithBlocker || blocker.blockingDefender !== target;
}

export function getReturnTeamBlockers(players: Entity[], returner: Entity | null): Entity[] {
  return players.filter(player => player !== returner);
}

export function getReturnPursuitSpeed(returnerHasBall: boolean, pursuitFrames: number, distanceToRunner: number): number {
  if (!returnerHasBall) return 1.2;
  return Math.min(3.4, 2.0 + (pursuitFrames * 0.035) + Math.max(0, (distanceToRunner - 30) * 0.006));
}

export function getRunPursuitMovement(baseSpeed: number, pursuitFrames: number, roleMultiplier = 1): { speed: number; acceleration: number } {
  const frames = Math.max(0, pursuitFrames);
  const speedRamp = Math.min(2.1, frames * 0.025);
  const accelerationRamp = Math.min(0.28, frames * 0.003);
  return {
    speed: Math.min(3.6, (baseSpeed + speedRamp) * roleMultiplier),
    acceleration: Math.min(0.50, (0.12 + accelerationRamp) * roleMultiplier)
  };
}

export function canEngagePassBlock(blocker: Entity, rusher: Entity): boolean {
  return Math.hypot(rusher.x - blocker.x, rusher.y - blocker.y) <= blocker.radius + rusher.radius + 6;
}

export function getPassBlockHoldFrames(baseHoldFrames: number, passProtection: number, passRush: number): number {
  return Math.max(45, Math.min(210, Math.round(baseHoldFrames * passProtection / passRush)));
}

export function getPassBlockBaseHoldFrames(): number {
  return 155;
}

export function shouldHoldPassBlock(blocker: Entity, rusher: Entity, holdFrames: number): boolean {
  if (!canEngagePassBlock(blocker, rusher)) {
    if ((rusher.blockEngagedTimer || 0) <= holdFrames) rusher.blockEngagedTimer = 0;
    return false;
  }
  if (rusher.isEngagedWithBlocker) return true;

  rusher.blockEngagedTimer = (rusher.blockEngagedTimer || 0) + 1;
  if (rusher.blockEngagedTimer > holdFrames) return false;
  rusher.isEngagedWithBlocker = true;
  rusher.vx = 0;
  rusher.vy = 0;
  return true;
}

export function isRusherActivelyBlocked(rusher: Entity, blockers: Entity[]): boolean {
  return Boolean(rusher.isEngagedWithBlocker && blockers.some(blocker => canEngagePassBlock(blocker, rusher)));
}

export function clampPlayerToFieldY(player: Entity, fieldHeight: number): void {
  const visualMargin = Math.ceil((player.radius || 10) * 1.95);
  player.y = Math.max(visualMargin, Math.min(fieldHeight - visualMargin, player.y));
}

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

  const playerSpeedMod = entity.speedMultiplier || 1.0;
  const adjustedSpeed = maxSpeed * 0.68 * GAME_SPEED_SCALE * playerSpeedMod * getFatigueSpeedMultiplier(entity.stamina);
  const angle = Math.atan2(targetY - entity.y, targetX - entity.x);
  const targetVx = Math.cos(angle) * adjustedSpeed;
  const targetVy = Math.sin(angle) * adjustedSpeed;

  const adjustedAcceleration = accel * getFatigueSpeedMultiplier(entity.stamina);
  entity.vx += (targetVx - entity.vx) * adjustedAcceleration;
  entity.vy += (targetVy - entity.vy) * adjustedAcceleration;
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
  fieldWidth: number,
  fieldHeight = 1200
): void {
  if (!receiver || receiver.caught || (phase !== 'QB_DROP' && phase !== 'THROWN')) return;
  receiver.timer = (receiver.timer || 0) + 1;
  receiver.startX ??= receiver.x;
  receiver.startY ??= receiver.y;
  const points = getRouteWaypoints(receiver, attackDirection, fieldWidth, fieldHeight);
  const waypoint = receiver.routeWaypoint ?? 0;
  const target = points[Math.min(waypoint, points.length - 1)];
  if (!target) return;
  const isCutting = waypoint > 0 && Math.hypot(target.x - receiver.x, target.y - receiver.y) > 5;
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

  const isDeepRoute = receiver.routeType === 'GO' || receiver.routeType === 'FLAG-L' || receiver.routeType === 'FLAG-R' || receiver.routeType === 'POST-L' || receiver.routeType === 'POST-R' || receiver.routeType === 'WHEEL';
  const speed = (isDeepRoute
    ? (isChucked ? 1.40 : 1.95)
    : (isCutting ? (isChucked ? 1.15 : 1.55) : 1.40));
  if (Math.hypot(target.x - receiver.x, target.y - receiver.y) <= 2) {
    receiver.x = target.x;
    receiver.y = target.y;
    receiver.vx = 0;
    receiver.vy = 0;
    receiver.routeWaypoint = Math.min(waypoint + 1, points.length - 1);
    return;
  }
  moveToward(receiver, target.x, target.y, isCutting ? 0.35 : 0.25, speed);
  receiver.x = Math.max(30, Math.min(fieldWidth - 30, receiver.x));
  clampPlayerToFieldY(receiver, fieldHeight);
}

export function getRouteWaypoints(
  receiver: Pick<Entity, 'startX' | 'startY' | 'x' | 'y' | 'routeType' | 'radius'>,
  attackDirection: number,
  fieldWidth = 340,
  fieldHeight = 1200
): Array<{ x: number; y: number }> {
  const x = receiver.startX ?? receiver.x;
  const y = receiver.startY ?? receiver.y;
  const side = receiver.routeType?.endsWith('-L') ? -1 : 1;
  let offsets: Array<[number, number]>;
  switch (receiver.routeType) {
    case 'SLANT-L': case 'SLANT-R': offsets = [[0, 50], [side * 90, 120]]; break;
    case 'CROSS-L': case 'CROSS-R': offsets = [[0, 80], [side * 220, 120]]; break;
    case 'FLAG-L': case 'FLAG-R': offsets = [[0, 160], [side * 70, 300]]; break;
    case 'POST-L': case 'POST-R': offsets = [[0, 160], [side * 100, 320]]; break;
    case 'COMEBACK': offsets = [[0, 160], [0, 120]]; break;
    case 'HITCH': offsets = [[0, 70], [0, 60]]; break;
    case 'WHEEL': offsets = [[x < fieldWidth / 2 ? -40 : 40, 40], [x < fieldWidth / 2 ? -40 : 40, 320]]; break;
    case 'GO': offsets = [[0, 350]]; break;
    default: return [];
  }
  const margin = Math.ceil(receiver.radius * 1.95);
  return offsets.map(([dx, depth]) => ({
    x: Math.max(30, Math.min(fieldWidth - 30, x + dx)),
    y: Math.max(margin, Math.min(fieldHeight - margin, y + depth * attackDirection))
  }));
}