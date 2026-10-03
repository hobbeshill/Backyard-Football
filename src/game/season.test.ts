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

test('completed games return to the menu or automatically launch the next season matchup', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('    if (!finishedGame) return;');
  const end = source.indexOf('  }, [finishedGame]);', start);
  assert.ok(start >= 0 && end > start);
  const complete = new Function(
    'finishedGame', 'gameModeRef', 'seasonProgressRef', 'setFinishedGame',
    'handleReturnToMainMenu', 'recordSeasonGame', 'setSeasonProgress', 'saveSeasonProgress', 'handleStartGame',
    source.slice(start, end)
  );
  const season = createSeason('A', ['A', 'B', 'C', 'D', 'E']);
  const afterFirstGame = recordSeasonGame(season, 14, 7);
  const beforeFinalGame = recordSeasonGame(recordSeasonGame(afterFirstGame, 7, 0), 0, 7);
  const cases = [
    { mode: 'ONE_GAME', progress: season, restored: false, menu: 1, next: 0, results: 0 },
    { mode: 'SEASON', progress: season, restored: false, menu: 0, next: 1, results: 1 },
    { mode: 'SEASON', progress: beforeFinalGame, restored: false, menu: 1, next: 0, results: 4 },
    { mode: 'SEASON', progress: afterFirstGame, restored: true, menu: 0, next: 1, results: 1 }
  ];
  for (const scenario of cases) {
    let menuVisits = 0;
    let nextGames = 0;
    const progressRef = { current: scenario.progress };
    complete(
      { p1Score: 14, p2Score: 7, restored: scenario.restored },
      { current: scenario.mode }, progressRef, () => {},
      () => { menuVisits++; }, recordSeasonGame, () => {}, () => {},
      () => { nextGames++; }
    );
    assert.equal(menuVisits, scenario.menu);
    assert.equal(nextGames, scenario.next);
    assert.equal(progressRef.current.results.length, scenario.results);
  }
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