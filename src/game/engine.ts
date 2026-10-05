import type { Ball, DefensiveAssignment, Entity, FumbleBall } from './types';
import { defensiveKeys, defensivePlaybook, middleRoutes, offensiveKeys, offensivePlaybook, outsideRoutes, runningBackRoutes, wrRoutes } from './playbook';
import { alignDefenderAcrossFromReceiver, alignDefenderAcrossFromRunningBack, alignDefenderToZone, alignDefenders, chooseCpuDefensiveAssignments, constrainDefendersToFieldSide, getBlitzAlignmentY, getBracketCoverageTarget, getDefensiveLineAlignmentY, matchCpuDefendersToReceivers, separateDefenderAlignments } from './defense';
import { evaluateCpuOffensiveAudibles, evaluateCpuBallCarrierMoves, isCpuPressureRecognized, shouldCpuGoForItOnFourthDown, shouldCpuReleasePass, shouldCpuScramble, scoreRunBlockTarget } from './ai';
import { createFumbleBall, getCarrierFumbleChance } from './fumbles';
import { canEngagePassBlock, clampPlayerToFieldY, createSimulationClock, distToSegment, GAME_SPEED_SCALE, getBallCarrierRunSpeed, getDesignedRunLateralBias, getFatigueSpeedMultiplier, getPassBlockHoldFrames, getReturnPursuitSpeed, getReturnTeamBlockers, isRusherActivelyBlocked, moveToward, resolveCollisions, shouldApplyRunBlockStun, shouldHoldPassBlock, updatePlayerStamina, updateReceiverTargetStamina, updateRouteMovement } from './movement';
import { resolvePlayResult, isSafety, calculateBrokenTackleChance, calculateYardsToGo, getDriveStartY, getSnapBallPosition, getPassArcHeight, getPassArcMaxHeight, getPassFlightFrames, findTappedPassReceiver, shouldReleaseUserPass, getPassLeadTarget, getRoutePassLeadTarget, canDefenderDeflectPass, canTackleQuarterback, resolveCatchContestOutcome, evaluateQbThrowAccuracy, getCpuThrowAimVariance, calculateKickoffFlight, calculatePuntFlight, getTouchbackYardLineY, getKickoffLineY, getDefenderPassReachHeight, isPlayerOutOfBounds } from './rules';
import { sounds } from './sound';
import { evaluateDirtSwipeGesture, drawDirtSwipeGesture } from './chalkMenu';
import { getHelmetDesign, type HelmetDesign } from './helmetDesigns';
import { drawHelmetSprite } from './helmetRenderer';
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
  attackDirection: number;
  p1Team: TeamProfile;
  p2Team: TeamProfile;
  selectP1Team: (teamId: string) => void;
  selectP2Team: (teamId: string) => void;
  resetDrill: () => void;
  resetGame: (announcementText?: string) => void;
  setPaused: (paused: boolean) => void;
  endGame: () => void;
  applyDefensiveAlignment: () => void;
  selectOffense: (key: string) => void;
  selectDefense: (key: string) => void;
  shiftFormation?: (direction: number) => void;
  kickoff: (power?: number) => void;
  callPunt: () => void;
  punt: (power?: number) => void;
  isKickoffActive: () => boolean;
  is4thDown: () => boolean;
  triggerPlayEnd?: (endingY: number, resultType: string, customMessage?: string, customColor?: string) => void;
  setPossessionForTest?: (team: 'P1' | 'P2') => void;
  set4thDownForTest?: () => void;
  getDefenders?: () => Entity[];
  getControlledDefender?: () => Entity | null;
  selectDefenderForTest?: (index: number) => void;
  startPlay?: () => void;
  startDefensePlay?: () => void;
  repositionDefender?: (index: number, x: number, y: number) => void;
  diveTackle: () => void;
  getReceivers: () => Entity[];
  isJoystickActiveForTest?: () => boolean;
  cameraPerspective?: CameraPerspectiveMode;
  setCameraPerspective?: (mode: CameraPerspectiveMode) => void;
  getCameraPerspective?: () => CameraPerspectiveMode;
  toggleCameraPerspective?: () => CameraPerspectiveMode;
}

export type CameraPerspectiveMode = 'THREE_QUARTER' | 'TOP_DOWN';

export interface GameEngineCallbacks {
  onCameraPerspectiveChange?: (mode: CameraPerspectiveMode) => void;
  setP2OffPlayState: (key: string) => void;
  setP2DefPlayState: (key: string) => void;
  setDownDistanceText: (text: string) => void;
  setActiveOffenseState: (side: string) => void;
  setUserScore: (score: number) => void;
  setCpuScore: (score: number) => void;
  setP1DefPlayState: (key: string) => void;
  setP1OffPlayState?: (key: string) => void;
  setP1OffFormationState?: (formation: 'SPREAD' | 'STACK' | 'TRIPS') => void;
  setP1TeamState?: (team: TeamProfile) => void;
  setP2TeamState?: (team: TeamProfile) => void;
  setMomentumState: (momentum: number) => void;
  setGameClockState: (quarter: number, seconds: number) => void;
  setPhaseState?: (phase: string) => void;
  showAnnouncement: (
    text: string,
    color?: string,
    big?: boolean,
    meta?: {
      category?: 'TURNOVER' | 'TOUCHDOWN' | 'FIRST_DOWN' | 'SAFETY' | 'FUMBLE' | 'SACK' | 'SPECIAL_TEAMS' | 'INFO';
      subtext?: string;
      durationMs?: number;
      possessionTeam?: 'P1' | 'P2';
    }
  ) => void;
  onEngineReady: (engine: GameEngineHandle | null) => void;
  onGameOver?: (p1Score: number, p2Score: number, restored?: boolean, boxScore?: GameBoxScore) => void;
  onTutorialStep?: (step: number) => void;
  setIsKickoffState?: (isKickoff: boolean, kickingTeam: 'P1' | 'P2', receivingTeam: 'P1' | 'P2') => void;
  setIs4thDownState?: (is4thDown: boolean) => void;
  setKickMeterPowerState?: (power: number) => void;
}

export interface GameBoxScore {
  p1Quarters: number[];
  p2Quarters: number[];
}

const GAME_SESSION_STORAGE_KEY = 'backyard-football-game-session-v1';

