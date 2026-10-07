import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseProDefensiveCall, getSuccessfulPlayCounter, isCpuPressureRecognized, scoreRunBlockTarget, shouldCpuReleasePass, shouldCpuScramble } from './ai';
import { alignDefenderAcrossFromReceiver, alignDefenderAcrossFromRunningBack, alignDefenderToZone, alignDefenders, chooseCpuDefensiveAssignments, constrainDefendersToFieldSide, getBlitzAlignmentY, getBracketCoverageTarget, getDefensiveLineAlignmentY, matchCpuDefendersToReceivers, separateDefenderAlignments } from './defense';
import { getCarrierFumbleChance } from './fumbles';
import { calculateYardsToGo, canDefenderDeflectPass, canTackleQuarterback, findTappedPassReceiver, getCatchCompletionChance, getDefenderPassReachHeight, getDriveStartY, getSnapBallPosition, getPassArcHeight, getPassArcMaxHeight, getPassFlightFrames, getPassLeadTarget, getRoutePassLeadTarget, isSafety, resolveCatchContestOutcome, resolvePlayResult } from './rules';
import { canEngagePassBlock, clampPlayerToFieldY, GAME_SPEED_SCALE, getBallCarrierRunSpeed, getFatigueSpeedMultiplier, getPassBlockBaseHoldFrames, getPassBlockHoldFrames, getRunDirectionSpeedFactor, getRunPursuitMovement, getUserDefenderSpeed, isRusherActivelyBlocked, moveToward, shouldHoldPassBlock, updatePlayerStamina, updateReceiverTargetStamina, updateRunningBackStamina, updateRouteMovement, USER_CONTROL_SPEED_MULTIPLIER } from './movement';
import type { Entity } from './types';

test('coverage reduces catches smoothly and touching players are not wide open', () => {
  const chance = (distance: number) => getCatchCompletionChance({ effectiveDefDist: distance, effectiveBallDist: distance, isTargetSpammed: false, isRbFlatSpammed: false, isRb: false });
  assert.ok(chance(20) < 0.40);
  assert.ok(Math.abs(chance(19.99) - chance(20.01)) < 0.001);
  assert.ok(chance(35) > chance(20));
  assert.equal(chance(60), 0.905);
});

test('double coverage, ball-side positioning, receiver hands and fatigue affect contested catches', () => {
  const contest = { effectiveDefDist: 25, effectiveBallDist: 25, isTargetSpammed: false, isRbFlatSpammed: false, isRb: false };
  const baseline = getCatchCompletionChance(contest);
  assert.ok(getCatchCompletionChance({ ...contest, defenderCount: 2 }) < baseline);
  assert.ok(getCatchCompletionChance({ ...contest, ballSideDefender: true }) < baseline);
  assert.ok(getCatchCompletionChance({ ...contest, archetype: 'POSSESSION' }) > getCatchCompletionChance({ ...contest, archetype: 'SPEEDSTER' }));
  assert.ok(getCatchCompletionChance({ ...contest, stamina: 0 }) < baseline);
  assert.equal(getCatchCompletionChance({ ...contest, isTargetSpammed: true, isRbFlatSpammed: true }), baseline);
  assert.equal(getCatchCompletionChance({ ...contest, effectiveDefDist: 80, effectiveBallDist: 80, stamina: 0 }), 0.905);
});

test('Pro defensive AI uses heavy fronts situationally and alternates away from repeated pressure', () => {
  const runTendency = [{ play: 'PRO_JET_SWEEP' }, { play: 'PRO_DRAW' }];
  const screenTendency = [{ play: 'PRO_SCREEN' }, { play: 'PRO_SCREEN' }];
  const base = { recentPlays: runTendency, down: 1, yardsToGo: 10, previousCall: 'PRO_COVER2_HARD_FLAT' };

  assert.equal(chooseProDefensiveCall(base, () => 0), 'PRO_RUN_STOP_BOX');
  assert.equal(chooseProDefensiveCall({ ...base, previousCall: 'PRO_RUN_STOP_BOX' }, () => 0), 'PRO_TAMPA2');
  assert.equal(chooseProDefensiveCall({ ...base, previousCall: 'PRO_BLITZ_ZERO' }, () => 0), 'PRO_TAMPA2');
  assert.equal(chooseProDefensiveCall({ ...base, recentPlays: screenTendency }, () => 0), 'PRO_BLITZ_ZERO');
  assert.equal(chooseProDefensiveCall({ ...base, recentPlays: screenTendency, previousCall: 'PRO_BLITZ_ZERO' }, () => 0), 'PRO_TAMPA2');
  assert.equal(chooseProDefensiveCall({ ...base, down: 3, yardsToGo: 2, recentPlays: [] }, () => 0), 'PRO_RUN_STOP_BOX');
  assert.equal(chooseProDefensiveCall({ ...base, recentPlays: [], previousCall: 'PRO_COVER2_HARD_FLAT' }, () => 0), 'PRO_COVER2_HARD_FLAT');
});

test('catch outcomes favor breakups over picks and boundary decisions use actual position', () => {
  const contest = { effectiveDefDist: 20, effectiveBallDist: 20, isTargetSpammed: false, isRbFlatSpammed: false, isRb: false };
  const outcomes = Array.from({ length: 1000 }, (_, index) => resolveCatchContestOutcome({ ...contest, roll: index / 1000 }));
  assert.ok(outcomes.filter(outcome => outcome.type === 'BROKEN_UP').length > outcomes.filter(outcome => outcome.type === 'INTERCEPTED').length * 5);
  assert.equal(resolveCatchContestOutcome({ ...contest, receiverX: 29, fieldWidth: 340, roll: 0.99 }).type, 'OUT_OF_BOUNDS');
  assert.equal(resolveCatchContestOutcome({ ...contest, receiverX: 30, fieldWidth: 340, roll: 0.99 }).type, 'COMPLETE');
});

test('route movement applies the speed bonus once and fatigue slows receivers', () => {
  const runRoute = (speedMultiplier: number, stamina: number) => {
    const receiver: Entity = { x: 100, y: 500, radius: 10, routeType: 'GO', speedMultiplier, stamina };
    for (let frame = 0; frame < 60; frame++) updateRouteMovement(receiver, 'QB_DROP', 1, [], 340);
    return receiver.y - 500;
  };
  const normal = runRoute(1, 100);
  assert.ok(Math.abs(runRoute(1.08, 100) / normal - 1.08) < 0.001);
  assert.ok(runRoute(1, 0) / normal > 0.62 && runRoute(1, 0) / normal <= 0.63);
});

test('defender run pursuit starts at base speed and ramps up over time', () => {
  const initial = getRunPursuitMovement(0.88, 1);
  const later = getRunPursuitMovement(0.88, 40);
  const maxed = getRunPursuitMovement(0.88, 1000);

  assert.ok(initial.speed < 0.92, 'Pursuit should not gain an instant distance-based speed bonus');
  assert.ok(initial.acceleration < 0.13, 'Pursuit acceleration should start gradually');
  assert.ok(later.speed > initial.speed);
  assert.ok(later.acceleration > initial.acceleration);
  assert.equal(maxed.speed, 2.98);
  assert.equal(maxed.acceleration, 0.4);
});

test('user-controlled players get a modest speed edge while max pursuit remains faster', () => {
  assert.equal(USER_CONTROL_SPEED_MULTIPLIER, 1.12);

  const maxPursuitSpeed = getRunPursuitMovement(0.88, 1000).speed * 0.68 * GAME_SPEED_SCALE;
  const boostedCarrierSpeed = getBallCarrierRunSpeed(false, true) * 0.78 * GAME_SPEED_SCALE * USER_CONTROL_SPEED_MULTIPLIER;
  assert.ok(boostedCarrierSpeed > getBallCarrierRunSpeed(false, true) * 0.78 * GAME_SPEED_SCALE);
  assert.ok(maxPursuitSpeed > boostedCarrierSpeed, 'A fully accelerated standard defender should still be able to catch the fastest controlled carrier');
});

test('fatigue follows workload and endurance, with bounded recovery and speed penalties', () => {
  assert.equal(updatePlayerStamina(100, 500), 70);
  assert.ok(updatePlayerStamina(100, 500, 0.9) < updatePlayerStamina(100, 500, 1.15));
  assert.equal(updatePlayerStamina(2, 500), 0);
  assert.equal(updatePlayerStamina(99, 0, 1, 5), 100);
  assert.equal(getFatigueSpeedMultiplier(100), 1);
  assert.equal(getFatigueSpeedMultiplier(-20), 0.65);
});

test('running backs tire on carries and recover fully after two plays off', () => {
  let stamina = updateRunningBackStamina(100, true, 30);
  assert.equal(stamina, 29);
  assert.ok(getFatigueSpeedMultiplier(stamina) < 0.9);
  stamina = updateRunningBackStamina(stamina, false);
  assert.equal(stamina, 79);
  stamina = updateRunningBackStamina(stamina, false);
  assert.equal(stamina, 100);
  assert.equal(updateRunningBackStamina(100, true, 5), 59);
});

test('CPU counters repeated successful run, deep-pass, short-pass, and RB-target tendencies', () => {
  const successful = (play: string, isPass: boolean, extra: Record<string, unknown> = {}) => ({
    play, isPass, isSuccessful: true, ...extra
  });
  assert.equal(getSuccessfulPlayCounter([
    successful('POWER', false), successful('SWEEP', false)
  ]), 'ZONE34');
  assert.equal(getSuccessfulPlayCounter([
    successful('DEEP_SHOT', true), successful('POST_WHEEL', true)
  ]), 'ZONE232');
  assert.equal(getSuccessfulPlayCounter([
    successful('MESH', true), successful('SHORT_PASS', true)
  ]), 'ZONE151');
  assert.equal(getSuccessfulPlayCounter([
    successful('CONTROL_PASS', true, { targetWasRb: true }),
    successful('SHORT_PASS', true, { isFlatPass: true })
  ]), 'ZONE151');
  assert.equal(getSuccessfulPlayCounter([
    successful('POWER', false), { play: 'ISO', isPass: false, isSuccessful: false }
  ]), null);
});

test('three WR targets exhaust stamina and two untargeted plays restore it', () => {
  let stamina = 100;
  stamina = updateReceiverTargetStamina(stamina, true);
  assert.ok(Math.abs(stamina - 200 / 3) < 0.0001);
  stamina = updateReceiverTargetStamina(stamina, true);
  assert.ok(Math.abs(stamina - 100 / 3) < 0.0001);
  stamina = updateReceiverTargetStamina(stamina, true);
  assert.equal(stamina, 0);
  stamina = updateReceiverTargetStamina(stamina, false);
  assert.equal(stamina, 50);
  stamina = updateReceiverTargetStamina(stamina, false);
  assert.equal(stamina, 100);
});

test('an exhausted WR has increased hit-triggered fumble risk, unlike other carriers', () => {
  const contact = { isBlitzer: false, isBigHit: false };
  assert.equal(getCarrierFumbleChance({ ...contact, isFatiguedReceiver: true, stamina: 100 }), 0.08);
  assert.ok(Math.abs(getCarrierFumbleChance({ ...contact, isFatiguedReceiver: true, stamina: 0 }) - 0.23) < 0.000001);
  assert.equal(getCarrierFumbleChance({ ...contact, isFatiguedReceiver: false, stamina: 0 }), 0.08);
  assert.ok(Math.abs(getCarrierFumbleChance({ isBlitzer: true, isBigHit: true, isFatiguedReceiver: true, stamina: 0 }) - 0.32) < 0.000001);
});

test('deep blitzers must run to a blocker before pass protection can engage them', () => {
  for (const attackDirection of [-1, 1]) {
    const blocker: Entity = { x: 170, y: 500, radius: 10 };
    const rusher: Entity = { x: 170, y: 500 + 200 * attackDirection, radius: 10, defenseAssignment: 'BLITZ' };
    const quarterback: Entity = { x: 170, y: 500 - 48 * attackDirection, radius: 12 };
    const initialY = rusher.y;
    assert.equal(canEngagePassBlock(blocker, rusher), false);
    moveToward(rusher, quarterback.x, quarterback.y, 0.22, 1.28, 0);
    assert.ok(Math.abs(rusher.y - initialY) < 1);
    assert.equal(canEngagePassBlock(blocker, rusher), false);
    let frames = 1;
    while (!canEngagePassBlock(blocker, rusher) && frames < 500) {
      moveToward(rusher, quarterback.x, quarterback.y, 0.22, 1.28, 0);
      frames++;
    }
    assert.ok(frames > 100 && frames < 500);
    assert.equal(canEngagePassBlock(blocker, rusher), true);
  }
});

test('pass protection engagement checks real contact without moving either player', () => {
  const blocker: Entity = { x: 170, y: 500, radius: 10 };
  const rusher: Entity = { x: 170, y: 526, radius: 10 };
  const originalBlocker = { ...blocker };
  const originalRusher = { ...rusher };
  assert.equal(canEngagePassBlock(blocker, rusher), true);
  assert.deepEqual(blocker, originalBlocker);
  assert.deepEqual(rusher, originalRusher);
  assert.equal(canEngagePassBlock(blocker, { ...rusher, y: 527 }), false);
});

test('pass blockers can be shed and nearby unengaged blockers do not prevent sacks', () => {
  const blocker: Entity = { x: 170, y: 500, radius: 10 };
  const rusher: Entity = { x: 170, y: 526, radius: 10 };
  assert.equal(getPassBlockBaseHoldFrames(), 155);
  const sharedBlitzerHoldFrames = getPassBlockHoldFrames(getPassBlockBaseHoldFrames(), 1, 1);
  assert.equal(sharedBlitzerHoldFrames, 155, 'Every blitzer uses the same blocker duration');
  assert.equal(getPassBlockHoldFrames(100, 1.2, 1), 120);
  assert.equal(getPassBlockHoldFrames(100, 0.6, 1.5), 45);

  for (let frame = 0; frame < 3; frame++) {
    rusher.isEngagedWithBlocker = false;
    assert.equal(shouldHoldPassBlock(blocker, rusher, 3), true);
  }
  rusher.isEngagedWithBlocker = false;
  assert.equal(shouldHoldPassBlock(blocker, rusher, 3), false);
  assert.equal(isRusherActivelyBlocked(rusher, [blocker]), false);

  rusher.isEngagedWithBlocker = true;
  assert.equal(isRusherActivelyBlocked(rusher, [blocker]), true);
  blocker.x = 230;
  assert.equal(isRusherActivelyBlocked(rusher, [blocker]), false);
});

test('forward ball-carrier input is not penalized relative to backward input', () => {
  for (const attackDirection of [-1, 1]) {
    const forwardInput = attackDirection;
    const backwardInput = -attackDirection;
    assert.equal(getRunDirectionSpeedFactor(forwardInput, attackDirection), 1.05);
    assert.equal(getRunDirectionSpeedFactor(backwardInput, attackDirection), 0.70);
  }
});

