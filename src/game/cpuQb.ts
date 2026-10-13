import type { Entity } from './types';

export type CpuQbState = 'DROPBACK' | 'POCKET_DWELL' | 'SCRAMBLE' | 'THROW';

export interface CpuQbThrowInaccuracy {
  offsetX: number;
  offsetY: number;
}

// CPU Quarterback AI Logic: Tecmo-Style Pocket & Vision State Machine
export class CPUQuarterbackAI {
  public qbRating: number;
  public state: CpuQbState;
  public timer: number;
  public dropbackDuration: number; // Time spent moving backward into the pocket (default 1.2s)
  public dwellDuration: number;    // Exact target time to hold the ball in the pocket (default 2.5s)
  public visionConeAngle: number;   // Degrees of field the QB can "see" at once (default 60 deg)
  public currentGazeAngle: number;   // Sweeping left/right (in degrees)
  public gazeSweepDirection: 1 | -1;
  public gazeSweepSpeed: number;     // Degrees per second
  public selectedTarget: Entity | null;
  public inaccuracyOffset: CpuQbThrowInaccuracy;

  constructor(qbRating = 75) {
    this.qbRating = qbRating;
    this.state = 'DROPBACK';
    this.timer = 0.0;
    this.dropbackDuration = 1.2;
    this.dwellDuration = 2.5;
    this.visionConeAngle = 60;
    this.currentGazeAngle = 0;
    this.gazeSweepDirection = 1;
    this.gazeSweepSpeed = 48; // Sweeps ~48 deg/sec across the field
    this.selectedTarget = null;
    this.inaccuracyOffset = { offsetX: 0, offsetY: 0 };
  }

  public reset(qbRating?: number): void {
    if (typeof qbRating === 'number') this.qbRating = qbRating;
    this.state = 'DROPBACK';
    this.timer = 0.0;
    this.currentGazeAngle = 0;
    this.gazeSweepDirection = 1;
    this.selectedTarget = null;
    this.inaccuracyOffset = { offsetX: 0, offsetY: 0 };
  }

  public update(
    deltaTime: number,
    receivers: Entity[],
    passRushers: Entity[],
    qb?: Entity | null,
    attackDirection = -1,
    rb?: Entity | null,
    evaluator?: (target: Entity) => number,
    defenders: Entity[] = []
  ): CpuQbState {
    this.timer += deltaTime;

    switch (this.state) {
      case 'DROPBACK': {
        // Phase 1: Moving backward, completely blind to receivers (locked animation)
        this.executeDropbackMovement(qb, attackDirection);
        if (this.timer >= this.dropbackDuration) {
          this.state = 'POCKET_DWELL';
          this.timer = 0.0; // Reset timer for the 2.5-second dwell clock
        }
        break;
      }

      case 'POCKET_DWELL': {
        // Phase 2: Holding the ball for 2.5 seconds with an imperfect vision cone
        this.performSubtlePocketMovement(qb);
        this.updateVisionConeSweep(deltaTime);

        // Scan only receivers inside the restricted vision cone
        const visibleReceivers = this.getReceiversInVisionCone(receivers, qb, attackDirection);
        this.selectedTarget = this.evaluateBestTarget(visibleReceivers, evaluator, defenders);

        // Check pressure or clock expiration
        if (this.timer >= this.dwellDuration || this.isPressureImminent(passRushers, qb)) {
          if (this.selectedTarget && this.isReceiverOpen(this.selectedTarget, defenders)) {
            this.initiateThrow(this.selectedTarget);
          } else {
            // Panic trigger: forced checkdown, throw away, or scramble
            this.handlePanicState(receivers, rb);
          }
        }
        break;
      }

      case 'THROW': {
        // Ball is released with added human-error offset vector
        this.executeThrowWithInaccuracy(this.selectedTarget);
        break;
      }

      case 'SCRAMBLE': {
        // Scramble state triggers QB tuck and run
        break;
      }
    }

    return this.state;
  }

  public executeDropbackMovement(qb?: Entity | null, attackDirection = -1): void {
    if (!qb) return;
    const dropSpeed = 1.25;
    qb.vy = -dropSpeed * attackDirection;
    qb.vx = 0;
    qb.y += qb.vy;
  }

  public performSubtlePocketMovement(qb?: Entity | null): void {
    if (!qb) return;
    qb.vx = Math.sin(this.timer * 3) * 0.12;
    qb.vy = 0;
    qb.x += qb.vx;
  }

  public updateVisionConeSweep(deltaTime: number): void {
    this.currentGazeAngle += this.gazeSweepDirection * this.gazeSweepSpeed * deltaTime;
    if (this.currentGazeAngle > 42) {
      this.currentGazeAngle = 42;
      this.gazeSweepDirection = -1;
    } else if (this.currentGazeAngle < -42) {
      this.currentGazeAngle = -42;
      this.gazeSweepDirection = 1;
    }
  }

