import type { Ball, Entity, FumbleBall } from './types';
import { defensiveKeys, defensivePlaybook, middleRoutes, offensiveKeys, offensivePlaybook, outsideRoutes, runningBackRoutes, wrRoutes } from './playbook';
import { alignDefenderAcrossFromRunningBack, alignDefenders, chooseCpuDefensiveAssignments } from './defense';
import { evaluateCpuOffensiveAudibles, evaluateCpuBallCarrierMoves } from './ai';
import { createFumbleBall } from './fumbles';
import { distToSegment, moveToward, resolveCollisions, updateRouteMovement } from './movement';
import { resolvePlayResult, calculateBrokenTackleChance } from './rules';
import { sounds } from './sound';
import { evaluateDirtSwipeGesture, drawDirtSwipeGesture, getBackyardBuddyCallout } from './chalkMenu';

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
  resetDrill: () => void;
  resetGame: () => void;
  applyDefensiveAlignment: () => void;
  selectOffense: (key: string) => void;
  selectDefense: (key: string) => void;
  openPlaybook: () => void;
  openDefPlaybook: () => void;
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
  setP1OffFormationState?: (formation: string) => void;
  setPlaybookModal: (mode: 'OFFENSE' | 'DEFENSE') => void;
  setMomentumState: (momentum: number) => void;
  setGameClockState: (quarter: number, seconds: number) => void;
  showAnnouncement: (text: string, color?: string) => void;
  onEngineReady: (engine: GameEngineHandle | null) => void;
  onFormationShifted?: (direction: number) => void;
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
    setPlaybookModal,
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

  let lineOfScrimmageY = fieldHeight - endZoneHeight - 200;
  let firstDownMarkerY = lineOfScrimmageY - 100;
  let attackDirection = -1; // -1 = upward (-Y), 1 = downward (+Y)
  let currentDown = 1;
  let yardsToGo = 10;
  let quarter = 1;
  let gameClockSeconds = 240;
  let gameClockRemainderMs = 0;
  let lastClockFrameTime: number | null = null;
  let gameClockRunning = true;
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
  let preSnapFieldSwipeStartX = 0;
  let preSnapFieldSwipeStartY = 0;

  function applyChalkRoute(target: Entity, role: 'WR' | 'RB' | 'DEFENDER', value: string) {
    const isBlock = value === 'BLOCK';
    const buddyQuote = getBackyardBuddyCallout(role, value, isBlock);
    const bubbleColor = isBlock ? '#ffffff' : (role === 'RB' ? '#00ffaa' : (role === 'DEFENDER' ? '#ff9999' : '#00ffff'));

    target.speechBubble = {
      text: buddyQuote,
      timer: 110,
      color: bubbleColor
    };

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
        yardsAdjustment: play.risk === 'EXPLOSIVE' ? 14 : play.risk === 'BALANCED' ? 8 : 5,
        momentumDelta: play.risk === 'EXPLOSIVE' ? 2 : 1,
        successBonus: 0.12
      };
    }

    if (isBadMatch) {
      return {
        yardsAdjustment: play.risk === 'EXPLOSIVE' ? -16 : play.risk === 'BALANCED' ? -9 : -6,
        momentumDelta: play.risk === 'EXPLOSIVE' ? -2 : -1,
        successBonus: -0.12
      };
    }

    return {
      yardsAdjustment: 0,
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
        showAnnouncement('AI DEFENSE: SHIFTING TO SHADE RB FLAT 🛡️', '#ff8888');
      }
    } else {
      const lb = defenders[3] || defenders[4];
      if (lb && (currentDown === 3 || currentDown === 4) && yardsToGo <= 3) {
        lb.startY = lineOfScrimmageY + (16 * attackDirection);
        showAnnouncement('LB SHOWING RUN BLITZ 💥', '#ff6666');
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
      showAnnouncement("AI DEFENSE: CLAMPING DOWN ON THE FLAT! 🕵️‍♂️🛑", "#ff5555");
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
          ? ['CONTROL_PASS', 'SHORT_PASS']
          : ['DEEP_SHOT', 'CONTROL_PASS'];
      } else if ((currentDown === 3 || currentDown === 4) && yardsToGo <= 3) {
        counterPlays = repeatedDefense === 'BLITZ' || repeatedDefense === 'ROBBER'
          ? ['SHORT_PASS', 'POWER', 'ISO']
          : ['POWER', 'ISO', 'SHORT_PASS'];
      } else {
        switch (repeatedDefense) {
          case 'COVER3':
            counterPlays = ['SHORT_PASS', 'CONTROL_PASS', 'SWEEP'];
            break;
          case 'QUARTERS':
            counterPlays = ['SHORT_PASS', 'CONTROL_PASS', 'POWER'];
            break;
          case 'COVER2MAN':
            counterPlays = ['SHORT_PASS', 'POWER', 'ISO'];
            break;
          case 'TAMPA2':
            counterPlays = ['CONTROL_PASS', 'DEEP_SHOT', 'SWEEP'];
            break;
          case 'BLITZ':
            counterPlays = ['SHORT_PASS', 'POWER', 'ISO'];
            break;
          case 'ROBBER':
            counterPlays = ['DEEP_SHOT', 'SWEEP', 'POWER'];
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
      return Math.random() < 0.65 ? 'DEEP_SHOT' : 'CONTROL_PASS';
    }

    // 3rd & Short or 4th & Short (<= 3 yards): High-percentage power run or quick slant
    if ((currentDown === 3 || currentDown === 4) && yardsToGo <= 3) {
      const shortOptions = ['POWER', 'ISO', 'SHORT_PASS'];
      return shortOptions[Math.floor(Math.random() * shortOptions.length)];
    }

    // Red zone (within 20 yards of endzone):
    const distToEndzone = attackDirection === -1 ? lineOfScrimmageY - endZoneHeight : (fieldHeight - endZoneHeight) - lineOfScrimmageY;
    if (distToEndzone < 200) {
      const rzOptions = ['SHORT_PASS', 'POWER', 'ISO', 'CONTROL_PASS'];
      return rzOptions[Math.floor(Math.random() * rzOptions.length)];
    }

    // 2nd & Long (> 8 yards): Passing situation
    if (currentDown === 2 && yardsToGo > 8) {
      return Math.random() < 0.5 ? 'CONTROL_PASS' : (Math.random() < 0.5 ? 'DEEP_SHOT' : 'SHORT_PASS');
    }

    // 2nd & Short (<= 4 yards): "Shot Down" - deep strike or sweep
    if (currentDown === 2 && yardsToGo <= 4) {
      const shotDownOptions = ['DEEP_SHOT', 'SWEEP', 'CONTROL_PASS'];
      return shotDownOptions[Math.floor(Math.random() * shotDownOptions.length)];
    }

    // 1st & 10: Balanced pro-style script (65% pass, 35% run)
    const isPass = Math.random() < 0.65;
    if (isPass) {
      const passPlays = ['SHORT_PASS', 'CONTROL_PASS', 'DEEP_SHOT'];
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
        gameClockSeconds = 240;
        gameClockRunning = true;
        publishGameClock();
        resetDrill();
      }
      return;
    }

    if (gameOver) return;
    gameClockRunning = phase === 'QB_DROP' || phase === 'HANDOFF' || phase === 'RUNNING' || phase === 'THROWN' || phase === 'FUMBLE';
    if (!gameClockRunning) return;

    gameClockRemainderMs += elapsedMs;
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
        endQuarter();
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

  function swapPossessionAfterTD() {
    activeOffense = (activeOffense === 'P1') ? 'P2' : 'P1';
    activeDefense = (activeDefense === 'P1') ? 'P2' : 'P1';
    setActiveOffenseState(activeOffense);
    attackDirection *= -1;

    if (attackDirection === -1) {
      lineOfScrimmageY = fieldHeight - endZoneHeight - 200;
    } else {
      lineOfScrimmageY = endZoneHeight + 200;
    }
    firstDownMarkerY = lineOfScrimmageY + (100 * attackDirection);
    currentDown = 1;
    yardsToGo = 10;
    updateDownDisplay();
    runCpuAiPlaySelection();
  }

  function checkFirstDownOrTurnover() {
    const reachedFirstDown = (attackDirection === -1 && lineOfScrimmageY <= firstDownMarkerY) || (attackDirection === 1 && lineOfScrimmageY >= firstDownMarkerY);

    if (reachedFirstDown) {
      showAnnouncement("FIRST DOWN!", "#00ffaa");
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
      resetDrill();
    }, 1600);
  }

  function handlePlayEnd(endingY: number, resultType: string, customMessage?: string, customColor?: string) {
    if (playEnding) return;
    playEnding = true;

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
    const baseYardsGained = playResult.yardsGained;
    const yardsGained = resultType === 'SACK' ? Math.min(-1, baseYardsGained) : clamp(baseYardsGained + matchup.yardsAdjustment, -12, 40);
    playResult.yardsGained = yardsGained;

    if (playResult.isTouchdown) {
      gameClockRunning = false;
      sounds.playTouchdown();
      applyMomentum(2);
      if (activeOffense === 'P1') {
        p1Score += 7;
        setUserScore(p1Score);
        showAnnouncement("TOUCHDOWN P1! (+7 Points)", "#00ffff");
      } else {
        p2Score += 7;
        setCpuScore(p2Score);
        showAnnouncement("TOUCHDOWN P2 / CPU! (+7 Points)", "#ff3333");
      }
      swapPossessionAfterTD();
    } else if (resultType === 'INT') {
      gameClockRunning = false;
      sounds.playWhistle();
      showAnnouncement(customMessage || "INTERCEPTION! TURNOVER ON THE PLAY!", customColor || "#ffcc00");
      swapPossessionOnPlay(endingY);
    } else if (resultType === 'SACK') {
      sounds.playTackle();
      lineOfScrimmageY = endingY;
      yardsToGo -= yardsGained;
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
      sounds.playTackle();
      lineOfScrimmageY = endingY;
      yardsToGo -= yardsGained;
      currentDown++;
      applyMomentum(Math.max(0, matchup.momentumDelta) + (yardsGained >= 12 ? 1 : 0) - (yardsGained <= 2 ? 1 : 0));
      showAnnouncement(`Gain of ${yardsGained} yards. (${currentDown} Down, ${Math.max(0, yardsToGo)} yards to go)`, "#ffcc00");
      checkFirstDownOrTurnover();
    }

    if (activeOffense === 'P1') {
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

    if (phase === 'PRE_SNAP') {
      setPlaybookModal(activeOffense === 'P1' ? 'OFFENSE' : 'DEFENSE');
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

    receivers = [
      {
        startX: alignmentPositions.left, startY: lineOfScrimmageY, x: alignmentPositions.left, y: lineOfScrimmageY, vx: 0, vy: 0, radius: 10,
        routeType: leftRoute, routeIndex: Math.max(0, outsideRoutes.indexOf(leftRoute)), timer: 0, flash: 0, caught: false, isOutside: true, color: '#00ffff',
        isBlocker: leftRoute === 'BLOCK'
      },
      {
        startX: alignmentPositions.slot, startY: lineOfScrimmageY, x: alignmentPositions.slot, y: lineOfScrimmageY, vx: 0, vy: 0, radius: 10,
        routeType: slotRoute, routeIndex: Math.max(0, middleRoutes.indexOf(slotRoute)), timer: 0, flash: 0, caught: false, isOutside: false, color: '#00ffff',
        isBlocker: slotRoute === 'BLOCK'
      },
      {
        startX: alignmentPositions.right, startY: lineOfScrimmageY, x: alignmentPositions.right, y: lineOfScrimmageY, vx: 0, vy: 0, radius: 10,
        routeType: rightRoute, routeIndex: Math.max(0, outsideRoutes.indexOf(rightRoute)), timer: 0, flash: 0, caught: false, isOutside: true, color: '#00ffff',
        isBlocker: rightRoute === 'BLOCK'
      }
    ];

    centerReceiver = {
      startX: alignmentPositions.center, startY: lineOfScrimmageY, x: alignmentPositions.center, y: lineOfScrimmageY, vx: 0, vy: 0, radius: 10,
      routeType: centerRoute, routeIndex: Math.max(0, middleRoutes.indexOf(centerRoute)), timer: 0, flash: 0, caught: false, isOutside: false, color: '#00ffff', isCenter: true,
      isBlocker: centerRoute === 'BLOCK'
    };

    const prevRbBlocker = Boolean(rb?.isBlocker && activePlay.type === 'PASS');
    const rbRoute = prevRbBlocker ? 'BLOCK' : (activePlay.rbRoute || 'FLAT');
    rb = {
      startX: alignmentPositions.rb, startY: lineOfScrimmageY - (75 * attackDirection), x: alignmentPositions.rb, y: lineOfScrimmageY - (75 * attackDirection), vx: 0, vy: 0, radius: 10,
      routeType: rbRoute, routeIndex: Math.max(0, runningBackRoutes.indexOf(rbRoute)),
      timer: 0, flash: 0, caught: false, hasBall: false, color: '#00ffaa', isRB: true, side: alignmentPositions.rbSide, handoffTimer: 0,
      isBlocker: rbRoute === 'BLOCK',
      jukeCount: 0,
      jukeCooldownTimer: 0,
      jukeTimer: 0
    };

    linemen = [
      { startX: 170, startY: lineOfScrimmageY, x: 170, y: lineOfScrimmageY, radius: 10, blockTimer: 0 }
    ];

    defenders = [
      { startX: 170, startY: lineOfScrimmageY + (10 * attackDirection), x: 170, y: lineOfScrimmageY + (10 * attackDirection), radius: 10, type: 'DL', passRusher: true, color: '#ff3333' },
      { startX: 130, startY: lineOfScrimmageY + (60 * attackDirection), x: 130, y: lineOfScrimmageY + (60 * attackDirection), radius: 10, type: 'LB', zoneX: 130, zoneY: lineOfScrimmageY + (80 * attackDirection), color: '#ff6666' },
      { startX: 210, startY: lineOfScrimmageY + (60 * attackDirection), x: 210, y: lineOfScrimmageY + (60 * attackDirection), radius: 10, type: 'LB', zoneX: 210, zoneY: lineOfScrimmageY + (80 * attackDirection), color: '#ff6666' },
      { startX: 80,  startY: lineOfScrimmageY + (110 * attackDirection), x: 80, y: lineOfScrimmageY + (110 * attackDirection), radius: 10, type: 'CB', assignedReceiver: receivers[0], color: '#ff6666' },
      { startX: 260, startY: lineOfScrimmageY + (110 * attackDirection), x: 260, y: lineOfScrimmageY + (110 * attackDirection), radius: 10, type: 'CB', assignedReceiver: receivers[1], color: '#ff6666' },
      { startX: 170, startY: lineOfScrimmageY + (90 * attackDirection),  x: 170, y: lineOfScrimmageY + (90 * attackDirection),  radius: 10, type: 'MLB', assignedCenter: centerReceiver, color: '#ff4444' },
      { startX: 170, startY: lineOfScrimmageY + (200 * attackDirection), x: 170, y: lineOfScrimmageY + (220 * attackDirection), radius: 10, type: 'FS', zoneX: 170, zoneY: lineOfScrimmageY + (220 * attackDirection), color: '#ff6666' }
    ];

    defenseOverrides.clear();
    applyDefensiveAlignment();
    if (animateAlignment) {
      const alignedEntities = [...receivers, centerReceiver, rb, ...defenders].filter((entity): entity is Entity => entity !== null);
      startFormationTransition(alignedEntities, previousPositions);
    }
    activeEntity = qb;
    cpuPreSnapTimer = 0;
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
    if (audibleRes.rbFlipped) {
      positionRBDefender();
    }
    if (!silent && audibleRes.audibleMessage) {
      sounds.playJuke();
      showAnnouncement(audibleRes.audibleMessage, '#00ffff');
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
    resetDrill: () => {
      resetDrill();
    },
    resetGame: () => {
      p1Score = 0;
      p2Score = 0;
      quarter = 1;
      gameClockSeconds = 240;
      gameClockRemainderMs = 0;
      gameClockRunning = true;
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
      attackDirection = -1;
      lineOfScrimmageY = fieldHeight - endZoneHeight - 200;
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
        }
        resetDrill(true);
      }
    },
    openPlaybook: () => {
      if (phase === 'PRE_SNAP' && activeOffense === 'P1') {
        setPlaybookModal('OFFENSE');
      }
    },
    openDefPlaybook: () => {
      if (phase === 'PRE_SNAP' && activeDefense === 'P1') {
        setPlaybookModal('DEFENSE');
      }
    },
    selectDefense: (key: string) => {
      if (activeDefense === 'P1') {
        lastDefenseSelectTime = Date.now();
        const previousPositions = defenders.map(({ x, y }) => ({ x, y }));
        p1DefPlay = key;
        setP1DefPlayState(key);
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
      const playKey = Object.keys(offensivePlaybook).find(k => offensivePlaybook[k].alignment === nextFormation) || p1OffPlay;
      p1OffPlay = playKey;
      resetDrill(true);
      callbacks.onFormationShifted?.(direction);
      sounds.playJuke();
      showAnnouncement(`FORMATION SHIFT: ${nextFormation} 🔄`, '#00ffff');
    } else if (activeDefense === 'P1') {
      const defKeys = ['COVER3', 'TAMPA2', 'MAN', 'BLITZ', 'QUARTERS'];
      const curIdx = defKeys.indexOf(p1DefPlay);
      const nextIdx = (curIdx + direction + defKeys.length) % defKeys.length;
      const nextDef = defKeys[nextIdx];
      engineHandle.selectDefense(nextDef);
      callbacks.onFormationShifted?.(direction);
      sounds.playJuke();
      showAnnouncement(`DEFENSE SHIFT: ${nextDef} 🛡️`, '#ff6666');
    }
  }

  resetDrill();

  function startCpuPlay(): void {
    const cpuPlay = offensivePlaybook[p2OffPlay];
    sounds.playSnap();
    qb.hasBall = true;
    isAiming = false;
    cpuPreSnapTimer = 0;
    if (cpuPlay.type !== 'PASS') {
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
        // User taps a defender: select to move defender before snap or tap to assign RB spy
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

        // REQUIREMENT: "A user on defense starts the play by tapping the QB, no other taps should start the play."
        const distToQb = Math.hypot(qb.x - px, qb.y - py);
        if (distToQb < (qb.radius || 12) + 24) {
          startCpuPlay();
          return;
        }

        // Record start position for open field formation swiping
        preSnapFieldSwipeStartX = px;
        preSnapFieldSwipeStartY = py;
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
      const validDefenders = defenders.filter((d): d is Entity => Boolean(d));
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

      // User moving defensive player before the snap
      if (gestureRole === 'DEFENDER' && activeDefense === 'P1') {
        const boundedX = Math.max(25, Math.min(fieldWidth - 25, curX));
        let boundedY: number;
        if (attackDirection === -1) {
          // Offense drives up (defense is above LOS: y < lineOfScrimmageY)
          boundedY = Math.max(45, Math.min(lineOfScrimmageY - 12, curY));
        } else {
          // Offense drives down (defense is below LOS: y > lineOfScrimmageY)
          boundedY = Math.min(fieldHeight - 45, Math.max(lineOfScrimmageY + 12, curY));
        }
        gestureEntity.x = boundedX;
        gestureEntity.y = boundedY;
      }

      if (dragDist > 12) {
        isDirtGestureActive = true;
      }
      return;
    }

    if (phase === 'RUNNING' && activeDefense === 'P1' && activeEntity) {
      const validDefenders = defenders.filter((d): d is Entity => Boolean(d));
      if (validDefenders.length > 0) {
        let bestDef = validDefenders[0];
        let minDist = Infinity;
        validDefenders.forEach(d => {
          const dist = Math.hypot(d.x - curX, d.y - curY);
          if (dist < minDist) {
            minDist = dist;
            bestDef = d;
          }
        });
        moveToward(bestDef, curX, curY, 0.45, 2.6);
        const distToCarrier = Math.hypot(bestDef.x - activeEntity.x, bestDef.y - activeEntity.y);
        if (distToCarrier < 42) {
          activeEntity.tackleImmunity = 0;
          phase = 'DEAD';
          screenShakeTimer = 22;
          sounds.playTackle();
          handlePlayEnd(activeEntity.y, 'TACKLE', 'USER TACKLE! BALL CARRIER STOPPED! 🛑💥', '#00ffff');
        }
      }
    }
  };

  const handlePointerUp = (e: PointerEvent) => {
    if (phase === 'PRE_SNAP') {
      if (gestureEntity) {
        const { x: curX, y: curY } = screenToWorld(e.clientX, e.clientY);
        gestureCurrentX = curX;
        gestureCurrentY = curY;
        const dragDist = Math.hypot(curX - gestureStartX, curY - gestureStartY);

        if (gestureRole === 'DEFENDER') {
          if (dragDist > 14) {
            // User moved the defender before the snap!
            gestureEntity.startX = gestureEntity.x;
            gestureEntity.startY = gestureEntity.y;
            sounds.playJuke();
            showAnnouncement('DEFENDER REPOSITIONED 📍', '#00ffff');
          } else {
            // Single tap on defensive player: Toggles RB_SPY / Cover RB
            const defIdx = defenders.indexOf(gestureEntity);
            const currentOverride = defenseOverrides.get(defIdx);
            if (currentOverride === 'RB_SPY') {
              applyChalkRoute(gestureEntity, 'DEFENDER', 'DEFAULT');
            } else {
              applyChalkRoute(gestureEntity, 'DEFENDER', 'RB_SPY');
            }
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

      // Check if user swiped open field horizontally to change formations!
      const { x: curX, y: curY } = screenToWorld(e.clientX, e.clientY);
      const swipeDeltaX = curX - preSnapFieldSwipeStartX;
      const swipeDeltaY = curY - preSnapFieldSwipeStartY;
      if (Math.abs(swipeDeltaX) > 28 && Math.abs(swipeDeltaX) > Math.abs(swipeDeltaY) * 1.1) {
        cyclePreSnapFormation(swipeDeltaX < 0 ? 1 : -1);
        return;
      }

      return;
    }

    if (activeDefense === 'P1' && phase === 'RUNNING' && activeEntity) {
      const swipeTime = Date.now() - touchStartTime;
      if (swipeTime < 450) {
        const validDefenders = defenders.filter((d): d is Entity => Boolean(d));
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
        // Athletic plant-and-cut juke movement over 12 frames rather than an instant jump/teleport
        activeEntity.jukeTimer = 12;
        activeEntity.jukeVx = jukeSign * 5.4;

        const inTackleBox = defenders.some(d => Math.hypot(activeEntity.x - d.x, activeEntity.y - d.y) < 45);
        activeEntity.tackleImmunity = inTackleBox ? 35 : 22;
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

      // Tap on QB to tuck and scramble
      if (pullDist < 10) {
        const distToQb = Math.hypot(touchStartX - qb.x, touchStartY - qb.y);
        if (distToQb < 35) {
          phase = 'RUNNING';
          activeEntity = qb;
          activeEntity.vx = 0;
          activeEntity.vy = 0;
          isAllBlocking = true;
          sounds.playJuke();
        }
        return;
      }

      // Slingshot projected target location in world space
      const projX = qb.x - pullX;
      const projY = qb.y - pullY;

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
      const isBackwardScramble = !isTargetingRb && (forwardY < -maxBackwardY);
      if (isBackwardScramble) {
        phase = 'RUNNING';
        activeEntity = qb;
        qb.hasBall = true;
        qb.vx = Math.max(-2.5, Math.min(2.5, dx * 0.05));
        qb.vy = attackDirection * 2.24;
        isAllBlocking = true;
        sounds.playJuke();
        return;
      }

      // Standard physics-based throw directly to the aimed location (tuned for accessible readable flight)
      const throwSpeed = Math.min(6.4, Math.max(3.6, (3.2 + throwDist * 0.028) * 0.8));
      const totalFlightFrames = Math.max(18, Math.round(throwDist / throwSpeed));
      ballPressureDefenders = selectCoverageBreakers(projX, projY);

      const vx = dx / totalFlightFrames;
      const vy = dy / totalFlightFrames;

      ball = {
        startX: qb.x,
        startY: qb.y,
        x: qb.x,
        y: qb.y,
        z: 16,
        vx: vx,
        vy: vy,
        maxZ: Math.min(48, Math.max(34, 26 + throwDist * 0.10)),
        flightFrames: totalFlightFrames,
        currentFrame: 0
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

    // Update player speech bubbles
    const allEntities = [...receivers, centerReceiver, rb, qb, ...defenders].filter(Boolean) as Entity[];
    allEntities.forEach(e => {
      if (e.speechBubble && e.speechBubble.timer > 0) {
        e.speechBubble.timer--;
      }
    });

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
            const isDefender = defenders.includes(p);
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
        const isDefender = closestPlayer ? defenders.includes(closestPlayer) : false;
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

    // Roll for defensive coverage mistake on pass plays (around frame 28-35)
    if (phase === 'QB_DROP' && !coverageMistakeEvaluated && playClock >= 28 && offensivePlaybook[activeOffName]?.type === 'PASS') {
      coverageMistakeEvaluated = true;
      // ~20% chance of a coverage mistake on pass plays
      if (Math.random() < 0.20) {
        const eligibleDefenders = defenders.filter(d =>
          !d.passRusher &&
          d.defenseAssignment !== 'BLITZ' &&
          !d.isQbSpy &&
          (d.type === 'FS' || d.type === 'CB' || d.type === 'LB' || d.type === 'MLB')
        );
        if (eligibleDefenders.length > 0) {
          const chosenDef = eligibleDefenders[Math.floor(Math.random() * eligibleDefenders.length)];
          const mistakeRoll = Math.random();
          if (mistakeRoll < 0.45) {
            chosenDef.coverageMistake = 'BIT_UNDERNEATH';
            chosenDef.mistakeTimer = 55;
            showAnnouncement("COVERAGE BUST! DB BIT ON THE UNDERNEATH ROUTE! 🎯", "#00ffff");
          } else if (mistakeRoll < 0.75) {
            chosenDef.coverageMistake = 'STUMBLE';
            chosenDef.mistakeTimer = 45;
            showAnnouncement("COVERAGE BUST! DB STUMBLED ON THE CUT! 🚀", "#00ffff");
          } else {
            chosenDef.coverageMistake = 'BLOWN_ZONE';
            chosenDef.mistakeTimer = 50;
            showAnnouncement("COVERAGE BUST! DEEP THIRD UNGUARDED! 🚀💥", "#00ffff");
          }
          sounds.playJuke();
        }
      }
    }

    if (phase === 'QB_DROP' && activeOffense === 'P2' && !ball) {
      // Detect unblocked pass rusher pocket pressure
      const unblockedRushers = defenders.filter(d => d && (d.passRusher || d.defenseAssignment === 'BLITZ') && !d.isEngagedWithBlocker);
      let distToRusher = 999;
      unblockedRushers.forEach(r => {
        const d = Math.hypot(r.x - qb.x, r.y - qb.y);
        if (d < distToRusher) distToRusher = d;
      });
      const isUnderHeavyPressure = distToRusher < 46;

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
        const isDeepRoute = t.routeType === 'GO' || t.routeType === 'FLAG-L' || t.routeType === 'FLAG-R';
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

        // Passing lane obstruction check
        let laneObstruction = 0;
        defenders.forEach(d => {
          if (!d || d.passRusher) return;
          const distToLane = distToSegment({ x: qb.x, y: qb.y }, { x: t.x, y: t.y }, { x: d.x, y: d.y });
          if (distToLane < 22) {
            laneObstruction += (22 - distToLane) * 1.8;
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

        // 8. Checkdown (RB) Hierarchy Rule
        if (isCheckdown) {
          if (isUnderHeavyPressure) {
            score += 55; // Immediate blitz/pressure hot route!
          } else if (playClock > 40) {
            score += 35 + (nearestDefDist > 18 ? 25 : 0); // Safety valve when downfield is locked
          } else {
            score -= 15; // Let downfield routes break first
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

      // Phase 2: Read Checkdown RB if pressure is high or downfield is locked
      if (checkdownTarget) {
        const rbEval = evaluateTarget(checkdownTarget, true);
        if ((isUnderHeavyPressure || bestScore < 15 || playClock > 40) && rbEval.score > bestScore) {
          bestScore = rbEval.score;
          bestTarget = checkdownTarget;
          bestIsDownfieldWR = false;
        }
      }

      // Dual-Threat QB Scramble Escape: If under heavy pressure, no receiver open, and pocket collapses
      if (isUnderHeavyPressure && playClock > 32 && bestScore < 15) {
        phase = 'RUNNING';
        activeEntity = qb;
        activeEntity.hasBall = true;
        isAllBlocking = true;
        activeEntity.vx = (Math.random() < 0.5 ? 1.28 : -1.28);
        activeEntity.vy = 2.24 * attackDirection;
        sounds.playJuke();
        showAnnouncement("CPU QB SCRAMBLE! ALL OFFENSE BLOCKING! 🏃🛡️", "#ffaa00");
        return;
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
        (bestTarget.routeType === 'GO' || bestTarget.routeType === 'FLAG-L' || bestTarget.routeType === 'FLAG-R') &&
        playClock >= 32
      );

      const shouldThrowNow =
        isDeepShotOpportunity ||
        (openBreakWR !== null && playClock >= 38) ||
        (isUnderHeavyPressure && playClock > 25 && bestTarget !== null) ||
        (playClock > 45 && bestScore > 20 && bestTarget !== null) ||
        (playClock > 70 && bestTarget !== null);

      if (shouldThrowNow && bestTarget !== null) {
        const chosenTarget: Entity = (isDeepShotOpportunity && bestTarget) ? bestTarget : (openBreakWR || bestTarget);
        if (isDeepShotOpportunity) {
          if (activeDefKey === 'BLITZ' || totalRushers >= 2) {
            showAnnouncement("CPU EXPLOITS USER BLITZ! DEEP STRIKE OVER THE TOP! 🏈🚀💥", "#00ffff");
          } else {
            showAnnouncement("CPU EXPLOITS COVERAGE BUST! DEEP PASS LAUNCHED! 🚀🏈", "#00ffff");
          }
        }
        const targetDist = Math.hypot(chosenTarget.x - qb.x, chosenTarget.y - qb.y);
        // High velocity throw on crossing/slant/intermediate cuts, touch throw on deep go (20% slower to match sprites)
        const isDeepRoute = chosenTarget.routeType === 'GO' || chosenTarget.routeType === 'FLAG-L' || chosenTarget.routeType === 'FLAG-R';
        const throwSpeed = (isDeepRoute ? (targetDist > 240 ? 7.8 : 7.0) : (targetDist > 140 ? 7.2 : 6.2)) * 0.8;
        const T = Math.max(18, Math.round(targetDist / throwSpeed));

        // Lead target in stride using velocity vector
        const targetVx = chosenTarget.vx || 0;
        const targetVy = chosenTarget.vy || 0;
        const leadX = Math.max(25, Math.min(fieldWidth - 25, chosenTarget.x + targetVx * T * 0.92));
        const leadY = chosenTarget.y + targetVy * T * 0.92;

        const dx = leadX - qb.x;
        const dy = leadY - qb.y;
        ballPressureDefenders = selectCoverageBreakers(leadX, leadY);
        const vx = dx / T;
        const vy = dy / T;
        // Arch height: soaring arc over linemen
        const maxZ = isDeepRoute ? Math.min(50, 32 + targetDist * 0.10) : Math.min(42, 26 + targetDist * 0.08);

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
          currentFrame: 0
        };
        qb.hasBall = false;
        phase = 'THROWN';
        sounds.playThrow();
      }
    }

    if (phase === 'HANDOFF' && rb) {
      qb.y += (0.24 * attackDirection);
      const meshTargetX = rb.side === 'right' ? 200 : 140;
      qb.x += (meshTargetX - qb.x) * 0.2;

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
      if (activeOffense === 'P1' || (activeOffense === 'P2' && activeEntity === rb) || receivers.includes(activeEntity) || activeEntity === centerReceiver) {
        if ((activeEntity.jukeTimer || 0) > 0) {
          activeEntity.jukeTimer!--;
          // Smooth progressive bell-curve for plant-and-cut athletic juke movement
          const progress = 1 - (activeEntity.jukeTimer || 0) / 12;
          const curve = Math.sin(progress * Math.PI);
          const stepSpeed = (activeEntity.jukeVx || 0) * (curve * 1.5 + 0.3);
          activeEntity.x += stepSpeed;
        } else {
          if (activeEntity.vx === undefined) activeEntity.vx = 0;
          activeEntity.vx *= 0.88;
          activeEntity.x += activeEntity.vx * 0.8;
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
            qb.y -= (dropSpeed * attackDirection);
          }
        } else if (phase === 'RUNNING') {
          const runSpeed = (((activeEntity.powerBoostTimer || 0) > 0) ? 2.65 : 1.84);
          activeEntity.y += (runSpeed * attackDirection);

          // CPU AI ball carrier moves (juke / power truck boost)
          if (activeOffense === 'P2' && activeEntity) {
            const cpuMove = evaluateCpuBallCarrierMoves(
              activeEntity,
              defenders,
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
              activeEntity.x += dodgeDir;
            }
          }

          if (playObj.type === 'SWEEP' && activeEntity === rb) {
            const targetOutsideX = (rb.side === 'right') ? 260 : 80;
            rb.x += (targetOutsideX - rb.x) * 0.05;
          }
          if (rb && rb.routeType === 'ANGLE' && activeEntity === rb) {
            const angleTargetX = (rb.side === 'right') ? 220 : 120;
            rb.x += (angleTargetX - rb.x) * 0.04;
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
      linemen.forEach((l) => {
        l.blockTimer = (l.blockTimer || 0) + 1;
        // Pocket holds for 3.0 - 3.6 seconds (~180 - 220 frames) before OL breaks down
        // If the offense repeats the exact same play back-to-back, the rush anticipates cadence (-40 frames)
        const recentPlays = userPlayHistory.slice(-3);
        const isRepeatedPlay = Boolean(activeOffense === 'P1' && recentPlays.length >= 1 && recentPlays[recentPlays.length - 1]?.play === p1OffPlay);
        const blockHoldTime = ((activeDefKey === 'BLITZ') ? 170 : 215) - (isRepeatedPlay ? 40 : 0);

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
            const rushSpeed = (activeDefKey === 'BLITZ') ? 1.05 : 0.88;
            moveToward(interiorRusher, qb.x, qb.y, 0.24, rushSpeed);
          }
        }
      });
    }

    const playObj = offensivePlaybook[activeOffName];
    if (phase === 'RUNNING') {
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
          const blockerToDef = Math.hypot(d.x - blocker.x, d.y - blocker.y);
          // Prioritize defenders threatening the runner
          const threatScore = blockerToDef + defToRunner * 0.7;
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
            // Engage block: slow down pursuit, reset breakaway acceleration while blocked
            const isRunnerQb = (runner === qb);
            if (isRunnerQb) {
              // ALL defenders shed wide receiver and backfield blocks immediately to stop the QB run!
              (targetDefender as Entity).pursuitTimer = Math.max(24, ((targetDefender as Entity).pursuitTimer || 0) + 1);
              (targetDefender as Entity).vx = ((targetDefender as Entity).vx || 0) * 0.90;
              (targetDefender as Entity).vy = ((targetDefender as Entity).vy || 0) * 0.90;
              return;
            }
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
    } else {
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
      if (phase === 'QB_DROP' && !r.isBlocker && (r.routeType === 'GO' || r.routeType === 'FLAG-L' || r.routeType === 'FLAG-R')) {
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
        rb.y += (runSpeed * attackDirection);
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
          if (isRunnerQb && (d.pursuitTimer || 0) < 18) {
            d.pursuitTimer = 18;
          }
          d.pursuitTimer = (d.pursuitTimer || 0) + 1;
          const distToRunner = Math.hypot(activeEntity.x - d.x, activeEntity.y - d.y);
          const isBlitzer = Boolean(d.defenseAssignment === 'BLITZ' || d.passRusher);
          const isSpy = Boolean(d.defenseAssignment === 'QB_SPY' || d.defenseAssignment === 'RB_SPY' || d.isQbSpy);

          // Calibrated realistic pursuit speed
          const timeAcceleration = d.pursuitTimer * 0.034;
          const distanceUrgency = Math.max(0, (distToRunner - 25) * 0.0065);
          const dynamicPursuitSpeed = (baseSpeed + timeAcceleration + distanceUrgency) * (isSpy ? 1.25 : isBlitzer ? 1.20 : isRunnerQb ? 1.15 : 1.0);

          // Calibrated agility as defender gains speed
          const dynamicAccel = Math.min(0.50, (0.24 + (d.pursuitTimer * 0.0025)) * (isSpy ? 1.25 : isBlitzer ? 1.20 : isRunnerQb ? 1.15 : 1.0));

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
      defenders.forEach(d => {
        if (phase !== 'RUNNING') return;
        if (!d) return;
        if ((d.brokenTackleStun || 0) > 0) {
          d.brokenTackleStun!--;
          return;
        }
        const dist = Math.hypot(activeEntity.x - d.x, activeEntity.y - d.y);
        const isBlitzer = Boolean(d.defenseAssignment === 'BLITZ' || d.passRusher);
        const contactRadius = (activeEntity.radius || 10) + (d.radius || 10) + (isBlitzer ? 6 : 4);

        if (dist < contactRadius) {
          if ((activeEntity.tackleImmunity || 0) > 0) {
            if (activeEntity === qb) {
              activeEntity.tackleImmunity = 0;
            } else if (isBlitzer && Math.random() < 0.65) {
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
            activeEntity.tackleImmunity = 42; // Immunity frames so runner clears defender
            activeEntity.powerBoostTimer = 55; // Speed burst for breakaway long gain!
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
      const releaseZ = 16;
      const catchZ = 14;
      const baseHeight = releaseZ + (catchZ - releaseZ) * progress;
      const arcHeight = 4 * (ball.maxZ - ((releaseZ + catchZ) / 2)) * progress * (1 - progress);
      ball.z = Math.max(2, baseHeight + arcHeight);

      let playResolved = false;
      const eligibleCatchers = [...receivers, centerReceiver, rb].filter(Boolean) as Entity[];
      const distanceTraveledFromQB = Math.hypot(ball.x - ball.startX, ball.y - ball.startY);

      // 3D Ball Height Clearance Check (Passes safely sail high over linemen and pocket blockers)
      // Linemen engaged in blocks on the line of scrimmage can NEVER swat or bat passes flying overhead!
      if (distanceTraveledFromQB > 30 && progress > 0.18 && progress < 0.85) {
        defenders.forEach(d => {
          if (!playResolved && d) {
            // Line of scrimmage rushers and blockers engaged in trench contact cannot reach balls overhead
            if (d.isEngagedWithBlocker || d.defenseAssignment === 'BLITZ') {
              return;
            }
            const distToBall = Math.hypot(d.x - ball!.x, d.y - ball!.y);
            const maxDefenderReachZ = 22; // Leaping reach for underneath defenders in the slant lane
            if (distToBall < 16 && ball!.z <= maxDefenderReachZ) {
              playResolved = true;
              screenShakeTimer = 28;
              phase = 'DEAD';
              const isPick = Math.random() < 0.40;
              if (isPick) {
                handlePlayEnd(ball!.y, 'INT', 'INTERCEPTED UNDERNEATH!', '#ff3333');
              } else {
                handlePlayEnd(ball!.y, 'DEFLECT', 'PASS BATTED DOWN BY LINEBACKER!', '#ffaa00');
              }
              ball = null;
            }
          }
        });
      }

      // Catch point contest resolution when ball reaches an eligible receiver
      if (!playResolved && distanceTraveledFromQB > 10 && progress > 0.1) {
        eligibleCatchers.forEach(c => {
          if (!playResolved && c && !c.caught && Math.hypot(c.x - ball!.x, c.y - ball!.y) < 35) {
            // Find closest defender to the catch contest point
            let minDefDist = Infinity;
            let defDistToBall = Infinity;

            defenders.forEach(d => {
              if (!d || d.passRusher) return;
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

            if (effectiveDefDist < 14 || effectiveBallDist < 13) {
              // TIGHT BLANKET COVERAGE
              const roll = Math.random();
              if (isRbFlatSpammed) {
                // If user is spamming passes to the RB in the flat, defender jumps the flat!
                if (roll < 0.35) {
                  playResolved = true;
                  screenShakeTimer = 18;
                  phase = 'DEAD';
                  handlePlayEnd(c.y, 'BATTED_DOWN', 'PASS BATTED DOWN IN THE FLAT! 🛑', '#ffaa00');
                  ball = null;
                } else if (roll < 0.65) {
                  playResolved = true;
                  screenShakeTimer = 28;
                  phase = 'DEAD';
                  handlePlayEnd(ball!.y, 'INT', 'PICK-SIX ALERT! INTERCEPTED IN THE FLAT! 🏈🚨', '#ff3333');
                  ball = null;
                } else if (roll < 0.88) {
                  playResolved = true;
                  screenShakeTimer = 20;
                  phase = 'DEAD';
                  sounds.playTackle();
                  handlePlayEnd(c.y, 'BROKEN_UP', 'BLOWN UP IN THE FLAT! PASS BROKEN UP! 💥', '#ff8888');
                  ball = null;
                } else {
                  // Contested catch in flat, but immediately tackled for loss
                  playResolved = true;
                  c.caught = true;
                  activeEntity = c;
                  sounds.playTackle();
                  phase = 'DEAD';
                  screenShakeTimer = 22;
                  handlePlayEnd(c.y, 'TACKLE', 'TACKLED IN THE FLAT FOR A LOSS! 🛑💥', '#ff3333');
                  ball = null;
                }
              } else if (isTargetSpammed) {
                // If spammed, the anticipated defender makes the play 88% of the time!
                if (roll < 0.35) {
                  playResolved = true;
                  screenShakeTimer = 16;
                  phase = 'DEAD';
                  handlePlayEnd(c.y, 'BATTED_DOWN', 'PASS BATTED DOWN BY DEFENDER!', '#ffaa00');
                  ball = null;
                } else if (roll < 0.62) {
                  playResolved = true;
                  screenShakeTimer = 26;
                  phase = 'DEAD';
                  handlePlayEnd(ball!.y, 'INT', 'PICKED OFF! CONTESTED INTERCEPTION!', '#ff3333');
                  ball = null;
                } else if (roll < 0.88) {
                  playResolved = true;
                  screenShakeTimer = 18;
                  phase = 'DEAD';
                  sounds.playTackle();
                  handlePlayEnd(c.y, 'BROKEN_UP', 'PASS BROKEN UP ON CONTACT!', '#ff8888');
                  ball = null;
                } else {
                  playResolved = true;
                  c.caught = true;
                  activeEntity = c;
                  activeEntity.vx = 0;
                  activeEntity.vy = 0;
                  activeEntity.powerBoostTimer = 0;
                  phase = 'RUNNING';
                  screenShakeTimer = 10;
                  sounds.playCatch();
                  showAnnouncement('SPECTACULAR CONTESTED CATCH!', '#00ffaa');
                  ball = null;
                }
              } else if (roll < 0.25) {
                // Batted down
                playResolved = true;
                screenShakeTimer = 16;
                phase = 'DEAD';
                handlePlayEnd(c.y, 'BATTED_DOWN', 'PASS BATTED DOWN BY DEFENDER!', '#ffaa00');
                ball = null;
              } else if (roll < 0.37) {
                // Interception
                playResolved = true;
                screenShakeTimer = 26;
                phase = 'DEAD';
                handlePlayEnd(ball!.y, 'INT', 'PICKED OFF! CONTESTED INTERCEPTION!', '#ff3333');
                ball = null;
              } else if (roll < 0.60) {
                // Broken up on contact
                playResolved = true;
                screenShakeTimer = 18;
                phase = 'DEAD';
                sounds.playTackle();
                handlePlayEnd(c.y, 'BROKEN_UP', 'PASS BROKEN UP ON CONTACT!', '#ff8888');
                ball = null;
              } else {
                // Spectacular contested catch! (40%)
                playResolved = true;
                c.caught = true;
                activeEntity = c;
                activeEntity.vx = 0;
                activeEntity.vy = 0;
                activeEntity.powerBoostTimer = 0;
                phase = 'RUNNING';
                screenShakeTimer = 10;
                sounds.playCatch();
                showAnnouncement('SPECTACULAR CONTESTED CATCH!', '#00ffaa');
                ball = null;
              }
            } else if (effectiveDefDist < 20) {
              // MODERATE / TIGHT NFL WINDOW (12px - 20px)
              const roll = Math.random();
              if (isTargetSpammed && roll < 0.60) {
                // Spammed route tipped or broken up in tight window
                playResolved = true;
                screenShakeTimer = 14;
                phase = 'DEAD';
                handlePlayEnd(c.y, 'DEFLECT', 'TIPPED PASS! INCOMPLETE!', '#aaaaaa');
                ball = null;
              } else if (roll < 0.72) {
                // Clean catch in tight window (72%)
                playResolved = true;
                c.caught = true;
                activeEntity = c;
                activeEntity.vx = 0;
                activeEntity.vy = 0;
                activeEntity.powerBoostTimer = 0;
                phase = 'RUNNING';
                sounds.playCatch();
                if (c === rb) {
                  showAnnouncement('PASS COMPLETE TO RUNNING BACK! 🏈', '#00ffaa');
                } else {
                  showAnnouncement('CATCH IN TIGHT WINDOW!', '#00ffff');
                }
                ball = null;
              } else if (roll < 0.90) {
                // Tipped / Incomplete (18%)
                playResolved = true;
                screenShakeTimer = 14;
                phase = 'DEAD';
                handlePlayEnd(c.y, 'DEFLECT', 'TIPPED PASS! INCOMPLETE!', '#aaaaaa');
                ball = null;
              } else {
                // Tipped Interception (10%)
                playResolved = true;
                screenShakeTimer = 25;
                phase = 'DEAD';
                handlePlayEnd(ball!.y, 'INT', 'TIPPED BALL INTERCEPTED!', '#ffcc00');
                ball = null;
              }
            } else {
              // OPEN RECEIVER (>= 20px separation) - High confidence completion in stride!
              playResolved = true;
              c.caught = true;
              activeEntity = c;
              activeEntity.vx = 0;
              activeEntity.vy = 0;
              activeEntity.powerBoostTimer = 0;
              phase = 'RUNNING';
              sounds.playCatch();
              if (c === rb) {
                showAnnouncement('PASS COMPLETE TO RUNNING BACK! 🏈', '#00ffaa');
              } else {
                showAnnouncement('PASS COMPLETE IN STRIDE! 🏈', '#00ffff');
              }
              ball = null;
            }
          }
        });
      }

      if (ball && (ball.currentFrame >= ball.flightFrames || ball.y < 30 || ball.x < 15 || ball.x > fieldWidth - 15)) {
        playResolved = true;
        phase = 'DEAD';
        handlePlayEnd(qb.y, 'INCOMPLETE');
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

  function drawSpeechBubble(c: CanvasRenderingContext2D, entity: Entity, scale: number) {
    if (!entity.speechBubble || entity.speechBubble.timer <= 0) return;
    const bubble = entity.speechBubble;
    const text = bubble.text;

    c.save();
    c.font = `bold ${Math.round(8.5 / scale)}px Courier New, monospace`;
    const textWidth = c.measureText(text).width;
    const padX = 7 / scale;
    const boxW = textWidth + padX * 2;
    const boxH = 17 / scale;
    const boxX = entity.x - boxW / 2;
    const boxY = entity.y - (entity.radius || 10) - boxH - (8 / scale);

    const alpha = Math.min(1, bubble.timer / 18);
    c.globalAlpha = alpha;

    // Background pill
    c.fillStyle = 'rgba(15, 23, 42, 0.95)';
    c.strokeStyle = bubble.color || '#00ffff';
    c.lineWidth = 1.5 / scale;
    c.beginPath();
    c.roundRect(boxX, boxY, boxW, boxH, 4 / scale);
    c.fill();
    c.stroke();

    // Pointer down towards player
    c.fillStyle = 'rgba(15, 23, 42, 0.95)';
    c.beginPath();
    c.moveTo(entity.x - 3 / scale, boxY + boxH);
    c.lineTo(entity.x, boxY + boxH + (4 / scale));
    c.lineTo(entity.x + 3 / scale, boxY + boxH);
    c.closePath();
    c.fill();

    c.strokeStyle = bubble.color || '#00ffff';
    c.lineWidth = 1.5 / scale;
    c.beginPath();
    c.moveTo(entity.x - 3 / scale, boxY + boxH);
    c.lineTo(entity.x, boxY + boxH + (4 / scale));
    c.lineTo(entity.x + 3 / scale, boxY + boxH);
    c.stroke();

    // Text
    c.fillStyle = bubble.color || '#00ffff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, entity.x, boxY + boxH / 2);

    c.restore();
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

      // Open deep receiver indicator: Glow and banner for long pass bomb!
      if (r.isOpenDeep && phase === 'QB_DROP') {
        ctx.save();
        const pulse = 0.8 + Math.sin(Date.now() * 0.012) * 0.2;
        ctx.strokeStyle = `rgba(0, 255, 255, ${pulse})`;
        ctx.lineWidth = 2.5 / cameraScale;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius + 6, 0, Math.PI * 2);
        ctx.stroke();

        ctx.font = `bold ${Math.round(10 / cameraScale)}px Courier New, monospace`;
        ctx.fillStyle = '#00ffff';
        ctx.textAlign = 'center';
        ctx.fillText('OPEN DEEP! 🚀', r.x, r.y - (18 * attackDirection));
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
        } else if (d.defenseAssignment === 'RB_SPY') {
          // Draw RB spy circle and label
          ctx.beginPath();
          ctx.arc(d.x, d.y, radius + 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.font = `bold ${Math.round(8.5 / cameraScale)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText('RB SPY', d.x, d.y - radius - 4);
        } else {
          const direction = d.defenseAssignment === 'BLITZ' ? -attackDirection : attackDirection;
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
        }
        ctx.restore();
      }

      if (d.coverageMistake && (d.mistakeTimer || 0) > 0) {
        ctx.save();
        ctx.fillStyle = '#ff0055';
        ctx.font = `bold ${Math.round(13 / cameraScale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('❗', d.x, d.y - (d.radius || 10) - 4);
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

    // Backyard Buddy Speech Bubbles
    const speechEntities = [...receivers, centerReceiver, rb, qb, ...defenders].filter(Boolean) as Entity[];
    speechEntities.forEach(e => {
      if (e.speechBubble && e.speechBubble.timer > 0) {
        drawSpeechBubble(ctx, e, cameraScale);
      }
    });

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
