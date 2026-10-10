import type { PlayOption, RouteType } from './types';
import type { TeamProfile } from './teams';

export interface TecmoPlayOption extends PlayOption {
  id: string;
  name: string;
  teamId: string;
  isRun: boolean;
  category: 'PASS' | 'RUN';
  playSlot: 'PASS_1' | 'PASS_2' | 'PASS_3' | 'PASS_4' | 'RUN_1' | 'RUN_2';
  alignment: 'SPREAD' | 'STACK' | 'TRIPS';
  left: string;
  right: string;
  center: string;
  slot: string;
  rbRoute: string;
  desc: string;
  risk: 'SAFE' | 'BALANCED' | 'EXPLOSIVE';
  routeType: 'SHORT' | 'MEDIUM' | 'VERTICAL';
  expectedGain: [number, number];
}

export type TecmoMatchupLevel = 'EXACT' | 'CATEGORY_MATCH' | 'MISMATCH_BIT_ON_RUN' | 'MISMATCH_DROPPED_IN_COVERAGE';

export interface TecmoMatchupResult {
  level: TecmoMatchupLevel;
  isExact: boolean;
  offenseIsRun: boolean;
  defenseIsRun: boolean;
  announcement: string;
  rusherSpeedMultiplier: number;
  blockShedFrames: number;
  dbClosingSpeedMultiplier: number;
  coverageTension: number; // 0 (loose/wide open) to 2 (blanket/lockdown)
  runLaneSpacing: number; // 0.5 (constricted) to 1.8 (massive daylight)
  pocketHoldMultiplier: number; // 0.2 (instant collapse) to 1.6 (brick wall)
  freezeDefenseFrames: number; // for play-action bite
}

function passPlay(
  id: string,
  teamId: string,
  name: string,
  playSlot: 'PASS_1' | 'PASS_2' | 'PASS_3' | 'PASS_4',
  alignment: 'SPREAD' | 'STACK' | 'TRIPS',
  routes: [string, string, string, string],
  desc: string,
  depth: 'SHORT' | 'MEDIUM' | 'VERTICAL' = 'MEDIUM',
  risk: 'SAFE' | 'BALANCED' | 'EXPLOSIVE' = 'BALANCED',
  expectedGain: [number, number] = [8, 18]
): TecmoPlayOption {
  return {
    id,
    teamId,
    name,
    type: 'PASS',
    isRun: false,
    category: 'PASS',
    playSlot,
    alignment,
    left: routes[0],
    right: routes[1],
    center: routes[2],
    slot: routes[3],
    rbRoute: 'FLAT',
    desc,
    risk,
    routeType: depth,
    expectedGain
  };
}

function runPlay(
  id: string,
  teamId: string,
  name: string,
  playSlot: 'RUN_1' | 'RUN_2',
  runType: 'ISO' | 'POWER' | 'SWEEP',
  alignment: 'SPREAD' | 'STACK' | 'TRIPS',
  routes: [string, string, string, string],
  desc: string,
  expectedGain: [number, number] = [4, 12]
): TecmoPlayOption {
  return {
    id,
    teamId,
    name,
    type: runType,
    isRun: true,
    category: 'RUN',
    playSlot,
    alignment,
    left: routes[0],
    right: routes[1],
    center: routes[2],
    slot: routes[3],
    rbRoute: 'FLAT',
    desc,
    risk: 'BALANCED',
    routeType: 'MEDIUM',
    expectedGain
  };
}

