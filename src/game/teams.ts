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
  ratings: {
    wrSpeed: number;         // Modulates WR sprint speed
    passProtection: number;  // Modulates OL block hold time
    runPower: number;        // Modulates RB broken tackle chance
    dbClosingSpeed: number;  // Modulates DB closing & pursuit speed
    passRush: number;        // Modulates pass rush pressure speed
    mistakeChance: number;   // Defensive coverage bust tendency
    kicking?: number;        // Special teams leg power & kicking accuracy
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
  for (const ratingKey of Object.keys(ratings) as (keyof TeamProfile['ratings'])[]) {
    const rating = ratings[ratingKey];
    if (rating !== undefined) {
      amplifiedRatings[ratingKey] = Math.max(0.6, Math.min(1.6, Number((1 + (rating - 1) * 2.5).toFixed(3))));
    }
  }
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
    ratings: amplifiedRatings
  };
}

export const TEAMS: Record<string, TeamProfile> = {
  ALABAMA: createTeamProfile('ALABAMA', 'Alabama Crimson Tide', 'Tuscaloosa', 'Crimson Tide', '#9E1B32', '#FFFFFF', 'BALANCED_PRO', 'A versatile roster built to pressure the pocket and attack through the air.', 'Defensive front depth; receiver speed and pass rush.', 'Quick rhythm passing can stress the defense when the rush does not get home.', { wrSpeed: 1.08, passProtection: 1.04, runPower: 1.03, dbClosingSpeed: 1.08, passRush: 1.12, mistakeChance: 0.92 }),
  ARKANSAS: createTeamProfile('ARKANSAS', 'Arkansas Razorbacks', 'Fayetteville', 'Razorbacks', '#9D2235', '#FFFFFF', 'GROUND_POUND', 'A physical identity centered on downhill runs and contact at the line.', 'Power running and sturdy pass protection.', 'Can be stretched by fast receivers and quick perimeter play.', { wrSpeed: 0.97, passProtection: 1.07, runPower: 1.15, dbClosingSpeed: 0.98, passRush: 1.02, mistakeChance: 1.02 }),
  AUBURN: createTeamProfile('AUBURN', 'Auburn Tigers', 'Auburn', 'Tigers', '#0C2340', '#E87722', 'BLITZ_HAWKS', 'An aggressive, athletic team that looks to create disruption on both sides.', 'Edge pressure and mobile playmakers.', 'High-risk pressure can leave space behind the coverage.', { wrSpeed: 1.06, passProtection: 0.96, runPower: 1.04, dbClosingSpeed: 1.08, passRush: 1.13, mistakeChance: 1.09 }),
  FLORIDA: createTeamProfile('FLORIDA', 'Florida Gators', 'Gainesville', 'Gators', '#FA4616', '#0021A5', 'AIR_RAID', 'A speed-first spread attack built to create space for its receivers.', 'Receiver speed and quick throws to the perimeter.', 'The offense can struggle to sustain drives when protection breaks down.', { wrSpeed: 1.12, passProtection: 0.95, runPower: 0.94, dbClosingSpeed: 1.02, passRush: 0.98, mistakeChance: 1.07 }),
  GEORGIA: createTeamProfile('GEORGIA', 'Georgia Bulldogs', 'Athens', 'Bulldogs', '#BA0C2F', '#000000', 'BALANCED_PRO', 'A balanced, physical team with strength in the trenches and a disciplined defense.', 'Pass protection, defensive line strength, and coverage discipline.', 'Can be challenged by tempo and explosive outside speed.', { wrSpeed: 1.02, passProtection: 1.14, runPower: 1.10, dbClosingSpeed: 1.08, passRush: 1.15, mistakeChance: 0.86 }),
  KENTUCKY: createTeamProfile('KENTUCKY', 'Kentucky Wildcats', 'Lexington', 'Wildcats', '#0033A0', '#FFFFFF', 'GROUND_POUND', 'A defense-and-run oriented profile that favors controlled, physical drives.', 'Pass protection and a dependable power run game.', 'Less explosive receiver speed can make long passing plays harder to create.', { wrSpeed: 0.95, passProtection: 1.08, runPower: 1.10, dbClosingSpeed: 1.03, passRush: 1.04, mistakeChance: 0.98 }),
  LSU: createTeamProfile('LSU', 'LSU Tigers', 'Baton Rouge', 'Tigers', '#461D7C', '#FDD023', 'AIR_RAID', 'A pass-first profile with explosive skill players and a willingness to attack deep.', 'Vertical receiver speed and explosive passing.', 'Aggressive throws can expose the team to pressure and coverage mistakes.', { wrSpeed: 1.13, passProtection: 1.00, runPower: 0.98, dbClosingSpeed: 1.00, passRush: 1.02, mistakeChance: 1.08 }),
  MISSISSIPPI_STATE: createTeamProfile('MISSISSIPPI_STATE', 'Mississippi State Bulldogs', 'Starkville', 'Bulldogs', '#5D1725', '#FFFFFF', 'AIR_RAID', 'A spread passing profile that uses pace and spacing to open the field.', 'Quick passing and adaptable offensive spacing.', 'The passing game can lose efficiency under sustained defensive pressure.', { wrSpeed: 1.06, passProtection: 0.97, runPower: 0.97, dbClosingSpeed: 0.99, passRush: 1.00, mistakeChance: 1.08 }),
  MISSOURI: createTeamProfile('MISSOURI', 'Missouri Tigers', 'Columbia', 'Tigers', '#F1B82D', '#000000', 'BALANCED_PRO', 'A flexible team profile that mixes efficient passing with a physical run game.', 'Offensive balance and reliable run support.', 'Can give up explosive plays when its pass rush is contained.', { wrSpeed: 1.04, passProtection: 1.04, runPower: 1.08, dbClosingSpeed: 1.01, passRush: 1.02, mistakeChance: 0.96 }),
  OKLAHOMA: createTeamProfile('OKLAHOMA', 'Oklahoma Sooners', 'Norman', 'Sooners', '#841617', '#FDF9D8', 'AIR_RAID', 'A spread offense paired with a defense that looks to attack up front.', 'Receiver speed and disruptive pass rush.', 'A fast, aggressive style can leave the secondary exposed on long plays.', { wrSpeed: 1.10, passProtection: 0.97, runPower: 1.00, dbClosingSpeed: 1.01, passRush: 1.10, mistakeChance: 1.07 }),
  OLE_MISS: createTeamProfile('OLE_MISS', 'Ole Miss Rebels', 'Oxford', 'Rebels', '#CE1126', '#14213D', 'AIR_RAID', 'An up-tempo spread profile that creates chances with speed and space.', 'Explosive receiver speed and quick offensive tempo.', 'A speed-focused approach can be vulnerable to physical pressure and power runs.', { wrSpeed: 1.14, passProtection: 1.01, runPower: 1.00, dbClosingSpeed: 0.97, passRush: 1.00, mistakeChance: 1.06 }),
  SOUTH_CAROLINA: createTeamProfile('SOUTH_CAROLINA', 'South Carolina Gamecocks', 'Columbia', 'Gamecocks', '#73000A', '#000000', 'BLITZ_HAWKS', 'A defense-first profile that tries to hurry the quarterback and disrupt timing.', 'Pass rush and aggressive defensive pursuit.', 'Pressure packages can leave openings, while the offense relies on execution.', { wrSpeed: 1.00, passProtection: 0.97, runPower: 1.00, dbClosingSpeed: 1.06, passRush: 1.14, mistakeChance: 1.05 }),
  TENNESSEE: createTeamProfile('TENNESSEE', 'Tennessee Volunteers', 'Knoxville', 'Volunteers', '#FF8200', '#FFFFFF', 'AIR_RAID', 'A high-tempo spread profile that attacks vertically and uses receiver speed.', 'Fast receivers and explosive downfield passing.', 'Tempo can invite mistakes and leave the defense on the field for long stretches.', { wrSpeed: 1.13, passProtection: 0.99, runPower: 1.04, dbClosingSpeed: 0.99, passRush: 1.03, mistakeChance: 1.06 }),
  TEXAS: createTeamProfile('TEXAS', 'Texas Longhorns', 'Austin', 'Longhorns', '#BF5700', '#FFFFFF', 'BALANCED_PRO', 'A balanced profile with strong line play and playmakers across the offense.', 'Pass protection, receiving options, and overall balance.', 'Can be pushed into mistakes by sustained pressure and tight coverage.', { wrSpeed: 1.08, passProtection: 1.12, runPower: 1.06, dbClosingSpeed: 1.04, passRush: 1.06, mistakeChance: 0.94 }),
  TEXAS_AM: createTeamProfile('TEXAS_AM', 'Texas A&M Aggies', 'College Station', 'Aggies', '#500000', '#FFFFFF', 'GROUND_POUND', 'A physical profile built around line play, power running, and a forceful front.', 'Run power and interior pass rush.', 'A slower perimeter game can struggle to separate against fast coverage.', { wrSpeed: 0.99, passProtection: 1.06, runPower: 1.15, dbClosingSpeed: 1.02, passRush: 1.14, mistakeChance: 1.00 }),
  VANDERBILT: createTeamProfile('VANDERBILT', 'Vanderbilt Commodores', 'Nashville', 'Commodores', '#000000', '#CFAE70', 'BALANCED_PRO', 'A disciplined profile that relies on sound coverage and efficient execution.', 'Coverage discipline and balanced play selection.', 'Less raw receiver speed and pass-rush pressure than the most explosive profiles.', { wrSpeed: 0.97, passProtection: 1.00, runPower: 1.00, dbClosingSpeed: 1.05, passRush: 0.94, mistakeChance: 0.88 })
};

export const TEAM_KEYS = Object.keys(TEAMS);

export function getTeam(teamId: string): TeamProfile {
  return TEAMS[teamId] || TEAMS.ALABAMA;
}

export function getAllTeams(): TeamProfile[] {
  return Object.values(TEAMS);
}
