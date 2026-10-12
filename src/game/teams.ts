import { createTeamRoster, type TeamRoster } from './roster';

export interface TeamProfile {
  id: string;
  name: string;
  city: string;
  nickname: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  qbColor: string;
  archetype: 'AIR_RAID' | 'GROUND_POUND' | 'BLITZ_HAWKS' | 'BALANCED_PRO';
  description: string;
  strengths: string;
  weaknesses: string;
  overallRating: number;
  roster: TeamRoster;
  ratings: {
    wrSpeed: number;         // Shapes receiver roster speed
    passProtection: number;  // Shapes individual blocking ratings
    runPower: number;        // Shapes RB power, not speed
    dbClosingSpeed: number;  // Shapes defensive roster speed
    passRush: number;        // Shapes individual rush ratings
    mistakeChance: number;   // Coverage discipline and bust tendency
    kicking?: number;        // Special teams leg power & kicking accuracy
    qbConsistency: number;
    penaltyDiscipline: number;
    chemistry: number;
    depth: number;
    tempo: number;
    homeField: number;
    turnoverSecurity: number;
    redZoneEfficiency: number;
    earlyGameFocus?: number;
    trailingComposure?: number;
  };
}

function createTeamProfile(
  id: string,
  name: string,
  city: string,
  nickname: string,
  primaryColor: string,
  secondaryColor: string,
  archetype: TeamProfile['archetype'],
  description: string,
  strengths: string,
  weaknesses: string,
  ratings: TeamProfile['ratings']
): TeamProfile {
  const amplifiedRatings = { ...ratings };
  const amplifiedKeys: Array<keyof TeamProfile['ratings']> = [
    'wrSpeed', 'passProtection', 'runPower', 'dbClosingSpeed', 'passRush', 'mistakeChance', 'kicking'
  ];
  for (const ratingKey of amplifiedKeys) {
    const rating = ratings[ratingKey];
    if (rating !== undefined) {
      amplifiedRatings[ratingKey] = Math.max(0.5, Math.min(1.7, Number((1 + (rating - 1) * 3.5).toFixed(3))));
    }
  }
  const roster = createTeamRoster(id, archetype, amplifiedRatings);
  const ratingKeys = ['speed', 'power', 'hands', 'coverage', 'tackling', 'blocking', 'rush', 'endurance'] as const;
  const overallRating = Math.round(Object.values(roster).reduce((teamTotal, player) =>
    teamTotal + ratingKeys.reduce((playerTotal, ratingKey) => playerTotal + player.ratings[ratingKey], 0) / ratingKeys.length
  , 0) / Object.keys(roster).length);

  return {
    id,
    name,
    city,
    nickname,
    primaryColor,
    secondaryColor,
    accentColor: secondaryColor,
    qbColor: '#ffffff',
    archetype,
    description,
    strengths,
    weaknesses,
    overallRating,
    roster,
    ratings: amplifiedRatings
  };
}

