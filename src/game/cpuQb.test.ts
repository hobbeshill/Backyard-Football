import assert from 'node:assert/strict';
import test from 'node:test';
import { CPUQuarterbackAI } from './cpuQb';
import { resolveCollisions } from './movement';
import type { Entity } from './types';

test('CPUQuarterbackAI initializes with Tecmo-style dropback and vision cone properties', () => {
  const qbAi = new CPUQuarterbackAI(85);
  assert.equal(qbAi.qbRating, 85);
  assert.equal(qbAi.state, 'DROPBACK');
  assert.equal(qbAi.timer, 0.0);
  assert.equal(qbAi.dropbackDuration, 1.2);
  assert.equal(qbAi.dwellDuration, 2.5);
  assert.equal(qbAi.visionConeAngle, 60);
  assert.equal(qbAi.currentGazeAngle, 0);
  assert.equal(qbAi.selectedTarget, null);
});

test('CPUQuarterbackAI stays in DROPBACK moving backward until 1.2s then enters POCKET_DWELL', () => {
  const qbAi = new CPUQuarterbackAI(80);
  const qb: Entity = { x: 170, y: 500, radius: 10 };
  const receivers: Entity[] = [{ x: 170, y: 400, radius: 10 }];

  // Advance 0.5s in DROPBACK
  qbAi.update(0.5, receivers, [], qb, -1);
  assert.equal(qbAi.state, 'DROPBACK');
  assert.ok(qb.y > 500, 'QB drops backward into the pocket during dropback phase');

  // Advance past 1.2s total
  qbAi.update(0.8, receivers, [], qb, -1);
  assert.equal(qbAi.state, 'POCKET_DWELL');
  assert.equal(qbAi.timer, 0.0, 'Timer resets upon entering POCKET_DWELL');
});

test('CPUQuarterbackAI vision cone sweeps and filters out receivers outside gaze angle', () => {
  const qbAi = new CPUQuarterbackAI(80);
  qbAi.state = 'POCKET_DWELL';
  qbAi.currentGazeAngle = 0; // Looking straight downfield
  const qb: Entity = { x: 170, y: 500, radius: 10 };

  const centerReceiver: Entity = { x: 170, y: 350, radius: 10 }; // Straight downfield: 0 deg
  const wideRightReceiver: Entity = { x: 320, y: 480, radius: 10 }; // Hard right: ~82 deg
  const wideLeftReceiver: Entity = { x: 20, y: 480, radius: 10 }; // Hard left: ~-82 deg

  const visibleWhenStraight = qbAi.getReceiversInVisionCone(
    [centerReceiver, wideRightReceiver, wideLeftReceiver],
    qb,
    -1
  );
  assert.ok(visibleWhenStraight.includes(centerReceiver), 'Center receiver is in 60 deg cone');
  assert.ok(!visibleWhenStraight.includes(wideRightReceiver), 'Wide right is outside center cone');
  assert.ok(!visibleWhenStraight.includes(wideLeftReceiver), 'Wide left is outside center cone');

  // Sweep gaze to the right (+35 degrees)
  qbAi.currentGazeAngle = 35;
  const slightRightReceiver: Entity = { x: 220, y: 420, radius: 10 }; // ~32 deg
  const visibleWhenRight = qbAi.getReceiversInVisionCone(
    [centerReceiver, slightRightReceiver, wideLeftReceiver],
    qb,
    -1
  );
  assert.ok(visibleWhenRight.includes(slightRightReceiver), 'Receiver in swept gaze is visible');
  assert.ok(!visibleWhenRight.includes(wideLeftReceiver), 'Opposite sideline is blind');
});