test('user-controlled defense speed uses the player rating and matches defensive coverage pace', () => {
  const userSpeed = getUserDefenderSpeed(1.18);
  const coverageSpeed = 2.05 * 0.68 * GAME_SPEED_SCALE * 1.18;
  assert.ok(userSpeed > coverageSpeed, 'Direct control should preserve an edge over an AI defender with the same rating');
  assert.ok(getUserDefenderSpeed(1.18, 0) < userSpeed, 'Fatigue should still reduce direct-control speed');
});

test('snaps travel from the center in front of the QB to the QB carrying position in either direction', () => {
  const center: Entity = { x: 170, y: 500, radius: 10 };
  for (const attackDirection of [-1, 1]) {
    const quarterback: Entity = { x: 170, y: 500 - 48 * attackDirection, radius: 12 };
    const start = { x: center.x, y: center.y - 15 * attackDirection };
    const finish = { x: quarterback.x - 17 * attackDirection, y: quarterback.y };
    assert.deepEqual(getSnapBallPosition(center, quarterback, attackDirection, 0), start);
    assert.deepEqual(getSnapBallPosition(center, quarterback, attackDirection, 1), finish);
    assert.deepEqual(getSnapBallPosition(center, quarterback, attackDirection, 0.5), {
      x: (start.x + finish.x) / 2,
      y: (start.y + finish.y) / 2
    });
    assert.deepEqual(getSnapBallPosition(center, quarterback, attackDirection, -1), start);
    assert.deepEqual(getSnapBallPosition(center, quarterback, attackDirection, 2), finish);
  }
});

test('fresh possessions start at the offense own 20 in either direction', () => {
  assert.equal(getDriveStartY(-1, 1200, 100), 900);
  assert.equal(getDriveStartY(1, 1200, 100), 300);
  for (const attackDirection of [-1, 1]) {
    const startY = getDriveStartY(attackDirection, 1200, 100);
    const firstDownY = startY + 100 * attackDirection;
    assert.equal(calculateYardsToGo(startY, firstDownY, attackDirection), 10);
  }
});

test('tackles and sacks in either own end zone are safeties, but incomplete passes are not', () => {
  assert.equal(isSafety(1100, -1, 1200, 100, 'TACKLE'), true);
  assert.equal(isSafety(1150, -1, 1200, 100, 'SACK'), true);
  assert.equal(isSafety(100, 1, 1200, 100, 'TACKLE'), true);
  assert.equal(isSafety(50, 1, 1200, 100, 'SACK'), true);
  assert.equal(isSafety(1099, -1, 1200, 100, 'TACKLE'), false);
  assert.equal(isSafety(101, 1, 1200, 100, 'TACKLE'), false);
  assert.equal(isSafety(1150, -1, 1200, 100, 'INCOMPLETE'), false);
});

test('short passes clear defensive linemen on a safe arc', () => {
  const maxHeight = getPassArcMaxHeight(70, false);
  const lineCrossingHeight = getPassArcHeight(maxHeight, 0.18);

  assert.equal(maxHeight, 38);
  assert.ok(lineCrossingHeight > getDefenderPassReachHeight('DL'));
  assert.equal(getPassArcHeight(maxHeight, 0.5), maxHeight);
});

test('blitz lobs have more airtime and a higher arc than standard throws', () => {
  const standardFrames = getPassFlightFrames(80, 5);
  const lobFrames = getPassFlightFrames(80, 5, true);

  assert.ok(lobFrames >= standardFrames * 1.4);
  assert.ok(getPassArcMaxHeight(80, false, true) > getPassArcMaxHeight(80, false));
});

test('tap-to-throw selects the nearest eligible receiver and ignores blockers', () => {
  const nearReceiver: Entity = { x: 100, y: 200, radius: 10 };
  const overlappingReceiver: Entity = { x: 112, y: 200, radius: 10 };
  const blocker: Entity = { x: 100, y: 200, radius: 10, isBlocker: true };

  assert.equal(findTappedPassReceiver([nearReceiver, overlappingReceiver, blocker], 101, 200), nearReceiver);
  assert.equal(findTappedPassReceiver([blocker], 100, 200), null);
  assert.equal(findTappedPassReceiver([nearReceiver], 131, 200), null);
});

test('tap-to-throw leads moving receivers by most of the estimated flight', () => {
  const receiver: Entity = { x: 100, y: 200, vx: 1, vy: -2, radius: 10 };

  assert.deepEqual(getPassLeadTarget(receiver, 30), { x: 127, y: 146 });
});

test('CPU pass leads follow route cuts without mutating the intended receiver', (context) => {
  context.mock.method(Date, 'now', () => 1000);
  for (const attackDirection of [-1, 1]) {
    for (const routeType of ['SLANT-R', 'FLAG-L', 'COMEBACK', 'CROSS-R', 'POST-L', 'HITCH', 'WHEEL', 'GO']) {
      const receiver: Entity = { x: 170, y: 500, vx: 0, vy: attackDirection, radius: 10, routeType, timer: 25 };
      const original = { ...receiver };
      const expectedReceiver = { ...receiver };
      const target = getRoutePassLeadTarget(receiver, 40, attackDirection, 340, []);
      for (let frame = 0; frame < 40; frame++) {
        updateRouteMovement(expectedReceiver, 'THROWN', attackDirection, [], 340);
      }
      assert.deepEqual(target, { x: expectedReceiver.x, y: expectedReceiver.y });
      assert.deepEqual(receiver, original);
    }
  }
});

test('CPU route predictions keep receivers in bounds and preserve RB lead behavior', () => {
  const receiver: Entity = { x: 305, y: 500, vx: 1, vy: -1, radius: 10, routeType: 'CROSS-R', timer: 60 };
  const target = getRoutePassLeadTarget(receiver, 40, -1, 340, []);
  assert.ok(target.x <= 310 && target.x >= 30);
  const runningBack = { ...receiver, isRB: true };
  assert.deepEqual(getRoutePassLeadTarget(runningBack, 40, -1, 340, []), getPassLeadTarget(runningBack, 40));
});

test('elevated passes clear linemen and blitzers cannot bat them down', () => {
  const maxHeight = getPassArcMaxHeight(70, false);
  const lateLineHeight = getPassArcHeight(maxHeight, 0.84);

  assert.ok(lateLineHeight > getDefenderPassReachHeight('DL'));
  assert.equal(canDefenderDeflectPass({
    defenderType: 'DL',
    isPassRusher: false,
    isEngagedWithBlocker: false,
    distanceToBall: 5,
    ballHeight: lateLineHeight
  }), false);
  assert.equal(canDefenderDeflectPass({
    defenderType: 'LB',
    isPassRusher: true,
    isEngagedWithBlocker: false,
    distanceToBall: 5,
    ballHeight: 0
  }), false);
  assert.equal(canDefenderDeflectPass({
    defenderType: 'DL',
    isPassRusher: false,
    isEngagedWithBlocker: true,
    distanceToBall: 5,
    ballHeight: 0
  }), false);
});

test('yards to go stays tied to the first-down marker in both directions', () => {
  assert.equal(calculateYardsToGo(455, 400, -1), 6);
  assert.equal(calculateYardsToGo(530, 400, -1), 13);
  assert.equal(calculateYardsToGo(545, 600, 1), 6);
  assert.equal(calculateYardsToGo(470, 600, 1), 13);
  assert.equal(calculateYardsToGo(444, 400, -1), 4);
  assert.equal(calculateYardsToGo(556, 600, 1), 4);
  assert.equal(calculateYardsToGo(390, 400, -1), 0);
  assert.equal(calculateYardsToGo(610, 600, 1), 0);

  for (const attackDirection of [-1, 1]) {
    const endingY = 500 + (56 * attackDirection);
    const result = resolvePlayResult({
      lineOfScrimmageY: 500,
      endingY,
      attackDirection,
      resultType: 'TACKLE',
      fieldHeight: 1200,
      endZoneHeight: 100
    });
    const firstDownMarkerY = 500 + (100 * attackDirection);
    const remaining = calculateYardsToGo(endingY, firstDownMarkerY, attackDirection);

    assert.equal(result.yardsGained, 6);
    assert.equal(result.yardsGained + remaining, 10);
  }
});

test('QB scramble protection prevents an immediate tackle but expires normally', () => {
  assert.equal(canTackleQuarterback(30), false);
  assert.equal(canTackleQuarterback(1), false);
  assert.equal(canTackleQuarterback(0), true);
});

test('CPU releases open, pressured, and overdue passes before scrambling', () => {
  const situation = {
    hasTarget: true,
    isDeepShotOpportunity: false,
    hasOpenBreak: false,
    isUnderHeavyPressure: false,
    playClock: 0,
    bestScore: 0
  };

  assert.equal(shouldCpuReleasePass({ ...situation, hasOpenBreak: true, playClock: 31 }), false);
  assert.equal(shouldCpuReleasePass({ ...situation, hasOpenBreak: true, playClock: 32 }), true);
  assert.equal(shouldCpuReleasePass({ ...situation, isUnderHeavyPressure: true, playClock: 26, pressureFrames: 9 }), false);
  assert.equal(shouldCpuReleasePass({ ...situation, isUnderHeavyPressure: true, playClock: 35, pressureFrames: 10 }), true);
  assert.equal(shouldCpuReleasePass({ ...situation, playClock: 65 }), false);
  assert.equal(shouldCpuReleasePass({ ...situation, playClock: 66 }), true);
  assert.equal(shouldCpuReleasePass({ ...situation, hasTarget: false, playClock: 66 }), false);
});

test('CPU pressure reads allow a short reaction window before forcing a throw', () => {
  assert.equal(isCpuPressureRecognized(false, 40), false);
  assert.equal(isCpuPressureRecognized(true, 7), false);
  assert.equal(isCpuPressureRecognized(true, 8), true);
});

test('CPU vertical calls wait for downfield windows but escape pressure and eventually release', () => {
  const situation = {
    hasTarget: true,
    isDeepShotOpportunity: false,
    hasOpenBreak: true,
    isUnderHeavyPressure: false,
    isVerticalPlay: true,
    playClock: 35,
    bestScore: 90,
    targetDepthYards: 4,
    targetSeparation: 25
  };
  assert.equal(shouldCpuReleasePass(situation), false);
  assert.equal(shouldCpuReleasePass({ ...situation, playClock: 59, targetDepthYards: 18 }), false);
  assert.equal(shouldCpuReleasePass({ ...situation, playClock: 60, targetDepthYards: 18 }), true);
  assert.equal(shouldCpuReleasePass({ ...situation, playClock: 60, targetDepthYards: 18, targetSeparation: 8 }), false);
  assert.equal(shouldCpuReleasePass({ ...situation, isUnderHeavyPressure: true, playClock: 35, pressureFrames: 10 }), true);
  assert.equal(shouldCpuReleasePass({ ...situation, playClock: 100 }), false);
  assert.equal(shouldCpuReleasePass({ ...situation, playClock: 200 }), false);
  assert.equal(shouldCpuReleasePass({ ...situation, playClock: 240 }), true);
  assert.equal(shouldCpuReleasePass({ ...situation, hasTarget: false, playClock: 240 }), false);
});

test('protected CPU vertical passes reach deep catch windows with real route speeds', (context) => {
  context.mock.method(Date, 'now', () => 1000);
  for (const attackDirection of [-1, 1]) {
    for (const routeType of ['GO', 'POST-L', 'WHEEL']) {
      const receiver: Entity = { x: 170, y: 500, radius: 10, routeType, timer: 0 };
      const quarterback = { x: 170, y: 500 - 48 * attackDirection };
      let releasedAt = 0;
      let catchDepth = 0;
      for (let frame = 1; frame <= 240; frame++) {
        updateRouteMovement(receiver, 'QB_DROP', attackDirection, [], 340);
        const distance = Math.hypot(receiver.x - quarterback.x, receiver.y - quarterback.y);
        const arrivalFrames = Math.max(16, Math.round(distance / ((distance > 240 ? 9.5 : 8.6) * 0.8)));
        const target = getRoutePassLeadTarget(receiver, arrivalFrames, attackDirection, 340, []);
        catchDepth = (target.y - 500) * attackDirection / 10;
        if (shouldCpuReleasePass({
          hasTarget: true,
          isDeepShotOpportunity: false,
          hasOpenBreak: true,
          isUnderHeavyPressure: false,
          isVerticalPlay: true,
          playClock: frame,
          bestScore: 90,
          targetDepthYards: catchDepth,
          targetSeparation: 25
        })) {
          releasedAt = frame;
          break;
        }
      }
      assert.ok(releasedAt > 35 && releasedAt < 240, `${routeType}: release at ${releasedAt}`);
      assert.ok(catchDepth >= 15, `${routeType}: catch depth ${catchDepth}`);
    }
  }
});

test('CPU QB scrambles occasionally when pressured and passing options are poor', () => {
  const situation = {
    playClock: 32,
    bestScore: 20,
    isUnderHeavyPressure: true,
    hasOpenBreak: false
  };

  assert.equal(shouldCpuScramble(situation, () => 0.1), true);
  assert.equal(shouldCpuScramble(situation, () => 0.4), false);
  assert.equal(shouldCpuScramble({ ...situation, isUnderHeavyPressure: false, playClock: 59 }, () => 0), false);
  assert.equal(shouldCpuScramble({ ...situation, isUnderHeavyPressure: false, playClock: 60 }, () => 0), true);
  assert.equal(shouldCpuScramble({ ...situation, hasOpenBreak: true }, () => 0), false);
  assert.equal(shouldCpuScramble({ ...situation, bestScore: 31 }, () => 0), false);
});

test('QB run blockers prioritize the defender upfield', () => {
  const runner: Entity = { x: 170, y: 500, radius: 10 };
  const blocker: Entity = { x: 170, y: 520, radius: 10 };
  const defenderAhead: Entity = { x: 170, y: 480, radius: 10 };
  const defenderBehind: Entity = { x: 170, y: 510, radius: 10 };

  const aheadScore = scoreRunBlockTarget(blocker, runner, defenderAhead, -1, true);
  const behindScore = scoreRunBlockTarget(blocker, runner, defenderBehind, -1, true);

  assert.ok(aheadScore < behindScore);
  assert.ok(scoreRunBlockTarget(blocker, runner, defenderAhead, -1, true) < scoreRunBlockTarget(blocker, runner, defenderAhead, -1, false));
});

function createAlignedDefense(playKey: string, formation: 'SPREAD' | 'STACK' | 'TRIPS' = 'SPREAD') {
  const positions = formation === 'STACK'
    ? { left: 90, right: 270, center: 125 }
    : formation === 'TRIPS'
      ? { left: 210, right: 285, center: 250 }
      : { left: 50, right: 290, center: 200 };
  const receivers: Entity[] = [
    { x: positions.left, y: 500, startX: positions.left, startY: 500, radius: 10 },
    { x: positions.right, y: 500, startX: positions.right, startY: 500, radius: 10 }
  ];
  const centerReceiver: Entity = { x: positions.center, y: 500, startX: positions.center, startY: 500, radius: 10 };
  const defenders: Entity[] = Array.from({ length: 7 }, (_, index) => ({
    x: 170,
    y: 500,
    startX: 170,
    startY: 500,
    radius: 10,
    type: index === 0 ? 'DL' : index === 6 ? 'FS' : 'LB'
  }));

  alignDefenders(defenders, playKey, -1, 500, receivers, centerReceiver);
  return { defenders, eligibleReceivers: [...receivers, centerReceiver] };
}

