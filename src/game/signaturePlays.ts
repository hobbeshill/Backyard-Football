import type { PlayOption, RouteType } from './types';

export type SignatureOffenseId = `TEAM_${string}_O${1 | 2}`;
export type SignatureDefenseId = `TEAM_${string}_D${1 | 2}`;
export type SignatureProOffenseId = `PRO_${SignatureOffenseId}`;
export type SignatureProDefenseId = `PRO_${SignatureDefenseId}`;

export interface DefenseLandmark {
  x: number;
  depth: number;
  zoneDepth: number;
  assignment: 'BLITZ' | 'ZONE' | 'MAN';
  type: 'DL' | 'LB' | 'CB' | 'FS';
}

export interface SignatureDefense {
  name: string;
  desc: string;
  weakness: string;
  vulnerableRouteType: RouteType;
  landmarks: DefenseLandmark[];
  counter: 'PRO_COVER1_MAN' | 'PRO_COVER3_DEEP' | 'PRO_COVER4_QUARTERS' | 'PRO_COVER2_HARD_FLAT' | 'PRO_BLITZ_ZERO' | 'PRO_RUN_STOP_BOX' | 'PRO_TAMPA2';
}

interface SignatureOffense extends PlayOption {
  type: 'PASS' | 'ISO' | 'POWER' | 'SWEEP';
  alignment: 'SPREAD' | 'STACK' | 'TRIPS';
  left: string;
  right: string;
  center: string;
  slot: string;
  rbRoute: string;
}

interface SignaturePackage {
  offense: readonly [SignatureOffense, SignatureOffense];
  defense: readonly [SignatureDefense, SignatureDefense];
}

function pass(name: string, alignment: 'SPREAD' | 'STACK' | 'TRIPS', routes: readonly [string, string, string, string], desc: string, deep = false): SignatureOffense {
  return {
    name, type: 'PASS', alignment, left: routes[0], right: routes[1], center: routes[2], slot: routes[3],
    rbRoute: 'BLOCK', desc, risk: deep ? 'EXPLOSIVE' : 'SAFE',
    routeType: deep ? 'VERTICAL' : 'MEDIUM', expectedGain: deep ? [15, 30] : [4, 14]
  };
}

function run(name: string, type: 'ISO' | 'POWER' | 'SWEEP', alignment: 'SPREAD' | 'STACK' | 'TRIPS', routes: readonly [string, string, string, string], desc: string): SignatureOffense {
  return {
    name, type, alignment, left: routes[0], right: routes[1], center: routes[2], slot: routes[3],
    rbRoute: 'FLAT', desc, risk: 'BALANCED', routeType: 'MEDIUM', expectedGain: [3, 12]
  };
}

function shell(
  name: string, desc: string, weakness: string, vulnerableRouteType: RouteType,
  counter: SignatureDefense['counter'], rushXs: number[],
  coverage: Array<readonly [number, number, number, 'MAN'?]>
): SignatureDefense {
  return {
    name, desc, weakness, vulnerableRouteType, counter,
    landmarks: [
      ...rushXs.map((x): DefenseLandmark => ({ x, depth: 24, zoneDepth: 24, assignment: 'BLITZ', type: 'DL' })),
      ...coverage.map(([x, depth, zoneDepth, man]): DefenseLandmark => ({
        x, depth, zoneDepth, assignment: man ?? 'ZONE',
        type: depth >= 180 ? 'FS' : x <= 70 || x >= 270 ? 'CB' : 'LB'
      }))
    ]
  };
}

