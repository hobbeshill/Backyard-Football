import type { DefenseLandmark } from './signaturePlays';

export type PlayRisk = 'SAFE' | 'BALANCED' | 'EXPLOSIVE';
export type RouteType = 'SHORT' | 'MEDIUM' | 'VERTICAL';
export type DefensiveAssignment = 'BLITZ' | 'MAN' | 'ZONE' | 'QB_SPY' | 'RB_SPY' | 'USER';
export type TacticalMode = 'ELITE' | 'PRO';

export interface PlayOption {
  name: string;
  type: string;
  alignment?: 'SPREAD' | 'STACK' | 'TRIPS';
  left?: string;
  right?: string;
  slot?: string;
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
  landmarks?: DefenseLandmark[];
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
  stamina?: number;
  endurance?: number;
  rosterKey?: string;
  targetedThisPlay?: boolean;
  archetype?: string;
  player?: PlayerProfile;
  radius: number;
  color?: string;
  boostUsed?: boolean;
  powerBoostTimer?: number;
  tackleImmunity?: number;
  contactSlowTimer?: number;
  diveCooldownTimer?: number;
  type?: string;
  passRusher?: boolean;
  defenseAssignment?: DefensiveAssignment;
  assignedReceiver?: Entity | null;
  coverageLeverage?: 'INSIDE' | 'OUTSIDE';
  assignedCenter?: Entity;
  zoneX?: number;
  zoneY?: number;
  pursuitTimer?: number;
  routeType?: string;
  routeIndex?: number;
  routeWaypoint?: number;
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
  isKicker?: boolean;
  isPunter?: boolean;
  isHolder?: boolean;
  isReturner?: boolean;
  team?: 'P1' | 'P2';
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
  isFieldGoal?: boolean;
  fgDistance?: number;
  fgArrivalZ?: number;
  fgIsGood?: boolean;
  fgMissReason?: 'WIDE_LEFT' | 'WIDE_RIGHT' | 'SHORT' | 'UPRIGHT_DOINK';
  kickingTeam?: 'P1' | 'P2';
  receivingTeam?: 'P1' | 'P2';
  kickPower?: number;
}
import type { PlayerProfile } from './roster';
