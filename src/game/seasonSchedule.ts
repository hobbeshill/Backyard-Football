import { getRivalryForMatchup, type RivalryGame } from './rivalries';
import { TEAMS } from './teams';

export interface ScheduledMatchup {
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  rivalry?: RivalryGame | null;
}

// 16 SEC Teams, 9 regular-season weeks (Weeks 1 - 9)
// Every team plays exactly 9 games with authentic matchups & traditional rivalry weeks!
export const SEC_SEASON_SCHEDULE: Record<number, Array<[string, string]>> = {
  1: [
    ['ARKANSAS', 'LSU'],               // Battle for the Golden Boot
    ['ALABAMA', 'FLORIDA'],
    ['AUBURN', 'KENTUCKY'],
    ['GEORGIA', 'MISSISSIPPI_STATE'],
    ['MISSOURI', 'OKLAHOMA'],
    ['OLE_MISS', 'SOUTH_CAROLINA'],
    ['TENNESSEE', 'TEXAS'],
    ['TEXAS_AM', 'VANDERBILT']
  ],
  2: [
    ['ARKANSAS', 'TEXAS'],             // Horns vs. Hogs
    ['ALABAMA', 'GEORGIA'],            // Clash of SEC Giants
    ['AUBURN', 'FLORIDA'],
    ['KENTUCKY', 'LSU'],
    ['MISSISSIPPI_STATE', 'MISSOURI'],
    ['OKLAHOMA', 'OLE_MISS'],
    ['SOUTH_CAROLINA', 'VANDERBILT'],
    ['TENNESSEE', 'TEXAS_AM']
  ],
  3: [
    ['FLORIDA', 'TENNESSEE'],          // Florida–Tennessee Rivalry
    ['MISSOURI', 'SOUTH_CAROLINA'],    // The Mayor's Cup
    ['ALABAMA', 'ARKANSAS'],
    ['AUBURN', 'MISSISSIPPI_STATE'],
    ['GEORGIA', 'KENTUCKY'],
    ['LSU', 'TEXAS'],
    ['OKLAHOMA', 'TEXAS_AM'],
    ['OLE_MISS', 'VANDERBILT']
  ],
  4: [
    ['ARKANSAS', 'TEXAS_AM'],          // The Southwest Classic
    ['ALABAMA', 'KENTUCKY'],
    ['AUBURN', 'MISSOURI'],
    ['FLORIDA', 'MISSISSIPPI_STATE'],
    ['GEORGIA', 'LSU'],
    ['OKLAHOMA', 'SOUTH_CAROLINA'],
    ['OLE_MISS', 'TENNESSEE'],
    ['TEXAS', 'VANDERBILT']
  ],
  5: [
    ['OKLAHOMA', 'TEXAS'],             // The Red River Rivalry
    ['LSU', 'OLE_MISS'],               // The Magnolia Bowl
    ['ALABAMA', 'MISSISSIPPI_STATE'],
    ['ARKANSAS', 'AUBURN'],
    ['FLORIDA', 'MISSOURI'],
    ['GEORGIA', 'TENNESSEE'],
    ['KENTUCKY', 'VANDERBILT'],
    ['SOUTH_CAROLINA', 'TEXAS_AM']
  ],
  6: [
    ['AUBURN', 'GEORGIA'],             // Deep South's Oldest Rivalry
    ['FLORIDA', 'LSU'],                // Florida–LSU Rivalry
    ['ALABAMA', 'MISSOURI'],
    ['ARKANSAS', 'KENTUCKY'],
    ['MISSISSIPPI_STATE', 'TENNESSEE'],
    ['OKLAHOMA', 'VANDERBILT'],
    ['OLE_MISS', 'TEXAS_AM'],
    ['SOUTH_CAROLINA', 'TEXAS']
  ],
  7: [
    ['ALABAMA', 'TENNESSEE'],          // Third Saturday in October
    ['AUBURN', 'LSU'],                 // Tiger Bowl
    ['ARKANSAS', 'OKLAHOMA'],
    ['FLORIDA', 'OLE_MISS'],
    ['GEORGIA', 'TEXAS'],
    ['KENTUCKY', 'SOUTH_CAROLINA'],
    ['MISSISSIPPI_STATE', 'TEXAS_AM'],
    ['MISSOURI', 'VANDERBILT']
  ],
  8: [
    ['FLORIDA', 'GEORGIA'],            // World's Largest Outdoor Cocktail Party
    ['KENTUCKY', 'TENNESSEE'],         // Battle of the Border
    ['ALABAMA', 'LSU'],                // Saban Bowl / First Saturday in November
    ['ARKANSAS', 'SOUTH_CAROLINA'],
    ['AUBURN', 'OKLAHOMA'],
    ['MISSISSIPPI_STATE', 'VANDERBILT'],
    ['MISSOURI', 'TEXAS_AM'],
    ['OLE_MISS', 'TEXAS']
  ],
  9: [
    ['ALABAMA', 'AUBURN'],             // The Iron Bowl
    ['TEXAS', 'TEXAS_AM'],             // The Lone Star Showdown
    ['OLE_MISS', 'MISSISSIPPI_STATE'], // The Egg Bowl
    ['ARKANSAS', 'MISSOURI'],          // The Battle Line Rivalry
    ['TENNESSEE', 'VANDERBILT'],       // Battle of Tennessee
    ['OKLAHOMA', 'LSU'],               // SEC Finale
    ['FLORIDA', 'KENTUCKY'],
    ['GEORGIA', 'SOUTH_CAROLINA']
  ]
};