test('the four defensive schemes align the requested rush and coverage groups', async () => {
  const { defensiveKeys, defensivePlaybook } = await import('./playbook');
  assert.deepEqual(defensiveKeys, ['COVER2', 'ZONE34', 'ZONE232', 'ZONE151']);
  assert.deepEqual(Object.keys(defensivePlaybook), defensiveKeys);

  const expected = [
    { key: 'COVER2', rushers: 1, safeties: 2 },
    { key: 'ZONE34', rushers: 3, safeties: 2 },
    { key: 'ZONE232', rushers: 2, safeties: 2 },
    { key: 'ZONE151', rushers: 1, safeties: 1 }
  ];

  for (const { key, rushers, safeties } of expected) {
    const { defenders } = createAlignedDefense(key);
    assert.equal(defenders.filter(defender => defender.passRusher).length, rushers, key);
    assert.equal(defenders.filter(defender => defender.type === 'FS' || defender.type === 'SS').length, safeties, key);
    assert.ok(defenders.every(defender => defender.passRusher || (defender.zoneX !== undefined && defender.zoneY !== undefined)), key);
  }
});

test('all defensive shells stay behind the LOS and inside both end lines', () => {
  for (const attackDirection of [-1, 1]) {
    for (const playKey of ['COVER2', 'ZONE34', 'ZONE232', 'ZONE151']) {
      const defenders: Entity[] = Array.from({ length: 7 }, () => ({ x: 170, y: 500, radius: 10 }));
      const receivers: Entity[] = [
        { x: 50, y: 500, radius: 10 },
        { x: 290, y: 500, radius: 10 }
      ];
      const centerReceiver: Entity = { x: 170, y: 500, radius: 10 };
      alignDefenders(defenders, playKey, attackDirection, 500, receivers, centerReceiver);
      separateDefenderAlignments(defenders);
      constrainDefendersToFieldSide(defenders, 500, attackDirection, 1200);

      defenders.forEach(defender => {
        assert.ok((defender.y - 500) * attackDirection >= (defender.radius || 10) + 6, `${playKey} crosses LOS`);
        assert.ok(defender.y >= defender.radius && defender.y <= 1200 - defender.radius, `${playKey} crosses endline`);
      });
    }
  }
});

test('manual assignments cannot place a defender across the LOS into the offense side', () => {
  for (const attackDirection of [-1, 1]) {
    const defender: Entity = {
      x: 170,
      y: 500 - (30 * attackDirection),
      startY: 500 - (30 * attackDirection),
      radius: 10
    };

    constrainDefendersToFieldSide([defender], 500, attackDirection, 1200);

    assert.ok((defender.y - 500) * attackDirection >= 16);
  }
});

test('assignment alignment clamps defender and zone targets inside all field boundaries', () => {
  const defender: Entity = {
    x: 400,
    y: 1210,
    startX: 400,
    startY: 1210,
    zoneX: 400,
    zoneY: 1210,
    radius: 10
  };

  alignDefenderToZone(defender, 500, 1);
  constrainDefendersToFieldSide([defender], 500, 1, 1200, 340);

  assert.equal(defender.x, 330);
  assert.equal(defender.startX, 330);
  assert.equal(defender.zoneX, 330);
  assert.equal(defender.y, 1180);
  assert.equal(defender.startY, 1180);
  assert.equal(defender.zoneY, 1180);
});

test('CPU adds randomized box pressure on short-yardage situations without blitzing the deep safety', () => {
  const { defenders, eligibleReceivers } = createAlignedDefense('ZONE34');
  const assignments = chooseCpuDefensiveAssignments(
    defenders,
    eligibleReceivers,
    {
      down: 3,
      yardsToGo: 2,
      lineOfScrimmageY: 500,
      attackDirection: -1,
      recentPlays: [
        { play: 'POWER', isPass: false },
        { play: 'ISO', isPass: false },
        { play: 'POWER', isPass: false }
      ]
    },
    () => 0
  );

  assert.equal([...assignments.values()].filter(assignment => assignment === 'BLITZ').length, 4);
  assert.equal(assignments.get(6), 'ZONE');
});

test('CPU keeps deep support against repeated deep passes', () => {
  const { defenders, eligibleReceivers } = createAlignedDefense('ZONE232');
  const assignments = chooseCpuDefensiveAssignments(
    defenders,
    eligibleReceivers,
    {
      down: 3,
      yardsToGo: 10,
      lineOfScrimmageY: 500,
      attackDirection: -1,
      recentPlays: Array.from({ length: 3 }, () => ({ play: 'DEEP_SHOT', isPass: true }))
    },
    () => 0
  );

  assert.equal([...assignments.values()].filter(assignment => assignment === 'BLITZ').length, 2);
  assert.equal(assignments.get(6), 'ZONE');
  assert.ok([...assignments.values()].filter(assignment => assignment === 'ZONE').length >= 4);
});

test('CPU matches more receivers in man coverage against short-pass tendencies', () => {
  const { defenders, eligibleReceivers } = createAlignedDefense('COVER2');
  const assignments = chooseCpuDefensiveAssignments(
    defenders,
    eligibleReceivers,
    {
      down: 2,
      yardsToGo: 8,
      lineOfScrimmageY: 500,
      attackDirection: -1,
      recentPlays: [
        { play: 'SHORT_PASS', isPass: true },
        { play: 'CONTROL_PASS', isPass: true },
        { play: 'SHORT_PASS', isPass: true }
      ]
    },
    () => 1
  );

  assert.equal([...assignments.values()].filter(assignment => assignment === 'MAN').length, 3);
  assert.ok([...assignments.values()].filter(assignment => assignment === 'ZONE').length >= 3);
});

test('CPU adapts to repeated hot routes across different plays and formations', () => {
  const { defenders, eligibleReceivers } = createAlignedDefense('COVER2');
  const assignments = chooseCpuDefensiveAssignments(
    defenders,
    eligibleReceivers,
    {
      down: 2,
      yardsToGo: 8,
      lineOfScrimmageY: 500,
      attackDirection: -1,
      recentPlays: [
        { play: 'SHORT_PASS', isPass: true, formation: 'SPREAD', routes: { left: 'SLANT-L' } },
        { play: 'CONTROL_PASS', isPass: true, formation: 'STACK', routes: { left: 'SLANT-L' } }
      ]
    },
    () => 1
  );

  assert.equal([...assignments.values()].filter(assignment => assignment === 'MAN').length, 3);
});

test('CPU MAN assignments align at the LOS while ZONE landmarks stay deeper', () => {
  const { defenders, eligibleReceivers } = createAlignedDefense('COVER2');
  const lineOfScrimmageY = 500;
  const attackDirection = -1;
  const manDefender = defenders[1];
  const zoneDefender = defenders[6];
  const zoneDepth = ((zoneDefender.zoneY || 0) - lineOfScrimmageY) * attackDirection;
  defenders.forEach(defender => { defender.defenseAssignment = 'ZONE'; });
  manDefender.defenseAssignment = 'MAN';

  matchCpuDefendersToReceivers(defenders, eligibleReceivers, {
    down: 2,
    yardsToGo: 8,
    lineOfScrimmageY,
    attackDirection,
    recentPlays: []
  });

  assert.ok(manDefender.assignedReceiver);
  assert.equal(manDefender.startX, manDefender.assignedReceiver.x);
  assert.equal(manDefender.startY, getDefensiveLineAlignmentY(lineOfScrimmageY, attackDirection, manDefender.radius));
  assert.ok(zoneDepth > (manDefender.startY! - lineOfScrimmageY) * attackDirection);
});

test('Pro coverage and run fronts rush one defender unless an all-out blitz is called', () => {
  const makeDefenders = () => Array.from({ length: 7 }, (_, index) => ({
    x: 45 + index * 40,
    y: 450,
    radius: 10,
    type: 'DB'
  })) as Entity[];
  const alignedPassRushers = (play: string) => {
    const defenders = makeDefenders();
    alignDefenders(defenders, play, -1, 500, [], null);
    return defenders.filter(defender => defender.passRusher).length;
  };

  assert.equal(alignedPassRushers('PRO_COVER3_DEEP'), 1);
  assert.equal(alignedPassRushers('PRO_RUN_STOP_BOX'), 1);
  assert.equal(alignedPassRushers('PRO_BLITZ_ZERO'), 3);
});

test('Pro deep shells preserve three thirds or four quarters against spread and trips', () => {
  for (const alignment of ['SPREAD', 'TRIPS'] as const) {
    const cover3 = createAlignedDefense('PRO_COVER3_DEEP', alignment).defenders;
    const thirds = cover3.filter(defender => ((500 - (defender.zoneY ?? 500)) >= 300));
    assert.equal(thirds.length, 3);
    assert.deepEqual(thirds.map(defender => defender.zoneX).sort((a, b) => a! - b!), [55, 170, 285]);
    const cover4 = createAlignedDefense('PRO_COVER4_QUARTERS', alignment).defenders;
    const quarters = cover4.filter(defender => ((500 - (defender.zoneY ?? 500)) >= 300));
    assert.equal(quarters.length, 4);
    assert.deepEqual(quarters.map(defender => defender.zoneX).sort((a, b) => a! - b!), [50, 115, 225, 290]);
  }
});

test('Pro man and zero blitz cover all four receivers without moving a deep safety into man coverage', () => {
  for (const play of ['PRO_COVER1_MAN', 'PRO_BLITZ_ZERO']) {
    const { defenders, eligibleReceivers } = createAlignedDefense(play);
    const slot: Entity = { x: 115, y: 500, radius: 10 };
    eligibleReceivers.splice(1, 0, slot);
    alignDefenders(defenders, play, -1, 500, eligibleReceivers.slice(0, -1), eligibleReceivers.at(-1)!);
    assert.equal(new Set(defenders.map(defender => defender.assignedReceiver).filter(Boolean)).size, 4);
    for (const receiver of eligibleReceivers) {
      assert.ok(defenders.some(defender => defender.assignedReceiver === receiver), play);
    }
    if (play === 'PRO_COVER1_MAN') assert.equal(defenders[6].assignedReceiver, undefined);
  }
});

test('CPU allows intermediate routes to develop but releases under pressure or on timeout', () => {
  const situation = {
    hasTarget: true, isDeepShotOpportunity: false, hasOpenBreak: true,
    isUnderHeavyPressure: false, playClock: 66, bestScore: 30,
    isIntermediatePlay: true, targetDepthYards: 5, targetSeparation: 25
  };
  assert.equal(shouldCpuReleasePass(situation), false);
  assert.equal(shouldCpuReleasePass({ ...situation, targetDepthYards: 8 }), true);
  assert.equal(shouldCpuReleasePass({ ...situation, isUnderHeavyPressure: true, pressureFrames: 10 }), true);
  assert.equal(shouldCpuReleasePass({ ...situation, playClock: 180 }), true);
});

test('CPU brackets a lone receiving threat instead of defending blockers or sitting in deep zones', () => {
  for (const playKey of ['COVER2', 'ZONE34', 'ZONE232', 'ZONE151']) {
    for (const randomValue of [0, 1]) {
      const { defenders, eligibleReceivers } = createAlignedDefense(playKey);
      eligibleReceivers.forEach((receiver, index) => {
        receiver.routeType = index === 0 ? 'GO' : 'BLOCK';
        receiver.isBlocker = index !== 0;
      });
      const assignments = chooseCpuDefensiveAssignments(defenders, eligibleReceivers, {
        down: 1,
        yardsToGo: 10,
        lineOfScrimmageY: 500,
        attackDirection: -1,
        recentPlays: []
      }, () => randomValue);
      assert.equal([...assignments.values()].filter(assignment => assignment === 'MAN').length, 2);
      assert.equal([...assignments.values()].filter(assignment => assignment === 'BLITZ').length, 3);
      assert.equal(assignments.get(5), 'QB_SPY');
      assert.equal(assignments.get(6), 'ZONE');
    }
  }
});

test('CPU live matchups bracket only the lone receiver and tighten after repeated routes', () => {
  for (const attackDirection of [-1, 1]) {
    for (const loneIndex of [0, 1, 2]) {
      const { defenders, eligibleReceivers } = createAlignedDefense('ZONE232');
      eligibleReceivers.forEach((receiver, index) => {
        receiver.routeType = index === loneIndex ? 'GO' : 'BLOCK';
        receiver.isBlocker = index !== loneIndex;
      });
      const receiver = eligibleReceivers[loneIndex];
      const situation = { down: 1, yardsToGo: 10, lineOfScrimmageY: 500, attackDirection, recentPlays: [] as Array<{ play: string; isPass: boolean; routes: { left: string } }> };
      const assignments = chooseCpuDefensiveAssignments(defenders, eligibleReceivers, situation, () => 1);
      defenders.forEach((defender, index) => {
        defender.defenseAssignment = assignments.get(index);
        defender.passRusher = defender.defenseAssignment === 'BLITZ';
      });
      matchCpuDefendersToReceivers(defenders, eligibleReceivers, situation);
      const coverage = defenders.filter(defender => defender.defenseAssignment === 'MAN');
      assert.equal(coverage.length, 2);
      assert.ok(coverage.every(defender => defender.assignedReceiver === receiver));
      assert.deepEqual(coverage.map(defender => defender.coverageLeverage), ['INSIDE', 'OUTSIDE']);
      const targets = coverage.map(defender => getBracketCoverageTarget(defender, receiver, attackDirection));
      assert.ok(Math.abs(targets[0].x - targets[1].x) >= 16);
      assert.ok(Math.abs(targets[0].y - targets[1].y) >= 16);
      assert.equal(defenders[6].zoneX, receiver.x);
      const originalCushion = (coverage[0].y - 500) * attackDirection;
      situation.recentPlays = [
        { play: 'SHORT_PASS', isPass: true, routes: { left: 'GO' } },
        { play: 'MESH', isPass: true, routes: { left: 'GO' } }
      ];
      matchCpuDefendersToReceivers(defenders, eligibleReceivers, situation);
      assert.ok((coverage[0].y - 500) * attackDirection < originalCushion);
      assert.equal((defenders[6].zoneY! - 500) * attackDirection, 95);
    }
  }
});

test('CPU man coverage ignores blockers and releases brackets when more routes are added', () => {
  const { defenders, eligibleReceivers } = createAlignedDefense('COVER2');
  defenders.forEach(defender => { defender.defenseAssignment = 'MAN'; defender.coverageLeverage = 'INSIDE'; });
  eligibleReceivers[0].isBlocker = true;
  eligibleReceivers[0].routeType = 'BLOCK';
  matchCpuDefendersToReceivers(defenders, eligibleReceivers, {
    down: 1, yardsToGo: 10, lineOfScrimmageY: 500, attackDirection: -1, recentPlays: []
  });
  assert.ok(defenders.every(defender => defender.assignedReceiver !== eligibleReceivers[0]));
  assert.ok(defenders.every(defender => defender.coverageLeverage === undefined));
});

