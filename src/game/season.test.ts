import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeason, getSeasonRecord, recordSeasonGame } from './season';

test('season schedule excludes the selected team and contains four opponents', () => {
  const season = createSeason('A', ['A', 'B', 'C', 'D', 'E', 'F']);

  assert.equal(season.opponentIds.length, 4);
  assert.equal(season.opponentIds.includes('A'), false);
  assert.deepEqual(season.opponentIds, ['B', 'C', 'D', 'E']);
});

test('season results advance by opponent and update the player record', () => {
  const season = createSeason('A', ['A', 'B', 'C', 'D', 'E']);
  const afterWin = recordSeasonGame(season, 14, 7);
  const afterTie = recordSeasonGame(afterWin, 7, 7);
  const afterLoss = recordSeasonGame(afterTie, 0, 3);

  assert.deepEqual(afterLoss.results.map(result => result.opponentId), ['B', 'C', 'D']);
  assert.deepEqual(getSeasonRecord(afterLoss), { wins: 1, losses: 1, ties: 1 });
  assert.equal(recordSeasonGame(afterLoss, 21, 0).results.length, 4);
  assert.equal(recordSeasonGame(recordSeasonGame(afterLoss, 21, 0), 21, 0).results.length, 4);
});