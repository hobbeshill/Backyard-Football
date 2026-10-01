import type { Ball, Entity, FumbleBall } from './types';
import { defensiveKeys, defensivePlaybook, middleRoutes, offensiveKeys, offensivePlaybook, outsideRoutes, runningBackRoutes } from './playbook';
import { alignDefenderAcrossFromRunningBack, alignDefenders, chooseCpuDefensiveAssignments } from './defense';
import { createFumbleBall } from './fumbles';
import { distToSegment, moveToward, resolveCollisions, updateRouteMovement } from './movement';
import { resolvePlayResult } from './rules';
import { sounds } from './sound';

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
}

export interface GameEngineCallbacks {
  setP2OffPlayState: (key: string) => void;
  setP2DefPlayState: (key: string) => void;
  setDownDistanceText: (text: string) => void;
  setActiveOffenseState: (side: string) => void;
  setUserScore: (score: number) => void;
  setCpuScore: (score: number) => void;
  setP1DefPlayState: (key: string) => void;
  setPlaybookModal: (mode: 'OFFENSE' | 'DEFENSE') => void;
  setMomentumState: (momentum: number) => void;
  setGameClockState: (quarter: number, seconds: number) => void;
  showAnnouncement: (text: string, color?: string) => void;
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

  interface PlayRecord {
    play: string;
    isPass: boolean;
    down: number;
    distance: number;
    yardsGained: number;
  }
  const userPlayHistory: PlayRecord[] = [];
  const userDefenseHistory: string[] = [];
  let momentum = 0;
  let defenseOverrides = new Map<number, 'BLITZ' | 'MAN' | 'ZONE'>();
  let playEnding = false;
  let formationTransitionFrame = 0;
  let formationTransitions: Array<{
    entity: Entity;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  }> = [];

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

