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
  consistency: number;
  discipline: number;
}

export interface PlayerProfile {
  number: number;
  label: string;
  trait: PlayerTrait;
  archetype: string;
  ratings: PlayerRatings;
}

export type TeamRoster = Record<RosterSlot, PlayerProfile>;

export function getFastestRosterSlot(roster: TeamRoster): RosterSlot {
  return (Object.keys(roster) as RosterSlot[]).reduce((fastest, slot) =>
    roster[slot].ratings.speed > roster[fastest].ratings.speed ? slot : fastest
  );
}

interface RosterTeamRatings {
  wrSpeed: number;
  passProtection: number;
  runPower: number;
  dbClosingSpeed: number;
  passRush: number;
  mistakeChance: number;
  qbConsistency: number;
  penaltyDiscipline: number;
  chemistry: number;
  depth: number;
}

const boundedRating = (rating: number) => Math.max(30, Math.min(95, Math.round(rating)));

function player(
  number: number, label: string, trait: PlayerTrait, archetype: string, ratings: Partial<PlayerRatings>
): PlayerProfile {
  return {
    number, label, trait, archetype,
    ratings: { speed: 65, power: 55, hands: 50, coverage: 40, tackling: 50, blocking: 45, rush: 40, endurance: 75, consistency: 65, discipline: 70, ...ratings }
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
  const depthEndurance = (team.depth - 1) * 38;
  const teamDiscipline = 65 + (team.penaltyDiscipline - 1) * 100;
  const chemistryConsistency = 65 + (team.chemistry - 1) * 80;
  const roster: TeamRoster = {
    qb: player(7, blitzTeam ? 'Mobile quarterback' : 'Pocket quarterback', blitzTeam ? 'SPD' : 'QB', 'QUARTERBACK',
      { speed: blitzTeam ? 86 : powerTeam ? 52 : 65, power: 50, hands: 70, consistency: 70 + (team.qbConsistency - 1) * 100, discipline: teamDiscipline }),
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

  // Distinct starters and depth profiles make each playbook's identity visible on the field.
  const signatures: Record<string, Partial<Record<RosterSlot, Partial<PlayerRatings>>>> = {
    ALABAMA: {
      qb: { consistency: 92, discipline: 91 }, 'wr-0': { speed: 94, hands: 82 }, 'wr-1': { speed: 84, hands: 92 }, 'wr-2': { speed: 78, hands: 94 },
      'line-0': { blocking: 73 }, 'line-1': { blocking: 75 }, 'def-0': { rush: 94 }, 'def-3': { coverage: 94, discipline: 92 }, 'def-6': { coverage: 93, hands: 90 }
    },
    ARKANSAS: {
      qb: { consistency: 60 }, rb: { power: 96, speed: 55 }, 'line-0': { blocking: 84 }, 'line-1': { blocking: 82 },
      'def-0': { rush: 95, power: 86 }, 'def-1': { tackling: 94, coverage: 38 }, 'def-3': { coverage: 57 }, 'def-4': { coverage: 55 }, 'def-6': { coverage: 62 }
    },
    AUBURN: {
      qb: { speed: 92, consistency: 54 }, 'wr-0': { speed: 89 }, rb: { speed: 85 }, 'def-0': { speed: 84, rush: 93 },
      'def-1': { power: 62, endurance: 58 }, 'def-5': { power: 61, endurance: 56 }
    },
    FLORIDA: {
      qb: { consistency: 62 }, rb: { speed: 86, power: 80, endurance: 92 }, 'wr-0': { speed: 95, hands: 61, consistency: 54 },
      'wr-1': { speed: 87, hands: 74, consistency: 62 }, 'def-1': { tackling: 93, power: 89 }, 'def-5': { tackling: 92, power: 90 }, 'def-4': { speed: 94, tackling: 45 }
    },
    GEORGIA: {
      qb: { consistency: 86, discipline: 90 }, 'line-0': { blocking: 96 }, 'line-1': { blocking: 95 }, center: { blocking: 92 },
      'def-0': { rush: 94, power: 91 }, 'def-1': { tackling: 94, coverage: 79 }, 'def-3': { coverage: 92 }, 'def-5': { tackling: 95, coverage: 82 }, 'def-6': { coverage: 91 }
    },
    KENTUCKY: {
      qb: { consistency: 73, discipline: 91 }, rb: { power: 92, endurance: 96, discipline: 92 }, 'wr-0': { speed: 72 },
      'wr-1': { hands: 88, discipline: 90 }, 'def-1': { tackling: 94, discipline: 93 }, 'def-3': { coverage: 88, discipline: 92 }, 'def-6': { coverage: 89, discipline: 94 }
    },
    LSU: {
      qb: { consistency: 77 }, 'wr-0': { speed: 96, hands: 78 }, 'wr-1': { speed: 90, hands: 91 }, 'wr-2': { speed: 86, hands: 89 },
      'def-3': { speed: 89, coverage: 76, discipline: 56 }, 'def-4': { speed: 91, coverage: 72, discipline: 54 }, 'def-6': { hands: 94, coverage: 87, discipline: 65 }
    },
    MISSISSIPPI_STATE: {
      qb: { consistency: 78, hands: 84 }, 'wr-0': { speed: 90 }, 'wr-1': { hands: 96, speed: 84 }, 'wr-2': { hands: 91 },
      'def-0': { power: 59, endurance: 55, rush: 61 }, 'def-1': { power: 63, endurance: 57 }, 'def-5': { power: 61, endurance: 55 }
    },
    MISSOURI: {
      qb: { consistency: 83, discipline: 88 }, 'wr-1': { hands: 94, consistency: 88 }, 'wr-2': { hands: 95, consistency: 87 },
      'def-3': { hands: 91, discipline: 90 }, 'def-6': { hands: 95, coverage: 90, discipline: 92 }, 'def-7': { hands: 88, discipline: 91 },
      'wr-0': { speed: 78 }, 'def-4': { speed: 75 }
    },
    OKLAHOMA: {
      qb: { speed: 88, consistency: 81 }, 'wr-1': { speed: 89, hands: 91 }, 'def-0': { rush: 95, speed: 82 }, 'def-1': { rush: 86 },
      'line-0': { blocking: 68 }, 'line-1': { blocking: 66 }, center: { blocking: 70, power: 72 }
    },
    OLE_MISS: {
      qb: { consistency: 81 }, rb: { speed: 96, power: 55 }, 'wr-0': { speed: 95 }, 'wr-1': { speed: 92 }, 'wr-2': { speed: 89 },
      'def-3': { speed: 85, coverage: 60 }, 'def-4': { speed: 93, coverage: 57 }, 'def-6': { coverage: 66, discipline: 58 }
    },
    SOUTH_CAROLINA: {
      qb: { speed: 90, consistency: 73 }, center: { hands: 90 }, 'def-0': { rush: 96, speed: 84 }, 'def-1': { rush: 87 },
      'line-0': { blocking: 66 }, 'line-1': { blocking: 64 }, 'def-3': { coverage: 79 }
    },
    TENNESSEE: {
      qb: { consistency: 81 }, 'wr-0': { speed: 96, endurance: 86 }, 'wr-1': { speed: 90 }, 'wr-2': { speed: 87 },
      'def-2': { coverage: 58 }, 'def-3': { coverage: 67 }, 'def-4': { speed: 93, coverage: 60 }
    },
    TEXAS: {
      qb: { consistency: 96, hands: 88 }, 'wr-0': { speed: 93, hands: 87 }, 'wr-1': { speed: 91, hands: 94 }, 'wr-2': { speed: 88, hands: 92 },
      'def-0': { rush: 93 }, 'def-3': { coverage: 94 }, 'line-0': { blocking: 91 }
    },
    TEXAS_AM: {
      qb: { consistency: 62 }, rb: { power: 95, blocking: 87 }, 'def-0': { power: 95, rush: 93, endurance: 90 },
      'def-1': { power: 94, tackling: 92, endurance: 92 }, 'def-5': { power: 93, tackling: 90, endurance: 91 }, 'def-3': { speed: 70 }
    },
    VANDERBILT: {
      qb: { consistency: 82, discipline: 95 }, 'wr-2': { hands: 96, speed: 62, consistency: 88 },
      'def-6': { coverage: 96, speed: 78, discipline: 94 }, 'def-3': { coverage: 92, discipline: 93 },
      'wr-0': { speed: 67 }, 'def-0': { speed: 55, rush: 62 }, 'def-1': { endurance: 54 }, 'line-0': { endurance: 57 }
    }
  };
  const signature = signatures[id];
  if (signature) {
    Object.entries(signature).forEach(([slot, ratings]) => {
      Object.assign(roster[slot as RosterSlot].ratings, ratings);
    });
  }
  for (const profile of Object.values(roster)) {
    profile.ratings.endurance += depthEndurance;
    profile.ratings.discipline = profile.ratings.discipline === 70 ? teamDiscipline : profile.ratings.discipline;
    profile.ratings.consistency = profile.ratings.consistency === 65 ? chemistryConsistency : profile.ratings.consistency;
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
  const qbConsistency = profile.archetype === 'QUARTERBACK' ? ` QB ${r.consistency}` : '';
  return `#${profile.number} ${profile.label} | SPD ${r.speed} PWR ${r.power} ${specialty}${qbConsistency} DISC ${r.discipline}`;
}

export const PLAYER_TRAIT_COLORS: Record<PlayerTrait, string> = {
  SPD: '#67e8f9', PWR: '#fdba74', HANDS: '#fde047', COV: '#c4b5fd',
  HIT: '#fda4af', BLK: '#d1d5db', RUSH: '#fb7185', QB: '#ffffff'
};
