import { getRivalryForMatchup, type RivalryGame } from './rivalries';
import { getScheduleForTeam, simulateWeeklyMatchups, TOTAL_REGULAR_SEASON_WEEKS } from './seasonSchedule';
import { TEAMS } from './teams';

export const SEASON_GAME_COUNT = 9;
export const TOTAL_SEASON_WEEKS = 10; // 9 regular season weeks + SEC Championship Game

export interface SeasonGameResult {
  week: number;
  opponentId: string;
  p1Score: number;
  p2Score: number;
  isRivalry?: boolean;
  rivalryName?: string;
  trophyName?: string;
  trophyWon?: boolean;
  isSecChampionship?: boolean;
}

export interface SecTeamStanding {
  rank: number;
  teamId: string;
  name: string;
  nickname: string;
  primaryColor: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  winPct: number;
  isUser: boolean;
  secChampionshipEligible: boolean;
}

export interface SecChampionshipInfo {
  seed1TeamId: string;
  seed2TeamId: string;
  userQualified: boolean;
  userSeed?: 1 | 2;
  opponentId: string;
  played: boolean;
  p1Score?: number;
  p2Score?: number;
  winnerId?: string;
  trophyWon?: boolean;
}

export interface SeasonProgress {
  teamId: string;
  opponentIds: string[];
  results: SeasonGameResult[];
  simulatedWeeklyResults?: Array<{
    week: number;
    matchups: Array<{ team1Id: string; team2Id: string; team1Score: number; team2Score: number }>;
  }>;
  secChampionship?: SecChampionshipInfo | null;
  trophiesWon?: string[];
}

// Extensible game mode type with room for Dynasty mode
export type GameMode = 'ONE_GAME' | 'SEASON' | 'DYNASTY';

export interface DynastyProgress {
  coachName: string;
  teamId: string;
  currentYear: number;
  prestigeStars: number;
  secTitles: number;
  nationalTitles: number;
  careerWins: number;
  careerLosses: number;
  trophyCase: string[];
  seasonHistory: Array<{
    year: number;
    teamId: string;
    record: string;
    secResult: string;
    trophies: string[];
  }>;
}

const SEASON_STORAGE_KEY = 'backyard-football-season-v1';
const GAME_MODE_STORAGE_KEY = 'backyard-football-game-mode-v1';

export function loadGameMode(): GameMode {
  if (typeof window === 'undefined') return 'ONE_GAME';
  try {
    const saved = window.localStorage.getItem(GAME_MODE_STORAGE_KEY);
    return (saved === 'SEASON' || saved === 'DYNASTY') ? saved : 'ONE_GAME';
  } catch {
    return 'ONE_GAME';
  }
}

export function saveGameMode(mode: GameMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GAME_MODE_STORAGE_KEY, mode);
  } catch {
    // Mode remains available in memory
  }
}

// Configure a 9-game season for the selected team
export function createSeason(teamId: string, teamIds: string[] = Object.keys(TEAMS)): SeasonProgress {
  const isSecTeam = Boolean(TEAMS[teamId]);

  let opponentIds: string[];
  if (isSecTeam) {
    const scheduled = getScheduleForTeam(teamId);
    opponentIds = scheduled.map(m => m.homeTeamId === teamId ? m.awayTeamId : m.homeTeamId);
  } else {
    // Fallback for tests or custom lists: take up to 4 if small list, or 9
    const candidates = teamIds.filter(id => id !== teamId);
    const maxGames = teamIds.length <= 6 ? 4 : SEASON_GAME_COUNT;
    opponentIds = candidates.slice(0, Math.min(maxGames, candidates.length));
  }

  return {
    teamId,
    opponentIds,
    results: [],
    simulatedWeeklyResults: [],
    secChampionship: null,
    trophiesWon: []
  };
}

