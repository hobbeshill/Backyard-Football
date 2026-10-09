import type { Entity } from './types';

export type PlayerTrait = 'SPD' | 'PWR' | 'HANDS' | 'COV' | 'HIT' | 'BLK' | 'RUSH' | 'QB';
export type RosterSlot = 'qb' | 'wr-0' | 'wr-1' | 'wr-2' | 'center' | 'rb' | 'line-0' | 'line-1' |
  'def-0' | 'def-1' | 'def-2' | 'def-3' | 'def-4' | 'def-5' | 'def-6' | 'def-7';

export interface PlayerRatings {
  speed: number;
  power: number;
  hands: number;
  coverage: number;
  tackling: number;
  blocking: number;
  rush: number;
  endurance: number;
}

export interface PlayerProfile {
  number: number;
  label: string;
  trait: PlayerTrait;
  archetype: string;
  ratings: PlayerRatings;
}

export type TeamRoster = Record<RosterSlot, PlayerProfile>;

interface RosterTeamRatings {
  wrSpeed: number;
  passProtection: number;
  runPower: number;
  dbClosingSpeed: number;
  passRush: number;
  mistakeChance: number;
}

const boundedRating = (rating: number) => Math.max(30, Math.min(95, Math.round(rating)));

function player(
  number: number, label: string, trait: PlayerTrait, archetype: string, ratings: Partial<PlayerRatings>
): PlayerProfile {
  return {
    number, label, trait, archetype,
    ratings: { speed: 65, power: 55, hands: 50, coverage: 40, tackling: 50, blocking: 45, rush: 40, endurance: 75, ...ratings }
  };
}