export const SIGNATURE_PLAYS: Record<string, SignaturePackage> = {
  ALABAMA: {
    offense: [
      pass('Crimson Mills', 'STACK', ['POST-R', 'COMEBACK', 'CROSS-L', 'HITCH'], 'A protected post over a tight-end dig; possession receivers settle underneath.', true),
      run('Tuscaloosa Lead', 'POWER', 'STACK', ['BLOCK', 'GO', 'BLOCK', 'BLOCK'], 'A tight three-blocker surface leads the power back off tackle.')
    ],
    defense: [
      shell('Crimson Cloud', 'Two-high shell with an aggressive left flat and a deeper right hook.', 'Right flat and deep left sideline.', 'VERTICAL', 'PRO_COVER2_HARD_FLAT', [150], [[45, 30, 55], [295, 50, 90], [115, 65, 110], [220, 85, 140], [100, 190, 285], [240, 205, 310]]),
      shell('Bama Boundary Fire', 'Two boundary rushers with middle hooks and two deep caps.', 'Quick flats behind the edge rush.', 'SHORT', 'PRO_BLITZ_ZERO', [75, 265], [[50, 65, 100], [170, 80, 130], [290, 65, 100], [115, 190, 280], [225, 190, 280]])
    ]
  },
  ARKANSAS: {
    offense: [
      run('Hog Double Lead', 'POWER', 'STACK', ['GO', 'BLOCK', 'BLOCK', 'BLOCK'], 'Three lead blockers pave a downhill lane for the strongest back.'),
      pass('Ozark Stick', 'STACK', ['COMEBACK', 'SLANT-L', 'HITCH', 'CROSS-R'], 'A short tight-end stick and slot cross provide safe outlets behind run-focused fronts.')
    ],
    defense: [
      shell('Razorback Pinch', 'Three interior rushers pinch the power lane with shallow outside support.', 'Posts behind the shallow middle.', 'VERTICAL', 'PRO_RUN_STOP_BOX', [130, 170, 210], [[45, 38, 65], [295, 38, 65], [125, 100, 150], [215, 160, 220]]),
      shell('Hog Edge Fence', 'A two-man interior rush keeps wide force defenders free to contain sweeps.', 'Deep seams between the force defenders.', 'VERTICAL', 'PRO_RUN_STOP_BOX', [145, 195], [[35, 32, 60], [305, 32, 60], [115, 65, 95], [225, 65, 95], [170, 180, 250]])
    ]
  },
  AUBURN: {
    offense: [
      run('Plains Perimeter', 'SWEEP', 'TRIPS', ['GO', 'BLOCK', 'BLOCK', 'BLOCK'], 'Trips blockers seal the edge while the isolated receiver clears pursuit.'),
      pass('War Eagle Flood', 'TRIPS', ['GO', 'FLAG-R', 'CROSS-R', 'HITCH'], 'A corner, crossing tight end and short slot stretch one sideline for a mobile QB.', true)
    ],
    defense: [
      shell('Tiger Boundary Heat', 'Two edge rushers and four man defenders funnel throws toward one safety.', 'Crossing rubs and the opposite boundary.', 'VERTICAL', 'PRO_COVER1_MAN', [80, 250], [[50, 35, 45, 'MAN'], [290, 35, 45, 'MAN'], [120, 45, 60, 'MAN'], [220, 45, 60, 'MAN'], [190, 195, 260]]),
      shell('Plains Slot Fire', 'Three rushers attack the interior and slot side with no deep safety.', 'Any protected deep shot.', 'VERTICAL', 'PRO_BLITZ_ZERO', [115, 170, 255], [[45, 32, 55, 'MAN'], [295, 32, 55, 'MAN'], [130, 45, 70, 'MAN'], [225, 45, 70, 'MAN']])
    ]
  },
  FLORIDA: {
    offense: [
      pass('Swamp Sail', 'TRIPS', ['POST-R', 'FLAG-R', 'HITCH', 'CROSS-L'], 'Fast receivers stretch the safety with a post and sideline sail over a short checkdown.', true),
      run('Gator Wide Escort', 'SWEEP', 'SPREAD', ['BLOCK', 'GO', 'BLOCK', 'GO'], 'Boundary and tight-end blocks escort the speed back outside; two clear-outs remove safeties.')
    ],
    defense: [
      shell('Gator Speed Match', 'One rush, four man matches and two staggered deep defenders trust fast defensive backs.', 'Draws and crossing rubs.', 'SHORT', 'PRO_COVER1_MAN', [170], [[45, 40, 55, 'MAN'], [295, 40, 55, 'MAN'], [110, 55, 70, 'MAN'], [230, 55, 70, 'MAN'], [115, 200, 300], [235, 225, 330]]),
      shell('Swamp Split Field', 'A short left cloud pairs with a three-deep right-side shell.', 'Left sideline shots and underneath right crossers.', 'MEDIUM', 'PRO_COVER3_DEEP', [160], [[40, 35, 65], [110, 200, 290], [210, 75, 130], [300, 195, 295], [180, 220, 330], [75, 90, 140]])
    ]
  },
  GEORGIA: {
    offense: [
      run('Bulldog Strong Duo', 'POWER', 'SPREAD', ['BLOCK', 'BLOCK', 'BLOCK', 'GO'], 'Two boundary seals and the tight end create a physical off-tackle lane.'),
      pass('Athens Tight-End Choice', 'STACK', ['COMEBACK', 'GO', 'CROSS-L', 'SLANT-R'], 'Strong protection frees the reliable tight end across the field with a slot slant outlet.')
    ],
    defense: [
      shell('Dawg Interior Wall', 'Two interior rushers, three compact hooks and two deep safeties protect inside lanes.', 'Wide screens outside the compact hooks.', 'SHORT', 'PRO_RUN_STOP_BOX', [140, 200], [[100, 55, 90], [170, 65, 120], [240, 55, 90], [110, 185, 270], [230, 185, 270]]),
      shell('Athens Seam Lock', 'One rush and three deep landmarks cover seams behind disciplined underneath zones.', 'Short sideline throws.', 'SHORT', 'PRO_COVER3_DEEP', [175], [[65, 75, 115], [170, 100, 175], [275, 75, 115], [70, 195, 300], [170, 235, 350], [270, 195, 300]])
    ]
  },
  KENTUCKY: {
    offense: [
      run('Bluegrass Lead', 'ISO', 'STACK', ['BLOCK', 'GO', 'BLOCK', 'BLOCK'], 'A compact lead-blocking package lets the power back patiently find the inside crease.'),
      pass('Wildcat Snag', 'STACK', ['SLANT-R', 'COMEBACK', 'HITCH', 'FLAG-R'], 'A tight-end sit, boundary comeback and slot corner create a possession triangle.')
    ],
    defense: [
      shell('Wildcat Gap Clamp', 'Three compact rushers squeeze inside runs while four shallow zones guard outlets.', 'Vertical routes behind the shallow shell.', 'VERTICAL', 'PRO_RUN_STOP_BOX', [125, 170, 215], [[60, 45, 75], [280, 45, 75], [135, 105, 170], [205, 175, 240]]),
      shell('Bluegrass Cross Robber', 'Two rushers, wide man coverage and a middle robber crowd possession crossers.', 'Double moves outside the single safety.', 'VERTICAL', 'PRO_COVER1_MAN', [145, 195], [[45, 40, 55, 'MAN'], [295, 40, 55, 'MAN'], [120, 80, 115], [220, 80, 115], [170, 205, 275]])
    ]
  },
  LSU: {
    offense: [
      pass('Bayou Scissors', 'STACK', ['POST-R', 'FLAG-R', 'CROSS-L', 'GO'], 'Explosive post and corner routes cross the safeties while a tight-end dig offers relief.', true),
      pass('Tiger Switch', 'TRIPS', ['FLAG-L', 'POST-L', 'GO', 'CROSS-R'], 'A trips post and inside go exchange vertical lanes to stress ball-hawking coverage.', true)
    ],
    defense: [
      shell('Bayou Bracket', 'One rush with paired underneath and deep landmarks on both boundaries.', 'Inside draws and short middle throws.', 'SHORT', 'PRO_COVER4_QUARTERS', [165], [[50, 60, 100], [290, 60, 100], [115, 95, 150], [55, 210, 320], [170, 230, 350], [285, 210, 320]]),
      shell('Tiger Post Trap', 'Wide man defenders funnel posts into a deep center ball hawk and inside hooks.', 'Outside corners and run cutbacks.', 'MEDIUM', 'PRO_COVER1_MAN', [180], [[40, 45, 60, 'MAN'], [300, 45, 60, 'MAN'], [105, 85, 145], [235, 85, 145], [170, 175, 255], [170, 265, 370]])
    ]
  },
  MISSISSIPPI_STATE: {
    offense: [
      pass('Starkville Spacing', 'SPREAD', ['COMEBACK', 'HITCH', 'SLANT-R', 'CROSS-L'], 'Quick sit routes and an inside tight-end slant limit pocket time.'),
      pass('Cowbell Drive', 'STACK', ['CROSS-R', 'COMEBACK', 'CROSS-L', 'HITCH'], 'Paired possession crossers and a boundary comeback give the rhythm QB layered reads.')
    ],
    defense: [
      shell('Cowbell Hook Net', 'One rush with four staggered underneath zones and two deep caps; no all-out pressure.', 'Deep sideline seams.', 'VERTICAL', 'PRO_TAMPA2', [155], [[45, 45, 85], [295, 45, 85], [125, 85, 145], [215, 95, 155], [105, 200, 300], [235, 200, 300]]),
      shell('Starkville Cross Cut', 'One rush and a dense three-hook middle funnel crossers toward deep thirds.', 'Quick flats outside the hook net.', 'SHORT', 'PRO_COVER3_DEEP', [185], [[100, 85, 140], [170, 70, 115], [240, 85, 140], [50, 215, 325], [170, 245, 355], [290, 215, 325]])
    ]
  },
  MISSOURI: {
    offense: [
      run('Mizzou Split Lead', 'ISO', 'SPREAD', ['GO', 'BLOCK', 'BLOCK', 'GO'], 'A boundary blocker and tight end lead the inside back while the slot clears coverage.'),
      pass('Columbia Levels', 'STACK', ['CROSS-R', 'HITCH', 'COMEBACK', 'POST-L'], 'Crossers underneath a slot post give the controlled passing game multiple depths.')
    ],
    defense: [
      shell('Mizzou Box Spill', 'Two offset rushers force inside runs toward wide shallow zone defenders.', 'Deep sidelines over the force players.', 'VERTICAL', 'PRO_RUN_STOP_BOX', [120, 215], [[40, 40, 70], [300, 40, 70], [170, 85, 140], [105, 190, 290], [235, 190, 290]]),
      shell('Columbia Layered Match', 'Two rushers and two boundary man defenders sit under a three-deep cap.', 'Underneath slot crossers.', 'SHORT', 'PRO_COVER3_DEEP', [150, 190], [[50, 50, 65, 'MAN'], [290, 50, 65, 'MAN'], [70, 205, 315], [170, 240, 350], [270, 205, 315]])
    ]
  },
  OKLAHOMA: {
    offense: [
      pass('Sooner Slot Burst', 'TRIPS', ['COMEBACK', 'GO', 'HITCH', 'POST-L'], 'The fast slot attacks the deep middle with quick outlets protecting the pocket.', true),
      pass('Norman Sprint Cross', 'STACK', ['GO', 'CROSS-L', 'HITCH', 'CROSS-R'], 'Opposing slot and boundary crossers attack open grass under a clear-out.')
    ],
    defense: [
      shell('Sooner Edge Exchange', 'Two left-biased rushers attack the pocket behind man coverage and one deep cap.', 'Right-side runs and crossing rubs.', 'VERTICAL', 'PRO_BLITZ_ZERO', [70, 155], [[45, 38, 50, 'MAN'], [295, 38, 50, 'MAN'], [120, 55, 75, 'MAN'], [225, 55, 75, 'MAN'], [205, 210, 290]]),
      shell('Norman Pressure Thirds', 'Two edge rushers force early throws into a three-deep shell and two hooks.', 'Quick flat routes behind the rush.', 'SHORT', 'PRO_COVER3_DEEP', [85, 255], [[115, 75, 125], [225, 75, 125], [55, 205, 315], [170, 225, 335], [285, 205, 315]])
    ]
  },
  OLE_MISS: {
    offense: [
      run('Rebel Wide Convoy', 'SWEEP', 'TRIPS', ['BLOCK', 'GO', 'BLOCK', 'BLOCK'], 'Three perimeter blockers escort the speed back into space instead of interior contact.'),
      pass('Oxford Slot Screen', 'STACK', ['BLOCK', 'GO', 'BLOCK', 'SLANT-R'], 'The quick slot cuts behind two blockers while the far receiver clears the safety.')
    ],
    defense: [
      shell('Rebel Two-High Cushion', 'One rush with soft outside zones and two very deep safeties minimizes explosive plays.', 'Inside runs and short curls.', 'SHORT', 'PRO_COVER4_QUARTERS', [170], [[45, 100, 155], [295, 100, 155], [115, 105, 170], [225, 105, 170], [95, 240, 350], [245, 240, 350]]),
      shell('Oxford Sideline Caps', 'One rush keeps three deep caps behind asymmetric underneath zones.', 'Short middle crossers and draw runs.', 'SHORT', 'PRO_COVER3_DEEP', [160], [[60, 90, 145], [180, 70, 120], [270, 100, 165], [40, 225, 335], [165, 255, 365], [300, 225, 335]])
    ]
  },
  SOUTH_CAROLINA: {
    offense: [
      pass('Garnet Tight-End Sail', 'TRIPS', ['HITCH', 'COMEBACK', 'FLAG-R', 'CROSS-L'], 'The reliable tight end stretches the boundary above a slot cross and quick sit.'),
      run('Gamecock Lead Cut', 'ISO', 'STACK', ['GO', 'BLOCK', 'BLOCK', 'GO'], 'A compact right-side lead package gives the inside back a cutback behind two blockers.')
    ],
    defense: [
      shell('Garnet Edge Storm', 'Three right-weighted rushers attack the edge while four man defenders hold routes.', 'Protected vertical routes; no safety help.', 'VERTICAL', 'PRO_BLITZ_ZERO', [155, 215, 275], [[45, 35, 50, 'MAN'], [295, 35, 50, 'MAN'], [115, 50, 65, 'MAN'], [225, 50, 65, 'MAN']]),
      shell('Carolina Boundary Trap', 'Two edge rushers and aggressive boundary flats force throws toward a lone deep cap.', 'Deep boundary seams over the trap corners.', 'VERTICAL', 'PRO_COVER2_HARD_FLAT', [65, 275], [[40, 30, 55], [300, 30, 55], [120, 80, 130], [220, 90, 145], [170, 215, 305]])
    ]
  },
  TENNESSEE: {
    offense: [
      pass('Volunteer Switch Sail', 'TRIPS', ['POST-R', 'GO', 'FLAG-R', 'HITCH'], 'A post, outside go and tight-end corner stress deep zone spacing at tempo.', true),
      run('Rocky Top Wide Lead', 'SWEEP', 'STACK', ['GO', 'BLOCK', 'BLOCK', 'GO'], 'A compressed lead pair seals the outside lane while the slot clears deep pursuit.')
    ],
    defense: [
      shell('Volunteer Three-Deep Fan', 'One rush spreads three deep caps and wide underneath zones to contain tempo shots.', 'Inside runs and middle hitches.', 'SHORT', 'PRO_COVER3_DEEP', [180], [[40, 80, 135], [170, 100, 155], [300, 80, 135], [45, 210, 320], [170, 250, 360], [295, 210, 320]]),
      shell('Rocky Top Red-Zone Net', 'One rush compresses four underneath zones beneath two red-zone safety caps.', 'Deep shots outside the compressed safeties.', 'VERTICAL', 'PRO_TAMPA2', [165], [[55, 35, 60], [285, 35, 60], [125, 65, 105], [215, 65, 105], [115, 150, 215], [225, 150, 215]])
    ]
  },
  TEXAS: {
    offense: [
      pass('Longhorn Boundary Dagger', 'STACK', ['FLAG-L', 'COMEBACK', 'CROSS-R', 'GO'], 'A boundary corner and slot clear-out open the tight-end dig behind strong protection.', true),
      pass('Austin Y-Cross', 'SPREAD', ['COMEBACK', 'FLAG-R', 'CROSS-L', 'SLANT-R'], 'A tight-end cross pairs with an outside corner and quick slot slant.')
    ],
    defense: [
      shell('Longhorn Lock Bracket', 'Four tight man matches underneath two staggered deep safeties trust shutdown corners.', 'Draws and slot rubs.', 'SHORT', 'PRO_COVER1_MAN', [155], [[40, 32, 45, 'MAN'], [300, 32, 45, 'MAN'], [120, 50, 65, 'MAN'], [220, 50, 65, 'MAN'], [100, 185, 275], [240, 215, 315]]),
      shell('Austin Seam Robber', 'Boundary man coverage and inside hooks funnel seam throws into two middle safety layers.', 'Wide screens and outside corners.', 'MEDIUM', 'PRO_TAMPA2', [185], [[50, 38, 55, 'MAN'], [290, 38, 55, 'MAN'], [105, 75, 125], [235, 75, 125], [165, 155, 240], [175, 245, 355]])
    ]
  },
  TEXAS_AM: {
    offense: [
      run('Aggie Heavy Lead', 'POWER', 'STACK', ['BLOCK', 'BLOCK', 'BLOCK', 'HITCH'], 'A heavy three-blocker surface creates contact yards with a slot decoy.'),
      pass('College Station Max Shot', 'STACK', ['POST-R', 'GO', 'BLOCK', 'HITCH'], 'The tight end and RB protect while the boundary post and go attack deep.', true)
    ],
    defense: [
      shell('Aggie A-Gap Crush', 'Three narrow rushers attack interior protection behind short outside zones.', 'Deep boundary shots.', 'VERTICAL', 'PRO_RUN_STOP_BOX', [140, 170, 200], [[45, 40, 70], [295, 40, 70], [120, 90, 145], [220, 165, 235]]),
      shell('College Station Overload', 'Three left-weighted rushers overload protection with four shallow man defenders.', 'Right-side sweeps and protected go routes.', 'VERTICAL', 'PRO_BLITZ_ZERO', [70, 120, 170], [[45, 30, 45, 'MAN'], [295, 30, 45, 'MAN'], [130, 55, 70, 'MAN'], [230, 55, 70, 'MAN']])
    ]
  },
  VANDERBILT: {
    offense: [
      pass('Commodore Option Sit', 'STACK', ['HITCH', 'COMEBACK', 'CROSS-R', 'SLANT-L'], 'Reliable hands settle at several short depths without needing a speed mismatch.'),
      pass('Nashville Safe Cross', 'SPREAD', ['CROSS-R', 'HITCH', 'COMEBACK', 'CROSS-L'], 'Balanced possession crossers and sit routes keep both sidelines available to the QB.')
    ],
    defense: [
      shell('Commodore Safety Umbrella', 'One rush keeps two deep safeties and a long middle drop behind patient flats.', 'Outside screens and inside runs.', 'SHORT', 'PRO_TAMPA2', [170], [[50, 65, 105], [290, 65, 105], [110, 85, 140], [170, 155, 240], [100, 235, 345], [240, 235, 345]]),
      shell('Nashville Possession Net', 'One rush and four intermediate zones contest checkdowns with two safety caps.', 'Deep boundary seams.', 'VERTICAL', 'PRO_COVER2_HARD_FLAT', [175], [[40, 55, 90], [300, 55, 90], [120, 100, 165], [220, 100, 165], [105, 210, 315], [235, 210, 315]])
    ]
  }
};

export function signatureOffenseIds(teamId: string): readonly [SignatureOffenseId, SignatureOffenseId] {
  return [`TEAM_${teamId}_O1`, `TEAM_${teamId}_O2`];
}

export function signatureDefenseIds(teamId: string): readonly [SignatureDefenseId, SignatureDefenseId] {
  return [`TEAM_${teamId}_D1`, `TEAM_${teamId}_D2`];
}