test('CPUQuarterbackAI initiates throw when target is open or handles panic after 2.5s dwell', () => {
  // Case A: Open target after dwell expires initiates throw
  const qbAi = new CPUQuarterbackAI(85);
  qbAi.state = 'POCKET_DWELL';
  qbAi.timer = 2.4; // Approaching 2.5s dwell
  const qb: Entity = { x: 170, y: 500, radius: 10 };
  const openReceiver: Entity = { x: 170, y: 380, radius: 10, coverageMistake: 'BLOWN_ZONE' };

  qbAi.update(0.15, [openReceiver], [], qb, -1);
  assert.equal(qbAi.state, 'THROW');
  assert.equal(qbAi.selectedTarget, openReceiver);

  // Case B: Imminent unblocked pressure forces early panic / checkdown / scramble
  const pressureAi = new CPUQuarterbackAI(75);
  pressureAi.state = 'POCKET_DWELL';
  pressureAi.timer = 0.5; // Well before 2.5s dwell
  const rusher: Entity = { x: 170, y: 520, radius: 10, passRusher: true, isEngagedWithBlocker: false };
  const coveredReceiver: Entity = { x: 170, y: 380, radius: 10 };
  const rbCheckdown: Entity = { x: 140, y: 480, radius: 10, routeType: 'FLAT' };

  pressureAi.update(0.016, [coveredReceiver], [rusher], qb, -1, rbCheckdown);
  assert.ok(['THROW', 'SCRAMBLE'].includes(pressureAi.state), 'Imminent pressure triggers throw or scramble');
});

test('CPUQuarterbackAI throw inaccuracy scales with rating', () => {
  const eliteAi = new CPUQuarterbackAI(95);
  const target: Entity = { x: 200, y: 350, radius: 10 };
  const eliteThrow = eliteAi.executeThrowWithInaccuracy(target);
  assert.ok(Math.abs(eliteThrow.offsetX) <= 8 && Math.abs(eliteThrow.offsetY) <= 8, 'Elite QB has tight accuracy');

  const rookieAi = new CPUQuarterbackAI(60);
  const rookieThrow = rookieAi.executeThrowWithInaccuracy(target);
  assert.ok(typeof rookieThrow.offsetX === 'number' && typeof rookieThrow.offsetY === 'number');
});

test('CPU and user defensive linemen bounce off offensive linemen and cannot tackle while blocked', () => {
  const dl: Entity = { x: 170, y: 488, radius: 10, team: 'P2', type: 'DL' };
  const center: Entity = { x: 170, y: 500, radius: 12, team: 'P1' };
  const rb: Entity = { x: 170, y: 510, radius: 10, team: 'P1' };

  // CPU DL collides with Center while neither is user controlled
  resolveCollisions(
    [center, dl, rb],
    false,
    [],
    [dl],
    rb,
    340,
    [], // no user controlled entities
    [],
    [center] // Center is in blockingEntities
  );

  assert.equal(dl.isEngagedWithBlocker, true, 'DL is engaged in block');
  assert.equal(dl.blockingDefender, center, 'DL is blocked by Center');
  assert.ok(dl.y < 490, 'DL is held on defensive side of line of scrimmage');
});

test('CPUQuarterbackAI holds the ball for exactly 2.5s pocket dwell unless pressure is imminent', () => {
  const qbAi = new CPUQuarterbackAI(80);
  qbAi.state = 'POCKET_DWELL';
  qbAi.timer = 0.0;
  const qb: Entity = { x: 170, y: 500, radius: 10 };
  const coveredReceiver: Entity = { x: 170, y: 350, radius: 10 };
  const defenders: Entity[] = [{ x: 170, y: 355, radius: 10 }]; // Defender closely covering receiver
  const passRushers: Entity[] = [{ x: 170, y: 420, radius: 10, isEngagedWithBlocker: true }]; // Rusher is blocked

  // At 1.5s (before 2.5s dwell), QB remains in POCKET_DWELL
  qbAi.update(1.5, [coveredReceiver], passRushers, qb, -1, null, undefined, defenders);
  assert.equal(qbAi.state, 'POCKET_DWELL', 'QB holds ball in pocket before 2.5s dwell expires');

  // Once 2.5s dwell duration is reached with covered receivers, panic state triggers (THROW or SCRAMBLE)
  const panicState = qbAi.update(1.1, [coveredReceiver], passRushers, qb, -1, null, undefined, defenders);
  assert.ok(panicState === 'THROW' || panicState === 'SCRAMBLE', 'Panic state reached after 2.5s dwell');
});

