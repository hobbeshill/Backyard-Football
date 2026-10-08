import test from 'node:test';
import assert from 'node:assert/strict';
import { getRouteWaypoints, updateRouteMovement } from './movement';
import { allRoutes, offensivePlaybook } from './playbook';
import type { Entity } from './types';

test('routes stay in bounds and settle at their endpoints in either direction', () => {
  for (const routeType of allRoutes.filter(route => route !== 'BLOCK')) {
    for (const direction of [-1, 1]) {
      for (const startX of [30, 45, 115, 225, 295, 310]) {
        for (const startY of [110, 600, 1090]) {
          const receiver: Entity = { x: startX, y: startY, startX, startY, radius: 10, routeType };
          const points = getRouteWaypoints(receiver, direction);
          assert.ok(points.length > 0, routeType);
          for (let frame = 0; frame < 1500; frame++) {
            updateRouteMovement(receiver, frame < 400 ? 'QB_DROP' : 'THROWN', direction, [], 340);
            assert.ok(receiver.x >= 30 && receiver.x <= 310, `${routeType} crosses a sideline`);
            assert.ok(receiver.y >= 20 && receiver.y <= 1180, `${routeType} crosses an end line`);
          }
          assert.deepEqual({ x: receiver.x, y: receiver.y }, points.at(-1), `${routeType} must settle instead of drifting`);
          assert.equal(receiver.vx, 0);
          assert.equal(receiver.vy, 0);
        }
      }
    }
  }
});

test('route depths include intermediate targets, long shots and short checkdowns', () => {
  const depth = (routeType: string) => {
    const points = getRouteWaypoints({ x: 170, y: 500, radius: 10, routeType }, 1);
    return (points.at(-1)!.y - 500) / 10;
  };
  assert.equal(depth('HITCH'), 6);
  for (const route of ['SLANT-L', 'SLANT-R', 'CROSS-L', 'CROSS-R', 'COMEBACK']) {
    assert.equal(depth(route), 12);
  }
  for (const route of ['FLAG-L', 'FLAG-R', 'POST-L', 'POST-R', 'GO', 'WHEEL']) {
    assert.ok(depth(route) >= 30, `${route} should reach at least 30 yards`);
  }
});

test('screen pass receiver slants across the formation toward the middle', () => {
  const receiver: Entity = {
    x: 260,
    y: 500,
    startX: 260,
    startY: 500,
    radius: 10,
    routeType: offensivePlaybook.PRO_SCREEN.right
  };
  const waypoints = getRouteWaypoints(receiver, -1);

  assert.equal(receiver.routeType, 'SLANT-L');
  assert.deepEqual(waypoints, [{ x: 260, y: 450 }, { x: 170, y: 380 }]);
});

test('route movement does not take over caught receivers or pre-snap players', () => {
  const receiver: Entity = { x: 170, y: 500, radius: 10, routeType: 'GO' };
  updateRouteMovement(receiver, 'PRE_SNAP', 1, [], 340);
  assert.equal(receiver.y, 500);
  receiver.caught = true;
  updateRouteMovement(receiver, 'THROWN', 1, [], 340);
  assert.equal(receiver.y, 500);
});