export function createTeamRoster(
  id: string,
  archetype: 'AIR_RAID' | 'GROUND_POUND' | 'BLITZ_HAWKS' | 'BALANCED_PRO',
  team: RosterTeamRatings
): TeamRoster {
  const powerTeam = archetype === 'GROUND_POUND';
  const speedTeam = archetype === 'AIR_RAID';
  const blitzTeam = archetype === 'BLITZ_HAWKS';
  const receiverSpeed = (team.wrSpeed - 1) * 25 - (powerTeam ? 10 : 0);
  const defensiveSpeed = (team.dbClosingSpeed - 1) * 22;
  const blocking = (team.passProtection - 1) * 30;
  const power = (team.runPower - 1) * 26;
  const rush = (team.passRush - 1) * 30;
  const coverage = (1 - team.mistakeChance) * 25;
  const roster: TeamRoster = {
    qb: player(7, blitzTeam ? 'Mobile quarterback' : 'Pocket quarterback', blitzTeam ? 'SPD' : 'QB', 'QUARTERBACK',
      { speed: blitzTeam ? 86 : powerTeam ? 52 : 65, power: 50, hands: 70 }),
    'wr-0': player(11, 'Deep threat', 'SPD', 'SPEEDSTER',
      { speed: 84 + receiverSpeed, power: 38, hands: 64, blocking: 32, endurance: 62 }),
    'wr-1': player(18, 'Slot technician', 'HANDS', 'SLOT',
      { speed: 73 + receiverSpeed, hands: 84, power: 45, blocking: 43 }),
    'wr-2': player(81, 'Possession receiver', 'HANDS', 'POSSESSION',
      { speed: 64 + receiverSpeed, power: 63, hands: 91, blocking: 62, endurance: 85 }),
    center: player(88, 'Blocking tight end', 'BLK', 'TIGHT_END',
      { speed: powerTeam ? 48 : 59, power: 78, hands: 80, blocking: 80 + blocking }),
    rb: player(24, powerTeam ? 'Power back' : speedTeam ? 'Space back' : 'All-purpose back',
      powerTeam ? 'PWR' : speedTeam ? 'SPD' : 'PWR', 'RUNNING_BACK',
      { speed: powerTeam ? 58 : speedTeam ? 87 : 74, power: 72 + power, hands: speedTeam ? 82 : 62, blocking: 63 + blocking, endurance: powerTeam ? 88 : 73 }),
    'line-0': player(67, 'Pocket anchor', 'BLK', 'LINEMAN',
      { speed: 38, power: 85, blocking: 77 + blocking, hands: 30 }),
    'line-1': player(73, 'Right tackle', 'BLK', 'LINEMAN',
      { speed: 38, power: 84, blocking: 76 + blocking, hands: 30 }),
    'def-0': player(90, 'Edge rusher', 'RUSH', 'RUSHER',
      { speed: blitzTeam ? 77 : 62, power: 79, tackling: 78, rush: 77 + rush, coverage: 32 }),
    'def-1': player(52, 'Run stopper', 'HIT', 'LINEBACKER',
      { speed: 55 + defensiveSpeed, power: 88, tackling: powerTeam ? 91 : 86, coverage: 44 + coverage, rush: 65 }),
    'def-2': player(45, 'Coverage linebacker', 'COV', 'LINEBACKER',
      { speed: 72 + defensiveSpeed, power: 64, tackling: 72, coverage: 76 + coverage, rush: 47 }),
    'def-3': player(21, 'Shutdown corner', 'COV', 'LOCKDOWN',
      { speed: 86 + defensiveSpeed, power: 38, tackling: 56, coverage: 87 + coverage, hands: 75 }),
    'def-4': player(29, 'Speed corner', 'SPD', 'CORNER',
      { speed: 89 + defensiveSpeed, power: 40, tackling: 53, coverage: 64 + coverage, hands: 63 }),
    'def-5': player(54, 'Middle enforcer', 'HIT', 'LINEBACKER',
      { speed: 58 + defensiveSpeed, power: 90, tackling: 88, coverage: 50 + coverage, rush: 65 }),
    'def-6': player(3, 'Ball-hawk safety', 'COV', 'SAFETY',
      { speed: 84 + defensiveSpeed, power: 60, tackling: 73, coverage: 81 + coverage, hands: 83 }),
    'def-7': player(27, 'Strong safety', 'HIT', 'SAFETY',
      { speed: 78 + defensiveSpeed, power: 74, tackling: 81, coverage: 75 + coverage, hands: 70 })
  };

  // Signature players distinguish teams even within the same scheme.
  const signatures: Record<string, [RosterSlot, Partial<PlayerRatings>, RosterSlot, Partial<PlayerRatings>]> = {
    ALABAMA: ['wr-2', { speed: 78, hands: 94 }, 'def-0', { rush: 94 }],
    ARKANSAS: ['rb', { power: 95, speed: 55 }, 'def-1', { tackling: 94, coverage: 38 }],
    AUBURN: ['qb', { speed: 92 }, 'def-0', { speed: 84, rush: 92 }],
    FLORIDA: ['wr-0', { speed: 95, hands: 61 }, 'def-4', { speed: 94, tackling: 45 }],
    GEORGIA: ['line-0', { blocking: 95 }, 'def-5', { tackling: 95, coverage: 72 }],
    KENTUCKY: ['rb', { power: 91, endurance: 95 }, 'def-1', { tackling: 93 }],
    LSU: ['wr-0', { speed: 94, hands: 76 }, 'def-6', { hands: 92, tackling: 58 }],
    MISSISSIPPI_STATE: ['wr-1', { hands: 94 }, 'def-2', { coverage: 82 }],
    MISSOURI: ['rb', { power: 86, speed: 76 }, 'def-1', { tackling: 92 }],
    OKLAHOMA: ['wr-1', { speed: 87, hands: 89 }, 'def-0', { rush: 93 }],
    OLE_MISS: ['rb', { speed: 95, power: 55 }, 'def-4', { speed: 93, coverage: 57 }],
    SOUTH_CAROLINA: ['center', { hands: 89 }, 'def-0', { rush: 95, speed: 82 }],
    TENNESSEE: ['wr-0', { speed: 95, endurance: 83 }, 'def-4', { speed: 93, coverage: 60 }],
    TEXAS: ['center', { hands: 92, blocking: 89 }, 'def-3', { coverage: 93 }],
    TEXAS_AM: ['rb', { power: 94, blocking: 86 }, 'def-0', { power: 93, rush: 90 }],
    VANDERBILT: ['wr-2', { hands: 95, speed: 62 }, 'def-6', { coverage: 95, speed: 78 }]
  };
  const signature = signatures[id];
  if (signature) {
    Object.assign(roster[signature[0]].ratings, signature[1]);
    Object.assign(roster[signature[2]].ratings, signature[3]);
  }
  for (const profile of Object.values(roster)) {
    for (const key of Object.keys(profile.ratings) as (keyof PlayerRatings)[]) {
      profile.ratings[key] = boundedRating(profile.ratings[key]);
    }
  }
  return roster;
}

export function getPlayerSpeedMultiplier(speed: number): number {
  return 0.70 + speed * 0.006;
}

export function applyPlayerProfile(entity: Entity, profile: PlayerProfile): void {
  entity.player = profile;
  entity.archetype = profile.archetype;
  entity.speedMultiplier = getPlayerSpeedMultiplier(profile.ratings.speed);
  entity.endurance = 0.7 + profile.ratings.endurance / 100;
}

export function getPlayerSummary(profile: PlayerProfile): string {
  const r = profile.ratings;
  const specialty = profile.trait === 'BLK' ? `BLK ${r.blocking}` : profile.trait === 'RUSH' ? `RUSH ${r.rush}` :
    profile.trait === 'HIT' ? `HIT ${r.tackling}` : profile.trait === 'COV' ? `COV ${r.coverage}` : `HANDS ${r.hands}`;
  return `#${profile.number} ${profile.label} | SPD ${r.speed} PWR ${r.power} ${specialty}`;
}

export const PLAYER_TRAIT_COLORS: Record<PlayerTrait, string> = {
  SPD: '#67e8f9', PWR: '#fdba74', HANDS: '#fde047', COV: '#c4b5fd',
  HIT: '#fda4af', BLK: '#d1d5db', RUSH: '#fb7185', QB: '#ffffff'
};