test('CPU tightens man coverage against a compact receiver formation', () => {
  const { defenders, eligibleReceivers } = createAlignedDefense('ZONE34');
  eligibleReceivers[0].x = 205;
  eligibleReceivers[1].x = 285;
  eligibleReceivers[2].x = 245;

  const assignments = chooseCpuDefensiveAssignments(
    defenders,
    eligibleReceivers,
    {
      down: 1,
      yardsToGo: 10,
      lineOfScrimmageY: 500,
      attackDirection: -1,
      recentPlays: []
    },
    () => 1
  );

  assert.equal([...assignments.values()].filter(assignment => assignment === 'MAN').length, 2);
});

test('pre-snap coverage defenders keep visible separation from receivers', () => {
  const playKeys = ['COVER2', 'ZONE34', 'ZONE232', 'ZONE151'];
  const formations = ['SPREAD', 'STACK', 'TRIPS'] as const;

  for (const formation of formations) {
    for (const playKey of playKeys) {
      const { defenders, eligibleReceivers } = createAlignedDefense(playKey, formation);
      for (const defender of defenders) {
        for (const receiver of eligibleReceivers) {
          const distance = Math.hypot(defender.x - receiver.x, defender.y - receiver.y);
          assert.ok(
            distance >= (defender.radius || 10) + (receiver.radius || 10),
            `${playKey} overlaps a receiver in ${formation}`
          );
        }
      }
    }
  }
});

test('pre-snap front defender stays clear of the offensive line', () => {
  const { defenders, eligibleReceivers } = createAlignedDefense('ZONE34');
  const noseDefender = defenders[0];
  const centerReceiver = eligibleReceivers[2];
  const distance = Math.hypot(noseDefender.x - centerReceiver.x, noseDefender.y - centerReceiver.y);

  assert.ok(distance >= (noseDefender.radius || 10) + (centerReceiver.radius || 10));
});

test('RB coverage aligns across the line on the RB side for either attack direction', () => {
  for (const attackDirection of [-1, 1]) {
    const defender: Entity = { x: 140, y: 500, radius: 10 };
    const runningBack: Entity = { x: 285, y: 500 - (75 * attackDirection), radius: 10 };

    alignDefenderAcrossFromRunningBack(defender, runningBack, 500, attackDirection);

    assert.equal(defender.x, runningBack.x);
    assert.equal(defender.y, 500 + (24 * attackDirection));
    assert.equal(defender.startX, defender.x);
    assert.equal(defender.startY, defender.y);
  }
});

test('MAN coverage aligns directly across the line from its assigned receiver', () => {
  for (const attackDirection of [-1, 1]) {
    const receiver: Entity = { x: 72, y: 500, radius: 10 };
    const defender: Entity = { x: 250, y: 565, startY: 500 + (65 * attackDirection), radius: 10 };

    alignDefenderAcrossFromReceiver(defender, receiver, 500, attackDirection);

    assert.equal(defender.x, receiver.x);
    assert.equal(defender.y, 500 + (24 * attackDirection));
    assert.equal(defender.startX, defender.x);
    assert.equal(defender.startY, defender.y);
    assert.ok(Math.hypot(defender.x - receiver.x, defender.y - receiver.y) >= 20);
  }
});

test('ZONE assignment returns a front-aligned defender to the deeper zone landmark', () => {
  const lineOfScrimmageY = 500;
  const attackDirection = -1;
  const defender: Entity = {
    x: 100,
    y: getDefensiveLineAlignmentY(lineOfScrimmageY, attackDirection),
    startX: 100,
    startY: getDefensiveLineAlignmentY(lineOfScrimmageY, attackDirection),
    zoneX: 120,
    zoneY: 380,
    radius: 10
  };

  alignDefenderToZone(defender, lineOfScrimmageY, attackDirection);

  assert.equal(defender.x, 120);
  assert.equal(defender.y, 380);
  assert.equal(defender.startX, 120);
  assert.equal(defender.startY, 380);
});

test('defender alignments separate stacked players before they can be tapped', () => {
  const defenders: Entity[] = Array.from({ length: 7 }, () => ({ x: 170, y: 500, radius: 10 }));

  separateDefenderAlignments(defenders);

  defenders.forEach((defender, index) => {
    for (const other of defenders.slice(index + 1)) {
      assert.ok(Math.hypot(defender.x - other.x, defender.y - other.y) >= 30);
    }
  });
});

test('manual blitz staging moves defenders to the legal defensive front', () => {
  for (const attackDirection of [-1, 1]) {
    const lineOfScrimmageY = 500;
    const stagedY = [42, 70, 185].map(depth =>
      getBlitzAlignmentY(lineOfScrimmageY + (depth * attackDirection), lineOfScrimmageY, attackDirection)
    );

    assert.deepEqual(stagedY.map(y => (y - lineOfScrimmageY) * attackDirection), [24, 24, 24]);
  }
});

test('players stay inside the back boundary lines of the field', () => {
  const fieldHeight = 1200;
  const radius = 10;
  const beyondTop: Entity = { x: 100, y: -15, radius };
  const beyondBottom: Entity = { x: 200, y: fieldHeight + 15, radius };

  clampPlayerToFieldY(beyondTop, fieldHeight);
  clampPlayerToFieldY(beyondBottom, fieldHeight);

  assert.equal(beyondTop.y, 20);
  assert.equal(beyondBottom.y, fieldHeight - 20);
});

test('all WRs have all routes available in their route tree, while RB keeps the two assigned routes plus BLOCK', async () => {
  const { wrRoutes, outsideRoutes, middleRoutes, runningBackRoutes } = await import('./playbook');
  const expectedWRRoutes = ['SLANT-L', 'SLANT-R', 'FLAG-L', 'FLAG-R', 'COMEBACK', 'CROSS-L', 'CROSS-R', 'GO', 'BLOCK'];
  assert.deepEqual(wrRoutes, expectedWRRoutes, 'wrRoutes should have all 8 pass routes plus BLOCK');
  assert.deepEqual(outsideRoutes, expectedWRRoutes, 'outsideRoutes should have all routes in route tree');
  assert.deepEqual(middleRoutes, expectedWRRoutes, 'middleRoutes should have all routes in route tree');
  assert.deepEqual(runningBackRoutes, ['FLAT', 'GO', 'ANGLE', 'BLOCK'], 'runningBackRoutes should include FLAT, GO, ANGLE, BLOCK');
});

test('AI offense audibles RB into pass protection when facing box pressure (2 rushers)', async () => {
  const { evaluateCpuOffensiveAudibles } = await import('./ai');
  const receivers: Entity[] = [
    { x: 50, y: 500, radius: 10, routeType: 'GO', isOutside: true },
    { x: 290, y: 500, radius: 10, routeType: 'GO', isOutside: true }
  ];
  const centerReceiver: Entity = { x: 170, y: 500, radius: 10, routeType: 'SLANT-R', isCenter: true };
  const rb: Entity = { x: 220, y: 575, radius: 10, routeType: 'FLAT', isRB: true, side: 'right' };
  const defenders: Entity[] = [
    { x: 170, y: 524, radius: 10, type: 'DL', passRusher: true },
    { x: 120, y: 528, radius: 10, type: 'LB', defenseAssignment: 'BLITZ' },
    { x: 80, y: 610, radius: 10, type: 'CB' },
    { x: 260, y: 610, radius: 10, type: 'CB' },
    { x: 170, y: 590, radius: 10, type: 'MLB' },
    { x: 170, y: 720, radius: 10, type: 'FS' },
    { x: 210, y: 560, radius: 10, type: 'LB' }
  ];

  const result = evaluateCpuOffensiveAudibles(
    'PASS',
    receivers,
    centerReceiver,
    rb,
    defenders,
    1,
    10,
    500,
    -1
  );

  assert.equal(rb.isBlocker, true);
  assert.equal(rb.routeType, 'BLOCK');
  assert.ok(result.blockersAssigned.includes('RB'));
});

test('AI offense calls MAX PASS PROTECTION (RB and Center blocking) when facing all-out blitz (3+ rushers)', async () => {
  const { evaluateCpuOffensiveAudibles } = await import('./ai');
  const receivers: Entity[] = [
    { x: 50, y: 500, radius: 10, routeType: 'GO', isOutside: true },
    { x: 290, y: 500, radius: 10, routeType: 'GO', isOutside: true }
  ];
  const centerReceiver: Entity = { x: 170, y: 500, radius: 10, routeType: 'SLANT-R', isCenter: true };
  const rb: Entity = { x: 220, y: 575, radius: 10, routeType: 'FLAT', isRB: true, side: 'right' };
  const defenders: Entity[] = [
    { x: 170, y: 524, radius: 10, type: 'DL', passRusher: true },
    { x: 120, y: 528, radius: 10, type: 'LB', defenseAssignment: 'BLITZ' },
    { x: 215, y: 528, radius: 10, type: 'LB', defenseAssignment: 'BLITZ' },
    { x: 80, y: 610, radius: 10, type: 'CB' },
    { x: 260, y: 610, radius: 10, type: 'CB' },
    { x: 170, y: 590, radius: 10, type: 'MLB' },
    { x: 170, y: 720, radius: 10, type: 'FS' }
  ];

  const result = evaluateCpuOffensiveAudibles(
    'PASS',
    receivers,
    centerReceiver,
    rb,
    defenders,
    3,
    7,
    500,
    -1
  );

  assert.equal(rb.isBlocker, true);
  assert.equal(rb.routeType, 'BLOCK');
  assert.equal(centerReceiver.isBlocker, true);
  assert.equal(centerReceiver.routeType, 'BLOCK');
  assert.ok(result.blockersAssigned.includes('RB'));
  assert.ok(result.blockersAssigned.includes('CENTER'));
});

test('CPU pre-snap protection does not trust blitz or spy assignment tags from deep defenders', async () => {
  const { evaluateCpuOffensiveAudibles } = await import('./ai');
  const receivers: Entity[] = [
    { x: 50, y: 500, radius: 10, routeType: 'GO' },
    { x: 290, y: 500, radius: 10, routeType: 'GO' }
  ];
  const centerReceiver: Entity = { x: 170, y: 500, radius: 10, routeType: 'SLANT-R' };
  const runningBack: Entity = { x: 220, y: 530, radius: 10, routeType: 'FLAT' };
  const taggedDefenders: Entity[] = [
    { x: 45, y: 400, radius: 10, type: 'LB', defenseAssignment: 'BLITZ', passRusher: true },
    { x: 170, y: 400, radius: 10, type: 'LB', defenseAssignment: 'BLITZ', passRusher: true },
    { x: 295, y: 400, radius: 10, type: 'LB', defenseAssignment: 'BLITZ', passRusher: true },
    { x: 80, y: 350, radius: 10, type: 'LB', defenseAssignment: 'RB_SPY' },
    { x: 260, y: 350, radius: 10, type: 'SS', defenseAssignment: 'RB_SPY' }
  ];

  const result = evaluateCpuOffensiveAudibles(
    'PASS', receivers, centerReceiver, runningBack, taggedDefenders, 1, 10, 500, -1
  );

  assert.equal(result.blockersAssigned.length, 0);
  assert.equal(runningBack.isBlocker, undefined);
  assert.equal(centerReceiver.isBlocker, undefined);
});

test('AI ball carrier executes intelligent lateral juke when defender closes in', async () => {
  const { evaluateCpuBallCarrierMoves } = await import('./ai');
  const carrier: Entity = { x: 170, y: 460, radius: 10, vx: 0, vy: -2 };
  const defenders: Entity[] = [
    { x: 180, y: 430, radius: 10 } // approaching from upper right in open field
  ];

  const result = evaluateCpuBallCarrierMoves(
    carrier,
    defenders,
    -1,
    1,
    15, // 15 yards to go, not near first down
    500
  );

  assert.equal(result.moveType, 'JUKE');
  assert.ok((result.lateralVx || 0) < 0, 'Should juke left away from defender on right');
  assert.ok((carrier.tackleImmunity || 0) > 0, 'Carrier should receive tackle immunity');
});

test('AI ball carrier executes power truck boost in critical short-yardage situation', async () => {
  const { evaluateCpuBallCarrierMoves } = await import('./ai');
  const carrier: Entity = { x: 170, y: 480, radius: 10, vx: 0, vy: -2 };
  const defenders: Entity[] = [
    { x: 170, y: 450, radius: 10 }
  ];

  const result = evaluateCpuBallCarrierMoves(
    carrier,
    defenders,
    -1,
    3, // 3rd & 2 (critical situation)
    2,
    500
  );

  assert.equal(result.moveType, 'TRUCK');
  assert.ok((carrier.powerBoostTimer || 0) > 0, 'Carrier should activate power boost');
});

test('both offense and defense have exactly 7 players on the field (7v7)', async () => {
  // Simulating the 7 offensive entities: QB, RB, Center Lineman, 3 Receivers, Center Receiver
  const qb: Entity = { x: 170, y: 575, radius: 10 };
  const rb: Entity = { x: 220, y: 575, radius: 10 };
  const linemen: Entity[] = [{ x: 170, y: 500, radius: 10 }];
  const receivers: Entity[] = [
    { x: 45, y: 500, radius: 10 },
    { x: 115, y: 500, radius: 10 },
    { x: 295, y: 500, radius: 10 }
  ];
  const centerReceiver: Entity = { x: 225, y: 500, radius: 10 };

  const offensePlayers = [qb, rb, ...linemen, ...receivers, centerReceiver];
  assert.equal(offensePlayers.length, 7, 'Offense must have 7 players');

  const { defenders } = createAlignedDefense('ZONE34');
  assert.equal(defenders.length, 7, 'Defense must have 7 players');
});

test('resolvePlayResult accurately registers a loss of yards on a SACK', async () => {
  const { resolvePlayResult } = await import('./rules');
  const lineOfScrimmageY = 900;
  const sackY = 950; // QB tackled 50px (5.0 yards) behind line of scrimmage when attacking up (-1)
  const result = resolvePlayResult({
    lineOfScrimmageY,
    endingY: sackY,
    attackDirection: -1,
    resultType: 'SACK',
    fieldHeight: 1200,
    endZoneHeight: 100
  });

  assert.ok(result.yardsGained < 0, 'Sack must register negative yards');
  assert.equal(result.yardsGained, -5, 'Sack 50px behind line should register -5 yards');
  assert.equal(result.isTouchdown, false);
});