export const TEAMS: Record<string, TeamProfile> = {
  ALABAMA: createTeamProfile('ALABAMA', 'Alabama Crimson Tide', 'Tuscaloosa', 'Crimson Tide', '#9E1B32', '#FFFFFF', 'BALANCED_PRO', 'Elite roster depth, explosive perimeter threats, and a disciplined secondary.', 'Deep blue-chip roster, fast receivers, high-IQ defensive backs.', 'Pass protection can crack against heavy blitz pressure.', { wrSpeed: 1.13, passProtection: 0.98, runPower: 1.03, dbClosingSpeed: 1.10, passRush: 1.08, mistakeChance: 0.87, qbConsistency: 1.14, penaltyDiscipline: 1.10, chemistry: 1.09, depth: 1.20, tempo: 1.02, homeField: 1.12, turnoverSecurity: 1.07, redZoneEfficiency: 1.04 }),
  ARKANSAS: createTeamProfile('ARKANSAS', 'Arkansas Razorbacks', 'Fayetteville', 'Razorbacks', '#9D2235', '#FFFFFF', 'GROUND_POUND', 'A downhill run team with disruptive edge rushers and a vulnerable secondary.', 'Power back, physical front, high-effort edge pressure.', 'Limited defensive-back depth gives up vertical explosives.', { wrSpeed: 0.96, passProtection: 1.00, runPower: 1.20, dbClosingSpeed: 0.88, passRush: 1.16, mistakeChance: 1.16, qbConsistency: 0.90, penaltyDiscipline: 0.89, chemistry: 0.94, depth: 0.92, tempo: 0.96, homeField: 1.06, turnoverSecurity: 0.91, redZoneEfficiency: 0.95 }),
  AUBURN: createTeamProfile('AUBURN', 'Auburn Tigers', 'Auburn', 'Tigers', '#0C2340', '#E87722', 'BLITZ_HAWKS', 'A balanced, fast attack with strong special teams and a major home-field boost.', 'High-tempo playbook, mobile playmakers, and kicking units.', 'Quarterback consistency swings; defensive-interior depth drops sharply.', { wrSpeed: 1.05, passProtection: 0.95, runPower: 1.06, dbClosingSpeed: 1.00, passRush: 1.10, mistakeChance: 1.09, kicking: 1.13, qbConsistency: 0.83, penaltyDiscipline: 0.91, chemistry: 0.94, depth: 0.88, tempo: 1.18, homeField: 1.23, turnoverSecurity: 0.92, redZoneEfficiency: 0.90 }),
  FLORIDA: createTeamProfile('FLORIDA', 'Florida Gators', 'Gainesville', 'Gators', '#FA4616', '#0021A5', 'AIR_RAID', 'A speed attack backed by a deep running-back room and hard-hitting linebackers.', 'Multiple change-of-pace backs, aggressive linebackers, perimeter speed.', 'Penalty-prone and unreliable receiver hands in high-pressure moments.', { wrSpeed: 1.11, passProtection: 0.92, runPower: 1.09, dbClosingSpeed: 1.02, passRush: 0.98, mistakeChance: 1.22, qbConsistency: 0.88, penaltyDiscipline: 0.75, chemistry: 0.94, depth: 1.02, tempo: 1.10, homeField: 1.10, turnoverSecurity: 0.87, redZoneEfficiency: 0.88 }),
  GEORGIA: createTeamProfile('GEORGIA', 'Georgia Bulldogs', 'Athens', 'Bulldogs', '#BA0C2F', '#000000', 'BALANCED_PRO', 'Blue-chip talent at every level, elite trench play, and a suffocating front seven.', 'Top-tier offensive line, deep defensive front, disciplined coverage.', 'Can start flat against lower-rated trap opponents.', { wrSpeed: 1.03, passProtection: 1.18, runPower: 1.12, dbClosingSpeed: 1.15, passRush: 1.17, mistakeChance: 0.82, qbConsistency: 1.12, penaltyDiscipline: 1.14, chemistry: 1.13, depth: 1.20, tempo: 0.94, homeField: 1.15, turnoverSecurity: 1.15, redZoneEfficiency: 1.12, earlyGameFocus: 0.82 }),
  KENTUCKY: createTeamProfile('KENTUCKY', 'Kentucky Wildcats', 'Lexington', 'Wildcats', '#0033A0', '#FFFFFF', 'GROUND_POUND', 'A disciplined, clock-controlling run team with a sound defense.', 'Low penalties, tough interior runs, reliable tackling.', 'Limited receiver speed makes scoring trades difficult in shootouts.', { wrSpeed: 0.91, passProtection: 1.08, runPower: 1.15, dbClosingSpeed: 1.08, passRush: 1.05, mistakeChance: 0.86, qbConsistency: 0.95, penaltyDiscipline: 1.24, chemistry: 1.08, depth: 1.01, tempo: 0.84, homeField: 1.05, turnoverSecurity: 1.17, redZoneEfficiency: 1.05 }),
  LSU: createTeamProfile('LSU', 'LSU Tigers', 'Baton Rouge', 'Tigers', '#461D7C', '#FDD023', 'AIR_RAID', 'An electric receiver factory with game-breaking skill players.', 'Elite wideouts, vertical speed, dangerous yards after catch.', 'Aggressive defensive backs gamble and lose assignments.', { wrSpeed: 1.19, passProtection: 0.98, runPower: 0.98, dbClosingSpeed: 0.92, passRush: 1.05, mistakeChance: 1.18, qbConsistency: 1.04, penaltyDiscipline: 0.90, chemistry: 1.02, depth: 1.02, tempo: 1.08, homeField: 1.12, turnoverSecurity: 0.89, redZoneEfficiency: 1.05 }),
  MISSISSIPPI_STATE: createTeamProfile('MISSISSIPPI_STATE', 'Mississippi State Bulldogs', 'Starkville', 'Bulldogs', '#5D1725', '#FFFFFF', 'AIR_RAID', 'A high-velocity spread offense built for quick strikes.', 'Fast slot passing, crossing concepts, rapid scoring potential.', 'An undersized defensive line tires against heavy run blocking.', { wrSpeed: 1.10, passProtection: 0.96, runPower: 0.92, dbClosingSpeed: 0.94, passRush: 0.89, mistakeChance: 1.08, qbConsistency: 1.00, penaltyDiscipline: 0.92, chemistry: 1.04, depth: 0.82, tempo: 1.20, homeField: 1.00, turnoverSecurity: 0.90, redZoneEfficiency: 1.08 }),
  MISSOURI: createTeamProfile('MISSOURI', 'Missouri Tigers', 'Columbia', 'Tigers', '#F1B82D', '#000000', 'BALANCED_PRO', 'A high-chemistry team with precise timing and opportunistic coverage.', 'Reliable routes, coordinated offense, ball-hawking secondary.', 'Team speed trails the conference elite.', { wrSpeed: 0.97, passProtection: 1.05, runPower: 1.05, dbClosingSpeed: 1.04, passRush: 1.04, mistakeChance: 0.90, qbConsistency: 1.05, penaltyDiscipline: 1.12, chemistry: 1.20, depth: 1.10, tempo: 0.93, homeField: 1.10, turnoverSecurity: 1.17, redZoneEfficiency: 1.06 }),
  OKLAHOMA: createTeamProfile('OKLAHOMA', 'Oklahoma Sooners', 'Norman', 'Sooners', '#841617', '#FDF9D8', 'AIR_RAID', 'A fast, multi-threat offense paired with an aggressive blitz front.', 'Mobile quarterback, attacking front, explosive spread calls.', 'Offensive tackles struggle against elite interior pass rush.', { wrSpeed: 1.09, passProtection: 0.88, runPower: 1.03, dbClosingSpeed: 1.02, passRush: 1.16, mistakeChance: 1.08, qbConsistency: 1.11, penaltyDiscipline: 0.92, chemistry: 1.03, depth: 1.06, tempo: 1.12, homeField: 1.08, turnoverSecurity: 0.90, redZoneEfficiency: 1.00 }),
  OLE_MISS: createTeamProfile('OLE_MISS', 'Ole Miss Rebels', 'Oxford', 'Rebels', '#CE1126', '#14213D', 'AIR_RAID', 'A high-octane spread attack that piles up yards at speed.', 'Explosive tempo, space backs, fast perimeter routes.', 'The bend-but-break defense concedes passing yards under pressure.', { wrSpeed: 1.18, passProtection: 1.01, runPower: 1.03, dbClosingSpeed: 0.87, passRush: 0.94, mistakeChance: 1.17, qbConsistency: 1.06, penaltyDiscipline: 0.90, chemistry: 0.99, depth: 0.91, tempo: 1.24, homeField: 1.10, turnoverSecurity: 0.92, redZoneEfficiency: 1.04 }),
  SOUTH_CAROLINA: createTeamProfile('SOUTH_CAROLINA', 'South Carolina Gamecocks', 'Columbia', 'Gamecocks', '#73000A', '#000000', 'BLITZ_HAWKS', 'A dual-threat quarterback and explosive special-teams unit lead an aggressive roster.', 'Mobile QB, edge pressure, strong kicking and return game.', 'Inconsistent offensive-line protection allows sacks.', { wrSpeed: 1.01, passProtection: 0.90, runPower: 1.01, dbClosingSpeed: 1.07, passRush: 1.18, mistakeChance: 1.10, kicking: 1.15, qbConsistency: 1.02, penaltyDiscipline: 0.88, chemistry: 0.94, depth: 0.88, tempo: 1.03, homeField: 1.18, turnoverSecurity: 0.90, redZoneEfficiency: 0.92 }),
  TENNESSEE: createTeamProfile('TENNESSEE', 'Tennessee Volunteers', 'Knoxville', 'Volunteers', '#FF8200', '#FFFFFF', 'AIR_RAID', 'A blistering tempo offense with a fearless vertical passing attack.', 'Deep-ball speed, rapid snaps, perimeter explosiveness.', 'Wide defensive spacing leaves intermediate zones exposed.', { wrSpeed: 1.17, passProtection: 0.98, runPower: 1.02, dbClosingSpeed: 0.90, passRush: 1.03, mistakeChance: 1.12, qbConsistency: 1.05, penaltyDiscipline: 0.90, chemistry: 1.03, depth: 1.02, tempo: 1.28, homeField: 1.13, turnoverSecurity: 0.92, redZoneEfficiency: 1.02 }),
  TEXAS: createTeamProfile('TEXAS', 'Texas Longhorns', 'Austin', 'Longhorns', '#BF5700', '#FFFFFF', 'BALANCED_PRO', 'Elite quarterback play, deep receivers, and a powerful pass rush.', 'Top-end QB consistency, five-star receiver room, pressure up front.', 'A slow start can amplify pressure and momentum swings.', { wrSpeed: 1.14, passProtection: 1.10, runPower: 1.06, dbClosingSpeed: 1.06, passRush: 1.14, mistakeChance: 0.91, qbConsistency: 1.20, penaltyDiscipline: 1.05, chemistry: 1.10, depth: 1.13, tempo: 1.00, homeField: 1.17, turnoverSecurity: 1.05, redZoneEfficiency: 1.11, trailingComposure: 0.80 }),
  TEXAS_AM: createTeamProfile('TEXAS_AM', 'Texas A&M Aggies', 'College Station', 'Aggies', '#500000', '#FFFFFF', 'GROUND_POUND', 'A deep, imposing defensive front backed by a hostile home stadium.', 'Defensive-line power, rotation depth, and home-field pressure.', 'Offensive drives stall; red-zone conversion is inconsistent.', { wrSpeed: 0.97, passProtection: 1.05, runPower: 1.15, dbClosingSpeed: 1.05, passRush: 1.20, mistakeChance: 1.00, qbConsistency: 0.91, penaltyDiscipline: 0.94, chemistry: 0.95, depth: 1.19, tempo: 0.88, homeField: 1.24, turnoverSecurity: 0.96, redZoneEfficiency: 0.82 }),
  VANDERBILT: createTeamProfile('VANDERBILT', 'Vanderbilt Commodores', 'Nashville', 'Commodores', '#000000', '#CFAE70', 'BALANCED_PRO', 'A smart situational team that protects the football and executes play action.', 'High awareness, low turnovers, precise play-action, disciplined play.', 'Lower raw athleticism and shallow depth make injuries costly.', { wrSpeed: 0.90, passProtection: 0.98, runPower: 0.98, dbClosingSpeed: 1.10, passRush: 0.88, mistakeChance: 0.84, qbConsistency: 1.07, penaltyDiscipline: 1.18, chemistry: 1.10, depth: 0.74, tempo: 0.82, homeField: 0.98, turnoverSecurity: 1.22, redZoneEfficiency: 0.98 })
};

export const TEAM_KEYS = Object.keys(TEAMS);

export function getTeam(teamId: string): TeamProfile {
  return TEAMS[teamId] || TEAMS.ALABAMA;
}

export function getAllTeams(): TeamProfile[] {
  return Object.values(TEAMS);
}
