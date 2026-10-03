export const SEASON_GAME_COUNT = 4;

export interface SeasonGameResult {
  week: number;
  opponentId: string;
  p1Score: number;
  p2Score: number;
}

export interface SeasonProgress {
  teamId: string;
  opponentIds: string[];
  results: SeasonGameResult[];
}

const SEASON_STORAGE_KEY = 'backyard-football-season-v1';
const GAME_MODE_STORAGE_KEY = 'backyard-football-game-mode-v1';

export type GameMode = 'ONE_GAME' | 'SEASON';

export function loadGameMode(): GameMode {
  if (typeof window === 'undefined') return 'ONE_GAME';
  try {
    return window.localStorage.getItem(GAME_MODE_STORAGE_KEY) === 'SEASON' ? 'SEASON' : 'ONE_GAME';
  } catch {
    return 'ONE_GAME';
  }
}

export function saveGameMode(mode: GameMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GAME_MODE_STORAGE_KEY, mode);
  } catch {
    // The selected mode remains available for the current page session.
  }
}

export function createSeason(teamId: string, teamIds: string[]): SeasonProgress {
  const opponents = teamIds.filter(id => id !== teamId);
  return {
    teamId,
    opponentIds: opponents.slice(0, Math.min(SEASON_GAME_COUNT, opponents.length)),
    results: []
  };
}

export function recordSeasonGame(progress: SeasonProgress, p1Score: number, p2Score: number): SeasonProgress {
  const week = progress.results.length;
  const opponentId = progress.opponentIds[week];
  if (!opponentId) return progress;

  return {
    ...progress,
    results: [...progress.results, { week: week + 1, opponentId, p1Score, p2Score }]
  };
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
    // Season progress remains playable if browser storage is unavailable.
  }
}