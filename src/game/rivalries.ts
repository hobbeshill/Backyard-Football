export interface RivalryGame {
  id: string;
  name: string;
  shortName: string;
  trophy: string;
  tagline: string;
  historicFact: string;
  traditionalWeek: number;
  teams: [string, string];
  icon: string;
  bannerGradient: string;
}

export const SEC_RIVALRIES: RivalryGame[] = [
  {
    id: 'IRON_BOWL',
    name: 'The Iron Bowl',
    shortName: 'Iron Bowl',
    trophy: 'James E. Foy-ODK Sportsmanship Trophy',
    tagline: "College Football's Fiercest In-State War",
    historicFact: 'First played in 1893. The entire state of Alabama divides in half for this legendary gridiron war.',
    traditionalWeek: 9,
    teams: ['ALABAMA', 'AUBURN'],
    icon: '🏆',
    bannerGradient: 'from-[#9E1B32] via-[#5c1320] to-[#0C2340]'
  },
  {
    id: 'LONE_STAR_SHOWDOWN',
    name: 'The Lone Star Showdown',
    shortName: 'Lone Star Showdown',
    trophy: 'Lone Star Trophy',
    tagline: 'State of Texas Supremacy • 118-Year War Reborn in the SEC',
    historicFact: 'First played in 1894. One of the oldest rivalries in college football history, reborn as an SEC conference showdown.',
    traditionalWeek: 9,
    teams: ['TEXAS', 'TEXAS_AM'],
    icon: '⭐',
    bannerGradient: 'from-[#BF5700] via-[#853c00] to-[#500000]'
  },
  {
    id: 'EGG_BOWL',
    name: 'The Golden Egg Bowl',
    shortName: 'Egg Bowl',
    trophy: 'The Golden Egg Trophy',
    tagline: "Mississippi Thanksgiving War • Battle for the Golden Egg",
    historicFact: 'First contested for the Golden Egg trophy in 1927. The Magnolia State battle is one of the most intense, bitter rivalries in the nation.',
    traditionalWeek: 9,
    teams: ['OLE_MISS', 'MISSISSIPPI_STATE'],
    icon: '🥚',
    bannerGradient: 'from-[#CE1126] via-[#14213D] to-[#5D1725]'
  },
  {
    id: 'BATTLE_LINE_RIVALRY',
    name: 'The Battle Line Rivalry',
    shortName: 'Battle Line Rivalry',
    trophy: 'The Battle Line Trophy',
    tagline: 'Ozark Border War for Interstate Bragging Rights',
    historicFact: 'Contested on Thanksgiving weekend between border neighbors Arkansas and Missouri for the silver Battle Line Trophy.',
    traditionalWeek: 9,
    teams: ['ARKANSAS', 'MISSOURI'],
    icon: '⚔️',
    bannerGradient: 'from-[#9D2235] via-[#4d101a] to-[#F1B82D]'
  },
  {
    id: 'BATTLE_OF_TENNESSEE',
    name: 'The Battle of Tennessee',
    shortName: 'In-State Rivalry',
    trophy: 'Tennessee Interstate Trophy',
    tagline: 'Oldest Continuous In-State Rivalry • Rocky Top vs. Nashville',
    historicFact: 'Contested since 1892 across more than 115 meetings between the flagship state university and private Nashville power.',
    traditionalWeek: 9,
    teams: ['TENNESSEE', 'VANDERBILT'],
    icon: '🎸',
    bannerGradient: 'from-[#FF8200] via-[#5c3000] to-[#000000]'
  },
  {
    id: 'COCKTAIL_PARTY',
    name: "World's Largest Outdoor Cocktail Party",
    shortName: 'Cocktail Party',
    trophy: 'The Okefenokee Oar & War Canoe',
    tagline: 'Neutral-Site Jacksonville Classic Across the St. Johns River',
    historicFact: 'Played in Jacksonville, FL almost every year since 1933. The River City hosts 80,000 divided fans for one of sport’s great spectacles.',
    traditionalWeek: 8,
    teams: ['FLORIDA', 'GEORGIA'],
    icon: '🐊',
    bannerGradient: 'from-[#FA4616] via-[#0021A5] to-[#BA0C2F]'
  },
  {
    id: 'THIRD_SATURDAY_IN_OCTOBER',
    name: 'Third Saturday in October',
    shortName: 'Third Saturday in October',
    trophy: 'Tradition of the Victory Cigars',
    tagline: 'Crimson Tide vs. Volunteers • Historic SEC Championship Clashes',
    historicFact: 'A rivalry defined by tradition since 1901. The winning locker room lights traditional victory cigars to celebrate state supremacy.',
    traditionalWeek: 7,
    teams: ['ALABAMA', 'TENNESSEE'],
    icon: '💨',
    bannerGradient: 'from-[#9E1B32] via-[#661020] to-[#FF8200]'
  },
  {
    id: 'DEEP_SOUTH_OLDEST_RIVALRY',
    name: "Deep South's Oldest Rivalry",
    shortName: "Deep South's Oldest Rivalry",
    trophy: 'Deep South Heritage Trophy',
    tagline: '132+ Years of Southern Gridiron Heritage • Since 1892',
    historicFact: 'First played in Atlanta in 1892. Over 125 games played between Athens and the Plains makes this college football royalty.',
    traditionalWeek: 6,
    teams: ['AUBURN', 'GEORGIA'],
    icon: '🏛️',
    bannerGradient: 'from-[#0C2340] via-[#E87722] to-[#BA0C2F]'
  },
  {
    id: 'RED_RIVER_RIVALRY',
    name: 'The Red River Rivalry',
    shortName: 'Red River Rivalry',
    trophy: 'The Golden Hat Trophy',
    tagline: 'Cotton Bowl Showdown at the State Fair of Texas',
    historicFact: 'Split down the 50-yard line in crimson and burnt orange amidst corny dogs and rollercoasters at Dallas Fair Park since 1929.',
    traditionalWeek: 5,
    teams: ['OKLAHOMA', 'TEXAS'],
    icon: '🤠',
    bannerGradient: 'from-[#841617] via-[#5c1011] to-[#BF5700]'
  },
  {
    id: 'MAGNOLIA_BOWL',
    name: 'The Magnolia Bowl',
    shortName: 'Magnolia Bowl',
    trophy: 'The Magnolia Bowl Trophy',
    tagline: 'Bayou Bengals vs. Rebels • High-Scoring Deep South Showdown',
    historicFact: 'Contested since 1894. The Magnolia Bowl trophy was created by the student bodies to celebrate this explosive border rivalry.',
    traditionalWeek: 5,
    teams: ['LSU', 'OLE_MISS'],
    icon: '🌺',
    bannerGradient: 'from-[#461D7C] via-[#CE1126] to-[#FDD023]'
  },
  {
    id: 'SOUTHWEST_CLASSIC',
    name: 'The Southwest Classic',
    shortName: 'Southwest Classic',
    trophy: 'Southwest Classic Trophy',
    tagline: 'Old Southwest Conference Blood Feud at AT&T Stadium',
    historicFact: 'Played at Jerry World in Arlington, Texas. An electric rivalry steeped in decades of fierce Southwest Conference tradition.',
    traditionalWeek: 4,
    teams: ['ARKANSAS', 'TEXAS_AM'],
    icon: '🏟️',
    bannerGradient: 'from-[#9D2235] via-[#4d101a] to-[#500000]'
  },
  {
    id: 'GOLDEN_BOOT',
    name: 'Battle for the Golden Boot',
    shortName: 'Golden Boot',
    trophy: 'The Golden Boot (24-Karat Gold, 175 lbs)',
    tagline: 'The Heaviest Trophy in Sports Shaped Like Arkansas & Louisiana',
    historicFact: 'Forged from 24-karat gold plating and standing four feet tall, the massive Golden Boot represents the border states united.',
    traditionalWeek: 4,
    teams: ['ARKANSAS', 'LSU'],
    icon: '🥾',
    bannerGradient: 'from-[#9D2235] via-[#461D7C] to-[#FDD023]'
  },
  {
    id: 'FLORIDA_TENNESSEE',
    name: 'Florida–Tennessee Rivalry',
    shortName: 'Florida–Tennessee',
    trophy: 'SEC East Heritage Cup',
    tagline: '1990s Blood Feud That Decided National Titles',
    historicFact: 'During the 1990s, the winner of Florida vs. Tennessee represented the SEC in the national championship picture five times.',
    traditionalWeek: 3,
    teams: ['FLORIDA', 'TENNESSEE'],
    icon: '🍊',
    bannerGradient: 'from-[#FA4616] via-[#0021A5] to-[#FF8200]'
  },
  {
    id: 'MAYORS_CUP',
    name: "The Mayor's Cup",
    shortName: "Mayor's Cup",
    trophy: "The Mayor's Cup Trophy",
    tagline: 'Battle of the Columbias • Columbia, MO vs. Columbia, SC',
    historicFact: 'Named for the mutual home city name of both universities. Awarded annually to the winner between the Tigers and Gamecocks.',
    traditionalWeek: 3,
    teams: ['MISSOURI', 'SOUTH_CAROLINA'],
    icon: '🏛️',
    bannerGradient: 'from-[#F1B82D] via-[#333333] to-[#73000A]'
  },
  {
    id: 'TIGER_BOWL',
    name: 'The Tiger Bowl',
    shortName: 'Tiger Bowl',
    trophy: 'SEC Tiger Bowl Plaque',
    tagline: 'Clash of the SEC Tigers • Deaf Valley vs. Jordan-Hare',
    historicFact: 'A matchup legendary for wild finishes: the Earthquake Game, the Barnburner, and the Cigar Game.',
    traditionalWeek: 7,
    teams: ['AUBURN', 'LSU'],
    icon: '🐅',
    bannerGradient: 'from-[#0C2340] via-[#461D7C] to-[#FDD023]'
  },
  {
    id: 'BATTLE_OF_THE_BORDER',
    name: 'Battle of the Border',
    shortName: 'Battle of the Border',
    trophy: 'The Border Barrel Trophy',
    tagline: 'Historic Border Rivalry Contested Since 1893',
    historicFact: 'One of the most frequently played matchups in college football with over 115 meetings between Kentucky and Tennessee.',
    traditionalWeek: 8,
    teams: ['KENTUCKY', 'TENNESSEE'],
    icon: '🏔️',
    bannerGradient: 'from-[#0033A0] via-[#1a4a80] to-[#FF8200]'
  },
  {
    id: 'HORNS_VS_HOGS',
    name: 'Horns vs. Hogs',
    shortName: 'Horns vs. Hogs',
    trophy: 'SWC Heritage Trophy',
    tagline: 'Old Southwest Conference Hatred Renewed in the SEC',
    historicFact: 'A deeply visceral rivalry born in the Southwest Conference featuring the 1969 "Game of the Century".',
    traditionalWeek: 2,
    teams: ['ARKANSAS', 'TEXAS'],
    icon: '🐗',
    bannerGradient: 'from-[#9D2235] via-[#4d101a] to-[#BF5700]'
  },
  {
    id: 'FLORIDA_LSU',
    name: 'Florida–LSU Rivalry',
    shortName: 'Florida–LSU',
    trophy: 'Cross-Division Classic Cup',
    tagline: 'The Swamp vs. Death Valley • Unpredictable SEC Magic',
    historicFact: 'Known for miracle fake field goals, goal-line stands, and high drama every single autumn since 1937.',
    traditionalWeek: 6,
    teams: ['FLORIDA', 'LSU'],
    icon: '🐊',
    bannerGradient: 'from-[#FA4616] via-[#461D7C] to-[#FDD023]'
  }
];

export function getRivalryForMatchup(teamA: string, teamB: string): RivalryGame | null {
  return SEC_RIVALRIES.find(rivalry =>
    (rivalry.teams[0] === teamA && rivalry.teams[1] === teamB) ||
    (rivalry.teams[0] === teamB && rivalry.teams[1] === teamA)
  ) || null;
}
