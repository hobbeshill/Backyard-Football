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
    wrSpeed: number;         // Modulates WR sprint speed (0.90 - 1.15)
    passProtection: number;  // Modulates OL block hold time (0.85 - 1.25)
    runPower: number;        // Modulates RB broken tackle chance (0.85 - 1.20)
    dbClosingSpeed: number;  // Modulates DB closing & pursuit speed (0.90 - 1.15)
    passRush: number;        // Modulates pass rush pressure speed (0.85 - 1.25)
    mistakeChance: number;   // Defensive coverage bust tendency (0.80 - 1.30)
  };
}

export const TEAMS: Record<string, TeamProfile> = {
  ARROWS: {
    id: 'ARROWS',
    name: 'Austin Arrows',
    city: 'Austin',
    nickname: 'Arrows',
    primaryColor: '#00ffff',
    secondaryColor: '#003366',
    accentColor: '#00ffcc',
    qbColor: '#ffea00',
    archetype: 'AIR_RAID',
    description: 'High-octane spread passing attack with blazing vertical speed',
    strengths: 'Fastest wide receivers (+14% route speed); explosive deep shots',
    weaknesses: 'Finesse offensive line; vulnerable to all-out zero blitzes',
    ratings: {
      wrSpeed: 1.14,
      passProtection: 0.92,
      runPower: 0.90,
      dbClosingSpeed: 1.02,
      passRush: 0.95,
      mistakeChance: 1.05
    }
  },
  ENFORCERS: {
    id: 'ENFORCERS',
    name: 'Chicago Enforcers',
    city: 'Chicago',
    nickname: 'Enforcers',
    primaryColor: '#ffaa00',
    secondaryColor: '#331a00',
    accentColor: '#ff6600',
    qbColor: '#ffea00',
    archetype: 'GROUND_POUND',
    description: 'Brutal physical football with power running and punishing interior pass rush',
    strengths: 'Bruising running backs (+20% broken tackles); fierce pass rush',
    weaknesses: 'Heavier, slower linebackers; vulnerable to quick crossing routes and slot speed',
    ratings: {
      wrSpeed: 0.94,
      passProtection: 1.12,
      runPower: 1.22,
      dbClosingSpeed: 0.94,
      passRush: 1.22,
      mistakeChance: 1.10
    }
  },
  HORNETS: {
    id: 'HORNETS',
    name: 'Miami Hornets',
    city: 'Miami',
    nickname: 'Hornets',
    primaryColor: '#00ff88',
    secondaryColor: '#002b18',
    accentColor: '#ffff00',
    qbColor: '#ffea00',
    archetype: 'BLITZ_HAWKS',
    description: 'Hyper-aggressive blitz scheme paired with ball-hawking secondary speed',
    strengths: 'Fastest cornerbacks and safeties (+12% closing speed); lethal pass rush',
    weaknesses: 'Over-aggressive defenders prone to biting on double moves and play-action',
    ratings: {
      wrSpeed: 1.04,
      passProtection: 0.95,
      runPower: 0.95,
      dbClosingSpeed: 1.14,
      passRush: 1.16,
      mistakeChance: 1.35
    }
  },
  TITANS: {
    id: 'TITANS',
    name: 'New York Titans',
    city: 'New York',
    nickname: 'Titans',
    primaryColor: '#ff3366',
    secondaryColor: '#330010',
    accentColor: '#ff99aa',
    qbColor: '#ffea00',
    archetype: 'BALANCED_PRO',
    description: 'Disciplined pro-style squad with elite pocket protection and pinpoint timing',
    strengths: 'Impenetrable offensive line (4.5+ second clean pocket); disciplined secondary',
    weaknesses: 'Average foot speed; relies on execution rather than raw breakaway speed',
    ratings: {
      wrSpeed: 1.00,
      passProtection: 1.30,
      runPower: 1.05,
      dbClosingSpeed: 1.00,
      passRush: 1.00,
      mistakeChance: 0.70
    }
  },
  LIGHTNING: {
    id: 'LIGHTNING',
    name: 'Los Angeles Lightning',
    city: 'Los Angeles',
    nickname: 'Lightning',
    primaryColor: '#ffff00',
    secondaryColor: '#001f3f',
    accentColor: '#00d4ff',
    qbColor: '#ffffff',
    archetype: 'AIR_RAID',
    description: 'West coast rhythm offense with laser-precise timing and route breaks',
    strengths: 'Crisp route breaks (+15% cut agility); high-percentage intermediate passes',
    weaknesses: 'Finesse interior front; vulnerable to physical power runs',
    ratings: {
      wrSpeed: 1.10,
      passProtection: 1.10,
      runPower: 0.90,
      dbClosingSpeed: 1.04,
      passRush: 0.92,
      mistakeChance: 0.85
    }
  },
  RENEGADES: {
    id: 'RENEGADES',
    name: 'Pittsburgh Renegades',
    city: 'Pittsburgh',
    nickname: 'Renegades',
    primaryColor: '#ffcc00',
    secondaryColor: '#1a1a1a',
    accentColor: '#ff3300',
    qbColor: '#ffea00',
    archetype: 'GROUND_POUND',
    description: 'Steel curtain defense with bone-crushing hits and relentless blitz pressure',
    strengths: 'Fierce tackling (+25% fumble strip chance); stout run-stopping front',
    weaknesses: 'Slower cornerbacks vulnerable to outside wheel routes and sideline fades',
    ratings: {
      wrSpeed: 0.96,
      passProtection: 1.05,
      runPower: 1.15,
      dbClosingSpeed: 0.96,
      passRush: 1.20,
      mistakeChance: 1.00
    }
  }
};

export const TEAM_KEYS = Object.keys(TEAMS);

export function getTeam(teamId: string): TeamProfile {
  return TEAMS[teamId] || TEAMS.ARROWS;
}

export function getAllTeams(): TeamProfile[] {
  return Object.values(TEAMS);
}
