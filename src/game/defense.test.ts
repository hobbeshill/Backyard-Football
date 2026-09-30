import assert from 'node:assert/strict';
import test from 'node:test';
import { alignDefenders, chooseCpuDefensiveAssignments } from './defense';
import type { Entity } from './types';

function createAlignedDefense(playKey: string) {
  const receivers: Entity[] = [
    { x: 50, y: 500, startX: 50, startY: 500, radius: 10 },
    { x: 290, y: 500, startX: 290, startY: 500, radius: 10 }
  ];
  const centerReceiver: Entity = { x: 170, y: 500, startX: 170, startY: 500, radius: 10 };
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