export const TOTAL_REGULAR_SEASON_WEEKS = 9;

// Get the 9 scheduled opponents for a given team in exact order (Week 1 to Week 9)
export function getScheduleForTeam(teamId: string): ScheduledMatchup[] {
  const schedule: ScheduledMatchup[] = [];

  for (let week = 1; week <= TOTAL_REGULAR_SEASON_WEEKS; week++) {
    const matchups = SEC_SEASON_SCHEDULE[week] || [];
    const found = matchups.find(([t1, t2]) => t1 === teamId || t2 === teamId);
    if (found) {
      const isHome = found[0] === teamId;
      const opponentId = isHome ? found[1] : found[0];
      const rivalry = getRivalryForMatchup(teamId, opponentId);
      schedule.push({
        week,
        homeTeamId: found[0],
        awayTeamId: found[1],
        rivalry
      });
    }
  }

  // Fallback if not an SEC team or incomplete:
  if (schedule.length < TOTAL_REGULAR_SEASON_WEEKS) {
    const allSecIds = Object.keys(TEAMS).filter(id => id !== teamId);
    for (let w = schedule.length + 1; w <= TOTAL_REGULAR_SEASON_WEEKS; w++) {
      const opponentId = allSecIds[(w - 1) % allSecIds.length];
      schedule.push({
        week: w,
        homeTeamId: teamId,
        awayTeamId: opponentId,
        rivalry: getRivalryForMatchup(teamId, opponentId)
      });
    }
  }

  return schedule;
}

// Simulate other 7 weekly games for CPU teams using authentic team ratings
export function simulateWeeklyMatchups(
  week: number,
  userTeamId: string,
  random: () => number = Math.random
): Array<{ team1Id: string; team2Id: string; team1Score: number; team2Score: number }> {
  const matchups = SEC_SEASON_SCHEDULE[week] || [];
  const results: Array<{ team1Id: string; team2Id: string; team1Score: number; team2Score: number }> = [];

  for (const [t1, t2] of matchups) {
    if (t1 === userTeamId || t2 === userTeamId) continue;
    const team1 = TEAMS[t1];
    const team2 = TEAMS[t2];
    if (!team1 || !team2) continue;

    // Weight score by team ratings (runPower, wrSpeed, passProtection, passRush, dbClosingSpeed)
    const t1Power = (team1.ratings.wrSpeed + team1.ratings.runPower + team1.ratings.passRush) / 3;
    const t2Power = (team2.ratings.wrSpeed + team2.ratings.runPower + team2.ratings.passRush) / 3;

    const baseScore1 = 14 + Math.round(t1Power * 10 + (random() * 14));
    const baseScore2 = 14 + Math.round(t2Power * 10 + (random() * 14));

    // Ensure non-ties
    let s1 = Math.max(3, baseScore1);
    let s2 = Math.max(3, baseScore2);
    if (s1 === s2) {
      if (t1Power >= t2Power) s1 += 3;
      else s2 += 3;
    }

    results.push({
      team1Id: t1,
      team2Id: t2,
      team1Score: s1,
      team2Score: s2
    });
  }

  return results;
}
