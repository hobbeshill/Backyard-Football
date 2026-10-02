import assert from 'node:assert/strict';
import test from 'node:test';
import { getThrowOffDistance } from './rules';

test('throw-off meter bottom is a 10-yard throw', () => {
  assert.equal(getThrowOffDistance(0, 1000), 100);
});

test('throw-off meter top reaches the goal line', () => {
  assert.equal(getThrowOffDistance(1, 1000), 1000);
});

test('throw-off meter power stays within its range', () => {
  assert.equal(getThrowOffDistance(-1, 1000), 100);
  assert.equal(getThrowOffDistance(2, 1000), 1000);
});