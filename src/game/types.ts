export type PlayRisk = 'SAFE' | 'BALANCED' | 'EXPLOSIVE';
export type RouteType = 'SHORT' | 'MEDIUM' | 'VERTICAL';
export type DefensiveAssignment = 'BLITZ' | 'MAN' | 'ZONE' | 'QB_SPY' | 'RB_SPY';

export interface PlayOption {
  name: string;
  type: string;
  alignment?: 'SPREAD' | 'STACK' | 'TRIPS';
  left?: string;
  right?: string;
  center?: string;
  rbRoute?: string;
  desc: string;
  risk?: PlayRisk;
  routeType?: RouteType;
  bestVs?: string[];
  weakVs?: string[];
  expectedGain?: [number, number];
}

export interface DefOption {
  name: string;
  desc: string;
  weakness?: string;
  vulnerableRouteType?: RouteType;
}

export interface Entity {
  x: number;
  y: number;
  startX?: number;
  startY?: number;
  vx?: number;
  vy?: number;
  speed?: number;
  speedMultiplier?: number;
  archetype?: string;
  radius: number;
  color?: string;
  boostUsed?: boolean;
  powerBoostTimer?: number;
  tackleImmunity?: number;
  type?: string;
  passRusher?: boolean;
  defenseAssignment?: DefensiveAssignment;
  assignedReceiver?: Entity | null;
  assignedCenter?: Entity;
  zoneX?: number;
  zoneY?: number;
  pursuitTimer?: number;
  routeType?: string;
  routeIndex?: number;
  timer?: number;
  flash?: number;
  caught?: boolean;
  hasBall?: boolean;
  isOutside?: boolean;
  isCenter?: boolean;
  isRB?: boolean;
  side?: 'left' | 'right';
  handoffTimer?: number;
  blitzEscaped?: boolean;
  blockTimer?: number;
  isCutting?: boolean;
  reactionTimer?: number;
  brokenTacklesCount?: number;
  brokenTackleStun?: number;
  isBlocker?: boolean;
  blockingDefender?: Entity | null;
  jukeTimer?: number;
  jukeVx?: number;
  jukeCount?: number;
  jukeCooldownTimer?: number;
  isQbSpy?: boolean;
  isEngagedWithBlocker?: boolean;
  blockEngagedTimer?: number;
  coverageMistake?: 'BIT_UNDERNEATH' | 'STUMBLE' | 'BLOWN_ZONE' | null;
  mistakeTimer?: number;
  mistakeAnnounced?: boolean;
  dropStepTimer?: number;
  isOpenDeep?: boolean;
  speechBubble?: {
    text: string;
    timer: number;
    color?: string;
  };
}

export interface FumbleBall {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  timer: number;
  fumblingTeam: string;
}

export interface Ball {
  startX: number;
  startY: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  maxZ: number;
  flightFrames: number;
  currentFrame: number;
  targetX?: number;
  targetY?: number;
  intendedTarget?: Entity | null;
  isKickoff?: boolean;
  isPunt?: boolean;
}