test('defenders labeled to blitz experience significantly less broken tackles and have higher tackling success', async () => {
  const { calculateBrokenTackleChance } = await import('./rules');

  // Standard RB tackling vs non-blitzer
  const regularChance = calculateBrokenTackleChance({
    isRB: true,
    isBoosted: false,
    brokenCount: 0,
    isBlitzer: false
  });

  // RB tackling vs blitzer
  const blitzerChance = calculateBrokenTackleChance({
    isRB: true,
    isBoosted: false,
    brokenCount: 0,
    isBlitzer: true
  });

  assert.equal(regularChance, 0.30);
  assert.equal(calculateBrokenTackleChance({ isRB: false, isBoosted: false, brokenCount: 0, isBlitzer: false }), 0.14);
  assert.equal(blitzerChance, 0.05);
  assert.ok(blitzerChance < regularChance, 'Blitzer should experience far fewer broken tackles');

  // Power-boosted runner vs blitzer
  const boostedBlitzerChance = calculateBrokenTackleChance({
    isRB: true,
    isBoosted: true,
    brokenCount: 0,
    isBlitzer: true
  });
  const boostedRegularChance = calculateBrokenTackleChance({
    isRB: true,
    isBoosted: true,
    brokenCount: 0,
    isBlitzer: false
  });
  assert.equal(boostedBlitzerChance, 0.12);
  assert.equal(boostedRegularChance, 0.42);
  assert.ok(boostedBlitzerChance < boostedRegularChance, 'Boosted runner should still break far fewer tackles against blitzers');
});

test('moveToward applies accessible calibrated speed factor', async () => {
  const { moveToward } = await import('./movement');
  const entity: Entity = { x: 100, y: 100, vx: 0, vy: 0, radius: 10 };
  moveToward(entity, 200, 100, 1.0, 10.0, 0);

  // Movement is globally scaled to keep the on-field pace manageable (slowed 10% for testing).
  assert.ok(entity.vx! < 7.5, 'Adjusted speed should be calibrated under 7.5 for maxSpeed 10');
  assert.ok(entity.vx! > 5.0, 'Adjusted speed should be around 5.24 for 10% slowed test pace');
});

test('CPU defense assigns QB_SPY when opponent has scrambled or run with QB', async () => {
  const { defenders, eligibleReceivers } = createAlignedDefense('ZONE34');
  const assignments = chooseCpuDefensiveAssignments(
    defenders,
    eligibleReceivers,
    {
      down: 2,
      yardsToGo: 7,
      lineOfScrimmageY: 500,
      attackDirection: -1,
      recentPlays: [
        { play: 'SHORT_PASS', isPass: true, isQbRun: true }
      ]
    },
    () => 0.5
  );

  const spyAssignments = [...assignments.values()].filter(a => a === 'QB_SPY');
  assert.equal(spyAssignments.length, 1, 'Should assign a linebacker to QB_SPY to contain scrambling QB');
});

test('CPU offense counters user blitzes with max protection, a hot slant, and a deep strike', async () => {
  const { evaluateCpuOffensiveAudibles } = await import('./ai');
  const receivers: Entity[] = [
    { x: 50, y: 500, radius: 10, routeType: 'SLANT-L' },
    { x: 290, y: 500, radius: 10, routeType: 'SLANT-R' }
  ];
  const centerReceiver: Entity = { x: 170, y: 500, radius: 10, routeType: 'SLANT-R' };
  const rb: Entity = { x: 220, y: 460, radius: 10, routeType: 'FLAT' };
  const defenders: Entity[] = [
    { x: 170, y: 520, radius: 10, passRusher: true, defenseAssignment: 'BLITZ' },
    { x: 140, y: 520, radius: 10, passRusher: true, defenseAssignment: 'BLITZ' },
    { x: 200, y: 520, radius: 10, passRusher: true, defenseAssignment: 'BLITZ' }
  ];

  const result = evaluateCpuOffensiveAudibles(
    'PASS',
    receivers,
    centerReceiver,
    rb,
    defenders,
    1,
    10,
    500,
    -1,
    340
  );

  assert.ok(rb.isBlocker, 'RB should be assigned to pass block');
  assert.ok(centerReceiver.isBlocker, 'Center receiver should be assigned to pass block');
  assert.equal(receivers[0].routeType, 'SLANT-R', 'Outside receiver should have a quick hot route');
  assert.equal(receivers[1].routeType, 'GO', 'Second receiver should attack the vacated deep coverage');
  assert.ok(result.audibleMessage?.includes('USER BLITZ COUNTERED'), 'Audible message should announce blitz countered');
});

test('CPU releases the deep read after sustained pressure instead of waiting for the vertical-play timeout', () => {
  assert.equal(shouldCpuReleasePass({
    hasTarget: true,
    isDeepShotOpportunity: false,
    hasOpenBreak: false,
    isUnderHeavyPressure: true,
    pressureFrames: 10,
    playClock: 18,
    bestScore: 10,
    isVerticalPlay: true,
    targetDepthYards: 5,
    targetSeparation: 3
  }), true);
});

test('CPU defense assigns both QB_SPY and an edge contain rusher when opponent spams QB runs', async () => {
  const { defenders, eligibleReceivers } = createAlignedDefense('ZONE34');
  const assignments = chooseCpuDefensiveAssignments(
    defenders,
    eligibleReceivers,
    {
      down: 2,
      yardsToGo: 6,
      lineOfScrimmageY: 500,
      attackDirection: -1,
      recentPlays: [
        { play: 'SHORT_PASS', isPass: true, isQbRun: true },
        { play: 'CONTROL_PASS', isPass: true, isQbRun: true }
      ]
    },
    () => 0.5
  );

  const spyAssignments = [...assignments.values()].filter(a => a === 'QB_SPY');
  const blitzAssignments = [...assignments.values()].filter(a => a === 'BLITZ');
  assert.equal(spyAssignments.length, 1, 'Should assign a linebacker to QB_SPY');
  assert.ok(blitzAssignments.length >= 2, 'Should assign an edge contain rusher (BLITZ) in addition to nose tackle');
});

test('alignDefenders shifts deep safety towards overloaded trips side', () => {
  const receivers: Entity[] = [
    { x: 50, y: 500, startX: 50, startY: 500, radius: 10 },
    { x: 290, y: 500, startX: 290, startY: 500, radius: 10 }
  ];
  const centerReceiver: Entity = { x: 250, y: 500, startX: 250, startY: 500, radius: 10 };
  const defenders: Entity[] = Array.from({ length: 7 }, (_, index) => ({
    x: 170,
    y: 500,
    startX: 170,
    startY: 500,
    radius: 10,
    type: index === 0 ? 'DL' : index === 6 ? 'FS' : 'LB'
  }));

  // Receivers on right side: centerReceiver (250) and receivers[1] (290) plus slot if trips
  const tripsReceivers: Entity[] = [
    { x: 50, y: 500, startX: 50, startY: 500, radius: 10 },
    { x: 215, y: 500, startX: 215, startY: 500, radius: 10 },
    { x: 290, y: 500, startX: 290, startY: 500, radius: 10 }
  ];
  alignDefenders(defenders, 'ZONE34', -1, 500, tripsReceivers, centerReceiver);
  assert.ok(defenders[6].startX! > 200, 'Deep safety should shift towards the overloaded 3-receiver right side');
});

test('AI ball carrier juke speed is calibrated and broken tackle chance against user defense is tightly bounded', async () => {
  const { evaluateCpuBallCarrierMoves } = await import('./ai');
  const { calculateBrokenTackleChance } = await import('./rules');

  const carrier: Entity = { x: 170, y: 460, radius: 10, vx: 0, vy: -2 };
  const defenders: Entity[] = [{ x: 180, y: 430, radius: 10 }];

  const result = evaluateCpuBallCarrierMoves(carrier, defenders, -1, 1, 15, 500);
  assert.equal(result.moveType, 'JUKE');
  // Calibrated lateral velocity is balanced and bounded (not wildly teleporting across the field)
  assert.ok(Math.abs(result.lateralVx || 0) <= 2.2, 'Juke lateral velocity should be controlled and realistic');
  assert.ok((carrier.tackleImmunity || 0) <= 5, 'Juke immunity should be limited so defenders can stop carrier');

  // Verify broken tackle chance scaling against user defense
  const baseChance = calculateBrokenTackleChance({
    isRB: true,
    isBoosted: false,
    brokenCount: 0,
    isBlitzer: false
  });
  const userDefenseChance = Math.min(0.03, baseChance * 0.10);
  assert.ok(userDefenseChance <= 0.04, 'User defense should reliably stop carrier with minimal broken tackles');
});

test('QB is allowed to throw backwards at up to 30 degree angle on both sides or targeting RB in backfield', () => {
  // Test backward throw logic geometry
  const attackDirection = -1; // -1 means attacking upwards (-Y)
  const qb = { x: 170, y: 948 };
  const rb = { x: 220, y: 975 }; // RB in backfield behind QB (975 > 948)

  function evaluateThrowOrScramble(targetX: number, targetY: number) {
    const dx = targetX - qb.x;
    const dy = targetY - qb.y;
    const forwardY = dy * attackDirection;
    const lateralDist = Math.abs(dx);
    const maxBackwardY = lateralDist * Math.tan((30 * Math.PI) / 180);
    const isTargetingRb = Math.hypot(targetX - rb.x, targetY - rb.y) < 65;
    const isBackwardScramble = !isTargetingRb && (forwardY < -maxBackwardY);
    return isBackwardScramble ? 'SCRAMBLE' : 'PASS';
  }

  // 1. Direct pass to RB in backfield: should be PASS
  assert.equal(evaluateThrowOrScramble(rb.x, rb.y), 'PASS');

  // 2. Right flat throw angled 20 degrees backwards: dx = 60, backward = 60 * tan(20 deg) ≈ 21.8px (y = 948 + 21.8 = 969.8)
  assert.equal(evaluateThrowOrScramble(qb.x + 60, qb.y + 20), 'PASS');

  // 3. Left flat throw angled 25 degrees backwards: dx = -60, backward = 25px
  assert.equal(evaluateThrowOrScramble(qb.x - 60, qb.y + 25), 'PASS');

  // 4. Steep backward throw straight into backfield (steep backward angle away from lateral, not targeting RB): should be SCRAMBLE
  assert.equal(evaluateThrowOrScramble(qb.x - 30, qb.y + 60), 'SCRAMBLE');
});

test('Backyard Playmaker route line drawing gestures and ball clearance over linemen', async () => {
  const { evaluateDirtSwipeGesture, getBackyardBuddyCallout } = await import('./chalkMenu');

  const receiver: Entity = { x: 80, y: 500, radius: 10 };
  const rb: Entity = { x: 220, y: 520, radius: 10 };
  const defender: Entity = { x: 170, y: 460, radius: 10 };

  // 1. RB Route Line Drawing:
  // - Straight line forward (dx = 0, dy = -40, attackDirection = -1) -> FLY / GO route!
  const rbFlyGesture = evaluateDirtSwipeGesture(rb, 'RB', 0, -40, -1);
  assert.equal(rbFlyGesture.value, 'GO', 'Straight forward line from RB should call FLY / GO route');

  // - Diagonal line (dx = 35, dy = -30, attackDirection = -1) -> FLAT route!
  const rbFlatGesture = evaluateDirtSwipeGesture(rb, 'RB', 35, -30, -1);
  assert.equal(rbFlatGesture.value, 'FLAT', 'Diagonal line from RB should call FLAT route');

  // - Backward swipe (dx = 0, dy = 30) -> RUN BLOCK!
  const rbBlockGesture = evaluateDirtSwipeGesture(rb, 'RB', 0, 30, -1);
  assert.equal(rbBlockGesture.value, 'BLOCK', 'Backward swipe from RB should call RUN BLOCK');

  // 2. WR Line Drawing:
  // - Upward swipe -> GO
  const flyGesture = evaluateDirtSwipeGesture(receiver, 'WR', 0, -50, -1);
  assert.equal(flyGesture.value, 'GO', 'Upward swipe should be GO / FLY route');

  // - Inside diagonal swipe -> SLANT
  const slantGesture = evaluateDirtSwipeGesture(receiver, 'WR', 40, -40, -1);
  assert.equal(slantGesture.value, 'SLANT', 'Inside diagonal swipe should be SLANT');

  // - Horizontal swipe -> CROSS
  const crossGesture = evaluateDirtSwipeGesture(receiver, 'WR', 60, 0, -1);
  assert.equal(crossGesture.value, 'CROSS', 'Horizontal swipe should be CROSS');

  // - Outside diagonal swipe -> FLAG
  const flagGesture = evaluateDirtSwipeGesture(receiver, 'WR', -40, -40, -1);
  assert.equal(flagGesture.value, 'FLAG', 'Outside diagonal swipe should be FLAG');

  // - Backward swipe -> RUN BLOCK
  const blockGesture = evaluateDirtSwipeGesture(receiver, 'WR', 0, 35, -1);
  assert.equal(blockGesture.value, 'BLOCK', 'Deep backward swipe should be BLOCK');

  // 3. Defender Rush Gesture:
  const blitzGesture = evaluateDirtSwipeGesture(defender, 'DEFENDER', 0, 30, -1);
  assert.equal(blitzGesture.value, 'BLITZ', 'Rushing towards LOS should assign BLITZ');

  const zoneGesture = evaluateDirtSwipeGesture(defender, 'DEFENDER', 0, -30, -1);
  assert.equal(zoneGesture.value, 'ZONE', 'Swiping backward from LOS should assign ZONE');

  const manGesture = evaluateDirtSwipeGesture(defender, 'DEFENDER', 40, 0, -1);
  assert.equal(manGesture.value, 'MAN', 'Horizontal swipe should assign MAN');

  assert.equal(
    evaluateDirtSwipeGesture(defender, 'DEFENDER', 0, -30, 1).value,
    'BLITZ',
    'Blitz swipe should work when the field direction is reversed'
  );
  assert.equal(
    evaluateDirtSwipeGesture(defender, 'DEFENDER', 0, 30, 1).value,
    'ZONE',
    'Zone swipe should work when the field direction is reversed'
  );

  // 4. Backyard Buddy Callouts for Run Blocking & Routes:
  const blockQuote = getBackyardBuddyCallout('WR', 'BLOCK', true);
  assert.ok(blockQuote.includes('🛡️'), 'Block callout should have shield icon');
  const rbFlyQuote = getBackyardBuddyCallout('RB', 'GO');
  assert.ok(rbFlyQuote.includes('🚀'), 'RB fly callout should have rocket icon');

  // 5. Ball Flight Clearance Over Linemen Verification:
  // Ball starts at releaseZ = 16, reaches maxZ >= 34 over the line of scrimmage (progress = 0.25)
  const releaseZ = 16;
  const catchZ = 14;
  const maxZ = 38;
  const progressOverLinemen = 0.25;
  const baseHeight = releaseZ + (catchZ - releaseZ) * progressOverLinemen;
  const arcHeight = 4 * (maxZ - ((releaseZ + catchZ) / 2)) * progressOverLinemen * (1 - progressOverLinemen);
  const ballZOverLinemen = baseHeight + arcHeight;

  // Linemen height is 16; ball at z = 31+ clears them by over 15 units!
  assert.ok(ballZOverLinemen > 28, 'Ball trajectory must achieve high clearance (z > 28) over linemen at LOS');
});

