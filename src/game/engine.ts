import type { Ball, Entity, FumbleBall } from './types';
import { defensiveKeys, defensivePlaybook, middleRoutes, offensiveKeys, offensivePlaybook, outsideRoutes, runningBackRoutes, wrRoutes } from './playbook';
import { alignDefenderAcrossFromRunningBack, alignDefenders, chooseCpuDefensiveAssignments } from './defense';
import { evaluateCpuOffensiveAudibles, evaluateCpuBallCarrierMoves, shouldCpuReleasePass, shouldCpuScramble, scoreRunBlockTarget } from './ai';
import { createFumbleBall } from './fumbles';
import { distToSegment, GAME_SPEED_SCALE, moveToward, resolveCollisions, updateRouteMovement } from './movement';
import { resolvePlayResult, calculateBrokenTackleChance, calculateYardsToGo, getPassArcHeight, getPassArcMaxHeight, getPassFlightFrames, findTappedPassReceiver, canDefenderDeflectPass, canTackleQuarterback, resolveCatchContestOutcome, evaluateQbThrowAccuracy } from './rules';
import { sounds } from './sound';
import { evaluateDirtSwipeGesture, drawDirtSwipeGesture } from './chalkMenu';
import { getTeam, TEAMS, TeamProfile } from './teams';

export interface GameEngineHandle {
  p1Score: number;
  p2Score: number;
  p1OffPlay: string;
  p1DefPlay: string;
  p2OffPlay: string;
  p2DefPlay: string;
  phase: string;
  activeOffense: string;
  activeDefense: string;
  p1Team: TeamProfile;
  p2Team: TeamProfile;
  selectP1Team: (teamId: string) => void;
  selectP2Team: (teamId: string) => void;
  resetDrill: () => void;
  resetGame: () => void;
  applyDefensiveAlignment: () => void;
  selectOffense: (key: string) => void;
  selectDefense: (key: string) => void;
  shiftFormation?: (direction: number) => void;
}

export interface GameEngineCallbacks {
  setP2OffPlayState: (key: string) => void;
  setP2DefPlayState: (key: string) => void;
  setDownDistanceText: (text: string) => void;
  setActiveOffenseState: (side: string) => void;
  setUserScore: (score: number) => void;
  setCpuScore: (score: number) => void;
  setP1DefPlayState: (key: string) => void;
  setP1OffFormationState?: (formation: 'SPREAD' | 'STACK' | 'TRIPS') => void;
  setP1TeamState?: (team: TeamProfile) => void;
  setP2TeamState?: (team: TeamProfile) => void;
  setMomentumState: (momentum: number) => void;
  setGameClockState: (quarter: number, seconds: number) => void;
  showAnnouncement: (text: string, color?: string, big?: boolean) => void;
  onEngineReady: (engine: GameEngineHandle | null) => void;
}