export const SEC_TEAM_TECMO_PLAYS: Record<string, [
  TecmoPlayOption, TecmoPlayOption, TecmoPlayOption, TecmoPlayOption,
  TecmoPlayOption, TecmoPlayOption
]> = {
  ALABAMA: [
    passPlay('BAMA_P1', 'ALABAMA', 'Crimson Slants', 'PASS_1', 'SPREAD', ['SLANT-R', 'SLANT-L', 'COMEBACK', 'HITCH'], 'Quick rhythm inside slants with an outside comeback.', 'SHORT', 'SAFE', [6, 14]),
    passPlay('BAMA_P2', 'ALABAMA', 'Tide 4-Verts', 'PASS_2', 'SPREAD', ['GO', 'GO', 'POST-R', 'GO'], 'All four receivers push 30+ yards downfield to stress the secondary.', 'VERTICAL', 'EXPLOSIVE', [18, 35]),
    passPlay('BAMA_P3', 'ALABAMA', 'Crimson Mills', 'PASS_3', 'STACK', ['POST-R', 'COMEBACK', 'CROSS-L', 'HITCH'], 'Protected post over a tight-end crossing dig.', 'VERTICAL', 'BALANCED', [12, 24]),
    passPlay('BAMA_P4', 'ALABAMA', 'Tide Mesh Concept', 'PASS_4', 'SPREAD', ['CROSS-R', 'CROSS-L', 'COMEBACK', 'HITCH'], 'Overlapping crossing routes picking underneath linebackers.', 'MEDIUM', 'SAFE', [8, 16]),
    runPlay('BAMA_R1', 'ALABAMA', 'Tuscaloosa Lead', 'RUN_1', 'POWER', 'STACK', ['BLOCK', 'GO', 'BLOCK', 'BLOCK'], 'Physical downhill power behind a 3-blocker wedge off tackle.', [4, 11]),
    runPlay('BAMA_R2', 'ALABAMA', 'Crimson Sweep', 'RUN_2', 'SWEEP', 'TRIPS', ['GO', 'GO', 'BLOCK', 'BLOCK'], 'Speed sweep racing toward the perimeter boundary.', [5, 15])
  ],
  ARKANSAS: [
    passPlay('ARK_P1', 'ARKANSAS', 'Ozark Stick', 'PASS_1', 'STACK', ['COMEBACK', 'SLANT-L', 'HITCH', 'CROSS-R'], 'Tight-end stick route on the numbers with safe checkdowns.', 'SHORT', 'SAFE', [5, 12]),
    passPlay('ARK_P2', 'ARKANSAS', 'Razorback Cross', 'PASS_2', 'SPREAD', ['CROSS-R', 'CROSS-L', 'GO', 'HITCH'], 'Dual crossers creating natural picks against man coverage.', 'MEDIUM', 'BALANCED', [8, 16]),
    passPlay('ARK_P3', 'ARKANSAS', 'Fayetteville Sail', 'PASS_3', 'TRIPS', ['FLAG-L', 'FLAG-R', 'HITCH', 'COMEBACK'], 'High-low sideline sail combination stressing zone coverage.', 'MEDIUM', 'BALANCED', [10, 20]),
    passPlay('ARK_P4', 'ARKANSAS', 'Hog Deep Post', 'PASS_4', 'SPREAD', ['POST-L', 'POST-R', 'COMEBACK', 'GO'], 'Twin post routes attacking the deep hashmarks.', 'VERTICAL', 'EXPLOSIVE', [16, 32]),
    runPlay('ARK_R1', 'ARKANSAS', 'Hog Double Lead', 'RUN_1', 'POWER', 'STACK', ['GO', 'BLOCK', 'BLOCK', 'BLOCK'], 'Power plunge behind multiple lead blockers.', [5, 12]),
    runPlay('ARK_R2', 'ARKANSAS', 'Pig Trail ISO', 'RUN_2', 'ISO', 'SPREAD', ['GO', 'GO', 'BLOCK', 'BLOCK'], 'Direct A-gap isolation blast right up the center.', [4, 10])
  ],
  AUBURN: [
    passPlay('AUB_P1', 'AUBURN', 'War Eagle Flood', 'PASS_1', 'TRIPS', ['GO', 'FLAG-R', 'CROSS-R', 'HITCH'], 'Three-level sideline flood rolling to the trips side.', 'MEDIUM', 'BALANCED', [10, 22]),
    passPlay('AUB_P2', 'AUBURN', 'Plains Quick Slants', 'PASS_2', 'SPREAD', ['SLANT-R', 'SLANT-L', 'COMEBACK', 'SLANT-R'], 'High-percentage slants hitting receivers in stride.', 'SHORT', 'SAFE', [6, 14]),
    passPlay('AUB_P3', 'AUBURN', 'Jordan-Hare Wheel', 'PASS_3', 'STACK', ['FLAG-L', 'FLAG-R', 'GO', 'COMEBACK'], 'Play-action sideline wheel slipping past coverage.', 'VERTICAL', 'EXPLOSIVE', [16, 30]),
    passPlay('AUB_P4', 'AUBURN', 'Tiger Long Bomb', 'PASS_4', 'SPREAD', ['GO', 'POST-L', 'FLAG-R', 'GO'], 'Four vertical streaks challenging deep safeties.', 'VERTICAL', 'EXPLOSIVE', [18, 35]),
    runPlay('AUB_R1', 'AUBURN', 'Plains Perimeter', 'RUN_1', 'SWEEP', 'TRIPS', ['GO', 'BLOCK', 'BLOCK', 'BLOCK'], 'Speed sweep getting the running back outside.', [5, 14]),
    runPlay('AUB_R2', 'AUBURN', 'War Eagle Power', 'RUN_2', 'POWER', 'STACK', ['BLOCK', 'BLOCK', 'BLOCK', 'GO'], 'Off-tackle smash behind physical pulling blocks.', [4, 11])
  ],
  FLORIDA: [
    passPlay('FLA_P1', 'FLORIDA', 'Swamp Sail', 'PASS_1', 'TRIPS', ['POST-R', 'FLAG-R', 'HITCH', 'CROSS-L'], 'Deep post and sideline sail over a short hitch checkdown.', 'VERTICAL', 'EXPLOSIVE', [15, 30]),
    passPlay('FLA_P2', 'FLORIDA', 'Gator Quick Slant', 'PASS_2', 'SPREAD', ['SLANT-R', 'SLANT-L', 'CROSS-L', 'HITCH'], 'Fast perimeter slant routes with immediate run-after-catch.', 'SHORT', 'SAFE', [7, 15]),
    passPlay('FLA_P3', 'FLORIDA', 'Swamp Tunnel Screen', 'PASS_3', 'TRIPS', ['BLOCK', 'SLANT-L', 'BLOCK', 'BLOCK'], 'Wide receiver screen behind a three-man blocking wall.', 'SHORT', 'SAFE', [4, 10]),
    passPlay('FLA_P4', 'FLORIDA', 'Gator 4-Verts', 'PASS_4', 'SPREAD', ['GO', 'GO', 'POST-R', 'GO'], 'Full-field vertical stretch leaning on explosive receiver speed.', 'VERTICAL', 'EXPLOSIVE', [18, 36]),
    runPlay('FLA_R1', 'FLORIDA', 'Gator Wide Escort', 'RUN_1', 'SWEEP', 'SPREAD', ['BLOCK', 'GO', 'BLOCK', 'GO'], 'Perimeter sweep flashing outside the tackles.', [5, 14]),
    runPlay('FLA_R2', 'FLORIDA', 'Orange & Blue ISO', 'RUN_2', 'ISO', 'STACK', ['GO', 'GO', 'BLOCK', 'BLOCK'], 'Inside cutback run following the lead block up the middle.', [4, 10])
  ],
  GEORGIA: [
    passPlay('UGA_P1', 'GEORGIA', 'Athens TE Choice', 'PASS_1', 'STACK', ['COMEBACK', 'GO', 'CROSS-L', 'SLANT-R'], 'Tight end crossing option over the middle linebackers.', 'MEDIUM', 'SAFE', [8, 16]),
    passPlay('UGA_P2', 'GEORGIA', 'Bulldog Mesh', 'PASS_2', 'SPREAD', ['CROSS-R', 'CROSS-L', 'COMEBACK', 'HITCH'], 'Short underneath crossers with stout pocket protection.', 'SHORT', 'SAFE', [7, 15]),
    passPlay('UGA_P3', 'GEORGIA', 'Sanford Post-Dig', 'PASS_3', 'SPREAD', ['POST-R', 'COMEBACK', 'CROSS-L', 'GO'], 'High-low combo driving deep between the hashmarks.', 'VERTICAL', 'BALANCED', [14, 26]),
    passPlay('UGA_P4', 'GEORGIA', 'Red & Black Sail', 'PASS_4', 'TRIPS', ['FLAG-L', 'FLAG-R', 'POST-R', 'HITCH'], 'Corner routes attacking the sideline boundary.', 'MEDIUM', 'BALANCED', [10, 20]),
    runPlay('UGA_R1', 'GEORGIA', 'Bulldog Strong Duo', 'RUN_1', 'POWER', 'SPREAD', ['BLOCK', 'BLOCK', 'BLOCK', 'GO'], 'Brutal interior double-team push moving the line of scrimmage.', [5, 12]),
    runPlay('UGA_R2', 'GEORGIA', 'Sanford Sweep', 'RUN_2', 'SWEEP', 'TRIPS', ['BLOCK', 'GO', 'BLOCK', 'BLOCK'], 'Lead blocking stretch to the outside boundary.', [5, 13])
  ],
  KENTUCKY: [
    passPlay('UK_P1', 'KENTUCKY', 'Wildcat Snag', 'PASS_1', 'STACK', ['SLANT-R', 'COMEBACK', 'HITCH', 'FLAG-R'], 'Triangular possession read designed to move the chains.', 'SHORT', 'SAFE', [6, 13]),
    passPlay('UK_P2', 'KENTUCKY', 'Bluegrass Cross', 'PASS_2', 'SPREAD', ['CROSS-R', 'CROSS-L', 'SLANT-R', 'HITCH'], 'Reliable intermediate crossing routes in traffic.', 'MEDIUM', 'SAFE', [7, 15]),
    passPlay('UK_P3', 'KENTUCKY', 'Commonwealth Curls', 'PASS_3', 'SPREAD', ['COMEBACK', 'COMEBACK', 'HITCH', 'HITCH'], 'Timing curl combination sitting in zone voids.', 'SHORT', 'SAFE', [6, 12]),
    passPlay('UK_P4', 'KENTUCKY', 'Wildcat Wheel Strike', 'PASS_4', 'STACK', ['FLAG-L', 'FLAG-R', 'POST-R', 'GO'], 'Play-action vertical corner and post combo.', 'VERTICAL', 'BALANCED', [14, 25]),
    runPlay('UK_R1', 'KENTUCKY', 'Bluegrass Lead', 'RUN_1', 'ISO', 'STACK', ['BLOCK', 'GO', 'BLOCK', 'BLOCK'], 'North-south isolation behind the fullback collision.', [4, 11]),
    runPlay('UK_R2', 'KENTUCKY', 'Wildcat Power', 'RUN_2', 'POWER', 'SPREAD', ['GO', 'GO', 'BLOCK', 'BLOCK'], 'Heavy tackle blast clearing interior linebackers.', [4, 12])
  ],
  LSU: [
    passPlay('LSU_P1', 'LSU', 'Bayou Post-Wheel', 'PASS_1', 'TRIPS', ['POST-R', 'FLAG-R', 'GO', 'HITCH'], 'Deep post and sideline wheel punishing single-high safeties.', 'VERTICAL', 'EXPLOSIVE', [18, 35]),
    passPlay('LSU_P2', 'LSU', 'Death Valley Verts', 'PASS_2', 'SPREAD', ['GO', 'GO', 'POST-R', 'GO'], 'Explosive four-vertical assault testing cornerback speed.', 'VERTICAL', 'EXPLOSIVE', [16, 32]),
    passPlay('LSU_P3', 'LSU', 'Tiger Quick Slants', 'PASS_3', 'SPREAD', ['SLANT-R', 'SLANT-L', 'COMEBACK', 'HITCH'], 'Quick boundary slants with immediate yards-after-catch.', 'SHORT', 'SAFE', [7, 16]),
    passPlay('LSU_P4', 'LSU', 'Baton Rouge Out-Up', 'PASS_4', 'SPREAD', ['FLAG-L', 'FLAG-R', 'POST-R', 'HITCH'], 'Double move fake biting aggressive defensive backs.', 'VERTICAL', 'EXPLOSIVE', [15, 30]),
    runPlay('LSU_R1', 'LSU', 'Death Valley Sweep', 'RUN_1', 'SWEEP', 'TRIPS', ['GO', 'GO', 'BLOCK', 'BLOCK'], 'Outside edge sweep giving the dynamic back room to accelerate.', [5, 15]),
    runPlay('LSU_R2', 'LSU', 'Bayou ISO', 'RUN_2', 'ISO', 'STACK', ['BLOCK', 'GO', 'BLOCK', 'BLOCK'], 'Interior crease attack cutting against line pursuit.', [4, 11])
  ],
  MISSISSIPPI_STATE: [
    passPlay('MSU_P1', 'MISSISSIPPI_STATE', 'Cowbell Cross', 'PASS_1', 'SPREAD', ['CROSS-R', 'CROSS-L', 'POST-R', 'HITCH'], 'Shallow cross mesh picking off linebacker coverage.', 'SHORT', 'SAFE', [7, 15]),
    passPlay('MSU_P2', 'MISSISSIPPI_STATE', 'Starkville Slants', 'PASS_2', 'SPREAD', ['SLANT-R', 'SLANT-L', 'SLANT-L', 'HITCH'], 'High-tempo quick passing slicing the intermediate hashes.', 'SHORT', 'SAFE', [6, 14]),
    passPlay('MSU_P3', 'MISSISSIPPI_STATE', 'Bulldog Corner Strike', 'PASS_3', 'TRIPS', ['FLAG-L', 'FLAG-R', 'HITCH', 'COMEBACK'], 'Corner-out combination hitting the sideline boundary.', 'MEDIUM', 'BALANCED', [10, 20]),
    passPlay('MSU_P4', 'MISSISSIPPI_STATE', 'Maroon Verts', 'PASS_4', 'SPREAD', ['GO', 'GO', 'GO', 'GO'], 'Spaced vertical routes stressing every deep coverage third.', 'VERTICAL', 'EXPLOSIVE', [16, 32]),
    runPlay('MSU_R1', 'MISSISSIPPI_STATE', 'Starkville Draw', 'RUN_1', 'ISO', 'SPREAD', ['GO', 'GO', 'BLOCK', 'BLOCK'], 'Delayed pass-fake handoff hitting the vacated center gap.', [4, 11]),
    runPlay('MSU_R2', 'MISSISSIPPI_STATE', 'Cowbell Sweep', 'RUN_2', 'SWEEP', 'TRIPS', ['BLOCK', 'GO', 'BLOCK', 'BLOCK'], 'Pitched ball to the boundary behind lead receivers.', [5, 13])
  ],
  MISSOURI: [
    passPlay('MIZ_P1', 'MISSOURI', 'Columbia Levels', 'PASS_1', 'STACK', ['CROSS-R', 'HITCH', 'COMEBACK', 'POST-L'], 'Multi-tiered crossers giving the QB clean depth progressions.', 'MEDIUM', 'SAFE', [8, 17]),
    passPlay('MIZ_P2', 'MISSOURI', 'Tiger Quick Sit', 'PASS_2', 'SPREAD', ['COMEBACK', 'COMEBACK', 'SLANT-R', 'HITCH'], 'Paced curl options underneath deep zone bailouts.', 'SHORT', 'SAFE', [6, 13]),
    passPlay('MIZ_P3', 'MISSOURI', 'Show-Me Deep Shot', 'PASS_3', 'TRIPS', ['POST-R', 'FLAG-R', 'HITCH', 'GO'], 'Deep sideline post-corner beating cover 2 and cover 4.', 'VERTICAL', 'EXPLOSIVE', [15, 30]),
    passPlay('MIZ_P4', 'MISSOURI', 'Mizzou Mesh', 'PASS_4', 'SPREAD', ['CROSS-R', 'CROSS-L', 'GO', 'HITCH'], 'Tight-end crosser rubbing underneath slot receivers.', 'SHORT', 'SAFE', [7, 14]),
    runPlay('MIZ_R1', 'MISSOURI', 'Mizzou Split Lead', 'RUN_1', 'ISO', 'SPREAD', ['GO', 'BLOCK', 'BLOCK', 'GO'], 'Inside cutback lead cutting behind the center anchor.', [4, 11]),
    runPlay('MIZ_R2', 'MISSOURI', 'Columbia Power', 'RUN_2', 'POWER', 'STACK', ['BLOCK', 'BLOCK', 'BLOCK', 'GO'], 'Straightforward off-tackle power collision.', [4, 12])
  ],
  OKLAHOMA: [
    passPlay('OU_P1', 'OKLAHOMA', 'Sooner Slot Burst', 'PASS_1', 'TRIPS', ['COMEBACK', 'GO', 'HITCH', 'POST-L'], 'Slot post exploding through the middle safety cushion.', 'VERTICAL', 'EXPLOSIVE', [16, 32]),
    passPlay('OU_P2', 'OKLAHOMA', 'Norman Sprint Cross', 'PASS_2', 'STACK', ['GO', 'CROSS-L', 'HITCH', 'CROSS-R'], 'Sprint action freeing boundary crossers in open grass.', 'MEDIUM', 'BALANCED', [10, 20]),
    passPlay('OU_P3', 'OKLAHOMA', 'Boomer Verts', 'PASS_3', 'SPREAD', ['GO', 'GO', 'POST-R', 'GO'], 'Vertical speed stretch challenging the deepest defenders.', 'VERTICAL', 'EXPLOSIVE', [18, 35]),
    passPlay('OU_P4', 'OKLAHOMA', 'Crimson Quick Slant', 'PASS_4', 'SPREAD', ['SLANT-R', 'SLANT-L', 'COMEBACK', 'HITCH'], 'Rhythm slants with fast trigger delivery.', 'SHORT', 'SAFE', [6, 14]),
    runPlay('OU_R1', 'OKLAHOMA', 'Sooner Speed Sweep', 'RUN_1', 'SWEEP', 'TRIPS', ['GO', 'GO', 'BLOCK', 'BLOCK'], 'Wide edge sprint exploiting perimeter cornerback leverage.', [5, 14]),
    runPlay('OU_R2', 'OKLAHOMA', 'Norman Delay Draw', 'RUN_2', 'ISO', 'SPREAD', ['GO', 'GO', 'BLOCK', 'BLOCK'], 'Patience draw taking advantage of aggressive pass rushes.', [4, 12])
  ],
  OLE_MISS: [
    passPlay('OM_P1', 'OLE_MISS', 'Oxford Slot Screen', 'PASS_1', 'STACK', ['BLOCK', 'GO', 'BLOCK', 'SLANT-R'], 'Quick tunnel screen setting up open field jukes.', 'SHORT', 'SAFE', [4, 10]),
    passPlay('OM_P2', 'OLE_MISS', 'Rebel Tempo Verts', 'PASS_2', 'SPREAD', ['GO', 'GO', 'POST-R', 'GO'], 'Up-tempo deep shots down both sidelines.', 'VERTICAL', 'EXPLOSIVE', [18, 35]),
    passPlay('OM_P3', 'OLE_MISS', 'The Grove Crossers', 'PASS_3', 'SPREAD', ['CROSS-R', 'CROSS-L', 'COMEBACK', 'HITCH'], 'Overlapping drags running through vacated linebacker zones.', 'MEDIUM', 'SAFE', [8, 16]),
    passPlay('OM_P4', 'OLE_MISS', 'Rebel Post-Wheel', 'PASS_4', 'TRIPS', ['POST-R', 'FLAG-R', 'HITCH', 'WHEEL'], 'Post and sideline wheel stretching outside coverage.', 'VERTICAL', 'EXPLOSIVE', [16, 32]),
    runPlay('OM_R1', 'OLE_MISS', 'Rebel Wide Convoy', 'RUN_1', 'SWEEP', 'TRIPS', ['BLOCK', 'GO', 'BLOCK', 'BLOCK'], 'Three-man perimeter convoy sealing the outside lane.', [5, 15]),
    runPlay('OM_R2', 'OLE_MISS', 'Oxford Quick Draw', 'RUN_2', 'ISO', 'SPREAD', ['GO', 'GO', 'BLOCK', 'BLOCK'], 'Light box surprise run cutting through the A-gap.', [4, 12])
  ],
  SOUTH_CAROLINA: [
    passPlay('SC_P1', 'SOUTH_CAROLINA', 'Garnet TE Sail', 'PASS_1', 'TRIPS', ['HITCH', 'COMEBACK', 'FLAG-R', 'CROSS-L'], 'Tight end sail over underneath slot crossers.', 'MEDIUM', 'BALANCED', [9, 18]),
    passPlay('SC_P2', 'SOUTH_CAROLINA', 'Gamecock Slants', 'PASS_2', 'SPREAD', ['SLANT-R', 'SLANT-L', 'CROSS-L', 'HITCH'], 'Direct slants over the middle with flat release.', 'SHORT', 'SAFE', [6, 14]),
    passPlay('SC_P3', 'SOUTH_CAROLINA', 'Spurrier Deep Shot', 'PASS_3', 'SPREAD', ['FLAG-L', 'POST-R', 'COMEBACK', 'GO'], 'Aggressive twin vertical routes into safety seams.', 'VERTICAL', 'EXPLOSIVE', [16, 30]),
    passPlay('SC_P4', 'SOUTH_CAROLINA', 'Sandstorm Mesh', 'PASS_4', 'SPREAD', ['CROSS-R', 'CROSS-L', 'POST-R', 'HITCH'], 'Crossing routes picking off man-to-man coverage.', 'SHORT', 'SAFE', [7, 15]),
    runPlay('SC_R1', 'SOUTH_CAROLINA', 'Gamecock Lead Cut', 'RUN_1', 'ISO', 'STACK', ['GO', 'BLOCK', 'BLOCK', 'GO'], 'Downhill lead isolation hitting the B-gap.', [4, 11]),
    runPlay('SC_R2', 'SOUTH_CAROLINA', 'Garnet Power Smash', 'RUN_2', 'POWER', 'SPREAD', ['GO', 'GO', 'BLOCK', 'BLOCK'], 'Physical off-tackle push with lead receiver blocking.', [4, 12])
  ],
  TENNESSEE: [
    passPlay('TENN_P1', 'TENNESSEE', 'Volunteer Switch Sail', 'PASS_1', 'TRIPS', ['POST-R', 'GO', 'FLAG-R', 'HITCH'], 'Wide split post and corner stretching deep zone spacing.', 'VERTICAL', 'EXPLOSIVE', [16, 32]),
    passPlay('TENN_P2', 'TENNESSEE', 'Rocky Top 4-Verts', 'PASS_2', 'SPREAD', ['GO', 'GO', 'POST-R', 'GO'], 'Maximum tempo vertical streaks attacking the endzone.', 'VERTICAL', 'EXPLOSIVE', [18, 35]),
    passPlay('TENN_P3', 'TENNESSEE', 'Big Orange Slants', 'PASS_3', 'SPREAD', ['SLANT-R', 'SLANT-L', 'COMEBACK', 'HITCH'], 'Rapid tempo rhythm slants into open grass.', 'SHORT', 'SAFE', [7, 15]),
    passPlay('TENN_P4', 'TENNESSEE', 'Neyland Drag Mesh', 'PASS_4', 'SPREAD', ['CROSS-R', 'CROSS-L', 'GO', 'HITCH'], 'Wide receiver crossing concept running away from linebackers.', 'SHORT', 'SAFE', [8, 16]),
    runPlay('TENN_R1', 'TENNESSEE', 'Rocky Top Wide Lead', 'RUN_1', 'SWEEP', 'STACK', ['GO', 'BLOCK', 'BLOCK', 'GO'], 'Fast perimeter sweep getting outside the defensive end.', [5, 14]),
    runPlay('TENN_R2', 'TENNESSEE', 'Volunteer Power', 'RUN_2', 'POWER', 'SPREAD', ['GO', 'GO', 'BLOCK', 'BLOCK'], 'Downhill off-tackle punch punishing light defensive boxes.', [4, 12])
  ],
  TEXAS: [
    passPlay('TEX_P1', 'TEXAS', 'Longhorn Dagger', 'PASS_1', 'STACK', ['FLAG-L', 'COMEBACK', 'CROSS-R', 'GO'], 'Slot vertical clear-out opening the tight-end dig route.', 'VERTICAL', 'BALANCED', [12, 24]),
    passPlay('TEX_P2', 'TEXAS', 'Austin Y-Cross', 'PASS_2', 'SPREAD', ['COMEBACK', 'FLAG-R', 'CROSS-L', 'SLANT-R'], 'Signature Y-cross route across the formation behind protection.', 'MEDIUM', 'BALANCED', [10, 20]),
    passPlay('TEX_P3', 'TEXAS', 'Texas Deep Verts', 'PASS_3', 'SPREAD', ['GO', 'GO', 'POST-R', 'GO'], 'Boundary vertical shots testing outside coverage depth.', 'VERTICAL', 'EXPLOSIVE', [18, 35]),
    passPlay('TEX_P4', 'TEXAS', 'Burnt Orange Mesh', 'PASS_4', 'SPREAD', ['CROSS-R', 'CROSS-L', 'COMEBACK', 'HITCH'], 'Short rub routes giving the quarterback high completion timing.', 'SHORT', 'SAFE', [7, 15]),
    runPlay('TEX_R1', 'TEXAS', 'Longhorn Counter Draw', 'RUN_1', 'ISO', 'SPREAD', ['GO', 'GO', 'BLOCK', 'BLOCK'], 'Play-action counter delay slicing through the interior.', [4, 12]),
    runPlay('TEX_R2', 'TEXAS', 'Austin Edge Sweep', 'RUN_2', 'SWEEP', 'TRIPS', ['BLOCK', 'GO', 'BLOCK', 'BLOCK'], 'Perimeter stretch racing to the sideline corner.', [5, 14])
  ],
  TEXAS_AM: [
    passPlay('TAMU_P1', 'TEXAS_AM', 'Aggie Max Shot', 'PASS_1', 'STACK', ['POST-R', 'GO', 'BLOCK', 'HITCH'], 'Max-protection two-man deep route down the hashmarks.', 'VERTICAL', 'EXPLOSIVE', [16, 32]),
    passPlay('TAMU_P2', 'TEXAS_AM', 'Kyle Field Cross', 'PASS_2', 'SPREAD', ['CROSS-R', 'CROSS-L', 'COMEBACK', 'HITCH'], 'Physical crossing routes through intermediate contact.', 'MEDIUM', 'BALANCED', [8, 16]),
    passPlay('TAMU_P3', 'TEXAS_AM', '12th Man Slants', 'PASS_3', 'SPREAD', ['SLANT-R', 'SLANT-L', 'CROSS-L', 'HITCH'], 'Quick slants giving the QB immediate targets against the blitz.', 'SHORT', 'SAFE', [6, 14]),
    passPlay('TAMU_P4', 'TEXAS_AM', 'Aggie Corner Sail', 'PASS_4', 'TRIPS', ['FLAG-L', 'FLAG-R', 'HITCH', 'COMEBACK'], 'Sideline corner routes dropping over flat defenders.', 'MEDIUM', 'BALANCED', [10, 20]),
    runPlay('TAMU_R1', 'TEXAS_AM', 'Aggie Heavy Lead', 'RUN_1', 'POWER', 'STACK', ['BLOCK', 'BLOCK', 'BLOCK', 'HITCH'], 'Crushing interior lead block moving the line of scrimmage.', [5, 12]),
    runPlay('TAMU_R2', 'TEXAS_AM', 'Maroon A-Gap ISO', 'RUN_2', 'ISO', 'SPREAD', ['GO', 'GO', 'BLOCK', 'BLOCK'], 'Direct downhill A-gap run behind the center anchor.', [4, 11])
  ],
  VANDERBILT: [
    passPlay('VAN_P1', 'VANDERBILT', 'Commodore Option Sit', 'PASS_1', 'STACK', ['HITCH', 'COMEBACK', 'CROSS-R', 'SLANT-L'], 'Precise sit routes finding soft voids in zone coverage.', 'SHORT', 'SAFE', [6, 12]),
    passPlay('VAN_P2', 'VANDERBILT', 'Nashville Safe Cross', 'PASS_2', 'SPREAD', ['CROSS-R', 'HITCH', 'COMEBACK', 'CROSS-L'], 'Controlled crossing concepts maintaining safe completion reads.', 'MEDIUM', 'SAFE', [7, 14]),
    passPlay('VAN_P3', 'VANDERBILT', 'Gold & Black Slants', 'PASS_3', 'SPREAD', ['SLANT-R', 'SLANT-L', 'HITCH', 'SLANT-R'], 'Short rhythm slants getting the ball out before pressure arrives.', 'SHORT', 'SAFE', [6, 13]),
    passPlay('VAN_P4', 'VANDERBILT', 'Anchor Down Deep Shot', 'PASS_4', 'TRIPS', ['POST-R', 'FLAG-R', 'HITCH', 'GO'], 'Unexpected vertical post route taking a calculated deep shot.', 'VERTICAL', 'BALANCED', [14, 26]),
    runPlay('VAN_R1', 'VANDERBILT', 'Anchor Down Lead', 'RUN_1', 'ISO', 'STACK', ['BLOCK', 'GO', 'BLOCK', 'BLOCK'], 'Disciplined inside isolation finding the cutback crease.', [4, 10]),
    runPlay('VAN_R2', 'VANDERBILT', 'Nashville Sweep', 'RUN_2', 'SWEEP', 'TRIPS', ['GO', 'BLOCK', 'BLOCK', 'BLOCK'], 'Boundary sweep running behind disciplined perimeter blocks.', [4, 12])
  ]
};