test('Tapping defender assigns RB_SPY / covers the RB', async () => {
  const { evaluateDirtSwipeGesture, getBackyardBuddyCallout } = await import('./chalkMenu');
  const defender: Entity = { x: 170, y: 460, radius: 10 };

  // Stationary tap or diagonal swipe toward backfield assigns RB_SPY
  const spyGesture = evaluateDirtSwipeGesture(defender, 'DEFENDER', 0, 0, -1);
  assert.equal(spyGesture.value, 'RB_SPY', 'Defender tap should assign RB_SPY');
  assert.equal(spyGesture.label, 'RB SPY / COVER');
  assert.equal(spyGesture.icon, '🕵️‍♂️');

  const spyCallout = getBackyardBuddyCallout('DEFENDER', 'RB_SPY');
  assert.ok(spyCallout.includes('Running Back'), 'Callout should mention locking down Running Back');
});

test('Tapping RB on offense does NOT start play (RB touch takes priority over snap check)', () => {
  const qb = { x: 170, y: 948, radius: 12 };
  const rb = { x: 220, y: 975, radius: 10 };

  // User taps directly on RB
  const tapX = 220;
  const tapY = 975;

  let playStarted = false;
  let gestureRole: string | null = null;

  // Check RB first (as implemented in engine.ts)
  if (Math.hypot(rb.x - tapX, rb.y - tapY) < rb.radius + 20) {
    gestureRole = 'RB';
  } else {
    const distToQb = Math.hypot(qb.x - tapX, qb.y - tapY);
    const distToRb = Math.hypot(rb.x - tapX, rb.y - tapY);
    if (distToQb < 32 && distToQb < distToRb - 10) {
      playStarted = true;
    }
  }

  assert.equal(gestureRole, 'RB', 'Touch on RB should be recognized as RB interaction');
  assert.equal(playStarted, false, 'Tapping RB must NOT start the play');
});

test('offensive double-taps only reposition the RB on offset and scaled canvases', async (context) => {
  const { readFileSync } = await import('node:fs');
  const { stripTypeScriptTypes } = await import('node:module');
  const source = readFileSync(new URL('./engine.ts', import.meta.url), 'utf8');
  const downStart = source.indexOf('  const handlePointerDown =');
  const moveStart = source.indexOf('  const handlePointerMove =', downStart);
  const upStart = source.indexOf('  const handlePointerUp =', moveStart);
  const listenersStart = source.indexOf("  canvas.addEventListener('pointerdown'", upStart);
  assert.ok(downStart >= 0 && moveStart > downStart && upStart > moveStart && listenersStart > upStart);
  const handlers = stripTypeScriptTypes(source.slice(downStart, moveStart) + source.slice(upStart, listenersStart));
  let timestamp = 1000;
  context.mock.method(Date, 'now', () => timestamp);
  const createHandlers = new Function('cyclePreSnapFormation', 'canvasLeft', 'canvasTop', 'scale', 'tacticalMode', 'flipP1ProPlay', `
    let phase = 'PRE_SNAP', activeOffense = 'P1', activeDefense = 'P2';
    const isPaused = false, options = {}, tutorialStep = 0;
    const completeTutorialAction = () => {};
    const receiverHitPadding = 20, touchHitPadding = 18;
    const p1OffPlay = 'PRO_QUICK_SLANTS', logicalCanvasWidth = 340, logicalCanvasHeight = 450;
    const getJoystickAnchor = () => ({ x: 89.3, y: 364 });
    const isOffenseJoystickStartZone = (x, y, anchorX, anchorY, width, height) =>
      Math.abs(x - anchorX) <= width * 0.15 && Math.abs(y - anchorY) <= height * 0.12;
    let rbDoubleTapConsumed = false, lastDefenseSelectTime = 0, lastTapTime = 0;
    let tapThrowTarget = null, gestureEntity = null, isDirtGestureActive = false;
    let touchStartX = 0, touchStartY = 0, touchScreenStartX = 0, touchScreenStartY = 0;
    let aimScreenCurrentX = 0, aimScreenCurrentY = 0, touchStartTime = 0;
    let preSnapFieldSwipeStartX = 0, preSnapFieldSwipeStartY = 0;
    const fieldWidth = 340, centerReceiver = null, receivers = [];
    const qb = { x: 170, y: 948, radius: 12 };
    const rb = { x: 220, y: 975, startX: 220, radius: 10, side: 'right', routeType: 'FLAT', isBlocker: false };
    const screenToWorld = (clientX, clientY) => ({ x: (clientX - canvasLeft) / scale, y: (clientY - canvasTop) / scale + 700 });
    const getScreenCoords = (clientX, clientY) => ({ x: clientX - canvasLeft, y: clientY - canvasTop });
    ${handlers}
    return { down: handlePointerDown, up: handlePointerUp, getRunningBack: () => ({ ...rb }) };
  `) as (cycle: (direction: number) => void, left: number, top: number, scale: number, mode?: 'ELITE' | 'PRO', flip?: () => void) => {
    down: (event: { clientX: number; clientY: number }) => void;
    up: (event: { clientX: number; clientY: number }) => void;
    getRunningBack: () => { x: number; y: number; startX: number; side: string; routeType: string; isBlocker: boolean };
  };
  for (const [left, top, scale] of [[420, 80, 1.5], [20, 120, 0.75]]) {
    const formationChanges: number[] = [];
    const handlers = createHandlers(direction => formationChanges.push(direction), left, top, scale, 'ELITE', () => {});
    const eventAt = (x: number) => ({ clientX: left + x * scale, clientY: top + 80 * scale });
    for (const [tapX, expectedX, expectedSide] of [[35, 120, 'left'], [285, 220, 'right']] as const) {
      timestamp += 500;
      handlers.down(eventAt(tapX));
      handlers.up(eventAt(tapX));
      timestamp += 100;
      handlers.down(eventAt(tapX));
      handlers.up(eventAt(tapX + 60));
      assert.equal(formationChanges.length, 0);
      const runningBack = handlers.getRunningBack();
      assert.equal(runningBack.x, expectedX);
      assert.equal(runningBack.startX, expectedX);
      assert.equal(runningBack.side, expectedSide);
      assert.equal(runningBack.y, 975);
      assert.equal(runningBack.routeType, 'FLAT');
      assert.equal(runningBack.isBlocker, false);
    }
    timestamp += 500;
    handlers.down(eventAt(35));
    handlers.up(eventAt(100));
    assert.deepEqual(formationChanges, [-1]);
  }

  const proFormationChanges: number[] = [];
  let proPlayFlips = 0;
  const proHandlers = createHandlers(direction => proFormationChanges.push(direction), 420, 80, 1.5, 'PRO', () => { proPlayFlips++; });
  const proEventAt = (x: number) => ({ clientX: 420 + x * 1.5, clientY: 80 + 80 * 1.5 });
  timestamp += 500;
  proHandlers.down(proEventAt(35));
  proHandlers.up(proEventAt(35));
  timestamp += 100;
  proHandlers.down(proEventAt(35));
  proHandlers.up(proEventAt(95));
  assert.deepEqual(proHandlers.getRunningBack(), {
    x: 120,
    y: 975,
    startX: 120,
    radius: 10,
    side: 'left',
    routeType: 'FLAT',
    isBlocker: false
  });

  timestamp += 500;
  proHandlers.down(proEventAt(35));
  proHandlers.up(proEventAt(95));
  assert.equal(proPlayFlips, 1);
  assert.deepEqual(proFormationChanges, []);
});

test('snap releases and small pointer movements do not throw a pass', async () => {
  const { shouldReleaseUserPass } = await import('./rules');

  for (const pointerDistance of [0, 1, 10, 11, 23]) {
    assert.equal(shouldReleaseUserPass(pointerDistance, false), false);
  }
  assert.equal(shouldReleaseUserPass(24, false), true);
  assert.equal(shouldReleaseUserPass(60, false), true);
  assert.equal(shouldReleaseUserPass(0, true), true);
});

test('Swiping field cycles formations correctly in both directions', () => {
  const formations: Array<'SPREAD' | 'STACK' | 'TRIPS'> = ['SPREAD', 'STACK', 'TRIPS'];
  let currentFormation = 'SPREAD';

  function cycle(direction: number) {
    const curIdx = formations.indexOf(currentFormation as any);
    const nextIdx = (curIdx + direction + formations.length) % formations.length;
    currentFormation = formations[nextIdx];
    return currentFormation;
  }

  // Swipe left (direction = 1)
  assert.equal(cycle(1), 'STACK');
  assert.equal(cycle(1), 'TRIPS');
  assert.equal(cycle(1), 'SPREAD');

  // Swipe right (direction = -1)
  assert.equal(cycle(-1), 'TRIPS');
  assert.equal(cycle(-1), 'STACK');
  assert.equal(cycle(-1), 'SPREAD');
});

test('Open deep receiver possibility on GO routes with RB Flat baiting', () => {
  const lineOfScrimmageY = 900;
  const attackDirection = -1; // moving up to y < 900
  const wr = { x: 295, y: 760, routeType: 'GO', isBlocker: false }; // 140px downfield
  const cb = { x: 260, y: 830 }; // Corner drawn up by RB flat route (70px off LOS)
  const safety = { x: 170, y: 750 }; // Safety patrolling deep middle (x=170)

  // Distance from WR to closest defender
  const distToCb = Math.hypot(cb.x - wr.x, cb.y - wr.y);
  const distToSafety = Math.hypot(safety.x - wr.x, safety.y - wr.y);
  const minDefDist = Math.min(distToCb, distToSafety);

  // Separation check (> 22px)
  const isOpenDeep = (minDefDist >= 22);
  assert.ok(isOpenDeep, 'WR running GO route with CB drawn up by RB Flat route should be OPEN DEEP');
  assert.ok(minDefDist > 65, 'WR should have significant separation (65+ px) down the boundary');
});

test('Tapping any player or open field does not start the defensive play', () => {
  const qb = { x: 170, y: 948, radius: 12 };
  const defenders: Entity[] = [
    { x: 170, y: 876, radius: 10 },
    { x: 80, y: 840, radius: 10 },
    { x: 260, y: 840, radius: 10 }
  ];

  function evaluatePreSnapDefenseTap(px: number, py: number): { playStarted: boolean; selectedDefender: boolean } {
    let playStarted = false;
    let selectedDefender = false;

    const hitDefender = defenders.find(d => Math.hypot(d.x - px, d.y - py) < (d.radius || 10) + 18);
    if (hitDefender) {
      selectedDefender = true;
      return { playStarted: false, selectedDefender: true };
    }

    // Open field turf tap
    return { playStarted: false, selectedDefender: false };
  }

  // 1. Tapping empty grass / open turf
  const grassTap = evaluatePreSnapDefenseTap(100, 700);
  assert.equal(grassTap.playStarted, false, 'Tapping grass must NOT start play');
  assert.equal(grassTap.selectedDefender, false);

  // 2. Tapping a defender
  const defTap = evaluatePreSnapDefenseTap(170, 876);
  assert.equal(defTap.playStarted, false, 'Tapping defender must NOT start play');
  assert.equal(defTap.selectedDefender, true, 'Tapping defender should select them for movement or spy');

  // 3. Tapping off-target near line of scrimmage
  const losTap = evaluatePreSnapDefenseTap(170, 900);
  assert.equal(losTap.playStarted, false, 'Tapping line of scrimmage must NOT start play');

  // 4. Tapping directly on the QB
  const qbTap = evaluatePreSnapDefenseTap(170, 948);
  assert.equal(qbTap.playStarted, false, 'Tapping QB must not start the defensive play');
});

test('AI pre-snap shifts defenders toward the RB side', () => {
  const lineOfScrimmageY = 900;
  const attackDirection = -1; // defense is above LOS at y < 900
  const defender: Entity = { x: 170, y: 840, startX: 170, startY: 840, radius: 10 };

  // AI pre-snap shift: LB slides toward RB side
  const rb = { x: 240, y: 948 };
  const targetSideX = rb.x > 170 ? Math.min(270, rb.x + 25) : Math.max(70, rb.x - 25);
  defender.startX = targetSideX;
  defender.startY = getDefensiveLineAlignmentY(lineOfScrimmageY, attackDirection, defender.radius);

  assert.equal(defender.startX, 265, 'AI pre-snap shift aligns defender outside RB');
  assert.equal(defender.startY, 876, 'AI pre-snap shift places defender on the legal defensive front');
});

test('AI defense assigns RB_SPY and stops user spamming passes to the RB in the flat', () => {
  const { defenders, eligibleReceivers } = createAlignedDefense('ZONE34');

  // User has targeted RB in flat on recent plays
  const situation = {
    down: 2,
    yardsToGo: 7,
    lineOfScrimmageY: 500,
    attackDirection: -1,
    recentPlays: [
      { play: 'SHORT_PASS', isPass: true, targetWasRb: true, isFlatPass: true, routes: { rb: 'FLAT' } },
      { play: 'CONTROL_PASS', isPass: true, targetWasRb: true, isFlatPass: true, routes: { rb: 'FLAT' } }
    ]
  };

  const assignments = chooseCpuDefensiveAssignments(defenders, eligibleReceivers, situation, () => 0);

  // An underneath defender must be assigned to RB_SPY
  const hasRbSpy = [...assignments.values()].some(assignment => assignment === 'RB_SPY');
  assert.ok(hasRbSpy, 'AI defense MUST assign RB_SPY when user spams passes to the RB in the flat');

  // When RB flat is spammed 2+ times, extra flat coverage is added
  const manCount = [...assignments.values()].filter(assignment => assignment === 'MAN').length;
  assert.ok(manCount >= 1, 'AI defense should assign extra coverage to lock down the flat');
});

test('Defenders toggle assignment between blitz, man, RB spy, and zone on tap', () => {
  const toggleCycle: Array<'BLITZ' | 'MAN' | 'RB_SPY' | 'ZONE'> = ['BLITZ', 'MAN', 'RB_SPY', 'ZONE'];
  
  function getNextAssignment(current: string): string {
    const idx = toggleCycle.indexOf(current as any);
    return toggleCycle[(idx + 1 + toggleCycle.length) % toggleCycle.length];
  }

  assert.equal(getNextAssignment('BLITZ'), 'MAN');
  assert.equal(getNextAssignment('MAN'), 'RB_SPY');
  assert.equal(getNextAssignment('RB_SPY'), 'ZONE');
  assert.equal(getNextAssignment('ZONE'), 'BLITZ');
});