  function applyDefenseOverrides() {
    defenders.forEach((defender, index) => {
      const override = defenseOverrides.get(index);
      const assignment = override ?? (defender.passRusher ? 'BLITZ' : defender.assignedReceiver ? 'MAN' : 'ZONE');
      defender.defenseAssignment = assignment;
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
    return defenders
      .filter(defender => !defender.passRusher)
      .map(defender => ({
        defender,
        distance: Math.hypot(defender.x - targetX, defender.y - targetY)
      }))
      .filter(candidate => candidate.distance < 160)
      .sort((first, second) => first.distance - second.distance)
      .slice(0, 2)
      .map(candidate => candidate.defender);
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

    // Repeat spam detector (same play 2 times in a row)
    if (secondLastPlay && lastPlay.play === secondLastPlay.play) {
      if (lastPlay.play === 'DEEP_SHOT') {
        return 'QUARTERS';
      }
      if (lastPlay.play === 'SHORT_PASS') {
        return 'ROBBER';
      }
      if (!lastPlay.isPass) {
        return 'BLITZ';
      }
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
    const yardsGained = clamp(baseYardsGained + matchup.yardsAdjustment, -12, 40);
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
      showAnnouncement(customMessage || `SACK! Loss of ${Math.abs(yardsGained)} yards. (${currentDown} Down)`, customColor || "#ff3333");
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
      userPlayHistory.push({
        play: p1OffPlay,
        isPass: offensivePlaybook[p1OffPlay]?.type === 'PASS',
        down: currentDown,
        distance: yardsToGo,
        yardsGained
      });
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
    ball = null;
    ballPressureDefenders = [];
    fumbleBall = null;
    brokenTackleEffect = null;
    isAiming = false;
    playClock = 0;

    qb.x = 170;
    qb.y = lineOfScrimmageY - (40 * attackDirection);
    qb.vx = 0;
    qb.vy = 0;
    qb.boostUsed = false;
    qb.powerBoostTimer = 0;
    qb.tackleImmunity = 0;
    qb.brokenTacklesCount = 0;
    qb.hasBall = false;
    currentViewHeight = 450;
    cameraScale = 1.0;
    cameraOffsetX = 0;

    cameraY = Math.max(0, Math.min(fieldHeight - 450, lineOfScrimmageY - 210));
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
      ? { left: 90, right: 270, center: 125, rb: 220, rbSide: 'right' as const }
      : alignment === 'TRIPS'
        ? { left: 210, right: 285, center: 250, rb: 90, rbSide: 'left' as const }
        : { left: 50, right: 290, center: 200, rb: 220, rbSide: 'right' as const };

    receivers = [
      { startX: alignmentPositions.left, startY: lineOfScrimmageY, x: alignmentPositions.left, y: lineOfScrimmageY, vx: 0, vy: 0, radius: 10, routeType: activePlay.left, routeIndex: 0, timer: 0, flash: 0, caught: false, isOutside: true, color: '#00ffff' },
      { startX: alignmentPositions.right, startY: lineOfScrimmageY, x: alignmentPositions.right, y: lineOfScrimmageY, vx: 0, vy: 0, radius: 10, routeType: activePlay.right, routeIndex: 0, timer: 0, flash: 0, caught: false, isOutside: true, color: '#00ffff' }
    ];

    centerReceiver = {
      startX: alignmentPositions.center, startY: lineOfScrimmageY, x: alignmentPositions.center, y: lineOfScrimmageY, vx: 0, vy: 0, radius: 10,
      routeType: activePlay.center, routeIndex: 0, timer: 0, flash: 0, caught: false, isOutside: false, color: '#00ffff', isCenter: true
    };

    rb = {
      startX: alignmentPositions.rb, startY: lineOfScrimmageY - (75 * attackDirection), x: alignmentPositions.rb, y: lineOfScrimmageY - (75 * attackDirection), vx: 0, vy: 0, radius: 10,
      routeType: activePlay.rbRoute, routeIndex: 0, timer: 0, flash: 0, caught: false, hasBall: false, color: '#00ffaa', isRB: true, side: alignmentPositions.rbSide, handoffTimer: 0
    };

    linemen = [
      { startX: 170, startY: lineOfScrimmageY, x: 170, y: lineOfScrimmageY, radius: 10, blockTimer: 0 }
    ];

    defenders = [
      { startX: 170, startY: lineOfScrimmageY + (3 * attackDirection), x: 170, y: lineOfScrimmageY + (3 * attackDirection), radius: 10, type: 'DL', passRusher: true, color: '#ff3333' },
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
      }
    }
  };
  callbacks.onEngineReady(engineHandle);

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

    const directRBTap = phase === 'PRE_SNAP' && activeOffense === 'P1' && rb && Math.hypot(rb.x - px, rb.y - py) < rb.radius + 18;
    if (directRBTap && rb) {
      rb.routeIndex = ((rb.routeIndex || 0) + 1) % runningBackRoutes.length;
      rb.routeType = runningBackRoutes[rb.routeIndex];
      lastTapTime = 0;
      sounds.playJuke();
      return;
    }

    if (phase === 'PRE_SNAP' && activeOffense === 'P1' && currentTime - lastTapTime < 350) {
      if (rb) {
        if (px < fieldWidth / 2) {
          rb.side = 'left';
          rb.startX = 120; rb.x = 120;
        } else {
          rb.side = 'right';
          rb.startX = 220; rb.x = 220;
        }
        positionRBDefender();
      }
      lastTapTime = 0;
      return;
    }
    lastTapTime = currentTime;

    touchStartX = px;
    touchStartY = py;
    touchScreenStartX = screenPos.x;
    touchScreenStartY = screenPos.y;
    aimScreenCurrentX = screenPos.x;
    aimScreenCurrentY = screenPos.y;
    touchStartTime = Date.now();

    if (phase === 'PRE_SNAP') {
      if (activeDefense === 'P1') {
        const tappedDefender = defenders.find(defender => Math.hypot(defender.x - px, defender.y - py) < defender.radius + 12);
        if (tappedDefender) {
          const defenderIndex = defenders.indexOf(tappedDefender);
          const assignments: Array<'BLITZ' | 'MAN' | 'ZONE' | undefined> = [undefined, 'BLITZ', 'MAN', 'ZONE'];
          const currentIndex = assignments.indexOf(defenseOverrides.get(defenderIndex));
          const nextAssignment = assignments[(currentIndex + 1) % assignments.length];
          if (nextAssignment) defenseOverrides.set(defenderIndex, nextAssignment);
          else defenseOverrides.delete(defenderIndex);
          applyDefensiveAlignment(true, false);
          const announcement = nextAssignment === 'BLITZ'
            ? 'BLITZ ASSIGNED'
            : nextAssignment === 'MAN'
              ? 'MAN COVERAGE ASSIGNED'
              : nextAssignment === 'ZONE'
                ? 'ZONE COVERAGE ASSIGNED'
                : 'DEFAULT COVERAGE RESTORED';
          const announcementColor = nextAssignment === 'BLITZ'
            ? '#00ff66'
            : nextAssignment === 'MAN'
              ? '#ffcc00'
              : nextAssignment === 'ZONE'
                ? '#ff3333'
                : '#ffffff';
          showAnnouncement(announcement, announcementColor);
          return;
        }

        if (Math.hypot(qb.x - px, qb.y - py) < 55) {
          startCpuPlay();
          return;
        }

        return;
      }

      if (activeOffense === 'P2') {
        startCpuPlay();
        return;
      }

      const play = offensivePlaybook[p1OffPlay];
      if (play.type === 'PASS') {
        const allEligibleReceivers = [...receivers, centerReceiver].filter(Boolean) as Entity[];
        const tappedReceiver = allEligibleReceivers.find(r => r && Math.hypot(r.x - px, r.y - py) < r.radius + 18);
        if (tappedReceiver) {
          const availableRoutes = tappedReceiver.isOutside ? outsideRoutes : middleRoutes;
          tappedReceiver.routeIndex = ((tappedReceiver.routeIndex || 0) + 1) % availableRoutes.length;
          tappedReceiver.routeType = availableRoutes[tappedReceiver.routeIndex];
          sounds.playJuke();
          return;
        }
      }

      if (Math.hypot(qb.x - px, qb.y - py) < 55) {
        touchStartX = px;
        touchStartY = py;
        sounds.playSnap();
        if (play.type === 'PASS') {
          qb.hasBall = true;
          phase = 'QB_DROP';
          isAiming = true;
        } else {
          qb.hasBall = true;
          if (rb) rb.hasBall = false;
          activeEntity = rb || qb;
          phase = 'HANDOFF';
        }
        return;
      }
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
  };

  const handlePointerUp = (e: PointerEvent) => {
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
        const jukeDir = deltaScreenX > 0 ? 80 : -80;
        activeEntity.x += jukeDir;
        activeEntity.x = Math.max(30, Math.min(fieldWidth - 30, activeEntity.x));

        const inTackleBox = defenders.some(d => Math.hypot(activeEntity.x - d.x, activeEntity.y - d.y) < 45);
        activeEntity.tackleImmunity = inTackleBox ? 50 : 30;
        screenShakeTimer = 15;
        sounds.playJuke();
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
          sounds.playJuke();
          showAnnouncement("QB SCRAMBLE! 🏃💨", "#00ffff");
        }
        return;
      }

      // Slingshot projected target location in world space
      const projX = qb.x - pullX;
      const projY = qb.y - pullY;

      const dx = projX - qb.x;
      const dy = projY - qb.y;
      const throwDist = Math.hypot(dx, dy);

      // Standard physics-based throw directly to the aimed location (scaled 20% to match sprites)
      const throwSpeed = Math.min(7.6, Math.max(4.4, (4.0 + throwDist * 0.035) * 0.8));
      const totalFlightFrames = Math.max(16, Math.round(throwDist / throwSpeed));
      ballPressureDefenders = selectCoverageBreakers(projX, projY);

      const vx = dx / totalFlightFrames;
      const vy = dy / totalFlightFrames;

      ball = {
        startX: qb.x,
        startY: qb.y,
        x: qb.x,
        y: qb.y,
        z: 2,
        vx: vx,
        vy: vy,
        maxZ: Math.min(26, 12 + throwDist * 0.05),
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

    if (phase === 'PRE_SNAP') {
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

    if (phase === 'QB_DROP' && activeOffense === 'P2' && !ball) {
      // Detect pass rusher pocket pressure
      const passRusher = defenders.find(d => d && d.passRusher);
      const distToRusher = passRusher ? Math.hypot(passRusher.x - qb.x, passRusher.y - qb.y) : 999;
      const isUnderHeavyPressure = distToRusher < 46;

      // NFL Progression Read Framework:
      // Primary Read (Outside WRs): receivers[0], receivers[1]
      // Intermediate / Seam Read: centerReceiver
      // Emergency Checkdown: rb
      const primaryTargets: Entity[] = [...receivers];
      const seamTarget: Entity | null = centerReceiver;
      const checkdownTarget: Entity | null = rb;

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

        // 2. Route break window anticipation bonus:
        let isBreakOpen = false;
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
          // Go route streaking deep behind CB (frame 42+)
          else if (t.routeType === 'GO' && rTime >= 42 && nearestDefDist >= 16 && depthYards > 8) {
            score += 65;
            isBreakOpen = true;
          }
          // Out/Flag route break (frames 44 - 70)
          else if ((t.routeType === 'FLAG-L' || t.routeType === 'FLAG-R') && rTime >= 44 && rTime <= 70 && nearestDefDist >= 15) {
            score += 55;
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

        return { score, isBreakOpen, depthYards, nearestDefDist };
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
        activeEntity.vx = (Math.random() < 0.5 ? 1.28 : -1.28);
        activeEntity.vy = 2.24 * attackDirection;
        sounds.playJuke();
        showAnnouncement("CPU QB SCRAMBLE! 🏃💨", "#ffaa00");
        return;
      }

      // Smart release conditions (utilizing the 3-second pocket):
      // 1. Immediate trigger on WR route cut / break when open (throw on the break!)
      // 2. High scoring downfield route developed (playClock > 38)
      // 3. Emergency sack escape (under heavy pressure and playClock > 25)
      // 4. Play clock progression expiration (playClock > 70)
      const shouldThrowNow =
        (openBreakWR !== null && playClock >= 38) ||
        (isUnderHeavyPressure && playClock > 25 && bestTarget !== null) ||
        (playClock > 45 && bestScore > 20 && bestTarget !== null) ||
        (playClock > 70 && bestTarget !== null);

      if (shouldThrowNow && bestTarget !== null) {
        const chosenTarget: Entity = openBreakWR || bestTarget;
        const targetDist = Math.hypot(chosenTarget.x - qb.x, chosenTarget.y - qb.y);
        // High velocity throw on crossing/slant/intermediate cuts, touch throw on deep go (20% slower to match sprites)
        const isDeepRoute = chosenTarget.routeType === 'GO' || chosenTarget.routeType === 'FLAG-L' || chosenTarget.routeType === 'FLAG-R';
        const throwSpeed = (isDeepRoute ? (targetDist > 240 ? 9.5 : 8.6) : (targetDist > 140 ? 8.8 : 7.6)) * 0.8;
        const T = Math.max(16, Math.round(targetDist / throwSpeed));

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
        // Arch height: lower arc for slants/crossers (16-24), higher arc for deep fade/go (28-36)
        const maxZ = isDeepRoute ? Math.min(36, 20 + targetDist * 0.08) : Math.min(26, 16 + targetDist * 0.05);

        ball = {
          startX: qb.x,
          startY: qb.y,
          x: qb.x,
          y: qb.y,
          z: 2,
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
        if (activeEntity.vx === undefined) activeEntity.vx = 0;
        activeEntity.vx *= 0.88;
        activeEntity.x += activeEntity.vx * 0.8;

        if ((activeEntity.powerBoostTimer || 0) > 0) activeEntity.powerBoostTimer!--;
        if ((activeEntity.tackleImmunity || 0) > 0) activeEntity.tackleImmunity!--;

        if (phase === 'QB_DROP' && activeOffense === 'P1') {
          qb.y += (0.28 * attackDirection);
        } else if (phase === 'RUNNING') {
          const runSpeed = ((activeEntity.powerBoostTimer || 0) > 0) ? 3.36 : 2.24;
          activeEntity.y += (runSpeed * attackDirection);

          const playObj = offensivePlaybook[activeOffName];
          if (playObj.type === 'ISO' && activeEntity === rb) {
            const blockingDL = defenders.find(d => d && d.type === 'DL' && Math.hypot(d.x - activeEntity.x, d.y - activeEntity.y) < 35);
            if (blockingDL) {
              const dodgeDir = activeEntity.x > blockingDL.x ? 1.2 : -1.2;
              activeEntity.x += dodgeDir;
            }
          }

          if (playObj.type === 'SWEEP' && activeEntity === rb) {
            const targetOutsideX = (rb.side === 'right') ? 280 : 60;
            rb.x += (targetOutsideX - rb.x) * 0.15;
          }
          if (rb && rb.routeType === 'ANGLE' && activeEntity === rb) {
            const angleTargetX = (rb.side === 'right') ? 235 : 105;
            rb.x += (angleTargetX - rb.x) * 0.10;
          }
        }
        if (activeEntity !== qb && activeOffense === 'P1') activeEntity.x = Math.max(25, Math.min(fieldWidth - 25, activeEntity.x));
      }
    }

    if (phase !== 'DEAD') {
      const passRushers = defenders.filter(d => d && d.passRusher);
      linemen.forEach((l) => {
        l.blockTimer = (l.blockTimer || 0) + 1;
        // 3 SECONDS before OL breaks down (180 frames at 60 FPS)
        const blockHoldTime = (activeDefKey === 'BLITZ') ? 85 : 180;

        passRushers.forEach((dl, rIdx) => {
          if ((l.blockTimer || 0) > blockHoldTime) {
            const rushSpeed = (activeDefKey === 'BLITZ') ? 1.24 : 1.08;
            moveToward(dl, qb.x, qb.y, 0.28, rushSpeed);
          } else {
            if (rIdx === 0) {
              dl.x = 170;
              dl.y = lineOfScrimmageY + (3 * attackDirection);
              l.x = 170;
              l.y = lineOfScrimmageY - (3 * attackDirection);
            }
          }
        });
      });
    }

    const playObj = offensivePlaybook[activeOffName];
    if (playObj.type !== 'PASS' && (phase === 'HANDOFF' || phase === 'RUNNING')) {
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
      receivers.forEach(r => updateRouteMovement(r, phase, attackDirection, defenders, fieldWidth));
    }
    updateRouteMovement(centerReceiver, phase, attackDirection, defenders, fieldWidth);

    if (rb) {
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
        if (rb.routeType === 'ANGLE') {
          const angleTargetX = rb.startX! < 170 ? 210 : 130;
          if (rb.timer < 22) {
            targetX += (angleTargetX - rb.x) * 0.10;
            targetY += rSpeed * 0.9 * dir;
          } else {
            targetX += (angleTargetX - rb.x) * 0.08;
            targetY += rSpeed * 0.55 * dir;
          }
        } else if (rb.timer < 18) {
          targetX += (sidelineX - rb.x) * 0.12;
          targetY += rSpeed * 0.4 * dir;
        } else {
          targetX += (sidelineX - rb.x) * 0.15;
          targetY += (lineOfScrimmageY + (10 * dir) - rb.y) * 0.08;
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
          if (d && Math.hypot(qb.x - d.x, qb.y - d.y) < qb.radius + d.radius) {
            if ((d.brokenTackleStun || 0) > 0) {
              d.brokenTackleStun!--;
              return;
            }
            if ((qb.tackleImmunity || 0) > 0) {
              d.brokenTackleStun = 40;
              d.x += (d.x < qb.x ? -25 : 25);
              d.y += (25 * attackDirection);
              screenShakeTimer = 15;
              return;
            }
            // Elusive QB broken sack chance
            const breakRoll = Math.random();
            if (breakRoll < 0.22 && (qb.brokenTacklesCount || 0) === 0) {
              qb.brokenTacklesCount = 1;
              qb.tackleImmunity = 42;
              d.brokenTackleStun = 55;
              d.x += (d.x < qb.x ? -30 : 30);
              d.y += (30 * attackDirection);
              screenShakeTimer = 22;
              sounds.playBrokenTackle();
              brokenTackleEffect = { x: qb.x, y: qb.y, timer: 35 };
              showAnnouncement("BROKEN SACK! QB SHEDS TACKLE! 💥🏃💨", "#00ffff");
              return;
            }
            // Strip-sack fumble chance (8%)
            const fumbleRoll = Math.random();
            if (fumbleRoll < 0.08) {
              triggerFumble(qb);
              return;
            }
            screenShakeTimer = 30;
            phase = 'DEAD';
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
        if (d.passRusher && phase === 'QB_DROP') {
          const rushSpeed = (activeDefKey === 'BLITZ') ? 2.1 : 1.72;
          const rushAccel = (activeDefKey === 'BLITZ') ? 0.42 : 0.34;
          moveToward(d, qb.x, qb.y, rushAccel, rushSpeed);
          d.x = Math.max(20, Math.min(fieldWidth - 20, d.x));
          d.y = Math.max(30, Math.min(fieldHeight - 30, d.y));
          return;
        }
        if (d.passRusher && phase !== 'RUNNING') return;

        let targetX = d.x, targetY = d.y;
        let moveSpeed = 1.15; // default zone drop speed
        let moveAccel = 0.20; // default zone drop acceleration
        const baseSpeed = 1.08; // 20% slower than 1.35
        const dir = attackDirection;

        if (activeDefKey === 'COVER3') {
          if (idx === 1) {
            // Deep Outside 1/3 Left CB: bails deep to protect boundary, keeping a 50px cushion
            let deepestY = lineOfScrimmageY;
            receivers.forEach(r => {
              if (r.x < 170 && ((dir === -1 && r.y < deepestY) || (dir === 1 && r.y > deepestY))) deepestY = r.y;
            });
            targetX = 65;
            targetY = deepestY + (50 * dir);
          } else if (idx === 2) {
            // Deep Outside 1/3 Right CB: bails deep to protect boundary, keeping a 50px cushion
            let deepestY = lineOfScrimmageY;
            receivers.forEach(r => {
              if (r.x >= 170 && ((dir === -1 && r.y < deepestY) || (dir === 1 && r.y > deepestY))) deepestY = r.y;
            });
            targetX = 275;
            targetY = deepestY + (50 * dir);
          } else if (idx === 6) {
            // Deep Middle 1/3 Safety: deep centerfield with 55px cushion
            let deepestY = lineOfScrimmageY;
            receivers.forEach(r => { if ((dir === -1 && r.y < deepestY) || (dir === 1 && r.y > deepestY)) deepestY = r.y; });
            if (centerReceiver && ((dir === -1 && centerReceiver.y < deepestY) || (dir === 1 && centerReceiver.y > deepestY))) deepestY = centerReceiver.y;
            targetX = 170;
            targetY = deepestY + (55 * dir);
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
            if (rec.isCutting) {
              d.reactionTimer = (d.reactionTimer || 0) + 1;
            } else {
              d.reactionTimer = 0;
            }
            const isCenterSlot = (rec === centerReceiver);
            const maxLag = isCenterSlot ? 8 : 12;
            const trailDist = isCenterSlot ? 6 : 14;
            moveSpeed = isCenterSlot ? 1.76 : 1.70;
            moveAccel = isCenterSlot ? 0.34 : 0.28;

            if (d.reactionTimer > 0 && d.reactionTimer < maxLag) {
              targetX = d.x + (rec.x > d.x ? 1.5 : -1.5);
              targetY = d.y + (moveSpeed * 0.45 * dir);
            } else {
              // Inside hip pocket leverage on slot slant (shading inside to take away the slant)
              targetX = rec.x + (isCenterSlot ? (rec.x >= 170 ? 4 : -4) : 0);
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
            // Deep 1/4 Left: maintains 55px cushion
            const wrLeft = receivers[0];
            targetX = 55;
            targetY = Math.max(lineOfScrimmageY + (170 * dir), wrLeft.y + (55 * dir));
          } else if (idx === 2) {
            // Deep 1/4 Right: maintains 55px cushion
            const wrRight = receivers[1];
            targetX = 285;
            targetY = Math.max(lineOfScrimmageY + (170 * dir), wrRight.y + (55 * dir));
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
            if (centerReceiver && (centerReceiver.x > 165 || centerReceiver.routeType === 'SLANT-R')) {
              // Drives hard across the formation downhill to jump the right slant!
              targetX = Math.min(230, centerReceiver.x + 8);
              targetY = centerReceiver.y - (3 * dir); // Position between QB and receiver!
              moveSpeed = 1.84;
              moveAccel = 0.36;
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
            const maxLag = isCenterSlot ? 8 : 12;
            const trailDist = isCenterSlot ? 6 : 14;
            moveSpeed = isCenterSlot ? 1.76 : 1.70;
            moveAccel = isCenterSlot ? 0.34 : 0.28;
            if (d.reactionTimer > 0 && d.reactionTimer < maxLag) {
              targetX = d.x + (rec.x > d.x ? 1.5 : -1.5);
              targetY = d.y + (moveSpeed * 0.45 * dir);
            } else {
              targetX = rec.x + (isCenterSlot ? (rec.x >= 170 ? 4 : -4) : 0);
              targetY = rec.y + (trailDist * dir);
            }
          } else {
            targetX = d.zoneX || 170;
            targetY = d.zoneY || (lineOfScrimmageY + (65 * dir));
          }
        }

        if (rb && d.assignedReceiver === rb && (phase === 'QB_DROP' || phase === 'THROWN')) {
          const rbTarget = rb;
          targetX = rbTarget.x;
          targetY = rbTarget.y + (12 * dir);
          moveSpeed = 1.72;
          moveAccel = 0.32;
        }

        if (d.defenseAssignment === 'MAN' && d.assignedReceiver) {
          targetX = d.assignedReceiver.x;
          targetY = d.assignedReceiver.y + (10 * dir);
          moveSpeed = 1.76;
          moveAccel = 0.32;
        } else if (d.defenseAssignment === 'ZONE') {
          const zoneX = d.zoneX ?? d.startX ?? d.x;
          const zoneY = d.zoneY ?? (lineOfScrimmageY + (80 * dir));
          const zoneTargets = [...receivers, centerReceiver]
            .filter((receiver): receiver is Entity => receiver !== null && !receiver.caught)
            .filter(receiver => Math.abs(receiver.x - zoneX) <= 65 && Math.abs(receiver.y - zoneY) <= 80)
            .sort((first, second) =>
              Math.hypot(first.x - d.x, first.y - d.y) - Math.hypot(second.x - d.x, second.y - d.y)
            );
          const zoneTarget = zoneTargets[0];
          targetX = zoneTarget ? zoneTarget.x : zoneX;
          targetY = zoneTarget ? zoneTarget.y + (8 * dir) : zoneY;
          moveSpeed = zoneTarget ? 1.72 : 1.5;
          moveAccel = zoneTarget ? 0.32 : 0.26;
        }

        // Only the coverage defenders nearest the catch point break toward the ball.
        if (phase === 'THROWN' && ball) {
          const distToBall = Math.hypot(ball.x - d.x, ball.y - d.y);
          if (ballPressureDefenders.includes(d) && distToBall < 100) {
            targetX = ball.x;
            targetY = ball.y;
            moveSpeed = 1.52;
            moveAccel = 0.26;
          }
        }

        targetX = Math.max(35, Math.min(fieldWidth - 35, targetX));
        targetY = Math.max(60, Math.min(fieldHeight - 60, targetY));

        if (phase === 'RUNNING' && activeEntity) {
          d.pursuitTimer = (d.pursuitTimer || 0) + 1;
          const distToRunner = Math.hypot(activeEntity.x - d.x, activeEntity.y - d.y);

          // Ever-increasing pursuit speed: continuously accelerates without low ceilings to hunt down breakaway runners
          const timeAcceleration = d.pursuitTimer * 0.045;
          const distanceUrgency = Math.max(0, (distToRunner - 35) * 0.008);
          const dynamicPursuitSpeed = baseSpeed + timeAcceleration + distanceUrgency;

          // Increased agility/responsiveness as defender gains speed
          const dynamicAccel = Math.min(0.45, 0.22 + (d.pursuitTimer * 0.0025));

          // Leading pursuit angle to cut off the runner's lane
          const leadY = activeEntity.y + (18 * dir);
          const targetEntityX = Math.max(25, Math.min(fieldWidth - 25, activeEntity.x));
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
      phase === 'RUNNING' ? activeEntity : null
    );

    if (phase === 'RUNNING' && activeEntity) {
      defenders.forEach(d => {
        if (phase !== 'RUNNING') return;
        if (!d) return;
        if ((d.brokenTackleStun || 0) > 0) {
          d.brokenTackleStun!--;
          return;
        }
        const dist = Math.hypot(activeEntity.x - d.x, activeEntity.y - d.y);
        if (dist < activeEntity.radius + d.radius + 4) {
          if ((activeEntity.tackleImmunity || 0) > 0) {
            d.brokenTackleStun = 45;
            d.pursuitTimer = 0;
            d.x += (d.x < activeEntity.x ? -30 : 30);
            d.y += (30 * attackDirection);
            screenShakeTimer = 15;
            return;
          }

          // BROKEN TACKLE EVALUATION for long gains!
          const brokenCount = activeEntity.brokenTacklesCount || 0;
          const isBoosted = (activeEntity.powerBoostTimer || 0) > 0;
          const isRB = activeEntity === rb;

          // Running backs and power-boosted ball carriers break tackles more frequently
          let breakChance = isRB ? 0.38 : 0.28;
          if (isBoosted) breakChance += 0.25; // Trucking boost
          if (brokenCount === 1) breakChance *= 0.6; // Second tackle break is harder
          if (brokenCount >= 2) breakChance = 0.12; // Rare third broken tackle

          const roll = Math.random();
          if (roll < breakChance) {
            // BROKEN TACKLE! Shed defender and explode for long breakaway gain
            activeEntity.brokenTacklesCount = brokenCount + 1;
            activeEntity.tackleImmunity = 42; // Immunity frames so runner clears defender
            activeEntity.powerBoostTimer = 55; // Speed burst for breakaway long gain!
            d.brokenTackleStun = 60; // Defender is stunned and knocked down/back
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
          const fumbleChance = 0.08; // 8% chance of fumble on tackle hit
          if (fumbleRoll < fumbleChance) {
            triggerFumble(activeEntity);
            return;
          }

          // Standard tackle
          screenShakeTimer = 25;
          phase = 'DEAD';
          handlePlayEnd(activeEntity.y, 'TACKLE');
        }
      });
    }

    if (ball) {
      ball.currentFrame++;
      ball.x += ball.vx;
      ball.y += ball.vy;

      const progress = ball.currentFrame / ball.flightFrames;
      ball.z = Math.sin(progress * Math.PI) * ball.maxZ;

      let playResolved = false;
      const eligibleCatchers = [...receivers, centerReceiver, rb].filter(Boolean) as Entity[];
      const distanceTraveledFromQB = Math.hypot(ball.x - ball.startX, ball.y - ball.startY);

      // 3D Ball Height Clearance Check (Passes safely sail over defenders if z > 22)
      if (distanceTraveledFromQB > 25 && progress > 0.18 && progress < 0.85) {
        defenders.forEach(d => {
          if (!playResolved && d && !d.passRusher) {
            const distToBall = Math.hypot(d.x - ball!.x, d.y - ball!.y);
            const maxDefenderReachZ = 22; // Leaping reach for underneath defenders in the slant lane
            if (distToBall < 18 && ball!.z <= maxDefenderReachZ) {
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
            if (minDefDist < 12 || defDistToBall < 11) {
              // TIGHT BLANKET COVERAGE (< 12px)
              const roll = Math.random();
              if (roll < 0.25) {
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
            } else if (minDefDist < 20) {
              // MODERATE / TIGHT NFL WINDOW (12px - 20px)
              const roll = Math.random();
              if (roll < 0.72) {
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
    const baseScrimmageCamY = Math.max(0, Math.min(fieldHeight - 450, lineOfScrimmageY - 210));
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
    const maxCamY = fieldHeight - currentViewHeight;
    const minCamY = 0;
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
    ctx!.strokeStyle = '#00ffff';
    ctx!.lineWidth = 4;
    ctx!.beginPath();
    ctx!.moveTo(r.startX, r.startY);
    const dir = attackDirection;

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
    ctx.fillRect(20, endZoneHeight, fieldWidth - 40, fieldHeight - 2 * endZoneHeight);

    // Sideline boundaries
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(20, 0); ctx.lineTo(20, fieldHeight);
    ctx.moveTo(fieldWidth - 20, 0); ctx.lineTo(fieldWidth - 20, fieldHeight);
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

    // Forward-projecting aiming vector visualizer (slingshot aim)
    if (isAiming && phase === 'QB_DROP' && activeOffense === 'P1') {
      const pullScreenX = aimScreenCurrentX - touchScreenStartX;
      const pullScreenY = aimScreenCurrentY - touchScreenStartY;
      const projX = qb.x - pullScreenX;
      const projY = qb.y - pullScreenY;

      ctx.strokeStyle = '#ffcc00';
      ctx.lineWidth = 3 / cameraScale;
      ctx.beginPath();
      ctx.moveTo(qb.x, qb.y);
      ctx.lineTo(projX, projY);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 204, 0, 0.45)';
      ctx.beginPath();
      ctx.arc(projX, projY, 16 / cameraScale, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 / cameraScale;
      ctx.beginPath();
      ctx.arc(projX, projY, 16 / cameraScale, 0, Math.PI * 2);
      ctx.stroke();
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
      if (rb && rb.hasBall) {
        ctx.fillStyle = '#d2691e';
        ctx.beginPath();
        ctx.arc(rb.x + 10, rb.y + 2, 4, 0, Math.PI * 2);
        ctx.fill();
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
    }

    // Defenders
    defenders.forEach(d => {
      if (!d) return;
      ctx.fillStyle = d.color || '#ff3333';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (activeDefense === 'P1' && d.defenseAssignment) {
        const assignmentColor = d.defenseAssignment === 'BLITZ'
          ? '#00ff66'
          : d.defenseAssignment === 'MAN'
            ? '#ffcc00'
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
    });

    // Football
    if (ball) {
      const renderRadius = Math.max(5, 11 - ((ball.z || 0) * 0.12));
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.beginPath();
      ctx.arc(ball.x, ball.y - (ball.z || 0), renderRadius + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d2691e';
      ctx.beginPath();
      ctx.arc(ball.x, ball.y - (ball.z || 0), renderRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
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