// Record a completed season game, simulate other conference games, and determine SEC Championship qualification
export function recordSeasonGame(
  progress: SeasonProgress,
  p1Score: number,
  p2Score: number
): SeasonProgress {
  const resultsCount = progress.results.length;

  // Handle SEC Championship game (Week 10)
  if (resultsCount >= progress.opponentIds.length) {
    if (progress.secChampionship && progress.secChampionship.userQualified && !progress.secChampionship.played) {
      const isWin = p1Score > p2Score;
      const winnerId = isWin ? progress.teamId : progress.secChampionship.opponentId;
      const updatedChampionship: SecChampionshipInfo = {
        ...progress.secChampionship,
        played: true,
        p1Score,
        p2Score,
        winnerId,
        trophyWon: isWin
      };

      const newTrophies = [...(progress.trophiesWon || [])];
      if (isWin && !newTrophies.includes('SEC Championship Trophy')) {
        newTrophies.push('SEC Championship Trophy');
      }

      const championshipGameResult: SeasonGameResult = {
        week: 10,
        opponentId: progress.secChampionship.opponentId,
        p1Score,
        p2Score,
        isRivalry: false,
        isSecChampionship: true,
        trophyName: 'SEC Championship Trophy',
        trophyWon: isWin
      };

      return {
        ...progress,
        results: [...progress.results, championshipGameResult],
        secChampionship: updatedChampionship,
        trophiesWon: newTrophies
      };
    }
    return progress;
  }

  // Regular Season game (Weeks 1 - 9)
  const currentWeek = resultsCount + 1;
  const opponentId = progress.opponentIds[resultsCount];
  if (!opponentId) return progress;

  const rivalry = getRivalryForMatchup(progress.teamId, opponentId);
  const isWin = p1Score > p2Score;

  const newTrophies = [...(progress.trophiesWon || [])];
  if (rivalry && isWin && !newTrophies.includes(rivalry.trophy)) {
    newTrophies.push(rivalry.trophy);
  }

  const result: SeasonGameResult = {
    week: currentWeek,
    opponentId,
    p1Score,
    p2Score,
    isRivalry: Boolean(rivalry),
    rivalryName: rivalry?.name,
    trophyName: rivalry?.trophy,
    trophyWon: rivalry ? isWin : undefined,
    isSecChampionship: false
  };

  // Simulate other SEC games for this week to maintain live conference standings
  const weeklySims = simulateWeeklyMatchups(currentWeek, progress.teamId);
  const updatedSimulated = [
    ...(progress.simulatedWeeklyResults || []),
    { week: currentWeek, matchups: weeklySims }
  ];

  const updatedResults = [...progress.results, result];

  let secChampionship = progress.secChampionship || null;

  // Once regular season completes (Week 9), calculate final standings and determine SEC Championship Top 2!
  const isSecTeam = Boolean(TEAMS[progress.teamId]);
  if (isSecTeam && updatedResults.length === progress.opponentIds.length && !secChampionship) {
    const tempProgress = {
      ...progress,
      results: updatedResults,
      simulatedWeeklyResults: updatedSimulated
    };
    const standings = calculateSecStandings(tempProgress);
    const seed1 = standings[0]?.teamId || 'GEORGIA';
    const seed2 = standings[1]?.teamId || 'TEXAS';

    const userQualified = progress.teamId === seed1 || progress.teamId === seed2;
    const userSeed = progress.teamId === seed1 ? 1 : progress.teamId === seed2 ? 2 : undefined;
    const opponentSeedId = progress.teamId === seed1 ? seed2 : seed1;

    secChampionship = {
      seed1TeamId: seed1,
      seed2TeamId: seed2,
      userQualified,
      userSeed,
      opponentId: opponentSeedId,
      played: false
    };

    if (!userQualified) {
      const s1Team = TEAMS[seed1];
      const s2Team = TEAMS[seed2];
      const s1Power = s1Team ? (s1Team.ratings.wrSpeed + s1Team.ratings.runPower + s1Team.ratings.passRush) / 3 : 1;
      const s2Power = s2Team ? (s2Team.ratings.wrSpeed + s2Team.ratings.runPower + s2Team.ratings.passRush) / 3 : 1;
      const s1Score = 24 + Math.round(s1Power * 7);
      const s2Score = 21 + Math.round(s2Power * 7);
      const finalS1 = s1Score === s2Score ? s1Score + 3 : s1Score;
      secChampionship.played = true;
      secChampionship.p1Score = finalS1;
      secChampionship.p2Score = s2Score;
      secChampionship.winnerId = finalS1 > s2Score ? seed1 : seed2;
      secChampionship.trophyWon = false;
    }
  }

  return {
    ...progress,
    results: updatedResults,
    simulatedWeeklyResults: updatedSimulated,
    secChampionship,
    trophiesWon: newTrophies
  };
}