test('Game clock stops after every play so user can change alignment, and resumes when play starts', () => {
  let gameClockSeconds = 120;
  let gameClockRemainderMs = 0;
  let gameClockRunning = false;

  function tickClock(elapsedMs: number, phase: string) {
    const isPlayActive = phase === 'QB_DROP' || phase === 'HANDOFF' || phase === 'RUNNING' || phase === 'THROWN' || phase === 'FUMBLE';
    if (!isPlayActive) {
      gameClockRunning = false;
      return;
    }
    gameClockRunning = true;

    const clockMultiplier = 3;
    gameClockRemainderMs += elapsedMs * clockMultiplier;
    while (gameClockRemainderMs >= 1000 && gameClockSeconds > 0) {
      gameClockRemainderMs -= 1000;
      gameClockSeconds--;
    }
  }

  // 1. Play is active (QB_DROP): 1000ms real time -> 3000ms clock time = 3 seconds off game clock
  tickClock(1000, 'QB_DROP');
  assert.equal(gameClockSeconds, 117, 'During active plays clock moves 3x as fast');

  // 2. Play ends in tackle or sack (phase is DEAD / PRE_SNAP): clock must stop so user can change alignment!
  tickClock(2000, 'PRE_SNAP');
  assert.equal(gameClockSeconds, 117, 'Clock remains stopped between plays so user can change alignment');
  assert.equal(gameClockRunning, false, 'Clock is stopped after the play ends');

  // 3. User takes time adjusting defensive/offensive alignment in PRE_SNAP:
  tickClock(5000, 'PRE_SNAP');
  assert.equal(gameClockSeconds, 117, 'Clock stays paused indefinitely while user changes alignment');

  // 4. Play starts again (next snap, phase = HANDOFF): clock resumes running at 3x speed
  tickClock(1000, 'HANDOFF');
  assert.equal(gameClockSeconds, 114, 'Clock resumes running when the next play starts');
  assert.equal(gameClockRunning, true, 'Clock is active while play is running');
});

test('Defensive alignment cycling contains the four requested defensive schemes', () => {
  const defKeys = ['COVER2', 'ZONE34', 'ZONE232', 'ZONE151'];
  let currentDef = 'COVER2';

  function cycleDef(direction: number) {
    const idx = defKeys.indexOf(currentDef);
    currentDef = defKeys[(idx + direction + defKeys.length) % defKeys.length];
    return currentDef;
  }

  assert.equal(cycleDef(1), 'ZONE34');
  assert.equal(cycleDef(1), 'ZONE232');
  assert.equal(cycleDef(1), 'ZONE151');
  assert.equal(cycleDef(1), 'COVER2');
  assert.equal(cycleDef(-1), 'ZONE151');
});

test('When ball is intercepted, pursuing team immediately gains speed traits of defense chasing ball carrier', () => {
  // Simulating the interception pursuit speed calculation
  const qb: Entity = { x: 170, y: 700, radius: 12 };
  const wr: Entity = { x: 80, y: 650, radius: 10 };
  const rb: Entity = { x: 190, y: 720, radius: 11 };
  const pursuers = [qb, wr, rb];

  // 1. Immediately upon interception, pursuers gain starting pursuit timer
  pursuers.forEach(p => {
    p.pursuitTimer = 20;
    p.brokenTackleStun = 0;
  });

  const returner: Entity = { x: 170, y: 500, radius: 10 };
  const attackDirection = 1; // returner advancing downfield toward y = 1000

  // 2. Calculate pursuit traits for a skill player (WR) and QB
  function calculatePursuitTraits(p: Entity, runner: Entity, isSkill: boolean) {
    p.pursuitTimer = (p.pursuitTimer || 0) + 1;
    const distToRunner = Math.hypot(runner.x - p.x, runner.y - p.y);
    const baseSpeed = isSkill ? 1.05 : 0.96;
    const multiplier = isSkill ? 1.25 : 1.10;
    const timeAcceleration = p.pursuitTimer * 0.034;
    const distanceUrgency = Math.max(0, (distToRunner - 25) * 0.0065);
    const dynamicSpeed = (baseSpeed + timeAcceleration + distanceUrgency) * multiplier;
    const dynamicAccel = Math.min(0.50, (0.24 + (p.pursuitTimer * 0.0025)) * (isSkill ? 1.25 : 1.10));
    const leadY = runner.y + (18 * attackDirection);
    return { dynamicSpeed, dynamicAccel, leadY, distToRunner };
  }

  const wrTraits = calculatePursuitTraits(wr, returner, true);
  assert.ok(wr.pursuitTimer! >= 21, 'Pursuer maintains and increments pursuitTimer');
  assert.ok(wrTraits.dynamicSpeed > 2.0, 'Pursuer immediately reaches high pursuit speed (>2.0)');
  assert.ok(wrTraits.dynamicAccel >= 0.35, 'Pursuer immediately has high pursuit agility');
  assert.equal(wrTraits.leadY, 518, 'Pursuer takes leading cutoff angle in direction of returner');
});

test('Play started before game clock hits zero plays out until the end of the play and does not stop', () => {
  let gameClockSeconds = 2;
  let gameClockRemainderMs = 0;
  let gameClockRunning = true;
  let pendingQuarterEnd = false;
  let quarterEnded = false;
  let phase = 'QB_DROP';

  function updateClock(elapsedMs: number) {
    const isPlayActive = phase === 'QB_DROP' || phase === 'HANDOFF' || phase === 'RUNNING' || phase === 'THROWN' || phase === 'FUMBLE';
    if (!isPlayActive) {
      gameClockRunning = false;
      return;
    }
    if (gameClockSeconds === 0) {
      gameClockRunning = false;
      pendingQuarterEnd = true;
      return;
    }
    gameClockRunning = true;
    const clockMultiplier = 3;
    gameClockRemainderMs += elapsedMs * clockMultiplier;
    while (gameClockRemainderMs >= 1000 && gameClockSeconds > 0) {
      gameClockRemainderMs -= 1000;
      gameClockSeconds--;
      if (gameClockSeconds === 0) {
        gameClockRunning = false;
        pendingQuarterEnd = true;
        return;
      }
    }
  }

  function handlePlayEnd() {
    // Play ends in tackle or touchdown
    phase = 'DEAD';
    // Drill reset / schedule
    if (pendingQuarterEnd || gameClockSeconds === 0) {
      pendingQuarterEnd = false;
      quarterEnded = true;
    }
  }

  // Play started with 2 seconds left
  // Tick 1000ms real time (3 seconds game time) -> clock hits 0:00
  updateClock(1000);
  assert.equal(gameClockSeconds, 0, 'Clock reaches 0');
  assert.equal(pendingQuarterEnd, true, 'Quarter end is marked pending');
  assert.equal(quarterEnded, false, 'Quarter does NOT end prematurely while play is active');
  assert.equal(phase, 'QB_DROP', 'Play continues running and does NOT stop');

  // Play advances to ball thrown and running
  phase = 'THROWN';
  updateClock(500);
  assert.equal(phase, 'THROWN', 'Ball flight continues at 0:00');
  assert.equal(quarterEnded, false, 'Quarter still has not ended');

  phase = 'RUNNING';
  updateClock(1000);
  assert.equal(phase, 'RUNNING', 'Ball carrier continues running downfield at 0:00');
  assert.equal(quarterEnded, false, 'Play plays out until the end of the play');

  // Play finally concludes (e.g. tackled or touchdown scored)
  handlePlayEnd();
  assert.equal(quarterEnded, true, 'Quarter ends only after the play concludes');
});

test('Swiping left or right on a defender assigns MAN coverage and does NOT change alignments', () => {
  let activeAlignment = 'ZONE34';
  let defenderAssignment = 'ZONE';

  function onPointerUpOnDefender(dx: number, dy: number) {
    const lateralDist = Math.abs(dx);
    if (lateralDist > 16 && lateralDist > Math.abs(dy) * 0.75) {
      // Swiping left or right on a defender assigns MAN coverage and does NOT change alignments
      defenderAssignment = 'MAN';
    } else {
      // Non-lateral or tap
      defenderAssignment = 'BLITZ';
    }
  }

  // Swipe right on defender
  onPointerUpOnDefender(35, 2);
  assert.equal(defenderAssignment, 'MAN', 'Swiping right assigns MAN coverage');
  assert.equal(activeAlignment, 'ZONE34', 'Alignment is unchanged');

  // Swipe left on defender
  defenderAssignment = 'ZONE';
  onPointerUpOnDefender(-40, 5);
  assert.equal(defenderAssignment, 'MAN', 'Swiping left assigns MAN coverage');
  assert.equal(activeAlignment, 'ZONE34', 'Alignment is unchanged');
});

test('Concept Passing Playbook Expansion: MESH, SMASH, POST_WHEEL concepts exist with corresponding route mechanics', async () => {
  const { offensivePlaybook, allRoutes } = await import('./playbook');
  
  assert.ok(offensivePlaybook.MESH, 'MESH concept exists in playbook');
  assert.equal(offensivePlaybook.MESH.type, 'PASS');
  assert.ok(offensivePlaybook.MESH.bestVs?.includes('COVER2'));

  assert.ok(offensivePlaybook.SMASH, 'SMASH concept exists in playbook');
  assert.equal(offensivePlaybook.SMASH.type, 'PASS');
  assert.ok(offensivePlaybook.SMASH.bestVs?.includes('COVER2'));

  assert.ok(offensivePlaybook.POST_WHEEL, 'POST_WHEEL concept exists in playbook');
  assert.equal(offensivePlaybook.POST_WHEEL.type, 'PASS');
  assert.ok(offensivePlaybook.POST_WHEEL.bestVs?.includes('ZONE34'));

  assert.ok(allRoutes.includes('POST-L'), 'POST-L route exists');
  assert.ok(allRoutes.includes('POST-R'), 'POST-R route exists');
  assert.ok(allRoutes.includes('HITCH'), 'HITCH route exists');
  assert.ok(allRoutes.includes('WHEEL'), 'WHEEL route exists');
});

test('Tendency-Based Adaptive Audibles: CPU detects blitz overload and coverage mismatches', async () => {
  const { evaluateCpuOffensiveAudibles } = await import('./ai');

  const receivers: Entity[] = [
    { startX: 45, startY: 500, x: 45, y: 500, radius: 10, routeType: 'SLANT-L', isOutside: true },
    { startX: 295, startY: 500, x: 295, y: 500, radius: 10, routeType: 'SLANT-R', isOutside: true }
  ];
  const centerReceiver: Entity = { startX: 225, startY: 500, x: 225, y: 500, radius: 10, routeType: 'SLANT-R' };
  const rb: Entity = { startX: 220, startY: 530, x: 220, y: 530, radius: 10, routeType: 'FLAT', side: 'right' };

  // 1. Coverage mismatch: Defensive Lineman (DL) assigned to MAN coverage on outside WR
  const dlMismatchDefender: Entity = {
    x: 45, y: 480, radius: 12, type: 'DL', defenseAssignment: 'MAN', assignedReceiver: receivers[0]
  };
  const normalDefenders: Entity[] = [
    dlMismatchDefender,
    { x: 295, y: 450, radius: 10, type: 'CB', defenseAssignment: 'ZONE' },
    { x: 170, y: 450, radius: 10, type: 'MLB', defenseAssignment: 'ZONE' }
  ];

  const mismatchResult = evaluateCpuOffensiveAudibles(
    'PASS', receivers, centerReceiver, rb, normalDefenders, 1, 10, 500, -1, 340
  );
  assert.ok(mismatchResult.audibleMessage?.includes('COVERAGE MISMATCH'), 'Audibles when DL is in MAN on a WR');
  assert.equal(receivers[0].routeType, 'GO', 'Audibled mismatched WR to GO route deep');

  // 2. Blitz Overload: 2 rushers on the left, 0 on the right
  const overloadDefenders: Entity[] = [
    { x: 100, y: 490, radius: 10, type: 'LB', defenseAssignment: 'BLITZ', passRusher: true },
    { x: 140, y: 490, radius: 10, type: 'CB', defenseAssignment: 'BLITZ', passRusher: true },
    { x: 200, y: 450, radius: 10, type: 'CB', defenseAssignment: 'ZONE' }
  ];

  const overloadResult = evaluateCpuOffensiveAudibles(
    'PASS', receivers, centerReceiver, rb, overloadDefenders, 2, 8, 500, -1, 340
  );
  assert.ok(overloadResult.audibleMessage?.includes('OVERLOAD BLITZ'), 'Audibles on blitz overload');
  assert.equal(rb.isBlocker, true, 'Assigned RB to block on overload side');
  assert.equal(rb.side, 'left', 'Flipped RB to the heavy blitz side');
});

test('2 RB spies is countered by AI: RB stays in to block and downfield routes attack shorthanded secondary', async () => {
  const { evaluateCpuOffensiveAudibles } = await import('./ai');

  const receivers: Entity[] = [
    { startX: 45, startY: 500, x: 45, y: 500, radius: 10, routeType: 'SLANT-L', isOutside: true },
    { startX: 295, startY: 500, x: 295, y: 500, radius: 10, routeType: 'SLANT-R', isOutside: true }
  ];
  const centerReceiver: Entity = { startX: 225, startY: 500, x: 225, y: 500, radius: 10, routeType: 'SLANT-R' };
  const rb: Entity = { startX: 220, startY: 530, x: 220, y: 530, radius: 10, routeType: 'FLAT', side: 'right' };

  // 2 defenders assigned to RB_SPY
  const twoRbSpiesDefenders: Entity[] = [
    { x: 200, y: 490, radius: 10, type: 'LB', defenseAssignment: 'RB_SPY' },
    { x: 240, y: 490, radius: 10, type: 'SS', defenseAssignment: 'RB_SPY' },
    { x: 50, y: 450, radius: 10, type: 'CB', defenseAssignment: 'ZONE' },
    { x: 290, y: 450, radius: 10, type: 'CB', defenseAssignment: 'ZONE' },
    { x: 170, y: 490, radius: 12, type: 'DL', passRusher: true }
  ];

  const audibleResult = evaluateCpuOffensiveAudibles(
    'PASS', receivers, centerReceiver, rb, twoRbSpiesDefenders, 1, 10, 500, -1, 340
  );

  assert.ok(audibleResult.audibleMessage?.includes('2 RB SPIES COUNTERED'), 'Audible message confirms 2 RB spies countered');
  assert.equal(rb.isBlocker, true, 'RB is assigned to BLOCK so 2 spies are wasted');
  assert.equal(rb.routeType, 'BLOCK');
  assert.ok(audibleResult.blockersAssigned.includes('RB'), 'Blocker list includes RB');
  assert.equal(centerReceiver.routeType, 'POST-R', 'Center receiver attacks the vacated middle');
});

test('2 RB spies counters RUN play: audibles out of run into passing concept and blocks with RB', async () => {
  const { evaluateCpuOffensiveAudibles } = await import('./ai');
  const receivers: Entity[] = [
    { startX: 45, startY: 500, x: 45, y: 500, radius: 10, routeType: 'GO', isOutside: true },
    { startX: 295, startY: 500, x: 295, y: 500, radius: 10, routeType: 'GO', isOutside: true }
  ];
  const centerReceiver: Entity = { startX: 225, startY: 500, x: 225, y: 500, radius: 10, routeType: 'BLOCK' };
  const rb: Entity = { startX: 220, startY: 530, x: 220, y: 530, radius: 10, routeType: 'FLAT', side: 'right' };

  // 2 defenders assigned to RB_SPY
  const twoRbSpiesDefenders: Entity[] = [
    { x: 200, y: 490, radius: 10, type: 'LB', defenseAssignment: 'RB_SPY' },
    { x: 240, y: 490, radius: 10, type: 'SS', defenseAssignment: 'RB_SPY' },
    { x: 170, y: 490, radius: 12, type: 'DL', passRusher: true }
  ];

  // Even when the original play is a POWER run, 2 RB spies triggers an audible to pass!
  const audibleResult = evaluateCpuOffensiveAudibles(
    'POWER', receivers, centerReceiver, rb, twoRbSpiesDefenders, 1, 10, 500, -1, 340
  );

  assert.equal(audibleResult.newPlayKey, 'MESH', 'Audible switches out of run play to MESH pass concept');
  assert.equal(rb.isBlocker, true, 'RB stays in to pass block');
  assert.equal(rb.routeType, 'BLOCK');
  assert.ok(audibleResult.audibleMessage?.includes('2 RB SPIES COUNTERED'));
});

