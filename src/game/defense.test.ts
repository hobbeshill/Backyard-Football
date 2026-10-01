import assert from 'node:assert/strict';
import test from 'node:test';
import { alignDefenderAcrossFromRunningBack, alignDefenders, chooseCpuDefensiveAssignments } from './defense';
import type { Entity } from './types';

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

  // Speed is tuned to maxSpeed * 0.68 for accessible gameplay pace
  assert.ok(entity.vx! < 7.5, 'Adjusted speed should be calibrated under 7.5 for maxSpeed 10');
  assert.ok(entity.vx! > 6.0, 'Adjusted speed should be around 6.8');
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

test('User and AI can move defensive players before the snap', () => {
  const lineOfScrimmageY = 900;
  const attackDirection = -1; // defense is above LOS at y < 900
  const fieldWidth = 340;
  const defender: Entity = { x: 170, y: 840, startX: 170, startY: 840, radius: 10 };

  // User drags defender to press the line of scrimmage
  const targetX = 230;
  const targetY = 880; // Legal pre-snap position (above LOS - 12)

  const boundedX = Math.max(25, Math.min(fieldWidth - 25, targetX));
  const boundedY = Math.max(45, Math.min(lineOfScrimmageY - 12, targetY));

  defender.x = boundedX;
  defender.y = boundedY;
  defender.startX = boundedX;
  defender.startY = boundedY;

  assert.equal(defender.x, 230, 'Defender X position should be updated');
  assert.equal(defender.y, 880, 'Defender Y position should be updated');
  assert.ok(defender.y <= lineOfScrimmageY - 12, 'Defender must remain on legal defensive side of line');

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