export function mountFootballGame(canvas: HTMLCanvasElement, callbacks: GameEngineCallbacks): (() => void) | undefined {
  const {
    setP2OffPlayState,
    setP2DefPlayState,
    setDownDistanceText,
    setActiveOffenseState,
    setUserScore,
    setCpuScore,
    setP1DefPlayState,
    setP1OffFormationState,
    setMomentumState,
    setGameClockState,
    showAnnouncement
  } = callbacks;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const fieldWidth = 340;
  const fieldHeight = 1200;
  const endZoneHeight = 100;
  const cameraRunoff = 225;
  const cameraWorldTop = -cameraRunoff;
  const cameraWorldBottom = fieldHeight + cameraRunoff;

  let cameraY = 0;
  let currentViewHeight = 450;
  let cameraScale = 1.0;
  let cameraOffsetX = 0;
  let screenShakeTimer = 0;
  let playClock = 0;
  let cpuScrambleDecisionMade = false;
  let qbScrambleReactionTimer = 0;
  let p1Score = 0;
  let p2Score = 0;

  function screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvas!.getBoundingClientRect();
    const canvasX = (clientX - rect.left) * (canvas!.width / rect.width);
    const canvasY = (clientY - rect.top) * (canvas!.height / rect.height);
    const wx = (canvasX - cameraOffsetX) / cameraScale;
    const wy = (canvasY / cameraScale) + cameraY;
    return { x: wx, y: wy };
  }

  let lineOfScrimmageY = fieldHeight - endZoneHeight - 350;
  let firstDownMarkerY = lineOfScrimmageY - 100;
  let attackDirection = -1; // -1 = upward (-Y), 1 = downward (+Y)
  let currentDown = 1;
  let yardsToGo = 10;
  let quarter = 1;
  let gameClockSeconds = 120;
  let gameClockRemainderMs = 0;
  let lastClockFrameTime: number | null = null;
  let gameClockRunning = false;
  let pendingQuarterEnd = false;
  let quarterBreakRemainingMs = 0;
  let halftimeAnnouncementPending = false;
  let gameOver = false;

  let qb: Entity = {
    x: 170,
    y: lineOfScrimmageY - (40 * attackDirection),
    vx: 0,
    vy: 0,
    speed: 2.24, // 20% slower than 2.8
    radius: 12,
    color: '#ffcc00',
    boostUsed: false,
    powerBoostTimer: 0,
    tackleImmunity: 0,
    brokenTacklesCount: 0
  };

  let receivers: Entity[] = [];
  let centerReceiver: Entity | null = null;
  let rb: Entity | null = null;
  let linemen: Entity[] = [];
  let defenders: Entity[] = [];
  let ball: Ball | null = null;
  let ballPressureDefenders: Entity[] = [];
  let fumbleBall: FumbleBall | null = null;
  let brokenTackleEffect: { x: number; y: number; timer: number } | null = null;
  let activeEntity: Entity = qb;
  let phase = 'PRE_SNAP';

  let activeOffense = 'P1';
  let activeDefense = 'P2';

  let p1Team: TeamProfile = getTeam('ARROWS');
  let p2Team: TeamProfile = getTeam('ENFORCERS');

  let p1OffPlay = 'SHORT_PASS';
  let p1OffFormation: 'SPREAD' | 'STACK' | 'TRIPS' = 'SPREAD';
  let p1DefPlay = 'COVER3';
  let p2OffPlay = 'SHORT_PASS';
  let p2DefPlay = 'COVER3';
  let cpuPreSnapTimer = 0;
  let isAllBlocking = false;
  interface PlayRecord {
    play: string;
    isPass: boolean;
    down: number;
    distance: number;
    yardsGained: number;
    isQbRun?: boolean;
    targetWasRb?: boolean;
    isFlatPass?: boolean;
    formation?: 'SPREAD' | 'STACK' | 'TRIPS';
    routes?: {
      left?: string;
      slot?: string;
      center?: string;
      right?: string;
      rb?: string;
    };
  }
  const userPlayHistory: PlayRecord[] = [];
  const userDefenseHistory: string[] = [];
  let momentum = 0;
  let defenseOverrides = new Map<number, 'BLITZ' | 'MAN' | 'ZONE' | 'QB_SPY' | 'RB_SPY'>();
  let coverageMistakeEvaluated = false;
  let playEnding = false;
  let isInterceptionReturn = false;
  let formationTransitionFrame = 0;
  let lastTargetWasRb = false;
  let aiPreSnapShiftTimer = 0;
  let formationTransitions: Array<{
    entity: Entity;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  }> = [];

  // Backyard Route Line Drawing, Single-Tap Run Blocking & Formation Swiping
  let gestureEntity: Entity | null = null;
  let gestureRole: 'WR' | 'RB' | 'DEFENDER' = 'WR';
  let gestureStartX = 0;
  let gestureStartY = 0;
  let gestureCurrentX = 0;
  let gestureCurrentY = 0;
  let gestureTouchStartX = 0;
  let gestureTouchStartY = 0;
  let isDirtGestureActive = false;
  let tapThrowTarget: Entity | null = null;
  let preSnapFieldSwipeStartX = 0;
  let preSnapFieldSwipeStartY = 0;

  function applyChalkRoute(target: Entity, role: 'WR' | 'RB' | 'DEFENDER', value: string) {
    if (role === 'WR') {
      const isLeftSide = target.x < 170;
      let finalRoute = value;
      if (value === 'SLANT') finalRoute = isLeftSide ? 'SLANT-R' : 'SLANT-L';
      else if (value === 'FLAG') finalRoute = isLeftSide ? 'FLAG-L' : 'FLAG-R';
      else if (value === 'CROSS') finalRoute = isLeftSide ? 'CROSS-R' : 'CROSS-L';

      target.routeType = finalRoute;
      target.isBlocker = (finalRoute === 'BLOCK');
      target.routeIndex = Math.max(0, wrRoutes.indexOf(finalRoute));
      sounds.playJuke();
      if (activeDefense === 'P2') {
        applyDefensiveAlignment(true, false);
      }
    } else if (role === 'RB' && rb) {
      rb.routeType = value;
      rb.isBlocker = (value === 'BLOCK');
      rb.routeIndex = Math.max(0, runningBackRoutes.indexOf(value));
      sounds.playJuke();
      if (activeDefense === 'P2') {
        applyDefensiveAlignment(true, true);
      }
    } else if (role === 'DEFENDER') {
      const defenderIndex = defenders.indexOf(target);
      if (value === 'DEFAULT') {
        defenseOverrides.delete(defenderIndex);
      } else {
        defenseOverrides.set(defenderIndex, value as 'BLITZ' | 'MAN' | 'ZONE' | 'QB_SPY' | 'RB_SPY');
      }
      applyDefensiveAlignment(true, false);
      sounds.playJuke();
      if (activeOffense === 'P2') {
        triggerCpuOffensiveAudible(false);
      }
    }
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  function getOpponentDefenseKey(): string {
    return (activeDefense === 'P1') ? p1DefPlay : p2DefPlay;
  }

  function getPlayMatchup(playKey: string, defenseKey: string) {
    const play = offensivePlaybook[playKey];
    const isGoodMatch = play?.bestVs?.includes(defenseKey);
    const isBadMatch = play?.weakVs?.includes(defenseKey);

    if (isGoodMatch) {
      return {
        momentumDelta: play.risk === 'EXPLOSIVE' ? 2 : 1,
        successBonus: 0.12
      };
    }

    if (isBadMatch) {
      return {
        momentumDelta: play.risk === 'EXPLOSIVE' ? -2 : -1,
        successBonus: -0.12
      };
    }

    return {
      momentumDelta: 0,
      successBonus: 0
    };
  }

  function applyMomentum(delta: number): void {
    if (delta === 0) return;
    momentum = clamp(momentum + delta, -3, 3);
    setMomentumState(momentum);
    if (momentum >= 2 || momentum <= -2) {
      showAnnouncement(momentum >= 2 ? 'MOMENTUM SHIFT! BIG PLAY ENERGY.' : 'DEFENSE HAS THE EDGE.', momentum >= 2 ? '#00ffaa' : '#ff6666');
    }
  }

  function getReceiverRouteRepeatCount(rec: Entity): number {
    const recentPlays = userPlayHistory.slice(-5);
    const isCenterSlot = (rec === centerReceiver);
    const isRb = (rec === rb);
    const isLeftWr = (rec === receivers[0]);
    const isSlotWr = (rec === receivers[1]);
    const isRightWr = (rec === receivers[2]);

    return recentPlays.filter(p => {
      if (isCenterSlot) return p.routes?.center === rec.routeType;
      if (isRb) return p.routes?.rb === rec.routeType;
      if (isLeftWr) return p.routes?.left === rec.routeType;
      if (isSlotWr) return p.routes?.slot === rec.routeType;
      if (isRightWr) return p.routes?.right === rec.routeType;
      return false;
    }).length;
  }

  function applyDefenseOverrides() {
    defenders.forEach((defender, index) => {
      const override = defenseOverrides.get(index);
      const assignment = override ?? (defender.passRusher ? 'BLITZ' : defender.assignedReceiver ? 'MAN' : 'ZONE');
      defender.defenseAssignment = assignment;
      if (assignment === 'QB_SPY') {
        defender.isQbSpy = true;
        defender.passRusher = false;
        defender.assignedReceiver = undefined;
        // Position spy tight across from QB in the second level (18px off LOS)
        defender.startX = 170;
        defender.startY = lineOfScrimmageY + (18 * attackDirection);
        defender.x = 170;
        defender.y = defender.startY;
        return;
      }
      if (assignment === 'RB_SPY') {
        defender.isQbSpy = false;
        defender.passRusher = false;
        defender.assignedReceiver = rb || undefined;
        // Position spy directly across from the RB, shading the flat lane (16px off LOS)
        const targetSideX = rb ? (rb.x > 170 ? Math.min(270, rb.x + 20) : Math.max(70, rb.x - 20)) : 170;
        defender.startX = targetSideX;
        defender.startY = lineOfScrimmageY + (16 * attackDirection);
        defender.x = targetSideX;
        defender.y = defender.startY;
        return;
      }
      defender.isQbSpy = false;
      if (!override) return;
      defender.passRusher = assignment === 'BLITZ';
      defender.assignedReceiver = undefined;
    });

    const eligibleReceivers = [...receivers, centerReceiver, rb]
      .filter((receiver): receiver is Entity => receiver !== null && !receiver.caught);

    defenders.forEach((defender, index) => {
      if (defenseOverrides.get(index) !== 'MAN') return;
      const coveredReceivers = new Set(
        defenders
          .filter(other => other !== defender && other.defenseAssignment !== 'BLITZ' && other.defenseAssignment !== 'ZONE')
          .map(other => other.assignedReceiver)
          .filter((receiver): receiver is Entity => receiver !== undefined && receiver !== null)
      );
      const openReceivers = eligibleReceivers.filter(receiver => !coveredReceivers.has(receiver));
      const candidates = openReceivers.length > 0 ? openReceivers : eligibleReceivers;
      defender.assignedReceiver = candidates
        .slice()
        .sort((first, second) =>
          Math.hypot(first.x - defender.x, first.y - defender.y) -
          Math.hypot(second.x - defender.x, second.y - defender.y)
        )[0];
    });
  }

  function positionRBDefender() {
    const runningBack = rb;
    if (!runningBack || defenders.length === 0) return;

    const currentMatch = defenders.find(defender => defender.assignedReceiver === runningBack && !defender.passRusher);
    const eligibleDefenders = defenders.filter(defender => !defender.passRusher && defender.defenseAssignment !== 'BLITZ');
    const unassignedDefenders = eligibleDefenders.filter(defender => !defender.assignedReceiver);
    const candidates = unassignedDefenders.length > 0 ? unassignedDefenders : eligibleDefenders;
    const rbDefender = currentMatch || candidates.slice().sort((first, second) =>
      Math.hypot(first.x - runningBack.x, first.y - runningBack.y) - Math.hypot(second.x - runningBack.x, second.y - runningBack.y)
    )[0];

    if (!rbDefender) return;
    const previousPosition = { x: rbDefender.x, y: rbDefender.y };
    rbDefender.assignedReceiver = runningBack;
    rbDefender.defenseAssignment = 'MAN';
    alignDefenderAcrossFromRunningBack(rbDefender, runningBack, lineOfScrimmageY, attackDirection, fieldWidth);
    if (phase === 'PRE_SNAP' && (previousPosition.x !== rbDefender.x || previousPosition.y !== rbDefender.y)) {
      startFormationTransition([rbDefender], [previousPosition]);
    }
  }

  function executeAiPreSnapShift(): void {
    if (activeDefense !== 'P2' || defenders.length === 0) return;
    const recentRbPasses = userPlayHistory.slice(-4).filter(p => p.targetWasRb || p.isFlatPass || p.routes?.rb === 'FLAT').length;
    if (recentRbPasses >= 1 && rb) {
      const targetSideX = rb.x > 170 ? Math.min(270, rb.x + 25) : Math.max(70, rb.x - 25);
      const flatDef = defenders.find(d => d && (d.defenseAssignment === 'RB_SPY' || d.assignedReceiver === rb))
        || defenders[4] || defenders[3];
      if (flatDef) {
        flatDef.startX = targetSideX;
        flatDef.startY = lineOfScrimmageY + (16 * attackDirection);
      }
    } else {
      const lb = defenders[3] || defenders[4];
      if (lb && (currentDown === 3 || currentDown === 4) && yardsToGo <= 3) {
        lb.startY = lineOfScrimmageY + (16 * attackDirection);
      }
    }
  }

  let touchStartX = 0;
  let touchStartY = 0;
  let touchScreenStartX = 0;
  let touchScreenStartY = 0;
  let touchStartTime = 0;
  let isAiming = false;
  let aimCurrentX = 0, aimCurrentY = 0;
  let aimScreenCurrentX = 0, aimScreenCurrentY = 0;
  let lastTapTime = 0;
  let lastDefenseSelectTime = 0;

  function getScreenCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvas!.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (fieldWidth / rect.width),
      y: (clientY - rect.top) * (450 / rect.height)
    };
  }

  function selectCoverageBreakers(targetX: number, targetY: number): Entity[] {
    const isTargetingRb = Boolean(rb && Math.hypot(targetX - rb.x, targetY - rb.y) < 70);
    const rbDef = isTargetingRb
      ? defenders.find(d => d && (d.defenseAssignment === 'RB_SPY' || d.assignedReceiver === rb))
      : null;

    const others = defenders
      .filter(defender => !defender.passRusher && defender !== rbDef)
      .map(defender => ({
        defender,
        distance: Math.hypot(defender.x - targetX, defender.y - targetY)
      }))
      .filter(candidate => candidate.distance < 160)
      .sort((first, second) => first.distance - second.distance)
      .map(candidate => candidate.defender);

    if (rbDef) {
      return [rbDef, ...others.slice(0, 1)];
    }
    return others.slice(0, 2);
  }

  function resizeGame() {
    if (!canvas) return;
    const availableHeight = window.innerHeight - 95;
    const availableWidth = window.innerWidth - 10;

    canvas.width = fieldWidth;
    canvas.height = 450;

    const scale = Math.min(availableWidth / fieldWidth, availableHeight / canvas.height);
    canvas.style.width = (fieldWidth * scale) + 'px';
    canvas.style.height = (canvas.height * scale) + 'px';
  }

  window.addEventListener('resize', resizeGame);
  resizeGame();

  // Adaptive CPU Defensive Counter-Calling (Tendency Countering)
  function getAdaptiveDefensiveCall(): string {
    const totalPlays = userPlayHistory.length;

    // 1. Situational down & distance rules
    // 3rd & Long or 4th & Long (> 6 yards): player must target first down marker
    if ((currentDown === 3 || currentDown === 4) && yardsToGo > 6) {
      return 'QUARTERS';
    }

    // 3rd & Short or 4th & Short (<= 3 yards): short power run or quick slant expected
    if ((currentDown === 3 || currentDown === 4) && yardsToGo <= 3) {
      return Math.random() < 0.65 ? 'BLITZ' : 'ROBBER';
    }

    // Early down / starting default
    if (totalPlays < 2) {
      return Math.random() < 0.5 ? 'COVER3' : 'QUARTERS';
    }

    // 2. Recent Tendency Analysis (last 4 plays)
    const recentPlays = userPlayHistory.slice(-4);
    const recentDeepCount = recentPlays.filter(p => p.play === 'DEEP_SHOT').length;
    const recentShortPassCount = recentPlays.filter(p => p.play === 'SHORT_PASS').length;
    const recentRunCount = recentPlays.filter(p => !p.isPass).length;
    const lastPlay = recentPlays[recentPlays.length - 1];
    const secondLastPlay = recentPlays.length >= 2 ? recentPlays[recentPlays.length - 2] : null;

    // Repeat play spam detector (same play called 2 times in a row or 2+ times in recent history)
    const isSamePlaySpammed = Boolean(
      (secondLastPlay && lastPlay.play === secondLastPlay.play) ||
      (recentPlays.filter(p => p.play === lastPlay.play).length >= 2)
    );
    if (isSamePlaySpammed) {
      if (lastPlay.play === 'DEEP_SHOT') {
        return 'QUARTERS';
      }
      if (lastPlay.play === 'SHORT_PASS') {
        return 'ROBBER';
      }
      if (lastPlay.play === 'CONTROL_PASS') {
        return Math.random() < 0.5 ? 'TAMPA2' : 'COVER2MAN';
      }
      if (!lastPlay.isPass) {
        return 'BLITZ';
      }
    }

    // QB Run / Scramble Tendency: User is scrambling or running with the QB!
    const recentQbRuns = recentPlays.filter(p => p.isQbRun).length;
    if (recentQbRuns >= 2) {
      // User is repeatedly scrambling or running with the QB: call zero blitz contain with spy
      return 'BLITZ';
    } else if (recentQbRuns >= 1) {
      // Call Cover 2 Man or Robber with an adaptive QB Spy
      return Math.random() < 0.5 ? 'COVER2MAN' : 'ROBBER';
    }

    // RB Pass & Flat Tendency: User is targeting or spamming passes to the RB in the flat!
    const recentRbPassCount = recentPlays.filter(p => p.targetWasRb || p.isFlatPass || p.routes?.rb === 'FLAT').length;
    if (recentRbPassCount >= 2) {
      return Math.random() < 0.5 ? 'COVER2MAN' : 'ROBBER';
    }

    // Formation Tendency
    const recentFormations = recentPlays.map(p => p.formation).filter(Boolean);
    const tripsCount = recentFormations.filter(f => f === 'TRIPS').length;
    const stackCount = recentFormations.filter(f => f === 'STACK').length;
    if (tripsCount >= 2) {
      return 'QUARTERS';
    }
    if (stackCount >= 2) {
      return Math.random() < 0.5 ? 'TAMPA2' : 'COVER2MAN';
    }

    // Deep Shot Tendency (> 40% of recent plays)
    if (recentDeepCount >= 2 || (recentDeepCount / recentPlays.length) >= 0.4) {
      return 'QUARTERS';
    }

    // Ground-and-Pound Tendency (> 50% runs)
    if (recentRunCount >= 2 || (recentRunCount / recentPlays.length) >= 0.5) {
      return Math.random() < 0.65 ? 'BLITZ' : 'COVER3';
    }

    // Short Pass / Slant-heavy
    if (recentShortPassCount >= 2) {
      return 'ROBBER';
    }

    // 3. Overall Career Tendency
    const totalPass = userPlayHistory.filter(p => p.isPass).length;
    const passRatio = totalPass / totalPlays;

    if (passRatio > 0.75) {
      return Math.random() < 0.6 ? 'QUARTERS' : 'TAMPA2';
    } else if (passRatio < 0.35) {
      return Math.random() < 0.6 ? 'BLITZ' : 'COVER3';
    }

    const balancedOptions = ['COVER3', 'TAMPA2', 'COVER2MAN', 'QUARTERS'];
    return balancedOptions[Math.floor(Math.random() * balancedOptions.length)];
  }

  // CPU Offensive Play Selection using tactical football knowledge & situational awareness
  function getCpuOffensivePlayCall(): string {
    const recentDefenses = userDefenseHistory.slice(-4);
    const defenseCounts = new Map<string, number>();
    recentDefenses.forEach(defense => {
      defenseCounts.set(defense, (defenseCounts.get(defense) || 0) + 1);
    });
    const repeatedDefense = [...defenseCounts.entries()]
      .find(([, count]) => count >= 3)?.[0];

    if (repeatedDefense && Math.random() < 0.75) {
      let counterPlays: string[];

      if ((currentDown === 3 || currentDown === 4) && yardsToGo > 7) {
        counterPlays = repeatedDefense === 'COVER3' || repeatedDefense === 'QUARTERS'
          ? ['POST_WHEEL', 'SMASH', 'CONTROL_PASS', 'SHORT_PASS']
          : ['POST_WHEEL', 'DEEP_SHOT', 'CONTROL_PASS'];
      } else if ((currentDown === 3 || currentDown === 4) && yardsToGo <= 3) {
        counterPlays = ['MESH', 'SHORT_PASS', 'CONTROL_PASS', 'POWER'];
      } else {
        switch (repeatedDefense) {
          case 'COVER3':
            counterPlays = ['POST_WHEEL', 'SMASH', 'CONTROL_PASS', 'SHORT_PASS'];
            break;
          case 'QUARTERS':
            counterPlays = ['POST_WHEEL', 'SMASH', 'SHORT_PASS', 'CONTROL_PASS'];
            break;
          case 'COVER2MAN':
            counterPlays = ['MESH', 'SHORT_PASS', 'SMASH', 'POWER'];
            break;
          case 'TAMPA2':
            counterPlays = ['SMASH', 'CONTROL_PASS', 'POST_WHEEL'];
            break;
          case 'BLITZ':
            counterPlays = ['MESH', 'SHORT_PASS', 'POWER', 'ISO'];
            break;
          case 'ROBBER':
            counterPlays = ['POST_WHEEL', 'SMASH', 'DEEP_SHOT', 'CONTROL_PASS'];
            break;
          default:
            counterPlays = [];
        }
      }

      if (counterPlays.length > 0) {
        return counterPlays[Math.floor(Math.random() * counterPlays.length)];
      }
    }

    // 1. Situational Down & Distance:
    // 3rd & Long or 4th & Long (> 7 yards): Must attack past the line of gain downfield
    if ((currentDown === 3 || currentDown === 4) && yardsToGo > 7) {
      const deepOptions = ['POST_WHEEL', 'DEEP_SHOT', 'SMASH', 'CONTROL_PASS'];
      return deepOptions[Math.floor(Math.random() * deepOptions.length)];
    }

    // 3rd & Short or 4th & Short (<= 3 yards): Favor quick passes & rubs while keeping a power run
    if ((currentDown === 3 || currentDown === 4) && yardsToGo <= 3) {
      const shortOptions = ['MESH', 'SHORT_PASS', 'CONTROL_PASS', 'POWER'];
      return shortOptions[Math.floor(Math.random() * shortOptions.length)];
    }

    // Red zone (within 20 yards of endzone):
    const distToEndzone = attackDirection === -1 ? lineOfScrimmageY - endZoneHeight : (fieldHeight - endZoneHeight) - lineOfScrimmageY;
    if (distToEndzone < 200) {
      const rzOptions = ['MESH', 'SHORT_PASS', 'SMASH', 'POWER'];
      return rzOptions[Math.floor(Math.random() * rzOptions.length)];
    }

    // 2nd & Long (> 8 yards): Passing situation
    if (currentDown === 2 && yardsToGo > 8) {
      const secondLongOptions = ['SMASH', 'POST_WHEEL', 'CONTROL_PASS', 'DEEP_SHOT'];
      return secondLongOptions[Math.floor(Math.random() * secondLongOptions.length)];
    }

    // 2nd & Short (<= 4 yards): Favor passes, with a sweep as the run change-up
    if (currentDown === 2 && yardsToGo <= 4) {
      const shotDownOptions = ['MESH', 'SHORT_PASS', 'CONTROL_PASS', 'SMASH', 'SWEEP'];
      return shotDownOptions[Math.floor(Math.random() * shotDownOptions.length)];
    }

    // 1st & 10: Pass-forward pro-style script (80% pass, 20% run)
    const isPass = Math.random() < 0.80;
    if (isPass) {
      const passPlays = ['MESH', 'SMASH', 'POST_WHEEL', 'SHORT_PASS', 'CONTROL_PASS', 'DEEP_SHOT'];
      return passPlays[Math.floor(Math.random() * passPlays.length)];
    } else {
      const runPlays = ['SWEEP', 'ISO', 'POWER'];
      return runPlays[Math.floor(Math.random() * runPlays.length)];
    }
  }

  // CPU Play Selection: CPU autonomously calls its own offense or defense
  function runCpuAiPlaySelection() {
    if (activeOffense === 'P2') {
      p2OffPlay = getCpuOffensivePlayCall();
      setP2OffPlayState(p2OffPlay);
    }
    if (activeDefense === 'P2') {
      p2DefPlay = getAdaptiveDefensiveCall();
      setP2DefPlayState(p2DefPlay);
    }
  }

  function updateDownDisplay() {
    // Offense's own goal line Y coordinate: y = 1100 when attacking UP (-1), or y = 100 when attacking DOWN (+1)
    const ownGoalLineY = (attackDirection === -1) ? (fieldHeight - endZoneHeight) : endZoneHeight;
    const distFromOwnGoal = Math.abs(lineOfScrimmageY - ownGoalLineY);
    const yardsFromOwnGoal = Math.round(distFromOwnGoal / 10);

    let yardLineNum: number;
    let territory: string;
    if (yardsFromOwnGoal < 50) {
      yardLineNum = yardsFromOwnGoal;
      territory = "OWN";
    } else if (yardsFromOwnGoal > 50) {
      yardLineNum = 100 - yardsFromOwnGoal;
      territory = "OPP";
    } else {
      yardLineNum = 50;
      territory = "MIDFIELD";
    }

    let suffix = 'th';
    if (currentDown === 1) suffix = 'st';
    else if (currentDown === 2) suffix = 'nd';
    else if (currentDown === 3) suffix = 'rd';

    const distToOppGoal = 100 - yardsFromOwnGoal;
    let distanceStr = `${Math.round(yardsToGo)}`;
    if (yardsToGo >= distToOppGoal && distToOppGoal <= 10) {
      distanceStr = "Goal";
    }

    let displayStr = `${currentDown}${suffix} & ${distanceStr}`;
    if (yardLineNum !== 50) {
      displayStr += ` at ${territory} ${yardLineNum}`;
    } else {
      displayStr += ` at 50`;
    }
    setDownDistanceText(displayStr);
  }

  function publishGameClock(): void {
    setGameClockState(quarter, gameClockSeconds);
  }

  function endQuarter(): void {
    pendingQuarterEnd = false;
    gameClockSeconds = 0;
    gameClockRunning = false;
    gameClockRemainderMs = 0;
    phase = 'DEAD';

    if (quarter === 4) {
      gameOver = true;
      showAnnouncement('END OF 4TH QUARTER - FINAL', '#ffcc00');
    } else {
      quarterBreakRemainingMs = quarter === 2 ? 5600 : 2800;
      halftimeAnnouncementPending = quarter === 2;
      const ordinal = quarter === 1 ? '1ST' : quarter === 2 ? '2ND' : '3RD';
      showAnnouncement(`END OF ${ordinal} QUARTER`, '#ffcc00');
    }
    publishGameClock();
  }

  function updateGameClock(timestamp: number): void {
    if (lastClockFrameTime === null) {
      lastClockFrameTime = timestamp;
      return;
    }

    const elapsedMs = Math.max(0, timestamp - lastClockFrameTime);
    lastClockFrameTime = timestamp;

    if (quarterBreakRemainingMs > 0) {
      const previousBreakMs = quarterBreakRemainingMs;
      quarterBreakRemainingMs = Math.max(0, quarterBreakRemainingMs - elapsedMs);
      if (halftimeAnnouncementPending && previousBreakMs > 2800 && quarterBreakRemainingMs <= 2800) {
        halftimeAnnouncementPending = false;
        showAnnouncement('HALFTIME', '#00ffff');
      }
      if (quarterBreakRemainingMs === 0) {
        quarter++;
        gameClockSeconds = 120;
        gameClockRunning = false;
        publishGameClock();
        if (quarter === 3) {
          activeOffense = 'P2';
          activeDefense = 'P1';
          setActiveOffenseState('P2');
          attackDirection = -1;
          lineOfScrimmageY = fieldHeight - endZoneHeight - 350;
          firstDownMarkerY = lineOfScrimmageY + (100 * attackDirection);
          currentDown = 1;
          yardsToGo = 10;
          resetDrill();
        } else {
          resetDrill();
        }
      }
      return;
    }

    if (gameOver) return;

    // Requirement: "Stop the clock between after every play so the user can change alignment. Start the clock when the play starts again"
    const isPlayActive = phase === 'QB_DROP' || phase === 'HANDOFF' || phase === 'RUNNING' || phase === 'THROWN' || phase === 'FUMBLE';
    if (!isPlayActive) {
      gameClockRunning = false;
      return;
    }

    // If clock hit zero during an active play, allow the play to complete without cutting it off!
    if (gameClockSeconds === 0) {
      gameClockRunning = false;
      pendingQuarterEnd = true;
      return;
    }

    gameClockRunning = true;
    const clockMultiplier = 3;
    gameClockRemainderMs += elapsedMs * clockMultiplier;
    while (gameClockRemainderMs >= 1000 && gameClockSeconds > 0) {
      gameClockRemainderMs -= 1000;
      gameClockSeconds--;
      publishGameClock();
      if (gameClockSeconds === 30) {
        showAnnouncement(`30 SECONDS LEFT IN QUARTER ${quarter}`, '#ffcc00');
      } else if (gameClockSeconds === 10) {
        showAnnouncement(`10 SECONDS LEFT IN QUARTER ${quarter}`, '#ff6666');
      }
      if (gameClockSeconds === 0) {
        // Requirement: "If a play starts before the game clock hits zero, that play should play out until the end of the play. The play does not stop."
        gameClockRunning = false;
        pendingQuarterEnd = true;
        publishGameClock();
        return;
      }
    }
  }

  function applyDefensiveAlignment(preservePositions = false, assignRBDefender = true) {
    const activeDefKey = (activeDefense === 'P1') ? p1DefPlay : p2DefPlay;
    const previousPositions = preservePositions
      ? defenders.map(({ x, y }) => ({ x, y }))
      : null;
    alignDefenders(defenders, activeDefKey, attackDirection, lineOfScrimmageY, receivers, centerReceiver);
    if (rb && defenders[4] && !defenders[4].passRusher) {
      defenders[4].assignedReceiver = rb;
    }
    if (activeDefense === 'P2') {
      defenseOverrides = chooseCpuDefensiveAssignments(
        defenders,
        [...receivers, centerReceiver, rb].filter((receiver): receiver is Entity => receiver !== null),
        {
          down: currentDown,
          yardsToGo,
          lineOfScrimmageY,
          attackDirection,
          recentPlays: userPlayHistory
        }
      );
    }
    applyDefenseOverrides();
    if (previousPositions) {
      defenders.forEach((defender, index) => {
        defender.x = previousPositions[index].x;
        defender.y = previousPositions[index].y;
      });
    }
    if (assignRBDefender) positionRBDefender();
  }

  function swapPossession() {
    gameClockRunning = false;
    activeOffense = (activeOffense === 'P1') ? 'P2' : 'P1';
    activeDefense = (activeDefense === 'P1') ? 'P2' : 'P1';
    setActiveOffenseState(activeOffense);
    attackDirection *= -1;

    currentDown = 1;
    yardsToGo = 10;
    firstDownMarkerY = lineOfScrimmageY + (100 * attackDirection);
    updateDownDisplay();
    runCpuAiPlaySelection();
  }

  function swapPossessionOnPlay(endingY: number) {
    gameClockRunning = false;
    activeOffense = (activeOffense === 'P1') ? 'P2' : 'P1';
    activeDefense = (activeDefense === 'P1') ? 'P2' : 'P1';
    setActiveOffenseState(activeOffense);
    attackDirection *= -1;

    lineOfScrimmageY = endingY;
    currentDown = 1;
    yardsToGo = 10;
    firstDownMarkerY = lineOfScrimmageY + (100 * attackDirection);
    updateDownDisplay();
    runCpuAiPlaySelection();
  }

  function startInterceptionReturn(x: number, y: number, message: string, color: string): void {
    const returner = defenders.reduce<Entity | null>((closest, defender) => {
      if (!closest) return defender;
      return Math.hypot(defender.x - x, defender.y - y) < Math.hypot(closest.x - x, closest.y - y)
        ? defender
        : closest;
    }, null);

    if (!returner) {
      phase = 'DEAD';
      handlePlayEnd(y, 'INT', message, color);
      return;
    }

    gameClockRunning = true;
    activeOffense = activeOffense === 'P1' ? 'P2' : 'P1';
    activeDefense = activeDefense === 'P1' ? 'P2' : 'P1';
    setActiveOffenseState(activeOffense);
    attackDirection *= -1;
    lineOfScrimmageY = y;
    currentDown = 1;
    yardsToGo = 10;
    firstDownMarkerY = lineOfScrimmageY + (100 * attackDirection);
    updateDownDisplay();
    runCpuAiPlaySelection();

    defenders.forEach(defender => { defender.hasBall = false; });
    qb.hasBall = false;
    returner.hasBall = true;
    returner.x = x;
    returner.y = y;
    returner.vx = 0;
    returner.vy = 0;
    returner.tackleImmunity = 0;
    activeEntity = returner;
    isInterceptionReturn = true;
    isAiming = false;
    ball = null;
    playClock = 0;
    phase = 'RUNNING';
    screenShakeTimer = 26;
    sounds.playCatch();
    showAnnouncement(`${message} ${returner.type || 'DEFENDER'} IS THE NEW BALL CARRIER!`, color, true);

    // Requirement: "When the ball is intercepted, the team pursuing the ball carrier should immediately gain the same speed traits as the defense chasing a ball carrier."
    const pursuers = [qb, rb, centerReceiver, ...receivers, ...linemen].filter((p): p is Entity => Boolean(p));
    pursuers.forEach(p => {
      p.pursuitTimer = 20; // Immediately gain accelerating pursuit momentum
      p.brokenTackleStun = 0;
      p.vx = 0;
      p.vy = 0;
    });
  }

  function checkFirstDownOrTurnover() {
    const reachedFirstDown = (attackDirection === -1 && lineOfScrimmageY <= firstDownMarkerY) || (attackDirection === 1 && lineOfScrimmageY >= firstDownMarkerY);

    if (reachedFirstDown) {
      showAnnouncement("FIRST DOWN!", "#00ffaa", true);
      sounds.playWhistle();
      currentDown = 1;
      yardsToGo = 10;
      firstDownMarkerY = lineOfScrimmageY + (100 * attackDirection);
      updateDownDisplay();
    } else if (currentDown > 4) {
      showAnnouncement("TURNOVER ON DOWNS!", "#ff6666");
      sounds.playWhistle();
      swapPossession();
    } else {
      updateDownDisplay();
    }
  }

  function scheduleDrillReset() {
    setTimeout(() => {
      if (pendingQuarterEnd || gameClockSeconds === 0) {
        pendingQuarterEnd = false;
        endQuarter();
        return;
      }
      resetDrill();
    }, 1600);
  }

  function handlePlayEnd(endingY: number, resultType: string, customMessage?: string, customColor?: string) {
    if (playEnding) return;
    playEnding = true;
    const endedInterceptionReturn = isInterceptionReturn;
    const endedOffense = activeOffense;

    const activePlayKey = (activeOffense === 'P1') ? p1OffPlay : p2OffPlay;
    const matchup = getPlayMatchup(activePlayKey, getOpponentDefenseKey());
    const playResult = resolvePlayResult({
      lineOfScrimmageY,
      endingY,
      attackDirection,
      resultType,
      fieldHeight,
      endZoneHeight
    });
    const yardsGained = playResult.yardsGained;

    if (playResult.isTouchdown) {
      gameClockRunning = false;
      sounds.playTouchdown();
      applyMomentum(2);
      if (activeOffense === 'P1') {
        p1Score += 7;
        setUserScore(p1Score);
        showAnnouncement(
          endedInterceptionReturn
            ? `PICK-SIX! INTERCEPTION RETURNED FOR ${yardsGained} YARDS! TOUCHDOWN P1!`
            : "TOUCHDOWN P1! (+7 Points)",
          "#00ffff",
          endedInterceptionReturn
        );
      } else {
        p2Score += 7;
        setCpuScore(p2Score);
        showAnnouncement(
          endedInterceptionReturn
            ? `PICK-SIX! INTERCEPTION RETURNED FOR ${yardsGained} YARDS! TOUCHDOWN P2!`
            : "TOUCHDOWN P2 / CPU! (+7 Points)",
          "#ff3333",
          endedInterceptionReturn
        );
      }
      attackDirection *= -1;
      activeOffense = activeOffense === 'P1' ? 'P2' : 'P1';
      activeDefense = activeDefense === 'P1' ? 'P2' : 'P1';
      setActiveOffenseState(activeOffense);
      lineOfScrimmageY = attackDirection === -1
        ? fieldHeight - endZoneHeight - 350
        : endZoneHeight + 350;
      currentDown = 1;
      yardsToGo = 10;
      firstDownMarkerY = lineOfScrimmageY + (100 * attackDirection);
    } else if (resultType === 'INT') {
      gameClockRunning = false;
      sounds.playWhistle();
      showAnnouncement(customMessage || "INTERCEPTION! TURNOVER ON THE PLAY!", customColor || "#ffcc00", true);
      swapPossessionOnPlay(endingY);
    } else if (resultType === 'SACK') {
      gameClockRunning = false;
      sounds.playTackle();
      lineOfScrimmageY = endingY;
      yardsToGo = calculateYardsToGo(lineOfScrimmageY, firstDownMarkerY, attackDirection);
      currentDown++;
      applyMomentum(matchup.momentumDelta - 1);
      const suffix = currentDown === 1 ? 'st' : currentDown === 2 ? 'nd' : currentDown === 3 ? 'rd' : 'th';
      showAnnouncement(customMessage || `SACK! Loss of ${Math.abs(yardsGained)} yards. (${currentDown}${suffix} Down)`, customColor || "#ff3333");
      checkFirstDownOrTurnover();
    } else if (resultType === 'INCOMPLETE' || resultType === 'DEFLECT' || resultType === 'BATTED_DOWN' || resultType === 'BROKEN_UP') {
      gameClockRunning = false;
      sounds.playWhistle();
      currentDown++;
      applyMomentum(matchup.momentumDelta - 1);
      const messagePrefix = customMessage ? `${customMessage} • ` : 'PASS INCOMPLETE. ';
      showAnnouncement(`${messagePrefix}(${currentDown} Down)`, customColor || "#aaaaaa");
      checkFirstDownOrTurnover();
    } else {
      gameClockRunning = false;
      sounds.playTackle();
      lineOfScrimmageY = endingY;
      yardsToGo = calculateYardsToGo(lineOfScrimmageY, firstDownMarkerY, attackDirection);
      currentDown++;
      applyMomentum(Math.max(0, matchup.momentumDelta) + (yardsGained >= 12 ? 1 : 0) - (yardsGained <= 2 ? 1 : 0));
      showAnnouncement(`Gain of ${yardsGained} yards. (${currentDown} Down, ${Math.max(0, yardsToGo)} yards to go)`, "#ffcc00");
      checkFirstDownOrTurnover();
    }

    if (endedInterceptionReturn && !playResult.isTouchdown) {
      currentDown = 1;
      yardsToGo = 10;
      firstDownMarkerY = lineOfScrimmageY + (100 * attackDirection);
      updateDownDisplay();
      showAnnouncement(`INTERCEPTION RETURNED FOR ${yardsGained} YARDS!`, '#ffcc00', true);
    }
    isInterceptionReturn = false;

    if (endedOffense === 'P1') {
      const isQbRun = Boolean(activeEntity === qb);
      const isRbPlay = Boolean(activeEntity === rb || lastTargetWasRb);
      userPlayHistory.push({
        play: p1OffPlay,
        isPass: offensivePlaybook[p1OffPlay]?.type === 'PASS',
        down: currentDown,
        distance: yardsToGo,
        yardsGained,
        isQbRun,
        targetWasRb: isRbPlay,
        isFlatPass: Boolean(isRbPlay && (rb?.routeType === 'FLAT' || (rb && Math.abs(rb.x - 170) > 45))),
        formation: p1OffFormation,
        routes: {
          left: receivers[0]?.routeType,
          slot: receivers[1]?.routeType,
          center: centerReceiver?.routeType,
          right: receivers[2]?.routeType,
          rb: rb?.routeType
        }
      });
      if (userPlayHistory.length > 12) userPlayHistory.shift();
    }

    runCpuAiPlaySelection();

    scheduleDrillReset();
  }

  function startFormationTransition(entities: Entity[], fromPositions: Array<{ x: number; y: number }>) {
    formationTransitions = [];
    if (entities.length !== fromPositions.length) return;
    formationTransitionFrame = 0;
    formationTransitions = entities.map((entity, index) => ({
      entity,
      fromX: fromPositions[index].x,
      fromY: fromPositions[index].y,
      toX: entity.x,
      toY: entity.y
    }));
    formationTransitions.forEach(({ entity, fromX, fromY }) => {
      entity.x = fromX;
      entity.y = fromY;
    });
  }

  function resetDrill(animateAlignment = false) {
    const previousEntities = [...receivers, centerReceiver, rb, ...defenders].filter((entity): entity is Entity => entity !== null);
    const previousPositions = animateAlignment ? previousEntities.map(({ x, y }) => ({ x, y })) : [];
    formationTransitions = [];
    if (gameOver || quarterBreakRemainingMs > 0) return;
    phase = 'PRE_SNAP';
    playEnding = false;
    isInterceptionReturn = false;
    isAllBlocking = false;
    ball = null;
    ballPressureDefenders = [];
    fumbleBall = null;
    brokenTackleEffect = null;
    isAiming = false;
    gestureEntity = null;
    isDirtGestureActive = false;
    coverageMistakeEvaluated = false;
    playClock = 0;
    cpuScrambleDecisionMade = false;
    qbScrambleReactionTimer = 0;
    lastTargetWasRb = false;
    aiPreSnapShiftTimer = 0;

    qb.x = 170;
    qb.y = lineOfScrimmageY - (48 * attackDirection);
    qb.vx = 0;
    qb.vy = 0;
    qb.dropStepTimer = 0;
    qb.boostUsed = false;
    qb.powerBoostTimer = 0;
    qb.tackleImmunity = 0;
    qb.brokenTacklesCount = 0;
    qb.jukeCount = 0;
    qb.jukeCooldownTimer = 0;
    qb.jukeTimer = 0;
    qb.hasBall = false;
    currentViewHeight = 450;
    cameraScale = 1.0;
    cameraOffsetX = 0;

    cameraY = Math.max(cameraWorldTop, Math.min(cameraWorldBottom - 450, lineOfScrimmageY - 225));
    updateDownDisplay();

    if (activeOffense === 'P2') {
      if (activeDefense === 'P1') {
        userDefenseHistory.push(p1DefPlay);
        if (userDefenseHistory.length > 12) userDefenseHistory.shift();
      }
      p2OffPlay = getCpuOffensivePlayCall();
      setP2OffPlayState(p2OffPlay);
    }
    if (activeDefense === 'P2') {
      p2DefPlay = getAdaptiveDefensiveCall();
      setP2DefPlayState(p2DefPlay);
    }

    if (momentum !== 0) {
      momentum = 0;
      setMomentumState(0);
    }

    const activePlayName = (activeOffense === 'P1') ? p1OffPlay : p2OffPlay;
    const activePlay = offensivePlaybook[activePlayName];
    const alignment = activeOffense === 'P1' ? p1OffFormation : activePlay.alignment || 'SPREAD';
    const alignmentPositions = alignment === 'STACK'
      ? { left: 80, slot: 105, center: 215, right: 275, rb: 220, rbSide: 'right' as const }
      : alignment === 'TRIPS'
        ? { left: 50, slot: 215, center: 250, right: 290, rb: 90, rbSide: 'left' as const }
        : { left: 45, slot: 115, center: 225, right: 295, rb: 220, rbSide: 'right' as const };

    const leftRoute = activePlay.left || 'GO';
    const rightRoute = activePlay.right || 'GO';
    const centerRoute = activePlay.center || 'SLANT-R';
    const slotRoute = activePlay.type === 'PASS' ? (alignment === 'TRIPS' ? 'CROSS-L' : 'SLANT-L') : 'BLOCK';

    const offTeam = activeOffense === 'P1' ? p1Team : p2Team;
    const defTeam = activeDefense === 'P1' ? p1Team : p2Team;

    qb.color = offTeam.qbColor || '#ffea00';

    // Roster speeds: Faster receivers (Speedster left WR, slot agility) and faster defenders (Lockdown CB, Ball-hawk FS)
    receivers = [
      {
        startX: alignmentPositions.left, startY: lineOfScrimmageY, x: alignmentPositions.left, y: lineOfScrimmageY, vx: 0, vy: 0, radius: 10,
        routeType: leftRoute, routeIndex: Math.max(0, outsideRoutes.indexOf(leftRoute)), timer: 0, flash: 0, caught: false, isOutside: true,
        color: offTeam.primaryColor,
        archetype: 'SPEEDSTER',
        speedMultiplier: 1.18 * (offTeam.ratings.wrSpeed || 1.0),
        isBlocker: leftRoute === 'BLOCK'
      },
      {
        startX: alignmentPositions.slot, startY: lineOfScrimmageY, x: alignmentPositions.slot, y: lineOfScrimmageY, vx: 0, vy: 0, radius: 10,
        routeType: slotRoute, routeIndex: Math.max(0, middleRoutes.indexOf(slotRoute)), timer: 0, flash: 0, caught: false, isOutside: false,
        color: offTeam.primaryColor,
        archetype: 'SLOT',
        speedMultiplier: 1.10 * (offTeam.ratings.wrSpeed || 1.0),
        isBlocker: slotRoute === 'BLOCK'
      },
      {
        startX: alignmentPositions.right, startY: lineOfScrimmageY, x: alignmentPositions.right, y: lineOfScrimmageY, vx: 0, vy: 0, radius: 10,
        routeType: rightRoute, routeIndex: Math.max(0, outsideRoutes.indexOf(rightRoute)), timer: 0, flash: 0, caught: false, isOutside: true,
        color: offTeam.primaryColor,
        archetype: 'POSSESSION',
        speedMultiplier: 1.02 * (offTeam.ratings.wrSpeed || 1.0),
        isBlocker: rightRoute === 'BLOCK'
      }
    ];

    centerReceiver = {
      startX: alignmentPositions.center, startY: lineOfScrimmageY, x: alignmentPositions.center, y: lineOfScrimmageY, vx: 0, vy: 0, radius: 10,
      routeType: centerRoute, routeIndex: Math.max(0, middleRoutes.indexOf(centerRoute)), timer: 0, flash: 0, caught: false, isOutside: false,
      color: offTeam.primaryColor, isCenter: true,
      archetype: 'TIGHT_END',
      speedMultiplier: 0.94,
      isBlocker: centerRoute === 'BLOCK'
    };

    const prevRbBlocker = Boolean(rb?.isBlocker && activePlay.type === 'PASS');
    const rbRoute = prevRbBlocker ? 'BLOCK' : (activePlay.rbRoute || 'FLAT');
    rb = {
      startX: alignmentPositions.rb, startY: lineOfScrimmageY - (75 * attackDirection), x: alignmentPositions.rb, y: lineOfScrimmageY - (75 * attackDirection), vx: 0, vy: 0, radius: 10,
      routeType: rbRoute, routeIndex: Math.max(0, runningBackRoutes.indexOf(rbRoute)),
      timer: 0, flash: 0, caught: false, hasBall: false,
      color: offTeam.accentColor || '#00ffaa', isRB: true, side: alignmentPositions.rbSide, handoffTimer: 0,
      archetype: 'RUNNING_BACK',
      speedMultiplier: 1.04 * (offTeam.ratings.runPower || 1.0),
      isBlocker: rbRoute === 'BLOCK',
      jukeCount: 0,
      jukeCooldownTimer: 0,
      jukeTimer: 0
    };

    linemen = [
      { startX: 170, startY: lineOfScrimmageY, x: 170, y: lineOfScrimmageY, radius: 10, blockTimer: 0, color: offTeam.primaryColor, speedMultiplier: 0.88 }
    ];

    // Faster defenders: Lockdown CB [3] and Ball-hawk FS [6] with high closing pursuit
    defenders = [
      { startX: 170, startY: lineOfScrimmageY + (10 * attackDirection), x: 170, y: lineOfScrimmageY + (10 * attackDirection), radius: 10, type: 'DL', passRusher: true, color: defTeam.secondaryColor || '#ff3333', archetype: 'RUSHER', speedMultiplier: 0.90 * (defTeam.ratings.passRush || 1.0) },
      { startX: 130, startY: lineOfScrimmageY + (60 * attackDirection), x: 130, y: lineOfScrimmageY + (60 * attackDirection), radius: 10, type: 'LB', zoneX: 130, zoneY: lineOfScrimmageY + (80 * attackDirection), color: defTeam.primaryColor, archetype: 'LINEBACKER', speedMultiplier: 0.94 },
      { startX: 210, startY: lineOfScrimmageY + (60 * attackDirection), x: 210, y: lineOfScrimmageY + (60 * attackDirection), radius: 10, type: 'LB', zoneX: 210, zoneY: lineOfScrimmageY + (80 * attackDirection), color: defTeam.primaryColor, archetype: 'LINEBACKER', speedMultiplier: 0.94 },
      { startX: 80,  startY: lineOfScrimmageY + (110 * attackDirection), x: 80, y: lineOfScrimmageY + (110 * attackDirection), radius: 10, type: 'CB', assignedReceiver: receivers[0], color: defTeam.primaryColor, archetype: 'LOCKDOWN', speedMultiplier: 1.18 * (defTeam.ratings.dbClosingSpeed || 1.0) },
      { startX: 260, startY: lineOfScrimmageY + (110 * attackDirection), x: 260, y: lineOfScrimmageY + (110 * attackDirection), radius: 10, type: 'CB', assignedReceiver: receivers[1], color: defTeam.primaryColor, archetype: 'CORNER', speedMultiplier: 1.05 * (defTeam.ratings.dbClosingSpeed || 1.0) },
      { startX: 170, startY: lineOfScrimmageY + (90 * attackDirection),  x: 170, y: lineOfScrimmageY + (90 * attackDirection),  radius: 10, type: 'MLB', assignedCenter: centerReceiver, color: defTeam.primaryColor, archetype: 'LINEBACKER', speedMultiplier: 0.94 },
      { startX: 170, startY: lineOfScrimmageY + (200 * attackDirection), x: 170, y: lineOfScrimmageY + (220 * attackDirection), radius: 10, type: 'FS', zoneX: 170, zoneY: lineOfScrimmageY + (220 * attackDirection), color: defTeam.primaryColor, archetype: 'SAFETY', speedMultiplier: 1.16 * (defTeam.ratings.dbClosingSpeed || 1.0) }
    ];

    defenseOverrides.clear();
    applyDefensiveAlignment();
    if (animateAlignment) {
      const alignedEntities = [...receivers, centerReceiver, rb, ...defenders].filter((entity): entity is Entity => entity !== null);
      startFormationTransition(alignedEntities, previousPositions);
    }
    activeEntity = qb;
    cpuPreSnapTimer = 0;
    callbacks.setP1OffFormationState?.(p1OffFormation);
    callbacks.setP1DefPlayState(p1DefPlay);
    if (activeOffense === 'P2') {
      triggerCpuOffensiveAudible(true);
    }
  }

  function triggerCpuOffensiveAudible(silent = false) {
    if (activeOffense !== 'P2') return;
    const cpuPlay = offensivePlaybook[p2OffPlay];
    if (!cpuPlay) return;
    const audibleRes = evaluateCpuOffensiveAudibles(
      cpuPlay.type,
      receivers,
      centerReceiver,
      rb,
      defenders,
      currentDown,
      yardsToGo,
      lineOfScrimmageY,
      attackDirection,
      fieldWidth
    );
    if (audibleRes.newPlayKey) {
      p2OffPlay = audibleRes.newPlayKey;
      callbacks.setP2OffPlayState(p2OffPlay);
    }
    if (audibleRes.rbFlipped) {
      positionRBDefender();
    }
    if (!silent && audibleRes.audibleMessage) {
      sounds.playJuke();
      showAnnouncement(audibleRes.audibleMessage, "#00ffff");
    }
  }

  // Expose control hooks to component ref
  const engineHandle: GameEngineHandle = {
    p1Score,
    p2Score,
    p1OffPlay,
    p1DefPlay,
    p2OffPlay,
    p2DefPlay,
    phase,
    activeOffense,
    activeDefense,
    p1Team,
    p2Team,
    selectP1Team: (teamId: string) => {
      p1Team = getTeam(teamId);
      callbacks.setP1TeamState?.(p1Team);
      resetDrill(true);
      showAnnouncement(`P1 SELECTED: ${p1Team.name.toUpperCase()} (${p1Team.archetype.replace('_', ' ')})`, p1Team.primaryColor);
    },
    selectP2Team: (teamId: string) => {
      p2Team = getTeam(teamId);
      callbacks.setP2TeamState?.(p2Team);
      resetDrill(true);
      showAnnouncement(`P2 SELECTED: ${p2Team.name.toUpperCase()} (${p2Team.archetype.replace('_', ' ')})`, p2Team.primaryColor);
    },
    resetDrill: () => {
      resetDrill();
    },
    resetGame: () => {
      p1Score = 0;
      p2Score = 0;
      quarter = 1;
      gameClockSeconds = 120;
      gameClockRemainderMs = 0;
      gameClockRunning = false;
      pendingQuarterEnd = false;
      quarterBreakRemainingMs = 0;
      halftimeAnnouncementPending = false;
      gameOver = false;
      publishGameClock();
      momentum = 0;
      defenseOverrides.clear();
      setMomentumState(0);
      activeOffense = 'P1';
      activeDefense = 'P2';
      setActiveOffenseState('P1');
      callbacks.setP1OffFormationState?.('SPREAD');
      callbacks.setP1DefPlayState('COVER3');
      attackDirection = -1;
      lineOfScrimmageY = fieldHeight - endZoneHeight - 350;
      firstDownMarkerY = lineOfScrimmageY + (100 * attackDirection);
      currentDown = 1;
      yardsToGo = 10;
      runCpuAiPlaySelection();
      resetDrill();
    },
    applyDefensiveAlignment: () => {
      applyDefensiveAlignment();
    },
    selectOffense: (key: string) => {
      if (activeOffense === 'P1' && offensivePlaybook[key]) {
        p1OffPlay = key;
        if (offensivePlaybook[key].alignment) {
          p1OffFormation = offensivePlaybook[key].alignment!;
          callbacks.setP1OffFormationState?.(p1OffFormation);
        }
        resetDrill(true);
      }
    },
    selectDefense: (key: string) => {
      if (activeDefense === 'P1') {
        lastDefenseSelectTime = Date.now();
        const previousPositions = defenders.map(({ x, y }) => ({ x, y }));
        p1DefPlay = key;
        callbacks.setP1DefPlayState(key);
        defenseOverrides.clear();
        applyDefensiveAlignment();
        startFormationTransition(defenders, previousPositions);
        if (activeOffense === 'P2') {
          triggerCpuOffensiveAudible(false);
        }
      }
    },
    shiftFormation: (direction: number) => {
      cyclePreSnapFormation(direction);
    }
  };
  callbacks.onEngineReady(engineHandle);

  function cyclePreSnapFormation(direction: number) {
    if (activeOffense === 'P1') {
      const formations: Array<'SPREAD' | 'STACK' | 'TRIPS'> = ['SPREAD', 'STACK', 'TRIPS'];
      const curIdx = formations.indexOf(p1OffFormation);
      const nextIdx = (curIdx + direction + formations.length) % formations.length;
      const nextFormation = formations[nextIdx];
      p1OffFormation = nextFormation;
      callbacks.setP1OffFormationState?.(nextFormation);
      const playKey = Object.keys(offensivePlaybook).find(k => offensivePlaybook[k].alignment === nextFormation) || p1OffPlay;
      p1OffPlay = playKey;
      resetDrill(true);
      sounds.playJuke();
    } else if (activeDefense === 'P1') {
      const defKeys = ['COVER3', 'COVER2MAN', 'TAMPA2', 'BLITZ', 'QUARTERS'];
      const curIdx = defKeys.indexOf(p1DefPlay);
      const nextIdx = (curIdx + direction + defKeys.length) % defKeys.length;
      const nextDef = defKeys[nextIdx];
      engineHandle.selectDefense(nextDef);
      sounds.playJuke();
    }
  }

  resetDrill();

  function startCpuPlay(): void {
    if (activeOffense === 'P2') {
      triggerCpuOffensiveAudible(true);
    }
    let cpuPlay = offensivePlaybook[p2OffPlay];
    if (rb && (rb.isBlocker || rb.routeType === 'BLOCK') && cpuPlay?.type !== 'PASS') {
      p2OffPlay = 'MESH';
      cpuPlay = offensivePlaybook.MESH;
      callbacks.setP2OffPlayState(p2OffPlay);
    }
    sounds.playSnap();
    gameClockRunning = true;
    qb.hasBall = true;
    isAiming = false;
    cpuPreSnapTimer = 0;
    if (cpuPlay && cpuPlay.type !== 'PASS' && !(rb?.isBlocker || rb?.routeType === 'BLOCK')) {
      activeEntity = rb || qb;
      phase = 'HANDOFF';
    } else {
      activeEntity = qb;
      phase = 'QB_DROP';
      qb.dropStepTimer = 28;
    }
  }

  // Pointer events
  const handlePointerDown = (e: PointerEvent) => {
    const { x: px, y: py } = screenToWorld(e.clientX, e.clientY);
    const screenPos = getScreenCoords(e.clientX, e.clientY);

    const currentTime = Date.now();

    // Guard against tap-through immediately after closing playbook or selecting defense
    if (currentTime - lastDefenseSelectTime < 450) {
      return;
    }

    tapThrowTarget = null;

    touchStartX = px;
    touchStartY = py;
    touchScreenStartX = screenPos.x;
    touchScreenStartY = screenPos.y;
    aimScreenCurrentX = screenPos.x;
    aimScreenCurrentY = screenPos.y;
    touchStartTime = Date.now();

    if (phase === 'PRE_SNAP') {
      // 1. If on offense, check if user tapped/dragged an interactive player (RB, WR, Center) FIRST!
      if (activeOffense === 'P1') {
        // RB tap / line gesture: Checked FIRST to guarantee tapping RB never starts the play!
        if (rb && Math.hypot(rb.x - px, rb.y - py) < rb.radius + 20) {
          gestureEntity = rb;
          gestureRole = 'RB';
          gestureStartX = rb.x;
          gestureStartY = rb.y;
          gestureCurrentX = px;
          gestureCurrentY = py;
          gestureTouchStartX = px;
          gestureTouchStartY = py;
          isDirtGestureActive = false;
          return;
        }

        // Center tap / line gesture
        if (centerReceiver && Math.hypot(centerReceiver.x - px, centerReceiver.y - py) < centerReceiver.radius + 20) {
          gestureEntity = centerReceiver;
          gestureRole = 'WR';
          gestureStartX = centerReceiver.x;
          gestureStartY = centerReceiver.y;
          gestureCurrentX = px;
          gestureCurrentY = py;
          gestureTouchStartX = px;
          gestureTouchStartY = py;
          isDirtGestureActive = false;
          return;
        }

        // Outside & Slot Receivers tap / line gesture
        const eligibleWr = receivers.find(r => r && Math.hypot(r.x - px, r.y - py) < r.radius + 20);
        if (eligibleWr) {
          gestureEntity = eligibleWr;
          gestureRole = 'WR';
          gestureStartX = eligibleWr.x;
          gestureStartY = eligibleWr.y;
          gestureCurrentX = px;
          gestureCurrentY = py;
          gestureTouchStartX = px;
          gestureTouchStartY = py;
          isDirtGestureActive = false;
          return;
        }
      }

      // 2. If on defense (activeDefense === 'P1', activeOffense === 'P2')
      if (activeDefense === 'P1') {
        // Record start position for open field / bottom of screen formation swiping
        preSnapFieldSwipeStartX = px;
        preSnapFieldSwipeStartY = py;
        touchScreenStartX = e.clientX;
        touchScreenStartY = e.clientY;

        // User taps a defender: select to toggle assignment or flick
        const hitDefender = defenders.find(d => Math.hypot(d.x - px, d.y - py) < (d.radius || 10) + 18);
        if (hitDefender) {
          gestureEntity = hitDefender;
          gestureRole = 'DEFENDER';
          gestureStartX = hitDefender.x;
          gestureStartY = hitDefender.y;
          gestureCurrentX = px;
          gestureCurrentY = py;
          gestureTouchStartX = px;
          gestureTouchStartY = py;
          isDirtGestureActive = false;
          return;
        }

        // REQUIREMENT: "The only way a user in defense can start a play is by touching the QB."
        const distToQb = Math.hypot(qb.x - px, qb.y - py);
        if (distToQb < (qb.radius || 12) + 24) {
          startCpuPlay();
          return;
        }

        // NO OTHER TAPS START THE PLAY!
        return;
      }

      // 3. User is on offense: Check if user explicitly tapped QB to snap the ball
      // Must NOT be touching RB, and strictly within QB direct radius (32px)
      const distToQb = Math.hypot(qb.x - px, qb.y - py);
      const distToRb = rb ? Math.hypot(rb.x - px, rb.y - py) : 999;
      if (distToQb < 32 && distToQb < distToRb - 10) {
        touchStartX = px;
        touchStartY = py;
        sounds.playSnap();
        gameClockRunning = true;
        const play = offensivePlaybook[p1OffPlay];
        if (play.type === 'PASS') {
          qb.hasBall = true;
          phase = 'QB_DROP';
          isAiming = true;
          qb.dropStepTimer = 28;
        } else {
          qb.hasBall = true;
          if (rb) rb.hasBall = false;
          activeEntity = rb || qb;
          phase = 'HANDOFF';
        }
        return;
      }

      // 4. Open grass touch: Record start position for field swipe formation change!
      preSnapFieldSwipeStartX = px;
      preSnapFieldSwipeStartY = py;

      // Double tap empty field flips RB side
      if (activeOffense === 'P1' && currentTime - lastTapTime < 350 && rb) {
        if (px < fieldWidth / 2) {
          rb.side = 'left';
          rb.startX = 120; rb.x = 120;
        } else {
          rb.side = 'right';
          rb.startX = 220; rb.x = 220;
        }
        positionRBDefender();
        if (activeDefense === 'P2') {
          applyDefensiveAlignment(true, true);
        }
        lastTapTime = 0;
        return;
      }
      lastTapTime = currentTime;
      return;
    }

    if (phase === 'HANDOFF') {
      isAiming = false;
      return;
    }

    if (phase === 'RUNNING' && activeEntity && activeOffense === 'P1') {
      isAiming = true;
      aimCurrentX = px;
      aimCurrentY = py;
      return;
    }

    if (phase === 'RUNNING' && activeDefense === 'P1' && activeEntity) {
      // User is on defense during a run! Allow user to tap/dive-tackle with nearest defender
      const validDefenders = isInterceptionReturn
        ? [qb, rb, centerReceiver, ...receivers, ...linemen].filter((player): player is Entity => Boolean(player))
        : defenders;
      if (validDefenders.length > 0) {
        let bestDef = validDefenders[0];
        let minDist = Infinity;
        validDefenders.forEach(d => {
          const distToTap = Math.hypot(d.x - px, d.y - py);
          const distToCarrier = Math.hypot(d.x - activeEntity.x, d.y - activeEntity.y);
          const score = Math.min(distToTap, distToCarrier * 0.85);
          if (score < minDist) {
            minDist = score;
            bestDef = d;
          }
        });

        const distToCarrier = Math.hypot(bestDef.x - activeEntity.x, bestDef.y - activeEntity.y);
        const angle = Math.atan2(activeEntity.y - bestDef.y, activeEntity.x - bestDef.x);
        bestDef.vx = Math.cos(angle) * 4.4;
        bestDef.vy = Math.sin(angle) * 4.4;
        bestDef.pursuitTimer = 35;
        activeEntity.tackleImmunity = 0;

        if (distToCarrier < 45) {
          screenShakeTimer = 22;
          phase = 'DEAD';
          sounds.playTackle();
          handlePlayEnd(activeEntity.y, 'TACKLE', 'USER TACKLE! BALL CARRIER STOPPED! 🛑💥', '#00ffff');
          return;
        } else {
          sounds.playTackle();
          showAnnouncement('USER DIVE TACKLE! 🛑⚡', '#00ffff');
        }
      }
      return;
    }

    if (phase === 'QB_DROP' && activeOffense === 'P1') {
      tapThrowTarget = findTappedPassReceiver([...receivers, centerReceiver, rb], px, py);
      isAiming = true;
      aimCurrentX = px;
      aimCurrentY = py;
    }
  };

  const handlePointerMove = (e: PointerEvent) => {
    const { x: curX, y: curY } = screenToWorld(e.clientX, e.clientY);
    const screenPos = getScreenCoords(e.clientX, e.clientY);
    aimCurrentX = curX;
    aimCurrentY = curY;
    aimScreenCurrentX = screenPos.x;
    aimScreenCurrentY = screenPos.y;

    if (phase === 'PRE_SNAP' && gestureEntity) {
      gestureCurrentX = curX;
      gestureCurrentY = curY;
      const dragDist = Math.hypot(curX - gestureStartX, curY - gestureStartY);

      if (dragDist > 12) {
        isDirtGestureActive = true;
      }
      return;
    }

  };

  const handlePointerUp = (e: PointerEvent) => {
    if (phase === 'PRE_SNAP') {
      const { x: curX, y: curY } = screenToWorld(e.clientX, e.clientY);
      const screenDeltaX = e.clientX - touchScreenStartX;
      const screenDeltaY = e.clientY - touchScreenStartY;
      const worldDeltaX = curX - preSnapFieldSwipeStartX;
      const worldDeltaY = curY - preSnapFieldSwipeStartY;

      // Check if user made a horizontal swipe across the screen / bottom of screen
      const isSwipeGesture = (Math.abs(screenDeltaX) > 24 && Math.abs(screenDeltaX) > Math.abs(screenDeltaY) * 1.05)
        || (Math.abs(worldDeltaX) > 22 && Math.abs(worldDeltaX) > Math.abs(worldDeltaY) * 1.05);

      if (gestureEntity) {
        gestureCurrentX = curX;
        gestureCurrentY = curY;
        const dragDist = Math.hypot(curX - gestureStartX, curY - gestureStartY);

        if (gestureRole === 'DEFENDER') {
          const dx = gestureCurrentX - gestureStartX;
          const dy = gestureCurrentY - gestureStartY;
          const lateralDist = Math.abs(dx);

          // Requirement: "Swiping left or right on a defender should not register as a swipe to change alignments. It should only change the defensive players assignment to man coverage."
          if (lateralDist > 16 && lateralDist > Math.abs(dy) * 0.75) {
            applyChalkRoute(gestureEntity, 'DEFENDER', 'MAN');
          } else if (isDirtGestureActive && dragDist > 14) {
            // User drew a line for a defender route / assignment!
            const gesture = evaluateDirtSwipeGesture(
              gestureEntity,
              gestureRole,
              dx,
              dy,
              attackDirection
            );
            applyChalkRoute(gestureEntity, gestureRole, gesture.value);
          } else {
            // Requirement: "The defenders still need to be able to toggle to blitz, man, RB spy and zone"
            const defenderIndex = defenders.indexOf(gestureEntity);
            const currentAssignment = defenseOverrides.get(defenderIndex) || gestureEntity.defenseAssignment || 'ZONE';
            const toggleCycle: Array<'BLITZ' | 'MAN' | 'RB_SPY' | 'ZONE'> = ['BLITZ', 'MAN', 'RB_SPY', 'ZONE'];
            const currentIdx = toggleCycle.indexOf(currentAssignment as any);
            const nextAssignment = toggleCycle[(currentIdx + 1 + toggleCycle.length) % toggleCycle.length];
            applyChalkRoute(gestureEntity, 'DEFENDER', nextAssignment);
          }
        } else if (isDirtGestureActive && dragDist > 14) {
          // User drew a line for a route!
          const gesture = evaluateDirtSwipeGesture(
            gestureEntity,
            gestureRole,
            gestureCurrentX - gestureStartX,
            gestureCurrentY - gestureStartY,
            attackDirection
          );
          applyChalkRoute(gestureEntity, gestureRole, gesture.value);
        } else {
          // Single tap on buddy: Assigns RUN BLOCKING!
          if (gestureRole === 'WR' || gestureRole === 'RB') {
            const isCurrentlyBlocking = gestureEntity.isBlocker || gestureEntity.routeType === 'BLOCK';
            if (isCurrentlyBlocking) {
              // Tapping again toggles back to default pass route
              const defaultRoute = (gestureRole === 'RB')
                ? 'FLAT'
                : (gestureEntity === centerReceiver ? 'SLANT-R' : (gestureEntity.startX! < 170 ? 'SLANT-R' : 'SLANT-L'));
              applyChalkRoute(gestureEntity, gestureRole, defaultRoute);
            } else {
              // Assign RUN BLOCKING
              applyChalkRoute(gestureEntity, gestureRole, 'BLOCK');
            }
          }
        }

        gestureEntity = null;
        isDirtGestureActive = false;
        return;
      }

      // Check if user swiped open field / bottom of screen horizontally to change formations / alignments!
      if (isSwipeGesture) {
        cyclePreSnapFormation(worldDeltaX < 0 ? 1 : -1);
        return;
      }

      return;
    }

    if (activeDefense === 'P1' && phase === 'RUNNING' && activeEntity) {
      const swipeTime = Date.now() - touchStartTime;
      if (swipeTime < 450) {
        const validDefenders = defenders;
        if (validDefenders.length > 0) {
          let bestDef = validDefenders[0];
          let minDist = Infinity;
          validDefenders.forEach(d => {
            const dist = Math.hypot(d.x - activeEntity.x, d.y - activeEntity.y);
            if (dist < minDist) {
              minDist = dist;
              bestDef = d;
            }
          });
          const angle = Math.atan2(activeEntity.y - bestDef.y, activeEntity.x - bestDef.x);
          bestDef.vx = Math.cos(angle) * 4.6;
          bestDef.vy = Math.sin(angle) * 4.6;
          bestDef.pursuitTimer = 35;
          activeEntity.tackleImmunity = 0;
          const distToCarrier = Math.hypot(bestDef.x - activeEntity.x, bestDef.y - activeEntity.y);
          if (distToCarrier < 28) {
            screenShakeTimer = 22;
            phase = 'DEAD';
            sounds.playTackle();
            handlePlayEnd(activeEntity.y, 'TACKLE', 'USER TACKLE! BALL CARRIER STOPPED! 🛑💥', '#00ffff');
          }
        }
      }
      return;
    }

    if (activeOffense !== 'P1') return;

    const screenEnd = getScreenCoords(e.clientX, e.clientY);
    const swipeTime = Date.now() - touchStartTime;
    const deltaScreenX = screenEnd.x - touchScreenStartX;
    const deltaScreenY = screenEnd.y - touchScreenStartY;

    if (phase === 'PRE_SNAP' && activeDefense === 'P1') return;

    const eligibleCatchers = [...receivers, centerReceiver, rb].filter(Boolean) as Entity[];

    if (phase === 'RUNNING' && activeEntity && activeOffense === 'P1') {
      isAiming = false;
      if (swipeTime < 400 && Math.abs(deltaScreenX) > 25 && Math.abs(deltaScreenX) > Math.abs(deltaScreenY)) {
        const jukeSign = deltaScreenX > 0 ? 1 : -1;
        activeEntity.jukeTimer = 12;
        activeEntity.jukeVx = jukeSign * 4.2;
        screenShakeTimer = 8;
        sounds.playJuke();
        showAnnouncement(jukeSign > 0 ? "JUKE RIGHT! 💨" : "JUKE LEFT! 💨", "#00ffff");
      } else if (swipeTime < 400 && ((attackDirection === -1 && deltaScreenY < -35) || (attackDirection === 1 && deltaScreenY > 35)) && Math.abs(deltaScreenX) < 45) {
        if (!activeEntity.boostUsed) {
          activeEntity.boostUsed = true;
          activeEntity.powerBoostTimer = 60;
          screenShakeTimer = 20;
          sounds.playJuke();
        }
      }
      return;
    }

    if (phase === 'HANDOFF' || offensivePlaybook[p1OffPlay]?.type !== 'PASS') {
      isAiming = false;
      return;
    }

    if (activeOffense === 'P1' && phase === 'QB_DROP' && isAiming) {
      isAiming = false;

      const pullX = deltaScreenX;
      const pullY = deltaScreenY;
      const pullDist = Math.hypot(pullX, pullY);
      const releaseWorld = screenToWorld(e.clientX, e.clientY);
      const receiverAtRelease = findTappedPassReceiver([...receivers, centerReceiver, rb], releaseWorld.x, releaseWorld.y);
      const tappedReceiver = tapThrowTarget;
      tapThrowTarget = null;
      const isTapThrow = Boolean(
        tappedReceiver &&
        receiverAtRelease === tappedReceiver &&
        swipeTime < 450 &&
        pullDist < 20
      );

      // Releasing without a pull keeps the QB in the pocket after the snap.
      if (pullDist < 10 && !isTapThrow) {
        return;
      }

      // Slingshot projected target location in world space
      const projX = isTapThrow ? tappedReceiver!.x : qb.x - pullX;
      const projY = isTapThrow ? tappedReceiver!.y : qb.y - pullY;

      const dx = projX - qb.x;
      const dy = projY - qb.y;
      const throwDist = Math.hypot(dx, dy);

      // Forward distance along attack direction (positive is downfield, negative is backfield)
      const forwardY = dy * attackDirection;
      const lateralDist = Math.abs(dx);
      // Allow throwing backwards in up to a 30 degree angle on both sides so the QB can throw to the RB in the backfield
      // tan(30 degrees) = 0.57735
      const maxBackwardY = lateralDist * Math.tan((30 * Math.PI) / 180);
      const isTargetingRb = Boolean(rb && Math.hypot(projX - rb.x, projY - rb.y) < 65);
      lastTargetWasRb = isTargetingRb;

      // Only steep backward throws into the backfield (> 30 degrees backward from lateral) that aren't targeting the RB trigger a QB run
      const isBackwardScramble = !isTapThrow && !isTargetingRb && (forwardY < -maxBackwardY);
      if (isBackwardScramble) {
        phase = 'RUNNING';
        activeEntity = qb;
        qb.hasBall = true;
        qb.vx = Math.max(-2.5, Math.min(2.5, dx * 0.05));
        qb.vy = attackDirection * 2.24;
        qbScrambleReactionTimer = 18;
        qb.tackleImmunity = 30;
        isAllBlocking = true;
        sounds.playJuke();
        return;
      }

      // Original calibrated ball speed
      const throwSpeed = Math.min(6.4, Math.max(3.6, (3.2 + throwDist * 0.028) * 0.8));
      const totalFlightFrames = Math.max(18, Math.round(throwDist / throwSpeed));

      // Realistic QB throw accuracy check (accounting for rush pressure, throw distance, and team pass pro)
      const rusherThreat = defenders.some(d => d && (d.passRusher || d.defenseAssignment === 'BLITZ') && Math.hypot(d.x - qb.x, d.y - qb.y) < 55);
      const isHitAsThrown = defenders.some(d => d && (d.passRusher || d.defenseAssignment === 'BLITZ') && Math.hypot(d.x - qb.x, d.y - qb.y) < 32);
      const offTeam = activeOffense === 'P1' ? p1Team : p2Team;
      const accCheck = evaluateQbThrowAccuracy({
        throwDist,
        isUnderPressure: rusherThreat,
        isDeepShot: throwDist > 160,
        isHitAsThrown,
        passProtectionRating: offTeam.ratings.passProtection
      }, attackDirection);

      let targetX = projX;
      let targetY = projY;
      if (accCheck.isOffTarget) {
        targetX = Math.max(20, Math.min(fieldWidth - 20, targetX + accCheck.offsetX));
        targetY += accCheck.offsetY;
        if (accCheck.announcement) {
          showAnnouncement(accCheck.announcement, '#ffcc00');
        }
      }

      ballPressureDefenders = selectCoverageBreakers(targetX, targetY);

      const vx = (targetX - qb.x) / totalFlightFrames;
      const vy = (targetY - qb.y) / totalFlightFrames;

      const intendedReceiver = (isTapThrow ? tappedReceiver : null) || [...receivers, centerReceiver, rb].filter((r): r is Entity => Boolean(r && !r.isBlocker && r.routeType !== 'BLOCK'))
        .sort((a, b) => Math.hypot(a.x - targetX, a.y - targetY) - Math.hypot(b.x - targetX, b.y - targetY))[0] || null;

      ball = {
        startX: qb.x,
        startY: qb.y,
        x: qb.x,
        y: qb.y,
        z: 16,
        vx: vx,
        vy: vy,
        maxZ: getPassArcMaxHeight(throwDist, throwDist > 140),
        flightFrames: totalFlightFrames,
        currentFrame: 0,
        targetX,
        targetY,
        intendedTarget: intendedReceiver
      };
      qb.hasBall = false;
      phase = 'THROWN';
      sounds.playThrow();
    }
  };

  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerup', handlePointerUp);

  function triggerFumble(carrier: Entity) {
    phase = 'FUMBLE';
    screenShakeTimer = 35;
    sounds.playFumble();
    fumbleBall = createFumbleBall(carrier, attackDirection, activeOffense);
    showAnnouncement("FUMBLE! LOOSE BALL ON THE TURF! 🏈💥", "#ffd700");
  }

  function update() {
    if (qbScrambleReactionTimer > 0) qbScrambleReactionTimer--;

    if (formationTransitions.length > 0) {
      formationTransitionFrame++;
      const progress = Math.min(formationTransitionFrame / 18, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      formationTransitions.forEach(({ entity, fromX, fromY, toX, toY }) => {
        entity.x = fromX + (toX - fromX) * easedProgress;
        entity.y = fromY + (toY - fromY) * easedProgress;
      });
      if (progress === 1) formationTransitions = [];
    }

    if (phase === 'PRE_SNAP') {
      if (activeDefense === 'P2') {
        aiPreSnapShiftTimer++;
        if (aiPreSnapShiftTimer === 25) {
          executeAiPreSnapShift();
        }
        // Smoothly glide defenders toward their shifted start positions if shifting
        defenders.forEach(d => {
          if (!d) return;
          if (d.startX !== undefined && d.startY !== undefined) {
            const dx = d.startX - d.x;
            const dy = d.startY - d.y;
            if (Math.hypot(dx, dy) > 0.6) {
              d.x += dx * 0.12;
              d.y += dy * 0.12;
            }
          }
        });
      }
      return;
    }

    if (phase === 'FUMBLE' && fumbleBall) {
      fumbleBall.timer++;
      fumbleBall.x += fumbleBall.vx;
      fumbleBall.y += fumbleBall.vy;
      fumbleBall.vx *= 0.93;
      fumbleBall.vy *= 0.93;
      fumbleBall.z = Math.max(0, Math.sin(fumbleBall.timer * 0.28) * Math.max(0, 10 - fumbleBall.timer * 0.15));

      // Out of bounds
      if (fumbleBall.x < 25 || fumbleBall.x > fieldWidth - 25) {
        const boundY = fumbleBall.y;
        fumbleBall = null;
        phase = 'DEAD';
        sounds.playWhistle();
        showAnnouncement("FUMBLE OUT OF BOUNDS - OFFENSE RETAINS", "#ffcc00");
        handlePlayEnd(boundY, 'TACKLE', 'FUMBLE OUT OF BOUNDS');
        return;
      }

      // All nearby players rush to recover loose ball
      const recoveryEligible = [qb, rb, centerReceiver, ...receivers, ...linemen, ...defenders].filter(Boolean) as Entity[];
      recoveryEligible.forEach(p => {
        moveToward(p, fumbleBall!.x, fumbleBall!.y, 0.28, 1.8);
      });

      // Recovery check after 12 frames
      if (fumbleBall.timer > 12) {
        for (const p of recoveryEligible) {
          const dist = Math.hypot(p.x - fumbleBall.x, p.y - fumbleBall.y);
          if (dist < (p.radius || 10) + 9) {
            const isDefender = isInterceptionReturn ? !defenders.includes(p) : defenders.includes(p);
            const recoveryY = fumbleBall.y;
            fumbleBall = null;
            phase = 'DEAD';
            sounds.playWhistle();

            if (isDefender) {
              // Turnover!
              screenShakeTimer = 30;
              showAnnouncement("DEFENSE RECOVERS THE FUMBLE! TURNOVER! 🛡️⚡", "#ff3333");
              swapPossessionOnPlay(recoveryY);
              scheduleDrillReset();
            } else {
              // Offense recovers
              screenShakeTimer = 18;
              showAnnouncement("OFFENSE RECOVERS OWN FUMBLE! 🏈", "#00ffff");
              handlePlayEnd(recoveryY, 'TACKLE', 'OFFENSE RECOVERED FUMBLE');
            }
            return;
          }
        }
      }

      // Safety fallback if scramble goes long
      if (fumbleBall && fumbleBall.timer > 130) {
        let closestPlayer: Entity | null = null;
        let minD = Infinity;
        recoveryEligible.forEach(p => {
          const dist = Math.hypot(p.x - fumbleBall!.x, p.y - fumbleBall!.y);
          if (dist < minD) { minD = dist; closestPlayer = p; }
        });
        const isDefender = closestPlayer
          ? (isInterceptionReturn ? !defenders.includes(closestPlayer) : defenders.includes(closestPlayer))
          : false;
        const recoveryY = fumbleBall.y;
        fumbleBall = null;
        phase = 'DEAD';
        sounds.playWhistle();
        if (isDefender) {
          showAnnouncement("DEFENSE FALLS ON FUMBLE! TURNOVER!", "#ff3333");
          swapPossessionOnPlay(recoveryY);
          scheduleDrillReset();
        } else {
          showAnnouncement("OFFENSE FALLS ON FUMBLE!", "#00ffff");
          handlePlayEnd(recoveryY, 'TACKLE', 'OFFENSE RECOVERED FUMBLE');
        }
        return;
      }
    }

    if (phase === 'QB_DROP' || phase === 'HANDOFF') playClock++;

    const activeDefKey = (activeDefense === 'P1') ? p1DefPlay : p2DefPlay;
    const activeOffName = (activeOffense === 'P1') ? p1OffPlay : p2OffPlay;

    // Roll for defensive coverage mistake on pass plays (around frame 26-32)
    // Requirement: "Build in mistakes by the defense that can be capitalized on"
    const defTeam = activeDefense === 'P1' ? p1Team : p2Team;
    if (phase === 'QB_DROP' && !coverageMistakeEvaluated && playClock >= 26 && offensivePlaybook[activeOffName]?.type === 'PASS') {
      coverageMistakeEvaluated = true;
      // ~28% chance of a coverage mistake on pass plays, modulated by team mistake rating
      const mistakeChance = 0.28 * (defTeam.ratings.mistakeChance || 1.0);
      if (Math.random() < mistakeChance) {
        const eligibleDefenders = defenders.filter(d =>
          !d.passRusher &&
          d.defenseAssignment !== 'BLITZ' &&
          !d.isQbSpy &&
          (d.type === 'FS' || d.type === 'CB' || d.type === 'LB' || d.type === 'MLB')
        );
        if (eligibleDefenders.length > 0) {
          const chosenDef = eligibleDefenders[Math.floor(Math.random() * eligibleDefenders.length)];
          const mistakeRoll = Math.random();
          let announcementText = "";
          if (mistakeRoll < 0.40) {
            chosenDef.coverageMistake = 'BIT_UNDERNEATH';
            chosenDef.mistakeTimer = 55;
            announcementText = "COVERAGE BUST! DB BIT UNDERNEATH — LOOK DEEP! 🚀🎯";
          } else if (mistakeRoll < 0.70) {
            chosenDef.coverageMistake = 'STUMBLE';
            chosenDef.mistakeTimer = 48;
            announcementText = "COVERAGE BUST! DEFENDER STUMBLED — RECEIVER OPEN! 💨";
          } else {
            chosenDef.coverageMistake = 'BLOWN_ZONE';
            chosenDef.mistakeTimer = 55;
            announcementText = "COVERAGE BUST! DEEP THIRD UNGUARDED! 🚀💥";
          }
          // Visually flag the open receiver that broke free so the user and AI can immediately capitalize!
          const openRec = chosenDef.assignedReceiver || receivers.find(r => r && !r.isBlocker && Math.hypot(r.x - chosenDef.x, r.y - chosenDef.y) < 130);
          if (openRec) {
            openRec.flash = 75;
            openRec.isOpenDeep = true;
          }
          showAnnouncement(announcementText, "#00ffff");
          sounds.playJuke();
        }
      }
    }

    if (phase === 'QB_DROP' && activeOffense === 'P2' && !ball) {
      // Detect unblocked pass rusher pocket pressure with sufficient time to release before being sacked
      const unblockedRushers = defenders.filter(d => d && (d.passRusher || d.defenseAssignment === 'BLITZ') && !d.isEngagedWithBlocker);
      let distToRusher = 999;
      unblockedRushers.forEach(r => {
        const d = Math.hypot(r.x - qb.x, r.y - qb.y);
        if (d < distToRusher) distToRusher = d;
      });
      const isUnderHeavyPressure = distToRusher < 65 || defenders.some(d => d && (d.passRusher || d.defenseAssignment === 'BLITZ') && Math.hypot(d.x - qb.x, d.y - qb.y) < 55);

      // NFL Progression Read Framework:
      // Primary Read (Outside WRs): receivers[0], receivers[1]
      // Intermediate / Seam Read: centerReceiver (if not pass blocking)
      // Emergency Checkdown: rb (if not pass blocking)
      const primaryTargets: Entity[] = [...receivers];
      const seamTarget: Entity | null = (centerReceiver && !centerReceiver.isBlocker && centerReceiver.routeType !== 'BLOCK') ? centerReceiver : null;
      const checkdownTarget: Entity | null = (rb && !rb.isBlocker && rb.routeType !== 'BLOCK') ? rb : null;

      let bestTarget: Entity | null = null;
      let bestScore = -9999;
      let bestIsDownfieldWR = false;

      // Helper to evaluate a receiver's openness, route-break timing, and window
      const evaluateTarget = (t: Entity | null, isCheckdown: boolean) => {
        if (!t) return { score: -9999, isBreakOpen: false, depthYards: 0, nearestDefDist: 0 };

        const targetDist = Math.hypot(t.x - qb.x, t.y - qb.y);
        const isDeepRoute = t.routeType === 'GO' || t.routeType === 'FLAG-L' || t.routeType === 'FLAG-R' || t.routeType === 'POST-L' || t.routeType === 'POST-R' || t.routeType === 'WHEEL';
        const estimatedThrowSpeed = (isDeepRoute
          ? (targetDist > 240 ? 9.5 : 8.6)
          : (targetDist > 140 ? 8.8 : 7.6)) * 0.8;
        const arrivalFrames = Math.max(16, Math.round(targetDist / estimatedThrowSpeed));
        const arrivalX = Math.max(25, Math.min(fieldWidth - 25, t.x + (t.vx || 0) * arrivalFrames * 0.92));
        const arrivalY = t.y + (t.vy || 0) * arrivalFrames * 0.92;
        let nearestDefDist = Infinity;
        defenders.forEach(d => {
          if (!d || d.passRusher) return;
          const defenderArrivalX = d.x + (d.vx || 0) * arrivalFrames * 0.92;
          const defenderArrivalY = d.y + (d.vy || 0) * arrivalFrames * 0.92;
          const dist = Math.hypot(defenderArrivalX - arrivalX, defenderArrivalY - arrivalY);
          if (dist < nearestDefDist) nearestDefDist = dist;
        });

        // Evaluate separation and depth where the receiver is expected to meet the pass.
        const depthYards = (arrivalY - lineOfScrimmageY) * attackDirection / 10;

        // Passing lane obstruction check (passes sail high overhead over line of scrimmage)
        let laneObstruction = 0;
        defenders.forEach(d => {
          if (!d || d.passRusher) return;
          if (Math.abs(d.y - lineOfScrimmageY) < 35) return; // Overhead ball clearance at scrimmage
          const distToLane = distToSegment({ x: qb.x, y: qb.y }, { x: t.x, y: t.y }, { x: d.x, y: d.y });
          if (distToLane < 15) {
            laneObstruction += (15 - distToLane) * 1.0;
          }
        });

        let score = 0;

        // 1. Base separation score (authentic arcade / NFL standards)
        if (nearestDefDist < 12) {
          score -= 15; // tightly covered
        } else if (nearestDefDist < 20) {
          score += (nearestDefDist - 12) * 3.5; // tight NFL window
        } else {
          score += 30 + (nearestDefDist - 20) * 2.2; // open target
        }

        // Check if defender covering this receiver made a coverage mistake
        const coveringDef = defenders.find(d => d.assignedReceiver === t);
        const hasCoverageMistake = Boolean(
          (coveringDef && coveringDef.coverageMistake && (coveringDef.mistakeTimer || 0) > 0) ||
          defenders.some(d => d.coverageMistake && (d.mistakeTimer || 0) > 0 && Math.hypot(d.x - t.x, d.y - t.y) < 105)
        );

        if (hasCoverageMistake) {
          score += 140;
        }

        // Coverage Mismatch Exploitation: DL or LB covering a WR/TE in MAN coverage
        if (coveringDef && coveringDef.defenseAssignment === 'MAN' && (coveringDef.type === 'DL' || coveringDef.type === 'LB')) {
          score += 65; // Heavily exploit the physical speed/agility mismatch!
        }

        // Exploit user zero-blitz mistake (no deep safety over the top):
        const totalRushers = defenders.filter(d => d && (d.passRusher || d.defenseAssignment === 'BLITZ')).length;
        if ((activeDefKey === 'BLITZ' || totalRushers >= 2) && isDeepRoute) {
          score += 115;
        }

        // 2. Route break window anticipation bonus:
        let isBreakOpen = false;
        if (hasCoverageMistake) {
          isBreakOpen = true;
        }
        if (t.routeType) {
          const rTime = t.timer || 0;
          // Slant break window (frames 32 - 55)
          if ((t.routeType === 'SLANT-L' || t.routeType === 'SLANT-R') && rTime >= 32 && rTime <= 55 && nearestDefDist >= 14) {
            score += 65;
            isBreakOpen = true;
          }
          // Comeback/Curl break window (frames 48 - 68)
          else if (t.routeType === 'COMEBACK' && rTime >= 48 && rTime <= 68 && nearestDefDist >= 14) {
            score += 70;
            isBreakOpen = true;
          }
          // Crosser across field (frames 40 - 75)
          else if ((t.routeType === 'CROSS-L' || t.routeType === 'CROSS-R') && rTime >= 40 && rTime <= 75 && nearestDefDist >= 15) {
            score += 60;
            isBreakOpen = true;
          }
          // Go route streaking deep behind CB (frame 34+)
          else if (t.routeType === 'GO' && (rTime >= 34 || hasCoverageMistake || activeDefKey === 'BLITZ' || totalRushers >= 2) && nearestDefDist >= 14 && depthYards > 6) {
            score += 75;
            isBreakOpen = true;
          }
          // Out/Flag route break (frames 40 - 70)
          else if ((t.routeType === 'FLAG-L' || t.routeType === 'FLAG-R') && rTime >= 40 && rTime <= 70 && nearestDefDist >= 14) {
            score += 65;
            isBreakOpen = true;
          }
          // Post route break (frames 40 - 72)
          else if ((t.routeType === 'POST-L' || t.routeType === 'POST-R') && rTime >= 40 && rTime <= 72 && nearestDefDist >= 14) {
            score += 75;
            isBreakOpen = true;
          }
          // Hitch timing stop (frames 30 - 56)
          else if (t.routeType === 'HITCH' && rTime >= 30 && rTime <= 56 && nearestDefDist >= 13) {
            score += 65;
            isBreakOpen = true;
          }
          // Wheel sideline route (frames 32 - 80)
          else if (t.routeType === 'WHEEL' && rTime >= 32 && rTime <= 80 && nearestDefDist >= 14) {
            score += 75;
            isBreakOpen = true;
          }
          // Flat route (RB)
          else if (t.routeType === 'FLAT' && nearestDefDist >= 16) {
            score += 50;
            isBreakOpen = true;
          }
        }

        // 3. Scheme-specific weakness exploitation (Tecmo Super Bowl strategic reads)
        if (activeDefKey === 'QUARTERS' && depthYards <= 14) {
          score += 35; // Cover 4 concedes everything underneath
        } else if (activeDefKey === 'COVER3' && (depthYards <= 14 || isCheckdown)) {
          score += 35; // Cover 3 concedes underneath flats and slants
        } else if (activeDefKey === 'TAMPA2' && depthYards > 10 && depthYards < 24 && Math.abs(t.x - 170) > 65) {
          score += 45; // Tampa 2 sideline Honey Hole
        } else if (activeDefKey === 'BLITZ') {
          if (isCheckdown || t.routeType === 'SLANT-L' || t.routeType === 'SLANT-R') {
            score += 50; // Hot read vs Zero Blitz
          }
        }

        // 4. Downfield progression reward
        if (depthYards > 0) {
          score += depthYards * 3.0;
        } else {
          score -= 10;
        }

        // 5. First Down conversion incentive
        if (depthYards >= yardsToGo) {
          score += 30;
        }

        // 6. Playbook specific bonus
        if (p2OffPlay === 'DEEP_SHOT' && depthYards > 12) {
          score += 40;
        }

        // 7. Passing lane obstruction deduction
        score -= laneObstruction;

        // Check for RB spy & bracket pressure on defense (explicit RB_SPY or assigned receiver covering the RB)
        const rbSpyDefenders = defenders.filter(d => d && !d.passRusher && d.defenseAssignment !== 'BLITZ' && (
          d.defenseAssignment === 'RB_SPY' ||
          d.assignedReceiver === rb ||
          (rb && Math.hypot(d.x - rb.x, d.y - rb.y) < 70 && Math.abs(d.y - lineOfScrimmageY) < 55)
        ));
        const rbSpyCount = rbSpyDefenders.length;

        // If evaluating downfield receivers: Recognize that defense wasted defenders spying the RB!
        if (!isCheckdown) {
          if (rbSpyCount >= 2) {
            score += 150; // 2 defenders dedicated to the RB -> downfield receivers have single coverage / wide open grass!
            if (nearestDefDist >= 12) {
              isBreakOpen = true; // Recognize the open downfield man!
            }
          } else if (rbSpyCount === 1) {
            score += 75;
            if (nearestDefDist >= 14) {
              isBreakOpen = true;
            }
          }
        }

        // 8. Checkdown (RB) Hierarchy Rule
        if (isCheckdown) {
          if (rbSpyCount >= 2) {
            score = -999; // NEVER throw to the RB when 2 spies are blanketing him!
            isBreakOpen = false;
          } else if (rbSpyCount === 1) {
            score = -500; // Dedicated spy in the flat will blow up this pass for a loss
            isBreakOpen = false;
          } else if (isUnderHeavyPressure) {
            score += (nearestDefDist >= 18 ? 40 : -30);
          } else if (playClock > 65 && bestScore < 20) {
            // Late progression safety valve when all downfield routes are covered
            score += 15 + (nearestDefDist > 20 ? 15 : 0);
          } else {
            score -= 35; // Strongly prioritize scanning downfield open receivers first
          }
        }

        // Slight natural variation
        score += (Math.random() * 4 - 2);

        return { score, isBreakOpen, depthYards, nearestDefDist, hasCoverageMistake };
      };

      // Phase 1: Read Primary Outside WRs and Slot Seam
      const downfieldTargets = [...primaryTargets, ...(seamTarget ? [seamTarget] : [])];
      let openBreakWR: Entity | null = null;

      for (const wr of downfieldTargets) {
        const evalRes = evaluateTarget(wr, false);
        if (evalRes.isBreakOpen && evalRes.score > 35) {
          openBreakWR = wr;
        }
        if (evalRes.score > bestScore) {
          bestScore = evalRes.score;
          bestTarget = wr;
          bestIsDownfieldWR = true;
        }
      }

      // Phase 2: Read Checkdown RB ONLY if downfield is locked, NO open receiver break, and RB is NOT spied
      if (checkdownTarget) {
        const rbSpyCount = defenders.filter(d => d && !d.passRusher && d.defenseAssignment !== 'BLITZ' && (
          d.defenseAssignment === 'RB_SPY' ||
          d.assignedReceiver === rb ||
          (rb && Math.hypot(d.x - rb.x, d.y - rb.y) < 70 && Math.abs(d.y - lineOfScrimmageY) < 55)
        )).length;
        if (rbSpyCount === 0 && !openBreakWR && !bestIsDownfieldWR) {
          const rbEval = evaluateTarget(checkdownTarget, true);
          if ((isUnderHeavyPressure || (bestScore < 20 && playClock > 65)) && rbEval.score > bestScore) {
            bestScore = rbEval.score;
            bestTarget = checkdownTarget;
            bestIsDownfieldWR = false;
          }
        }
      }

      // Give the CPU one read-based chance to scramble if its passing options are poor.
      if (!cpuScrambleDecisionMade && playClock >= (isUnderHeavyPressure ? 30 : 48)) {
        cpuScrambleDecisionMade = true;
        if (shouldCpuScramble({
          playClock,
          bestScore,
          isUnderHeavyPressure,
          hasOpenBreak: openBreakWR !== null
        })) {
          phase = 'RUNNING';
          activeEntity = qb;
          activeEntity.hasBall = true;
          qbScrambleReactionTimer = 18;
          qb.tackleImmunity = 30;
          isAllBlocking = true;
          activeEntity.vx = (Math.random() < 0.5 ? 1.28 : -1.28);
          activeEntity.vy = 2.24 * attackDirection;
          sounds.playJuke();
          showAnnouncement("CPU QB SCRAMBLE! ALL OFFENSE BLOCKING! 🏃🛡️", "#ffaa00");
          return;
        }
      }

      // Smart release conditions (utilizing the 3-second pocket):
      // 1. Immediate trigger on WR route cut / break when open (throw on the break!)
      // 2. High scoring downfield route developed (playClock > 38)
      // 3. User blitz exploit or coverage bust opportunity!
      // 4. Emergency sack escape (under heavy pressure and playClock > 25)
      // 5. Play clock progression expiration (playClock > 70)
      const totalRushers = defenders.filter(d => d && (d.passRusher || d.defenseAssignment === 'BLITZ')).length;
      const hasCoverageMistakeNow = defenders.some(d => d.coverageMistake && (d.mistakeTimer || 0) > 0);
      const isDeepShotOpportunity = (
        (activeDefKey === 'BLITZ' || totalRushers >= 2 || hasCoverageMistakeNow) &&
        bestTarget !== null &&
        (bestTarget.routeType === 'GO' || bestTarget.routeType === 'FLAG-L' || bestTarget.routeType === 'FLAG-R' || bestTarget.routeType === 'POST-L' || bestTarget.routeType === 'POST-R' || bestTarget.routeType === 'WHEEL') &&
        playClock >= 32
      );

      const shouldThrowNow = shouldCpuReleasePass({
        hasTarget: bestTarget !== null,
        isDeepShotOpportunity,
        hasOpenBreak: openBreakWR !== null,
        isUnderHeavyPressure,
        playClock,
        bestScore
      });

      if (shouldThrowNow && bestTarget !== null) {
        const activeRbSpies = defenders.filter(d => d && !d.passRusher && d.defenseAssignment !== 'BLITZ' && (
          d.defenseAssignment === 'RB_SPY' ||
          d.assignedReceiver === rb ||
          (rb && Math.hypot(d.x - rb.x, d.y - rb.y) < 70 && Math.abs(d.y - lineOfScrimmageY) < 55)
        )).length;

        // Requirement: "2 RB spies is shutting do the AI offense because they keep tossing to the RB and not recognizing the open man."
        // If RB has spies/bracket coverage, NEVER throw to the RB: Select the open downfield receiver!
        let chosenTarget: Entity = bestTarget;
        if ((bestTarget === checkdownTarget || bestTarget === rb) && activeRbSpies >= 1) {
          const sortedDownfield = [...downfieldTargets].sort((a, b) => evaluateTarget(b, false).score - evaluateTarget(a, false).score);
          chosenTarget = openBreakWR || sortedDownfield[0] || receivers[0];
          showAnnouncement("CPU SEES RB SPIES! HITTING OPEN MAN DOWNFIELD! 🏈🎯💥", "#00ffff");
        } else if (openBreakWR && bestTarget === checkdownTarget) {
          chosenTarget = openBreakWR;
        } else if (isDeepShotOpportunity && bestTarget) {
          chosenTarget = bestTarget;
        } else {
          chosenTarget = openBreakWR || bestTarget;
        }

        if (isDeepShotOpportunity && activeRbSpies === 0) {
          if (activeDefKey === 'BLITZ' || totalRushers >= 2) {
            showAnnouncement("CPU EXPLOITS USER BLITZ! DEEP STRIKE OVER THE TOP! 🏈🚀💥", "#00ffff");
          } else {
            showAnnouncement("CPU EXPLOITS COVERAGE BUST! DEEP PASS LAUNCHED! 🚀🏈", "#00ffff");
          }
        }
        const targetDist = Math.hypot(chosenTarget.x - qb.x, chosenTarget.y - qb.y);
        // Original calibrated ball speed
        const isDeepRoute = chosenTarget.routeType === 'GO' || chosenTarget.routeType === 'FLAG-L' || chosenTarget.routeType === 'FLAG-R' || chosenTarget.routeType === 'POST-L' || chosenTarget.routeType === 'POST-R' || chosenTarget.routeType === 'WHEEL';
        const throwSpeed = (isDeepRoute ? (targetDist > 240 ? 7.8 : 7.0) : (targetDist > 140 ? 7.2 : 6.2)) * 0.8;
        const T = Math.max(18, Math.round(targetDist / throwSpeed));

        // Lead target in stride using velocity vector
        const targetVx = chosenTarget.vx || 0;
        const targetVy = chosenTarget.vy || 0;
        let leadX = Math.max(25, Math.min(fieldWidth - 25, chosenTarget.x + targetVx * T * 0.90));
        let leadY = chosenTarget.y + targetVy * T * 0.90;

        // Realistic QB accuracy check for CPU (rusher pressure, deep shot)
        const cpuRusherThreat = defenders.some(d => d && (d.passRusher || d.defenseAssignment === 'BLITZ') && Math.hypot(d.x - qb.x, d.y - qb.y) < 55);
        const cpuHitAsThrown = defenders.some(d => d && (d.passRusher || d.defenseAssignment === 'BLITZ') && Math.hypot(d.x - qb.x, d.y - qb.y) < 32);
        const cpuOffTeam = p2Team;
        const cpuAccCheck = evaluateQbThrowAccuracy({
          throwDist: targetDist,
          isUnderPressure: cpuRusherThreat,
          isDeepShot: isDeepRoute,
          isHitAsThrown: cpuHitAsThrown,
          passProtectionRating: cpuOffTeam.ratings.passProtection
        }, attackDirection);

        if (cpuAccCheck.isOffTarget) {
          leadX = Math.max(20, Math.min(fieldWidth - 20, leadX + cpuAccCheck.offsetX));
          leadY += cpuAccCheck.offsetY;
          if (cpuAccCheck.announcement) {
            showAnnouncement(cpuAccCheck.announcement, '#ffcc00');
          }
        }

        const dx = leadX - qb.x;
        const dy = leadY - qb.y;
        ballPressureDefenders = selectCoverageBreakers(leadX, leadY);
        const vx = dx / T;
        const vy = dy / T;
        // Arch height: soaring arc over linemen
        const maxZ = getPassArcMaxHeight(targetDist, isDeepRoute);

        ball = {
          startX: qb.x,
          startY: qb.y,
          x: qb.x,
          y: qb.y,
          z: 16,
          vx,
          vy,
          maxZ,
          flightFrames: T,
          currentFrame: 0,
          targetX: leadX,
          targetY: leadY,
          intendedTarget: chosenTarget
        };
        qb.hasBall = false;
        phase = 'THROWN';
        sounds.playThrow();
      }
    }

    if (phase === 'HANDOFF' && rb) {
      qb.y += (0.24 * GAME_SPEED_SCALE * attackDirection);
      const meshTargetX = rb.side === 'right' ? 200 : 140;
      qb.x += (meshTargetX - qb.x) * 0.2 * GAME_SPEED_SCALE;

      const targetX = qb.x;
      const targetY = qb.y + (5 * attackDirection);
      moveToward(rb, targetX, targetY, 0.3, 2.08);
      rb.handoffTimer = (rb.handoffTimer || 0) + 1;

      if (rb.handoffTimer > 12) {
        phase = 'RUNNING';
        activeEntity = rb;
        qb.hasBall = false;
        rb.hasBall = true;
        activeEntity.vx = 0;
        activeEntity.vy = 0;
        const playObj = offensivePlaybook[activeOffName];
        if (playObj.type === 'ISO') {
          rb.vx = 0;
        } else if (playObj.type === 'POWER') {
          rb.vx = (rb.side === 'right') ? 1.6 : -1.6;
        } else {
          rb.vx = (rb.side === 'right') ? 2.0 : -2.0;
        }
        if (rb.routeType === 'ANGLE') {
          rb.vx = (rb.side === 'right') ? 1.4 : -1.4;
        }
      }
    }

    if (activeEntity && !isAiming && phase !== 'HANDOFF') {
      if (activeOffense === 'P1' || isInterceptionReturn || (activeOffense === 'P2' && (activeEntity === rb || activeEntity === qb)) || receivers.includes(activeEntity) || activeEntity === centerReceiver) {
        if ((activeEntity.jukeTimer || 0) > 0) {
          activeEntity.jukeTimer!--;
          // Smooth progressive bell-curve for plant-and-cut athletic juke movement
          const progress = 1 - (activeEntity.jukeTimer || 0) / 12;
          const curve = Math.sin(progress * Math.PI);
          const stepSpeed = (activeEntity.jukeVx || 0) * (curve * 1.5 + 0.3);
          activeEntity.x += stepSpeed * GAME_SPEED_SCALE;
        } else {
          if (activeEntity.vx === undefined) activeEntity.vx = 0;
          activeEntity.vx *= 0.88;
          activeEntity.x += activeEntity.vx * 0.8 * GAME_SPEED_SCALE;
        }
        activeEntity.x = Math.max(30, Math.min(fieldWidth - 30, activeEntity.x));

        if ((activeEntity.powerBoostTimer || 0) > 0) activeEntity.powerBoostTimer!--;
        if ((activeEntity.tackleImmunity || 0) > 0) activeEntity.tackleImmunity!--;
        if ((activeEntity.jukeCooldownTimer || 0) > 0) activeEntity.jukeCooldownTimer!--;

        if (phase === 'QB_DROP') {
          if ((qb.dropStepTimer || 0) > 0) {
            qb.dropStepTimer!--;
            // QB takes a crisp 3-step drop backwards away from the line of scrimmage at the beginning of the play
            const progress = (qb.dropStepTimer || 0) / 28;
            const dropSpeed = Math.sin(progress * Math.PI) * 1.35;
            qb.y -= (dropSpeed * GAME_SPEED_SCALE * attackDirection);
          }
        } else if (phase === 'RUNNING') {
          const runSpeed = (((activeEntity.powerBoostTimer || 0) > 0) ? 2.65 : 1.84);
          activeEntity.y += (runSpeed * GAME_SPEED_SCALE * attackDirection);

          // CPU AI ball carrier moves (juke / power truck boost)
          if (activeOffense === 'P2' && activeEntity) {
            const cpuMove = evaluateCpuBallCarrierMoves(
              activeEntity,
              isInterceptionReturn
                ? [qb, rb, centerReceiver, ...receivers, ...linemen].filter((player): player is Entity => Boolean(player))
                : defenders,
              attackDirection,
              currentDown,
              yardsToGo,
              lineOfScrimmageY,
              fieldWidth
            );
            if (cpuMove.moveType === 'JUKE') {
              activeEntity.jukeTimer = 6;
              activeEntity.jukeVx = (cpuMove.lateralVx || 0) > 0 ? 1.6 : -1.6;
              sounds.playJuke();
              showAnnouncement(cpuMove.announcement || 'CPU JUKE MOVE! 💨', '#00ffff');
            } else if (cpuMove.moveType === 'TRUCK') {
              sounds.playPowerBoost();
              showAnnouncement(cpuMove.announcement || 'CPU POWER TRUCK BOOST! ⚡💪', '#ffcc00');
            }
          }

          const playObj = offensivePlaybook[activeOffName];
          if (playObj.type === 'ISO' && activeEntity === rb) {
            const blockingDL = defenders.find(d => d && d.type === 'DL' && Math.hypot(d.x - activeEntity.x, d.y - activeEntity.y) < 35);
            if (blockingDL) {
              const dodgeDir = activeEntity.x > blockingDL.x ? 0.5 : -0.5;
              activeEntity.x += dodgeDir * GAME_SPEED_SCALE;
            }
          }

          if (playObj.type === 'SWEEP' && activeEntity === rb) {
            const targetOutsideX = (rb.side === 'right') ? 260 : 80;
            rb.x += (targetOutsideX - rb.x) * 0.05 * GAME_SPEED_SCALE;
          }
          if (rb && rb.routeType === 'ANGLE' && activeEntity === rb) {
            const angleTargetX = (rb.side === 'right') ? 220 : 120;
            rb.x += (angleTargetX - rb.x) * 0.04 * GAME_SPEED_SCALE;
          }
        }
        activeEntity.x = Math.max(25, Math.min(fieldWidth - 25, activeEntity.x));
      }
    }

    if (phase !== 'DEAD') {
      if (phase === 'QB_DROP') {
        defenders.forEach(d => {
          if (d) d.isEngagedWithBlocker = false;
        });
      }
      const passRushers = defenders.filter(d => d && (d.passRusher || d.defenseAssignment === 'BLITZ'));
      const hasExtraBlitzer = passRushers.length >= 2 || activeDefKey === 'BLITZ';
      const offTeam = activeOffense === 'P1' ? p1Team : p2Team;
      const defTeam = activeDefense === 'P1' ? p1Team : p2Team;

      // Extra blockers assigned to pass protection (RB, Center)
      const extraPassBlockers = [rb, centerReceiver].filter((b): b is Entity => Boolean(b && (b.isBlocker || b.routeType === 'BLOCK')));

      linemen.forEach((l) => {
        l.blockTimer = (l.blockTimer || 0) + 1;
        // Requirement: "give the QB(AI and User ) more time in the pocket unless there is an extra blitzer coming."
        // Standard 1-on-1 rush: 310 frames (~5.0 seconds) clean pocket time!
        // Extra blitzer coming: 140 frames (~2.3 seconds) on interior, and extra rushers shoot free unless extra blocker steps up!
        const baseHoldTime = hasExtraBlitzer ? 140 : 310;
        const blockHoldTime = Math.round(baseHoldTime * (offTeam.ratings.passProtection || 1.0) / (defTeam.ratings.passRush || 1.0));

        if (passRushers.length > 0) {
          const interiorRusher = passRushers[0];
          if ((l.blockTimer || 0) <= blockHoldTime) {
            interiorRusher.isEngagedWithBlocker = true;
            interiorRusher.x = 170;
            interiorRusher.y = lineOfScrimmageY + (3 * attackDirection);
            l.x = 170;
            l.y = lineOfScrimmageY - (3 * attackDirection);
            interiorRusher.vx = 0;
            interiorRusher.vy = 0;
          } else {
            const rushSpeed = ((activeDefKey === 'BLITZ' || hasExtraBlitzer) ? 1.20 : 0.88) * (defTeam.ratings.passRush || 1.0);
            moveToward(interiorRusher, qb.x, qb.y, 0.26, rushSpeed);
          }
        }
      });

      // Extra blitzers: rush straight at QB unless blocked by RB or Center!
      if (phase === 'QB_DROP' && passRushers.length > 1) {
        passRushers.slice(1).forEach((extraRusher, idx) => {
          const matchingBlocker = extraPassBlockers[idx];
          if (matchingBlocker) {
            // Extra blocker meets and stones the extra blitzer!
            extraRusher.isEngagedWithBlocker = true;
            extraRusher.x = matchingBlocker.x;
            extraRusher.y = lineOfScrimmageY + (6 * attackDirection);
            matchingBlocker.y = lineOfScrimmageY - (4 * attackDirection);
            extraRusher.vx = 0;
            extraRusher.vy = 0;
          } else {
            // UNBLOCKED BLITZER: Intense pressure collapses the pocket!
            const rushSpeed = 1.35 * (defTeam.ratings.passRush || 1.0);
            moveToward(extraRusher, qb.x, qb.y, 0.32, rushSpeed);
          }
        });
      }
    }

    const playObj = offensivePlaybook[activeOffName];
    if (phase === 'RUNNING' && !isInterceptionReturn) {
      const runner = activeEntity || qb;
      // All offensive players (receivers, centerReceiver, rb, linemen) engage in blocking
      const blockers: Entity[] = [
        ...receivers,
        centerReceiver,
        (rb !== runner ? rb : null),
        ...linemen
      ].filter((e): e is Entity => e !== null && e !== undefined && e !== runner);

      blockers.forEach(blocker => {
        let targetDefender: Entity | null = null;
        let minThreatDist = Infinity;

        defenders.forEach(d => {
          if (!d) return;
          const defToRunner = Math.hypot(d.x - runner.x, d.y - runner.y);
          const threatScore = scoreRunBlockTarget(blocker, runner, d, attackDirection, runner === qb);
          if (threatScore < minThreatDist && defToRunner < 220) {
            minThreatDist = threatScore;
            targetDefender = d;
          }
        });

        if (targetDefender) {
          const isLeadRb = (blocker === rb);
          const blockSpeed = isLeadRb ? 2.3 : 1.8;
          const blockAccel = isLeadRb ? 0.38 : 0.32;
          moveToward(blocker, (targetDefender as Entity).x, (targetDefender as Entity).y, blockAccel, blockSpeed);

          const contactDist = Math.hypot(blocker.x - (targetDefender as Entity).x, blocker.y - (targetDefender as Entity).y);
          if (contactDist < (blocker.radius || 10) + ((targetDefender as Entity).radius || 10) + 6) {
            // Run blocks slow the defender instead of letting it shed contact immediately.
            (targetDefender as Entity).pursuitTimer = 0;
            (targetDefender as Entity).vx = ((targetDefender as Entity).vx || 0) * 0.3;
            (targetDefender as Entity).vy = ((targetDefender as Entity).vy || 0) * 0.3;
            // Shield runner by nudging defender away
            const pushDirX = (targetDefender as Entity).x > runner.x ? 0.7 : -0.7;
            (targetDefender as Entity).x += pushDirX;
            (targetDefender as Entity).y += (0.5 * attackDirection);
          }
        } else {
          // Advance downfield as lead blocker in front of the runner
          const advanceY = runner.y + (30 * attackDirection);
          moveToward(blocker, blocker.x, advanceY, 0.25, 1.6);
        }
        blocker.x = Math.max(25, Math.min(fieldWidth - 25, blocker.x));
      });
    } else if (playObj.type !== 'PASS' && phase === 'HANDOFF') {
      receivers.forEach(r => {
        let nearestDef: Entity | null = null;
        let minD = Infinity;
        defenders.forEach(d => {
          const dist = Math.hypot(d.x - r.x, d.y - r.y);
          if (dist < minD) { minD = dist; nearestDef = d; }
        });
        if (nearestDef && minD < 70) {
          moveToward(r, (nearestDef as Entity).x, (nearestDef as Entity).y, 0.3, 1.6);
        } else if (rb) {
          moveToward(r, r.x, rb.y + (15 * attackDirection), 0.2, 1.44);
        }
      });
    } else if (!isInterceptionReturn) {
      receivers.forEach(r => {
        if (!r.isBlocker && r.routeType !== 'BLOCK') {
          updateRouteMovement(r, phase, attackDirection, defenders, fieldWidth);
        }
      });
      if (centerReceiver && !centerReceiver.isBlocker && centerReceiver.routeType !== 'BLOCK') {
        updateRouteMovement(centerReceiver, phase, attackDirection, defenders, fieldWidth);
      }
    }

    // Deep route separation evaluation: Create the possibility of open deep receivers for long passes!
    receivers.forEach(r => {
      if (phase === 'QB_DROP' && !r.isBlocker && (r.routeType === 'GO' || r.routeType === 'FLAG-L' || r.routeType === 'FLAG-R' || r.routeType === 'POST-L' || r.routeType === 'POST-R' || r.routeType === 'WHEEL')) {
        const distFromLos = Math.abs(r.y - lineOfScrimmageY);
        if (distFromLos > 75) {
          let minDefDist = Infinity;
          defenders.forEach(d => {
            if (!d || d.passRusher) return;
            const dist = Math.hypot(d.x - r.x, d.y - r.y);
            if (dist < minDefDist) minDefDist = dist;
          });
          r.isOpenDeep = (minDefDist >= 22);
        } else {
          r.isOpenDeep = false;
        }
      } else {
        r.isOpenDeep = false;
      }
    });

    const passBlockers: Entity[] = [
      ...receivers,
      centerReceiver,
      rb
    ].filter((e): e is Entity => Boolean(e && (e.isBlocker || e.routeType === 'BLOCK')));

    if (phase === 'QB_DROP') {
      passBlockers.forEach(blocker => {
        blocker.timer = (blocker.timer || 0) + 1;
        const defaultBlockX = blocker.startX ?? blocker.x;
        const defaultBlockY = (blocker === rb)
          ? qb.y + (20 * attackDirection)
          : lineOfScrimmageY - (12 * attackDirection);

        // Scan for rushers / blitzers targeting the QB
        let targetRusher: Entity | null = null;
        let minRusherDist = Infinity;
        defenders.forEach(d => {
          if (!d) return;
          const distToQb = Math.hypot(d.x - qb.x, d.y - qb.y);
          const distToBlocker = Math.hypot(d.x - blocker.x, d.y - blocker.y);
          if (distToQb < minRusherDist && (distToQb < 115 || distToBlocker < 70)) {
            minRusherDist = distToQb;
            targetRusher = d;
          }
        });

        if (targetRusher) {
          moveToward(blocker, (targetRusher as Entity).x, (targetRusher as Entity).y, 0.42, 2.1);
          const distToRusher = Math.hypot(blocker.x - (targetRusher as Entity).x, blocker.y - (targetRusher as Entity).y);
          if (distToRusher < (blocker.radius || 10) + (targetRusher as Entity).radius + 6) {
            // Engage pass protection block: stop the rusher
            (targetRusher as Entity).isEngagedWithBlocker = true;
            (targetRusher as Entity).blockEngagedTimer = ((targetRusher as Entity).blockEngagedTimer || 0) + 1;
            (targetRusher as Entity).vx = 0;
            (targetRusher as Entity).vy = 0;
            const offsetDir = blocker.x >= qb.x ? 8 : -8;
            (targetRusher as Entity).x = blocker.x + offsetDir;
            (targetRusher as Entity).y = blocker.y + (3 * attackDirection);
          }
        } else {
          moveToward(blocker, defaultBlockX, defaultBlockY, 0.28, 1.4);
        }
        blocker.x = Math.max(30, Math.min(fieldWidth - 30, blocker.x));
      });
    }

    if (rb && !rb.isBlocker && rb.routeType !== 'BLOCK') {
      if (phase === 'QB_DROP' && activeDefKey === 'BLITZ' && rb.blitzEscaped) {
        rb.timer = (rb.timer || 0) + 1;
        const flatTargetX = (rb.x < 170) ? 35 : 305;
        moveToward(rb, flatTargetX, lineOfScrimmageY + (30 * attackDirection), 0.3, 1.76);
        rb.x = Math.max(25, Math.min(fieldWidth - 25, rb.x));
      } else if (playObj.type !== 'PASS' && (phase === 'HANDOFF' || phase === 'RUNNING')) {
        // handled in running
      } else if (!rb.caught && (phase === 'QB_DROP' || phase === 'THROWN')) {
        rb.timer = (rb.timer || 0) + 1;
        const rSpeed = 1.44; // 20% slower than 1.8
        const dir = attackDirection;
        const sidelineX = (rb.startX! < 170) ? 45 : 295;
        let targetX = rb.x;
        let targetY = rb.y;
        if (rb.routeType === 'GO') {
          // RB Fly route streaking deep downfield
          targetY += rSpeed * 1.25 * dir;
          targetX = rb.startX!;
        } else if (rb.routeType === 'ANGLE') {
          const angleTargetX = rb.startX! < 170 ? 210 : 130;
          if (rb.timer < 22) {
            targetX += (angleTargetX - rb.x) * 0.10;
            targetY += rSpeed * 0.9 * dir;
          } else {
            targetX += (angleTargetX - rb.x) * 0.08;
            targetY += rSpeed * 0.55 * dir;
          }
        } else {
          // FLAT route: flares out to the flat towards sideline
          if (rb.timer < 18) {
            targetX += (sidelineX - rb.x) * 0.12;
            targetY += rSpeed * 0.4 * dir;
          } else {
            targetX += (sidelineX - rb.x) * 0.15;
            targetY += (lineOfScrimmageY + (10 * dir) - rb.y) * 0.08;
          }
        }
        moveToward(rb, targetX, targetY, 0.28, rSpeed);
        rb.x = Math.max(30, Math.min(fieldWidth - 30, rb.x));
      }
    }

    if (phase === 'RUNNING') {
      if (rb !== activeEntity && rb && rb.caught) {
        if ((rb.powerBoostTimer || 0) > 0) rb.powerBoostTimer!--;
        const runSpeed = ((rb.powerBoostTimer || 0) > 0) ? 3.36 : 2.24;
        rb.y += (runSpeed * GAME_SPEED_SCALE * attackDirection);
        rb.x = Math.max(25, Math.min(fieldWidth - 25, rb.x));
      }
    }

    if (phase !== 'PRE_SNAP') {
      if (phase === 'QB_DROP') {
        defenders.forEach(d => {
          if (phase !== 'QB_DROP') return;
          if (!d) return;
          const distToQb = Math.hypot(qb.x - d.x, qb.y - d.y);
          const sackThreshold = (qb.radius || 10) + (d.radius || 10) + 3;
          if (distToQb <= sackThreshold) {
            if ((qb.tackleImmunity || 0) > 0) {
              return;
            }
            // Strip-sack fumble chance (6%)
            const fumbleRoll = Math.random();
            if (fumbleRoll < 0.06) {
              triggerFumble(qb);
              return;
            }
            screenShakeTimer = 30;
            phase = 'DEAD';
            sounds.playTackle();
            handlePlayEnd(qb.y, 'SACK');
          }
        });
      }

      defenders.forEach((d, idx) => {
        if (!d) return;
        if ((d.brokenTackleStun || 0) > 0) {
          d.brokenTackleStun!--;
          return;
        }
        if ((d.passRusher || d.defenseAssignment === 'BLITZ') && phase === 'QB_DROP') {
          if (d.isEngagedWithBlocker) {
            // Currently engaged with pass blocker (lineman or RB/Center)
            return;
          }
          // Calibrate rush speed so blitz doesn't instantly overwhelm the pocket before the QB drops back
          const rushSpeed = (activeDefKey === 'BLITZ') ? 1.28 : 1.10;
          const rushAccel = (activeDefKey === 'BLITZ') ? 0.22 : 0.18;
          moveToward(d, qb.x, qb.y, rushAccel, rushSpeed);
          d.x = Math.max(20, Math.min(fieldWidth - 20, d.x));
          d.y = Math.max(30, Math.min(fieldHeight - 30, d.y));
          return;
        }
        if (isInterceptionReturn) {
          if (d !== activeEntity) {
            // Teammates of the returner act as lead blockers downfield
            const runner = activeEntity;
            const pursuers = [qb, rb, centerReceiver, ...receivers, ...linemen].filter((p): p is Entity => Boolean(p));
            let nearestThreat: Entity | null = null;
            let minThreatDist = Infinity;
            pursuers.forEach(p => {
              const dist = Math.hypot(p.x - runner.x, p.y - runner.y);
              if (dist < minThreatDist && dist < 220) {
                minThreatDist = dist;
                nearestThreat = p;
              }
            });
            if (nearestThreat) {
              moveToward(d, (nearestThreat as Entity).x, (nearestThreat as Entity).y, 0.32, 1.8);
            } else {
              moveToward(d, d.x, runner.y + (30 * attackDirection), 0.25, 1.6);
            }
          }
          return;
        }
        if (d.passRusher && phase !== 'RUNNING') return;

        // QB SPY Assignment: Specifically assigned to shadow and contain mobile / scrambling QB
        if ((d.defenseAssignment === 'QB_SPY' || d.isQbSpy) && phase === 'QB_DROP') {
          // If QB leaves the pocket, moves forward, or holds the ball, spy shoots downhill!
          const qbLeftPocket = Math.abs(qb.x - 170) > 22 ||
            ((qb.y - lineOfScrimmageY) * attackDirection > -35) ||
            playClock > 70;
          if (qbLeftPocket) {
            // QB broke out of the pocket or is scrambling: Spy crashes downhill!
            moveToward(d, qb.x, qb.y, 0.44, 2.25);
          } else {
            // Shadow QB horizontally from shallow depth right off LOS (18px off LOS)
            const spyY = lineOfScrimmageY + (18 * attackDirection);
            moveToward(d, qb.x, spyY, 0.35, 1.75);
          }
          d.x = Math.max(20, Math.min(fieldWidth - 20, d.x));
          d.y = Math.max(30, Math.min(fieldHeight - 30, d.y));
          return;
        }

        // RB SPY Assignment: Specifically assigned to blanket, shadow, and cover the RB
        if (d.defenseAssignment === 'RB_SPY' && phase === 'QB_DROP') {
          if (rb) {
            if (rb.isBlocker) {
              // RB is staying in to pass block: Spy reads screen or delayed release from LOS
              const spyY = lineOfScrimmageY + (16 * attackDirection);
              moveToward(d, rb.x, spyY, 0.35, 1.75);
            } else {
              // RB is on a route (FLAT, FLY, ANGLE): Match the RB in tight man coverage!
              const trailDist = 8;
              const targetY = rb.y + (trailDist * attackDirection);
              moveToward(d, rb.x, targetY, 0.40, 2.05);
            }
          } else {
            moveToward(d, 170, lineOfScrimmageY + (18 * attackDirection), 0.35, 1.75);
          }
          d.x = Math.max(20, Math.min(fieldWidth - 20, d.x));
          d.y = Math.max(30, Math.min(fieldHeight - 30, d.y));
          return;
        }

        // Coverage mistake movement (bite underneath, stumble, or blown zone)
        if (d.coverageMistake && (d.mistakeTimer || 0) > 0) {
          d.mistakeTimer!--;
          if (d.coverageMistake === 'BIT_UNDERNEATH') {
            const biteY = lineOfScrimmageY + (15 * attackDirection);
            const biteX = centerReceiver ? centerReceiver.x : 170;
            moveToward(d, biteX, biteY, 0.32, 1.55);
            d.x = Math.max(25, Math.min(fieldWidth - 25, d.x));
            d.y = Math.max(30, Math.min(fieldHeight - 30, d.y));
            return;
          } else if (d.coverageMistake === 'STUMBLE') {
            d.vx = (d.vx || 0) * 0.2;
            d.vy = (d.vy || 0) * 0.2;
            return;
          } else if (d.coverageMistake === 'BLOWN_ZONE') {
            const wrongZoneX = d.x < 170 ? 210 : 130;
            moveToward(d, wrongZoneX, lineOfScrimmageY + (40 * attackDirection), 0.25, 1.2);
            return;
          }
        }

        let targetX = d.x, targetY = d.y;
        let moveSpeed = 0.94; // default zone drop speed (tuned down ~18%)
        let moveAccel = 0.18; // default zone drop acceleration
        const baseSpeed = 0.88; // base pursuit speed
        const dir = attackDirection;

        if (activeDefKey === 'COVER3') {
          if (idx === 1) {
            // Deep Outside 1/3 Left CB
            const wrLeft = receivers.find(r => r.x < 170 && !r.isBlocker);
            const isWrGoingDeep = wrLeft && (wrLeft.routeType === 'GO' || wrLeft.routeType === 'FLAG-L');
            const rbFlatLeft = rb && !rb.isBlocker && rb.routeType === 'FLAT' && (rb.startX! < 170 || rb.side === 'left');
            if (rbFlatLeft && isWrGoingDeep && (wrLeft?.timer || 0) > 25) {
              // Corner bites on the RB Flat route underneath! Leaving deep outside WR open!
              targetX = 80;
              targetY = lineOfScrimmageY + (70 * dir);
              moveSpeed = 1.15;
            } else {
              targetX = 65;
              targetY = lineOfScrimmageY + (138 * dir);
              moveSpeed = 1.40;
            }
          } else if (idx === 2) {
            // Deep Outside 1/3 Right CB
            const wrRight = receivers.find(r => r.x >= 170 && !r.isBlocker);
            const isWrGoingDeep = wrRight && (wrRight.routeType === 'GO' || wrRight.routeType === 'FLAG-R');
            const rbFlatRight = rb && !rb.isBlocker && rb.routeType === 'FLAT' && (rb.startX! >= 170 || rb.side === 'right');
            if (rbFlatRight && isWrGoingDeep && (wrRight?.timer || 0) > 25) {
              // Corner bites on the RB Flat route underneath! Leaving deep outside WR open!
              targetX = 260;
              targetY = lineOfScrimmageY + (70 * dir);
              moveSpeed = 1.15;
            } else {
              targetX = 275;
              targetY = lineOfScrimmageY + (138 * dir);
              moveSpeed = 1.40;
            }
          } else if (idx === 6) {
            // Deep Middle 1/3 Safety: deep centerfield patrol (150px off LOS)
            targetX = 170;
            targetY = lineOfScrimmageY + (150 * dir);
            moveSpeed = 1.50;
          } else if (idx === 5) {
            // Underneath Curl Zone: helps bracket any inside crosser/slant crossing the hash
            if (centerReceiver && centerReceiver.x >= 165 && centerReceiver.x <= 205) {
              targetX = 185;
              targetY = centerReceiver.y + (4 * dir);
              moveSpeed = 1.45;
              moveAccel = 0.25;
            } else {
              targetX = 170;
              targetY = lineOfScrimmageY + (90 * dir);
            }
          } else if (idx === 4) {
            // Right Hook/Curl LB: reads crossing route breaking into right hash/slant window!
            if (centerReceiver && centerReceiver.x > 172 && Math.abs(centerReceiver.y - lineOfScrimmageY) < 140) {
              targetX = Math.min(235, centerReceiver.x + 4);
              targetY = centerReceiver.y + (5 * dir);
              moveSpeed = 1.62;
              moveAccel = 0.28;
            } else {
              targetX = d.zoneX!;
              targetY = d.zoneY!;
            }
          } else {
            // Left Hook/Curl LB (defenders[3])
            targetX = d.zoneX!;
            targetY = d.zoneY!;
          }
        } else if (activeDefKey === 'COVER2MAN') {
          if (d.assignedReceiver) {
            const rec = d.assignedReceiver;
            const isCenterSlot = (rec === centerReceiver);
            const routeRepeatCount = getReceiverRouteRepeatCount(rec);

            if (rec.isCutting) {
              d.reactionTimer = (d.reactionTimer || 0) + 1;
            } else {
              d.reactionTimer = 0;
            }
            // If the route has been run repeatedly, the defender anticipates with 0 lag and jumps the break!
            const maxLag = routeRepeatCount >= 1 ? 0 : (isCenterSlot ? 8 : 12);
            const trailDist = routeRepeatCount >= 1 ? 2 : (isCenterSlot ? 6 : 14);
            moveSpeed = routeRepeatCount >= 1 ? 1.92 : (isCenterSlot ? 1.76 : 1.70);
            moveAccel = routeRepeatCount >= 1 ? 0.44 : (isCenterSlot ? 0.34 : 0.28);

            if (d.reactionTimer > 0 && d.reactionTimer < maxLag) {
              targetX = d.x + (rec.x > d.x ? 1.5 : -1.5);
              targetY = d.y + (moveSpeed * 0.45 * dir);
            } else if (rec.routeType === 'COMEBACK' && (rec.timer || 0) >= 50) {
              targetX = rec.x;
              targetY = rec.y - (4 * dir);
            } else if (rec.routeType === 'FLAG-L' || rec.routeType === 'FLAG-R') {
              const outShade = rec.x >= 170 ? 8 : -8;
              targetX = rec.x + outShade;
              targetY = rec.y + (trailDist * dir);
            } else {
              // Inside hip pocket leverage on slot slant (shading inside to take away the slant)
              const shadeOffset = routeRepeatCount >= 1
                ? (rec.x >= 170 ? -8 : 8)
                : (isCenterSlot ? (rec.x >= 170 ? 4 : -4) : 0);
              targetX = rec.x + shadeOffset;
              targetY = rec.y + (trailDist * dir);
            }
          } else if (idx === 5) {
            targetX = 95; targetY = lineOfScrimmageY + (220 * dir);
          } else if (idx === 6) {
            targetX = 245; targetY = lineOfScrimmageY + (220 * dir);
          } else {
            targetX = 170; targetY = lineOfScrimmageY + (75 * dir);
          }
        } else if (activeDefKey === 'TAMPA2') {
          if (idx === 1) {
            // Shallow left flat corner (< 10 yards)
            targetX = 65; targetY = lineOfScrimmageY + (55 * dir);
          } else if (idx === 2) {
            // Shallow right flat corner (< 10 yards)
            targetX = 275; targetY = lineOfScrimmageY + (55 * dir);
          } else if (idx === 4) {
            // Right Hook LB: Drops right into the right slant/curl window and matches depth!
            if (centerReceiver && centerReceiver.x > 172) {
              targetX = Math.min(235, Math.max(190, centerReceiver.x + 4));
              targetY = centerReceiver.y + (4 * dir);
              moveSpeed = 1.68;
              moveAccel = 0.30;
            } else {
              targetX = 215; targetY = lineOfScrimmageY + (50 * dir);
            }
          } else if (idx === 5) {
            // MLB dropping deep middle hole
            targetX = 170; targetY = lineOfScrimmageY + (175 * dir);
          } else if (idx === 6) {
            // Deep safety
            targetX = 200; targetY = lineOfScrimmageY + (235 * dir);
          } else if (d.zoneX !== undefined) {
            targetX = d.zoneX; targetY = d.zoneY!;
          }
        } else if (activeDefKey === 'BLITZ') {
          if (d.assignedReceiver) {
            const rec = d.assignedReceiver;
            const isCenterSlot = (rec === centerReceiver);
            moveSpeed = isCenterSlot ? 1.74 : 1.68;
            moveAccel = 0.30;
            targetX = rec.x + (isCenterSlot ? 4 : 0);
            targetY = rec.y + ((isCenterSlot ? 6 : 14) * dir);
          } else {
            targetX = 170; targetY = lineOfScrimmageY + (75 * dir);
          }
        } else if (activeDefKey === 'QUARTERS') {
          // 4 Backfield Defenders in 4 Deep Quadrants maintaining deep 55-70px cushion
          if (idx === 1) {
            // Deep 1/4 Left: maintains cushion, jumps comebacks if cutting
            const wrLeft = receivers[0];
            if (wrLeft && wrLeft.routeType === 'COMEBACK' && (wrLeft.timer || 0) >= 50) {
              targetX = wrLeft.x;
              targetY = wrLeft.y - (4 * dir);
              moveSpeed = 1.82;
              moveAccel = 0.38;
            } else {
              targetX = 55;
              targetY = Math.max(lineOfScrimmageY + (170 * dir), wrLeft.y + (50 * dir));
            }
          } else if (idx === 2) {
            // Deep 1/4 Right: maintains cushion, jumps comebacks if cutting
            const wrRight = receivers[1];
            if (wrRight && wrRight.routeType === 'COMEBACK' && (wrRight.timer || 0) >= 50) {
              targetX = wrRight.x;
              targetY = wrRight.y - (4 * dir);
              moveSpeed = 1.82;
              moveAccel = 0.38;
            } else {
              targetX = 285;
              targetY = Math.max(lineOfScrimmageY + (170 * dir), wrRight.y + (50 * dir));
            }
          } else if (idx === 4) {
            // Underneath Right LB in Quarters: buzzes right hook/flat and squeezes slants
            if (centerReceiver && centerReceiver.x > 172) {
              targetX = Math.min(235, centerReceiver.x + 5);
              targetY = centerReceiver.y + (6 * dir);
              moveSpeed = 1.62;
              moveAccel = 0.28;
            } else {
              targetX = d.zoneX!;
              targetY = d.zoneY!;
            }
          } else if (idx === 5) {
            // Deep 1/4 Inside Left FS
            targetX = 120;
            targetY = lineOfScrimmageY + (225 * dir);
          } else if (idx === 6) {
            // Deep 1/4 Inside Right SS
            targetX = 220;
            targetY = lineOfScrimmageY + (225 * dir);
          } else {
            // Underneath Left LB
            targetX = d.zoneX!;
            targetY = d.zoneY!;
          }
        } else if (activeDefKey === 'ROBBER') {
          if (idx === 5) {
            // ROBBER SAFETY: Specifically hunts and undercuts intermediate slants & crossers!
            if (centerReceiver && (centerReceiver.x > 165 || centerReceiver.routeType === 'SLANT-R' || centerReceiver.routeType === 'CROSS-R')) {
              // Drives hard across the formation downhill to jump the right slant!
              targetX = Math.min(230, centerReceiver.x + 8);
              targetY = centerReceiver.y - (3 * dir); // Position between QB and receiver!
              moveSpeed = 1.88;
              moveAccel = 0.38;
            } else {
              targetX = 170; targetY = lineOfScrimmageY + (65 * dir);
            }
          } else if (idx === 6) {
            // Deep single safety
            targetX = 170; targetY = lineOfScrimmageY + (250 * dir);
          } else if (d.assignedReceiver) {
            const rec = d.assignedReceiver;
            if (rec.isCutting) {
              d.reactionTimer = (d.reactionTimer || 0) + 1;
            } else {
              d.reactionTimer = 0;
            }
            const isCenterSlot = (rec === centerReceiver);
            const routeRepeatCount = getReceiverRouteRepeatCount(rec);
            const isSpammed = routeRepeatCount >= 1;
            const maxLag = isSpammed ? 0 : (isCenterSlot ? 8 : 12);
            const trailDist = isSpammed ? 2 : (isCenterSlot ? 6 : 14);
            moveSpeed = isSpammed ? 1.92 : (isCenterSlot ? 1.76 : 1.70);
            moveAccel = isSpammed ? 0.44 : (isCenterSlot ? 0.34 : 0.28);
            if (d.reactionTimer > 0 && d.reactionTimer < maxLag) {
              targetX = d.x + (rec.x > d.x ? 1.5 : -1.5);
              targetY = d.y + (moveSpeed * 0.45 * dir);
            } else if (rec.routeType === 'COMEBACK' && (rec.timer || 0) >= 50) {
              targetX = rec.x;
              targetY = rec.y - (4 * dir);
            } else if (rec.routeType === 'FLAG-L' || rec.routeType === 'FLAG-R') {
              const outShade = rec.x >= 170 ? 8 : -8;
              targetX = rec.x + outShade;
              targetY = rec.y + (trailDist * dir);
            } else {
              const shadeOffset = isSpammed ? (rec.x >= 170 ? -8 : 8) : (isCenterSlot ? (rec.x >= 170 ? 4 : -4) : 0);
              targetX = rec.x + shadeOffset;
              targetY = rec.y + (trailDist * dir);
            }
          } else {
            targetX = d.zoneX || 170;
            targetY = d.zoneY || (lineOfScrimmageY + (65 * dir));
          }
        }

        if (rb && (d.assignedReceiver === rb || d.defenseAssignment === 'RB_SPY') && (phase === 'QB_DROP' || phase === 'THROWN')) {
          const rbTarget = rb;
          const isFlat = (rb.routeType === 'FLAT') || Math.abs(rb.x - 170) > 40;
          const flatShade = isFlat ? (rb.x > 170 ? 8 : -8) : 0;
          targetX = rbTarget.x + flatShade;
          targetY = rbTarget.y + (6 * dir);
          moveSpeed = 1.98;
          moveAccel = 0.42;
        }

        if (d.defenseAssignment === 'MAN' && d.assignedReceiver) {
          const rec = d.assignedReceiver;
          const routeRepeatCount = getReceiverRouteRepeatCount(rec);
          const isSpammed = routeRepeatCount >= 1;
          const shade = isSpammed ? (rec.x >= 170 ? -8 : 8) : 0;
          targetX = rec.x + shade;
          targetY = (rec.routeType === 'COMEBACK' && (rec.timer || 0) >= 50) ? rec.y - (4 * dir) : rec.y + ((isSpammed ? 3 : 10) * dir);
          moveSpeed = isSpammed ? 1.94 : 1.76;
          moveAccel = isSpammed ? 0.44 : 0.32;
        } else if (d.defenseAssignment === 'ZONE') {
          const zoneX = d.zoneX ?? d.startX ?? d.x;
          const zoneY = d.zoneY ?? (lineOfScrimmageY + (80 * dir));
          const eligibleZoneReceivers = [...receivers, centerReceiver, ...(rb && !rb.isBlocker ? [rb] : [])]
            .filter((receiver): receiver is Entity => receiver !== null && !receiver.caught);
          const zoneTargets = eligibleZoneReceivers
            .filter(receiver => Math.abs(receiver.x - zoneX) <= 75 && Math.abs(receiver.y - zoneY) <= 85)
            .sort((first, second) =>
              Math.hypot(first.x - d.x, first.y - d.y) - Math.hypot(second.x - d.x, second.y - d.y)
            );
          const zoneTarget = zoneTargets[0];
          const isSpammed = zoneTarget ? getReceiverRouteRepeatCount(zoneTarget) >= 1 : false;
          if (zoneTarget && zoneTarget.routeType === 'COMEBACK' && (zoneTarget.timer || 0) >= 50) {
            targetX = zoneTarget.x;
            targetY = zoneTarget.y - (4 * dir);
            moveSpeed = 1.84;
            moveAccel = 0.38;
          } else {
            targetX = zoneTarget ? (zoneTarget.x + (isSpammed ? (zoneTarget.x >= 170 ? -6 : 6) : 0)) : zoneX;
            targetY = zoneTarget ? zoneTarget.y + ((isSpammed ? 3 : 8) * dir) : zoneY;
            moveSpeed = isSpammed ? 1.84 : (zoneTarget ? 1.72 : 1.5);
            moveAccel = isSpammed ? 0.38 : (zoneTarget ? 0.32 : 0.26);
          }
        }

        // Only the coverage defenders nearest the catch point break toward the ball.
        if (phase === 'THROWN' && ball) {
          const distToBall = Math.hypot(ball.x - d.x, ball.y - d.y);
          const isTargetingRb = rb && Math.hypot(ball.x - rb.x, ball.y - rb.y) < 65;
          const isRbDefender = (d.assignedReceiver === rb || d.defenseAssignment === 'RB_SPY');

          if (isRbDefender && isTargetingRb) {
            targetX = ball.x;
            targetY = ball.y;
            moveSpeed = 2.45;
            moveAccel = 0.52;
          } else if (ballPressureDefenders.includes(d) && distToBall < 100) {
            targetX = ball.x;
            targetY = ball.y;
            moveSpeed = 1.62;
            moveAccel = 0.28;
          }
        }

        targetX = Math.max(35, Math.min(fieldWidth - 35, targetX));
        targetY = Math.max(60, Math.min(fieldHeight - 60, targetY));

        if (phase === 'RUNNING' && activeEntity) {
          const isRunnerQb = (activeEntity === qb);
          if (isRunnerQb && qbScrambleReactionTimer > 0) {
            d.pursuitTimer = 0;
            return;
          }
          d.pursuitTimer = (d.pursuitTimer || 0) + 1;
          const distToRunner = Math.hypot(activeEntity.x - d.x, activeEntity.y - d.y);
          const isBlitzer = Boolean(d.defenseAssignment === 'BLITZ' || d.passRusher);
          const isSpy = Boolean(d.defenseAssignment === 'QB_SPY' || d.defenseAssignment === 'RB_SPY' || d.isQbSpy);

          // Calibrated realistic pursuit speed
          const timeAcceleration = d.pursuitTimer * 0.034;
          const distanceUrgency = Math.max(0, (distToRunner - 25) * 0.0065);
          const dynamicPursuitSpeed = (baseSpeed + timeAcceleration + distanceUrgency) * (isSpy ? 1.25 : isBlitzer ? 1.20 : 1.0);

          // Calibrated agility as defender gains speed
          const dynamicAccel = Math.min(0.50, (0.24 + (d.pursuitTimer * 0.0025)) * (isSpy ? 1.25 : isBlitzer ? 1.20 : 1.0));

          // Leading pursuit angle to cut off the runner's lane; when runner is QB, contain the edge
          const leadY = activeEntity.y + (18 * dir);
          let leadX = activeEntity.x;
          if (isRunnerQb) {
            // Contain outside scramble lanes
            if (activeEntity.x > 170 && d.x >= activeEntity.x) {
              leadX = activeEntity.x + 10;
            } else if (activeEntity.x < 170 && d.x <= activeEntity.x) {
              leadX = activeEntity.x - 10;
            }
          }
          const targetEntityX = Math.max(25, Math.min(fieldWidth - 25, leadX));
          const targetEntityY = Math.max(40, Math.min(fieldHeight - 40, leadY));

          moveToward(d, targetEntityX, targetEntityY, dynamicAccel, dynamicPursuitSpeed);
        } else {
          d.pursuitTimer = 0;
          moveToward(d, targetX, targetY, moveAccel, moveSpeed);
        }
      });
    }

    const allPlayers = [qb, rb, centerReceiver, ...receivers, ...linemen, ...defenders];
    const includeReceiverCollisions = (phase === 'RUNNING');
    resolveCollisions(
      allPlayers.filter((player): player is Entity => player !== null && player !== undefined),
      includeReceiverCollisions,
      [...receivers, centerReceiver, rb].filter((player): player is Entity => player !== null),
      defenders,
      phase === 'RUNNING' ? activeEntity : (phase === 'QB_DROP' ? qb : null)
    );

    // Defender reaches QB in the pocket during QB_DROP -> SACK!
    if (phase === 'QB_DROP' && !ball) {
      defenders.forEach(d => {
        if (phase !== 'QB_DROP') return;
        if (!d) return;
        if ((d.brokenTackleStun || 0) > 0) return;
        const dist = Math.hypot(qb.x - d.x, qb.y - d.y);
        const contactDist = (qb.radius || 10) + (d.radius || 10) + 4;
        if (dist < contactDist) {
          // If a pass protection blocker is actively engaged on this defender, protect the QB
          const isBlocked = passBlockers.some(blocker => {
            const distBlockerToDef = Math.hypot(blocker.x - d.x, blocker.y - d.y);
            return distBlockerToDef < (blocker.radius || 10) + (d.radius || 10) + 6;
          });
          if (isBlocked) return;

          // Defender reached the QB! SACK!
          screenShakeTimer = 28;
          phase = 'DEAD';
          isAiming = false;
          handlePlayEnd(qb.y, 'SACK');
        }
      });
    }

    // Defender tackles ballcarrier during HANDOFF
    if (phase === 'HANDOFF') {
      const runner = activeEntity || qb;
      defenders.forEach(d => {
        if (phase !== 'HANDOFF') return;
        if (!d) return;
        if ((d.brokenTackleStun || 0) > 0) return;
        const dist = Math.hypot(runner.x - d.x, runner.y - d.y);
        const contactDist = (runner.radius || 10) + (d.radius || 10) + 4;
        if (dist < contactDist) {
          screenShakeTimer = 25;
          phase = 'DEAD';
          isAiming = false;
          handlePlayEnd(runner.y, 'TACKLE');
        }
      });
    }

    if (phase === 'RUNNING' && activeEntity) {
      const activeTacklers = isInterceptionReturn
        ? [qb, rb, centerReceiver, ...receivers, ...linemen].filter((player): player is Entity => Boolean(player))
        : defenders;
      activeTacklers.forEach(d => {
        if (phase !== 'RUNNING') return;
        if (!d) return;
        if ((d.brokenTackleStun || 0) > 0) {
          d.brokenTackleStun!--;
          return;
        }
        if (isInterceptionReturn) {
          d.pursuitTimer = (d.pursuitTimer || 0) + 1;
          const distToRunner = Math.hypot(activeEntity.x - d.x, activeEntity.y - d.y);
          const isSkillPlayer = receivers.includes(d) || d === rb || d === centerReceiver;
          const isLineman = linemen.includes(d);
          const basePursuitSpeed = isSkillPlayer ? 1.05 : (isLineman ? 0.88 : 0.96);
          const speedMultiplier = isSkillPlayer ? 1.25 : 1.10;

          // Calibrated realistic pursuit speed traits matching defense chasing a ball carrier
          const timeAcceleration = d.pursuitTimer * 0.034;
          const distanceUrgency = Math.max(0, (distToRunner - 25) * 0.0065);
          const dynamicPursuitSpeed = (basePursuitSpeed + timeAcceleration + distanceUrgency) * speedMultiplier;

          // Calibrated agility as pursuer gains speed
          const dynamicAccel = Math.min(0.50, (0.24 + (d.pursuitTimer * 0.0025)) * (isSkillPlayer ? 1.25 : 1.10));

          // Leading pursuit angle to cut off the returner's lane downfield
          const leadY = activeEntity.y + (18 * attackDirection);
          const targetX = Math.max(25, Math.min(fieldWidth - 25, activeEntity.x));
          const targetY = Math.max(40, Math.min(fieldHeight - 40, leadY));

          moveToward(d, targetX, targetY, dynamicAccel, dynamicPursuitSpeed);
        }
        const dist = Math.hypot(activeEntity.x - d.x, activeEntity.y - d.y);
        const isBlitzer = Boolean(d.defenseAssignment === 'BLITZ' || d.passRusher);
        const contactRadius = (activeEntity.radius || 10) + (d.radius || 10) + (isBlitzer ? 6 : 4);

        if (dist < contactRadius) {
          if (activeEntity === qb && !canTackleQuarterback(activeEntity.tackleImmunity || 0)) {
            return;
          }
          if ((activeEntity.tackleImmunity || 0) > 0) {
            if (isBlitzer && Math.random() < 0.65) {
              activeEntity.tackleImmunity = 0;
            } else {
              d.brokenTackleStun = isBlitzer ? 20 : 35;
              d.pursuitTimer = 0;
              d.x += (d.x < activeEntity.x ? -20 : 20);
              d.y += (15 * attackDirection);
              screenShakeTimer = 12;
              return;
            }
          }

          // BROKEN TACKLE EVALUATION for long gains!
          const brokenCount = activeEntity.brokenTacklesCount || 0;
          const isBoosted = (activeEntity.powerBoostTimer || 0) > 0;
          const isRB = activeEntity === rb;
          const isQB = activeEntity === qb;

          // Defenders labeled to blitz or tackling the QB have high tackling success
          let breakChance = calculateBrokenTackleChance({
            isRB,
            isBoosted,
            brokenCount,
            isBlitzer,
            isQB
          });
          const isUserDefense = (activeOffense === 'P2');
          if (isUserDefense) {
            breakChance = Math.min(0.22, breakChance * 0.70);
          }
          const roll = Math.random();
          if (roll < breakChance) {
            // BROKEN TACKLE! Shed defender and explode for long breakaway gain
            activeEntity.brokenTacklesCount = brokenCount + 1;
            activeEntity.tackleImmunity = 42;
            activeEntity.powerBoostTimer = 55;
            d.brokenTackleStun = isUserDefense ? 25 : (isBlitzer ? 35 : 60); // Defender is stunned and knocked down/back
            d.pursuitTimer = 0; // Reset pursuit momentum for this stunned defender
            d.x += (d.x < activeEntity.x ? -30 : 30);
            d.y += (35 * attackDirection);
            screenShakeTimer = 22;
            sounds.playBrokenTackle();
            brokenTackleEffect = { x: activeEntity.x, y: activeEntity.y, timer: 35 };
            showAnnouncement("BROKEN TACKLE! BREAKAWAY FOR A LONG GAIN! 💥🏃💨", "#00ffff");
            return;
          }

          // FUMBLE EVALUATION on hard hit
          const fumbleRoll = Math.random();
          const fumbleChance = isBlitzer ? 0.15 : 0.08; // Blitzers force more fumbles on hard downhill collisions
          if (fumbleRoll < fumbleChance) {
            triggerFumble(activeEntity);
            return;
          }

          // Standard tackle
          screenShakeTimer = isBlitzer ? 30 : 25;
          phase = 'DEAD';
          const isBehindLine = (attackDirection === -1 && activeEntity.y > lineOfScrimmageY) ||
                               (attackDirection === 1 && activeEntity.y < lineOfScrimmageY);
          const playEndingType = (activeEntity === qb && isBehindLine) ? 'SACK' : 'TACKLE';
          if (isBlitzer && isBehindLine) {
            showAnnouncement("BLITZ TACKLE FOR LOSS! 💥🛑", "#ff3333");
          } else if (isBlitzer) {
            showAnnouncement("HARD TACKLE BY BLITZER! 💥", "#ff5555");
          }
          handlePlayEnd(activeEntity.y, playEndingType);
        }
      });
    }

    if (ball) {
      ball.currentFrame++;
      ball.x += ball.vx;
      ball.y += ball.vy;

      const progress = ball.currentFrame / ball.flightFrames;
      // Overhand release (z=16) climbing high in a parabolic arc over the line of scrimmage, descending to catch (z=14)
      ball.z = getPassArcHeight(ball.maxZ, progress);

      let playResolved = false;
      const eligibleCatchers = [...receivers, centerReceiver, rb].filter(Boolean) as Entity[];
      const distanceTraveledFromQB = Math.hypot(ball.x - ball.startX, ball.y - ball.startY);

      // 3D Ball Height Clearance Check (Passes safely sail high overhead over line of scrimmage and linemen)
      // Defenders at or near the line of scrimmage cannot swat passes sailing overhead
      if (distanceTraveledFromQB > 50 && progress > 0.30 && progress < 0.80) {
        defenders.forEach(d => {
          if (!playResolved && d) {
            // High overhead clearance: defenders within 60px of line of scrimmage cannot deflect overhead throws
            if (Math.abs(d.y - lineOfScrimmageY) < 60) return;
            // High ball clearance: passes flying high in the air (z > 18) sail safely over player reach
            if (ball!.z > 18) return;

            const distToBall = Math.hypot(d.x - ball!.x, d.y - ball!.y);
            const canDeflect = canDefenderDeflectPass({
              defenderType: d.type,
              isPassRusher: Boolean(d.passRusher || d.defenseAssignment === 'BLITZ'),
              isEngagedWithBlocker: Boolean(d.isEngagedWithBlocker),
              distanceToBall: distToBall,
              ballHeight: ball!.z
            });
            if (canDeflect && Math.random() < 0.08) {
              playResolved = true;
              screenShakeTimer = 22;
              phase = 'DEAD';
              const isPick = Math.random() < 0.25;
              if (isPick) {
                startInterceptionReturn(ball!.x, ball!.y, 'INTERCEPTED UNDERNEATH!', '#ff3333');
              } else {
                handlePlayEnd(ball!.y, 'DEFLECT', 'PASS TIPPED BY LINEBACKER!', '#ffaa00');
              }
              ball = null;
            }
          }
        });
      }

      // Catch point contest resolution: ONLY when ball arrives at destination / descends into catchable window!
      // Passes in flight overhead (progress < 0.70 or ball.z > 20) safely clear the line and cannot be caught/batted down prematurely.
      const activeBall = ball;
      const isArrivalWindow = activeBall && (progress >= 0.70 || activeBall.currentFrame >= activeBall.flightFrames - 4) && activeBall.z <= 20;

      if (!playResolved && isArrivalWindow && activeBall) {
        // Prioritize intended target if in range, otherwise find nearest eligible non-blocking receiver
        const targetReceiver = (activeBall.intendedTarget && !activeBall.intendedTarget.caught && Math.hypot(activeBall.intendedTarget.x - activeBall.x, activeBall.intendedTarget.y - activeBall.y) < 28)
          ? activeBall.intendedTarget
          : null;

        const candidateReceivers = targetReceiver
          ? [targetReceiver]
          : eligibleCatchers.filter(c => {
              if (!c || c.caught || c.isBlocker || c.routeType === 'BLOCK') return false;
              // Prevent players at line of scrimmage from catching/contesting passes thrown deep downfield
              const isAtLine = Math.abs(c.y - lineOfScrimmageY) < 20;
              const isDeepPass = Math.hypot(activeBall.startX - (activeBall.targetX ?? activeBall.x), activeBall.startY - (activeBall.targetY ?? activeBall.y)) > 60;
              if (isAtLine && isDeepPass) return false;
              return Math.hypot(c.x - activeBall.x, c.y - activeBall.y) < 26;
            });

        candidateReceivers.forEach(c => {
          if (!playResolved && c && !c.caught) {
            // Find closest defender to the catch contest point
            let minDefDist = Infinity;
            let defDistToBall = Infinity;

            defenders.forEach(d => {
              if (!d || d.passRusher || d.defenseAssignment === 'BLITZ') return;
              // Defensive linemen at the line of scrimmage cannot contest catches downfield
              if (Math.abs(d.y - lineOfScrimmageY) < 30 && Math.abs(c.y - lineOfScrimmageY) > 35) return;
              const distToC = Math.hypot(d.x - c.x, d.y - c.y);
              const distToB = Math.hypot(d.x - ball!.x, d.y - ball!.y);
              const effDist = Math.min(distToC, distToB);
              if (effDist < minDefDist) {
                minDefDist = effDist;
                defDistToBall = distToB;
              }
            });

            // Coverage contest evaluation
            const routeRepeatCount = getReceiverRouteRepeatCount(c);
            const isRb = (c === rb);
            const recentRbPassCount = userPlayHistory.slice(-4).filter(p => p.targetWasRb || p.isFlatPass || p.routes?.rb === 'FLAT').length;
            const isRbFlatSpammed = isRb && (recentRbPassCount >= 1 || routeRepeatCount >= 1);
            const isTargetSpammed = (activeOffense === 'P1') && (routeRepeatCount >= 1 || isRbFlatSpammed);
            const effectiveDefDist = isRbFlatSpammed
              ? Math.max(2, minDefDist - (recentRbPassCount >= 2 ? 14 : 9))
              : (isTargetSpammed ? Math.max(2, minDefDist - (routeRepeatCount >= 2 ? 10 : 6)) : minDefDist);
            const effectiveBallDist = isRbFlatSpammed
              ? Math.max(2, defDistToBall - (recentRbPassCount >= 2 ? 12 : 8))
              : (isTargetSpammed ? Math.max(2, defDistToBall - (routeRepeatCount >= 2 ? 8 : 5)) : defDistToBall);

            const outcome = resolveCatchContestOutcome({
              effectiveDefDist,
              effectiveBallDist,
              isTargetSpammed,
              isRbFlatSpammed,
              isRb,
              receiverX: c.x,
              fieldWidth
            });

            if (outcome.type === 'COMPLETE') {
              playResolved = true;
              c.caught = true;
              activeEntity = c;
              activeEntity.vx = 0;
              activeEntity.vy = 0;
              activeEntity.powerBoostTimer = 0;
              phase = 'RUNNING';
              sounds.playCatch();
              showAnnouncement(outcome.announcement, outcome.color);
              ball = null;
            } else if (outcome.type === 'DROP' || outcome.type === 'OUT_OF_BOUNDS') {
              // Real-life football mistakes: wide-open drops, slipping on turf, bobbling, or stepping out of bounds
              playResolved = true;
              screenShakeTimer = 10;
              phase = 'DEAD';
              sounds.playWhistle();
              handlePlayEnd(c.y, outcome.resultType, outcome.announcement, outcome.color);
              ball = null;
            } else if (outcome.type === 'BATTED_DOWN') {
              playResolved = true;
              screenShakeTimer = 16;
              phase = 'DEAD';
              handlePlayEnd(c.y, outcome.resultType, outcome.announcement, outcome.color);
              ball = null;
            } else if (outcome.type === 'BROKEN_UP') {
              playResolved = true;
              screenShakeTimer = 18;
              phase = 'DEAD';
              sounds.playTackle();
              handlePlayEnd(c.y, outcome.resultType, outcome.announcement, outcome.color);
              ball = null;
            } else if (outcome.type === 'INTERCEPTED') {
              playResolved = true;
              screenShakeTimer = 26;
              phase = 'DEAD';
              startInterceptionReturn(ball!.x, ball!.y, outcome.announcement, outcome.color);
              ball = null;
            } else if (outcome.type === 'TACKLED_FOR_LOSS') {
              playResolved = true;
              c.caught = true;
              activeEntity = c;
              sounds.playTackle();
              phase = 'DEAD';
              screenShakeTimer = 22;
              handlePlayEnd(c.y, outcome.resultType, outcome.announcement, outcome.color);
              ball = null;
            }
          }
        });
      }

      if (ball && (ball.currentFrame >= ball.flightFrames || ball.y < 30 || ball.x < 15 || ball.x > fieldWidth - 15)) {
        playResolved = true;
        phase = 'DEAD';
        const isOob = (ball.x < 15 || ball.x > fieldWidth - 15);
        const incompleteMsg = isOob ? 'PASS OUT OF BOUNDS! ❌ Over the sideline!' : 'PASS INCOMPLETE! 🏈 Hit the turf!';
        handlePlayEnd(qb.y, 'INCOMPLETE', incompleteMsg, '#aaaaaa');
        ball = null;
      }
    }

    // --- DYNAMIC CAMERA & VIEWPORT AUTO-ZOOM ---
    const baseScrimmageCamY = Math.max(cameraWorldTop, Math.min(cameraWorldBottom - 450, lineOfScrimmageY - 225));
    let targetViewHeight = 450;
    let targetCamY = baseScrimmageCamY;

    if (phase === 'PRE_SNAP') {
      targetViewHeight = 450;
      targetCamY = baseScrimmageCamY;
    } else if (phase === 'QB_DROP') {
      // Camera stays locked at scrimmage by default.
      // It ONLY zooms out when the user pulls back far enough for the QB aiming to reach/leave the screen.
      // Wide receivers running downfield off-screen do NOT trigger a camera zoom out.
      if (isAiming && activeOffense === 'P1') {
        const pullScreenX = aimScreenCurrentX - touchScreenStartX;
        const pullScreenY = aimScreenCurrentY - touchScreenStartY;
        const aimTargetX = qb.x - pullScreenX;
        const aimTargetY = qb.y - pullScreenY;

        const edgeMargin = 45;

        if (attackDirection === -1) {
          // Offense attacking UP (-Y)
          if (aimTargetY < baseScrimmageCamY + edgeMargin) {
            const neededTopY = aimTargetY - edgeMargin;
            const neededBottomY = qb.y + 40; // Keep QB anchored in view
            let neededHeight = neededBottomY - neededTopY;

            // Check if aiming towards sideline requires additional width zoom
            const aimDistX = Math.abs(aimTargetX - qb.x);
            const neededWidth = aimDistX * 2 + 70;
            if (neededWidth > fieldWidth) {
              neededHeight = Math.max(neededHeight, (neededWidth / fieldWidth) * 450);
            }

            targetViewHeight = Math.max(450, Math.min(1000, neededHeight));
            targetCamY = neededBottomY - targetViewHeight;
          } else {
            targetViewHeight = 450;
            targetCamY = baseScrimmageCamY;
          }
        } else {
          // Offense attacking DOWN (+Y)
          if (aimTargetY > baseScrimmageCamY + 450 - edgeMargin) {
            const neededBottomY = aimTargetY + edgeMargin;
            const neededTopY = qb.y - 40; // Keep QB anchored in view
            let neededHeight = neededBottomY - neededTopY;

            const aimDistX = Math.abs(aimTargetX - qb.x);
            const neededWidth = aimDistX * 2 + 70;
            if (neededWidth > fieldWidth) {
              neededHeight = Math.max(neededHeight, (neededWidth / fieldWidth) * 450);
            }

            targetViewHeight = Math.max(450, Math.min(1000, neededHeight));
            targetCamY = neededTopY;
          } else {
            targetViewHeight = 450;
            targetCamY = baseScrimmageCamY;
          }
        }
      } else {
        targetViewHeight = 450;
        targetCamY = baseScrimmageCamY;
      }
    } else if (phase === 'THROWN') {
      // While ball is in flight, frame the ball if it travels beyond screen bounds (WRs leaving screen do NOT zoom out)
      if (ball) {
        const edgeMargin = 45;
        if (attackDirection === -1) {
          if (ball.y < baseScrimmageCamY + edgeMargin) {
            const neededTopY = ball.y - edgeMargin;
            const neededBottomY = Math.max(qb.y + 40, baseScrimmageCamY + 450);
            const neededHeight = neededBottomY - neededTopY;
            targetViewHeight = Math.max(450, Math.min(850, neededHeight));
            targetCamY = neededBottomY - targetViewHeight;
          } else {
            targetViewHeight = 450;
            targetCamY = baseScrimmageCamY;
          }
        } else {
          if (ball.y > baseScrimmageCamY + 450 - edgeMargin) {
            const neededBottomY = ball.y + edgeMargin;
            const neededTopY = Math.min(qb.y - 40, baseScrimmageCamY);
            const neededHeight = neededBottomY - neededTopY;
            targetViewHeight = Math.max(450, Math.min(850, neededHeight));
            targetCamY = neededTopY;
          } else {
            targetViewHeight = 450;
            targetCamY = baseScrimmageCamY;
          }
        }
      } else {
        targetViewHeight = 450;
        targetCamY = baseScrimmageCamY;
      }
    } else if (phase === 'RUNNING') {
      // Ball carrier action: zoom back in smoothly to follow the runner
      targetViewHeight = 450;
      const trackingEntity = activeEntity || qb;
      targetCamY = trackingEntity.y - 220;
    } else if (phase === 'FUMBLE' && fumbleBall) {
      // Scramble for loose fumble: smoothly track the bouncing football
      targetViewHeight = 450;
      targetCamY = fumbleBall.y - 220;
    } else {
      targetViewHeight = 450;
      targetCamY = baseScrimmageCamY;
    }

    // Smoothly interpolate view height and calculate zoom scale and centering offset
    currentViewHeight += (targetViewHeight - currentViewHeight) * 0.12;
    cameraScale = canvas!.height / currentViewHeight;
    cameraOffsetX = (canvas!.width - fieldWidth * cameraScale) / 2;

    // Clamp camera vertical position to field boundaries
    const maxCamY = cameraWorldBottom - currentViewHeight;
    const minCamY = cameraWorldTop;
    targetCamY = Math.max(minCamY, Math.min(maxCamY, targetCamY));
    cameraY += (targetCamY - cameraY) * 0.10;
    cameraY = Math.max(minCamY, Math.min(maxCamY, cameraY));

    const reachedEndZone = (attackDirection === -1 && activeEntity && activeEntity.y <= endZoneHeight) || (attackDirection === 1 && activeEntity && activeEntity.y >= fieldHeight - endZoneHeight);
    if (phase === 'RUNNING' && activeEntity && reachedEndZone) {
      screenShakeTimer = 40;
      phase = 'DEAD';
      handlePlayEnd(attackDirection === -1 ? endZoneHeight : fieldHeight - endZoneHeight, 'TD');
    }

    if (screenShakeTimer > 0) screenShakeTimer--;
  }

  function drawRoutePath(r: Entity | null) {
    if (!r || r.startX === undefined || r.startY === undefined) return;
    const dir = attackDirection;

    if (r && (r.isBlocker || r.routeType === 'BLOCK')) {
      if (phase === 'PRE_SNAP') {
        ctx!.fillStyle = '#ffffff';
        ctx!.font = 'bold 10px Courier New, monospace';
        ctx!.textAlign = 'center';
        ctx!.fillText('🛡️ BLOCK', r.startX, r.startY - (18 * dir));
      }
      return;
    }

    ctx!.strokeStyle = '#00ffff';
    ctx!.lineWidth = 4;
    ctx!.beginPath();
    ctx!.moveTo(r.startX, r.startY);

    if (r.routeType === 'SLANT-L') {
      ctx!.lineTo(r.startX - 30, r.startY + (40 * dir));
    } else if (r.routeType === 'SLANT-R') {
      ctx!.lineTo(r.startX + 30, r.startY + (40 * dir));
    } else if (r.routeType === 'FLAG-L') {
      ctx!.lineTo(r.startX - 40, r.startY + (60 * dir)); ctx!.lineTo(r.startX - 70, r.startY + (90 * dir));
    } else if (r.routeType === 'FLAG-R') {
      ctx!.lineTo(r.startX + 40, r.startY + (60 * dir)); ctx!.lineTo(r.startX + 70, r.startY + (90 * dir));
    } else if (r.routeType === 'COMEBACK') {
      ctx!.lineTo(r.startX, r.startY + (90 * dir)); ctx!.lineTo(r.startX, r.startY + (60 * dir));
    } else if (r.routeType === 'CROSS-L') {
      ctx!.lineTo(r.startX - 90, r.startY + (70 * dir));
    } else if (r.routeType === 'CROSS-R') {
      ctx!.lineTo(r.startX + 90, r.startY + (70 * dir));
    } else if (r.routeType === 'POST-L') {
      ctx!.lineTo(r.startX, r.startY + (70 * dir)); ctx!.lineTo(r.startX - 45, r.startY + (130 * dir));
    } else if (r.routeType === 'POST-R') {
      ctx!.lineTo(r.startX, r.startY + (70 * dir)); ctx!.lineTo(r.startX + 45, r.startY + (130 * dir));
    } else if (r.routeType === 'HITCH') {
      ctx!.lineTo(r.startX, r.startY + (55 * dir)); ctx!.lineTo(r.startX, r.startY + (45 * dir));
    } else if (r.routeType === 'WHEEL') {
      const sideDir = (r.startX < 170) ? -1 : 1;
      ctx!.lineTo(r.startX + (sideDir * 35), r.startY + (25 * dir));
      ctx!.lineTo(r.startX + (sideDir * 40), r.startY + (140 * dir));
    } else if (r.routeType === 'GO') {
      ctx!.lineTo(r.startX, r.startY + (180 * dir));
    } else if (r.routeType === 'FLAT') {
      const outX = (r.startX < 170) ? 45 : 295;
      ctx!.lineTo(outX, lineOfScrimmageY + (10 * dir));
    } else if (r.routeType === 'ANGLE') {
      const angleX = (r.startX < 170) ? 210 : 130;
      ctx!.lineTo(r.startX, r.startY + (45 * dir));
      ctx!.lineTo(angleX, r.startY + (85 * dir));
    }
    ctx!.stroke();

    if (phase === 'PRE_SNAP') {
      ctx!.fillStyle = (r === rb) ? '#00ffaa' : '#ffcc00';
      ctx!.font = '10px Courier New, monospace';
      ctx!.textAlign = 'center';
      ctx!.fillText(r.routeType || '', r.startX, r.startY - (16 * dir));
    }
  }

  function draw() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Outer stadium turf background when zoomed out
    ctx.fillStyle = '#061c0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();

    if (screenShakeTimer > 0) {
      ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    }

    // Apply dynamic camera scale and centering translation
    ctx.translate(cameraOffsetX, 0);
    ctx.scale(cameraScale, cameraScale);
    ctx.translate(0, -cameraY);

    // Playing field surface
    ctx.fillStyle = '#176620';
    ctx.fillRect(20, cameraWorldTop, fieldWidth - 40, cameraWorldBottom - cameraWorldTop);

    // Sideline boundaries
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(20, cameraWorldTop); ctx.lineTo(20, cameraWorldBottom);
    ctx.moveTo(fieldWidth - 20, cameraWorldTop); ctx.lineTo(fieldWidth - 20, cameraWorldBottom);
    ctx.stroke();

    // Field turf pattern
    for (let y = endZoneHeight; y <= fieldHeight - endZoneHeight; y += 100) {
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.lineTo(fieldWidth - 20, y);
      ctx.stroke();

      const distFromOwnGoal = Math.abs(y - endZoneHeight);
      let yardNum = Math.round(distFromOwnGoal / 10);
      if (yardNum > 50) yardNum = 100 - yardNum;

      if (yardNum > 0 && yardNum < 50 && yardNum % 10 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = 'bold 16px Courier New, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(yardNum.toString(), 30, y + 6);

        // End-zone back boundaries
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(20, 0);
        ctx.lineTo(fieldWidth - 20, 0);
        ctx.moveTo(20, fieldHeight);
        ctx.lineTo(fieldWidth - 20, fieldHeight);
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.fillText(yardNum.toString(), fieldWidth - 30, y + 6);
      }
    }

    // Hash marks
    for (let y = endZoneHeight + 10; y < fieldHeight - endZoneHeight; y += 10) {
      if (y % 100 !== 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(135, y); ctx.lineTo(145, y);
        ctx.moveTo(195, y); ctx.lineTo(205, y);
        ctx.stroke();
      }
    }

    // End Zone Top
    ctx.fillStyle = '#ff4500';
    ctx.fillRect(20, 0, fieldWidth - 40, endZoneHeight);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Courier New, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('▼ END ZONE ▼', fieldWidth / 2, 55);

    // End Zone Bottom
    ctx.fillStyle = '#113355';
    ctx.fillRect(20, fieldHeight - endZoneHeight, fieldWidth - 40, endZoneHeight);
    ctx.fillStyle = '#fff';
    ctx.fillText('▲ END ZONE ▲', fieldWidth / 2, fieldHeight - 45);

    // Line of Scrimmage (Cyan)
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(20, lineOfScrimmageY);
    ctx.lineTo(fieldWidth - 20, lineOfScrimmageY);
    ctx.stroke();

    // First Down Marker (Yellow)
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(20, firstDownMarkerY);
    ctx.lineTo(fieldWidth - 20, firstDownMarkerY);
    ctx.stroke();

    // Offensive Route visualizer in PRE_SNAP
    if (phase === 'PRE_SNAP' && activeOffense === 'P1') {
      const activeOffName = (activeOffense === 'P1') ? p1OffPlay : p2OffPlay;
      const playObj = offensivePlaybook[activeOffName];
      if (playObj && playObj.type === 'PASS') {
        receivers.forEach(r => drawRoutePath(r));
        drawRoutePath(centerReceiver);
        if (rb) drawRoutePath(rb);
      }
    }

    const activeOffName = (activeOffense === 'P1') ? p1OffPlay : p2OffPlay;
    const curPlayObj = offensivePlaybook[activeOffName];
    if (curPlayObj.type !== 'PASS' && phase === 'PRE_SNAP' && activeOffense === 'P1' && rb) {
      ctx.strokeStyle = curPlayObj.type === 'ISO' ? 'rgba(0, 255, 170, 0.6)' : 'rgba(173, 255, 47, 0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(rb.startX || rb.x, rb.startY || rb.y);
      if (rb.routeType === 'ANGLE') {
        const angleTargetX = rb.side === 'right' ? 235 : 105;
        ctx.lineTo(rb.startX || rb.x, lineOfScrimmageY + (55 * attackDirection));
        ctx.lineTo(angleTargetX, lineOfScrimmageY + (105 * attackDirection));
      } else {
        ctx.lineTo(170, lineOfScrimmageY + (140 * attackDirection));
      }
      ctx.stroke();
    }

    // QB Rendering
    ctx.fillStyle = (activeEntity === qb) ? '#ff00ff' : qb.color || '#ffcc00';
    if ((qb.powerBoostTimer || 0) > 0) ctx.fillStyle = '#00ffff';
    ctx.beginPath();
    ctx.arc(qb.x, qb.y, qb.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (qb.hasBall) {
      ctx.fillStyle = '#d2691e';
      ctx.beginPath();
      ctx.arc(qb.x + 10, qb.y + 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // When user is on defense: "A user on defense starts the play by tapping the QB, no other taps should start the play."
    if (phase === 'PRE_SNAP' && activeDefense === 'P1') {
      const pulse = (Math.sin(Date.now() / 180) + 1) / 2;
      ctx.save();
      ctx.strokeStyle = `rgba(0, 255, 255, ${0.45 + pulse * 0.45})`;
      ctx.lineWidth = 2.5 / cameraScale;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(qb.x, qb.y, qb.radius + 12 + pulse * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#00ffff';
      ctx.font = `bold ${Math.round(11 / cameraScale)}px Courier New, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('TAP QB TO START 🏈', qb.x, qb.y + (attackDirection === 1 ? -24 : 30) / cameraScale);
      ctx.restore();
    }

    // Forward-projecting aiming vector visualizer (slingshot aim)
    if (isAiming && phase === 'QB_DROP' && activeOffense === 'P1') {
      const pullScreenX = aimScreenCurrentX - touchScreenStartX;
      const pullScreenY = aimScreenCurrentY - touchScreenStartY;
      const projX = qb.x - pullScreenX;
      const projY = qb.y - pullScreenY;
      const forwardAimY = (projY - qb.y) * attackDirection;
      const lateralAimDist = Math.abs(projX - qb.x);
      const maxBackwardAimY = lateralAimDist * Math.tan((30 * Math.PI) / 180);
      const isAimingAtRb = Boolean(rb && Math.hypot(projX - rb.x, projY - rb.y) < 65);
      const isBackwardScrambleAim = !isAimingAtRb && (forwardAimY < -maxBackwardAimY);

      ctx.strokeStyle = isBackwardScrambleAim ? '#00ffff' : (isAimingAtRb ? '#00ffaa' : '#ffcc00');
      ctx.lineWidth = 3 / cameraScale;
      ctx.beginPath();
      ctx.moveTo(qb.x, qb.y);
      ctx.lineTo(projX, projY);
      ctx.stroke();

      ctx.fillStyle = isBackwardScrambleAim
        ? 'rgba(0, 255, 255, 0.45)'
        : (isAimingAtRb ? 'rgba(0, 255, 170, 0.45)' : 'rgba(255, 204, 0, 0.45)');
      ctx.beginPath();
      ctx.arc(projX, projY, 16 / cameraScale, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 / cameraScale;
      ctx.beginPath();
      ctx.arc(projX, projY, 16 / cameraScale, 0, Math.PI * 2);
      ctx.stroke();

      if (isBackwardScrambleAim) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(11 / cameraScale)}px Courier New, monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('QB RUN 🏃🛡️', projX, projY - (20 / cameraScale));
      } else if (isAimingAtRb) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(11 / cameraScale)}px Courier New, monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('PASS TO RB 🏈', projX, projY - (20 / cameraScale));
      }
    }

    // Juke Plant-and-Cut athletic motion trail
    if (activeEntity && (activeEntity.jukeTimer || 0) > 0) {
      const ghostOffset = (activeEntity.jukeVx || 0) * 1.8;
      ctx.save();
      ctx.fillStyle = 'rgba(0, 255, 255, 0.35)';
      ctx.beginPath();
      ctx.arc(activeEntity.x - ghostOffset, activeEntity.y, activeEntity.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Linemen
    linemen.forEach(l => {
      ctx.fillStyle = '#1e90ff';
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Center Receiver
    if (centerReceiver) {
      ctx.fillStyle = (centerReceiver.flash || 0) > 0 ? '#00ff00' : centerReceiver.color || '#00ffff';
      ctx.beginPath();
      ctx.arc(centerReceiver.x, centerReceiver.y, centerReceiver.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();

      // The center should always be assigned pass block and act as the RB does when he is pass blocking
      if (centerReceiver.isBlocker || centerReceiver.routeType === 'BLOCK') {
        const barWidth = centerReceiver.radius * 2 + 10;
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3.5 / cameraScale;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(centerReceiver.x - barWidth / 2, centerReceiver.y - centerReceiver.radius);
        ctx.lineTo(centerReceiver.x + barWidth / 2, centerReceiver.y - centerReceiver.radius);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Receivers
    receivers.forEach(r => {
      ctx.fillStyle = (r.flash || 0) > 0 ? '#00ff00' : r.color || '#00ffff';
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();

      if (r.isBlocker || r.routeType === 'BLOCK') {
        const barWidth = r.radius * 2 + 10;
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3.5 / cameraScale;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(r.x - barWidth / 2, r.y - r.radius);
        ctx.lineTo(r.x + barWidth / 2, r.y - r.radius);
        ctx.stroke();
        ctx.restore();
      }

      // Open receiver indicator: Glow and banner for long pass bomb or capitalized coverage bust!
      if ((r.isOpenDeep || (r.flash || 0) > 0) && phase === 'QB_DROP') {
        ctx.save();
        const pulse = 0.8 + Math.sin(Date.now() * 0.012) * 0.2;
        ctx.strokeStyle = `rgba(0, 255, 255, ${pulse})`;
        ctx.lineWidth = 2.5 / cameraScale;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius + 6, 0, Math.PI * 2);
        ctx.stroke();

        ctx.font = `bold ${Math.round(10 / cameraScale)}px Courier New, monospace`;
        ctx.fillStyle = (r.flash || 0) > 0 ? '#00ffaa' : '#00ffff';
        ctx.textAlign = 'center';
        ctx.fillText((r.flash || 0) > 0 ? 'BUST! OPEN! 🎯' : 'OPEN DEEP! 🚀', r.x, r.y - (18 * attackDirection));
        ctx.restore();
      }
    });

    // Running Back
    if (rb) {
      ctx.fillStyle = (activeEntity === rb) ? '#ff00ff' : rb.color || '#00ffaa';
      if ((rb.powerBoostTimer || 0) > 0) ctx.fillStyle = '#00ffff';
      ctx.beginPath();
      ctx.arc(rb.x, rb.y, rb.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();

      // When he is a blocker, place a white line horizontal across the top of the circle, wider than the circle to signify blocking
      if (rb.isBlocker || rb.routeType === 'BLOCK') {
        const barWidth = rb.radius * 2 + 10;
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3.5 / cameraScale;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(rb.x - barWidth / 2, rb.y - rb.radius);
        ctx.lineTo(rb.x + barWidth / 2, rb.y - rb.radius);
        ctx.stroke();
        ctx.restore();
      }
    }

    // In RUNNING phase on user defense, find lead pursuer to highlight
    let leadPursuer: Entity | null = null;
    if (activeDefense === 'P1' && phase === 'RUNNING' && activeEntity) {
      let minDist = Infinity;
      defenders.forEach(d => {
        if (!d) return;
        const dist = Math.hypot(d.x - activeEntity.x, d.y - activeEntity.y);
        if (dist < minDist) {
          minDist = dist;
          leadPursuer = d;
        }
      });
    }

    // Defenders
    defenders.forEach(d => {
      if (!d) return;
      if (d === gestureEntity && phase === 'PRE_SNAP') {
        ctx.save();
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 3 / cameraScale;
        ctx.beginPath();
        ctx.arc(d.x, d.y, (d.radius || 10) + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (d === leadPursuer) {
        ctx.save();
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2.5 / cameraScale;
        ctx.beginPath();
        ctx.arc(d.x, d.y, (d.radius || 10) + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = d.color || '#ff3333';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (isInterceptionReturn && d === activeEntity) {
        ctx.save();
        ctx.strokeStyle = '#ffd166';
        ctx.fillStyle = '#ffd166';
        ctx.lineWidth = 2.5 / cameraScale;
        ctx.beginPath();
        ctx.arc(d.x, d.y, (d.radius || 10) + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = `bold ${Math.round(9 / cameraScale)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('BALL CARRIER', d.x, d.y - (d.radius || 10) - 7);
        ctx.restore();
      }
      if (d.defenseAssignment) {
        const assignmentColor = d.defenseAssignment === 'BLITZ'
          ? '#00ff66'
          : d.defenseAssignment === 'MAN'
            ? '#ffcc00'
            : d.defenseAssignment === 'QB_SPY'
              ? '#ffaa00'
              : d.defenseAssignment === 'RB_SPY'
                ? '#00ffaa'
                : '#ff3333';
        const radius = d.radius || 10;
        ctx.save();
        ctx.strokeStyle = assignmentColor;
        ctx.fillStyle = assignmentColor;
        ctx.lineWidth = 2 / cameraScale;
        ctx.lineCap = 'round';
        if (d.defenseAssignment === 'MAN') {
          ctx.beginPath();
          ctx.moveTo(d.x - radius - 6, d.y);
          ctx.lineTo(d.x + radius + 6, d.y);
          ctx.stroke();
          if (phase === 'PRE_SNAP') {
            ctx.font = `bold ${Math.round(8.5 / cameraScale)}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText('MAN', d.x, d.y - radius - 4);
          }
        } else if (d.defenseAssignment === 'QB_SPY') {
          // Draw crosshair spy symbol
          ctx.beginPath();
          ctx.arc(d.x, d.y, radius + 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(d.x - radius - 6, d.y);
          ctx.lineTo(d.x + radius + 6, d.y);
          ctx.moveTo(d.x, d.y - radius - 6);
          ctx.lineTo(d.x, d.y + radius + 6);
          ctx.stroke();
          if (phase === 'PRE_SNAP') {
            ctx.font = `bold ${Math.round(8.5 / cameraScale)}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText('QB SPY', d.x, d.y - radius - 4);
          }
        } else if (d.defenseAssignment === 'RB_SPY') {
          // Draw RB spy circle and label
          ctx.beginPath();
          ctx.arc(d.x, d.y, radius + 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.font = `bold ${Math.round(8.5 / cameraScale)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText('RB SPY', d.x, d.y - radius - 4);
        } else if (d.defenseAssignment === 'BLITZ') {
          const direction = -attackDirection;
          const startY = d.y + direction * (radius - 1);
          const endY = d.y + direction * (radius + 8);
          ctx.beginPath();
          ctx.moveTo(d.x, startY);
          ctx.lineTo(d.x, endY);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(d.x - 3.5, endY - direction * 3.5);
          ctx.lineTo(d.x, endY);
          ctx.lineTo(d.x + 3.5, endY - direction * 3.5);
          ctx.stroke();
          if (phase === 'PRE_SNAP') {
            ctx.font = `bold ${Math.round(8.5 / cameraScale)}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText('BLITZ', d.x, d.y - radius - 4);
          }
        } else {
          // ZONE
          const direction = attackDirection;
          const startY = d.y + direction * (radius - 1);
          const endY = d.y + direction * (radius + 8);
          ctx.beginPath();
          ctx.moveTo(d.x, startY);
          ctx.lineTo(d.x, endY);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(d.x - 3.5, endY - direction * 3.5);
          ctx.lineTo(d.x, endY);
          ctx.lineTo(d.x + 3.5, endY - direction * 3.5);
          ctx.stroke();
          if (phase === 'PRE_SNAP' && activeDefense === 'P1') {
            ctx.font = `bold ${Math.round(8.5 / cameraScale)}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText('ZONE', d.x, d.y - radius - 4);
          }
        }
        ctx.restore();
      }

      if (d.coverageMistake && (d.mistakeTimer || 0) > 0) {
        ctx.save();
        ctx.fillStyle = '#ff0055';
        ctx.font = `bold ${Math.round(11 / cameraScale)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('❗ BUST', d.x, d.y - (d.radius || 10) - 5);
        ctx.strokeStyle = '#ff0055';
        ctx.lineWidth = 1.5 / cameraScale;
        ctx.beginPath();
        ctx.arc(d.x, d.y, (d.radius || 10) + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    });

    // Football & Realistic Turf Drop Shadow
    if (ball) {
      const bZ = ball.z || 0;
      const renderRadius = Math.max(5, 11 - (bZ * 0.05));

      // 1. Soft dark turf drop shadow on grass directly underneath the football
      ctx.save();
      const shadowAlpha = Math.max(0.16, 0.45 - (bZ * 0.006));
      const shadowScale = Math.max(0.55, 1.15 - (bZ * 0.008));
      ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
      ctx.beginPath();
      ctx.ellipse(ball.x, ball.y, 8 * shadowScale, 4 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 2. Football elevated by ball.z above the field
      const ballDrawY = ball.y - bZ;

      // Outer glow / halo
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath();
      ctx.arc(ball.x, ballDrawY, renderRadius + 2, 0, Math.PI * 2);
      ctx.fill();

      // Pigskin brown body
      ctx.fillStyle = '#b35412';
      ctx.beginPath();
      ctx.arc(ball.x, ballDrawY, renderRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // White spiral stripe
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ball.x - renderRadius * 0.5, ballDrawY);
      ctx.lineTo(ball.x + renderRadius * 0.5, ballDrawY);
      ctx.stroke();
    }

    // Loose Fumble Football
    if (fumbleBall) {
      ctx.save();
      const pulse = 0.75 + Math.sin(Date.now() * 0.02) * 0.25;

      // Warning pulsating golden ring
      ctx.strokeStyle = `rgba(255, 215, 0, ${pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(fumbleBall.x, fumbleBall.y - (fumbleBall.z || 0), 16, 0, Math.PI * 2);
      ctx.stroke();

      // Drop shadow on turf
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.ellipse(fumbleBall.x, fumbleBall.y + 4, 10, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Loose tumbling football
      ctx.fillStyle = '#d2691e';
      ctx.beginPath();
      ctx.arc(fumbleBall.x, fumbleBall.y - (fumbleBall.z || 0), 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // High visibility FUMBLE marker tag
      ctx.fillStyle = '#ff2222';
      ctx.font = 'bold 12px Courier New, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('🏈 FUMBLE!', fumbleBall.x, fumbleBall.y - (fumbleBall.z || 0) - 18);
      ctx.restore();
    }

    // Broken Tackle Burst Effect (Expanding shockwave ring + label)
    if (brokenTackleEffect && brokenTackleEffect.timer > 0) {
      brokenTackleEffect.timer--;
      ctx.save();
      const progress = 1 - (brokenTackleEffect.timer / 35);
      const radius = 20 + progress * 35;
      const alpha = Math.max(0, 1 - progress);

      ctx.strokeStyle = `rgba(0, 255, 255, ${alpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(brokenTackleEffect.x, brokenTackleEffect.y, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(255, 255, 0, ${alpha * 0.7})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(brokenTackleEffect.x, brokenTackleEffect.y, radius * 0.65, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = `rgba(0, 255, 255, ${alpha})`;
      ctx.font = 'bold 13px Courier New, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⚡ BROKEN TACKLE! ⚡', brokenTackleEffect.x, brokenTackleEffect.y - 22);
      ctx.restore();
    }

    // Backyard Dirt Swipe Gesture (Chalk line from player to finger)
    if (phase === 'PRE_SNAP' && isDirtGestureActive && gestureEntity) {
      const gesture = evaluateDirtSwipeGesture(
        gestureEntity,
        gestureRole,
        gestureCurrentX - gestureStartX,
        gestureCurrentY - gestureStartY,
        attackDirection
      );
      drawDirtSwipeGesture(
        ctx,
        gestureStartX,
        gestureStartY,
        gestureCurrentX,
        gestureCurrentY,
        gesture.label,
        gesture.icon,
        gesture.color,
        cameraScale
      );
    }

    ctx.restore();

  }

  let animationFrameId: number;
  function loop(timestamp: number) {
    updateGameClock(timestamp);
    update();
    draw();
    animationFrameId = requestAnimationFrame(loop);
  }

  animationFrameId = requestAnimationFrame(loop);

  return () => {
    callbacks.onEngineReady(null);
    cancelAnimationFrame(animationFrameId);
    window.removeEventListener('resize', resizeGame);
    canvas.removeEventListener('pointerdown', handlePointerDown);
    canvas.removeEventListener('pointermove', handlePointerMove);
    canvas.removeEventListener('pointerup', handlePointerUp);
  };

}