export function getTecmoPlaysForTeam(teamId: string): TecmoPlayOption[] {
  const plays = SEC_TEAM_TECMO_PLAYS[teamId];
  if (!plays) return SEC_TEAM_TECMO_PLAYS.ALABAMA;
  return [...plays];
}

export function evaluateTecmoMatchup(
  offensePlayId: string,
  defendedPlayId: string,
  offensivePlaybook: Record<string, PlayOption>
): TecmoMatchupResult {
  if (offensePlayId === 'PUNT' || offensePlayId === 'FIELD_GOAL') {
    return {
      level: 'CATEGORY_MATCH',
      isExact: false,
      offenseIsRun: false,
      defenseIsRun: false,
      announcement: offensePlayId === 'PUNT' ? 'SPECIAL TEAMS: PUNT UNIT 🏈' : 'SPECIAL TEAMS: FIELD GOAL UNIT 🎯',
      rusherSpeedMultiplier: 1.0,
      blockShedFrames: 110,
      dbClosingSpeedMultiplier: 1.0,
      coverageTension: 1.0,
      runLaneSpacing: 1.0,
      pocketHoldMultiplier: 1.0,
      freezeDefenseFrames: 0
    };
  }

  const offPlay = offensivePlaybook[offensePlayId];
  const defPlay = offensivePlaybook[defendedPlayId];
  const defName = defPlay ? defPlay.name : defendedPlayId;
  const offName = offPlay ? offPlay.name : offensePlayId;

  const offIsRun = Boolean(offPlay && ['ISO', 'POWER', 'SWEEP'].includes(offPlay.type));
  const defIsRun = Boolean(defPlay && ['ISO', 'POWER', 'SWEEP'].includes(defPlay.type));

  // 1. EXACT MATCH: The defense correctly called the exact play (Tecmo Super Bowl total shutdown!)
  if (offensePlayId === defendedPlayId) {
    return {
      level: 'EXACT',
      isExact: true,
      offenseIsRun: offIsRun,
      defenseIsRun: defIsRun,
      announcement: offIsRun
        ? `DEFENSE CALLED ${defName.toUpperCase()}! RUN STUFFED! 💥🔒`
        : `DEFENSE CALLED ${defName.toUpperCase()}! EXACT MATCH TOTAL SHUTDOWN! 🔒⚡`,
      rusherSpeedMultiplier: 1.75,
      blockShedFrames: 18, // instantaneous block shed!
      dbClosingSpeedMultiplier: 1.45,
      coverageTension: 2.0, // blanket lockdown coverage
      runLaneSpacing: 0.4, // gaps plugged completely
      pocketHoldMultiplier: 0.25, // pocket collapses in ~1.2s
      freezeDefenseFrames: 0
    };
  }

  // 2. SAME CATEGORY MATCH: Pass vs Pass OR Run vs Run, but different specific play
  if (!offIsRun && !defIsRun) {
    // Both were pass plays, but different route concepts
    return {
      level: 'CATEGORY_MATCH',
      isExact: false,
      offenseIsRun: false,
      defenseIsRun: false,
      announcement: `DEFENSE ANTICIPATED PASS (${defName.toUpperCase()}) — OPEN RECEIVERS! 🎯💨`,
      rusherSpeedMultiplier: 1.0,
      blockShedFrames: 110,
      dbClosingSpeedMultiplier: 0.88,
      coverageTension: 0.70, // looser coverage windows on wrong pass call
      runLaneSpacing: 1.0,
      pocketHoldMultiplier: 1.15,
      freezeDefenseFrames: 20 // DBs hesitate on route recognition
    };
  }

  if (offIsRun && defIsRun) {
    // Both were run plays
    return {
      level: 'CATEGORY_MATCH',
      isExact: false,
      offenseIsRun: true,
      defenseIsRun: true,
      announcement: `DEFENSE ANTICIPATED RUN (${defName.toUpperCase()}) 🛑`,
      rusherSpeedMultiplier: 1.18,
      blockShedFrames: 70,
      dbClosingSpeedMultiplier: 1.10,
      coverageTension: 0.8,
      runLaneSpacing: 0.70, // box crowded, tight run lanes
      pocketHoldMultiplier: 1.0,
      freezeDefenseFrames: 0
    };
  }

  // 3. MISMATCH:
  // Defense called RUN, but Offense called PASS: Bit on the run!
  if (!offIsRun && defIsRun) {
    return {
      level: 'MISMATCH_BIT_ON_RUN',
      isExact: false,
      offenseIsRun: false,
      defenseIsRun: true,
      announcement: `DEFENSE CALLED ${defName.toUpperCase()} (RUN)! BIT ON RUN — RECEIVERS WIDE OPEN! 🚀💥`,
      rusherSpeedMultiplier: 0.75,
      blockShedFrames: 210, // offensive line stones the rush
      dbClosingSpeedMultiplier: 0.70,
      coverageTension: 0.30, // wide open receiver windows!
      runLaneSpacing: 1.0,
      pocketHoldMultiplier: 1.75, // huge pocket time
      freezeDefenseFrames: 45 // LBs/safeties suck up or freeze on run bite
    };
  }

  // Defense called PASS, but Offense called RUN: Dropped in coverage!
  return {
    level: 'MISMATCH_DROPPED_IN_COVERAGE',
    isExact: false,
    offenseIsRun: true,
    defenseIsRun: false,
    announcement: `DEFENSE CALLED ${defName.toUpperCase()} (PASS)! IN COVERAGE — OPEN RUN LANE! 💨🏈`,
    rusherSpeedMultiplier: 0.80,
    blockShedFrames: 180,
    dbClosingSpeedMultiplier: 0.85,
    coverageTension: 0.5,
    runLaneSpacing: 1.80, // massive gaping running lanes!
    pocketHoldMultiplier: 1.3,
    freezeDefenseFrames: 0
  };
}