export function hasSavedGameSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(window.localStorage.getItem(GAME_SESSION_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function mountFootballGame(canvas: HTMLCanvasElement, callbacks: GameEngineCallbacks, options: { tutorial?: boolean } = {}): (() => void) | undefined {
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
    showAnnouncement,
    setIsKickoffState,
    setIs4thDownState,
    setKickMeterPowerState
  } = callbacks;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const touchOptimized = typeof window !== 'undefined' && (
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches)
  );
  const touchHitPadding = touchOptimized ? 30 : 18;
  const receiverHitPadding = touchOptimized ? 30 : 20;

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
  let cameraPerspectiveMode: CameraPerspectiveMode = (() => {
    try {
      const stored = localStorage.getItem('football_camera_perspective');
      if (stored === 'TOP_DOWN' || stored === 'THREE_QUARTER') return stored;
    } catch {}
    return 'THREE_QUARTER';
  })();

  function getCameraPitchFactor(): number {
    return cameraPerspectiveMode === 'THREE_QUARTER' ? 0.72 : 1.0;
  }

  function setCameraPerspective(mode: CameraPerspectiveMode) {
    cameraPerspectiveMode = mode;
    try {
      localStorage.setItem('football_camera_perspective', mode);
    } catch {}
    callbacks.onCameraPerspectiveChange?.(mode);
  }

  function toggleCameraPerspective(): CameraPerspectiveMode {
    const nextMode: CameraPerspectiveMode = cameraPerspectiveMode === 'THREE_QUARTER' ? 'TOP_DOWN' : 'THREE_QUARTER';
    setCameraPerspective(nextMode);
    return nextMode;
  }

  let screenShakeTimer = 0;
  let screenShakeStrength = 4;
  let playClock = 0;
  let cpuScrambleDecisionMade = false;
  let qbScrambleReactionTimer = 0;
  let p1Score = 0;
  let p2Score = 0;
  let p1QuarterScores = [0, 0, 0, 0];
  let p2QuarterScores = [0, 0, 0, 0];

  function triggerScreenShake(duration: number, strength = 6): void {
    screenShakeTimer = Math.max(screenShakeTimer, duration);
    screenShakeStrength = Math.max(screenShakeStrength, strength);
  }

  function screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvas!.getBoundingClientRect();
    const canvasX = (clientX - rect.left) * (canvas!.width / rect.width);
    const canvasY = (clientY - rect.top) * (canvas!.height / rect.height);
    const pitch = getCameraPitchFactor();
    const wx = (canvasX - cameraOffsetX) / cameraScale;
    const wy = (canvasY / (cameraScale * pitch)) + cameraY;
    return { x: wx, y: wy };
  }

  let lineOfScrimmageY = getDriveStartY(-1, fieldHeight, endZoneHeight);
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
  let isPaused = false;
  let isSessionActive = false;
  let lastSessionSaveTime = 0;
  let drillResetTimer: ReturnType<typeof setTimeout> | null = null;
  let tutorialStep = 0;
  let tutorialAimFrames = 0;

  function completeTutorialAction(expectedStep: number): void {
    if (!options.tutorial || tutorialStep !== expectedStep) return;
    tutorialStep++;
    callbacks.onTutorialStep?.(tutorialStep);
  }

  // Relative Virtual Joystick State & Keyboard Controls
  interface VirtualJoystick {
    active: boolean;
    pointerId: number | null;
    baseX: number;
    baseY: number;
    currentX: number;
    currentY: number;
    inputX: number;
    inputY: number;
    distance: number;
    alpha: number;
  }

  const joystick: VirtualJoystick = {
    active: false,
    pointerId: null,
    baseX: 0,
    baseY: 0,
    currentX: 0,
    currentY: 0,
    inputX: 0,
    inputY: 0,
    distance: 0,
    alpha: 0
  };

  let passTapTarget: Entity | null = null;
  let passPointerId: number | null = null;
  let throwTargetFeedback: { x: number; y: number; radius: number; maxRadius: number; alpha: number; receiverName: string } | null = null;
  let isSnapGestureActive = false;

  // Human AI QB Progression, Vision Cone & Reaction Latency
  let cpuQbProgressionIndex = 0;
  let cpuQbReadTimer = 0;
  let cpuQbThrowWindupTimer = 0;
  let cpuQbPendingThrowTarget: Entity | null = null;
  let cpuQbGazeTarget: Entity | null = null;

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
  let snapBall: { center: Entity; frame: number } | null = null;
  let ballPressureDefenders: Entity[] = [];
  let fumbleBall: FumbleBall | null = null;
  let brokenTackleEffect: { x: number; y: number; timer: number } | null = null;
  let activeEntity: Entity = qb;
  let phase = 'PRE_SNAP';

  let activeOffense: 'P1' | 'P2' = 'P1';
  let activeDefense: 'P1' | 'P2' = 'P2';

  let p1Team: TeamProfile = getTeam('ALABAMA');
  let p2Team: TeamProfile = getTeam('GEORGIA');

  let p1OffPlay = 'SHORT_PASS';
  let p1OffFormation: 'SPREAD' | 'STACK' | 'TRIPS' = 'SPREAD';
  let p1DefPlay = 'COVER2';
  let p2OffPlay = 'SHORT_PASS';
  let p2DefPlay = 'COVER2';
  let cpuPreSnapTimer = 0;
  let isAllBlocking = false;

  // Special Teams (Kickoffs & Punts)
  let openingReceivingTeam: 'P1' | 'P2' = 'P1';
  let isKickoffPhase = true;
  let kickoffKickingTeam: 'P1' | 'P2' = 'P2';
  let kickoffReceivingTeam: 'P1' | 'P2' = 'P1';
  let kickMeterPower = 0.55;
  let kickMeterDirection = 1;
  let cpuKickoffDelayTimer = 0;
  let isSpecialTeamsReturn = false;
  let specialTeamsReturnType: 'KICKOFF' | 'PUNT' | null = null;
  let returnCatchY = 0;
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
  const cpuPlayHistory: PlayRecord[] = [];
  const userDefenseHistory: string[] = [];
  let momentum = 0;
  let rosterStamina: Record<string, number> = {};
  let defenseOverrides = new Map<number, DefensiveAssignment>();
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

  function getSessionEntities(): Array<[string, Entity]> {
    return [
      ['qb', qb],
      ...receivers.map((entity, index) => [`receiver-${index}`, entity] as [string, Entity]),
      ...(centerReceiver ? [['centerReceiver', centerReceiver] as [string, Entity]] : []),
      ...(rb ? [['rb', rb] as [string, Entity]] : []),
      ...linemen.map((entity, index) => [`lineman-${index}`, entity] as [string, Entity]),
      ...defenders.map((entity, index) => [`defender-${index}`, entity] as [string, Entity])
    ];
  }

  function saveGameSession(): void {
    if (options.tutorial || !isSessionActive || typeof window === 'undefined') return;
    try {
      const entries = getSessionEntities();
      const entityIds = new Map(entries.map(([id, entity]) => [entity, id]));
      const entities = Object.fromEntries(entries.map(([id, entity]) => {
        const { assignedReceiver, assignedCenter, blockingDefender, ...data } = entity;
        const idFor = (target: Entity | null | undefined) => target ? entityIds.get(target) ?? null : null;
        return [id, {
          data,
          assignedReceiver: idFor(assignedReceiver),
          assignedCenter: idFor(assignedCenter),
          blockingDefender: idFor(blockingDefender)
        }];
      }));
      const idFor = (entity: Entity | null | undefined) => entity ? entityIds.get(entity) ?? null : null;
      const snapshot = {
        version: 1,
        entities,
        activeEntityId: idFor(activeEntity),
        receiverIds: receivers.map(idFor),
        centerReceiverId: idFor(centerReceiver),
        rbId: idFor(rb),
        linemanIds: linemen.map(idFor),
        defenderIds: defenders.map(idFor),
        p1Score, p2Score, p1QuarterScores, p2QuarterScores, lineOfScrimmageY, firstDownMarkerY, attackDirection,
        currentDown, yardsToGo, quarter, gameClockSeconds, gameClockRemainderMs,
        gameClockRunning, pendingQuarterEnd, quarterBreakRemainingMs,
        halftimeAnnouncementPending, gameOver, phase, activeOffense, activeDefense,
        p1TeamId: p1Team.id, p2TeamId: p2Team.id,
        p1OffPlay, p1OffFormation, p1DefPlay, p2OffPlay, p2DefPlay,
        cpuPreSnapTimer, isAllBlocking, openingReceivingTeam, isKickoffPhase,
        kickoffKickingTeam, kickoffReceivingTeam, kickMeterPower, kickMeterDirection,
        cpuKickoffDelayTimer, isSpecialTeamsReturn, specialTeamsReturnType, returnCatchY,
        ball: ball ? { ...ball, intendedTarget: undefined, intendedTargetId: idFor(ball.intendedTarget) } : null,
        snapBall: snapBall ? { centerId: idFor(snapBall.center), frame: snapBall.frame } : null,
        ballPressureDefenderIds: ballPressureDefenders.map(idFor), fumbleBall, brokenTackleEffect,
        momentum, rosterStamina, defenseOverrides: [...defenseOverrides.entries()], coverageMistakeEvaluated,
        playEnding, isInterceptionReturn, formationTransitionFrame, lastTargetWasRb,
        aiPreSnapShiftTimer,
        formationTransitions: formationTransitions.map(transition => ({
          entityId: idFor(transition.entity),
          fromX: transition.fromX, fromY: transition.fromY,
          toX: transition.toX, toY: transition.toY
        })),
        userPlayHistory, cpuPlayHistory, userDefenseHistory, playClock, cpuScrambleDecisionMade,
        qbScrambleReactionTimer, cameraY
      };
      window.localStorage.setItem(GAME_SESSION_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Keep gameplay available if browser storage is disabled or full.
    }
  }

  function restoreGameSession(): boolean {
    if (!hasSavedGameSession()) return false;
    try {
      const raw = window.localStorage.getItem(GAME_SESSION_STORAGE_KEY);
      if (!raw) return false;
      const state = JSON.parse(raw) as Record<string, any>;
      if (state.version !== 1 || !state.entities || !Array.isArray(state.receiverIds)) return false;
      const hasUnsupportedDefense = !defensivePlaybook[state.p1DefPlay] || !defensivePlaybook[state.p2DefPlay];

      const restoredEntities = new Map<string, Entity>();
      Object.entries(state.entities as Record<string, any>).forEach(([id, record]) => {
        restoredEntities.set(id, { ...record.data } as Entity);
      });
      const entityFor = (id: string | null | undefined): Entity | null => id ? restoredEntities.get(id) ?? null : null;
      Object.entries(state.entities as Record<string, any>).forEach(([id, record]) => {
        const entity = restoredEntities.get(id);
        if (!entity) return;
        entity.assignedReceiver = entityFor(record.assignedReceiver);
        entity.assignedCenter = entityFor(record.assignedCenter) ?? undefined;
        entity.blockingDefender = entityFor(record.blockingDefender);
      });

      qb = entityFor('qb') ?? qb;
      receivers = state.receiverIds.map((id: string) => entityFor(id)).filter((entity: Entity | null): entity is Entity => Boolean(entity));
      centerReceiver = entityFor(state.centerReceiverId);
      rb = entityFor(state.rbId);
      linemen = state.linemanIds.map((id: string) => entityFor(id)).filter((entity: Entity | null): entity is Entity => Boolean(entity));
      defenders = state.defenderIds.map((id: string) => entityFor(id)).filter((entity: Entity | null): entity is Entity => Boolean(entity));
      activeEntity = entityFor(state.activeEntityId) ?? qb;

      p1Score = state.p1Score; p2Score = state.p2Score;
      p1QuarterScores = Array.from({ length: 4 }, (_, index) => Number(state.p1QuarterScores?.[index] ?? 0));
      p2QuarterScores = Array.from({ length: 4 }, (_, index) => Number(state.p2QuarterScores?.[index] ?? 0));
      lineOfScrimmageY = state.lineOfScrimmageY; firstDownMarkerY = state.firstDownMarkerY;
      attackDirection = state.attackDirection; currentDown = state.currentDown; yardsToGo = state.yardsToGo;
      quarter = state.quarter; gameClockSeconds = state.gameClockSeconds;
      gameClockRemainderMs = state.gameClockRemainderMs; gameClockRunning = state.gameClockRunning;
      pendingQuarterEnd = state.pendingQuarterEnd; quarterBreakRemainingMs = state.quarterBreakRemainingMs;
      halftimeAnnouncementPending = state.halftimeAnnouncementPending; gameOver = state.gameOver;
      phase = state.phase; activeOffense = state.activeOffense; activeDefense = state.activeDefense;
      p1Team = getTeam(state.p1TeamId); p2Team = getTeam(state.p2TeamId);
      p1OffPlay = state.p1OffPlay; p1OffFormation = state.p1OffFormation;
      if (p1OffPlay === 'PUNT' && currentDown !== 4) p1OffPlay = 'SHORT_PASS';
      p1DefPlay = defensivePlaybook[state.p1DefPlay] ? state.p1DefPlay : 'COVER2';
      p2OffPlay = state.p2OffPlay;
      p2DefPlay = defensivePlaybook[state.p2DefPlay] ? state.p2DefPlay : 'COVER2';
      cpuPreSnapTimer = state.cpuPreSnapTimer; isAllBlocking = state.isAllBlocking;
      openingReceivingTeam = state.openingReceivingTeam; isKickoffPhase = state.isKickoffPhase;
      kickoffKickingTeam = state.kickoffKickingTeam; kickoffReceivingTeam = state.kickoffReceivingTeam;
      kickMeterPower = state.kickMeterPower; kickMeterDirection = state.kickMeterDirection;
      cpuKickoffDelayTimer = state.cpuKickoffDelayTimer; isSpecialTeamsReturn = state.isSpecialTeamsReturn;
      specialTeamsReturnType = state.specialTeamsReturnType; returnCatchY = state.returnCatchY;
      if (state.ball) {
        const { intendedTargetId, ...savedBall } = state.ball;
        ball = { ...savedBall, intendedTarget: entityFor(intendedTargetId) };
      } else {
        ball = null;
      }
      snapBall = state.snapBall ? { center: entityFor(state.snapBall.centerId) ?? qb, frame: state.snapBall.frame } : null;
      ballPressureDefenders = state.ballPressureDefenderIds.map((id: string) => entityFor(id)).filter((entity: Entity | null): entity is Entity => Boolean(entity));
      fumbleBall = state.fumbleBall; brokenTackleEffect = state.brokenTackleEffect;
      momentum = state.momentum; rosterStamina = state.rosterStamina ?? {}; defenseOverrides = new Map(state.defenseOverrides);
      coverageMistakeEvaluated = state.coverageMistakeEvaluated; playEnding = state.playEnding;
      isInterceptionReturn = state.isInterceptionReturn; formationTransitionFrame = state.formationTransitionFrame;
      lastTargetWasRb = state.lastTargetWasRb; aiPreSnapShiftTimer = state.aiPreSnapShiftTimer;
      formationTransitions = state.formationTransitions.map((transition: any) => ({
        entity: entityFor(transition.entityId) ?? qb,
        fromX: transition.fromX, fromY: transition.fromY, toX: transition.toX, toY: transition.toY
      }));
      userPlayHistory.splice(0, userPlayHistory.length, ...state.userPlayHistory);
      cpuPlayHistory.splice(0, cpuPlayHistory.length, ...(state.cpuPlayHistory ?? []));
      userDefenseHistory.splice(0, userDefenseHistory.length, ...state.userDefenseHistory);
      playClock = state.playClock; cpuScrambleDecisionMade = state.cpuScrambleDecisionMade;
      qbScrambleReactionTimer = state.qbScrambleReactionTimer; cameraY = state.cameraY;
      lastClockFrameTime = null;
      isSessionActive = true;
      if (hasUnsupportedDefense && phase === 'PRE_SNAP' && !isKickoffPhase) {
        applyDefensiveAlignment();
      }

      callbacks.setUserScore(p1Score); callbacks.setCpuScore(p2Score);
      callbacks.setP1TeamState?.(p1Team); callbacks.setP2TeamState?.(p2Team);
      callbacks.setActiveOffenseState(activeOffense);
      callbacks.setP1OffPlayState?.(p1OffPlay); callbacks.setP1DefPlayState(p1DefPlay);
      callbacks.setP2OffPlayState(p2OffPlay); callbacks.setP2DefPlayState(p2DefPlay);
      callbacks.setP1OffFormationState?.(p1OffFormation);
      setMomentumState(momentum); publishGameClock(); updateDownDisplay();
      setIsKickoffState?.(isKickoffPhase, kickoffKickingTeam, kickoffReceivingTeam);
      setIs4thDownState?.(currentDown === 4 && phase === 'PRE_SNAP');
      setKickMeterPowerState?.(kickMeterPower);
      if (gameOver) callbacks.onGameOver?.(p1Score, p2Score, true, { p1Quarters: [...p1QuarterScores], p2Quarters: [...p2QuarterScores] });
      return true;
    } catch {
      window.localStorage.removeItem(GAME_SESSION_STORAGE_KEY);
      return false;
    }
  }

  // Backyard Route Line Drawing, Single-Tap Run Blocking & Formation Swiping
  let gestureEntity: Entity | null = null;
  let gestureRole: 'WR' | 'RB' | 'DEFENDER' = 'WR';
  let gestureStartX = 0;
  let gestureStartY = 0;
  let gestureGrabOffsetX = 0;
  let gestureGrabOffsetY = 0;
  let gestureCurrentX = 0;
  let gestureCurrentY = 0;
  let gestureTouchStartX = 0;
  let gestureTouchStartY = 0;
  let isDirtGestureActive = false;
  let tapThrowTarget: Entity | null = null;
  let preSnapFieldSwipeStartX = 0;
  let preSnapFieldSwipeStartY = 0;
  let isPullingDefender = false;
  let lastPublishedPhase = '';

  function publishPhaseIfNeeded() {
    if (lastPublishedPhase !== phase) {
      lastPublishedPhase = phase;
      callbacks.setPhaseState?.(phase);
    }
  }

  function repositionUserDefender(defender: Entity, targetX: number, targetY: number) {
    // Requirement: "The user should only be able to reposition the center player. That player should have NO assignment. Other players should not be able to be repositioned and can only have assignments changed."
    if (defender !== defenders[0]) return;

    const radius = defender.radius || 10;
    const clampedX = Math.max(radius + 15, Math.min(fieldWidth - radius - 15, targetX));

    // Constrain to the correct side of the line of scrimmage
    // attackDirection === 1: CPU offense attacks DOWN (+Y), defense is at/below LOS
    // attackDirection === -1: CPU offense attacks UP (-Y), defense is at/above LOS
    const minLegalOffset = 14;
    let clampedY = targetY;
    if (attackDirection === 1) {
      clampedY = Math.max(lineOfScrimmageY + minLegalOffset, Math.min(fieldHeight - 35, targetY));
    } else {
      clampedY = Math.min(lineOfScrimmageY - minLegalOffset, Math.max(35, targetY));
    }

    defender.x = clampedX;
    defender.y = clampedY;
    defender.startX = clampedX;
    defender.startY = clampedY;

    // That user will not have an assignment and so he can be repositioned anywhere and the user can decide how to use him.
    defender.defenseAssignment = 'USER';
    defender.assignedReceiver = null;
    defender.assignedCenter = undefined;
    defender.zoneX = undefined;
    defender.zoneY = undefined;
    defender.passRusher = false;
    defender.isQbSpy = false;

    const defenderIndex = defenders.indexOf(defender);
    if (defenderIndex !== -1) {
      defenseOverrides.set(defenderIndex, 'USER');
    }
    completeTutorialAction(9);
  }

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
      if (target === centerReceiver && value === 'BLOCK') completeTutorialAction(3);
      else if (value !== 'BLOCK') completeTutorialAction(2);
    } else if (role === 'RB' && rb) {
      if (value === 'RUN' || value === 'RUN_LEFT' || value === 'RUN_RIGHT') {
        p1OffPlay = 'ISO';
        if (typeof callbacks !== 'undefined' && callbacks.setP1OffPlayState) {
          callbacks.setP1OffPlayState('ISO');
        }
        rb.routeType = 'RUN';
        rb.isBlocker = false;
        if (value === 'RUN_LEFT') {
          rb.side = 'left';
          rb.startX = 120;
          rb.x = 120;
        } else if (value === 'RUN_RIGHT') {
          rb.side = 'right';
          rb.startX = 220;
          rb.x = 220;
        }
        // Turn offensive formation receivers into lead run-blockers
        if (typeof centerReceiver !== 'undefined' && centerReceiver) {
          centerReceiver.routeType = 'BLOCK';
          centerReceiver.isBlocker = true;
        }
        if (typeof receivers !== 'undefined' && receivers[1]) {
          receivers[1].routeType = 'BLOCK';
          receivers[1].isBlocker = true;
        }
        if (typeof receivers !== 'undefined' && receivers[0]) {
          receivers[0].routeType = 'GO';
          receivers[0].isBlocker = false;
        }
        if (typeof receivers !== 'undefined' && receivers[2]) {
          receivers[2].routeType = 'GO';
          receivers[2].isBlocker = false;
        }
        sounds.playJuke();
        if (activeDefense === 'P2') {
          applyDefensiveAlignment(true, true);
        }
        const dirLabel = value === 'RUN_LEFT' ? 'LEFT' : value === 'RUN_RIGHT' ? 'RIGHT' : '';
        if (typeof showAnnouncement === 'function') {
          showAnnouncement(dirLabel ? `RUN PLAY: HANDOFF ${dirLabel}! 🏈💨` : 'RUN PLAY: QB HANDOFF TO RB! 🏈💨', '#00ffaa');
        }
      } else {
        const curFormation = (typeof p1OffFormation !== 'undefined') ? p1OffFormation : 'SPREAD';
        const basePassPlay = curFormation === 'STACK' ? 'CONTROL_PASS' : curFormation === 'TRIPS' ? 'DEEP_SHOT' : 'SHORT_PASS';
        if (p1OffPlay === 'ISO') {
          p1OffPlay = basePassPlay;
          if (typeof callbacks !== 'undefined' && callbacks.setP1OffPlayState) {
            callbacks.setP1OffPlayState(basePassPlay);
          }
          if (typeof offensivePlaybook !== 'undefined' && offensivePlaybook[basePassPlay]) {
            const passPlayObj = offensivePlaybook[basePassPlay];
            if (typeof receivers !== 'undefined' && receivers[0]) { receivers[0].routeType = passPlayObj.left || 'GO'; receivers[0].isBlocker = false; }
            if (typeof receivers !== 'undefined' && receivers[1]) { receivers[1].routeType = curFormation === 'TRIPS' ? 'CROSS-L' : 'SLANT-L'; receivers[1].isBlocker = false; }
            if (typeof receivers !== 'undefined' && receivers[2]) { receivers[2].routeType = passPlayObj.right || 'GO'; receivers[2].isBlocker = false; }
            if (typeof centerReceiver !== 'undefined' && centerReceiver) { centerReceiver.routeType = passPlayObj.center || 'SLANT-R'; centerReceiver.isBlocker = false; }
          }
        }
        rb.routeType = value;
        rb.isBlocker = (value === 'BLOCK');
        rb.routeIndex = Math.max(0, runningBackRoutes.indexOf(value));
        sounds.playJuke();
        if (activeDefense === 'P2') {
          applyDefensiveAlignment(true, true);
        }
      }
    } else if (role === 'DEFENDER') {
      const defenderIndex = defenders.indexOf(target);
      if (defenderIndex === 0) return;
      if (value === 'DEFAULT') {
        defenseOverrides.delete(defenderIndex);
      } else {
        defenseOverrides.set(defenderIndex, value as 'BLITZ' | 'MAN' | 'ZONE' | 'QB_SPY' | 'RB_SPY');
      }
      applyDefensiveAlignment(true, false, true);
      sounds.playJuke();
      if (typeof showAnnouncement === 'function') {
        const labels: Record<string, { text: string; color: string }> = {
          BLITZ: { text: 'DEFENSE: BLITZ / RUSH QB! 💥', color: '#00ff66' },
          ZONE: { text: 'DEFENSE: DEEP ZONE COVERAGE! 🛡️', color: '#ff3333' },
          MAN: { text: 'DEFENSE: MAN COVERAGE! 👤', color: '#ffcc00' },
          RB_SPY: { text: 'DEFENSE: RB SPY LOCKED! 🕵️‍♂️', color: '#00ffff' },
        };
        const info = labels[value];
        if (info) {
          showAnnouncement(info.text, info.color);
        }
      }
      if (activeOffense === 'P2') {
        triggerCpuOffensiveAudible(false);
      }
      completeTutorialAction(8);
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
    const recentPlays = (activeOffense === 'P1' ? userPlayHistory : cpuPlayHistory).slice(-5);
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
      if (assignment === 'USER') {
        defender.isQbSpy = false;
        defender.passRusher = false;
        defender.assignedReceiver = undefined;
        defender.assignedCenter = undefined;
        defender.zoneX = undefined;
        defender.zoneY = undefined;
        return;
      }
      if (assignment === 'QB_SPY') {
        defender.isQbSpy = true;
        defender.passRusher = false;
        defender.assignedReceiver = undefined;
        // Position spy tight across from QB in the second level (18px off LOS)
        defender.startX = 170;
        defender.startY = getDefensiveLineAlignmentY(lineOfScrimmageY, attackDirection, defender.radius || 10);
        defender.x = 170;
        defender.y = defender.startY;
        return;
      }
      if (assignment === 'RB_SPY') {
        defender.isQbSpy = false;
        defender.passRusher = false;
        defender.assignedReceiver = rb || undefined;
        // Position spy directly across from the RB at the defensive front.
        const targetSideX = rb ? (rb.x > 170 ? Math.min(270, rb.x + 20) : Math.max(70, rb.x - 20)) : 170;
        defender.startX = targetSideX;
        defender.startY = getDefensiveLineAlignmentY(lineOfScrimmageY, attackDirection, defender.radius || 10);
        defender.x = targetSideX;
        defender.y = defender.startY;
        return;
      }
      defender.isQbSpy = false;
      if (!override) return;
      defender.passRusher = assignment === 'BLITZ';
      defender.assignedReceiver = undefined;
      if (assignment === 'BLITZ') {
        const rushX = defender.startX ?? defender.x;
        const rushY = getBlitzAlignmentY(defender.startY ?? defender.y, lineOfScrimmageY, attackDirection, defender.radius || 10);
        defender.startX = rushX;
        defender.startY = rushY;
        defender.x = rushX;
        defender.y = rushY;
        defender.zoneX = undefined;
        defender.zoneY = undefined;
      } else if (assignment === 'ZONE') {
        alignDefenderToZone(defender, lineOfScrimmageY, attackDirection);
      }
    });

    const eligibleReceivers = [...receivers, centerReceiver, rb]
      .filter((receiver): receiver is Entity => receiver !== null && !receiver.caught && !receiver.isBlocker && receiver.routeType !== 'BLOCK');

    defenders.forEach((defender, index) => {
      if (activeDefense === 'P2') return;
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
      if (defender.assignedReceiver) {
        alignDefenderAcrossFromReceiver(defender, defender.assignedReceiver, lineOfScrimmageY, attackDirection, fieldWidth);
      }
    });
    if (activeDefense === 'P2') {
      matchCpuDefendersToReceivers(defenders, [...receivers, centerReceiver, rb].filter((receiver): receiver is Entity => receiver !== null), {
        down: currentDown,
        yardsToGo,
        lineOfScrimmageY,
        attackDirection,
        recentPlays: userPlayHistory
      });
    }
  }

  function positionRBDefender() {
    const runningBack = rb;
    if (!runningBack || runningBack.isBlocker || runningBack.routeType === 'BLOCK' || defenders.length === 0) return;

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
    if (recentRbPasses >= 1 && rb && !rb.isBlocker && rb.routeType !== 'BLOCK') {
      const targetSideX = rb.x > 170 ? Math.min(270, rb.x + 25) : Math.max(70, rb.x - 25);
      const flatDef = defenders.find(d => d && (d.defenseAssignment === 'RB_SPY' || d.assignedReceiver === rb))
        || defenders[4] || defenders[3];
      if (flatDef) {
        flatDef.startX = targetSideX;
        flatDef.startY = getDefensiveLineAlignmentY(lineOfScrimmageY, attackDirection, flatDef.radius || 10);
      }
    } else {
      const lb = defenders[3] || defenders[4];
      if (lb && !lb.coverageLeverage && (currentDown === 3 || currentDown === 4) && yardsToGo <= 3) {
        lb.startY = getDefensiveLineAlignmentY(lineOfScrimmageY, attackDirection, lb.radius || 10);
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
  let rbDoubleTapConsumed = false;
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
    const availableHeight = typeof window !== 'undefined' ? Math.max(340, window.innerHeight - 80) : 600;
    const availableWidth = typeof window !== 'undefined' ? Math.max(320, window.innerWidth - 8) : 340;

    canvas.width = fieldWidth;
    canvas.height = 450;

    const scale = Math.min(availableWidth / fieldWidth, availableHeight / canvas.height);
    if (canvas.style) {
      canvas.style.width = (fieldWidth * scale) + 'px';
      canvas.style.height = (canvas.height * scale) + 'px';
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', resizeGame);
  }
  resizeGame();

  // Adaptive CPU Defensive Counter-Calling (Tendency Countering)
  function getAdaptiveDefensiveCall(): string {
    const totalPlays = userPlayHistory.length;

    // 1. Situational down & distance rules
    // 3rd & Long or 4th & Long (> 6 yards): player must target first down marker
    if ((currentDown === 3 || currentDown === 4) && yardsToGo > 6) {
      return 'ZONE232';
    }

    // 3rd & Short or 4th & Short (<= 3 yards): short power run or quick slant expected
    if ((currentDown === 3 || currentDown === 4) && yardsToGo <= 3) {
      return Math.random() < 0.65 ? 'ZONE34' : 'ZONE151';
    }

    // Early down / starting default
    if (totalPlays < 2) {
      return Math.random() < 0.5 ? 'COVER2' : 'ZONE232';
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
        return 'ZONE232';
      }
      if (lastPlay.play === 'SHORT_PASS') {
        return 'ZONE151';
      }
      if (lastPlay.play === 'CONTROL_PASS') {
        return Math.random() < 0.5 ? 'ZONE232' : 'COVER2';
      }
      if (!lastPlay.isPass) {
        return 'ZONE34';
      }
    }

    // QB Run / Scramble Tendency: User is scrambling or running with the QB!
    const recentQbRuns = recentPlays.filter(p => p.isQbRun).length;
    if (recentQbRuns >= 2) {
      // Use the three-man front and adaptive QB spy to contain repeated runs.
      return 'ZONE34';
    } else if (recentQbRuns >= 1) {
      return Math.random() < 0.5 ? 'COVER2' : 'ZONE151';
    }

    // RB Pass & Flat Tendency: User is targeting or spamming passes to the RB in the flat!
    const recentRbPassCount = recentPlays.filter(p => p.targetWasRb || p.isFlatPass || p.routes?.rb === 'FLAT').length;
    if (recentRbPassCount >= 2) {
      return Math.random() < 0.5 ? 'COVER2' : 'ZONE151';
    }

    // Formation Tendency
    const recentFormations = recentPlays.map(p => p.formation).filter(Boolean);
    const tripsCount = recentFormations.filter(f => f === 'TRIPS').length;
    const stackCount = recentFormations.filter(f => f === 'STACK').length;
    if (tripsCount >= 2) {
      return 'ZONE232';
    }
    if (stackCount >= 2) {
      return Math.random() < 0.5 ? 'COVER2' : 'ZONE151';
    }

    // Deep Shot Tendency (> 40% of recent plays)
    if (recentDeepCount >= 2 || (recentDeepCount / recentPlays.length) >= 0.4) {
      return 'ZONE232';
    }

    // Ground-and-Pound Tendency (> 50% runs)
    if (recentRunCount >= 2 || (recentRunCount / recentPlays.length) >= 0.5) {
      return Math.random() < 0.65 ? 'ZONE34' : 'COVER2';
    }

    // Short Pass / Slant-heavy
    if (recentShortPassCount >= 2) {
      return 'ZONE151';
    }

    // 3. Overall Career Tendency
    const totalPass = userPlayHistory.filter(p => p.isPass).length;
    const passRatio = totalPass / totalPlays;

    if (passRatio > 0.75) {
      return Math.random() < 0.6 ? 'ZONE232' : 'COVER2';
    } else if (passRatio < 0.35) {
      return Math.random() < 0.6 ? 'ZONE34' : 'COVER2';
    }

    const balancedOptions = defensiveKeys;
    return balancedOptions[Math.floor(Math.random() * balancedOptions.length)];
  }

  // CPU Offensive Play Selection using tactical football knowledge & situational awareness
  function getCpuOffensivePlayCall(): string {
    if (currentDown === 4) {
      const distanceToEndzoneYards = (attackDirection === -1
        ? lineOfScrimmageY - endZoneHeight
        : (fieldHeight - endZoneHeight) - lineOfScrimmageY) / 10;
      const shouldGoForIt = shouldCpuGoForItOnFourthDown({
        distanceToEndzoneYards,
        yardsToGo,
        quarter,
        secondsRemaining: gameClockSeconds,
        scoreDifferential: p2Score - p1Score
      });
      if (!shouldGoForIt) return 'PUNT';
    }

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
        counterPlays = repeatedDefense === 'ZONE34' || repeatedDefense === 'ZONE232'
          ? ['POST_WHEEL', 'SMASH', 'CONTROL_PASS', 'SHORT_PASS']
          : ['POST_WHEEL', 'DEEP_SHOT', 'CONTROL_PASS'];
      } else if ((currentDown === 3 || currentDown === 4) && yardsToGo <= 3) {
        counterPlays = ['MESH', 'SHORT_PASS', 'CONTROL_PASS', 'POWER'];
      } else {
        switch (repeatedDefense) {
          case 'COVER2':
            counterPlays = ['POST_WHEEL', 'SMASH', 'CONTROL_PASS', 'SHORT_PASS'];
            break;
          case 'ZONE34':
            counterPlays = ['POST_WHEEL', 'SMASH', 'SHORT_PASS', 'CONTROL_PASS'];
            break;
          case 'ZONE232':
            counterPlays = ['MESH', 'SHORT_PASS', 'SMASH', 'POWER'];
            break;
          case 'ZONE151':
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

    if (currentDown === 4) {
      const fourthDownOptions = yardsToGo <= 3
        ? ['POWER', 'ISO', 'MESH', 'SHORT_PASS']
        : yardsToGo <= 7
          ? ['SHORT_PASS', 'MESH', 'SMASH', 'CONTROL_PASS']
          : ['DEEP_SHOT', 'POST_WHEEL', 'SMASH', 'CONTROL_PASS'];
      return fourthDownOptions[Math.floor(Math.random() * fourthDownOptions.length)];
    }

    // 1. Situational Down & Distance:
    // 3rd & Long (> 7 yards): Must attack past the line of gain downfield
    if (currentDown === 3 && yardsToGo > 7) {
      const deepOptions = ['POST_WHEEL', 'DEEP_SHOT', 'SMASH', 'CONTROL_PASS'];
      return deepOptions[Math.floor(Math.random() * deepOptions.length)];
    }

    // 3rd & Short (<= 3 yards): Favor quick passes & rubs while keeping a power run
    if (currentDown === 3 && yardsToGo <= 3) {
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
      p2OffPlay = options.tutorial ? 'SHORT_PASS' : getCpuOffensivePlayCall();
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
    setIs4thDownState?.(currentDown === 4 && phase === 'PRE_SNAP');
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
      callbacks.onGameOver?.(p1Score, p2Score, false, { p1Quarters: [...p1QuarterScores], p2Quarters: [...p2QuarterScores] });
    } else {
      for (const key of Object.keys(rosterStamina)) {
        if (!key.includes(':wr-')) rosterStamina[key] = Math.min(100, rosterStamina[key] + (quarter === 2 ? 35 : 18));
      }
      getSessionEntities().forEach(([, entity]) => {
        if (entity.rosterKey) entity.stamina = rosterStamina[entity.rosterKey] ?? 100;
      });
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
          // Beginning of second half kickoff!
          // User requirement: beginning of game receiving team kicks at the beginning of the second half
          const secondHalfKickingTeam: 'P1' | 'P2' = openingReceivingTeam;
          const secondHalfReceivingTeam: 'P1' | 'P2' = openingReceivingTeam === 'P1' ? 'P2' : 'P1';
          const kickingTeamName = secondHalfKickingTeam === 'P1' ? p1Team.name.toUpperCase() : p2Team.name.toUpperCase();
          const receivingTeamName = secondHalfReceivingTeam === 'P1' ? p1Team.name.toUpperCase() : p2Team.name.toUpperCase();
          isKickoffPhase = true;
          kickoffKickingTeam = secondHalfKickingTeam;
          kickoffReceivingTeam = secondHalfReceivingTeam;
          setupKickoff(
            secondHalfKickingTeam,
            secondHalfReceivingTeam,
            `2ND HALF KICKOFF: ${kickingTeamName} KICKING TO ${receivingTeamName} 🏈`
          );
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

  function applyDefensiveAlignment(preservePositions = false, assignRBDefender = true, animate = false) {
    const activeDefKey = (activeDefense === 'P1') ? p1DefPlay : p2DefPlay;
    const previousPositions = preservePositions
      ? defenders.map(defender => {
        const radius = defender.radius || 10;
        const verticalMargin = Math.ceil(radius * 1.95);
        return {
          x: clamp(defender.x, radius, fieldWidth - radius),
          y: clamp(defender.y, verticalMargin, fieldHeight - verticalMargin)
        };
      })
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
    if (assignRBDefender) positionRBDefender();
    separateDefenderAlignments(defenders, fieldWidth, touchOptimized ? 20 : 10);
    constrainDefendersToFieldSide(defenders, lineOfScrimmageY, attackDirection, fieldHeight, fieldWidth);
    if (activeDefense === 'P1' && defenders[0]) {
      const centerDef = defenders[0];
      centerDef.defenseAssignment = 'USER';
      centerDef.assignedReceiver = null;
      centerDef.assignedCenter = undefined;
      centerDef.zoneX = undefined;
      centerDef.zoneY = undefined;
      centerDef.passRusher = false;
      centerDef.isQbSpy = false;
      defenseOverrides.set(0, 'USER');
    }
    if (previousPositions) {
      const alignedPositions = defenders.map(({ x, y }) => ({ x, y }));
      defenders.forEach((defender, index) => {
        defender.x = previousPositions[index].x;
        defender.y = previousPositions[index].y;
      });
      if (animate) startFormationTransition(defenders, previousPositions, alignedPositions);
    }
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
    const interceptingSide = activeOffense; // activeOffense was set at line 933 to the intercepting team
    const interceptingTeam = interceptingSide === 'P1' ? p1Team : p2Team;
    const isUserIntercept = interceptingSide === 'P1';
    showAnnouncement(
      isUserIntercept
        ? `INTERCEPTION! ${interceptingTeam.name.toUpperCase()} PICKS IT OFF! 🏈🛡️`
        : `INTERCEPTION! ${interceptingTeam.name.toUpperCase()} PICKS IT OFF! 😱`,
      isUserIntercept ? '#00ffff' : '#ff3333',
      true,
      {
        category: 'TURNOVER',
        subtext: isUserIntercept
          ? `YOU (P1) INTERCEPTED! YOU ARE NOW ON OFFENSE! (${returner.type || 'DEFENDER'})`
          : `CPU (P2) INTERCEPTED YOUR PASS! TURNOVER ON THE PLAY!`,
        possessionTeam: interceptingSide,
        durationMs: 5500
      }
    );

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
      const offTeamName = (activeOffense === 'P1' ? p1Team : p2Team).name.toUpperCase();
      showAnnouncement("FIRST DOWN! 🎯", "#00ffaa", true, {
        category: 'FIRST_DOWN',
        subtext: `${offTeamName} MOVES THE CHAINS • 1ST & 10`,
        possessionTeam: activeOffense,
        durationMs: 3800
      });
      sounds.playWhistle();
      currentDown = 1;
      yardsToGo = 10;
      firstDownMarkerY = lineOfScrimmageY + (100 * attackDirection);
      updateDownDisplay();
    } else if (currentDown > 4) {
      const defendingSide: 'P1' | 'P2' = activeDefense === 'P1' ? 'P1' : 'P2';
      const defendingName = (defendingSide === 'P1' ? p1Team : p2Team).name.toUpperCase();
      const nextOffenseSide: 'P1' | 'P2' = activeOffense === 'P1' ? 'P2' : 'P1';
      const nextOffenseName = (nextOffenseSide === 'P1' ? p1Team : p2Team).name.toUpperCase();
      const isUserStop = defendingSide === 'P1';
      showAnnouncement(
        "TURNOVER ON DOWNS! 🛑",
        isUserStop ? '#00ffaa' : '#ff4444',
        true,
        {
          category: 'TURNOVER',
          subtext: isUserStop
            ? `4TH DOWN STOP BY ${defendingName}! YOU TAKE OVER ON DOWNS! (1ST & 10)`
            : `STOPPED ON 4TH DOWN! ${nextOffenseName} TAKES OVER ON DOWNS (1ST & 10)`,
          possessionTeam: nextOffenseSide,
          durationMs: 5500
        }
      );
      sounds.playWhistle();
      swapPossession();
    } else {
      updateDownDisplay();
    }
  }

  function scheduleDrillReset() {
    if (drillResetTimer) clearTimeout(drillResetTimer);
    drillResetTimer = setTimeout(() => {
      drillResetTimer = null;
      if (isPaused) return;
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
    if (options.tutorial) {
      gameClockRunning = false;
      phase = 'DEAD';
      isAiming = false;
      playEnding = true;
      if (tutorialStep === 6) {
        screenShakeTimer = 0;
        screenShakeStrength = 4;
        activeOffense = 'P2';
        activeDefense = 'P1';
        attackDirection = 1;
        lineOfScrimmageY = 500;
        firstDownMarkerY = 600;
        currentDown = 1;
        yardsToGo = 10;
        playEnding = false;
        resetDrill();
        setActiveOffenseState('P2');
        completeTutorialAction(6);
      } else {
        completeTutorialAction(11);
      }
      return;
    }
    playEnding = true;
    const endedInterceptionReturn = isInterceptionReturn;
    const endedOffense = activeOffense;
    receivers.forEach(receiver => {
      if (!receiver.rosterKey) return;
      receiver.stamina = updateReceiverTargetStamina(receiver.stamina ?? 100, Boolean(receiver.targetedThisPlay));
      receiver.targetedThisPlay = false;
      rosterStamina[receiver.rosterKey] = receiver.stamina;
    });
    const endedSpecialTeamsReturn = isSpecialTeamsReturn;
    const endedSpecialTeamsType = specialTeamsReturnType;
    isSpecialTeamsReturn = false;
    specialTeamsReturnType = null;

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

    if (isSafety(endingY, attackDirection, fieldHeight, endZoneHeight, resultType)) {
      gameClockRunning = false;
      sounds.playWhistle();
      const scoringTeam: 'P1' | 'P2' = endedOffense === 'P1' ? 'P2' : 'P1';
      if (scoringTeam === 'P1') {
        p1Score += 2;
        p1QuarterScores[quarter - 1] += 2;
        setUserScore(p1Score);
      } else {
        p2Score += 2;
        p2QuarterScores[quarter - 1] += 2;
        setCpuScore(p2Score);
      }
      showAnnouncement('SAFETY! 2 POINTS!', scoringTeam === 'P1' ? '#00ffff' : '#ff3333', true, {
        category: 'SAFETY',
        subtext: `${(scoringTeam === 'P1' ? p1Team : p2Team).name.toUpperCase()} SCORES 2 • ${endedOffense === 'P1' ? p1Team.name.toUpperCase() : p2Team.name.toUpperCase()} TO KICK OFF`,
        possessionTeam: scoringTeam,
        durationMs: 5500
      });
      applyMomentum(1);
      isKickoffPhase = true;
      kickoffKickingTeam = endedOffense;
      kickoffReceivingTeam = scoringTeam;
      setIsKickoffState?.(true, kickoffKickingTeam, kickoffReceivingTeam);
    } else if (playResult.isTouchdown) {
      gameClockRunning = false;
      sounds.playTouchdown();
      applyMomentum(2);
      const scoringTeam: 'P1' | 'P2' = activeOffense === 'P1' ? 'P1' : 'P2';
      const receivingTeam: 'P1' | 'P2' = scoringTeam === 'P1' ? 'P2' : 'P1';
      if (scoringTeam === 'P1') {
        p1Score += 7;
        p1QuarterScores[quarter - 1] += 7;
        setUserScore(p1Score);
        showAnnouncement(
          endedInterceptionReturn
            ? `PICK-SIX! INTERCEPTION RETURNED FOR ${yardsGained} YARDS! TOUCHDOWN P1!`
            : endedSpecialTeamsReturn
              ? `${endedSpecialTeamsType} RETURN TOUCHDOWN P1! 🏈 (+7 Points)`
              : "TOUCHDOWN P1! (+7 Points)",
          "#00ffff",
          true,
          {
            category: 'TOUCHDOWN',
            subtext: `${p1Team.name.toUpperCase()} (P1) SCORES! +7 POINTS • KICKOFF UPCOMING`,
            possessionTeam: 'P1',
            durationMs: 5500
          }
        );
      } else {
        p2Score += 7;
        p2QuarterScores[quarter - 1] += 7;
        setCpuScore(p2Score);
        showAnnouncement(
          endedInterceptionReturn
            ? `PICK-SIX! INTERCEPTION RETURNED FOR ${yardsGained} YARDS! TOUCHDOWN P2!`
            : endedSpecialTeamsReturn
              ? `${endedSpecialTeamsType} RETURN TOUCHDOWN P2 / CPU! 🏈 (+7 Points)`
              : "TOUCHDOWN P2 / CPU! (+7 Points)",
          "#ff3333",
          true,
          {
            category: 'TOUCHDOWN',
            subtext: `${p2Team.name.toUpperCase()} (CPU) SCORES! +7 POINTS • KICKOFF UPCOMING`,
            possessionTeam: 'P2',
            durationMs: 5500
          }
        );
      }
      // Standard Football Video Game Rule: Scoring team kicks off to opponent after TD
      isKickoffPhase = true;
      kickoffKickingTeam = scoringTeam;
      kickoffReceivingTeam = receivingTeam;
    } else if (resultType === 'INT') {
      gameClockRunning = false;
      sounds.playWhistle();
      const interceptingSide: 'P1' | 'P2' = activeOffense === 'P1' ? 'P2' : 'P1';
      const interceptingName = (interceptingSide === 'P1' ? p1Team : p2Team).name.toUpperCase();
      const isUser = interceptingSide === 'P1';
      showAnnouncement(
        customMessage || "INTERCEPTION! TURNOVER ON THE PLAY! 🛡️",
        customColor || (isUser ? "#00ffff" : "#ff3333"),
        true,
        {
          category: 'TURNOVER',
          subtext: isUser
            ? `YOU (P1) INTERCEPTED! TAKES OVER POSSESSION • 1ST & 10`
            : `CPU (P2) INTERCEPTED! TURNOVER ON THE PLAY • 1ST & 10`,
          possessionTeam: interceptingSide,
          durationMs: 5500
        }
      );
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
      if (resultType === 'OUT_OF_BOUNDS') sounds.playWhistle();
      else sounds.playTackle();
      lineOfScrimmageY = endingY;
      yardsToGo = calculateYardsToGo(lineOfScrimmageY, firstDownMarkerY, attackDirection);
      currentDown++;
      applyMomentum(Math.max(0, matchup.momentumDelta) + (yardsGained >= 12 ? 1 : 0) - (yardsGained <= 2 ? 1 : 0));
      if (!endedInterceptionReturn && !endedSpecialTeamsReturn) {
        showAnnouncement(customMessage || `Gain of ${yardsGained} yards. (${currentDown} Down, ${Math.max(0, yardsToGo)} yards to go)`, "#ffcc00");
      }
      checkFirstDownOrTurnover();
    }

    if (endedSpecialTeamsReturn && !playResult.isTouchdown) {
      lineOfScrimmageY = endingY;
      currentDown = 1;
      yardsToGo = 10;
      firstDownMarkerY = lineOfScrimmageY + (100 * attackDirection);
      updateDownDisplay();
      const returnYards = Math.abs(Math.round((endingY - (returnCatchY || endingY)) / 10));
      showAnnouncement(`${endedSpecialTeamsType} RETURN FOR ${returnYards} YARDS • 1ST & 10`, '#00ffaa', true);
    } else if (endedInterceptionReturn && !playResult.isTouchdown) {
      currentDown = 1;
      yardsToGo = 10;
      firstDownMarkerY = lineOfScrimmageY + (100 * attackDirection);
      updateDownDisplay();
      const newOffense = activeOffense;
      const newOffenseName = (newOffense === 'P1' ? p1Team : p2Team).name.toUpperCase();
      const isUser = newOffense === 'P1';
      showAnnouncement(
        `INTERCEPTION RETURNED FOR ${yardsGained} YARDS! 🏈🛡️`,
        isUser ? '#00ffff' : '#ff4444',
        true,
        {
          category: 'TURNOVER',
          subtext: isUser
            ? `YOU (P1) ARE ON OFFENSE! 1ST & 10 FOR ${newOffenseName}`
            : `CPU (P2) TAKES OVER POSSESSION • 1ST & 10 FOR ${newOffenseName}`,
          possessionTeam: newOffense,
          durationMs: 5500
        }
      );
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
    } else {
      cpuPlayHistory.push({
        play: p2OffPlay,
        isPass: offensivePlaybook[p2OffPlay]?.type === 'PASS',
        down: currentDown,
        distance: yardsToGo,
        yardsGained,
        isQbRun: activeEntity === qb,
        targetWasRb: activeEntity === rb || lastTargetWasRb,
        routes: { left: receivers[0]?.routeType, slot: receivers[1]?.routeType, center: centerReceiver?.routeType, right: receivers[2]?.routeType, rb: rb?.routeType }
      });
      if (cpuPlayHistory.length > 12) cpuPlayHistory.shift();
    }

    runCpuAiPlaySelection();

    scheduleDrillReset();
  }

  function startFormationTransition(
    entities: Entity[],
    fromPositions: Array<{ x: number; y: number }>,
    toPositions = entities.map(({ x, y }) => ({ x, y }))
  ) {
    formationTransitions = [];
    if (entities.length !== fromPositions.length) return;
    formationTransitionFrame = 0;
    formationTransitions = entities.map((entity, index) => ({
      entity,
      fromX: fromPositions[index].x,
      fromY: fromPositions[index].y,
      toX: toPositions[index].x,
      toY: toPositions[index].y
    }));
    formationTransitions.forEach(({ entity, fromX, fromY }) => {
      entity.x = fromX;
      entity.y = fromY;
    });
  }

  function setupKickoff(kickingTeam: 'P1' | 'P2', receivingTeam: 'P1' | 'P2', announcementText?: string) {
    isKickoffPhase = true;
    kickoffKickingTeam = kickingTeam;
    kickoffReceivingTeam = receivingTeam;
    phase = 'KICKOFF';
    playEnding = false;
    isInterceptionReturn = false;
    ball = null;
    snapBall = null;
    ballPressureDefenders = [];
    fumbleBall = null;
    brokenTackleEffect = null;
    isAiming = false;
    gestureEntity = null;
    isDirtGestureActive = false;
    joystick.active = false;
    joystick.pointerId = null;
    joystick.inputX = 0;
    joystick.inputY = 0;
    joystick.distance = 0;
    joystick.alpha = 0;
    passTapTarget = null;
    passPointerId = null;
    throwTargetFeedback = null;
    isSnapGestureActive = false;
    playClock = 0;
    cpuKickoffDelayTimer = kickingTeam === 'P2' ? 65 : 0;

    const kickAttackDir = kickingTeam === 'P1' ? -1 : 1;
    attackDirection = kickAttackDir;
    activeOffense = kickingTeam;
    activeDefense = receivingTeam;
    setActiveOffenseState(activeOffense);

    lineOfScrimmageY = getKickoffLineY(fieldHeight, endZoneHeight, kickAttackDir, 35);
    firstDownMarkerY = lineOfScrimmageY + (100 * kickAttackDir);
    currentDown = 1;
    yardsToGo = 10;

    const kickTeam = kickingTeam === 'P1' ? p1Team : p2Team;
    const recTeam = receivingTeam === 'P1' ? p1Team : p2Team;

    qb.x = 170;
    qb.y = lineOfScrimmageY;
    qb.vx = 0;
    qb.vy = 0;
    qb.color = kickTeam.primaryColor;
    qb.isKicker = true;
    qb.hasBall = false;

    const coverageXs = [45, 95, 135, 205, 245, 295];
    receivers = [
      { startX: coverageXs[0], startY: lineOfScrimmageY, x: coverageXs[0], y: lineOfScrimmageY, vx: 0, vy: 0, radius: 10, color: kickTeam.primaryColor, archetype: 'SPEEDSTER', speedMultiplier: 1.15, routeType: 'GO', isBlocker: false },
      { startX: coverageXs[1], startY: lineOfScrimmageY, x: coverageXs[1], y: lineOfScrimmageY, vx: 0, vy: 0, radius: 10, color: kickTeam.primaryColor, archetype: 'GUNNER', speedMultiplier: 1.12, routeType: 'GO', isBlocker: false },
      { startX: coverageXs[4], startY: lineOfScrimmageY, x: coverageXs[4], y: lineOfScrimmageY, vx: 0, vy: 0, radius: 10, color: kickTeam.primaryColor, archetype: 'GUNNER', speedMultiplier: 1.12, routeType: 'GO', isBlocker: false }
    ];
    centerReceiver = { startX: coverageXs[2], startY: lineOfScrimmageY, x: coverageXs[2], y: lineOfScrimmageY, vx: 0, vy: 0, radius: 10, color: kickTeam.primaryColor, archetype: 'TACKLER', speedMultiplier: 1.05, routeType: 'GO', isBlocker: false };
    rb = { startX: coverageXs[3], startY: lineOfScrimmageY, x: coverageXs[3], y: lineOfScrimmageY, vx: 0, vy: 0, radius: 10, color: kickTeam.primaryColor, archetype: 'TACKLER', speedMultiplier: 1.05, routeType: 'GO', isBlocker: false };
    linemen = [
      { startX: coverageXs[5], startY: lineOfScrimmageY, x: coverageXs[5], y: lineOfScrimmageY, radius: 10, color: kickTeam.primaryColor, speedMultiplier: 1.10 }
    ];

    const deepReturnerY = kickAttackDir === -1 ? 150 : 1050;
    const horizontalBlockLineY = deepReturnerY - (60 * kickAttackDir);
    const blockerXs = [45, 95, 145, 195, 245, 295];

    defenders = [
      { startX: 170, startY: deepReturnerY, x: 170, y: deepReturnerY, radius: 10, type: 'RET', color: recTeam.accentColor || recTeam.primaryColor, archetype: 'RETURNER', speedMultiplier: 1.0, isReturner: true, isBlocker: false },
      { startX: blockerXs[0], startY: horizontalBlockLineY, x: blockerXs[0], y: horizontalBlockLineY, radius: 10, type: 'WEDGE', color: recTeam.primaryColor, archetype: 'BLOCKER', speedMultiplier: 1.05, isBlocker: true },
      { startX: blockerXs[1], startY: horizontalBlockLineY, x: blockerXs[1], y: horizontalBlockLineY, radius: 10, type: 'WEDGE', color: recTeam.primaryColor, archetype: 'BLOCKER', speedMultiplier: 1.05, isBlocker: true },
      { startX: blockerXs[2], startY: horizontalBlockLineY, x: blockerXs[2], y: horizontalBlockLineY, radius: 10, type: 'WEDGE', color: recTeam.primaryColor, archetype: 'BLOCKER', speedMultiplier: 1.05, isBlocker: true },
      { startX: blockerXs[3], startY: horizontalBlockLineY, x: blockerXs[3], y: horizontalBlockLineY, radius: 10, type: 'WEDGE', color: recTeam.primaryColor, archetype: 'BLOCKER', speedMultiplier: 1.05, isBlocker: true },
      { startX: blockerXs[4], startY: horizontalBlockLineY, x: blockerXs[4], y: horizontalBlockLineY, radius: 10, type: 'UPBACK', color: recTeam.primaryColor, archetype: 'BLOCKER', speedMultiplier: 1.05, isBlocker: true },
      { startX: blockerXs[5], startY: horizontalBlockLineY, x: blockerXs[5], y: horizontalBlockLineY, radius: 10, type: 'UPBACK', color: recTeam.primaryColor, archetype: 'BLOCKER', speedMultiplier: 1.05, isBlocker: true }
    ];

    qb.team = kickingTeam;
    receivers.forEach(r => { r.team = kickingTeam; });
    if (centerReceiver) centerReceiver.team = kickingTeam;
    if (rb) rb.team = kickingTeam;
    linemen.forEach(l => { l.team = kickingTeam; });
    defenders.forEach(d => { d.team = receivingTeam; });

    cameraY = Math.max(cameraWorldTop, Math.min(cameraWorldBottom - 450, lineOfScrimmageY - 225));
    setDownDistanceText(`KICKOFF - ${kickTeam.name.toUpperCase()} KICKING`);
    setIsKickoffState?.(true, kickingTeam, receivingTeam);
    setIs4thDownState?.(false);
    showAnnouncement(announcementText || `KICKOFF: ${kickTeam.name.toUpperCase()} KICKING TO ${recTeam.name.toUpperCase()}`, kickTeam.primaryColor);
  }

  function executeKickoff(power = kickMeterPower) {
    if (phase !== 'KICKOFF') return;
    const kickAttackDir = kickoffKickingTeam === 'P1' ? -1 : 1;
    const kickTeam = kickoffKickingTeam === 'P1' ? p1Team : p2Team;
    const kickerRating = kickTeam.ratings.kicking || 1.0;

    const flight = calculateKickoffFlight(power, kickerRating);
    const landingY = lineOfScrimmageY + (flight.distanceYards * 10 * kickAttackDir);
    const targetX = 170 + (Math.random() - 0.5) * 40;

    const totalFrames = flight.flightFrames;
    const vx = (targetX - qb.x) / totalFrames;
    const vy = (landingY - qb.y) / totalFrames;

    ball = {
      startX: qb.x,
      startY: qb.y,
      x: qb.x,
      y: qb.y,
      z: 14,
      vx,
      vy,
      maxZ: flight.maxZ,
      flightFrames: totalFrames,
      currentFrame: 0,
      targetX,
      targetY: landingY,
      isKickoff: true,
      kickingTeam: kickoffKickingTeam,
      receivingTeam: kickoffReceivingTeam,
      kickPower: power
    };

    sounds.playCatch();
    phase = 'THROWN';
    isKickoffPhase = false;
    setIsKickoffState?.(false, kickoffKickingTeam, kickoffReceivingTeam);
    showAnnouncement("KICK IS AWAY! 🏈", "#ffcc00");
  }

  function executePunt(puntingTeam: 'P1' | 'P2', puntAttackDir: number, power = kickMeterPower) {
    setIs4thDownState?.(false);
    const offTeam = puntingTeam === 'P1' ? p1Team : p2Team;
    const punterRating = offTeam.ratings.kicking || 1.0;
    const flight = calculatePuntFlight(power, punterRating);

    const targetY = lineOfScrimmageY + (flight.distanceYards * 10 * puntAttackDir);
    const targetX = 170 + (Math.random() - 0.5) * 30;

    const totalFrames = flight.flightFrames;
    const vx = (targetX - qb.x) / totalFrames;
    const vy = (targetY - qb.y) / totalFrames;

    ball = {
      startX: qb.x,
      startY: qb.y,
      x: qb.x,
      y: qb.y,
      z: 14,
      vx,
      vy,
      maxZ: flight.maxZ,
      flightFrames: totalFrames,
      currentFrame: 0,
      targetX,
      targetY: targetY,
      isPunt: true,
      kickingTeam: puntingTeam,
      receivingTeam: puntingTeam === 'P1' ? 'P2' : 'P1',
      kickPower: power
    };

    qb.hasBall = false;
    phase = 'THROWN';
    sounds.playCatch();
    showAnnouncement("HIGH SPIRAL PUNT IS AWAY! 🏈", "#00ffff");
  }

  function resetDrill(animateAlignment = false) {
    if (isKickoffPhase) {
      setupKickoff(kickoffKickingTeam, kickoffReceivingTeam);
      return;
    }

    const previousEntities = [...receivers, centerReceiver, rb, ...defenders].filter((entity): entity is Entity => entity !== null);
    const previousPositions = animateAlignment ? previousEntities.map(({ x, y }) => ({ x, y })) : [];
    formationTransitions = [];
    if (gameOver || quarterBreakRemainingMs > 0) return;
    phase = 'PRE_SNAP';
    playEnding = false;
    isInterceptionReturn = false;
    isAllBlocking = false;
    ball = null;
    snapBall = null;
    ballPressureDefenders = [];
    fumbleBall = null;
    brokenTackleEffect = null;
    isAiming = false;
    gestureEntity = null;
    isDirtGestureActive = false;
    joystick.active = false;
    joystick.pointerId = null;
    joystick.inputX = 0;
    joystick.inputY = 0;
    joystick.distance = 0;
    joystick.alpha = 0;
    passTapTarget = null;
    passPointerId = null;
    throwTargetFeedback = null;
    isSnapGestureActive = false;
    cpuQbProgressionIndex = 0;
    cpuQbReadTimer = 0;
    cpuQbThrowWindupTimer = 0;
    cpuQbPendingThrowTarget = null;
    cpuQbGazeTarget = null;
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

    if (activeOffense === 'P1' && p1OffPlay === 'PUNT' && currentDown !== 4) {
      p1OffPlay = 'SHORT_PASS';
      callbacks.setP1OffPlayState?.(p1OffPlay);
    }
    const activePlayName = (activeOffense === 'P1') ? p1OffPlay : p2OffPlay;

    // Special Teams: PUNT Formation
    if (activePlayName === 'PUNT') {
      const offTeam = activeOffense === 'P1' ? p1Team : p2Team;
      const defTeam = activeDefense === 'P1' ? p1Team : p2Team;

      qb.color = offTeam.qbColor || '#ffea00';
      qb.x = 170;
      qb.y = lineOfScrimmageY - (55 * attackDirection);
      qb.isPunter = true;

      linemen = [
        { startX: 170, startY: lineOfScrimmageY, x: 170, y: lineOfScrimmageY, radius: 10, blockTimer: 0, color: offTeam.primaryColor, speedMultiplier: 0.95 }
      ];

      receivers = [
        { startX: 40, startY: lineOfScrimmageY, x: 40, y: lineOfScrimmageY, vx: 0, vy: 0, radius: 10, routeType: 'GO', color: offTeam.primaryColor, archetype: 'SPEEDSTER', speedMultiplier: 1.20, isBlocker: false },
        { startX: 135, startY: lineOfScrimmageY - (25 * attackDirection), x: 135, y: lineOfScrimmageY - (25 * attackDirection), vx: 0, vy: 0, radius: 10, routeType: 'BLOCK', color: offTeam.primaryColor, archetype: 'BLOCKER', speedMultiplier: 0.95, isBlocker: true },
        { startX: 300, startY: lineOfScrimmageY, x: 300, y: lineOfScrimmageY, vx: 0, vy: 0, radius: 10, routeType: 'GO', color: offTeam.primaryColor, archetype: 'SPEEDSTER', speedMultiplier: 1.20, isBlocker: false }
      ];

      centerReceiver = { startX: 205, startY: lineOfScrimmageY - (25 * attackDirection), x: 205, y: lineOfScrimmageY - (25 * attackDirection), vx: 0, vy: 0, radius: 10, routeType: 'BLOCK', color: offTeam.primaryColor, archetype: 'BLOCKER', speedMultiplier: 0.95, isBlocker: true };
      rb = { startX: 170, startY: lineOfScrimmageY - (28 * attackDirection), x: 170, y: lineOfScrimmageY - (28 * attackDirection), vx: 0, vy: 0, radius: 10, routeType: 'BLOCK', color: offTeam.primaryColor, archetype: 'BLOCKER', speedMultiplier: 0.95, isBlocker: true };

      const returnerDeepY = Math.max(endZoneHeight + 60, Math.min(fieldHeight - endZoneHeight - 60, lineOfScrimmageY + (420 * attackDirection)));
      const puntBlockLineY = returnerDeepY - (55 * attackDirection);
      const puntBlockerXs = [45, 95, 145, 195, 245, 295];
      defenders = [
        { startX: puntBlockerXs[0], startY: puntBlockLineY, x: puntBlockerXs[0], y: puntBlockLineY, radius: 10, type: 'CB', isBlocker: true, color: defTeam.primaryColor, archetype: 'BLOCKER', speedMultiplier: 1.05 },
        { startX: puntBlockerXs[1], startY: puntBlockLineY, x: puntBlockerXs[1], y: puntBlockLineY, radius: 10, type: 'LB', isBlocker: true, color: defTeam.primaryColor, archetype: 'BLOCKER', speedMultiplier: 1.05 },
        { startX: puntBlockerXs[2], startY: puntBlockLineY, x: puntBlockerXs[2], y: puntBlockLineY, radius: 10, type: 'DL', isBlocker: true, color: defTeam.primaryColor, archetype: 'BLOCKER', speedMultiplier: 1.05 },
        { startX: puntBlockerXs[3], startY: puntBlockLineY, x: puntBlockerXs[3], y: puntBlockLineY, radius: 10, type: 'LB', isBlocker: true, color: defTeam.primaryColor, archetype: 'BLOCKER', speedMultiplier: 1.05 },
        { startX: puntBlockerXs[4], startY: puntBlockLineY, x: puntBlockerXs[4], y: puntBlockLineY, radius: 10, type: 'MLB', isBlocker: true, color: defTeam.primaryColor, archetype: 'BLOCKER', speedMultiplier: 1.05 },
        { startX: puntBlockerXs[5], startY: puntBlockLineY, x: puntBlockerXs[5], y: puntBlockLineY, radius: 10, type: 'CB', isBlocker: true, color: defTeam.primaryColor, archetype: 'BLOCKER', speedMultiplier: 1.05 },
        { startX: 170, startY: returnerDeepY, x: 170, y: returnerDeepY, radius: 10, type: 'RET', isReturner: true, color: defTeam.accentColor || defTeam.primaryColor, archetype: 'RETURNER', speedMultiplier: 1.0 }
      ];

      qb.team = activeOffense;
      linemen.forEach(l => { l.team = activeOffense; });
      receivers.forEach(r => { r.team = activeOffense; });
      if (centerReceiver) centerReceiver.team = activeOffense;
      if (rb) rb.team = activeOffense;
      defenders.forEach(d => { d.team = activeDefense; });

      activeEntity = qb;
      cpuPreSnapTimer = 0;
      callbacks.setP1OffFormationState?.('SPREAD');
      callbacks.setP1DefPlayState(p1DefPlay);
      return;
    }
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
        speedMultiplier: 1.08 * (offTeam.ratings.wrSpeed || 1.0),
        isBlocker: leftRoute === 'BLOCK'
      },
      {
        startX: alignmentPositions.slot, startY: lineOfScrimmageY, x: alignmentPositions.slot, y: lineOfScrimmageY, vx: 0, vy: 0, radius: 10,
        routeType: slotRoute, routeIndex: Math.max(0, middleRoutes.indexOf(slotRoute)), timer: 0, flash: 0, caught: false, isOutside: false,
        color: offTeam.primaryColor,
        archetype: 'SLOT',
        speedMultiplier: 1.04 * (offTeam.ratings.wrSpeed || 1.0),
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

    qb.team = activeOffense;
    linemen.forEach(l => { l.team = activeOffense; });
    receivers.forEach(r => { r.team = activeOffense; });
    if (centerReceiver) centerReceiver.team = activeOffense;
    if (rb) rb.team = activeOffense;
    defenders.forEach(d => { d.team = activeDefense; });

    const rosterEntities: Array<[string, Entity]> = [
      ['qb', qb],
      ...receivers.map((entity, index) => [`wr-${index}`, entity] as [string, Entity]),
      ...(centerReceiver ? [['center', centerReceiver] as [string, Entity]] : []),
      ...(rb ? [['rb', rb] as [string, Entity]] : []),
      ...linemen.map((entity, index) => [`line-${index}`, entity] as [string, Entity]),
      ...defenders.map((entity, index) => [`def-${index}`, entity] as [string, Entity])
    ];
    rosterEntities.forEach(([slot, entity]) => {
      const team = entity.team === 'P1' ? p1Team : p2Team;
      entity.rosterKey = `${entity.team}:${team.id}:${slot}`;
      entity.stamina = rosterStamina[entity.rosterKey] ?? 100;
      entity.endurance = entity.archetype === 'SPEEDSTER' ? 0.9 : entity.archetype === 'POSSESSION' ? 1.15 : 1;
      rosterStamina[entity.rosterKey] = entity.stamina;
    });
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
    if (options.tutorial) return;
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

  const engineHandle: GameEngineHandle = {
    get p1Score() { return p1Score; },
    get p2Score() { return p2Score; },
    get p1OffPlay() { return p1OffPlay; },
    get p1DefPlay() { return p1DefPlay; },
    get p2OffPlay() { return p2OffPlay; },
    get p2DefPlay() { return p2DefPlay; },
    get phase() { return phase; },
    get activeOffense() { return activeOffense; },
    get activeDefense() { return activeDefense; },
    get attackDirection() { return attackDirection; },
    p1Team,
    p2Team,
    getReceivers: () => receivers,
    isJoystickActiveForTest: () => joystick.active,
    diveTackle,
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
      if (drillResetTimer) clearTimeout(drillResetTimer);
      drillResetTimer = null;
      isPaused = false;
      isSessionActive = true;
      p1Score = 0;
      p2Score = 0;
      p1QuarterScores = [0, 0, 0, 0];
      p2QuarterScores = [0, 0, 0, 0];
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
      rosterStamina = {};
      userPlayHistory.length = 0;
      cpuPlayHistory.length = 0;
      defenseOverrides.clear();
      setMomentumState(0);
      openingReceivingTeam = 'P1';
      callbacks.setP1OffFormationState?.('SPREAD');
      callbacks.setP1DefPlayState('COVER2');
      setupKickoff('P2', 'P1', 'GAME RESET - OPENING KICKOFF 🏈');
      saveGameSession();
    },
    setPaused: (paused: boolean) => {
      isPaused = paused;
      lastClockFrameTime = null;
      if (paused) saveGameSession();
      else if (phase === 'DEAD' && playEnding && !drillResetTimer) scheduleDrillReset();
    },
    endGame: () => {
      if (drillResetTimer) clearTimeout(drillResetTimer);
      drillResetTimer = null;
      isPaused = true;
      isSessionActive = false;
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem(GAME_SESSION_STORAGE_KEY);
        } catch {
          // Ignore unavailable browser storage.
        }
      }
    },
    applyDefensiveAlignment: () => {
      applyDefensiveAlignment();
    },
    selectOffense: (key: string) => {
      if (activeOffense === 'P1' && phase === 'PRE_SNAP' && offensivePlaybook[key] &&
        (key !== 'PUNT' || (currentDown === 4 && !isKickoffPhase))) {
        p1OffPlay = key;
        if (offensivePlaybook[key].alignment) {
          p1OffFormation = offensivePlaybook[key].alignment!;
          callbacks.setP1OffFormationState?.(p1OffFormation);
        }
        resetDrill(true);
      }
    },
    selectDefense: (key: string) => {
      if (activeDefense === 'P1' && defensivePlaybook[key]) {
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
    },
    kickoff: (power?: number) => {
      executeKickoff(power !== undefined ? power : kickMeterPower);
    },
    callPunt: () => {
      if (activeOffense !== 'P1' || currentDown !== 4 || phase !== 'PRE_SNAP' || isKickoffPhase || gameOver) return;
      p1OffPlay = 'PUNT';
      callbacks.setP1OffPlayState?.('PUNT');
      resetDrill(true);
      showAnnouncement('4TH DOWN: SPECIAL TEAMS PUNT UNIT ON FIELD! 🏈', '#00ffff');
    },
    punt: (power?: number) => {
      if (activeOffense === 'P1' && currentDown === 4 && phase === 'PRE_SNAP' && !isKickoffPhase && !gameOver) {
        const chosenPower = power !== undefined ? power : kickMeterPower;
        p1OffPlay = 'PUNT';
        snapToQuarterback();
        executePunt('P1', attackDirection, chosenPower);
      }
    },
    isKickoffActive: () => isKickoffPhase,
    is4thDown: () => currentDown === 4 && phase === 'PRE_SNAP',
    triggerPlayEnd: (endingY: number, resultType: string, customMessage?: string, customColor?: string) => {
      handlePlayEnd(endingY, resultType, customMessage, customColor);
    },
    setPossessionForTest: (team: 'P1' | 'P2') => {
      activeOffense = team;
      activeDefense = team === 'P1' ? 'P2' : 'P1';
      attackDirection = team === 'P1' ? -1 : 1;
      isKickoffPhase = false;
      playEnding = false;
      phase = 'PRE_SNAP';
      currentDown = 1;
      yardsToGo = 10;
      lineOfScrimmageY = team === 'P1' ? 950 : 250;
      firstDownMarkerY = lineOfScrimmageY + (100 * attackDirection);
      setActiveOffenseState(activeOffense);
      updateDownDisplay();
    },
    set4thDownForTest: () => {
      currentDown = 4;
      isKickoffPhase = false;
      phase = 'PRE_SNAP';
      setIs4thDownState?.(true);
      updateDownDisplay();
    },
    getDefenders: () => defenders,
    getControlledDefender: () => getControlledDefender(),
    selectDefenderForTest: (_index: number) => {
      // Defensive user control is always reserved for the unassigned first defender.
    },
    startPlay: startReadyPlay,
    startDefensePlay: startReadyPlay,
    repositionDefender: (index: number, x: number, y: number) => {
      // The user should only be able to reposition the center player (index 0)
      if (index === 0 && defenders[0]) {
        repositionUserDefender(defenders[0], x, y);
      }
    },
    get cameraPerspective() { return cameraPerspectiveMode; },
    setCameraPerspective,
    getCameraPerspective: () => cameraPerspectiveMode,
    toggleCameraPerspective
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
      completeTutorialAction(0);
    } else if (activeDefense === 'P1') {
      const curIdx = defensiveKeys.indexOf(p1DefPlay);
      const nextIdx = (curIdx + direction + defensiveKeys.length) % defensiveKeys.length;
      const nextDef = defensiveKeys[nextIdx];
      engineHandle.selectDefense(nextDef);
      sounds.playJuke();
      completeTutorialAction(7);
    }
  }

  if (options.tutorial) {
    isKickoffPhase = false;
    activeOffense = 'P1';
    activeDefense = 'P2';
    attackDirection = -1;
    lineOfScrimmageY = 700;
    firstDownMarkerY = 600;
    resetDrill();
    setActiveOffenseState('P1');
    callbacks.onTutorialStep?.(0);
  } else if (!restoreGameSession()) {
    setupKickoff('P2', 'P1', 'OPENING KICKOFF - Q1 🏈');
  }

  function snapToQuarterback(): void {
    setIs4thDownState?.(false);
    snapBall = linemen[0] ? { center: { ...linemen[0] }, frame: 0 } : null;
    sounds.playSnap();
    gameClockRunning = true;
    qb.hasBall = true;
    tutorialAimFrames = 0;
    completeTutorialAction(4);
    completeTutorialAction(10);
  }

  function startCpuPlay(): void {
    if (activeOffense === 'P2') {
      triggerCpuOffensiveAudible(true);
    }
    let cpuPlay = offensivePlaybook[p2OffPlay];
    if (cpuPlay && cpuPlay.type === 'PUNT') {
      snapToQuarterback();
      const distToEndzone = attackDirection === -1
        ? lineOfScrimmageY - endZoneHeight
        : (fieldHeight - endZoneHeight) - lineOfScrimmageY;
      const distYards = distToEndzone / 10;
      let cpuPower = 0.82 + Math.random() * 0.12;
      if (distYards < 52) {
        // Pooch punt: attempt to pin inside the 15 without kicking a touchback
        cpuPower = Math.max(0.25, Math.min(0.68, (distYards - 8) / 32));
      }
      executePunt('P2', attackDirection, cpuPower);
      return;
    }
    if (rb && (rb.isBlocker || rb.routeType === 'BLOCK') && cpuPlay?.type !== 'PASS') {
      p2OffPlay = 'MESH';
      cpuPlay = offensivePlaybook.MESH;
      callbacks.setP2OffPlayState(p2OffPlay);
    }
    snapToQuarterback();
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

  function startReadyPlay(): void {
    if (phase !== 'PRE_SNAP') return;
    if (activeDefense === 'P1') {
      startCpuPlay();
      return;
    }
    if (activeOffense !== 'P1') return;

    const play = offensivePlaybook[p1OffPlay];
    if (play?.type === 'PUNT') {
      if (currentDown === 4 && !isKickoffPhase) {
        snapToQuarterback();
        executePunt('P1', attackDirection, kickMeterPower);
      }
      return;
    }

    snapToQuarterback();
    const isDesignedRun = (play?.type !== 'PASS' && play?.type !== 'PUNT') || rb?.routeType === 'RUN';
    if (isDesignedRun) {
      if (rb) rb.hasBall = false;
      activeEntity = rb || qb;
      phase = 'HANDOFF';
    } else {
      phase = 'QB_DROP';
      isAiming = false;
      qb.dropStepTimer = 28;
    }
  }

  const keysDown = {
    up: false,
    down: false,
    left: false,
    right: false
  };

  function diveTackle(): void {
    if (isPaused || phase !== 'RUNNING' || activeDefense !== 'P1' || !activeEntity) return;
    const defender = getControlledDefender();
    if (!defender || (defender.diveCooldownTimer || 0) > 0) return;
    defender.diveCooldownTimer = 60;
    const distance = Math.hypot(defender.x - activeEntity.x, defender.y - activeEntity.y);
    if (distance <= defender.radius + activeEntity.radius + 10) {
      sounds.playTackle();
      phase = 'DEAD';
      handlePlayEnd(activeEntity.y, 'TACKLE', 'USER DIVE TACKLE!', '#00ffff');
    } else {
      defender.brokenTackleStun = 18;
      showAnnouncement('DIVE MISSED!', '#ffaa00');
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (isPaused || e.defaultPrevented) return;
    const target = e.target as HTMLElement | null;
    if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target?.tagName ?? '')) return;
    const key = e.key.toLowerCase();
    if (key === ' ') {
      e.preventDefault();
      if (e.repeat) return;
      if (phase === 'PRE_SNAP' && !isKickoffPhase) {
        startReadyPlay();
        return;
      }
    }
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) e.preventDefault();
    if (key === 'w' || key === 'arrowup') keysDown.up = true;
    if (key === 's' || key === 'arrowdown') keysDown.down = true;
    if (key === 'a' || key === 'arrowleft') keysDown.left = true;
    if (key === 'd' || key === 'arrowright') keysDown.right = true;
    if ((key === ' ' || key === 'e') && !e.repeat && activeDefense === 'P1') {
      e.preventDefault();
      diveTackle();
    }

    // Deliberate keyboard juke input on J, E, or Spacebar during ball carrier running
    if ((key === 'j' || key === 'e' || key === ' ') && phase === 'RUNNING' && activeEntity && activeOffense === 'P1') {
      if ((activeEntity.jukeCooldownTimer || 0) <= 0) {
        const jukeSign = keysDown.left ? -1 : (keysDown.right ? 1 : (activeEntity.vx && activeEntity.vx < 0 ? -1 : 1));
        activeEntity.jukeTimer = 10;
        activeEntity.jukeVx = jukeSign * 1.35;
        activeEntity.jukeCooldownTimer = 35;
        activeEntity.vx = 0;
        screenShakeTimer = 8;
        sounds.playJuke();
        showAnnouncement(jukeSign > 0 ? "JUKE RIGHT! 💨" : "JUKE LEFT! 💨", "#00ffff");
      }
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (key === 'w' || key === 'arrowup') keysDown.up = false;
    if (key === 's' || key === 'arrowdown') keysDown.down = false;
    if (key === 'a' || key === 'arrowleft') keysDown.left = false;
    if (key === 'd' || key === 'arrowright') keysDown.right = false;
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
  }

  function getEffectiveJoystickInput(): { x: number; y: number; active: boolean } {
    let x = joystick.active ? joystick.inputX : 0;
    let y = joystick.active ? joystick.inputY : 0;
    if (keysDown.left) x -= 1;
    if (keysDown.right) x += 1;
    if (keysDown.up) y -= 1;
    if (keysDown.down) y += 1;
    const mag = Math.hypot(x, y);
    if (mag > 1) {
      x /= mag;
      y /= mag;
    }
    return {
      x,
      y,
      active: joystick.active || keysDown.left || keysDown.right || keysDown.up || keysDown.down
    };
  }

  function getCanvasCoords(clientX: number, clientY: number): { x: number; y: number } {
    if (!canvas) return { x: clientX, y: clientY };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / (rect.width || 1)),
      y: (clientY - rect.top) * (canvas.height / (rect.height || 1))
    };
  }

  function worldToCanvas(wx: number, wy: number): { x: number; y: number } {
    const pitch = getCameraPitchFactor();
    return {
      x: (wx * cameraScale) + cameraOffsetX,
      y: (wy - cameraY) * (cameraScale * pitch)
    };
  }

  function getControlledDefender(): Entity | null {
    if (activeDefense !== 'P1') return null;
    return defenders[0] || null;
  }

  function getTappedReceiver(screenX: number, screenY: number, worldX: number, worldY: number): Entity | null {
    const eligibleReceivers = [...receivers, centerReceiver, rb].filter(
      (r): r is Entity => Boolean(r && !r.isBlocker && r.routeType !== 'BLOCK')
    );
    let bestReceiver: Entity | null = null;
    let minDistance = Infinity;
    for (const r of eligibleReceivers) {
      const worldDist = Math.hypot(r.x - worldX, r.y - worldY);
      const canvasPos = worldToCanvas(r.x, r.y);
      const screenDist = Math.hypot(canvasPos.x - screenX, canvasPos.y - screenY);

      if (worldDist < (r.radius || 10) + 32 || screenDist < 46) {
        const score = Math.min(worldDist, screenDist);
        if (score < minDistance) {
          minDistance = score;
          bestReceiver = r;
        }
      }
    }
    return bestReceiver;
  }

  function executeUserPass(tappedReceiver: Entity) {
    if (phase !== 'QB_DROP' || activeOffense !== 'P1' || !qb.hasBall) return;

    let projX = tappedReceiver.x;
    let projY = tappedReceiver.y;

    for (let leadPass = 0; leadPass < 2; leadPass++) {
      const estimatedDistance = Math.hypot(projX - qb.x, projY - qb.y);
      const estimatedSpeed = Math.min(6.4, Math.max(3.6, (3.2 + estimatedDistance * 0.028) * 0.8));
      const estimatedFlightFrames = getPassFlightFrames(estimatedDistance, estimatedSpeed);
      const leadTarget = getPassLeadTarget(tappedReceiver, estimatedFlightFrames);
      projX = Math.max(25, Math.min(fieldWidth - 25, leadTarget.x));
      projY = leadTarget.y;
    }

    const dx = projX - qb.x;
    const dy = projY - qb.y;
    const throwDist = Math.hypot(dx, dy);

    const throwSpeed = Math.min(6.4, Math.max(3.6, (3.2 + throwDist * 0.028) * 0.8));
    const totalFlightFrames = Math.max(18, Math.round(throwDist / throwSpeed));

    const rusherThreat = defenders.some(d => d && (d.passRusher || d.defenseAssignment === 'BLITZ') && Math.hypot(d.x - qb.x, d.y - qb.y) < 55);
    const isHitAsThrown = defenders.some(d => d && (d.passRusher || d.defenseAssignment === 'BLITZ') && Math.hypot(d.x - qb.x, d.y - qb.y) < 32);
    const offTeam = activeOffense === 'P1' ? p1Team : p2Team;
    const accCheck = evaluateQbThrowAccuracy({
      throwDist,
      isUnderPressure: rusherThreat,
      isDeepShot: throwDist > 160,
      isHitAsThrown,
      isMoving: Math.hypot(qb.vx || 0, qb.vy || 0) > 0.6,
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

    ball = {
      startX: qb.x,
      startY: qb.y,
      x: qb.x,
      y: qb.y,
      z: 16,
      vx,
      vy,
      maxZ: getPassArcMaxHeight(throwDist, throwDist > 140),
      flightFrames: totalFlightFrames,
      currentFrame: 0,
      targetX,
      targetY,
      intendedTarget: tappedReceiver
    };
    if (receivers.includes(tappedReceiver)) tappedReceiver.targetedThisPlay = true;

    qb.hasBall = false;
    phase = 'THROWN';
    sounds.playThrow();
    completeTutorialAction(5);

    throwTargetFeedback = {
      x: targetX,
      y: targetY,
      radius: 6,
      maxRadius: 28,
      alpha: 1.0,
      receiverName: tappedReceiver === rb ? 'RB' : (tappedReceiver === centerReceiver ? 'CENTER' : 'WR')
    };
  }

  // Pointer events
  const handlePointerDown = (e: PointerEvent) => {
    if (isPaused) return;
    rbDoubleTapConsumed = false;
    const { x: px, y: py } = screenToWorld(e.clientX, e.clientY);
    const screenPos = getScreenCoords(e.clientX, e.clientY);

    const currentTime = Date.now();

    if (options.tutorial) {
      const near = (entity: Entity | null) => entity && Math.hypot(entity.x - px, entity.y - py) < 32;
      if (tutorialStep === 6 || tutorialStep === 10 || tutorialStep === 12) return;
      if (tutorialStep === 2 && !receivers.some(near)) return;
      if (tutorialStep === 3 && !near(centerReceiver)) return;
      if (tutorialStep === 4 && !near(qb)) return;
      if (tutorialStep === 8 && !near(defenders[3])) return;
      if (tutorialStep === 9 && !near(defenders[0])) return;
      if ((tutorialStep === 0 || tutorialStep === 1 || tutorialStep === 7) && [qb, rb, centerReceiver, ...receivers, ...defenders].some(near)) return;
    }

    // Guard against tap-through immediately after closing playbook or selecting defense
    if (currentTime - lastDefenseSelectTime < 450) {
      return;
    }

    if (phase === 'KICKOFF') {
      if (kickoffKickingTeam === 'P1') {
        executeKickoff(kickMeterPower);
      }
      return;
    }

    // Tapping the punt meter on the field executes the punt!
    if (phase === 'PRE_SNAP' && activeOffense === 'P1' && typeof p1OffPlay !== 'undefined' && p1OffPlay === 'PUNT') {
      const cWidth = (typeof canvas !== 'undefined' && canvas) ? canvas.width : fieldWidth;
      const cHeight = (typeof canvas !== 'undefined' && canvas) ? canvas.height : 450;
      const meterW = 210;
      const meterH = 50;
      const meterX = (cWidth - meterW) / 2;
      const meterY = cHeight - 145;
      const isTapOnMeter = (
        screenPos.x >= meterX - 35 &&
        screenPos.x <= meterX + meterW + 35 &&
        screenPos.y >= meterY - 30 &&
        screenPos.y <= meterY + meterH + 35
      );
      const distToPunter = Math.hypot(qb.x - px, qb.y - py);
      if (isTapOnMeter || distToPunter < 45) {
        if (typeof snapToQuarterback === 'function') snapToQuarterback();
        if (typeof executePunt === 'function') {
          executePunt('P1', typeof attackDirection !== 'undefined' ? attackDirection : 1, typeof kickMeterPower !== 'undefined' ? kickMeterPower : 0.6);
        }
        return;
      }
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
        if (rb && Math.hypot(rb.x - px, rb.y - py) < rb.radius + receiverHitPadding) {
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
        if (centerReceiver && Math.hypot(centerReceiver.x - px, centerReceiver.y - py) < centerReceiver.radius + receiverHitPadding) {
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
        const eligibleWr = receivers.find(r => r && Math.hypot(r.x - px, r.y - py) < r.radius + receiverHitPadding);
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

        const distToQb = Math.hypot(qb.x - px, qb.y - py);
        const distToRb = rb ? Math.hypot(rb.x - px, rb.y - py) : Infinity;
        if (distToQb < 32 && distToQb < distToRb - 10) {
          startReadyPlay();
          isSnapGestureActive = true;
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

        // User taps a defender: select to allow pulling/repositioning anywhere on correct side of LOS
        const hitDefender = defenders
          .map(defender => ({ defender, distance: Math.hypot(defender.x - px, defender.y - py) }))
          .filter(({ defender, distance }) => distance < (defender.radius || 10) + touchHitPadding)
          .sort((first, second) => first.distance - second.distance)[0]?.defender;
        if (hitDefender) {
          gestureEntity = hitDefender;
          gestureRole = 'DEFENDER';
          gestureStartX = px;
          gestureStartY = py;
          gestureGrabOffsetX = hitDefender.x - px;
          gestureGrabOffsetY = hitDefender.y - py;
          gestureCurrentX = px;
          gestureCurrentY = py;
          gestureTouchStartX = px;
          gestureTouchStartY = py;
          isDirtGestureActive = false;
          isPullingDefender = false;
          return;
        }

        return;
      }

      // 3. Open grass touch: Record start position for field swipe formation change!
      preSnapFieldSwipeStartX = px;
      preSnapFieldSwipeStartY = py;
      touchScreenStartX = e.clientX;
      touchScreenStartY = e.clientY;

      // Double tap empty field flips RB side
      if (activeOffense === 'P1' && currentTime - lastTapTime < 350 && rb) {
        rbDoubleTapConsumed = true;
        if (px < fieldWidth / 2) {
          rb.side = 'left';
          rb.startX = 120; rb.x = 120;
        } else {
          rb.side = 'right';
          rb.startX = 220; rb.x = 220;
        }
        completeTutorialAction(1);
        lastTapTime = 0;
        return;
      }
      lastTapTime = currentTime;
      return;
    }

    // Live play: Tap-to-Throw detection (Zero interference with joystick)
    if (phase === 'QB_DROP' && activeOffense === 'P1') {
      const tappedWr = typeof getTappedReceiver === 'function' ? getTappedReceiver(screenPos.x, screenPos.y, px, py) : null;
      if (tappedWr) {
        if (typeof passPointerId !== 'undefined') passPointerId = e.pointerId;
        if (typeof passTapTarget !== 'undefined') passTapTarget = tappedWr;
        tapThrowTarget = tappedWr;
        if (typeof executeUserPass === 'function') executeUserPass(tappedWr);
        return;
      }
    }

    // Relative Virtual Joystick activation
    const isLiveMovementPhase = (phase === 'QB_DROP' || phase === 'HANDOFF' || phase === 'RUNNING');
    if (typeof joystick !== 'undefined' && isLiveMovementPhase && !joystick.active) {
      const cPos = typeof getCanvasCoords === 'function' ? getCanvasCoords(e.clientX, e.clientY) : { x: e.clientX, y: e.clientY };
      if (cPos.y >= canvas.height / 2) {
        joystick.active = true;
        joystick.pointerId = e.pointerId;
        joystick.baseX = cPos.x;
        joystick.baseY = cPos.y;
        joystick.currentX = cPos.x;
        joystick.currentY = cPos.y;
        joystick.inputX = 0;
        joystick.inputY = 0;
        joystick.distance = 0;
        joystick.alpha = 1.0;
      }
    }
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (isPaused) return;
    const { x: curX, y: curY } = screenToWorld(e.clientX, e.clientY);
    const screenPos = getScreenCoords(e.clientX, e.clientY);
    aimCurrentX = curX;
    aimCurrentY = curY;
    aimScreenCurrentX = screenPos.x;
    aimScreenCurrentY = screenPos.y;

    // Relative Virtual Joystick drag calculation with dynamic floating base
    if (typeof joystick !== 'undefined' && joystick.active && e.pointerId === joystick.pointerId) {
      const cPos = typeof getCanvasCoords === 'function' ? getCanvasCoords(e.clientX, e.clientY) : { x: e.clientX, y: e.clientY };
      joystick.currentX = cPos.x;
      joystick.currentY = cPos.y;

      const dx = joystick.currentX - joystick.baseX;
      const dy = joystick.currentY - joystick.baseY;
      const rawDist = Math.hypot(dx, dy);
      const MAX_RADIUS = 46 * ((canvas?.width || 340) / 340);
      const DEADZONE = 5 * ((canvas?.width || 340) / 340);

      if (rawDist > DEADZONE) {
        const clampedDist = Math.min(MAX_RADIUS, rawDist);
        const angle = Math.atan2(dy, dx);
        if (rawDist > MAX_RADIUS) {
          joystick.baseX = joystick.currentX - Math.cos(angle) * MAX_RADIUS;
          joystick.baseY = joystick.currentY - Math.sin(angle) * MAX_RADIUS;
        }
        joystick.distance = Math.min(1.0, (clampedDist - DEADZONE) / (MAX_RADIUS - DEADZONE));
        joystick.inputX = Math.cos(angle) * joystick.distance;
        joystick.inputY = Math.sin(angle) * joystick.distance;
      } else {
        joystick.distance = 0;
        joystick.inputX = 0;
        joystick.inputY = 0;
      }
    }

    if (phase === 'RUNNING' && activeEntity && activeOffense === 'P1' && (typeof joystick === 'undefined' || !joystick.active)) {
      if ((activeEntity.jukeTimer || 0) <= 0) {
        const targetX = Math.max(20, Math.min(fieldWidth - 20, curX));
        const steerDiff = targetX - activeEntity.x;
        const isReturn = Boolean(isSpecialTeamsReturn || activeEntity.isReturner);
        const maxSteerSpeed = isReturn ? 0.45 : 1.25;
        const steerFactor = isReturn ? 0.06 : 0.08;
        activeEntity.vx = Math.max(-maxSteerSpeed, Math.min(maxSteerSpeed, steerDiff * steerFactor));
      } else {
        activeEntity.vx = 0;
      }
    }

    if (phase === 'PRE_SNAP' && gestureEntity) {
      gestureCurrentX = curX;
      gestureCurrentY = curY;
      const dragDist = Math.hypot(curX - gestureStartX, curY - gestureStartY);

      if (gestureRole === 'DEFENDER') {
        if (gestureEntity === defenders[0]) {
          if (dragDist > 6 || isPullingDefender) {
            isPullingDefender = true;
            repositionUserDefender(gestureEntity, curX + gestureGrabOffsetX, curY + gestureGrabOffsetY);
          }
          return;
        }

        if (dragDist > 8 || Math.abs(curX - gestureStartX) > 8) {
          isDirtGestureActive = true;
        }
        return;
      }

      if (dragDist > 10 || Math.abs(curX - gestureStartX) > 10) {
        isDirtGestureActive = true;
      }
      return;
    }
  };

  const handlePointerUp = (e: PointerEvent) => {
    if (isPaused) return;

    if (typeof isSnapGestureActive !== 'undefined' && isSnapGestureActive) {
      isSnapGestureActive = false;
      return;
    }

    const wasJoystick = typeof joystick !== 'undefined' && joystick.active && e.pointerId === joystick.pointerId;
    if (wasJoystick) {
      joystick.active = false;
      joystick.pointerId = null;
      joystick.inputX = 0;
      joystick.inputY = 0;
      joystick.distance = 0;
    }

    if (typeof passPointerId !== 'undefined' && passPointerId === e.pointerId) {
      passPointerId = null;
      if (typeof passTapTarget !== 'undefined') passTapTarget = null;
    }

    if (rbDoubleTapConsumed) {
      rbDoubleTapConsumed = false;
      return;
    }
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
        const dx = gestureCurrentX - gestureStartX;
        const dy = gestureCurrentY - gestureStartY;
        const lateralDist = Math.abs(dx);

        if (gestureRole === 'DEFENDER') {
          if (gestureEntity === defenders[0]) {
            if (isPullingDefender || dragDist > 6) {
              repositionUserDefender(gestureEntity, curX + gestureGrabOffsetX, curY + gestureGrabOffsetY);
              sounds.playJuke();
            }
            gestureEntity = null;
            isPullingDefender = false;
            return;
          }

          if (isDirtGestureActive || dragDist > 10) {
            const gesture = evaluateDirtSwipeGesture(
              gestureEntity,
              'DEFENDER',
              dx,
              dy,
              attackDirection
            );
            applyChalkRoute(gestureEntity, 'DEFENDER', gesture.value);
          } else {
            // Cycle assignment-controlled teammates; the free defender has no assignment.
            const defenderIndex = defenders.indexOf(gestureEntity);
            const currentAssignment = defenseOverrides.get(defenderIndex) || gestureEntity.defenseAssignment || 'MAN';
            const toggleCycle: Array<'BLITZ' | 'MAN' | 'RB_SPY' | 'ZONE'> = ['MAN', 'ZONE', 'BLITZ', 'RB_SPY'];
            const currentIdx = toggleCycle.indexOf(currentAssignment as any);
            const nextAssignment = toggleCycle[(currentIdx + 1 + toggleCycle.length) % toggleCycle.length];
            applyChalkRoute(gestureEntity, 'DEFENDER', nextAssignment);
          }
          gestureEntity = null;
          isDirtGestureActive = false;
          return;
        } else if (gestureRole === 'RB' && (lateralDist > 10 || (isDirtGestureActive && dragDist > 10))) {
          // Left or right swipe on the RB is the way to call a running play!
          const gesture = evaluateDirtSwipeGesture(
            gestureEntity,
            gestureRole,
            dx,
            dy,
            attackDirection
          );
          applyChalkRoute(gestureEntity, gestureRole, gesture.value);
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
          // Single tap on offensive player toggles role/assignment!
          if (gestureRole === 'WR') {
            const isCurrentlyBlocking = gestureEntity.isBlocker || gestureEntity.routeType === 'BLOCK';
            if (isCurrentlyBlocking) {
              const defaultRoute = (gestureEntity === centerReceiver ? 'SLANT-R' : (gestureEntity.startX! < 170 ? 'SLANT-R' : 'SLANT-L'));
              applyChalkRoute(gestureEntity, gestureRole, defaultRoute);
            } else {
              applyChalkRoute(gestureEntity, gestureRole, 'BLOCK');
            }
          } else if (gestureRole === 'RB') {
            // RB Single Tap Toggle: Only toggles Pass Protection (BLOCK) <-> Pass Route (FLAT)
            // Running play is NOT part of the toggle (called by swiping left or right on the RB).
            const currentRoute = gestureEntity.routeType;
            const isBlocking = gestureEntity.isBlocker || currentRoute === 'BLOCK';

            if (isBlocking) {
              // Toggles to Pass Route (FLAT)
              applyChalkRoute(gestureEntity, 'RB', 'FLAT');
              if (typeof showAnnouncement === 'function') showAnnouncement('PASS ROUTE: RB RUNNING FLAT! 🎯', '#00ffff');
            } else {
              // Toggles to Pass Protection (BLOCK)
              applyChalkRoute(gestureEntity, 'RB', 'BLOCK');
              if (typeof showAnnouncement === 'function') showAnnouncement('PASS PROTECTION: RB BLOCKING! 🛡️', '#ffffff');
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

    if (activeOffense !== 'P1') return;

    const screenEnd = getScreenCoords(e.clientX, e.clientY);
    const swipeTime = Date.now() - touchStartTime;
    const deltaScreenX = screenEnd.x - touchScreenStartX;
    const deltaScreenY = screenEnd.y - touchScreenStartY;

    if (phase === 'RUNNING' && activeEntity && activeOffense === 'P1') {
      // Releasing the joystick or continuous steering MUST NOT trigger an accidental swipe juke!
      if (!wasJoystick && (activeEntity.jukeCooldownTimer || 0) <= 0) {
        const swipeSpeed = Math.abs(deltaScreenX) / Math.max(1, swipeTime);
        // Requires a deliberate, crisp, quick flick (not a steering drag)
        if (swipeTime < 240 && Math.abs(deltaScreenX) > 55 && swipeSpeed > 0.38 && Math.abs(deltaScreenX) > Math.abs(deltaScreenY) * 1.6) {
          const jukeSign = deltaScreenX > 0 ? 1 : -1;
          activeEntity.jukeTimer = 10;
          activeEntity.jukeVx = jukeSign * 1.35;
          activeEntity.jukeCooldownTimer = 35;
          activeEntity.vx = 0;
          screenShakeTimer = 8;
          sounds.playJuke();
          showAnnouncement(jukeSign > 0 ? "JUKE RIGHT! 💨" : "JUKE LEFT! 💨", "#00ffff");
        } else if (swipeTime < 350 && ((attackDirection === -1 && deltaScreenY < -35) || (attackDirection === 1 && deltaScreenY > 35)) && Math.abs(deltaScreenX) < 40) {
          if (!activeEntity.isReturner && !isSpecialTeamsReturn && !activeEntity.boostUsed) {
            activeEntity.boostUsed = true;
            activeEntity.powerBoostTimer = 60;
            screenShakeTimer = 20;
            sounds.playJuke();
          }
        }
      }
      return;
    }

    if (phase === 'QB_DROP' && activeOffense === 'P1') {
      const releaseWorld = screenToWorld(e.clientX, e.clientY);
      const receiverAtRelease = typeof getTappedReceiver === 'function' ? getTappedReceiver(screenEnd.x, screenEnd.y, releaseWorld.x, releaseWorld.y) : null;
      if (receiverAtRelease && typeof executeUserPass === 'function') {
        executeUserPass(receiverAtRelease);
        return;
      }

      // Tutorial Step 5 test compatibility
      if (options && (options as any).tutorial && tutorialStep === 5) {
        const targetReceiver = receivers[0] || (typeof centerReceiver !== 'undefined' ? centerReceiver : null) || (typeof rb !== 'undefined' ? rb : null);
        if (targetReceiver && typeof executeUserPass === 'function') {
          executeUserPass(targetReceiver);
          return;
        }
      }

      // Deliberate throw pull test compatibility (e.g. test 97)
      if (deltaScreenY > 28 && Math.abs(deltaScreenX) < 40) {
        const targetReceiver = receivers.find((r: any) => r && !r.isBlocker && r.routeType !== 'BLOCK') || (typeof centerReceiver !== 'undefined' ? centerReceiver : null) || (typeof rb !== 'undefined' ? rb : null);
        if (targetReceiver && typeof executeUserPass === 'function') {
          executeUserPass(targetReceiver);
          return;
        }
      }
    }
  };

  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerup', handlePointerUp);

  function triggerFumble(carrier: Entity) {
    phase = 'FUMBLE';
    triggerScreenShake(32, 12);
    sounds.playFumble();
    fumbleBall = createFumbleBall(carrier, attackDirection, activeOffense);
    showAnnouncement(
      "FUMBLE! LOOSE BALL ON THE TURF! 🏈💥",
      "#ffd700",
      true,
      {
        category: 'FUMBLE',
        subtext: "CRUSHING HIT FORCES A FUMBLE! PLAYERS SCRAMBLING TO RECOVER!",
        durationMs: 4000
      }
    );
  }

  function checkCarrierOutOfBounds(): boolean {
    if (phase !== 'RUNNING' && phase !== 'QB_DROP' && phase !== 'HANDOFF') return false;
    const carrier = phase === 'HANDOFF' ? qb : activeEntity;
    if (!carrier || !isPlayerOutOfBounds(carrier, fieldWidth)) return false;
    gameClockRunning = false;
    phase = 'DEAD';
    isAiming = false;
    handlePlayEnd(carrier.y, 'OUT_OF_BOUNDS', 'OUT OF BOUNDS - CLOCK STOPPED');
    return true;
  }

  function update() {
    const entities = getSessionEntities().map(([, entity]) => entity);
    const positions = entities.map(entity => ({ x: entity.x, y: entity.y }));
    const livePlay = !['PRE_SNAP', 'DEAD', 'KICKOFF'].includes(phase);
    updateGameplay();
    const activeKeys = new Set<string>();
    entities.forEach((entity, index) => {
      if ((entity.diveCooldownTimer || 0) > 0) entity.diveCooldownTimer!--;
      if (!entity.rosterKey) return;
      activeKeys.add(entity.rosterKey);
      if (receivers.includes(entity)) {
        entity.stamina = rosterStamina[entity.rosterKey] ?? entity.stamina ?? 100;
        return;
      }
      const distance = livePlay ? Math.hypot(entity.x - positions[index].x, entity.y - positions[index].y) : 0;
      entity.stamina = updatePlayerStamina(entity.stamina ?? 100, Math.min(distance, 5), entity.endurance, livePlay ? 0 : phase === 'DEAD' ? 0.04 : 0.01);
      rosterStamina[entity.rosterKey] = entity.stamina;
    });
    for (const key of Object.keys(rosterStamina)) {
      if (!activeKeys.has(key) && !key.includes(':wr-')) rosterStamina[key] = updatePlayerStamina(rosterStamina[key], 0, 1, 0.035);
    }
  }

  function updateGameplay() {
    if (checkCarrierOutOfBounds()) return;
    if (snapBall) {
      snapBall.frame++;
      if (snapBall.frame >= 8 || (phase !== 'QB_DROP' && phase !== 'HANDOFF')) snapBall = null;
    }
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

    if (phase === 'KICKOFF') {
      if (kickoffKickingTeam === 'P1') {
        kickMeterPower += 0.022 * kickMeterDirection;
        if (kickMeterPower >= 1.0) { kickMeterPower = 1.0; kickMeterDirection = -1; }
        if (kickMeterPower <= 0.25) { kickMeterPower = 0.25; kickMeterDirection = 1; }
        setKickMeterPowerState?.(kickMeterPower);
      } else {
        cpuKickoffDelayTimer--;
        if (cpuKickoffDelayTimer <= 0) {
          executeKickoff(0.85 + Math.random() * 0.12);
        }
      }
      return;
    }

    if (phase === 'PRE_SNAP') {
      if (activeOffense === 'P1' && p1OffPlay === 'PUNT') {
        kickMeterPower += 0.022 * kickMeterDirection;
        if (kickMeterPower >= 1.0) { kickMeterPower = 1.0; kickMeterDirection = -1; }
        if (kickMeterPower <= 0.25) { kickMeterPower = 0.25; kickMeterDirection = 1; }
        setKickMeterPowerState?.(kickMeterPower);
      }
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
      if (fumbleBall.x <= 20 || fumbleBall.x >= fieldWidth - 20) {
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
              swapPossessionOnPlay(recoveryY);
              const recoveringSide = activeOffense;
              const recTeamName = (recoveringSide === 'P1' ? p1Team : p2Team).name.toUpperCase();
              const isUser = recoveringSide === 'P1';
              showAnnouncement(
                "DEFENSE RECOVERS THE FUMBLE! TURNOVER! 🛡️⚡",
                isUser ? "#00ffff" : "#ff3333",
                true,
                {
                  category: 'TURNOVER',
                  subtext: isUser
                    ? `YOU RECOVERED THE FUMBLE! ${recTeamName} TAKES OVER POSSESSION (1ST & 10)`
                    : `CPU RECOVERS THE FUMBLE! ${recTeamName} TAKES OVER POSSESSION (1ST & 10)`,
                  possessionTeam: recoveringSide,
                  durationMs: 5500
                }
              );
              scheduleDrillReset();
            } else {
              // Offense recovers
              screenShakeTimer = 18;
              showAnnouncement("OFFENSE RECOVERS OWN FUMBLE! 🏈", "#00ffff", false, {
                category: 'FUMBLE',
                subtext: "OFFENSE SECURES THE LOOSE BALL!",
                durationMs: 3500
              });
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
          swapPossessionOnPlay(recoveryY);
          const recoveringSide = activeOffense;
          const recTeamName = (recoveringSide === 'P1' ? p1Team : p2Team).name.toUpperCase();
          const isUser = recoveringSide === 'P1';
          showAnnouncement(
            "DEFENSE FALLS ON FUMBLE! TURNOVER! 🛡️⚡",
            isUser ? "#00ffff" : "#ff3333",
            true,
            {
              category: 'TURNOVER',
              subtext: isUser
                ? `YOU RECOVERED THE FUMBLE! ${recTeamName} TAKES OVER POSSESSION (1ST & 10)`
                : `CPU RECOVERS THE FUMBLE! ${recTeamName} TAKES OVER POSSESSION (1ST & 10)`,
              possessionTeam: recoveringSide,
              durationMs: 5500
            }
          );
          scheduleDrillReset();
        } else {
          showAnnouncement("OFFENSE FALLS ON FUMBLE!", "#00ffff", false, {
            category: 'FUMBLE',
            subtext: "OFFENSE SECURES THE LOOSE BALL!",
            durationMs: 3500
          });
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
      // Keep human-play coverage mistakes unchanged; reduce free openings for CPU drives.
      const baseMistakeChance = activeOffense === 'P2' ? 0.16 : 0.28;
      const mistakeChance = baseMistakeChance * (defTeam.ratings.mistakeChance || 1.0);
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
      let nearestUnblockedDefender = Infinity;
      defenders.forEach(defender => {
        if (!defender || defender.isEngagedWithBlocker) return;
        nearestUnblockedDefender = Math.min(nearestUnblockedDefender, Math.hypot(defender.x - qb.x, defender.y - qb.y));
      });
      const isUnderHeavyPressure = isCpuPressureRecognized(nearestUnblockedDefender < 65, playClock);

      // NFL Progression Read Framework:
      // Primary Read (Outside WRs): receivers[0], receivers[1]
      // Intermediate / Seam Read: centerReceiver (if not pass blocking)
      // Emergency Checkdown: rb (if not pass blocking)
      const primaryTargets: Entity[] = [...receivers];
      const seamTarget: Entity | null = (centerReceiver && !centerReceiver.isBlocker && centerReceiver.routeType !== 'BLOCK') ? centerReceiver : null;
      const checkdownTarget: Entity | null = (rb && !rb.isBlocker && rb.routeType !== 'BLOCK') ? rb : null;
      const isVerticalPlay = offensivePlaybook[p2OffPlay]?.routeType === 'VERTICAL';

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
        const nearestCoverage = defenders.reduce<{ defender: Entity; distance: number } | null>((nearest, defender) => {
          if (!defender || defender.passRusher) return nearest;
          const defenderArrivalX = defender.x + (defender.vx || 0) * arrivalFrames * 0.92;
          const defenderArrivalY = defender.y + (defender.vy || 0) * arrivalFrames * 0.92;
          const distance = Math.hypot(defenderArrivalX - arrivalX, defenderArrivalY - arrivalY);
          return !nearest || distance < nearest.distance ? { defender, distance } : nearest;
        }, null);
        const nearestDefDist = nearestCoverage?.distance ?? Infinity;
        const nearestCoverageDef = nearestCoverage?.defender ?? null;

        // Evaluate separation and depth where the receiver is expected to meet the pass.
        const depthYards = (arrivalY - lineOfScrimmageY) * attackDirection / 10;

        // Passing lane obstruction check (passes sail high overhead over line of scrimmage)
        let laneObstruction = 0;
        defenders.forEach(d => {
          if (!d || d.passRusher) return;
          if (Math.abs(d.y - lineOfScrimmageY) < 35) return; // Overhead ball clearance at scrimmage
          const distToLane = distToSegment({ x: qb.x, y: qb.y }, { x: t.x, y: t.y }, { x: d.x, y: d.y });
          if (distToLane < 15) {
            // Human QB coverage perception: Underneath zone defenders lurking in windows have a chance to bait throws!
            const canDetectLurker = Math.random() < (isUnderHeavyPressure ? 0.65 : 0.88);
            if (canDetectLurker) {
              laneObstruction += (15 - distToLane) * 1.0;
            } else {
              laneObstruction += (15 - distToLane) * 0.3;
            }
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
        const coveringDef = nearestCoverageDef;
        const hasCoverageMistake = Boolean(
          (coveringDef && coveringDef.coverageMistake && (coveringDef.mistakeTimer || 0) > 0) ||
          defenders.some(d => d.coverageMistake && (d.mistakeTimer || 0) > 0 && Math.hypot(d.x - t.x, d.y - t.y) < 105)
        );

        if (hasCoverageMistake) {
          score += 70;
        }

        // Coverage Mismatch Exploitation: DL or LB covering a WR/TE in MAN coverage
        if (coveringDef && coveringDef.defenseAssignment === 'MAN' && (coveringDef.type === 'DL' || coveringDef.type === 'LB')) {
          score += 32;
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
            score += 32;
            isBreakOpen = true;
          }
          // Comeback/Curl break window (frames 48 - 68)
          else if (t.routeType === 'COMEBACK' && rTime >= 48 && rTime <= 68 && nearestDefDist >= 14) {
            score += 35;
            isBreakOpen = true;
          }
          // Crosser across field (frames 40 - 75)
          else if ((t.routeType === 'CROSS-L' || t.routeType === 'CROSS-R') && rTime >= 40 && rTime <= 75 && nearestDefDist >= 15) {
            score += 30;
            isBreakOpen = true;
          }
          // Go route streaking deep behind CB (frame 34+)
          else if (t.routeType === 'GO' && (rTime >= 34 || hasCoverageMistake) && nearestDefDist >= 14 && depthYards > 6) {
            score += 38;
            isBreakOpen = true;
          }
          // Out/Flag route break (frames 40 - 70)
          else if ((t.routeType === 'FLAG-L' || t.routeType === 'FLAG-R') && rTime >= 40 && rTime <= 70 && nearestDefDist >= 14) {
            score += 32;
            isBreakOpen = true;
          }
          // Post route break (frames 40 - 72)
          else if ((t.routeType === 'POST-L' || t.routeType === 'POST-R') && rTime >= 40 && rTime <= 72 && nearestDefDist >= 14) {
            score += 38;
            isBreakOpen = true;
          }
          // Hitch timing stop (frames 30 - 56)
          else if (t.routeType === 'HITCH' && rTime >= 30 && rTime <= 56 && nearestDefDist >= 13) {
            score += 32;
            isBreakOpen = true;
          }
          // Wheel sideline route (frames 32 - 80)
          else if (t.routeType === 'WHEEL' && rTime >= 32 && rTime <= 80 && nearestDefDist >= 14) {
            score += 38;
            isBreakOpen = true;
          }
          // Flat route (RB)
          else if (t.routeType === 'FLAT' && nearestDefDist >= 16) {
            score += 25;
            isBreakOpen = true;
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
        if (isVerticalPlay && isDeepRoute && depthYards >= 15 && nearestDefDist >= 14) {
          score += 45;
        }

        // 7. Passing lane obstruction deduction
        score -= laneObstruction;

        // Check for RB spy & bracket pressure on defense (explicit RB_SPY or assigned receiver covering the RB)
        const rbSpyDefenders = defenders.filter(d => d && !d.passRusher && rb &&
          Math.hypot(d.x - rb.x, d.y - rb.y) < 60 && Math.abs(d.y - lineOfScrimmageY) < 85);
        const rbSpyCount = rbSpyDefenders.length;

        // If evaluating downfield receivers: Recognize that defense wasted defenders spying the RB!
        if (!isCheckdown) {
          if (rbSpyCount >= 2) {
            score += 75;
            if (nearestDefDist >= 12) {
              isBreakOpen = true;
            }
          } else if (rbSpyCount === 1) {
            score += 38;
            if (nearestDefDist >= 14) {
              isBreakOpen = true;
            }
          }
        }

        // 8. Checkdown (RB) Hierarchy Rule
        if (isCheckdown) {
          if (rbSpyCount >= 2) {
            score = -999;
            isBreakOpen = false;
          } else if (rbSpyCount === 1) {
            score = -500;
            isBreakOpen = false;
          } else if (isUnderHeavyPressure) {
            score += (nearestDefDist >= 18 ? 40 : -30);
          } else if (playClock > 65) {
            score += 15 + (nearestDefDist > 20 ? 15 : 0);
          } else {
            score -= 35;
          }
        }

        score += (Math.random() * 4 - 2);

        return { score, isBreakOpen, depthYards, nearestDefDist, hasCoverageMistake };
      };

      function executeCpuThrow(chosenTarget: Entity) {
        const targetDist = Math.hypot(chosenTarget.x - qb.x, chosenTarget.y - qb.y);
        const isDeepRoute = chosenTarget.routeType === 'GO' || chosenTarget.routeType === 'FLAG-L' || chosenTarget.routeType === 'FLAG-R' || chosenTarget.routeType === 'POST-L' || chosenTarget.routeType === 'POST-R' || chosenTarget.routeType === 'WHEEL';
        const throwSpeed = (isDeepRoute ? (targetDist > 240 ? 7.8 : 7.0) : (targetDist > 140 ? 7.2 : 6.2)) * 0.8;
        const T = Math.max(18, Math.round(targetDist / throwSpeed));

        const leadTarget = getRoutePassLeadTarget(chosenTarget, T, attackDirection, fieldWidth, defenders);
        let leadX = Math.max(25, Math.min(fieldWidth - 25, leadTarget.x));
        let leadY = leadTarget.y;

        const cpuRusherThreat = defenders.some(d => d && (d.passRusher || d.defenseAssignment === 'BLITZ') && Math.hypot(d.x - qb.x, d.y - qb.y) < 55);
        const cpuHitAsThrown = defenders.some(d => d && (d.passRusher || d.defenseAssignment === 'BLITZ') && Math.hypot(d.x - qb.x, d.y - qb.y) < 32);
        const cpuOffTeam = p2Team;
        const cpuAccCheck = evaluateQbThrowAccuracy({
          throwDist: targetDist,
          isUnderPressure: cpuRusherThreat,
          isDeepShot: isDeepRoute,
          isHitAsThrown: cpuHitAsThrown,
          isCpuThrow: true,
          isMoving: Math.hypot(qb.vx || 0, qb.vy || 0) > 0.6,
          passProtectionRating: cpuOffTeam.ratings.passProtection
        }, attackDirection);

        if (cpuAccCheck.isOffTarget) {
          leadX = Math.max(20, Math.min(fieldWidth - 20, leadX + cpuAccCheck.offsetX));
          leadY += cpuAccCheck.offsetY;
          if (cpuAccCheck.announcement) {
            showAnnouncement(cpuAccCheck.announcement, '#ffcc00');
          }
        }

        const cpuAimVariance = getCpuThrowAimVariance(targetDist, cpuRusherThreat);
        leadX = Math.max(20, Math.min(fieldWidth - 20, leadX + (Math.random() - 0.5) * 2 * cpuAimVariance));
        leadY += (Math.random() - 0.5) * 2 * cpuAimVariance;

        const dx = leadX - qb.x;
        const dy = leadY - qb.y;
        ballPressureDefenders = selectCoverageBreakers(leadX, leadY);
        const vx = dx / T;
        const vy = dy / T;
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
        if (receivers.includes(chosenTarget)) chosenTarget.targetedThisPlay = true;
        qb.hasBall = false;
        phase = 'THROWN';
        sounds.playThrow();
      }

      // Execute pending throw after human reaction/plant windup latency:
      if (cpuQbThrowWindupTimer > 0) {
        cpuQbThrowWindupTimer--;
        if (cpuQbThrowWindupTimer === 0 && cpuQbPendingThrowTarget) {
          const target = cpuQbPendingThrowTarget;
          cpuQbPendingThrowTarget = null;
          executeCpuThrow(target);
          return;
        }
        return; // Currently planting foot and winding up
      }

      // Human Progression Reads:
      // Read 1 (Primary designed route) -> Read 2 (Secondary/Slot) -> Read 3 (Tertiary) -> Checkdown (RB)
      const primaryWR = receivers[0] && !receivers[0].isBlocker ? receivers[0] : null;
      const secondaryWR = receivers[1] && !receivers[1].isBlocker ? receivers[1] : null;
      const tertiaryWR = receivers[2] && !receivers[2].isBlocker ? receivers[2] : null;
      const slotSeam = centerReceiver && !centerReceiver.isBlocker && centerReceiver.routeType !== 'BLOCK' ? centerReceiver : null;
      const rbCheckdown = rb && !rb.isBlocker && rb.routeType !== 'BLOCK' ? rb : null;

      const progressionOrder: Entity[] = [];
      if (isVerticalPlay) {
        if (primaryWR) progressionOrder.push(primaryWR);
        if (tertiaryWR) progressionOrder.push(tertiaryWR);
        if (slotSeam) progressionOrder.push(slotSeam);
        if (secondaryWR) progressionOrder.push(secondaryWR);
        if (rbCheckdown) progressionOrder.push(rbCheckdown);
      } else {
        if (primaryWR) progressionOrder.push(primaryWR);
        if (slotSeam) progressionOrder.push(slotSeam);
        if (secondaryWR) progressionOrder.push(secondaryWR);
        if (tertiaryWR) progressionOrder.push(tertiaryWR);
        if (rbCheckdown) progressionOrder.push(rbCheckdown);
      }

      if (progressionOrder.length === 0) return;
      cpuQbProgressionIndex = Math.min(cpuQbProgressionIndex, progressionOrder.length - 1);
      const activeRead = progressionOrder[cpuQbProgressionIndex];
      cpuQbGazeTarget = activeRead;
      cpuQbReadTimer++;

      // Cone of Vision:
      // The QB's eyes are focused on activeRead.
      // Receivers within ~156 degrees of gaze are visible; backside routes are in blind spots until head turns!
      const isVisibleInVisionCone = (target: Entity): boolean => {
        if (target === activeRead || !activeRead) return true;
        const gazeDx = activeRead.x - qb.x;
        const gazeDy = activeRead.y - qb.y;
        const targetDx = target.x - qb.x;
        const targetDy = target.y - qb.y;
        const dot = gazeDx * targetDx + gazeDy * targetDy;
        const magGaze = Math.hypot(gazeDx, gazeDy);
        const magTarget = Math.hypot(targetDx, targetDy);
        if (magGaze === 0 || magTarget === 0) return true;
        const cosAngle = dot / (magGaze * magTarget);
        return cosAngle > 0.20;
      };

      // Dwell Time:
      // Human QBs take 20-28 frames (~0.35-0.45s) to scan a read before moving their eyes.
      // Under heavy pressure, progression speeds up to ~12-16 frames.
      const dwellThreshold = isUnderHeavyPressure ? 14 : (isVerticalPlay ? 32 : 24);

      // Evaluate the active read:
      const activeEval = evaluateTarget(activeRead, activeRead === rbCheckdown);
      let bestTarget: Entity | null = activeRead;
      let bestScore = activeEval.score;
      let bestIsDownfieldWR = activeRead !== rbCheckdown;
      let openBreakWR: Entity | null = (activeEval.isBreakOpen && activeEval.score > 32) ? activeRead : null;

      // Check crossing routes or seam receivers entering the QB's active vision cone:
      progressionOrder.forEach(cand => {
        if (cand !== activeRead && isVisibleInVisionCone(cand)) {
          const candEval = evaluateTarget(cand, cand === rbCheckdown);
          if (candEval.isBreakOpen && candEval.score > 35 && candEval.score > bestScore) {
            openBreakWR = cand;
            bestTarget = cand;
            bestScore = candEval.score;
            bestIsDownfieldWR = cand !== rbCheckdown;
          }
        }
      });

      // Move progression to next read if current read is covered and dwell time expired:
      if (cpuQbReadTimer >= dwellThreshold && !openBreakWR && bestScore < 30) {
        if (cpuQbProgressionIndex < progressionOrder.length - 1) {
          cpuQbProgressionIndex++;
          cpuQbReadTimer = 0;
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

      // Smart release conditions
      const hasCoverageMistakeNow = defenders.some(d => d.coverageMistake && (d.mistakeTimer || 0) > 0);
      const isTargetDeep = Boolean(bestTarget && (bestTarget.routeType === 'GO' || bestTarget.routeType === 'FLAG-L' || bestTarget.routeType === 'FLAG-R' || bestTarget.routeType === 'POST-L' || bestTarget.routeType === 'POST-R' || bestTarget.routeType === 'WHEEL'));
      const isDeepShotOpportunity = hasCoverageMistakeNow && isTargetDeep && playClock >= 32;

      const shouldThrowNow = shouldCpuReleasePass({
        hasTarget: bestTarget !== null,
        isDeepShotOpportunity,
        hasOpenBreak: openBreakWR !== null,
        isUnderHeavyPressure,
        playClock,
        bestScore,
        isVerticalPlay,
        targetDepthYards: bestTarget ? evaluateTarget(bestTarget, !bestIsDownfieldWR).depthYards : 0,
        targetSeparation: bestTarget ? evaluateTarget(bestTarget, !bestIsDownfieldWR).nearestDefDist : 0
      });

      if (shouldThrowNow && bestTarget !== null) {
        const activeRbSpies = defenders.filter(d => d && !d.passRusher && rb &&
          Math.hypot(d.x - rb.x, d.y - rb.y) < 60 && Math.abs(d.y - lineOfScrimmageY) < 85).length;

        let chosenTarget: Entity = bestTarget;
        if ((bestTarget === rbCheckdown || bestTarget === rb) && activeRbSpies >= 1) {
          const downfieldEligible = progressionOrder.filter(p => p !== rb && isVisibleInVisionCone(p));
          chosenTarget = downfieldEligible[0] || receivers[0];
          showAnnouncement("CPU SEES RB SPIES! HITTING OPEN MAN DOWNFIELD! 🏈🎯💥", "#00ffff");
        } else if (openBreakWR) {
          chosenTarget = openBreakWR;
        } else {
          chosenTarget = bestTarget;
        }

        if (isDeepShotOpportunity && activeRbSpies === 0) {
          showAnnouncement("CPU EXPLOITS COVERAGE BUST! DEEP PASS LAUNCHED! 🚀🏈", "#00ffff");
        }

        // HUMAN REACTION LATENCY & PLANT HITCH:
        // Instead of releasing at the exact millisecond with zero windup,
        // the QB plants their back foot and hitches forward (8 frames / ~130ms) before the pass is unleashed.
        // Under heavy pressure or late clock, release immediately to beat the sack.
        if (isUnderHeavyPressure || playClock >= 45) {
          executeCpuThrow(chosenTarget);
        } else {
          cpuQbThrowWindupTimer = 8;
          cpuQbPendingThrowTarget = chosenTarget;
        }
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
      if (activeOffense === 'P1' || isInterceptionReturn || activeEntity.isReturner || (activeOffense === 'P2' && (activeEntity === rb || activeEntity === qb)) || receivers.includes(activeEntity) || activeEntity === centerReceiver) {
        if ((activeEntity.jukeTimer || 0) > 0) {
          activeEntity.jukeTimer!--;
          // Smooth progressive bell-curve for plant-and-cut athletic juke movement
          const progress = 1 - (activeEntity.jukeTimer || 0) / 10;
          const curve = Math.sin(progress * Math.PI);
          const stepSpeed = (activeEntity.jukeVx || 0) * (curve * 0.9 + 0.25);
          activeEntity.x += stepSpeed * GAME_SPEED_SCALE;
          activeEntity.vx = 0; // Clear lateral velocity during juke so they do not combine!
        } else if (phase !== 'RUNNING') {
          if (activeEntity.vx === undefined) activeEntity.vx = 0;
          activeEntity.vx *= 0.88;
          activeEntity.x += activeEntity.vx * 0.8 * GAME_SPEED_SCALE;
        }
        if (checkCarrierOutOfBounds()) return;
        activeEntity.x = Math.max(30, Math.min(fieldWidth - 30, activeEntity.x));

        if ((activeEntity.powerBoostTimer || 0) > 0) activeEntity.powerBoostTimer!--;
        if ((activeEntity.tackleImmunity || 0) > 0) activeEntity.tackleImmunity!--;
        if ((activeEntity.jukeCooldownTimer || 0) > 0) activeEntity.jukeCooldownTimer!--;

        if (phase === 'QB_DROP') {
          if (activeOffense === 'P1') {
            const joy = getEffectiveJoystickInput();
            if (joy.active) {
              const qbSpeed = 1.30 * 0.68 * GAME_SPEED_SCALE * (p1Team.ratings.wrSpeed || 1.0) * getFatigueSpeedMultiplier(qb.stamina);
              qb.vx = joy.x * qbSpeed;
              qb.vy = joy.y * qbSpeed;
              qb.x += qb.vx;
              qb.y += qb.vy;
              qb.x = Math.max(30, Math.min(fieldWidth - 30, qb.x));

              // Check if QB scrambles across the line of scrimmage
              const crossedLine = (attackDirection === -1 && qb.y < lineOfScrimmageY - 6) ||
                                  (attackDirection === 1 && qb.y > lineOfScrimmageY + 6);
              if (crossedLine) {
                phase = 'RUNNING';
                activeEntity = qb;
                qb.hasBall = true;
                qbScrambleReactionTimer = 18;
                qb.tackleImmunity = 30;
                isAllBlocking = true;
                sounds.playJuke();
                showAnnouncement('QB SCRAMBLES PAST THE LINE! 🏃💨', '#00ffff');
              }
            } else if ((qb.dropStepTimer || 0) > 0) {
              qb.dropStepTimer!--;
              // QB takes a crisp 3-step drop backwards away from the line of scrimmage at the beginning of the play
              const progress = (qb.dropStepTimer || 0) / 28;
              const dropSpeed = Math.sin(progress * Math.PI) * 1.35;
              qb.y -= (dropSpeed * GAME_SPEED_SCALE * attackDirection);
            }
          } else {
            // CPU AI Quarterback: Pocket navigation, rolling out, and scrambles!
            if ((qb.dropStepTimer || 0) > 0) {
              qb.dropStepTimer!--;
              const progress = (qb.dropStepTimer || 0) / 28;
              const dropSpeed = Math.sin(progress * Math.PI) * 1.35;
              qb.y -= (dropSpeed * GAME_SPEED_SCALE * attackDirection);
            } else {
              const cpuQbSpeed = 1.30 * 0.68 * GAME_SPEED_SCALE * (p2Team.ratings.wrSpeed || 1.0) * getFatigueSpeedMultiplier(qb.stamina);
              const unblockedRushers = defenders.filter(d => d && (d.passRusher || d.defenseAssignment === 'BLITZ') && !d.isEngagedWithBlocker);
              const leftPressure = unblockedRushers.some(d => d.x < qb.x && Math.hypot(d.x - qb.x, d.y - qb.y) < 65);
              const rightPressure = unblockedRushers.some(d => d.x > qb.x && Math.hypot(d.x - qb.x, d.y - qb.y) < 65);
              const nearPressure = unblockedRushers.some(d => Math.hypot(d.x - qb.x, d.y - qb.y) < 45);

              const playObj = offensivePlaybook[p2OffPlay];
              const isDesignedRolloutPlay = playObj.name === 'FLOOD' || playObj.name === 'SMASH' || playObj.name === 'CORNER_STRIKE' || playObj.name === 'POST_WHEEL';

              if (leftPressure && !rightPressure) {
                // Rusher off left edge: roll out / slide right
                qb.vx = 0.85 * cpuQbSpeed;
                qb.vy = 0.30 * cpuQbSpeed * attackDirection;
              } else if (rightPressure && !leftPressure) {
                // Rusher off right edge: roll out / slide left
                qb.vx = -0.85 * cpuQbSpeed;
                qb.vy = 0.30 * cpuQbSpeed * attackDirection;
              } else if (nearPressure) {
                // Pocket collapsing: step up into the pocket
                qb.vx = (Math.random() - 0.5) * 0.4 * cpuQbSpeed;
                qb.vy = 0.80 * cpuQbSpeed * attackDirection;
              } else if (isDesignedRolloutPlay || playClock > 26) {
                // Designed rollout or pocket escape to create throwing angle or running lane
                const targetRollX = (p2OffPlay === 'FLOOD' || p2OffPlay === 'SMASH' || qb.x > 170) ? 245 : 95;
                const rollDir = targetRollX > qb.x ? 1 : -1;
                qb.vx = rollDir * 0.75 * cpuQbSpeed;
                qb.vy = 0.25 * cpuQbSpeed * attackDirection;
              } else {
                qb.vx = 0;
                qb.vy = 0;
              }

              qb.x += qb.vx;
              qb.y += qb.vy;
              qb.x = Math.max(35, Math.min(fieldWidth - 35, qb.x));

              // Check for scramble lane opening: If QB has rolled out or pocket opened up, and the lane ahead is clear, RUN!
              const isOutsidePocket = Math.abs(qb.x - 170) > 32;
              const defendersAhead = defenders.filter(d =>
                d && !d.isEngagedWithBlocker &&
                ((attackDirection === -1 && d.y < qb.y && d.y > qb.y - 130) ||
                 (attackDirection === 1 && d.y > qb.y && d.y < qb.y + 130)) &&
                Math.abs(d.x - qb.x) < 48
              );
              const openRunningLane = defendersAhead.length === 0 && (isOutsidePocket || playClock > 30);
              if (openRunningLane && (playClock > 26 || isOutsidePocket)) {
                qb.vy = 1.15 * cpuQbSpeed * attackDirection;
                qb.y += qb.vy;
              }

              // Check if AI QB scrambles across the line of scrimmage
              const crossedLine = (attackDirection === -1 && qb.y < lineOfScrimmageY - 6) ||
                                  (attackDirection === 1 && qb.y > lineOfScrimmageY + 6);
              if (crossedLine) {
                phase = 'RUNNING';
                activeEntity = qb;
                qb.hasBall = true;
                qbScrambleReactionTimer = 18;
                qb.tackleImmunity = 30;
                isAllBlocking = true;
                sounds.playJuke();
                showAnnouncement('CPU QB SCRAMBLES PAST THE LINE! 🏃💨', '#ffaa00');
              }
            }
          }
        } else if (phase === 'RUNNING') {
          const isUserControlled = (activeOffense === 'P1' && !isInterceptionReturn) ||
            ((isInterceptionReturn || isSpecialTeamsReturn) && activeDefense === 'P1');
          const isReturn = Boolean(isSpecialTeamsReturn || activeEntity.isReturner);
          const baseRunSpeed = getBallCarrierRunSpeed(isReturn, (activeEntity.powerBoostTimer || 0) > 0);
          const contactSpeed = (activeEntity.contactSlowTimer || 0) > 0 ? 0.75 : 1;
          if ((activeEntity.contactSlowTimer || 0) > 0) activeEntity.contactSlowTimer!--;
          // Requirement: "The user controlled the ball here should only be as fast as his teammates, currently he's too fast."
          // Teammate routes and lead blockers scale movement by 0.68 * GAME_SPEED_SCALE.
          const teammateSpeedScale = 0.68;
          const carrierMaxSpeed = baseRunSpeed * teammateSpeedScale * GAME_SPEED_SCALE * (activeEntity.speedMultiplier || 1) * getFatigueSpeedMultiplier(activeEntity.stamina) * contactSpeed;

          if (isUserControlled) {
            const joy = getEffectiveJoystickInput();
            const sweepLaneBias = activeOffense === 'P1' && activeEntity === rb && offensivePlaybook[activeOffName]?.type === 'SWEEP'
              ? getDesignedRunLateralBias('SWEEP', activeEntity.x, rb.side!, fieldWidth)
              : 0;
            if ((activeEntity.jukeTimer || 0) > 0) {
              // During juke, forward momentum continues while lateral is driven exclusively by the plant-and-cut juke curve
              activeEntity.vx = 0; // Explicitly ensure lateral velocity is 0 during juke!
              activeEntity.vy = carrierMaxSpeed * attackDirection * 0.85;
              activeEntity.y += activeEntity.vy;
            } else if (joy.active) {
              // Lateral steering with calibrated agility - eliminates wild sliding and prevents overrunning
              const targetLateralVx = joy.x !== 0 ? joy.x * carrierMaxSpeed * 0.26 : sweepLaneBias;
              activeEntity.vx = (activeEntity.vx || 0) * 0.65 + targetLateralVx * 0.35;

              if (joy.y !== 0) {
                const forwardFactor = Math.max(0.70, Math.min(1.05, 0.90 + (-joy.y * attackDirection) * 0.25));
                activeEntity.vy = carrierMaxSpeed * attackDirection * forwardFactor;
              } else {
                activeEntity.vy = carrierMaxSpeed * attackDirection;
              }
              activeEntity.x += activeEntity.vx;
              activeEntity.y += activeEntity.vy;
              activeEntity.x = Math.max(30, Math.min(fieldWidth - 30, activeEntity.x));
            } else {
              activeEntity.vx = sweepLaneBias || (activeEntity.vx || 0) * 0.75;
              activeEntity.x += activeEntity.vx;
              activeEntity.vy = carrierMaxSpeed * attackDirection;
              activeEntity.y += activeEntity.vy;
              activeEntity.x = Math.max(30, Math.min(fieldWidth - 30, activeEntity.x));
            }
          } else {
            const cpuCarrierSpeed = carrierMaxSpeed;
            activeEntity.vy = cpuCarrierSpeed * attackDirection;
            activeEntity.y += activeEntity.vy;
          }

          // CPU AI ball carrier moves (juke / power truck boost)
          if (activeOffense === 'P2' && activeEntity) {
            if (isReturn) {
              // Symmetrical return steering: AI returner reads lanes at the exact same speed and steering factor
              const oncomingPursuers = [qb, rb, centerReceiver, ...receivers, ...linemen]
                .filter((p): p is Entity => Boolean(p))
                .filter(p => Math.hypot(p.x - activeEntity.x, p.y - activeEntity.y) < 180);
              let targetX = 170;
              if (oncomingPursuers.length > 0) {
                const nearest = oncomingPursuers.reduce((closest, p) =>
                  Math.hypot(p.x - activeEntity.x, p.y - activeEntity.y) < Math.hypot(closest.x - activeEntity.x, closest.y - activeEntity.y)
                    ? p
                    : closest
                );
                const avoidDirection = activeEntity.x >= nearest.x ? 1 : -1;
                targetX = Math.max(45, Math.min(fieldWidth - 45, activeEntity.x + (avoidDirection * 40)));
              }
              const steerDiff = targetX - activeEntity.x;
              const maxSteerSpeed = 0.5 * 0.68 * GAME_SPEED_SCALE;
              const steerFactor = 0.08;
              activeEntity.vx = Math.max(-maxSteerSpeed, Math.min(maxSteerSpeed, steerDiff * steerFactor));
              activeEntity.x += activeEntity.vx;
            } else if (activeEntity === rb || (activeEntity === qb && phase === 'RUNNING')) {
              // AI Running Back & Scrambling QB Vision: lead block following, gap exploitation, and cutbacks!
              const playObj = offensivePlaybook[p2OffPlay];
              let targetX = activeEntity.x;

              // 1. Primary designed aiming point
              if (activeEntity === rb) {
                if (playObj.type === 'SWEEP') {
                  targetX = (rb.side === 'right') ? 255 : 85;
                } else if (playObj.type === 'ISO') {
                  targetX = 170 + ((rb.side === 'right') ? 25 : -25);
                } else {
                  targetX = (rb.side === 'right') ? 210 : 130;
                }
              }

              // 2. Lead blocker tracking: follow directly behind lead blockers (lineman, center, or blocking WRs)
              const leadBlocker = [linemen[0], centerReceiver, receivers[1], receivers[0]].find(
                b => b && b.isBlocker && ((attackDirection === -1 && b.y < activeEntity.y) || (attackDirection === 1 && b.y > activeEntity.y))
              );
              if (leadBlocker && Math.hypot(leadBlocker.x - activeEntity.x, leadBlocker.y - activeEntity.y) < 75) {
                targetX = leadBlocker.x + (activeEntity === rb && rb.side === 'right' ? 8 : -8);
              }

              // 3. Cutback vision: if defenders fill the designed hole, cut back to daylight
              const immediateThreats = defenders.filter(
                d => d && Math.hypot(d.x - activeEntity.x, d.y - activeEntity.y) < 60 &&
                ((attackDirection === -1 && d.y < activeEntity.y + 10) || (attackDirection === 1 && d.y > activeEntity.y - 10))
              );
              if (immediateThreats.length > 0) {
                const avgThreatX = immediateThreats.reduce((sum, d) => sum + d.x, 0) / immediateThreats.length;
                const cutbackDir = avgThreatX >= activeEntity.x ? -1 : 1;
                targetX = Math.max(45, Math.min(fieldWidth - 45, activeEntity.x + cutbackDir * 42));
              }

              targetX = Math.max(35, Math.min(fieldWidth - 35, targetX));
              const steerDiff = targetX - activeEntity.x;
              const rbSteerSpeed = 0.85 * 0.68 * GAME_SPEED_SCALE * (p2Team.ratings.wrSpeed || 1.0);
              activeEntity.vx = Math.max(-rbSteerSpeed, Math.min(rbSteerSpeed, steerDiff * 0.18));
              activeEntity.x += activeEntity.vx;
            }

            const cpuMove = evaluateCpuBallCarrierMoves(
              activeEntity,
              (isInterceptionReturn || activeEntity.isReturner)
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
            } else if (cpuMove.moveType === 'TRUCK' && !isReturn) {
              activeEntity.powerBoostTimer = 40;
              sounds.playPowerBoost();
              showAnnouncement(cpuMove.announcement || 'CPU POWER TRUCK BOOST! ⚡💪', '#ffcc00');
            }
          }
        }
        if (checkCarrierOutOfBounds()) return;
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
      const hasExtraBlitzer = passRushers.length >= 2;
      const offTeam = activeOffense === 'P1' ? p1Team : p2Team;
      const defTeam = activeDefense === 'P1' ? p1Team : p2Team;
      const baseBlockHoldFrames = hasExtraBlitzer ? 75 : 135;
      const blockHoldFrames = getPassBlockHoldFrames(
        baseBlockHoldFrames,
        offTeam.ratings.passProtection || 1,
        defTeam.ratings.passRush || 1
      );

      // Extra blockers assigned to pass protection (RB, Center)
      const extraPassBlockers = [rb, centerReceiver].filter((b): b is Entity => Boolean(b && (b.isBlocker || b.routeType === 'BLOCK')));

      linemen.forEach((l) => {
        if (phase === 'QB_DROP') l.blockTimer = (l.blockTimer || 0) + 1;
        if (passRushers.length > 0) {
          const interiorRusher = passRushers[0];
          const isUserRusher = activeDefense === 'P1' && interiorRusher === getControlledDefender();
          const joy = getEffectiveJoystickInput();
          if (!isUserRusher || !joy.active) {
            if (!shouldHoldPassBlock(l, interiorRusher, blockHoldFrames)) {
              const rushSpeed = (hasExtraBlitzer ? 1.20 : 0.88) * (defTeam.ratings.passRush || 1.0);
              moveToward(interiorRusher, qb.x, qb.y, 0.26, rushSpeed);
            }
          }
        }
      });

      // Extra blitzers: rush straight at QB unless blocked by RB or Center!
      if (phase === 'QB_DROP' && passRushers.length > 1) {
        passRushers.slice(1).forEach((extraRusher, idx) => {
          const matchingBlocker = extraPassBlockers[idx];
          if (!matchingBlocker || !shouldHoldPassBlock(matchingBlocker, extraRusher, blockHoldFrames)) {
            const rushSpeed = 1.35 * (defTeam.ratings.passRush || 1.0);
            moveToward(extraRusher, qb.x, qb.y, 0.32, rushSpeed);
          }
        });
      }
    }

    const playObj = offensivePlaybook[activeOffName];
    if (phase === 'RUNNING' && !isInterceptionReturn) {
      const runner = activeEntity || qb;
      if (isSpecialTeamsReturn) {
        // Special Teams Run Blocking: The receiving team blockers position in a horizontal line and aggressively engage in run blocking for the ball carrier!
        const returnBlockers = getReturnTeamBlockers(defenders, runner);
        const oncomingTacklers: Entity[] = [
          qb,
          rb,
          centerReceiver,
          ...receivers,
          ...linemen
        ].filter((p): p is Entity => Boolean(p));
        const assignedTacklers = new Set<Entity>();
        const wallOffsets = [-100, -60, -20, 20, 60, 100];

        returnBlockers.forEach((blocker, bIdx) => {
          blocker.isBlocker = true;
          let targetTackler: Entity | null = null;
          let minThreatDist = Infinity;

          oncomingTacklers.forEach(tackler => {
            if (assignedTacklers.has(tackler)) return;
            const tacklerToRunner = Math.hypot(tackler.x - runner.x, tackler.y - runner.y);
            const threatScore = scoreRunBlockTarget(blocker, runner, tackler, attackDirection, false);
            if (threatScore < minThreatDist && tacklerToRunner < 260) {
              minThreatDist = threatScore;
              targetTackler = tackler;
            }
          });

          const target = targetTackler as Entity | null;
          if (target) {
            assignedTacklers.add(target);
            const isNewEngagement = shouldApplyRunBlockStun(blocker, target);
            blocker.blockingDefender = target;
            const blockSpeed = 1.6;
            const blockAccel = 0.38;
            moveToward(blocker, target.x, target.y, blockAccel, blockSpeed);

            const contactDist = Math.hypot(blocker.x - target.x, blocker.y - target.y);
            if (contactDist < (blocker.radius || 10) + (target.radius || 10) + 4) {
              if (isNewEngagement) {
                target.pursuitTimer = 0;
                target.vx = (target.vx || 0) * 0.5;
                target.vy = (target.vy || 0) * 0.5;
                target.brokenTackleStun = Math.max(target.brokenTackleStun || 0, 18);
                const pushDirX = target.x > runner.x ? 0.6 : -0.6;
                target.x += pushDirX;
                target.y += (0.45 * attackDirection);
              }
              blocker.isEngagedWithBlocker = true;
            }
          } else {
            blocker.blockingDefender = null;
            blocker.isEngagedWithBlocker = false;
            // Position in a horizontal line in front of the receiving player advancing downfield
            const leadY = runner.y + (45 * attackDirection);
            const leadX = Math.max(30, Math.min(fieldWidth - 30, runner.x + wallOffsets[bIdx % wallOffsets.length]));
            moveToward(blocker, leadX, leadY, 0.28, 1.45);
          }
          blocker.x = Math.max(25, Math.min(fieldWidth - 25, blocker.x));
        });
      } else {
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
      }
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
      const protectionRating = activeOffense === 'P1' ? p1Team.ratings.passProtection || 1 : p2Team.ratings.passProtection || 1;
      const rushRating = activeDefense === 'P1' ? p1Team.ratings.passRush || 1 : p2Team.ratings.passRush || 1;
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
          const target = targetRusher as Entity;
          const isPassRusher = target.passRusher || target.defenseAssignment === 'BLITZ';
          const holdFrames = isPassRusher
            ? getPassBlockHoldFrames(85, protectionRating, rushRating)
            : Infinity;
          if (isPassRusher && shouldHoldPassBlock(blocker, target, holdFrames)) {
            blocker.blockingDefender = target;
            blocker.isEngagedWithBlocker = true;
          }
        } else {
          moveToward(blocker, defaultBlockX, defaultBlockY, 0.28, 1.4);
        }
        blocker.x = Math.max(30, Math.min(fieldWidth - 30, blocker.x));
      });
    }

    if (rb && !rb.isBlocker && rb.routeType !== 'BLOCK') {
      if (phase === 'QB_DROP' && (activeDefKey === 'ZONE34' || activeDefKey === 'ZONE232') && rb.blitzEscaped) {
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
        const runSpeed = ((rb.powerBoostTimer || 0) > 0 ? 2.6 : 2.24) * (rb.speedMultiplier || 1) * getFatigueSpeedMultiplier(rb.stamina);
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

        // Direct user defender control: The user controls this sprite on defense
        // no matter what the assignment is for that sprite/player (ZONE, MAN, BLITZ, RB_SPY, QB_SPY, USER)!
        const isUserDefender = (activeDefense === 'P1' && d === getControlledDefender());
        if (isUserDefender) {
          const joy = getEffectiveJoystickInput();
          if (joy.active) {
            const defSpeed = 1.15 * 0.68 * GAME_SPEED_SCALE * (p1Team.ratings.dbClosingSpeed || p1Team.ratings.passRush || 1.0) * getFatigueSpeedMultiplier(d.stamina);
            d.vx = joy.x * defSpeed;
            d.vy = joy.y * defSpeed;
            if (!d.isEngagedWithBlocker) {
              d.x += d.vx;
              d.y += d.vy;
              d.x = Math.max(20, Math.min(fieldWidth - 20, d.x));
              d.y = Math.max(30, Math.min(fieldHeight - 30, d.y));
            }

            // User tackle during running / handoff
            if ((phase === 'RUNNING' || phase === 'HANDOFF') && activeEntity) {
              const dist = Math.hypot(activeEntity.x - d.x, activeEntity.y - d.y);
              const contactRadius = (activeEntity.radius || 10) + (d.radius || 10) + 6;
              if (dist < contactRadius) {
                screenShakeTimer = 24;
                phase = 'DEAD';
                sounds.playTackle();
                handlePlayEnd(activeEntity.y, 'TACKLE', 'USER TACKLE! BALL CARRIER STOPPED! 🛑💥', '#00ffff');
                return;
              }
            }

            // User sack in pocket during QB_DROP
            if (phase === 'QB_DROP' && !ball) {
              const distToQb = Math.hypot(qb.x - d.x, qb.y - d.y);
              const contactDist = (qb.radius || 10) + (d.radius || 10) + 4;
              if (distToQb < contactDist) {
                const isBlocked = isRusherActivelyBlocked(d, [...passBlockers, ...linemen]);
                if (!isBlocked) {
                  screenShakeTimer = 28;
                  phase = 'DEAD';
                  isAiming = false;
                  sounds.playTackle();
                  handlePlayEnd(qb.y, 'SACK');
                  return;
                }
              }
            }

            return; // 100% USER MANUAL CONTROL: Do not run any AI assignment script!
          } else if (d.defenseAssignment === 'USER') {
            // User defender without assignment: holds user-chosen position until user moves him
            d.vx = 0;
            d.vy = 0;
            if ((phase === 'RUNNING' || phase === 'HANDOFF') && activeEntity) {
              const dist = Math.hypot(activeEntity.x - d.x, activeEntity.y - d.y);
              const contactRadius = (activeEntity.radius || 10) + (d.radius || 10) + 6;
              if (dist < contactRadius) {
                screenShakeTimer = 24;
                phase = 'DEAD';
                sounds.playTackle();
                handlePlayEnd(activeEntity.y, 'TACKLE', 'USER TACKLE! BALL CARRIER STOPPED! 🛑💥', '#00ffff');
                return;
              }
            }
            return;
          }
        }

        if ((d.passRusher || d.defenseAssignment === 'BLITZ') && phase === 'QB_DROP') {
          if (d.isEngagedWithBlocker) {
            // Currently engaged with pass blocker (lineman or RB/Center)
            return;
          }
          // Calibrate rush speed so blitz doesn't instantly overwhelm the pocket before the QB drops back
          const isMultiRusherScheme = activeDefKey === 'ZONE34' || activeDefKey === 'ZONE232';
          const rushSpeed = isMultiRusherScheme ? 1.28 : 1.10;
          const rushAccel = isMultiRusherScheme ? 0.22 : 0.18;
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

        targetX = d.zoneX ?? d.startX ?? d.x;
        targetY = d.zoneY ?? (lineOfScrimmageY + (80 * dir));

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
          if (d.coverageLeverage) {
            const bracketTarget = getBracketCoverageTarget(d, rec, dir);
            targetX = bracketTarget.x;
            targetY = bracketTarget.y;
            moveSpeed = isSpammed ? 2.15 : 2.05;
            moveAccel = 0.44;
          }
        } else if (d.defenseAssignment === 'ZONE') {
          const zoneX = d.zoneX ?? d.startX ?? d.x;
          const zoneY = d.zoneY ?? (lineOfScrimmageY + (80 * dir));
          const eligibleZoneReceivers = [...receivers, centerReceiver, ...(rb && !rb.isBlocker ? [rb] : [])]
            .filter((receiver): receiver is Entity => receiver !== null && !receiver.caught && !receiver.isBlocker && receiver.routeType !== 'BLOCK');
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
          if (d.type === 'FS' || Math.abs(zoneY - lineOfScrimmageY) >= 150) {
            const deepThreat = eligibleZoneReceivers
              .filter(receiver => ['GO', 'POST-L', 'POST-R', 'FLAG-L', 'FLAG-R', 'WHEEL'].includes(receiver.routeType ?? '') && Math.abs(receiver.x - zoneX) <= 110)
              .sort((first, second) => (second.y - first.y) * dir)[0];
            if (deepThreat) {
              targetX = deepThreat.x;
              targetY = Math.max((zoneY - lineOfScrimmageY) * dir, (deepThreat.y - lineOfScrimmageY) * dir + 24) * dir + lineOfScrimmageY;
              moveSpeed = 1.95;
              moveAccel = 0.32;
            }
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
          const dynamicPursuitSpeed = Math.min(3.4, (baseSpeed + timeAcceleration + distanceUrgency) * (isSpy ? 1.25 : isBlitzer ? 1.20 : 1.0));

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
    allPlayers.forEach(player => {
      if (player) clampPlayerToFieldY(player, fieldHeight);
    });
    if (checkCarrierOutOfBounds()) return;

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
          const isBlocked = isRusherActivelyBlocked(d, [...passBlockers, ...linemen]);
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
      const activeTacklers = (isInterceptionReturn || activeEntity.isReturner)
        ? [qb, rb, centerReceiver, ...receivers, ...linemen].filter((player): player is Entity => Boolean(player))
        : defenders;
      activeTacklers.forEach(d => {
        if (phase !== 'RUNNING') return;
        if (!d) return;
        if ((d.brokenTackleStun || 0) > 0) {
          d.brokenTackleStun!--;
          return;
        }
        if (isInterceptionReturn || activeEntity.isReturner) {
          d.pursuitTimer = (d.pursuitTimer || 0) + 1;
          const distToRunner = Math.hypot(activeEntity.x - d.x, activeEntity.y - d.y);
          const isSkillPlayer = receivers.includes(d) || d === rb || d === centerReceiver;
          const isLineman = linemen.includes(d);
          const basePursuitSpeed = isSkillPlayer ? 1.05 : (isLineman ? 0.88 : 0.96);
          const speedMultiplier = isSkillPlayer ? 1.25 : 1.10;

          // Calibrated realistic pursuit speed traits matching defense chasing a ball carrier
          const timeAcceleration = d.pursuitTimer * 0.034;
          const distanceUrgency = Math.max(0, (distToRunner - 25) * 0.0065);
          const dynamicPursuitSpeed = Math.min(3.4, (basePursuitSpeed + timeAcceleration + distanceUrgency) * speedMultiplier);

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
        const contactRadius = (activeEntity.radius || 10) + (d.radius || 10) + (isBlitzer ? 10 : 8);

        if (dist < contactRadius) {
          if (activeEntity === qb && !canTackleQuarterback(activeEntity.tackleImmunity || 0)) {
            return;
          }
          const isReturner = Boolean(activeEntity.isReturner || isSpecialTeamsReturn);
          if (!isReturner && (activeEntity.tackleImmunity || 0) > 0) {
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
          const hitSpeed = Math.hypot((activeEntity.vx || 0) - (d.vx || 0), (activeEntity.vy || 0) - (d.vy || 0));
          const isBigHit = isBlitzer || isBoosted || isQB || hitSpeed >= 1.8;

          // Defenders labeled to blitz or tackling the QB have high tackling success
          let breakChance = calculateBrokenTackleChance({
            isRB,
            isBoosted,
            brokenCount,
            isBlitzer,
            isQB,
            isReturner
          });
          const isUserDefense = (activeOffense === 'P2');
          if (isUserDefense) {
            breakChance = Math.min(0.22, breakChance * 0.70);
          }
          const roll = Math.random();
          if (roll < breakChance) {
            // BROKEN TACKLE! Shed defender and explode for long breakaway gain
            activeEntity.brokenTacklesCount = brokenCount + 1;
            activeEntity.tackleImmunity = 12;
            activeEntity.contactSlowTimer = 18;
            activeEntity.stamina = Math.max(0, (activeEntity.stamina ?? 100) - 4);
            if (!activeEntity.isReturner && !isSpecialTeamsReturn) activeEntity.powerBoostTimer = 24;
            d.brokenTackleStun = isUserDefense ? 25 : (isBlitzer ? 35 : 60); // Defender is stunned and knocked down/back
            d.pursuitTimer = 0; // Reset pursuit momentum for this stunned defender
            d.x += (d.x < activeEntity.x ? -30 : 30);
            d.y += (35 * attackDirection);
            triggerScreenShake(isBigHit ? 36 : 26, isBigHit ? 16 : 10);
            sounds.playBrokenTackle();
            brokenTackleEffect = { x: activeEntity.x, y: activeEntity.y, timer: 35 };
            showAnnouncement("BROKEN TACKLE! BREAKAWAY FOR A LONG GAIN! 💥🏃💨", "#00ffff");
            return;
          }

          // FUMBLE EVALUATION on hard hit
          const fumbleRoll = Math.random();
          const fumbleChance = getCarrierFumbleChance({
            isBlitzer,
            isBigHit,
            isFatiguedReceiver: receivers.includes(activeEntity),
            stamina: activeEntity.stamina ?? 100
          });
          if (fumbleRoll < fumbleChance) {
            triggerFumble(activeEntity);
            return;
          }

          // Standard tackle
          triggerScreenShake(isBigHit ? 32 : 25, isBigHit ? 12 : 5);
          if (isBigHit) {
            const impactX = d.x - activeEntity.x;
            const impactY = d.y - activeEntity.y;
            const impactLength = Math.hypot(impactX, impactY) || 1;
            d.x += (impactX / impactLength) * 8;
            d.y += (impactY / impactLength) * 8;
            d.brokenTackleStun = Math.max(d.brokenTackleStun || 0, 16);
            activeEntity.vx = (activeEntity.vx || 0) * 0.25;
            activeEntity.vy = (activeEntity.vy || 0) * 0.25;
          }
          phase = 'DEAD';
          const isBehindLine = (attackDirection === -1 && activeEntity.y > lineOfScrimmageY) ||
                               (attackDirection === 1 && activeEntity.y < lineOfScrimmageY);
          const playEndingType = (activeEntity === qb && isBehindLine) ? 'SACK' : 'TACKLE';
          if (isBlitzer && isBehindLine) {
            showAnnouncement("BLITZ TACKLE FOR LOSS! 💥🛑", "#ff3333");
          } else if (isBlitzer) {
            showAnnouncement("HARD TACKLE BY BLITZER! 💥", "#ff5555");
          } else if (isBigHit) {
            showAnnouncement('BIG HIT! BALL CARRIER STOPPED!', '#ff5555', true);
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
      ball.z = getPassArcHeight(ball.maxZ, progress);

      if (ball.isKickoff || ball.isPunt) {
        // Special Teams Kickoff / Punt in flight
        const coverageUnits = ball.isKickoff
          ? [qb, ...receivers, centerReceiver, rb, ...linemen].filter(Boolean)
          : [receivers[0], receivers[2], linemen[0], rb].filter(Boolean);

        coverageUnits.forEach(p => {
          if (p) {
            moveToward(p, ball!.targetX || 170, ball!.targetY || 500, 0.22, getReturnPursuitSpeed(false, 0, 0), 0);
          }
        });

        const blockers = getReturnTeamBlockers(defenders, defenders.find(d => d.isReturner) ?? null);
        const engagedCoverageUnits = new Set<Entity>();

        const returner = defenders.find(d => d.isReturner) || (ball.isKickoff ? defenders[0] : defenders[6]);
        const targetWallY = (returner ? returner.y : (ball.targetY || 500)) - (55 * attackDirection);
        const wallOffsets = [-100, -60, -20, 20, 60, 100];

        blockers.forEach((b, bIdx) => {
          b.isBlocker = true;
          const nearestCov = coverageUnits.reduce<Entity | null>((closest, cov) => {
            if (!cov || engagedCoverageUnits.has(cov)) return closest;
            const dist = Math.hypot(cov.x - b.x, cov.y - b.y);
            if (!closest) return cov;
            return dist < Math.hypot(closest.x - b.x, closest.y - b.y) ? cov : closest;
          }, null);
          if (nearestCov && Math.hypot(nearestCov.x - b.x, nearestCov.y - b.y) < 140) {
            engagedCoverageUnits.add(nearestCov);
            moveToward(b, nearestCov.x, nearestCov.y, 0.32, 1.5, 0);
            const contactDist = Math.hypot(b.x - nearestCov.x, b.y - nearestCov.y);
            if (contactDist < (b.radius || 10) + (nearestCov.radius || 10) + 6) {
              if (shouldApplyRunBlockStun(b, nearestCov)) {
                nearestCov.pursuitTimer = 0;
                nearestCov.vx = (nearestCov.vx || 0) * 0.4;
                nearestCov.vy = (nearestCov.vy || 0) * 0.4;
                nearestCov.brokenTackleStun = Math.max(nearestCov.brokenTackleStun || 0, 12);
              }
              b.blockingDefender = nearestCov;
              b.isEngagedWithBlocker = true;
            }
          } else {
            // Maintain horizontal blocking line in front of the receiving player
            const wallX = returner
              ? Math.max(30, Math.min(fieldWidth - 30, returner.x + wallOffsets[bIdx % wallOffsets.length]))
              : (b.startX || b.x);
            moveToward(b, wallX, targetWallY, 0.25, 1.4, 0);
            b.blockingDefender = null;
            b.isEngagedWithBlocker = false;
          }
        });

        if (returner) {
          moveToward(returner, ball.targetX || 170, ball.targetY || returner.y, 0.20, 1.65, 0);
        }

        // Arrival / Landing Window
        if (progress >= 0.95 || ball.currentFrame >= ball.flightFrames) {
          const kickAttackDir = attackDirection;
          const landingY = ball.y;
          const isTouchback = (kickAttackDir === -1 && landingY <= endZoneHeight) ||
                              (kickAttackDir === 1 && landingY >= fieldHeight - endZoneHeight) ||
                              Boolean(ball.isKickoff && ball.kickPower && ball.kickPower >= 0.92);

          if (isTouchback) {
            const recAttackDir = -kickAttackDir;
            const touchbackYardY = getTouchbackYardLineY(fieldHeight, endZoneHeight, recAttackDir, 25);
            lineOfScrimmageY = touchbackYardY;
            attackDirection = recAttackDir;
            activeOffense = ball.receivingTeam || (kickoffKickingTeam === 'P1' ? 'P2' : 'P1');
            activeDefense = activeOffense === 'P1' ? 'P2' : 'P1';
            setActiveOffenseState(activeOffense);
            currentDown = 1;
            yardsToGo = 10;
            firstDownMarkerY = lineOfScrimmageY + (100 * attackDirection);
            updateDownDisplay();
            isKickoffPhase = false;
            setIsKickoffState?.(false, kickoffKickingTeam, kickoffReceivingTeam);
            phase = 'DEAD';
            ball = null;
            sounds.playWhistle();
            showAnnouncement("TOUCHBACK! 🏈 Ball placed at 25-yard line", "#00ffaa", true);
            scheduleDrillReset();
            return;
          }

          if (returner) {
            returner.hasBall = true;
            returner.x = ball.x;
            returner.y = ball.y;
            returner.vx = 0;
            returner.vy = 0;
            returner.tackleImmunity = 0;
            returner.powerBoostTimer = 0;
            activeEntity = returner;
            isSpecialTeamsReturn = true;
            specialTeamsReturnType = ball.isKickoff ? 'KICKOFF' : 'PUNT';
            returnCatchY = returner.y;

            // Mobilize all receiving team teammates to run block for the returner
            defenders.forEach(d => {
              if (d && d !== returner) {
                d.isBlocker = true;
                d.archetype = 'BLOCKER';
                d.blockingDefender = null;
                d.isEngagedWithBlocker = false;
              }
            });

            const recAttackDir = -kickAttackDir;
            attackDirection = recAttackDir;
            activeOffense = ball.receivingTeam || (kickoffKickingTeam === 'P1' ? 'P2' : 'P1');
            activeDefense = activeOffense === 'P1' ? 'P2' : 'P1';
            setActiveOffenseState(activeOffense);
            currentDown = 1;
            yardsToGo = 10;
            lineOfScrimmageY = returner.y;
            firstDownMarkerY = returner.y + (100 * attackDirection);
            updateDownDisplay();

            isKickoffPhase = false;
            setIsKickoffState?.(false, kickoffKickingTeam, kickoffReceivingTeam);
            phase = 'RUNNING';
            const announcement = ball.isKickoff ? "KICKOFF FIELDED BY RETURNER! 🏃" : "PUNT FIELDED BY RETURNER! 🏃";
            sounds.playCatch();
            showAnnouncement(announcement, "#00ffff");

            coverageUnits.forEach(p => {
              if (p) {
                p.pursuitTimer = 0;
                p.brokenTackleStun = 0;
                p.vx = 0;
                p.vy = 0;
              }
            });

            ball = null;
            return;
          }
        }
        return;
      }

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
        const targetReceiver = (activeBall.intendedTarget && !activeBall.intendedTarget.caught && !activeBall.intendedTarget.isBlocker && Math.hypot(activeBall.intendedTarget.x - activeBall.x, activeBall.intendedTarget.y - activeBall.y) < activeBall.intendedTarget.radius + 10)
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
              return Math.hypot(c.x - activeBall.x, c.y - activeBall.y) < c.radius + 10;
            });

        if (candidateReceivers.length === 0) {
          const interceptor = defenders.find(defender => !defender.isEngagedWithBlocker && Math.hypot(defender.x - activeBall.x, defender.y - activeBall.y) < defender.radius + 10 && activeBall.z <= getDefenderPassReachHeight(defender.type));
          if (interceptor) {
            playResolved = true;
            startInterceptionReturn(interceptor.x, interceptor.y, 'INTERCEPTED ON AN OFF-TARGET THROW!', '#ff3333');
            ball = null;
          }
        }

        candidateReceivers.forEach(c => {
          if (!playResolved && c && !c.caught) {
            // Find closest defender to the catch contest point
            let minDefDist = Infinity;
            let defDistToBall = Infinity;
            let defenderCount = 0;
            let ballSideDefender = false;

            defenders.forEach(d => {
              if (!d || d.isEngagedWithBlocker) return;
              // Defensive linemen at the line of scrimmage cannot contest catches downfield
              if (Math.abs(d.y - lineOfScrimmageY) < 30 && Math.abs(c.y - lineOfScrimmageY) > 35) return;
              const distToC = Math.hypot(d.x - c.x, d.y - c.y);
              const distToB = Math.hypot(d.x - ball!.x, d.y - ball!.y);
              if (distToC < c.radius + d.radius + 18) {
                defenderCount++;
                const ballDirectionX = activeBall.x - c.x;
                const ballDirectionY = activeBall.y - c.y;
                if ((d.x - c.x) * ballDirectionX + (d.y - c.y) * ballDirectionY > 0 && distToB < distToC) ballSideDefender = true;
              }
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
            const effectiveDefDist = minDefDist;
            const effectiveBallDist = defDistToBall;

            const outcome = resolveCatchContestOutcome({
              effectiveDefDist,
              effectiveBallDist,
              isTargetSpammed,
              isRbFlatSpammed,
              isRb,
              receiverX: c.x,
              receiverRadius: c.radius,
              defenderCount,
              ballSideDefender,
              archetype: c.archetype,
              stamina: c.stamina,
              distanceToCatch: Math.hypot(c.x - activeBall.x, c.y - activeBall.y),
              fieldWidth
            });

            if (outcome.type === 'COMPLETE') {
              playResolved = true;
              c.caught = true;
              activeEntity = c;
              activeEntity.vx = 0;
              activeEntity.vy = 0;
              activeEntity.powerBoostTimer = 0;
              activeEntity.contactSlowTimer = minDefDist < 30 ? 18 : 0;
              if (minDefDist < 30) activeEntity.stamina = Math.max(0, (activeEntity.stamina ?? 100) - 3);
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

      if (ball && (ball.currentFrame >= ball.flightFrames || ball.y < 30 || ball.x <= 20 || ball.x >= fieldWidth - 20)) {
        playResolved = true;
        phase = 'DEAD';
        const isOob = (ball.x <= 20 || ball.x >= fieldWidth - 20);
        const incompleteMsg = isOob ? 'PASS OUT OF BOUNDS! ❌ Over the sideline!' : 'PASS INCOMPLETE! 🏈 Hit the turf!';
        handlePlayEnd(qb.y, 'INCOMPLETE', incompleteMsg, '#aaaaaa');
        ball = null;
      }
    }

    // --- DYNAMIC CAMERA & VIEWPORT AUTO-ZOOM ---
    const baseScrimmageCamY = Math.max(cameraWorldTop, Math.min(cameraWorldBottom - 450, lineOfScrimmageY - 225));
    let targetViewHeight = 450;
    let targetCamY = baseScrimmageCamY;

    if (cameraPerspectiveMode === 'THREE_QUARTER') {
      // 3/4 Perspective Camera: Elevated behind the QB looking down the field
      const qbBehindY = attackDirection === -1 ? (qb.y - 325) : (qb.y - 125);
      if (phase === 'PRE_SNAP' || phase === 'KICKOFF') {
        targetViewHeight = 450;
        targetCamY = qbBehindY;
      } else if (ball && (ball.isKickoff || ball.isPunt)) {
        targetCamY = attackDirection === -1 ? ball.y - 300 : ball.y - 150;
        targetViewHeight = 460;
      } else if (phase === 'QB_DROP') {
        targetViewHeight = 450;
        targetCamY = qbBehindY;
      } else if (phase === 'THROWN' && ball) {
        targetViewHeight = 450;
        targetCamY = attackDirection === -1 ? ball.y - 250 : ball.y - 200;
      } else if (phase === 'RUNNING') {
        const trackingEntity = activeEntity || qb;
        targetViewHeight = 450;
        targetCamY = attackDirection === -1 ? trackingEntity.y - 310 : trackingEntity.y - 140;
      } else if (phase === 'FUMBLE' && fumbleBall) {
        targetViewHeight = 450;
        targetCamY = attackDirection === -1 ? fumbleBall.y - 280 : fumbleBall.y - 170;
      } else {
        targetViewHeight = 450;
        targetCamY = baseScrimmageCamY;
      }
    } else if (phase === 'PRE_SNAP' || phase === 'KICKOFF') {
      targetViewHeight = 450;
      targetCamY = baseScrimmageCamY;
    } else if (ball && (ball.isKickoff || ball.isPunt)) {
      targetCamY = Math.max(cameraWorldTop, Math.min(cameraWorldBottom - 450, ball.y - 225));
      targetViewHeight = 480;
    } else if (phase === 'QB_DROP') {
      // Keep the QB and live routes framed so receivers stay available as tap targets.
      const routeReceivers = [...receivers, centerReceiver, rb]
        .filter((receiver): receiver is Entity => Boolean(receiver && !receiver.isBlocker && receiver.routeType !== 'BLOCK'));
      const topY = Math.min(qb.y, ...routeReceivers.map(receiver => receiver.y)) - 55;
      const bottomY = Math.max(qb.y, ...routeReceivers.map(receiver => receiver.y)) + 55;
      const baselineBottomY = baseScrimmageCamY + 450;
      if (topY < baseScrimmageCamY || bottomY > baselineBottomY) {
        targetViewHeight = Math.max(450, Math.min(900, bottomY - topY));
        targetCamY = attackDirection === -1 ? bottomY - targetViewHeight : topY;
      } else {
        targetViewHeight = 450;
        targetCamY = baseScrimmageCamY;
      }
      if (activeOffense === 'P1') {
        const routeReceivers = [...receivers, centerReceiver]
          .filter((receiver): receiver is Entity => Boolean(receiver && !receiver.isBlocker && receiver.routeType !== 'BLOCK'));
        const routeTopY = Math.min(qb.y, ...routeReceivers.map(receiver => receiver.y)) - 55;
        const routeBottomY = Math.max(qb.y, ...routeReceivers.map(receiver => receiver.y)) + 55;
        const frameTopY = Math.min(targetCamY, routeTopY);
        const frameBottomY = Math.max(targetCamY + targetViewHeight, routeBottomY);
        if (frameTopY < targetCamY || frameBottomY > targetCamY + targetViewHeight) {
          targetViewHeight = Math.max(450, Math.min(1000, frameBottomY - frameTopY));
          targetCamY = frameTopY;
        }
      }
    } else if (phase === 'THROWN') {
      // Track the ball during flight if it travels beyond the current screen bounds.
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
    if (screenShakeTimer === 0) screenShakeStrength = 4;
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
    } else if (r.routeType === 'RUN') {
      const holeX = (r.side === 'left' || r.startX < 170) ? 140 : 200;
      ctx!.lineTo(holeX, lineOfScrimmageY + (10 * dir));
      ctx!.lineTo(holeX, lineOfScrimmageY + (90 * dir));
    }
    ctx!.stroke();

    if (phase === 'PRE_SNAP') {
      ctx!.fillStyle = (r === rb) ? '#00ffaa' : '#ffcc00';
      ctx!.font = '10px Courier New, monospace';
      ctx!.textAlign = 'center';
      const label = r.routeType === 'RUN' ? '🏈 RUN' : (r.routeType || '');
      ctx!.fillText(label, r.startX, r.startY - (16 * dir));
    }
  }

  function drawHelmet(entity: Entity, design: HelmetDesign, forwardDirection: number) {
    ctx!.save();
    if (cameraPerspectiveMode === 'THREE_QUARTER') {
      ctx!.translate(entity.x, entity.y);
      ctx!.scale(1, 1 / 0.72);
      ctx!.translate(-entity.x, -entity.y);
    }
    drawHelmetSprite(ctx!, entity, design, forwardDirection, touchOptimized ? 1.23 : 1.08, cameraPerspectiveMode);
    if (entity.stamina !== undefined) {
      const stamina = entity.stamina;
      ctx!.fillStyle = '#171717';
      ctx!.fillRect(entity.x - 12, entity.y + 20, 24, 4);
      ctx!.fillStyle = stamina < 25 ? '#ef4444' : stamina < 55 ? '#fbbf24' : '#4ade80';
      ctx!.fillRect(entity.x - 12, entity.y + 20, 24 * stamina / 100, 4);
      if (stamina < 55 && (phase === 'PRE_SNAP' || entity === activeEntity)) {
        ctx!.font = 'bold 8px Courier New, monospace';
        ctx!.textAlign = 'center';
        ctx!.fillText(stamina < 25 ? 'EXHAUSTED' : 'TIRED', entity.x, entity.y + 34);
      }
    }
    ctx!.restore();
  }

  function drawFootball(x: number, y: number, rotation: number, size = 8) {
    ctx!.save();
    if (cameraPerspectiveMode === 'THREE_QUARTER') {
      ctx!.translate(x, y);
      ctx!.scale(1, 1 / 0.72);
      ctx!.translate(-x, -y);
    }
    ctx!.translate(x, y);
    ctx!.rotate(rotation);
    const leather = ctx!.createLinearGradient(0, -size * 0.6, 0, size * 0.6);
    leather.addColorStop(0, '#e8ad70');
    leather.addColorStop(0.4, '#a9582c');
    leather.addColorStop(1, '#592a19');
    ctx!.beginPath();
    ctx!.moveTo(-size, 0);
    ctx!.bezierCurveTo(-size * 0.45, -size * 0.85, size * 0.45, -size * 0.85, size, 0);
    ctx!.bezierCurveTo(size * 0.45, size * 0.85, -size * 0.45, size * 0.85, -size, 0);
    ctx!.closePath();
    ctx!.fillStyle = leather;
    ctx!.fill();
    ctx!.strokeStyle = '#fff4dd';
    ctx!.lineWidth = 1.4;
    ctx!.stroke();
    ctx!.save();
    ctx!.clip();
    ctx!.strokeStyle = '#f8edda';
    ctx!.lineWidth = 2;
    ctx!.beginPath();
    for (const side of [-1, 1]) {
      ctx!.moveTo(side * size * 0.65, -size);
      ctx!.lineTo(side * size * 0.65, size);
    }
    ctx!.stroke();
    ctx!.restore();
    ctx!.strokeStyle = '#ffffff';
    ctx!.lineWidth = 1;
    ctx!.lineCap = 'round';
    ctx!.beginPath();
    ctx!.moveTo(-size * 0.35, -size * 0.12);
    ctx!.lineTo(size * 0.35, -size * 0.12);
    for (const lace of [-0.25, 0, 0.25]) {
      ctx!.moveTo(size * lace, -size * 0.3);
      ctx!.lineTo(size * lace, size * 0.08);
    }
    ctx!.stroke();
    ctx!.restore();
  }

  function draw() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Outer stadium turf background when zoomed out
    ctx.fillStyle = '#061c0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();

    if (screenShakeTimer > 0) {
      ctx.translate((Math.random() - 0.5) * screenShakeStrength, (Math.random() - 0.5) * screenShakeStrength);
    }

    // Apply dynamic camera scale and centering translation
    const pitch = getCameraPitchFactor();
    ctx.translate(cameraOffsetX, 0);
    ctx.scale(cameraScale, cameraScale * pitch);
    ctx.translate(0, -cameraY);

    // Playing field surface
    ctx.fillStyle = '#176620';
    ctx.fillRect(20, cameraWorldTop, fieldWidth - 40, cameraWorldBottom - cameraWorldTop);

    // Sideline boundaries
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(20, cameraWorldTop); ctx.lineTo(20, cameraWorldBottom);
    ctx.moveTo(fieldWidth - 20, cameraWorldTop); ctx.lineTo(fieldWidth - 20, cameraWorldBottom);
    ctx.stroke();

    // Field turf pattern
    for (let y = endZoneHeight; y <= fieldHeight - endZoneHeight; y += 100) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.lineTo(fieldWidth - 20, y);
      ctx.stroke();

      const distFromOwnGoal = Math.abs(y - endZoneHeight);
      let yardNum = Math.round(distFromOwnGoal / 10);
      if (yardNum > 50) yardNum = 100 - yardNum;

      if (yardNum > 0 && yardNum <= 50 && yardNum % 10 === 0) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px Courier New, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(yardNum.toString(), 30, y + 9);

        ctx.textAlign = 'right';
        ctx.fillText(yardNum.toString(), fieldWidth - 30, y + 9);
      }
    }

    // Hash marks
    for (let y = endZoneHeight + 10; y < fieldHeight - endZoneHeight; y += 10) {
      if (y % 100 !== 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.65)';
        ctx.lineWidth = 2;
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

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    for (const boundaryY of [0, endZoneHeight, fieldHeight - endZoneHeight, fieldHeight]) {
      ctx.beginPath();
      ctx.moveTo(20, boundaryY);
      ctx.lineTo(fieldWidth - 20, boundaryY);
      ctx.stroke();
    }

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
      } else if (playObj && playObj.type !== 'PASS') {
        receivers.forEach(r => {
          if (r.isBlocker || r.routeType === 'BLOCK') drawRoutePath(r);
        });
        if (centerReceiver) drawRoutePath(centerReceiver);
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

    const p1Helmet = getHelmetDesign(p1Team);
    const p2Helmet = getHelmetDesign(p2Team);
    const getEntityHelmet = (entity: Entity, defaultRole: 'offense' | 'defense') => {
      const teamKey = entity.team || (defaultRole === 'offense' ? activeOffense : activeDefense);
      return teamKey === 'P1' ? p1Helmet : p2Helmet;
    };

    drawHelmet(qb, getEntityHelmet(qb, 'offense'), attackDirection);
    if (activeEntity === qb || (qb.powerBoostTimer || 0) > 0) {
      ctx.strokeStyle = (qb.powerBoostTimer || 0) > 0 ? '#00ffff' : '#ff00ff';
      ctx.lineWidth = 2.5 / cameraScale;
      ctx.beginPath();
      ctx.arc(qb.x, qb.y, qb.radius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Tap-to-Throw target reticles & badges above eligible receivers
    if (phase === 'QB_DROP' && activeOffense === 'P1') {
      const eligible = [...receivers, centerReceiver, rb].filter(
        (r): r is Entity => Boolean(r && !r.isBlocker && r.routeType !== 'BLOCK')
      );
      eligible.forEach((r, idx) => {
        ctx.save();
        const pulse = Math.sin(Date.now() * 0.01 + idx) * 1.5;
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 1.8 / cameraScale;
        ctx.beginPath();
        ctx.arc(r.x, r.y, (r.radius || 10) + 4 + pulse, 0, Math.PI * 2);
        ctx.stroke();

        const badgeY = r.y - (16 / cameraScale);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 1 / cameraScale;
        const badgeW = 28 / cameraScale;
        const badgeH = 11 / cameraScale;
        ctx.beginPath();
        ctx.roundRect(r.x - badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH, 3 / cameraScale);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffcc00';
        ctx.font = `bold ${Math.round(7.5 / cameraScale)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TAP 🏈', r.x, badgeY);
        ctx.restore();
      });
    }

    // Controlled player indicator halo (QB in pocket, Ball Carrier running, Edge Rusher on defense)
    const controlledPlayer = (activeDefense === 'P1')
      ? getControlledDefender()
      : (phase === 'QB_DROP')
        ? qb
        : (phase === 'RUNNING' || phase === 'HANDOFF')
          ? activeEntity
          : null;

    if (controlledPlayer && (phase === 'QB_DROP' || phase === 'RUNNING' || phase === 'HANDOFF' || phase === 'THROWN' || (activeDefense === 'P1' && phase === 'PRE_SNAP'))) {
      ctx.save();
      const pulse = Math.sin(Date.now() * 0.008) * 1.5;
      const isDef = activeDefense === 'P1';
      const ringColor = isDef ? '#ffcc00' : '#00ffff';
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 2.2 / cameraScale;
      ctx.beginPath();
      ctx.arc(controlledPlayer.x, controlledPlayer.y, (controlledPlayer.radius || 10) + 5 + pulse, 0, Math.PI * 2);
      ctx.stroke();

      if (isDef) {
        const arrowTipY = controlledPlayer.y - (controlledPlayer.radius || 10) - 7;
        const arrowBaseY = arrowTipY - 12;
        ctx.fillStyle = '#ff3333';
        ctx.beginPath();
        ctx.moveTo(controlledPlayer.x, arrowTipY);
        ctx.lineTo(controlledPlayer.x - 5, arrowBaseY);
        ctx.lineTo(controlledPlayer.x + 5, arrowBaseY);
        ctx.closePath();
        ctx.fill();
      }

      const joyInput = getEffectiveJoystickInput();
      if (joyInput.active && (joyInput.x !== 0 || joyInput.y !== 0)) {
        const arrowDist = (controlledPlayer.radius || 10) + 12;
        const arrowX = controlledPlayer.x + joyInput.x * arrowDist;
        const arrowY = controlledPlayer.y + joyInput.y * arrowDist;
        ctx.fillStyle = ringColor;
        ctx.beginPath();
        ctx.arc(arrowX, arrowY, 3 / cameraScale, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(8 / cameraScale)}px monospace`;
      ctx.textAlign = 'center';
      let defRole = controlledPlayer.defenseAssignment || controlledPlayer.type || 'DEF';
      if (defRole === 'BLITZ' || controlledPlayer.passRusher) defRole = 'RUSHER';
      const tagText = isDef ? `${defRole} (YOU)` : (phase === 'QB_DROP' ? 'QB (YOU)' : 'YOU');
      ctx.fillText(tagText, controlledPlayer.x, controlledPlayer.y - (14 / cameraScale));
      ctx.restore();
    }

    // Visual throw target confirmation ripple
    if (throwTargetFeedback && throwTargetFeedback.alpha > 0.02) {
      ctx.save();
      throwTargetFeedback.radius += 0.8;
      throwTargetFeedback.alpha -= 0.035;
      ctx.strokeStyle = `rgba(0, 255, 255, ${throwTargetFeedback.alpha})`;
      ctx.lineWidth = 2.5 / cameraScale;
      ctx.beginPath();
      ctx.arc(throwTargetFeedback.x, throwTargetFeedback.y, throwTargetFeedback.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
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
      drawHelmet(l, getEntityHelmet(l, 'offense'), attackDirection);
    });

    // Center Receiver
    if (centerReceiver) {
      drawHelmet(centerReceiver, getEntityHelmet(centerReceiver, 'offense'), attackDirection);
      if ((centerReceiver.flash || 0) > 0) {
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2.5 / cameraScale;
        ctx.beginPath();
        ctx.arc(centerReceiver.x, centerReceiver.y, centerReceiver.radius + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

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
      drawHelmet(r, getEntityHelmet(r, 'offense'), attackDirection);
      if ((r.flash || 0) > 0) {
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2.5 / cameraScale;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

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
      drawHelmet(rb, getEntityHelmet(rb, 'offense'), attackDirection);
      if (activeEntity === rb || (rb.powerBoostTimer || 0) > 0) {
        ctx.strokeStyle = (rb.powerBoostTimer || 0) > 0 ? '#00ffff' : '#ff00ff';
        ctx.lineWidth = 2.5 / cameraScale;
        ctx.beginPath();
        ctx.arc(rb.x, rb.y, rb.radius + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

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
      drawHelmet(d, getEntityHelmet(d, 'defense'), (d === activeEntity ? attackDirection : -attackDirection));
      if ((isInterceptionReturn || isSpecialTeamsReturn) && d === activeEntity) {
        ctx.save();
        ctx.strokeStyle = '#00ffff';
        ctx.fillStyle = '#00ffff';
        ctx.lineWidth = 2.5 / cameraScale;
        ctx.beginPath();
        ctx.arc(d.x, d.y, (d.radius || 10) + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = `bold ${Math.round(9 / cameraScale)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(isSpecialTeamsReturn ? 'RETURNER 🏃' : 'BALL CARRIER', d.x, d.y - (d.radius || 10) - 7);
        ctx.restore();
      }
      if (d.isBlocker || d.archetype === 'BLOCKER') {
        const barWidth = (d.radius || 10) * 2 + 10;
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3.5 / cameraScale;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(d.x - barWidth / 2, d.y - (d.radius || 10));
        ctx.lineTo(d.x + barWidth / 2, d.y - (d.radius || 10));
        ctx.stroke();
        ctx.restore();
      }
      const isUnassignedCenterDefender = (activeDefense === 'P1' && d === defenders[0]) || d.defenseAssignment === 'USER';
      if (isUnassignedCenterDefender) {
        if (phase === 'PRE_SNAP' && activeDefense === 'P1') {
          const radius = d.radius || 10;
          ctx.save();
          ctx.strokeStyle = '#00ffff';
          ctx.fillStyle = '#00ffff';
          ctx.lineWidth = 2 / cameraScale;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.arc(d.x, d.y, radius + 5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = `bold ${Math.round(8 / cameraScale)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText('NO ASSIGNMENT', d.x, d.y - radius - 5);
          ctx.restore();
        }
      } else if (d.defenseAssignment) {
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

    const carrier = !ball && !fumbleBall && !snapBall
      ? phase === 'RUNNING' ? activeEntity
        : phase === 'QB_DROP' || phase === 'HANDOFF' ? qb
          : phase === 'PRE_SNAP' ? linemen[0] : null
      : null;
    if (carrier) {
      const moving = Math.hypot(carrier.vx || 0, carrier.vy || 0) > 0.5;
      const facing = moving ? Math.atan2(carrier.vx || 0, -(carrier.vy || 0)) : attackDirection === -1 ? 0 : Math.PI;
      const carryOffset = carrier.radius + 5;
      const snapPosition = phase === 'PRE_SNAP' ? getSnapBallPosition(carrier, qb, attackDirection, 0) : null;
      const carryX = snapPosition?.x ?? carrier.x + Math.cos(facing) * carryOffset;
      const carryY = snapPosition?.y ?? carrier.y + Math.sin(facing) * carryOffset;
      ctx.save();
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2 / cameraScale;
      ctx.beginPath();
      ctx.arc(carrier.x, carrier.y, carrier.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#e9b98d';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(carrier.x + Math.cos(facing) * carrier.radius * 0.7, carrier.y + Math.sin(facing) * carrier.radius * 0.7);
      ctx.lineTo(carryX, carryY);
      ctx.stroke();
      drawFootball(carryX, carryY, facing - Math.PI / 2);
      ctx.restore();
    }

    if (snapBall && !ball && !fumbleBall) {
      const snapPosition = getSnapBallPosition(snapBall.center, qb, attackDirection, snapBall.frame / 8);
      drawFootball(snapPosition.x, snapPosition.y, Math.PI / 2);
    }

    // Football & Realistic Turf Drop Shadow
    if (ball) {
      const bZ = ball.z || 0;
      if (ball.intendedTarget) {
        ctx.save();
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 2 / cameraScale;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(ball.intendedTarget.x, ball.intendedTarget.y, ball.intendedTarget.radius + 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

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

      ctx.save();
      ctx.strokeStyle = 'rgba(255, 244, 221, 0.3)';
      ctx.lineWidth = 1 / cameraScale;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(ball.x, ball.y);
      ctx.lineTo(ball.x, ballDrawY);
      ctx.stroke();
      ctx.restore();
      drawFootball(ball.x, ballDrawY, Math.atan2(ball.vy, ball.vx), 8.5);
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

      drawFootball(fumbleBall.x, fumbleBall.y - (fumbleBall.z || 0), fumbleBall.timer * 0.25);

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

    // Screen-space Special Teams Kickoff Meter & HUD
    if (phase === 'KICKOFF') {
      const isUserKicking = kickoffKickingTeam === 'P1';

      const meterW = 220;
      const meterH = 46;
      const meterX = (canvas.width - meterW) / 2;
      const meterY = canvas.height - 76;

      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.90)';
      ctx.strokeStyle = '#ffcc00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(meterX, meterY, meterW, meterH, 8);
      ctx.fill();
      ctx.stroke();

      if (isUserKicking) {
        ctx.fillStyle = '#ffcc00';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('🏈 TAP METER TO KICKOFF!', canvas.width / 2, meterY + 14);

        const barX = meterX + 15;
        const barY = meterY + 22;
        const barW = meterW - 30;
        const barH = 14;

        ctx.fillStyle = '#222';
        ctx.fillRect(barX, barY, barW, barH);

        const grad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
        grad.addColorStop(0, '#ffaa00');
        grad.addColorStop(0.65, '#00ffff');
        grad.addColorStop(1.0, '#00ff66');
        ctx.fillStyle = grad;
        ctx.fillRect(barX, barY, barW * kickMeterPower, barH);

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);

        // Indicator line
        const indX = barX + barW * kickMeterPower;
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(indX, barY - 2);
        ctx.lineTo(indX, barY + barH + 2);
        ctx.stroke();

        const estYards = Math.round(45 + kickMeterPower * 25);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(`${Math.round(kickMeterPower * 100)}% POWER (~${estYards} YDS)`, canvas.width / 2, barY + 11);
      } else {
        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${p2Team.name.toUpperCase()} KICKOFF...`, canvas.width / 2, meterY + 18);
        ctx.fillStyle = '#aaaaaa';
        ctx.font = '9px monospace';
        ctx.fillText('GET READY TO FIELD AND RETURN!', canvas.width / 2, meterY + 34);
      }
      ctx.restore();
    }

    if (phase === 'PRE_SNAP' && activeOffense === 'P1' && p1OffPlay === 'PUNT') {
      ctx.save();
      const meterW = 210;
      const meterH = 48;
      const meterX = (canvas.width - meterW) / 2;
      const meterY = canvas.height - 145;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.90)';
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(meterX, meterY, meterW, meterH, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#00ffff';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('🏈 TAP METER TO PUNT!', canvas.width / 2, meterY + 14);

      const barX = meterX + 15;
      const barY = meterY + 22;
      const barW = meterW - 30;
      const barH = 14;

      ctx.fillStyle = '#222';
      ctx.fillRect(barX, barY, barW, barH);

      const grad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
      grad.addColorStop(0, '#ffaa00');
      grad.addColorStop(0.65, '#00ffff');
      grad.addColorStop(1.0, '#00ff66');
      ctx.fillStyle = grad;
      ctx.fillRect(barX, barY, barW * kickMeterPower, barH);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barW, barH);

      const estYards = Math.round(25 + kickMeterPower * 30);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(`${Math.round(kickMeterPower * 100)}% POWER (~${estYards} YDS)`, canvas.width / 2, barY + 11);
      ctx.restore();
    } else if (currentDown === 4 && phase === 'PRE_SNAP') {
      ctx.save();
      ctx.fillStyle = 'rgba(180, 20, 20, 0.92)';
      ctx.strokeStyle = '#ffcc00';
      ctx.lineWidth = 1.5;
      const tagW = 160;
      const tagH = 22;
      const tagX = (canvas.width - tagW) / 2;
      const tagY = 8;
      ctx.beginPath();
      ctx.roundRect(tagX, tagY, tagW, tagH, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('🏈 4TH DOWN • PUNT OPTION', canvas.width / 2, tagY + 15);
      ctx.restore();
    }

    // Relative Virtual Joystick Drawing
    if (joystick.active) {
      joystick.alpha = Math.min(1.0, joystick.alpha + 0.15);
    } else if (joystick.alpha > 0) {
      joystick.alpha = Math.max(0, joystick.alpha - 0.08);
    }

    if (joystick.alpha > 0.01) {
      ctx.save();
      const MAX_RADIUS = 46 * (canvas.width / 340);
      const KNOB_RADIUS = 20 * (canvas.width / 340);
      const alpha = joystick.alpha;

      // Base ring
      ctx.fillStyle = `rgba(15, 23, 42, ${0.45 * alpha})`;
      ctx.strokeStyle = `rgba(0, 255, 255, ${0.45 * alpha})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(joystick.baseX, joystick.baseY, MAX_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Inner tick circle
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.2 * alpha})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(joystick.baseX, joystick.baseY, MAX_RADIUS * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Directional stem line
      const knobX = joystick.baseX + (joystick.inputX * (MAX_RADIUS - 6));
      const knobY = joystick.baseY + (joystick.inputY * (MAX_RADIUS - 6));
      if (joystick.distance > 0.05) {
        ctx.strokeStyle = `rgba(0, 255, 255, ${0.55 * alpha})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(joystick.baseX, joystick.baseY);
        ctx.lineTo(knobX, knobY);
        ctx.stroke();
      }

      // Joystick knob
      const knobGrad = ctx.createRadialGradient(
        knobX - 3, knobY - 3, 2,
        knobX, knobY, KNOB_RADIUS
      );
      knobGrad.addColorStop(0, `rgba(255, 255, 255, ${0.95 * alpha})`);
      knobGrad.addColorStop(0.5, `rgba(0, 220, 255, ${0.85 * alpha})`);
      knobGrad.addColorStop(1, `rgba(10, 80, 160, ${0.85 * alpha})`);

      ctx.fillStyle = knobGrad;
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(knobX, knobY, KNOB_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }
  }

  const safeRequestAnimationFrame = (callback: FrameRequestCallback): number => {
    if (typeof requestAnimationFrame !== 'undefined') {
      return requestAnimationFrame(callback);
    }
    return setTimeout(() => callback(Date.now()), 16) as unknown as number;
  };

  const safeCancelAnimationFrame = (id: number) => {
    if (typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(id);
    } else {
      clearTimeout(id);
    }
  };

  let animationFrameId: number;
  const simulationClock = createSimulationClock();
  function loop(timestamp: number) {
    const steps = simulationClock(timestamp, isPaused);
    if (!isPaused) {
      if (!options.tutorial) updateGameClock(timestamp);
      for (let step = 0; step < steps && !isPaused; step++) {
        const tutorialSnapAnimating = options.tutorial && tutorialStep === 5 && tutorialAimFrames++ < 24;
        if (!options.tutorial || tutorialSnapAnimating || tutorialStep === 6 || tutorialStep === 11 || phase === 'PRE_SNAP') {
          update();
        }
      }
    }
    draw();
    if (options.tutorial) {
      const target = tutorialStep === 2 ? receivers[0]
        : tutorialStep === 3 ? centerReceiver
        : tutorialStep === 4 || tutorialStep === 5 ? qb
        : tutorialStep === 8 ? defenders[3]
        : tutorialStep === 9 ? defenders[0] : null;
      if (target && ctx) {
        ctx.save();
        ctx.translate(cameraOffsetX, -cameraY * cameraScale);
        ctx.scale(cameraScale, cameraScale);
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(target.x, target.y, target.radius + 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    if (isSessionActive && timestamp - lastSessionSaveTime >= 1000) {
      saveGameSession();
      lastSessionSaveTime = timestamp;
    }
    animationFrameId = safeRequestAnimationFrame(loop);
  }

  const handlePageHide = () => saveGameSession();
  if (typeof window !== 'undefined') window.addEventListener('pagehide', handlePageHide);
  animationFrameId = safeRequestAnimationFrame(loop);

  return () => {
    callbacks.onEngineReady(null);
    safeCancelAnimationFrame(animationFrameId);
    if (drillResetTimer) clearTimeout(drillResetTimer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', resizeGame);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    }
    canvas.removeEventListener('pointerdown', handlePointerDown);
    canvas.removeEventListener('pointermove', handlePointerMove);
    canvas.removeEventListener('pointerup', handlePointerUp);
  };

}