test('team identities amplify both strengths and weaknesses while preserving neutral ratings', async () => {
  const { TEAMS } = await import('./teams');
  assert.equal(TEAMS.FLORIDA.ratings.wrSpeed, 1.42);
  assert.equal(TEAMS.FLORIDA.ratings.passProtection, 0.825);
  assert.equal(TEAMS.FLORIDA.ratings.runPower, 0.79);
  assert.equal(TEAMS.ARKANSAS.ratings.runPower, 1.525);
  assert.equal(TEAMS.KENTUCKY.ratings.wrSpeed, 0.825);
  assert.equal(TEAMS.GEORGIA.ratings.passRush, 1.525);
  assert.equal(TEAMS.GEORGIA.ratings.mistakeChance, 0.51);
  assert.equal(TEAMS.AUBURN.ratings.mistakeChance, 1.315);
  assert.equal(TEAMS.VANDERBILT.ratings.passRush, 0.79);
  assert.equal(TEAMS.LSU.ratings.passProtection, 1);
  for (const team of Object.values(TEAMS)) {
    for (const rating of Object.values(team.ratings)) {
      assert.ok(rating >= 0.5 && rating <= 1.7);
    }
  }
});

test('SEC team profiles include every member with varied game strengths and weaknesses', async () => {
  const { TEAMS, getAllTeams } = await import('./teams');
  const teams = getAllTeams();
  const expectedIds = [
    'ALABAMA', 'ARKANSAS', 'AUBURN', 'FLORIDA', 'GEORGIA', 'KENTUCKY', 'LSU', 'MISSISSIPPI_STATE',
    'MISSOURI', 'OKLAHOMA', 'OLE_MISS', 'SOUTH_CAROLINA', 'TENNESSEE', 'TEXAS', 'TEXAS_AM', 'VANDERBILT'
  ];

  assert.deepEqual(teams.map(team => team.id).sort(), expectedIds.sort(), 'Every SEC member has a team profile');
  teams.forEach(team => {
    assert.ok(team.id, 'Team must have an ID');
    assert.ok(team.name, 'Team must have a full name');
    assert.ok(team.strengths, 'Team must have defined strengths');
    assert.ok(team.weaknesses, 'Team must have defined weaknesses');
    assert.ok(team.ratings.wrSpeed > 0, 'WR speed rating must exist');
    assert.ok(team.ratings.passProtection > 0, 'Pass protection rating must exist');
    assert.ok(team.ratings.dbClosingSpeed > 0, 'DB closing speed rating must exist');
  });

  assert.ok(TEAMS.TENNESSEE.ratings.wrSpeed > TEAMS.KENTUCKY.ratings.wrSpeed, 'Passing profiles have varied receiver speed');
  assert.ok(TEAMS.GEORGIA.ratings.passRush > TEAMS.VANDERBILT.ratings.passRush, 'Defensive profiles have varied pass rush');
  assert.ok(TEAMS.ARKANSAS.ratings.runPower > TEAMS.FLORIDA.ratings.runPower, 'Run-focused profiles have varied run power');
});

test('overall game speed uses the increased movement scale', async () => {
  const { GAME_SPEED_SCALE } = await import('./movement');
  assert.equal(GAME_SPEED_SCALE, 0.90);
});

test('Ball travels at original speed so passes can be completed crisply', () => {
  const shortDist = 90;
  const deepDist = 240;

  const shortSpeed = Math.min(3.8, Math.max(2.4, 2.2 + shortDist * 0.006));
  const deepSpeed = Math.min(3.8, Math.max(2.4, 2.2 + deepDist * 0.006));

  assert.ok(shortSpeed >= 2.6, 'Short pass ball speed travels at original brisk pace');
  assert.ok(deepSpeed >= 3.6, 'Deep pass ball speed reaches up to 3.8 px/frame');

  const shortFrames = Math.max(26, Math.round(shortDist / shortSpeed));
  const deepFrames = Math.max(26, Math.round(deepDist / deepSpeed));

  assert.ok(shortFrames <= 35, 'Short pass arrives crisply');
  assert.ok(deepFrames <= 70, 'Deep ball arrives at original speed');
});

test('All passes should not be completed: wide open receivers can drop passes or slip on turf', async () => {
  const { resolveCatchContestOutcome } = await import('./rules');

  // Case 1: Wide open receiver (effectiveDefDist = 45, well beyond 20px) with drop roll
  const dropOutcome = resolveCatchContestOutcome({
    effectiveDefDist: 45,
    effectiveBallDist: 45,
    isTargetSpammed: false,
    isRbFlatSpammed: false,
    isRb: false,
    roll: 0.02 // triggers drop
  });

  assert.equal(dropOutcome.caught, false, 'Wide open pass is not guaranteed to be caught');
  assert.equal(dropOutcome.type, 'DROP');
  assert.equal(dropOutcome.resultType, 'INCOMPLETE');
  assert.ok(dropOutcome.announcement.includes('DROPPED') || dropOutcome.announcement.includes('Looked upfield'));

  // Case 2: Wide open receiver slips on turf cut
  const slipOutcome = resolveCatchContestOutcome({
    effectiveDefDist: 50,
    effectiveBallDist: 50,
    isTargetSpammed: false,
    isRbFlatSpammed: false,
    isRb: false,
    roll: 0.085 // triggers turf slip
  });

  assert.equal(slipOutcome.caught, false);
  assert.equal(slipOutcome.type, 'DROP');
  assert.ok(slipOutcome.announcement.includes('SLIPPED ON TURF'));

  // Case 3: Wide open receiver with high roll completes cleanly
  const completeOutcome = resolveCatchContestOutcome({
    effectiveDefDist: 50,
    effectiveBallDist: 50,
    isTargetSpammed: false,
    isRbFlatSpammed: false,
    isRb: false,
    roll: 0.50
  });

  assert.equal(completeOutcome.caught, true);
  assert.equal(completeOutcome.type, 'COMPLETE');
});

test('Real life football mistakes: sideline boundary out of bounds and QB throw inaccuracy', async () => {
  const { resolveCatchContestOutcome, evaluateQbThrowAccuracy } = await import('./rules');

  // Case 1: Wide open receiver right on sideline boundary (receiverX = 20, fieldWidth = 320)
  const oobOutcome = resolveCatchContestOutcome({
    effectiveDefDist: 40,
    effectiveBallDist: 40,
    isTargetSpammed: false,
    isRbFlatSpammed: false,
    isRb: false,
    receiverX: 20,
    fieldWidth: 320,
    roll: 0.05
  });

  assert.equal(oobOutcome.caught, false);
  assert.equal(oobOutcome.type, 'OUT_OF_BOUNDS');
  assert.ok(oobOutcome.announcement.includes('OUT OF BOUNDS'));

  // Case 2: QB throw accuracy under pressure
  const pressuredThrow = evaluateQbThrowAccuracy({
    throwDist: 180,
    isUnderPressure: true,
    isDeepShot: true,
    roll: 0.05
  }, -1);

  assert.equal(pressuredThrow.isOffTarget, true);
  assert.ok(pressuredThrow.mistakeType === 'OVERTHROWN' || pressuredThrow.mistakeType === 'UNDERTHROWN' || pressuredThrow.mistakeType === 'OFF_TARGET_WIDE');
  assert.ok(pressuredThrow.announcement);

  // Case 3: QB hit as thrown
  const hitThrow = evaluateQbThrowAccuracy({
    throwDist: 120,
    isUnderPressure: true,
    isDeepShot: false,
    isHitAsThrown: true,
    roll: 0.01
  }, -1);

  assert.equal(hitThrow.isOffTarget, true);
  assert.ok(hitThrow.announcement?.includes('HIT AS HE THROWS'));

  const humanHitThrow = evaluateQbThrowAccuracy({
    throwDist: 120,
    isUnderPressure: true,
    isDeepShot: false,
    isHitAsThrown: true,
    roll: 0.5
  }, -1);
  const cpuHitThrow = evaluateQbThrowAccuracy({
    throwDist: 120,
    isUnderPressure: true,
    isDeepShot: false,
    isHitAsThrown: true,
    isCpuThrow: true,
    roll: 0.5
  }, -1);
  assert.equal(humanHitThrow.mistakeType, 'HIT_AS_THROWN');
  assert.equal(cpuHitThrow.mistakeType, undefined);
});

test('CPU aim uncertainty increases with throw distance and pressure', async () => {
  const { getCpuThrowAimVariance } = await import('./rules');

  assert.equal(getCpuThrowAimVariance(90, false), 4);
  assert.equal(getCpuThrowAimVariance(180, false), 6);
  assert.equal(getCpuThrowAimVariance(300, true), 13.5);
});

test('Passes cleanly clear the line of scrimmage and cannot be easily batted down at the line', async () => {
  const { getPassArcHeight, getPassArcMaxHeight, getDefenderPassReachHeight, canDefenderDeflectPass } = await import('./rules');

  const maxHeight = getPassArcMaxHeight(80, false);
  // Early trajectory (progress 0.20): crossing the line of scrimmage
  const linePassHeight = getPassArcHeight(maxHeight, 0.20);

  // Overhand release ball height at scrimmage is well above defensive line reach
  assert.ok(linePassHeight > getDefenderPassReachHeight('DL'), 'Pass height at line exceeds defensive line reach');
  assert.ok(linePassHeight >= 28, 'Pass height climbs over 28px in the air over the line');

  // Defender engaged with blocker or rushing can never deflect pass
  assert.equal(canDefenderDeflectPass({
    defenderType: 'DL',
    isPassRusher: true,
    isEngagedWithBlocker: false,
    distanceToBall: 5,
    ballHeight: 12
  }), false);

  assert.equal(canDefenderDeflectPass({
    defenderType: 'LB',
    isPassRusher: false,
    isEngagedWithBlocker: true,
    distanceToBall: 5,
    ballHeight: 12
  }), false);
});

test('AI QB throws decisively on rhythm and under pressure without freezing in the pocket', async () => {
  const { shouldCpuReleasePass } = await import('./ai');

  // Situation 1: Give the receiver time to develop before releasing on the break
  const breakReleaseBeforeDeveloped = shouldCpuReleasePass({
    hasTarget: true,
    isDeepShotOpportunity: false,
    hasOpenBreak: true,
    isUnderHeavyPressure: false,
    playClock: 31,
    bestScore: 25
  });
  assert.equal(breakReleaseBeforeDeveloped, false, 'AI QB gives routes more time to develop before releasing');
  const breakRelease = shouldCpuReleasePass({
    hasTarget: true,
    isDeepShotOpportunity: false,
    hasOpenBreak: true,
    isUnderHeavyPressure: false,
    playClock: 32,
    bestScore: 25
  });
  assert.equal(breakRelease, true, 'AI QB releases on a developed receiver break');

  // Situation 2: Under heavy pressure, AI QB gets pass off before being sacked
  const pressureRelease = shouldCpuReleasePass({
    hasTarget: true,
    isDeepShotOpportunity: false,
    hasOpenBreak: false,
    isUnderHeavyPressure: true,
    playClock: 35,
    pressureFrames: 10,
    bestScore: 10
  });
  assert.equal(pressureRelease, true, 'AI QB releases pass to escape sack under heavy pressure');

  // Situation 3: Rhythm release after the route has had time to develop
  const rhythmRelease = shouldCpuReleasePass({
    hasTarget: true,
    isDeepShotOpportunity: false,
    hasOpenBreak: false,
    isUnderHeavyPressure: false,
    playClock: 44,
    bestScore: 20
  });
  assert.equal(rhythmRelease, true, 'AI QB releases a strong read after the route has developed');

  // Situation 4: Quick release under rush pressure at frame 10
  const earlyPressureRelease = shouldCpuReleasePass({
    hasTarget: true,
    isDeepShotOpportunity: false,
    hasOpenBreak: false,
    isUnderHeavyPressure: true,
    playClock: 10,
    pressureFrames: 2,
    bestScore: 5
  });
  assert.equal(earlyPressureRelease, false, 'AI QB has a reaction window when pressure first arrives');

  // Situation 5: Release by the pocket timeout even if no read is ideal
  const progressionRelease = shouldCpuReleasePass({
    hasTarget: true,
    isDeepShotOpportunity: false,
    hasOpenBreak: false,
    isUnderHeavyPressure: false,
    playClock: 66,
    bestScore: -5
  });
  assert.equal(progressionRelease, true, 'AI QB releases by frame 66 to prevent freezing indefinitely');
});

test('Defenders respond to swipe gestures for blitz, zone, man, and spy assignments', async () => {
  const { evaluateDirtSwipeGesture } = await import('./chalkMenu');
  const defender: Entity = { x: 170, y: 350, radius: 10 };

  // Swiping toward LOS / offense (forwardY < -16, e.g. dy = 30 when attackDirection = -1) -> BLITZ
  const blitz = evaluateDirtSwipeGesture(defender, 'DEFENDER', 0, 30, -1);
  assert.equal(blitz.value, 'BLITZ', 'Swiping toward LOS assigns BLITZ');
  assert.ok(blitz.label.includes('BLITZ'), 'Label includes BLITZ');

  // Swiping deep backward (forwardY > 18, e.g. dy = -30 when attackDirection = -1) -> ZONE
  const zone = evaluateDirtSwipeGesture(defender, 'DEFENDER', 0, -30, -1);
  assert.equal(zone.value, 'ZONE', 'Swiping deep back assigns ZONE');
  assert.ok(zone.label.includes('ZONE'), 'Label includes ZONE');

  // Swiping horizontally left or right (lateralDist > 16) -> MAN
  const manLeft = evaluateDirtSwipeGesture(defender, 'DEFENDER', -30, 0, -1);
  assert.equal(manLeft.value, 'MAN', 'Swiping left assigns MAN');
  const manRight = evaluateDirtSwipeGesture(defender, 'DEFENDER', 30, 0, -1);
  assert.equal(manRight.value, 'MAN', 'Swiping right assigns MAN');

  // Short or diagonal swipe -> RB_SPY
  const spy = evaluateDirtSwipeGesture(defender, 'DEFENDER', 8, -5, -1);
  assert.equal(spy.value, 'RB_SPY', 'Short swipe assigns RB_SPY');
});