// Calculate SEC Conference Standings for all 16 teams
export function calculateSecStandings(progress: SeasonProgress): SecTeamStanding[] {
  const standingsMap = new Map<string, {
    wins: number;
    losses: number;
    ties: number;
    pointsFor: number;
    pointsAgainst: number;
  }>();

  // Initialize all SEC teams
  for (const teamId of Object.keys(TEAMS)) {
    standingsMap.set(teamId, { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 });
  }

  // 1. Add user's regular season results (weeks 1 - 9)
  for (const res of progress.results) {
    if (res.isSecChampionship) continue;
    const userStats = standingsMap.get(progress.teamId) || { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 };
    const oppStats = standingsMap.get(res.opponentId) || { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 };

    userStats.pointsFor += res.p1Score;
    userStats.pointsAgainst += res.p2Score;
    oppStats.pointsFor += res.p2Score;
    oppStats.pointsAgainst += res.p1Score;

    if (res.p1Score > res.p2Score) {
      userStats.wins++;
      oppStats.losses++;
    } else if (res.p1Score < res.p2Score) {
      userStats.losses++;
      oppStats.wins++;
    } else {
      userStats.ties++;
      oppStats.ties++;
    }
  }

  // 2. Add simulated conference game results
  for (const weekSim of progress.simulatedWeeklyResults || []) {
    for (const m of weekSim.matchups) {
      const t1Stats = standingsMap.get(m.team1Id);
      const t2Stats = standingsMap.get(m.team2Id);
      if (!t1Stats || !t2Stats) continue;

      t1Stats.pointsFor += m.team1Score;
      t1Stats.pointsAgainst += m.team2Score;
      t2Stats.pointsFor += m.team2Score;
      t2Stats.pointsAgainst += m.team1Score;

      if (m.team1Score > m.team2Score) {
        t1Stats.wins++;
        t2Stats.losses++;
      } else if (m.team1Score < m.team2Score) {
        t1Stats.losses++;
        t2Stats.wins++;
      } else {
        t1Stats.ties++;
        t2Stats.ties++;
      }
    }
  }

  // Sort standings: Win Pct -> Point Differential -> Points For
  const standingsList: SecTeamStanding[] = Array.from(standingsMap.entries()).map(([teamId, stats]) => {
    const team = TEAMS[teamId] || { name: teamId, nickname: teamId, primaryColor: '#666666' };
    const totalGames = stats.wins + stats.losses + stats.ties;
    const winPct = totalGames > 0 ? (stats.wins + stats.ties * 0.5) / totalGames : 0;
    const pointDiff = stats.pointsFor - stats.pointsAgainst;

    return {
      rank: 1,
      teamId,
      name: team.name,
      nickname: team.nickname,
      primaryColor: team.primaryColor,
      wins: stats.wins,
      losses: stats.losses,
      ties: stats.ties,
      pointsFor: stats.pointsFor,
      pointsAgainst: stats.pointsAgainst,
      pointDiff,
      winPct,
      isUser: teamId === progress.teamId,
      secChampionshipEligible: false
    };
  });

  standingsList.sort((a, b) => {
    if (b.winPct !== a.winPct) return b.winPct - a.winPct;
    if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
    return b.pointsFor - a.pointsFor;
  });

  standingsList.forEach((team, index) => {
    team.rank = index + 1;
    team.secChampionshipEligible = index < 2;
  });

  return standingsList;
}

export function getSeasonRecord(progress: SeasonProgress): { wins: number; losses: number; ties: number } {
  return progress.results.reduce((record, result) => {
    if (result.p1Score > result.p2Score) record.wins++;
    else if (result.p1Score < result.p2Score) record.losses++;
    else record.ties++;
    return record;
  }, { wins: 0, losses: 0, ties: 0 });
}

export function loadSeasonProgress(): SeasonProgress | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = window.localStorage.getItem(SEASON_STORAGE_KEY);
    if (!saved) return null;
    const progress = JSON.parse(saved) as SeasonProgress;
    if (!progress.teamId || !Array.isArray(progress.opponentIds) || !Array.isArray(progress.results)) return null;
    return progress;
  } catch {
    return null;
  }
}

export function saveSeasonProgress(progress: SeasonProgress): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SEASON_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Retain in memory
  }
}
