import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeason, getSeasonRecord, recordSeasonGame } from './season';

test('season setup renders all team choices without a schedule panel', async (context) => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { default: App } = await import('../App');
  const { getAllTeams } = await import('./teams');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => key === 'backyard-football-game-mode-v1' ? 'SEASON' : null
      }
    }
  });
  context.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  const markup = renderToStaticMarkup(createElement(App));
  assert.ok(markup.includes('Season setup'));
  assert.ok(markup.includes('Search SEC teams'));
  assert.ok(markup.includes('Start season'));
  assert.ok(!markup.includes('aria-label="Season schedule"'));
  assert.ok(!markup.includes('SCHEDULED'));
  for (const team of getAllTeams()) {
    const escapedName = team.name.replaceAll('&', '&amp;');
    assert.ok(markup.includes(`<span>${escapedName}</span>`), `${team.name} is available to pick`);
  }
});

test('completed games retain a box score and save season results for player navigation', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('    if (!finishedGame || finishedGameHandledRef.current) return;');
  const end = source.indexOf('  }, [finishedGame]);', start);
  assert.ok(start >= 0 && end > start);
  const complete = new Function(
    'finishedGame', 'finishedGameHandledRef', 'gameModeRef', 'seasonProgressRef',
    'recordSeasonGame', 'setSeasonProgress', 'saveSeasonProgress',
    source.slice(start, end)
  );
  const season = createSeason('A', ['A', 'B', 'C', 'D', 'E']);
  const afterFirstGame = recordSeasonGame(season, 14, 7);
  const beforeFinalGame = recordSeasonGame(recordSeasonGame(afterFirstGame, 7, 0), 0, 7);
  const cases = [
    { mode: 'ONE_GAME', progress: season, restored: false, results: 0, saves: 0, records: 0 },
    { mode: 'SEASON', progress: season, restored: false, results: 1, saves: 1, records: 1 },
    { mode: 'SEASON', progress: beforeFinalGame, restored: false, results: 4, saves: 1, records: 1 },
    { mode: 'SEASON', progress: afterFirstGame, restored: true, results: 1, saves: 1, records: 0 }
  ];
  for (const scenario of cases) {
    let saveCount = 0;
    let recordCount = 0;
    const recordGame = (progress: typeof season, p1Score: number, p2Score: number) => {
      recordCount++;
      return recordSeasonGame(progress, p1Score, p2Score);
    };
    const progressRef = { current: scenario.progress };
    complete(
      { p1Score: 14, p2Score: 7, restored: scenario.restored }, { current: false },
      { current: scenario.mode }, progressRef, recordGame,
      () => {}, () => { saveCount++; }
    );
    assert.equal(saveCount, scenario.saves);
    assert.equal(recordCount, scenario.records);
    assert.equal(progressRef.current.results.length, scenario.results);
  }

  assert.ok(source.includes('aria-labelledby="box-score-title"'));
  assert.ok(source.includes('Next game'));
  assert.ok(source.includes('Return to main menu'));
});

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