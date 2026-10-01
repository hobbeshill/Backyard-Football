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