  public calculateAngleTo(receiver: Entity, qb?: Entity | null, attackDirection = -1): number {
    const qbX = qb?.x ?? 170;
    const qbY = qb?.y ?? 500;
    const dx = receiver.x - qbX;
    const dy = (receiver.y - qbY) * attackDirection;
    return Math.atan2(dx, Math.max(0.1, dy)) * (180 / Math.PI);
  }

  public getReceiversInVisionCone(
    allReceivers: Entity[],
    qb?: Entity | null,
    attackDirection = -1
  ): Entity[] {
    // Imperfect Vision: Filters out any receiver outside the QB's current gaze direction
    return allReceivers.filter(receiver => {
      if (receiver.isBlocker || receiver.routeType === 'BLOCK') return false;
      const angleToReceiver = this.calculateAngleTo(receiver, qb, attackDirection);
      const angleDifference = Math.abs(this.currentGazeAngle - angleToReceiver);
      return angleDifference <= (this.visionConeAngle / 2);
    });
  }

  public evaluateBestTarget(
    visibleReceivers: Entity[],
    evaluator?: (target: Entity) => number,
    defenders: Entity[] = []
  ): Entity | null {
    if (visibleReceivers.length === 0) return null;
    if (evaluator) {
      let best = visibleReceivers[0];
      let bestScore = -Infinity;
      for (const receiver of visibleReceivers) {
        const score = evaluator(receiver);
        if (score > bestScore) {
          bestScore = score;
          best = receiver;
        }
      }
      return best;
    }
    if (defenders.length > 0) {
      return [...visibleReceivers].sort((a, b) => {
        const aDist = defenders.reduce((min, d) => Math.min(min, Math.hypot(d.x - a.x, d.y - a.y)), Infinity);
        const bDist = defenders.reduce((min, d) => Math.min(min, Math.hypot(d.x - b.x, d.y - b.y)), Infinity);
        return bDist - aDist;
      })[0] ?? null;
    }
    return visibleReceivers[0] ?? null;
  }

  public isPressureImminent(passRushers: Entity[], qb?: Entity | null): boolean {
    if (passRushers.length === 0) return false;
    const qbX = qb?.x ?? 170;
    const qbY = qb?.y ?? 500;
    return passRushers.some(rusher => {
      const dist = Math.hypot(rusher.x - qbX, rusher.y - qbY);
      return dist < 65 && !rusher.isEngagedWithBlocker;
    });
  }

  public isReceiverOpen(target: Entity, defenders: Entity[] = []): boolean {
    if (target.isOpenDeep || target.coverageMistake) {
      return true;
    }
    if (defenders.length > 0) {
      const nearestDist = defenders.reduce((min, d) => Math.min(min, Math.hypot(d.x - target.x, d.y - target.y)), Infinity);
      return nearestDist >= 22;
    }
    return false;
  }

  public initiateThrow(target: Entity): void {
    this.selectedTarget = target;
    this.state = 'THROW';
    this.executeThrowWithInaccuracy(target);
  }

  public handlePanicState(receivers: Entity[], rb?: Entity | null): void {
    // When the 2.5-second clock expires and no open receiver is in the cone:
    // Roll a random chance to either force a risky throw, check down, or scramble.
    const eligible = receivers.filter(r => !r.isBlocker && r.routeType !== 'BLOCK');
    const roll = Math.random();
    if (roll < 0.40 && eligible.length > 0) {
      // Force throw to a covered receiver (creates user interceptions / breakups)
      this.selectedTarget = eligible[Math.floor(Math.random() * eligible.length)];
      this.state = 'THROW';
      this.executeThrowWithInaccuracy(this.selectedTarget);
    } else if (roll < 0.75) {
      // Safe checkdown to running back
      this.selectedTarget = this.findRunningBack(eligible, rb);
      if (this.selectedTarget) {
        this.state = 'THROW';
        this.executeThrowWithInaccuracy(this.selectedTarget);
      } else {
        this.state = 'SCRAMBLE';
      }
    } else {
      // Tuck and run
      this.state = 'SCRAMBLE';
    }
  }

  public findRunningBack(receivers: Entity[], rb?: Entity | null): Entity | null {
    if (rb && !rb.isBlocker && rb.routeType !== 'BLOCK') return rb;
    const rbCand = receivers.find(r => r.type === 'RB' || r.routeType === 'FLAT');
    if (rbCand) return rbCand;
    return receivers.length > 0 ? receivers[receivers.length - 1] : null;
  }

  public executeThrowWithInaccuracy(
    target: Entity | null,
    rating = this.qbRating
  ): CpuQbThrowInaccuracy {
    if (!target) {
      this.inaccuracyOffset = { offsetX: 0, offsetY: 0 };
      return this.inaccuracyOffset;
    }
    // Added human-error offset vector based on qb rating
    const variance = Math.max(4, Math.round((100 - rating) * 0.38));
    const offsetX = (Math.random() - 0.5) * 2 * variance;
    const offsetY = (Math.random() - 0.5) * 2 * variance;
    this.inaccuracyOffset = { offsetX, offsetY };
    return this.inaccuracyOffset;
  }
}
