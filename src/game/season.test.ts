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

test('every SEC team in the video game has a 9-game regular season schedule', async () => {
  const { TEAMS } = await import('./teams');
  const { getScheduleForTeam } = await import('./seasonSchedule');

  const secTeamIds = Object.keys(TEAMS);
  assert.equal(secTeamIds.length, 16, 'All 16 SEC teams must be configured');

  for (const teamId of secTeamIds) {
    const season = createSeason(teamId);
    assert.equal(season.opponentIds.length, 9, `${teamId} must have a 9-game regular season`);
    assert.equal(season.opponentIds.includes(teamId), false, `${teamId} should never play itself`);

    const schedule = getScheduleForTeam(teamId);
    assert.equal(schedule.length, 9, `${teamId} schedule must contain 9 weekly matchups`);
    for (let w = 1; w <= 9; w++) {
      assert.equal(schedule[w - 1].week, w, `Week number must be sequential 1-9`);
    }
  }
});

test('traditional rivalry games are scheduled during their traditional weeks', async () => {
  const { getScheduleForTeam } = await import('./seasonSchedule');
  const { getRivalryForMatchup } = await import('./rivalries');

  // Week 9 Traditional Rivalry Weekend
  const alabamaSchedule = getScheduleForTeam('ALABAMA');
  const week9Bama = alabamaSchedule.find(m => m.week === 9);
  assert.ok(week9Bama);
  const bamaOpponent = week9Bama.homeTeamId === 'ALABAMA' ? week9Bama.awayTeamId : week9Bama.homeTeamId;
  assert.equal(bamaOpponent, 'AUBURN', 'The Iron Bowl must be played in Week 9');
  const ironBowl = getRivalryForMatchup('ALABAMA', 'AUBURN');
  assert.ok(ironBowl);
  assert.equal(ironBowl.name, 'The Iron Bowl');
  assert.equal(ironBowl.trophy, 'James E. Foy-ODK Sportsmanship Trophy');

  const texasSchedule = getScheduleForTeam('TEXAS');
  const week9Texas = texasSchedule.find(m => m.week === 9);
  assert.ok(week9Texas);
  const texasOpponent = week9Texas.homeTeamId === 'TEXAS' ? week9Texas.awayTeamId : week9Texas.homeTeamId;
  assert.equal(texasOpponent, 'TEXAS_AM', 'The Lone Star Showdown must be played in Week 9');

  const oleMissSchedule = getScheduleForTeam('OLE_MISS');
  const week9OleMiss = oleMissSchedule.find(m => m.week === 9);
  assert.ok(week9OleMiss);
  const oleMissOpponent = week9OleMiss.homeTeamId === 'OLE_MISS' ? week9OleMiss.awayTeamId : week9OleMiss.homeTeamId;
  assert.equal(oleMissOpponent, 'MISSISSIPPI_STATE', 'The Golden Egg Bowl must be played in Week 9');

  // Week 8 Cocktail Party
  const floridaSchedule = getScheduleForTeam('FLORIDA');
  const week8Florida = floridaSchedule.find(m => m.week === 8);
  assert.ok(week8Florida);
  const flaOpponent = week8Florida.homeTeamId === 'FLORIDA' ? week8Florida.awayTeamId : week8Florida.homeTeamId;
  assert.equal(flaOpponent, 'GEORGIA', "World's Largest Outdoor Cocktail Party must be played in Week 8");

  // Week 7 Third Saturday in October
  const week7Bama = alabamaSchedule.find(m => m.week === 7);
  assert.ok(week7Bama);
  const week7BamaOpp = week7Bama.homeTeamId === 'ALABAMA' ? week7Bama.awayTeamId : week7Bama.homeTeamId;
  assert.equal(week7BamaOpp, 'TENNESSEE', 'Third Saturday in October must be played in Week 7');

  // Week 5 Red River Rivalry
  const okSchedule = getScheduleForTeam('OKLAHOMA');
  const week5Ok = okSchedule.find(m => m.week === 5);
  assert.ok(week5Ok);
  const okOpp = week5Ok.homeTeamId === 'OKLAHOMA' ? week5Ok.awayTeamId : week5Ok.homeTeamId;
  assert.equal(okOpp, 'TEXAS', 'The Red River Rivalry must be played in Week 5');
});

test('winning rivalry games awards trophies and season culminates in SEC Championship', async () => {
  let season = createSeason('ALABAMA');
  assert.equal(season.opponentIds.length, 9);

  // Play 9 regular season games with commanding wins
  for (let i = 0; i < 9; i++) {
    season = recordSeasonGame(season, 35, 14);
  }

  assert.equal(season.results.length, 9);
  assert.ok(season.trophiesWon && season.trophiesWon.length > 0, 'Should win rivalry trophies from scheduled rivalry wins');
  assert.ok(season.secChampionship, 'SEC Championship should be determined after 9 games');
  assert.equal(season.secChampionship.userQualified, true, 'Undefeated Alabama must qualify for SEC Championship');
  assert.ok(season.secChampionship.opponentId, 'Opponent seed must be determined');

  // Play SEC Championship Game (Week 10)
  const afterChampionship = recordSeasonGame(season, 28, 24);
  assert.equal(afterChampionship.results.length, 10, 'Season culminates in Week 10 SEC Championship Game');
  assert.equal(afterChampionship.results[9].isSecChampionship, true);
  assert.equal(afterChampionship.secChampionship?.played, true);
  assert.equal(afterChampionship.secChampionship?.trophyWon, true);
  assert.ok(afterChampionship.trophiesWon?.includes('SEC Championship Trophy'), 'Champion wins SEC Championship Trophy');
});

test('clicking season has option to continue the season or start a new season and does not list rivalry under scoreboard', async (context) => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { default: App } = await import('../App');
  const season = createSeason('ALABAMA');
  const seasonWithGame = recordSeasonGame(season, 24, 14);

  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => {
          if (key === 'backyard-football-game-mode-v1') return 'SEASON';
          if (key === 'backyard-football-season-v1') return JSON.stringify(seasonWithGame);
          return null;
        },
        setItem: () => {}
      }
    }
  });

  context.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });

  const markup = renderToStaticMarkup(createElement(App));

  // Season setup screen provides option to continue season as well as start new season
  assert.ok(markup.includes('Continue season'), 'Has option to continue existing season');
  assert.ok(markup.includes('Start new season'), 'Has option to start new season');

  // Verify rivalry game names are NOT listed under the scoreboard header
  // Header should only contain the matchup button and scoreboard grid
  const headerContent = markup.slice(markup.indexOf('<header'), markup.indexOf('</header>'));
  assert.ok(!headerContent.includes('border-yellow-400/80'), 'No rivalry banner under scoreboard');
  assert.ok(!headerContent.includes('Iron Bowl'), 'Rivalry names must not be listed under scoreboard');
  assert.ok(!headerContent.includes('Red River Rivalry'), 'Rivalry names must not be listed under scoreboard');
});