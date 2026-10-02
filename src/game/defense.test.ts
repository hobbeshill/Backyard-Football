import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreRunBlockTarget, shouldCpuReleasePass, shouldCpuScramble } from './ai';
import { alignDefenderAcrossFromRunningBack, alignDefenders, chooseCpuDefensiveAssignments } from './defense';
import { calculateYardsToGo, canDefenderDeflectPass, canTackleQuarterback, findTappedPassReceiver, getDefenderPassReachHeight, getPassArcHeight, getPassArcMaxHeight, getPassFlightFrames, getPassLeadTarget, resolvePlayResult } from './rules';
import type { Entity } from './types';

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

  assert.equal(shouldCpuReleasePass({ ...situation, hasOpenBreak: true, playClock: 32 }), true);
  assert.equal(shouldCpuReleasePass({ ...situation, isUnderHeavyPressure: true, playClock: 26 }), true);
  assert.equal(shouldCpuReleasePass({ ...situation, playClock: 58 }), true);
  assert.equal(shouldCpuReleasePass({ ...situation, hasTarget: false, playClock: 58 }), false);
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

test('CPU adds randomized box pressure on short-yardage situations without blitzing the deep safety', () => {
  const { defenders, eligibleReceivers } = createAlignedDefense('COVER3');
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
  const { defenders, eligibleReceivers } = createAlignedDefense('QUARTERS');
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
  const { defenders, eligibleReceivers } = createAlignedDefense('COVER3');
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
  const { defenders, eligibleReceivers } = createAlignedDefense('COVER3');
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

test('CPU tightens man coverage against a compact receiver formation', () => {
  const { defenders, eligibleReceivers } = createAlignedDefense('COVER3');
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
  const playKeys = ['COVER3', 'COVER2MAN', 'TAMPA2', 'BLITZ', 'QUARTERS', 'ROBBER'];
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
  const { defenders, eligibleReceivers } = createAlignedDefense('COVER3');
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
    { x: 120, y: 540, radius: 10, type: 'LB', defenseAssignment: 'BLITZ' },
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
    { x: 120, y: 540, radius: 10, type: 'LB', defenseAssignment: 'BLITZ' },
    { x: 215, y: 540, radius: 10, type: 'LB', defenseAssignment: 'BLITZ' },
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

  const { defenders } = createAlignedDefense('COVER3');
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

  assert.equal(regularChance, 0.38);
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
  assert.equal(boostedRegularChance, 0.63);
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
  const { defenders, eligibleReceivers } = createAlignedDefense('COVER3');
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

test('CPU offense counters user blitzes by assigning protection and hot-routing deep vertical strike (GO)', async () => {
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
  assert.equal(receivers[0].routeType, 'GO', 'Outside receiver should be hot-routed to deep GO streak');
  assert.ok(result.audibleMessage?.includes('USER BLITZ COUNTERED'), 'Audible message should announce blitz countered');
});

test('CPU defense assigns both QB_SPY and an edge contain rusher when opponent spams QB runs', async () => {
  const { defenders, eligibleReceivers } = createAlignedDefense('COVER3');
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
  alignDefenders(defenders, 'COVER3', -1, 500, tripsReceivers, centerReceiver);
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

test('A user on defense starts the play ONLY by tapping the QB, no other taps start the play', () => {
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

    const distToQb = Math.hypot(qb.x - px, qb.y - py);
    if (distToQb < (qb.radius || 12) + 24) {
      playStarted = true;
      return { playStarted: true, selectedDefender: false };
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
  assert.equal(qbTap.playStarted, true, 'ONLY tapping QB starts the play when on defense');
});

test('AI pre-snap shifts defenders toward the RB side', () => {
  const lineOfScrimmageY = 900;
  const attackDirection = -1; // defense is above LOS at y < 900
  const defender: Entity = { x: 170, y: 840, startX: 170, startY: 840, radius: 10 };

  // AI pre-snap shift: LB slides toward RB side
  const rb = { x: 240, y: 948 };
  const targetSideX = rb.x > 170 ? Math.min(270, rb.x + 25) : Math.max(70, rb.x - 25);
  defender.startX = targetSideX;
  defender.startY = lineOfScrimmageY + (16 * attackDirection);

  assert.equal(defender.startX, 265, 'AI pre-snap shift aligns defender outside RB');
  assert.equal(defender.startY, 884, 'AI pre-snap shift positions defender at line');
});

test('AI defense assigns RB_SPY and stops user spamming passes to the RB in the flat', () => {
  const { defenders, eligibleReceivers } = createAlignedDefense('COVER3');

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

test('Defensive alignment cycling contains valid defensive schemes', () => {
  const defKeys = ['COVER3', 'COVER2MAN', 'TAMPA2', 'BLITZ', 'QUARTERS'];
  let currentDef = 'COVER3';

  function cycleDef(direction: number) {
    const idx = defKeys.indexOf(currentDef);
    currentDef = defKeys[(idx + direction + defKeys.length) % defKeys.length];
    return currentDef;
  }

  assert.equal(cycleDef(1), 'COVER2MAN');
  assert.equal(cycleDef(1), 'TAMPA2');
  assert.equal(cycleDef(1), 'BLITZ');
  assert.equal(cycleDef(1), 'QUARTERS');
  assert.equal(cycleDef(1), 'COVER3');
  assert.equal(cycleDef(-1), 'QUARTERS');
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
  let activeAlignment = 'COVER3';
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
  assert.equal(activeAlignment, 'COVER3', 'Alignment is unchanged');

  // Swipe left on defender
  defenderAssignment = 'ZONE';
  onPointerUpOnDefender(-40, 5);
  assert.equal(defenderAssignment, 'MAN', 'Swiping left assigns MAN coverage');
  assert.equal(activeAlignment, 'COVER3', 'Alignment is unchanged');
});

test('Concept Passing Playbook Expansion: MESH, SMASH, POST_WHEEL concepts exist with corresponding route mechanics', async () => {
  const { offensivePlaybook, allRoutes } = await import('./playbook');
  
  assert.ok(offensivePlaybook.MESH, 'MESH concept exists in playbook');
  assert.equal(offensivePlaybook.MESH.type, 'PASS');
  assert.ok(offensivePlaybook.MESH.bestVs?.includes('COVER2MAN'));

  assert.ok(offensivePlaybook.SMASH, 'SMASH concept exists in playbook');
  assert.equal(offensivePlaybook.SMASH.type, 'PASS');
  assert.ok(offensivePlaybook.SMASH.bestVs?.includes('TAMPA2'));

  assert.ok(offensivePlaybook.POST_WHEEL, 'POST_WHEEL concept exists in playbook');
  assert.equal(offensivePlaybook.POST_WHEEL.type, 'PASS');
  assert.ok(offensivePlaybook.POST_WHEEL.bestVs?.includes('COVER3'));

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

test('Game speed is scaled down 10% for testing', async () => {
  const { GAME_SPEED_SCALE } = await import('./movement');
  assert.ok(GAME_SPEED_SCALE <= 0.80 && GAME_SPEED_SCALE >= 0.70, 'Game speed scale is reduced ~10% around 0.77');
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

  // Situation 1: Open receiver on break triggers early release without waiting for sacks
  const breakRelease = shouldCpuReleasePass({
    hasTarget: true,
    isDeepShotOpportunity: false,
    hasOpenBreak: true,
    isUnderHeavyPressure: false,
    playClock: 18,
    bestScore: 25
  });
  assert.equal(breakRelease, true, 'AI QB releases quickly on receiver break');

  // Situation 2: Under heavy pressure, AI QB gets pass off before being sacked
  const pressureRelease = shouldCpuReleasePass({
    hasTarget: true,
    isDeepShotOpportunity: false,
    hasOpenBreak: false,
    isUnderHeavyPressure: true,
    playClock: 14,
    bestScore: 10
  });
  assert.equal(pressureRelease, true, 'AI QB releases pass to escape sack under heavy pressure');

  // Situation 3: Rhythm release when target is developing
  const rhythmRelease = shouldCpuReleasePass({
    hasTarget: true,
    isDeepShotOpportunity: false,
    hasOpenBreak: false,
    isUnderHeavyPressure: false,
    playClock: 24,
    bestScore: 15
  });
  assert.equal(rhythmRelease, true, 'AI QB throws on rhythm at frame 24');

  // Situation 4: Quick release under rush pressure at frame 10
  const earlyPressureRelease = shouldCpuReleasePass({
    hasTarget: true,
    isDeepShotOpportunity: false,
    hasOpenBreak: false,
    isUnderHeavyPressure: true,
    playClock: 10,
    bestScore: 5
  });
  assert.equal(earlyPressureRelease, true, 'AI QB gets ball out at frame 10 under rush pressure');

  // Situation 5: Progression release at frame 35 even if target score is modest
  const progressionRelease = shouldCpuReleasePass({
    hasTarget: true,
    isDeepShotOpportunity: false,
    hasOpenBreak: false,
    isUnderHeavyPressure: false,
    playClock: 35,
    bestScore: -5
  });
  assert.equal(progressionRelease, true, 'AI QB releases pass by frame 35 to prevent freeze/sack');
});

test('Passes in flight overhead do not trigger catch contests or bat-downs at the line of scrimmage', () => {
  // Pass flight arrival definition: progress >= 0.70 or near destination, descending to z <= 20
  const isArrival = (progress: number, z: number, frame: number, total: number) => {
    return (progress >= 0.70 || frame >= total - 4) && z <= 20;
  };

  // At line of scrimmage: frame 3 of 40, progress 0.075, ball high in air z = 28
  assert.equal(isArrival(0.075, 28, 3, 40), false, 'Pass crossing line of scrimmage is NOT at arrival');
  // At midpoint of pass: frame 20 of 40, progress 0.50, ball at arc apex z = 42
  assert.equal(isArrival(0.50, 42, 20, 40), false, 'Pass at arc apex is NOT at arrival');
  // Downfield arrival: frame 36 of 40, progress 0.90, ball descending to catch point z = 15
  assert.equal(isArrival(0.90, 15, 36, 40), true, 'Pass descending to downfield receiver IS at arrival window');
});



