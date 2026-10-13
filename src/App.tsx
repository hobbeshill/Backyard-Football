import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, RefreshCw, HelpCircle, X, Users, Shield, ArrowRight, Search, Pause, Play, Home, Hand, Crosshair, Trophy, Award, RotateCcw, Zap, BookOpen, SlidersHorizontal, Info, Settings, ArrowLeft, Copy, Check } from 'lucide-react';
import { offensivePlaybook, defensivePlaybook } from './game/playbook';
import { sounds } from './game/sound';
import { isLiveBallAnnouncement, shouldShowAnnouncement } from './game/announcements';
import { createEmptyTeamGameStats, hasSavedGameSession, mountFootballGame, type GameBoxScore, type GameEngineHandle } from './game/engine';
import { TEAM_KEYS, TEAMS, getAllTeams, getTeam, type TeamProfile } from './game/teams';
import { createSeason, getSeasonRecord, loadGameMode, loadSeasonProgress, recordSeasonGame, saveGameMode, saveSeasonProgress, type GameMode, type SeasonProgress } from './game/season';
import { getRivalryForMatchup, type RivalryGame } from './game/rivalries';
import type { TacticalMode } from './game/types';
import { PRO_OFFENSE_PLAYS, PRO_DEFENSE_PLAYS, type ProOffensePlayId, type ProDefensePlayId } from './game/proMode';
import { getTecmoPlaysForTeam } from './game/tecmoPlaybook';
import { PLAYER_TRAIT_COLORS } from './game/roster';
import { getTeamPlaybook, getTeamOffensePlays, getTeamDefensePlays } from './game/teamPlaybooks';
import type { LobbyRoom } from './game/multiplayer';

const HelmetSpritePreview = lazy(() => import('./game/HelmetSpritePreview').then(module => ({
  default: module.HelmetSpritePreview
})));
const RealPlayTutorial = lazy(() => import('./game/RealPlayTutorial').then(module => ({
  default: module.RealPlayTutorial
})));
const TecmoPlaybookCards = lazy(() => import('./game/TecmoPlaybookCards').then(module => ({
  default: module.TecmoPlaybookCards
})));

type MultiplayerModule = typeof import('./game/multiplayer');
let loadedMultiplayer: MultiplayerModule | null = null;
let multiplayerPromise: Promise<MultiplayerModule> | null = null;

function loadMultiplayer(): Promise<MultiplayerModule> {
  if (loadedMultiplayer) return Promise.resolve(loadedMultiplayer);
  multiplayerPromise ??= import('./game/multiplayer').then(module => {
    loadedMultiplayer = module;
    return module;
  }).catch(error => {
    multiplayerPromise = null;
    throw error;
  });
  return multiplayerPromise;
}

function sendOnlineAction(action: unknown): void {
  if (loadedMultiplayer) {
    loadedMultiplayer.sendGameAction(action);
    return;
  }
  void loadMultiplayer()
    .then(module => module.sendGameAction(action))
    .catch(error => console.error('Could not load online action support.', error));
}

function sendOnlineInput(input: unknown): void {
  if (loadedMultiplayer) {
    loadedMultiplayer.sendGameInput(input);
    return;
  }
  void loadMultiplayer()
    .then(module => module.sendGameInput(input))
    .catch(error => console.error('Could not load online input support.', error));
}

function getTeamTextStyle(color: string) {
  const hex = color.replace('#', '');
  const channels = [0, 2, 4].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const luminance = channels
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);

  return {
    color,
    backgroundColor: luminance < 0.18 ? '#f2f5f2' : undefined
  };
}

const CONTROLS_TUTORIAL_KEY = 'backyard-football-pro-tutorial-complete-v2';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // UI States
  const [userScore, setUserScore] = useState(0);
  const [cpuScore, setCpuScore] = useState(0);
  const [downDistanceText, setDownDistanceText] = useState('1st & 10 at OWN 20');
  const [p1OffPlayState, setP1OffPlayState] = useState(() => getTecmoPlaysForTeam('ALABAMA')[0].id);
  const [p1OffFormationState, setP1OffFormationState] = useState<'SPREAD' | 'STACK' | 'TRIPS'>('SPREAD');
  const [p1DefPlayState, setP1DefPlayState] = useState(() => getTecmoPlaysForTeam('GEORGIA')[0].id);
  const [p2OffPlayState, setP2OffPlayState] = useState(() => getTecmoPlaysForTeam('GEORGIA')[0].id);
  const [p2DefPlayState, setP2DefPlayState] = useState(() => getTecmoPlaysForTeam('ALABAMA')[0].id);
  const [activeOffenseState, setActiveOffenseState] = useState('P1');
  const [p1TeamState, setP1TeamState] = useState<TeamProfile>(TEAMS.ALABAMA);
  const [p2TeamState, setP2TeamState] = useState<TeamProfile>(TEAMS.GEORGIA);
  const [teamSelectionSide, setTeamSelectionSide] = useState<'P1' | 'P2'>('P1');
  const [pendingTeam, setPendingTeam] = useState<TeamProfile | null>(null);
  const [teamSearch, setTeamSearch] = useState('');
  const [showTeamModal, setShowTeamModal] = useState(() => !hasSavedGameSession());
  const [setupStep, setSetupStep] = useState<'MODE' | 'TEAMS'>('MODE');
  const [selectedDefenderIdx, setSelectedDefenderIdx] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [hasKickedOff, setHasKickedOff] = useState(hasSavedGameSession);
  const [showPauseMenu, setShowPauseMenu] = useState(hasSavedGameSession);
  const [showDynastyPreview, setShowDynastyPreview] = useState(false);
  const [gameMode, setGameMode] = useState<GameMode>(() => loadGameMode());
  const [seasonProgress, setSeasonProgress] = useState<SeasonProgress | null>(() => loadSeasonProgress());
  const [showSeasonChoiceModal, setShowSeasonChoiceModal] = useState(false);
  const [isStartingNewSeason, setIsStartingNewSeason] = useState(false);
  const [finishedGame, setFinishedGame] = useState<{ p1Score: number; p2Score: number; restored: boolean; boxScore: GameBoxScore } | null>(null);
  const finishedGameHandledRef = useRef(false);
  const gameModeRef = useRef(gameMode);
  const seasonProgressRef = useRef(seasonProgress);
  const [isKickoffActive, setIsKickoffActive] = useState(true);
  const [kickoffSide, setKickoffSide] = useState<{ kicking: 'P1' | 'P2'; receiving: 'P1' | 'P2' }>({ kicking: 'P2', receiving: 'P1' });
  const [is4thDown, setIs4thDown] = useState(false);
  const [fgMeterState, setFgMeterState] = useState<{ stage: 'AIM' | 'POWER' | 'KICKING'; aim: number; power: number; distanceYards: number } | null>(null);
  const [tacticalMode, setTacticalMode] = useState<TacticalMode>('PRO');
  const [showPlaybookCards, setShowPlaybookCards] = useState(false);
  const [showElitePlaybook, setShowElitePlaybook] = useState(false);
  const playbookCallSelectedRef = useRef(false);
  const [phaseState, setPhaseState] = useState('PRE_SNAP');
  const [kickMeterPower, setKickMeterPower] = useState(0.55);
  const [momentumState, setMomentumState] = useState(0);
  const [turboMeter, setTurboMeter] = useState(100);
  const [isTurboActive, setIsTurboActive] = useState(false);
  const [isDefenderOnFire, setIsDefenderOnFire] = useState(false);
  const [gameClockState, setGameClockState] = useState({ quarter: 1, seconds: 120 });
  // Online Multiplayer States
  const [showOnlineLobby, setShowOnlineLobby] = useState(false);
  const [onlineLobby, setOnlineLobby] = useState<LobbyRoom | null>(null);
  const [onlineRole, setOnlineRole] = useState<'host' | 'guest' | null>(null);
  const onlineRoleRef = useRef<'host' | 'guest' | null>(null);
  const [onlineName, setOnlineName] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        return window.localStorage?.getItem('player_display_name') || 'Player 1';
      } catch {
        return 'Player 1';
      }
    }
    return 'Player 1';
  });
  const [onlineTeamId, setOnlineTeamId] = useState('ALABAMA');
  const [lobbyCodeInput, setLobbyCodeInput] = useState('');
  const [onlineError, setOnlineError] = useState('');
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [copiedLobbyCode, setCopiedLobbyCode] = useState(false);
  const [banner, setBanner] = useState<{
    text: string;
    color: string;
    visible: boolean;
    big: boolean;
    category: 'TURNOVER' | 'TOUCHDOWN' | 'FIRST_DOWN' | 'SAFETY' | 'FUMBLE' | 'SACK' | 'SPECIAL_TEAMS' | 'INFO';
    subtext?: string;
    possessionTeam?: 'P1' | 'P2';
    durationMs: number;
    priority: number;
    key: number;
  }>({
    text: '',
    color: '#ffcc00',
    visible: false,
    big: false,
    category: 'INFO',
    durationMs: 2800,
    priority: 1,
    key: 0
  });
  const [screenVignette, setScreenVignette] = useState<'TURNOVER' | 'TOUCHDOWN' | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const tutorialResumeRef = useRef(false);
  const settingsResumeRef = useRef(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Synchronize sound toggle
  const toggleSound = () => {
    sounds.enabled = !soundEnabled;
    setSoundEnabled(!soundEnabled);
  };

  // Banner timeout refs and priority protection
  const bannerTimeoutRef = useRef<any>(null);
  const vignetteTimeoutRef = useRef<any>(null);
  const activePriorityRef = useRef<number>(0);
  const bannerCreatedAtRef = useRef<number>(0);
  const phaseStateRef = useRef(phaseState);
  const queuedAnnouncementRef = useRef<typeof banner | null>(null);

  const displayAnnouncement = (announcement: typeof banner) => {
    const now = Date.now();
    if (activePriorityRef.current >= 3 && announcement.priority < 3 && now - bannerCreatedAtRef.current < 3800) {
      return;
    }

    activePriorityRef.current = announcement.priority;
    bannerCreatedAtRef.current = now;
    if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);

    if (announcement.category === 'TURNOVER' || announcement.category === 'TOUCHDOWN') {
      if (vignetteTimeoutRef.current) clearTimeout(vignetteTimeoutRef.current);
      setScreenVignette(announcement.category);
      vignetteTimeoutRef.current = setTimeout(() => setScreenVignette(null), 1600);
    }

    setBanner({ ...announcement, visible: true, key: now });
    bannerTimeoutRef.current = setTimeout(() => {
      setBanner(prev => ({ ...prev, visible: false }));
      activePriorityRef.current = 0;
    }, announcement.durationMs);
  };

  const showAnnouncement = (
    text: string,
    color = '#ffcc00',
    big = false,
    meta?: {
      category?: 'TURNOVER' | 'TOUCHDOWN' | 'FIRST_DOWN' | 'SAFETY' | 'FUMBLE' | 'SACK' | 'SPECIAL_TEAMS' | 'INFO';
      subtext?: string;
      durationMs?: number;
      possessionTeam?: 'P1' | 'P2';
    }
  ) => {
    const upper = text.toUpperCase();

    if (!shouldShowAnnouncement(text, meta?.category)) return;

    let category = meta?.category;
    let priority = 1;
    let defaultDuration = 2800;

    if (!category) {
      if (
        upper.includes('TURNOVER') ||
        upper.includes('INTERCEPT') ||
        upper.includes('PICKED OFF') ||
        upper.includes('PICK-SIX')
      ) {
        category = 'TURNOVER';
      } else if (upper.includes('TOUCHDOWN')) {
        category = 'TOUCHDOWN';
      } else if (upper.includes('FIRST DOWN')) {
        category = 'FIRST_DOWN';
      } else if (upper.includes('FUMBLE')) {
        category = upper.includes('RECOVER') ? 'TURNOVER' : 'FUMBLE';
      } else if (upper.includes('SACK') || upper.includes('SAFETY')) {
        category = 'SACK';
      } else if (upper.includes('KICKOFF') || upper.includes('PUNT') || upper.includes('TOUCHBACK')) {
        category = 'SPECIAL_TEAMS';
      } else {
        category = 'INFO';
      }
    }

    if (category === 'TURNOVER' || category === 'TOUCHDOWN') {
      priority = 3;
      defaultDuration = 5500;
    } else if (category === 'FIRST_DOWN' || category === 'FUMBLE' || category === 'SACK' || big) {
      priority = 2;
      defaultDuration = 4000;
    }

    const duration = meta?.durationMs || defaultDuration;
    const announcement = {
      text,
      color,
      visible: true,
      big: big || priority >= 2,
      category,
      subtext: meta?.subtext,
      possessionTeam: meta?.possessionTeam,
      durationMs: duration,
      priority,
      key: 0
    };

    if (!isLiveBallAnnouncement(text, category) && phaseStateRef.current !== 'PRE_SNAP' && phaseStateRef.current !== 'DEAD') {
      const queuedAnnouncement = queuedAnnouncementRef.current;
      if (!queuedAnnouncement || announcement.priority >= queuedAnnouncement.priority) {
        queuedAnnouncementRef.current = announcement;
      }
      return;
    }

    if (isLiveBallAnnouncement(text, category)) queuedAnnouncementRef.current = null;
    displayAnnouncement(announcement);
  };

  // Schematic rendering helper for playbook cards
  const drawCardSchematic = (canvas: HTMLCanvasElement | null, playKey: string, isDefense: boolean) => {
    if (!canvas) return;
    const cx = canvas.getContext('2d');
    if (!cx) return;
    cx.clearRect(0, 0, canvas.width, canvas.height);

    cx.strokeStyle = '#fff';
    cx.lineWidth = 1;
    cx.beginPath();
    cx.moveTo(0, canvas.height / 2);
    cx.lineTo(canvas.width, canvas.height / 2);
    cx.stroke();

    if (!isDefense) {
      const alignment = offensivePlaybook[playKey]?.alignment || 'SPREAD';
      const positions = alignment === 'STACK'
        ? [26, 37, 79]
        : alignment === 'TRIPS'
          ? [62, 74, 84]
          : [12, 59, 88];

      cx.fillStyle = '#ffcc00';
      cx.beginPath();
      cx.arc(canvas.width / 2, canvas.height / 2 + 14, 3.5, 0, Math.PI * 2);
      cx.fill();
      cx.fillStyle = '#00ffff';
      const play = offensivePlaybook[playKey];
      const isCenterBlocker = play?.center === 'BLOCK';
      positions.forEach((position, index) => {
        const x = canvas.width * position / 100;
        const y = canvas.height / 2;
        cx.beginPath();
        cx.arc(x, y, 3.5, 0, Math.PI * 2);
        cx.fill();
        if (index === 1 && isCenterBlocker) {
          // Center assigned block on run plays: white horizontal bar across top
          cx.strokeStyle = '#ffffff';
          cx.lineWidth = 1.6;
          cx.beginPath();
          cx.moveTo(x - 5.5, y - 4);
          cx.lineTo(x + 5.5, y - 4);
          cx.stroke();
        } else {
          cx.strokeStyle = '#00ffff';
          cx.lineWidth = 1.2;
          cx.beginPath();
          cx.moveTo(x, y);
          const destX = index === 0 ? x - 8 : (index === 1 ? x + 2 : x + 8);
          cx.lineTo(destX, 8 + index * 3);
          cx.stroke();
        }
      });
      cx.fillStyle = '#00ffaa';
      cx.beginPath();
      cx.arc(alignment === 'TRIPS' ? 22 : canvas.width - 22, canvas.height / 2 + 12, 3, 0, Math.PI * 2);
      cx.fill();
    } else {
      const drawDefender = (x: number, y: number, fill = '#ff6666') => {
        cx.fillStyle = fill;
        cx.beginPath();
        cx.arc(x, y, 3.4, 0, Math.PI * 2);
        cx.fill();
      };

      const drawZoneLine = (x1: number, y1: number, x2: number, y2: number) => {
        cx.strokeStyle = '#ff6666';
        cx.lineWidth = 1.1;
        cx.setLineDash([2, 2]);
        cx.beginPath();
        cx.moveTo(x1, y1);
        cx.lineTo(x2, y2);
        cx.stroke();
        cx.setLineDash([]);
      };

      const landmarks = defensivePlaybook[playKey]?.landmarks;
      if (landmarks) {
        landmarks.forEach(landmark => {
          const x = landmark.x * canvas.width / 340;
          const y = canvas.height / 2 - landmark.depth * 0.05;
          drawDefender(x, y, landmark.assignment === 'BLITZ' ? '#ff3333' : '#ffcccc');
          if (landmark.assignment === 'ZONE') {
            drawZoneLine(x, y, x, canvas.height / 2 - landmark.zoneDepth * 0.05);
          }
        });
      } else if (playKey === 'COVER2') {
        drawDefender(50, canvas.height / 2 - 14, '#ff3333');
        drawDefender(18, canvas.height / 2 + 4, '#ff6666');
        drawDefender(82, canvas.height / 2 + 4, '#ff6666');
        drawDefender(42, canvas.height / 2 + 4, '#ffcccc');
        drawDefender(58, canvas.height / 2 + 4, '#ffcccc');
        drawDefender(38, canvas.height / 2 + 19, '#ff6666');
        drawDefender(62, canvas.height / 2 + 19, '#ff6666');
        drawZoneLine(18, canvas.height / 2 + 4, 18, canvas.height - 8);
        drawZoneLine(82, canvas.height / 2 + 4, 82, canvas.height - 8);
      } else if (playKey === 'ZONE34') {
        drawDefender(32, canvas.height / 2 - 14, '#ff3333');
        drawDefender(50, canvas.height / 2 - 14, '#ff3333');
        drawDefender(68, canvas.height / 2 - 14, '#ff3333');
        drawDefender(18, canvas.height / 2 + 5, '#ff6666');
        drawDefender(82, canvas.height / 2 + 5, '#ff6666');
        drawDefender(39, canvas.height / 2 + 18, '#ffcccc');
        drawDefender(61, canvas.height / 2 + 18, '#ffcccc');
      } else if (playKey === 'ZONE232') {
        drawDefender(42, canvas.height / 2 - 14, '#ff3333');
        drawDefender(58, canvas.height / 2 - 14, '#ff3333');
        drawDefender(18, canvas.height / 2 + 5, '#ff6666');
        drawDefender(50, canvas.height / 2 + 5, '#ff6666');
        drawDefender(82, canvas.height / 2 + 5, '#ff6666');
        drawDefender(39, canvas.height / 2 + 18, '#ffcccc');
        drawDefender(61, canvas.height / 2 + 18, '#ffcccc');
      } else if (playKey === 'ZONE151') {
        drawDefender(50, canvas.height / 2 - 14, '#ff3333');
        drawDefender(18, canvas.height / 2 + 4, '#ff6666');
        drawDefender(34, canvas.height / 2 + 4, '#ff6666');
        drawDefender(50, canvas.height / 2 + 4, '#ff6666');
        drawDefender(66, canvas.height / 2 + 4, '#ff6666');
        drawDefender(82, canvas.height / 2 + 4, '#ff6666');
        drawDefender(50, canvas.height / 2 + 19, '#ffcccc');
      } else if (playKey === 'MAN_FREE') {
        drawDefender(50, canvas.height / 2 - 14, '#ff3333');
        [18, 34, 50, 66, 82].forEach(x => drawDefender(x, canvas.height / 2 + 4));
        drawDefender(50, canvas.height / 2 + 19, '#ffcccc');
      } else if (playKey === 'DEEP_THIRDS') {
        drawDefender(50, canvas.height / 2 - 14, '#ff3333');
        [25, 50, 75].forEach(x => drawDefender(x, canvas.height / 2 + 4));
        [18, 50, 82].forEach(x => drawDefender(x, canvas.height / 2 + 19, '#ffcccc'));
      } else {
        drawDefender(50, canvas.height / 2 - 14, '#ff3333');
        drawDefender(18, canvas.height / 2 + 4, '#ff6666');
        drawDefender(34, canvas.height / 2 + 4, '#ff6666');
        drawDefender(50, canvas.height / 2 + 4, '#ff6666');
        drawDefender(66, canvas.height / 2 + 4, '#ff6666');
        drawDefender(82, canvas.height / 2 + 4, '#ff6666');
        drawDefender(50, canvas.height / 2 + 19, '#ffcccc');
      }
    }
  };

  // Keep ref to mutable game engine to avoid stale closures in requestAnimationFrame
  const engineRef = useRef<GameEngineHandle | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return mountFootballGame(canvas, {
      setP2OffPlayState,
      setP2DefPlayState,
      setDownDistanceText,
      setActiveOffenseState,
      setPhaseState: phase => {
        phaseStateRef.current = phase;
        setPhaseState(phase);
        if (phase !== 'DEAD' && phase !== 'PRE_SNAP') {
          if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
          if (vignetteTimeoutRef.current) clearTimeout(vignetteTimeoutRef.current);
          activePriorityRef.current = 0;
          setBanner(previous => ({ ...previous, visible: false }));
          setScreenVignette(null);
          return;
        }
        if ((phase === 'DEAD' || phase === 'PRE_SNAP') && queuedAnnouncementRef.current) {
          const announcement = queuedAnnouncementRef.current;
          queuedAnnouncementRef.current = null;
          displayAnnouncement(announcement);
        }
      },
      setTacticalModeState: setTacticalMode,
      setUserScore,
      setCpuScore,
      setP1DefPlayState,
      setP1OffFormationState,
      setMomentumState,
      setP1TeamState,
      setP2TeamState,
      setGameClockState: (quarter, seconds) => setGameClockState({ quarter, seconds }),
      showAnnouncement,
      onOnlineAction: action => {
        if (onlineRoleRef.current === 'guest') sendOnlineAction(action);
      },
      onOnlineInput: (dx, dy, active) => {
        if (onlineRoleRef.current === 'guest') sendOnlineInput({ dx, dy, active });
      },
      onEngineReady: engine => {
        engineRef.current = engine;
        engine?.setTacticalMode?.('PRO');
      },
      onGameOver: (p1FinalScore, p2FinalScore, restored, boxScore) => {
        engineRef.current?.setOnlineGuestControl?.(false);
        engineRef.current?.setOnlinePlayerSide?.('P1');
        engineRef.current?.setNetworkMirror?.(false);
        engineRef.current?.applyRemoteInput?.(0, 0, false);
        engineRef.current?.applyLocalInput?.(0, 0, false);
        setFinishedGame({
          p1Score: p1FinalScore,
          p2Score: p2FinalScore,
          restored: Boolean(restored),
          boxScore: boxScore ?? {
            p1Quarters: [0, 0, 0, 0],
            p2Quarters: [0, 0, 0, 0],
            p1Stats: createEmptyTeamGameStats(),
            p2Stats: createEmptyTeamGameStats()
          }
        });
      },
      setIsKickoffState: (isKickoff, kicking, receiving) => {
        setIsKickoffActive(isKickoff);
        setKickoffSide({ kicking, receiving });
      },
      setIs4thDownState: (val) => setIs4thDown(val),
      setKickMeterPowerState: (power) => setKickMeterPower(power),
      setFieldGoalMeterState: (state) => setFgMeterState(state),
      onTurboChange: (meter, active) => {
        setTurboMeter(meter);
        setIsTurboActive(active);
      },
      onDefenderOnFireChange: (onFire) => {
        setIsDefenderOnFire(onFire);
      },
      onControlledDefenderChange: (index) => {
        setSelectedDefenderIdx(index);
      },
      setP1OffPlayState
    });
  }, []);

  useEffect(() => {
    if (showPauseMenu) engineRef.current?.setPaused(true);
  }, [showPauseMenu]);

  useEffect(() => {
    if (showSettings) {
      settingsResumeRef.current = hasKickedOff && !showPauseMenu;
      engineRef.current?.setPaused(true);
    } else if (settingsResumeRef.current) {
      settingsResumeRef.current = false;
      if (!showPauseMenu && !showTutorial) engineRef.current?.setPaused(false);
    }
  }, [showSettings, hasKickedOff, showPauseMenu, showTutorial]);

  useEffect(() => {
    if (!showTutorial) return;
    tutorialResumeRef.current = hasKickedOff && !showPauseMenu;
    engineRef.current?.setPaused(true);
  }, [showTutorial, hasKickedOff, showPauseMenu]);

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.visibilityState === 'hidden' && hasKickedOff) {
        engineRef.current?.setPaused(true);
        setShowPauseMenu(true);
      }
    };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden);
  }, [hasKickedOff]);

  // Online Multiplayer Socket.io lifecycle
  useEffect(() => {
    if (typeof window === 'undefined' || (!showOnlineLobby && !onlineRole)) return;
    let disposed = false;
    let removeListeners: (() => void) | undefined;

    const onLobbyUpdated = (lobby: LobbyRoom) => {
      setOnlineLobby(lobby);
      setOnlineError('');
    };

    const onMatchStart = (payload: { code: string; hostTeamId: string; guestTeamId: string; hostName: string; guestName: string }) => {
      setShowOnlineLobby(false);
      setShowTeamModal(false);
      setShowPauseMenu(false);
      const hostTeam = getTeam(payload.hostTeamId);
      const guestTeam = getTeam(payload.guestTeamId);
      setP1TeamState(hostTeam);
      setP2TeamState(guestTeam);
      engineRef.current?.selectP1Team(hostTeam.id);
      engineRef.current?.selectP2Team(guestTeam.id);
      engineRef.current?.setOnlineGuestControl?.(true);
      engineRef.current?.setOnlinePlayerSide?.(onlineRoleRef.current === 'guest' ? 'P2' : 'P1');
      engineRef.current?.setNetworkMirror?.(onlineRoleRef.current === 'guest');
      engineRef.current?.resetGame();
      setHasKickedOff(true);
      showAnnouncement(`ONLINE MATCH: ${hostTeam.nickname.toUpperCase()} VS ${guestTeam.nickname.toUpperCase()} 🏈`, '#00ffff', true);
    };

    const onGameAction = (action: any) => {
      if (onlineRoleRef.current === 'host') {
        engineRef.current?.applyRemoteAction?.(action);
      } else if (onlineRoleRef.current === 'guest') {
        if (action?.type === 'START') {
          engineRef.current?.startPlay?.();
        } else if (action?.type === 'OFFENSE_PLAY') {
          setP1OffPlayState(action.play);
        } else if (action?.type === 'DEFENSE_PLAY') {
          setP1DefPlayState(action.play);
        }
      }
    };

    const onGameInput = (input: any) => {
      if (onlineRoleRef.current === 'host') {
        engineRef.current?.applyRemoteInput?.(input.dx, input.dy, input.active);
      }
    };

    const onGameSync = (state: any) => {
      if (onlineRoleRef.current === 'guest') {
        if (state.snapshot) {
          engineRef.current?.applyNetworkSnapshot?.(state.snapshot);
          return;
        }
        if (typeof state.userScore === 'number') setUserScore(state.userScore);
        if (typeof state.cpuScore === 'number') setCpuScore(state.cpuScore);
        if (state.downDistanceText) setDownDistanceText(state.downDistanceText);
        if (state.phase) setPhaseState(state.phase);
        if (typeof state.is4thDown === 'boolean') setIs4thDown(state.is4thDown);
        if (typeof state.isKickoffActive === 'boolean') setIsKickoffActive(state.isKickoffActive);
        if (state.clock) setGameClockState(state.clock);
      }
    };

    const onPeerDisconnected = (data: { message: string }) => {
      engineRef.current?.setOnlineGuestControl?.(false);
      engineRef.current?.setOnlinePlayerSide?.('P1');
      engineRef.current?.setNetworkMirror?.(false);
      engineRef.current?.applyRemoteInput?.(0, 0, false);
      engineRef.current?.applyLocalInput?.(0, 0, false);
      setOnlineLobby(null);
      setOnlineRole(null);
      onlineRoleRef.current = null;
      setShowOnlineLobby(false);
      showAnnouncement(data?.message || 'Online opponent disconnected', '#ff4444', true);
      setOnlineError(data?.message || 'Opponent disconnected');
    };

    void loadMultiplayer()
      .then(module => {
        if (disposed) return;
        const socket = module.getMultiplayerSocket();
        socket.on('lobby:updated', onLobbyUpdated);
        socket.on('match:start', onMatchStart);
        socket.on('game:action', onGameAction);
        socket.on('game:input', onGameInput);
        socket.on('game:sync', onGameSync);
        socket.on('peer:disconnected', onPeerDisconnected);
        removeListeners = () => {
          socket.off('lobby:updated', onLobbyUpdated);
          socket.off('match:start', onMatchStart);
          socket.off('game:action', onGameAction);
          socket.off('game:input', onGameInput);
          socket.off('game:sync', onGameSync);
          socket.off('peer:disconnected', onPeerDisconnected);
        };
      })
      .catch(error => {
        if (!disposed) setOnlineError(`Online multiplayer failed to load: ${error instanceof Error ? error.message : String(error)}`);
      });

    return () => {
      disposed = true;
      removeListeners?.();
    };
  }, [onlineRole, showOnlineLobby]);

  // Host synchronizes authoritative state to guest periodically
  useEffect(() => {
    if (onlineRole !== 'host') return;
    const interval = setInterval(() => {
      loadedMultiplayer?.sendGameSync({
        snapshot: engineRef.current?.getNetworkSnapshot?.(),
        userScore,
        cpuScore,
        downDistanceText,
        phase: phaseState,
        is4thDown,
        isKickoffActive,
        clock: gameClockState
      });
    }, 33);
    return () => clearInterval(interval);
  }, [onlineRole, userScore, cpuScore, downDistanceText, phaseState, is4thDown, isKickoffActive, gameClockState]);

  const handleCreateOnlineLobby = async () => {
    setOnlineBusy(true);
    setOnlineError('');
    try {
      window.localStorage?.setItem('player_display_name', onlineName);
    } catch {}
    try {
      const multiplayer = await loadMultiplayer();
      const res = await multiplayer.createLobby(onlineName, onlineTeamId || p1TeamState.id);
      if (res.success && res.lobby) {
        setOnlineLobby(res.lobby);
        setOnlineRole('host');
        onlineRoleRef.current = 'host';
      } else {
        setOnlineError(res.error || 'Failed to create lobby');
      }
    } catch (error) {
      setOnlineError(`Online multiplayer failed to load: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setOnlineBusy(false);
    }
  };

  const handleJoinOnlineLobby = async () => {
    if (!lobbyCodeInput.trim()) return;
    setOnlineBusy(true);
    setOnlineError('');
    try {
      window.localStorage?.setItem('player_display_name', onlineName);
    } catch {}
    try {
      const multiplayer = await loadMultiplayer();
      const res = await multiplayer.joinLobby(lobbyCodeInput.trim().toUpperCase(), onlineName, onlineTeamId || p2TeamState.id);
      if (res.success && res.lobby) {
        setOnlineLobby(res.lobby);
        setOnlineRole('guest');
        onlineRoleRef.current = 'guest';
      } else {
        setOnlineError(res.error || 'Failed to join lobby');
      }
    } catch (error) {
      setOnlineError(`Online multiplayer failed to load: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setOnlineBusy(false);
    }
  };

  const handleStartOnlineMatch = () => {
    void loadMultiplayer()
      .then(module => module.startOnlineMatch())
      .catch(error => setOnlineError(`Online multiplayer failed to load: ${error instanceof Error ? error.message : String(error)}`));
  };

  const handleLeaveOnlineLobby = () => {
    void loadMultiplayer()
      .then(module => module.leaveLobby())
      .catch(error => console.error('Could not leave online lobby cleanly.', error));
    engineRef.current?.setOnlineGuestControl?.(false);
    engineRef.current?.setOnlinePlayerSide?.('P1');
    engineRef.current?.setNetworkMirror?.(false);
    engineRef.current?.applyRemoteInput?.(0, 0, false);
    engineRef.current?.applyLocalInput?.(0, 0, false);
    setOnlineLobby(null);
    setOnlineRole(null);
    onlineRoleRef.current = null;
    setShowOnlineLobby(false);
  };

  const sendRemoteAction = (action: any) => {
    sendOnlineAction(action);
  };

  const selectOnlinePlay = (play: string, onOffense: boolean) => {
    if (onlineRole === 'guest') {
      if (onOffense) {
        setP2OffPlayState(play);
        sendRemoteAction({ type: 'OFFENSE_PLAY', play });
      } else {
        setP2DefPlayState(play);
        sendRemoteAction({ type: 'DEFENSE_PLAY', play });
      }
    } else if (onOffense) {
      engineRef.current?.selectOffense(play);
    } else {
      engineRef.current?.selectDefense(play);
    }
  };

  // Handlers for switching teams
  const handleSelectP1Team = (teamId: string) => {
    if (engineRef.current) {
      engineRef.current.selectP1Team(teamId);
    }
    const defOff = getTecmoPlaysForTeam(teamId)[0].id;
    setP1OffPlayState(defOff);
    engineRef.current?.selectOffense(defOff);
    if (gameModeRef.current === 'SEASON') {
      const currentSeason = seasonProgressRef.current;
      const nextSeason = currentSeason?.teamId === teamId
        ? currentSeason
        : createSeason(teamId, TEAM_KEYS);
      seasonProgressRef.current = nextSeason;
      setSeasonProgress(nextSeason);
      const nextOpponentId = nextSeason.opponentIds[nextSeason.results.length] || nextSeason.opponentIds[0];
      if (nextOpponentId) {
        const opponent = getTeam(nextOpponentId);
        setP2TeamState(opponent);
        engineRef.current?.selectP2Team(nextOpponentId);
        const defDef = getTecmoPlaysForTeam(nextOpponentId)[0].id;
        setP1DefPlayState(defDef);
        engineRef.current?.selectDefense(defDef);
      }
    }
  };

  const handleSelectP2Team = (teamId: string) => {
    if (engineRef.current) {
      engineRef.current.selectP2Team(teamId);
    }
    const defDef = getTecmoPlaysForTeam(teamId)[0].id;
    setP1DefPlayState(defDef);
    engineRef.current?.selectDefense(defDef);
  };

  // Handlers for user changing offensive/defensive plays
  const handleSelectOffensePlay = (key: string) => {
    if (activeOffenseState === 'P1' && engineRef.current?.phase === 'PRE_SNAP' &&
      !engineRef.current.isKickoffActive() && (key !== 'PUNT' || is4thDown)) {
      setP1OffPlayState(key);
      engineRef.current.selectOffense(key);
    }
  };

  const handleSelectDefensePlay = (key: string) => {
    if (activeOffenseState === 'P2') {
      if (engineRef.current) {
        setP1DefPlayState(key);
        engineRef.current.selectDefense(key);
      }
    }
  };

  const handleSetTacticalMode = (mode: TacticalMode) => {
    if (hasKickedOff) return;
    setTacticalMode(mode);
    engineRef.current?.setTacticalMode?.(mode);
  };

  const handleResetGame = () => {
    setUserScore(0);
    setCpuScore(0);
    if (engineRef.current) {
      engineRef.current.resetGame();
      showAnnouncement("GAME RESET - P1 BALL 1ST & 10", "#00ffff");
    }
  };

  const handleStartGame = () => {
    if (gameMode === 'DYNASTY') {
      setShowDynastyPreview(true);
      return;
    }
    finishedGameHandledRef.current = false;
    setFinishedGame(null);
    saveGameMode(gameMode);
    gameModeRef.current = gameMode;
    if (gameMode === 'SEASON') {
      let currentSeason = seasonProgressRef.current;
      if (!currentSeason || currentSeason.teamId !== p1TeamState.id) {
        currentSeason = createSeason(p1TeamState.id, TEAM_KEYS);
      }
      let nextOpponentId = '';
      if (currentSeason.results.length < currentSeason.opponentIds.length) {
        nextOpponentId = currentSeason.opponentIds[currentSeason.results.length];
      } else if (currentSeason.secChampionship?.userQualified && !currentSeason.secChampionship?.played) {
        nextOpponentId = currentSeason.secChampionship.opponentId;
      } else {
        currentSeason = createSeason(p1TeamState.id, TEAM_KEYS);
        nextOpponentId = currentSeason.opponentIds[0];
      }
      if (!nextOpponentId) return;
      const opponent = getTeam(nextOpponentId);
      currentSeason = { ...currentSeason };
      seasonProgressRef.current = currentSeason;
      setSeasonProgress(currentSeason);
      saveSeasonProgress(currentSeason);
      setP2TeamState(opponent);
      engineRef.current?.selectP1Team(currentSeason.teamId);
      engineRef.current?.selectP2Team(nextOpponentId);
    }
    setUserScore(0);
    setCpuScore(0);
    engineRef.current?.resetGame();
    engineRef.current?.setTacticalMode?.(tacticalMode);
    setHasKickedOff(true);
    setShowPauseMenu(false);
    setShowTeamModal(false);
    sounds.playWhistle();
  };

  const handleReturnToMainMenu = () => {
    engineRef.current?.endGame();
    setFinishedGame(null);
    setUserScore(0);
    setCpuScore(0);
    setHasKickedOff(false);
    setShowPauseMenu(false);
    setShowTeamModal(true);
    setSetupStep('MODE');
    setShowDynastyPreview(false);
    setTacticalMode('PRO');
    engineRef.current?.setTacticalMode?.('PRO');
  };

  const handlePauseAttemptFieldGoal = () => {
    setShowPauseMenu(false);
    if (engineRef.current) {
      engineRef.current.setPaused(false);
      engineRef.current.callFieldGoal(true);
      setP1OffPlayState('FIELD_GOAL');
    }
  };

  useEffect(() => {
    if (!finishedGame || finishedGameHandledRef.current) return;
    finishedGameHandledRef.current = true;
    if (gameModeRef.current === 'ONE_GAME') return;

    const currentSeason = seasonProgressRef.current;
    if (!currentSeason) return;
    const savedResult = currentSeason.results[currentSeason.results.length - 1];
    const resultAlreadySaved = finishedGame.restored && savedResult
      && savedResult.p1Score === finishedGame.p1Score && savedResult.p2Score === finishedGame.p2Score;
    const updatedSeason = resultAlreadySaved
      ? currentSeason
      : recordSeasonGame(currentSeason, finishedGame.p1Score, finishedGame.p2Score);
    seasonProgressRef.current = updatedSeason;
    setSeasonProgress(updatedSeason);
    saveSeasonProgress(updatedSeason);
  }, [finishedGame]);

  const finishTutorial = () => {
    try {
      window.localStorage.setItem(CONTROLS_TUTORIAL_KEY, 'true');
    } catch {
      // Keep the tutorial dismissible when browser storage is unavailable.
    }
    setShowTutorial(false);
    if (tutorialResumeRef.current && !showPauseMenu) engineRef.current?.setPaused(false);
  };

  const replayTutorial = () => {
    tutorialResumeRef.current = hasKickedOff && !showPauseMenu;
    setShowHelp(false);
    engineRef.current?.setPaused(true);
    setShowTutorial(true);
  };

  const handleContinueSeason = () => {
    setSetupStep('TEAMS');
    gameModeRef.current = 'SEASON';
    setGameMode('SEASON');
    saveGameMode('SEASON');
    setTeamSelectionSide('P1');
    setShowSeasonChoiceModal(false);

    let currentSeason = seasonProgressRef.current || loadSeasonProgress();
    if (!currentSeason) {
      currentSeason = createSeason(p1TeamState.id, TEAM_KEYS);
    }
    seasonProgressRef.current = currentSeason;
    setSeasonProgress(currentSeason);
    saveSeasonProgress(currentSeason);

    if (currentSeason.teamId !== p1TeamState.id) {
      const seasonTeam = getTeam(currentSeason.teamId);
      setP1TeamState(seasonTeam);
      engineRef.current?.selectP1Team(currentSeason.teamId);
    }

    const nextOpponentId = currentSeason.secChampionship?.userQualified && currentSeason.results.length === currentSeason.opponentIds.length
      ? currentSeason.secChampionship.opponentId
      : (currentSeason.opponentIds[currentSeason.results.length] || currentSeason.opponentIds[0]);

    if (nextOpponentId) {
      const opponent = getTeam(nextOpponentId);
      setP2TeamState(opponent);
      engineRef.current?.selectP2Team(nextOpponentId);
    }
  };

  const handleStartNewSeason = (teamId: string = p1TeamState.id) => {
    setSetupStep('TEAMS');
    gameModeRef.current = 'SEASON';
    setGameMode('SEASON');
    saveGameMode('SEASON');
    setTeamSelectionSide('P1');
    setShowSeasonChoiceModal(false);

    const newSeason = createSeason(teamId, TEAM_KEYS);
    seasonProgressRef.current = newSeason;
    setSeasonProgress(newSeason);
    saveSeasonProgress(newSeason);

    const nextOpponentId = newSeason.opponentIds[0];
    if (nextOpponentId) {
      const opponent = getTeam(nextOpponentId);
      setP2TeamState(opponent);
      engineRef.current?.selectP2Team(nextOpponentId);
    }
  };

  const handleGameModeChange = (mode: GameMode) => {
    setTeamSelectionSide('P1');
    setTeamSearch('');
    if (mode === 'SEASON') {
      const currentSeason = seasonProgressRef.current || loadSeasonProgress();
      if (currentSeason) {
        setShowSeasonChoiceModal(true);
        return;
      }
      handleStartNewSeason(p1TeamState.id);
      return;
    }

    gameModeRef.current = mode;
    setGameMode(mode);
    saveGameMode(mode);
    setSetupStep('TEAMS');
  };

  const visibleTeams = getAllTeams().filter(team =>
    team.name.toLowerCase().includes(teamSearch.trim().toLowerCase())
  );
  const seasonForDisplay = seasonProgress?.teamId === p1TeamState.id
    ? seasonProgress
    : createSeason(p1TeamState.id, TEAM_KEYS);
  const isSecChampionshipQualified = Boolean(seasonForDisplay.secChampionship?.userQualified);
  const isSecChampionshipPlayed = Boolean(seasonForDisplay.secChampionship?.played);
  const isChampionshipWeek = gameMode === 'SEASON' && isSecChampionshipQualified && seasonForDisplay.results.length === seasonForDisplay.opponentIds.length;
  const seasonComplete = seasonForDisplay.results.length >= seasonForDisplay.opponentIds.length &&
    (!isSecChampionshipQualified || isSecChampionshipPlayed);
  const canContinueSeason = gameMode === 'SEASON' && Boolean(
    seasonProgress && (
      seasonProgress.results.length < seasonProgress.opponentIds.length ||
      (seasonProgress.secChampionship?.userQualified && !seasonProgress.secChampionship?.played)
    )
  );
  const currentRivalry = getRivalryForMatchup(p1TeamState.id, p2TeamState.id);
  const currentWeekNumber = seasonForDisplay.results.length + 1;
  const isUserPreSnapPhase = hasKickedOff && phaseState === 'PRE_SNAP' && !isKickoffActive;
  const isTacticalModeLocked = hasKickedOff;
  const userTeamPlaybook = getTeamPlaybook(p1TeamState.id);
  const playbookScoreboard = (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-white/10 bg-black/35 px-3 py-2 font-mono text-[10px] sm:text-xs">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-bold" style={getTeamTextStyle(p2TeamState.primaryColor)}>{p2TeamState.nickname}</span>
        <span className="rounded-sm border border-red-500/50 bg-red-950/80 px-1.5 py-0.5 font-black tabular-nums text-white">{cpuScore}</span>
      </div>
      <div className="text-center leading-tight">
        <div className="font-black text-amber-300">Q{gameClockState.quarter} · {Math.floor(gameClockState.seconds / 60)}:{String(gameClockState.seconds % 60).padStart(2, '0')}</div>
        <div className="max-w-[130px] truncate text-[9px] font-bold uppercase text-cyan-300 sm:max-w-none">{downDistanceText}</div>
      </div>
      <div className="flex min-w-0 items-center justify-end gap-1.5">
        <span className="rounded-sm border border-emerald-500/50 bg-emerald-950/80 px-1.5 py-0.5 font-black tabular-nums text-white">{userScore}</span>
        <span className="truncate text-right font-bold" style={getTeamTextStyle(p1TeamState.primaryColor)}>{p1TeamState.nickname}</span>
      </div>
    </div>
  );
  const onlinePlayerSide = onlineRole === 'host' ? 'P1' : 'P2';
  const isOnlinePlayerOnOffense = activeOffenseState === onlinePlayerSide;
  const onlinePlayerTeam = onlinePlayerSide === 'P1' ? p1TeamState : p2TeamState;
  const onlineOpponentTeam = onlinePlayerSide === 'P1' ? p2TeamState : p1TeamState;
  const onlineSelectedPlay = onlineRole === 'guest'
    ? isOnlinePlayerOnOffense ? p2OffPlayState : p2DefPlayState
    : isOnlinePlayerOnOffense ? p1OffPlayState : p1DefPlayState;
  useEffect(() => {
    if (phaseState !== 'PRE_SNAP') {
      playbookCallSelectedRef.current = false;
    }
    const canShowPlaybook = hasKickedOff && phaseState === 'PRE_SNAP' &&
      !isKickoffActive &&
      !showPauseMenu && !showTeamModal && !showOnlineLobby && !showTutorial && !showSettings && !finishedGame;
    if (!canShowPlaybook) {
      setShowPlaybookCards(false);
      return;
    }
    if (!playbookCallSelectedRef.current) {
      setShowPlaybookCards(true);
    }
  }, [finishedGame, hasKickedOff, isKickoffActive, onlineRole, phaseState, showOnlineLobby, showPauseMenu, showTeamModal, showTutorial, showSettings]);

  return (
    <div className="game-shell relative w-screen min-h-[100dvh] h-[100dvh] overflow-hidden flex flex-col items-center justify-start p-0 bg-[#030704] text-white font-mono select-none">
      {/* Top Broadcast Scoreboard Strip */}
      <header className="game-scoreboard-strip relative z-30 w-full shrink-0 bg-[#08120c]/90 border-b border-[#ffcc00]/40 px-2 sm:px-4 py-0.5 sm:py-1 h-7 sm:h-8 flex items-center justify-between text-[11px] sm:text-xs font-mono shadow-md backdrop-blur-md select-none">
        {/* P2 (CPU / Guest / Away) */}
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 pointer-events-auto">
          <button
            type="button"
            onClick={() => setShowTeamModal(true)}
            className="font-extrabold text-[0.60rem] sm:text-xs px-1.5 py-0.5 rounded truncate max-w-[80px] sm:max-w-[140px] hover:underline cursor-pointer transition active:scale-95"
            style={getTeamTextStyle(p2TeamState.primaryColor)}
            title="Change Teams"
          >
            {p2TeamState.name} <span className="text-[0.50rem] opacity-75 hidden sm:inline">({onlineRole === 'guest' ? 'YOU' : onlineRole === 'host' ? 'GUEST' : 'CPU'})</span>
          </button>
          <span className="text-white text-[11px] sm:text-xs font-black bg-red-950/90 border border-red-500/60 px-1.5 py-0.5 rounded leading-none tabular-nums shadow-inner">
            {cpuScore}
          </span>
        </div>

        {/* Center: Down & Distance, Quarter & Clock, Momentum */}
        <div className="flex items-center gap-1.5 sm:gap-3 text-center min-w-0 px-1 pointer-events-auto">
          <span className="text-[#00ffff] font-black text-[0.62rem] sm:text-xs tracking-wider uppercase truncate max-w-[110px] sm:max-w-none">
            {downDistanceText}
          </span>
          <div className="flex items-center gap-1 sm:gap-1.5 text-[0.60rem] sm:text-xs font-bold text-neutral-300">
            <span className="text-[#ffcc00] font-black">Q{gameClockState.quarter}</span>
            <span className={`tabular-nums ${gameClockState.seconds <= 30 ? 'text-red-400 font-black animate-pulse' : 'text-neutral-200'}`}>
              {Math.floor(gameClockState.seconds / 60)}:{String(gameClockState.seconds % 60).padStart(2, '0')}
            </span>
            {momentumState !== 0 && (
              <span className={`text-[0.52rem] font-bold px-1 rounded ${momentumState > 0 ? 'text-[#00ffaa] bg-emerald-950/70 border border-emerald-500/40' : 'text-[#ff6666] bg-red-950/70 border border-red-500/40'}`}>
                {momentumState > 0 ? `+${momentumState}` : momentumState} MOM
              </span>
            )}
          </div>
        </div>

        {/* P1 (User / Host / Home) + Score + Controls */}
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 pointer-events-auto">
          <span className="text-white text-[11px] sm:text-xs font-black bg-emerald-950/90 border border-emerald-500/60 px-1.5 py-0.5 rounded leading-none tabular-nums shadow-inner">
            {userScore}
          </span>
          <button
            type="button"
            onClick={() => setShowTeamModal(true)}
            className="font-extrabold text-[0.60rem] sm:text-xs px-1.5 py-0.5 rounded truncate max-w-[80px] sm:max-w-[140px] hover:underline cursor-pointer transition active:scale-95"
            style={getTeamTextStyle(p1TeamState.primaryColor)}
            title="Change Teams"
          >
            {p1TeamState.name} <span className="text-[0.50rem] opacity-75 hidden sm:inline">({onlineRole === 'guest' ? 'HOST' : 'YOU'})</span>
          </button>

          {/* Integrated Strip Quick Controls */}
          <div className="flex items-center gap-0.5 ml-1 border-l border-white/20 pl-1">
            <button
              type="button"
              onClick={toggleSound}
              className="p-0.5 sm:p-1 text-[#ffcc00] hover:text-white transition cursor-pointer"
              title={soundEnabled ? "Mute" : "Unmute"}
              aria-label={soundEnabled ? "Mute" : "Unmute"}
            >
              {soundEnabled ? <Volume2 size={12} /> : <VolumeX size={12} className="text-neutral-500" />}
            </button>
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              className="p-0.5 sm:p-1 text-[#00ffff] hover:text-white transition cursor-pointer"
              title="Help & Controls"
              aria-label="Help & Controls"
            >
              <HelpCircle size={12} />
            </button>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="p-0.5 sm:p-1 text-neutral-300 hover:text-white transition cursor-pointer"
              title="Settings"
              aria-label="Settings"
            >
              <Settings size={12} />
            </button>
            {hasKickedOff ? (
              <button
                type="button"
                onClick={() => {
                  engineRef.current?.setPaused(true);
                  setShowPauseMenu(true);
                }}
                className="p-0.5 sm:p-1 text-white hover:text-[#ffcc00] transition cursor-pointer"
                title="Pause game"
                aria-label="Pause game"
              >
                <Pause size={12} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  handleStartGame();
                  showAnnouncement(
                    `${p1TeamState.name.toUpperCase()} VS ${p2TeamState.name.toUpperCase()} - READY FOR KICKOFF! 🏈`,
                    p1TeamState.primaryColor,
                    true
                  );
                }}
                className="px-1.5 sm:px-2 py-0.5 rounded bg-gradient-to-r from-[#c44d2b] to-[#bd5635] text-[0.55rem] sm:text-[0.60rem] font-black uppercase text-white shadow hover:from-[#b03f1f] hover:to-[#a9492d] active:scale-95 transition cursor-pointer"
                title="Kick off game now"
              >
                KICKOFF
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Field Goal Meter Lock Action Controls */}
      {!onlineRole && isUserPreSnapPhase && !isKickoffActive && activeOffenseState === 'P1' && p1OffPlayState === 'FIELD_GOAL' && fgMeterState !== null && (
        <div className="absolute top-9 sm:top-10 left-1/2 -translate-x-1/2 flex items-center justify-center gap-2 z-25 max-w-[95vw] px-2 pointer-events-auto">
          <button
            type="button"
            onClick={() => engineRef.current?.lockFieldGoalMeter?.()}
            className="min-w-0 px-4 py-1.5 rounded-lg border-2 border-amber-300 bg-gradient-to-r from-emerald-600 to-teal-500 text-xs font-black uppercase text-white shadow-xl transition hover:from-emerald-500 hover:to-teal-400 active:scale-95 animate-pulse cursor-pointer"
          >
            {fgMeterState.stage === 'POWER' ? '⚡ KICK! (LOCK DISTANCE)' : '🎯 LOCK DIRECTION'}
          </button>
        </div>
      )}

      {/* Screen edge alert vignette for turnovers and touchdowns */}
      {screenVignette === 'TURNOVER' && (
        <div className="pointer-events-none fixed inset-0 z-40 border-4 border-red-500/70 shadow-[inset_0_0_80px_rgba(239,68,68,0.55)] animate-pulse transition-opacity duration-300" />
      )}
      {screenVignette === 'TOUCHDOWN' && (
        <div className="pointer-events-none fixed inset-0 z-40 border-4 border-amber-400/80 shadow-[inset_0_0_90px_rgba(245,158,11,0.6)] animate-pulse transition-opacity duration-300" />
      )}

      {/* Main Game Announcement Banner */}
      {banner.visible && (
        <div
          className={`pointer-events-none absolute top-[22%] sm:top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[94vw] max-w-[440px] transition-all duration-200 select-none ${
            banner.category === 'TURNOVER'
              ? 'animate-turnover-glow'
              : banner.category === 'TOUCHDOWN'
                ? 'animate-touchdown-glow'
                : 'shadow-[0_10px_35px_rgba(0,0,0,0.95)]'
          }`}
        >
          {banner.category === 'TURNOVER' ? (
            /* Major Event: TURNOVER (Interceptions, Fumbles, Turnover on Downs) */
            <div className="relative overflow-hidden rounded-xl border-2 border-red-500 bg-gradient-to-b from-[#240606]/98 via-[#180303]/98 to-[#0b0101]/98 backdrop-blur-md shadow-2xl">
              {/* Header Badge */}
              <div className="flex items-center justify-between border-b-2 border-red-500 bg-white px-3 py-1 text-[#1b3026] font-black uppercase text-[0.66rem] sm:text-xs tracking-widest shadow-md">
                <span className="flex items-center gap-1.5 truncate">
                  <span className="animate-ping inline-block h-2 w-2 rounded-full bg-black/80 shrink-0" />
                  <span>🚨 TURNOVER ALERT {currentRivalry ? `• ${currentRivalry.name.toUpperCase()}` : ''} 🚨</span>
                </span>
                <button
                  onClick={() => {
                    setBanner(prev => ({ ...prev, visible: false }));
                    activePriorityRef.current = 0;
                  }}
                  className="pointer-events-auto rounded p-0.5 text-black hover:bg-black/20 transition cursor-pointer"
                  title="Dismiss notification"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Body */}
              <div className="p-3 sm:p-4 text-center flex flex-col items-center gap-2">
                <div className="text-xl sm:text-2xl font-black text-white tracking-wider uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] leading-tight">
                  {banner.text}
                </div>
                {banner.subtext && (
                  <div className="w-full rounded-md bg-black/80 border border-red-500/40 px-2.5 py-1.5 text-[0.70rem] sm:text-xs font-bold text-amber-300 flex items-center justify-center gap-1.5 shadow-inner">
                    <span>{banner.subtext}</span>
                  </div>
                )}
              </div>

            </div>
          ) : banner.category === 'TOUCHDOWN' ? (
            /* Major Event: TOUCHDOWN */
            <div className="relative overflow-hidden rounded-xl border-2 border-amber-400 bg-gradient-to-b from-[#261d04]/98 via-[#1c1502]/98 to-[#0d0901]/98 backdrop-blur-md shadow-2xl">
              <div className="flex items-center justify-between border-b-2 border-amber-400 bg-white px-3 py-1 text-[#1b3026] font-black uppercase text-[0.66rem] sm:text-xs tracking-widest shadow-md">
                <span className="flex items-center gap-1.5 truncate">
                  <span>🏆 TOUCHDOWN! {currentRivalry ? `• ${currentRivalry.name.toUpperCase()}` : ''} 🏆</span>
                </span>
                <button
                  onClick={() => {
                    setBanner(prev => ({ ...prev, visible: false }));
                    activePriorityRef.current = 0;
                  }}
                  className="pointer-events-auto rounded p-0.5 text-black hover:bg-black/20 transition cursor-pointer"
                  title="Dismiss notification"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="p-3 sm:p-4 text-center flex flex-col items-center gap-2">
                <div className="text-xl sm:text-2xl font-black text-amber-300 tracking-wider uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] leading-tight">
                  {banner.text}
                </div>
                {banner.subtext && (
                  <div className="w-full rounded-md bg-black/80 border border-amber-400/40 px-2.5 py-1.5 text-[0.70rem] sm:text-xs font-bold text-emerald-300 flex items-center justify-center gap-1.5 shadow-inner">
                    <span>{banner.subtext}</span>
                  </div>
                )}
              </div>

            </div>
          ) : banner.big || banner.category === 'FIRST_DOWN' || banner.category === 'FUMBLE' ? (
            /* Medium Event: First Down, Fumble Alert, Sacks */
            <div
              className="relative overflow-hidden rounded-xl border-2 bg-gradient-to-b from-neutral-900/98 to-black/98 backdrop-blur-md shadow-2xl"
              style={{ borderColor: banner.color }}
            >
              <div
                className="flex items-center justify-between px-3 py-1 font-black uppercase text-[0.62rem] sm:text-[0.68rem] tracking-wider"
                style={{ backgroundColor: banner.color, color: '#000' }}
              >
                <span className="truncate">
                  {banner.category === 'FIRST_DOWN'
                    ? '🎯 1ST DOWN ACHIEVED'
                    : banner.category === 'FUMBLE'
                      ? '⚠️ LOOSE BALL! FUMBLE'
                      : '⚡ KEY PLAY'}
                  {currentRivalry ? ` • ⚔️ ${currentRivalry.name.toUpperCase()}` : ''}
                </span>
                <button
                  onClick={() => {
                    setBanner(prev => ({ ...prev, visible: false }));
                    activePriorityRef.current = 0;
                  }}
                  className="pointer-events-auto rounded p-0.5 text-black hover:bg-black/20 transition cursor-pointer"
                  title="Dismiss notification"
                >
                  <X size={13} />
                </button>
              </div>

              <div className="mx-3 my-3 rounded-md border border-neutral-200 bg-white p-3 text-center flex flex-col items-center gap-1.5">
                <div className="text-lg sm:text-xl font-black tracking-wide uppercase text-[#1b3026]">
                  {banner.text}
                </div>
                {banner.subtext && (
                  <div className="text-[0.66rem] sm:text-xs font-semibold text-[#405047]">
                    {banner.subtext}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Routine / Info Announcement */
            <div
              className="bg-black/95 border-2 rounded-lg font-extrabold text-center px-5 py-2.5 text-[0.88rem] tracking-wide shadow-2xl animate-pulse"
              style={{ borderColor: banner.color, ...getTeamTextStyle(banner.color) }}
            >
              {currentRivalry && (
                <div className="text-[0.62rem] font-black uppercase tracking-wider text-[#ffcc00] mb-0.5 flex items-center justify-center gap-1">
                  <span>⚔️</span>
                  <span>{currentRivalry.name}</span>
                  <span>⚔️</span>
                </div>
              )}
              <div>{banner.text}</div>
            </div>
          )}
        </div>
      )}
      <div className="game-canvas-stage relative flex-1 w-full min-h-0 overflow-hidden flex items-center justify-center p-0 m-0">
        <canvas
          ref={canvasRef}
          aria-label="Side-view football field"
          className="game-field bg-[#176620] touch-none block shadow-[0_4px_30px_rgba(0,0,0,0.9)]"
        />
      </div>

      {/* Game Manual / Help Modal */}
      {showHelp && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute inset-0 bg-black/92 flex flex-col items-center justify-center z-100 p-4"
        >
          <div className="bg-[#0b170e] border-2 border-[#ffcc00] rounded-lg max-w-[360px] w-full p-4 max-h-[85vh] overflow-y-auto text-left shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-700 pb-2 mb-3">
              <h2 className="text-[#ffcc00] font-bold text-sm tracking-wider flex items-center gap-1.5">
                <HelpCircle size={16} /> 8 ON 8 FIELD PLAYBOOK & CONTROLS
              </h2>
              <button onClick={() => setShowHelp(false)} className="text-neutral-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-[0.62rem] text-neutral-200 leading-relaxed font-mono">
              {tacticalMode === 'PRO' ? (
                <div className="rounded border border-neutral-800 bg-black/60 p-2.5">
                  <span className="mb-1 block font-bold text-[#00ffff]">1. PRO PLAY CALLING:</span>
                  <ul className="list-inside list-disc space-y-1 text-neutral-300">
                    <li>Choose One Game, Season, or the Dynasty preview first, then select your team. One Game also lets you choose the CPU team.</li>
                    <li>Read down and distance at the top of the playbook. Select an offensive play or defensive scheme card before every snap.</li>
                    <li>Intermediate and deep routes stretch coverage. Some plays include a short slot hitch for a checkdown; the RB stays in pass protection.</li>
                    <li>Touch the field or press Space to snap. Use left and right to move along the field, and up and down to move across it. On defense, steer the highlighted free defender while teammates execute the chosen scheme.</li>
                    <li>Punt and Field Goal are in the offensive playbook. Punts require fourth down; field goals use direction and power meters.</li>
                    <li>Elite freeform gameplay is an optional setting under the top-right Settings button before kickoff.</li>
                  </ul>
                </div>
              ) : (
              <div className="bg-black/60 p-2.5 rounded border border-neutral-800">
                <span className="text-[#00ffff] font-bold block mb-1">1. ELITE PLAYMAKER (LINE DRAWING & RUN BLOCKING):</span>
                <ul className="list-disc list-inside space-y-1 text-neutral-300">
                  <li><b className="text-white">Draw Routes & Defensive Assignments in the Dirt:</b> Touch any player and draw a line in the direction you want them to play:
                    <ul className="list-disc list-inside ml-2 text-neutral-300">
                      <li><b className="text-[#00ffaa]">Running Back (RB):</b> Swipe up or down on the RB to call a <b>Designed Run Play</b> (QB hands off to RB)! Swipe toward the opponent end zone for a <b>FLY / GO</b> route.</li>
                      <li><b className="text-[#00ffff]">Receivers (WR / Center):</b> Straight line = Fly, Inside diagonal = Slant, Horizontal = Cross, Outside diagonal = Corner, Pull back = Curl!</li>
                      <li><b className="text-[#ffcc00]">Defenders:</b> Swipe forward toward LOS = <b>BLITZ / RUSH</b> 💥, Swipe deep back = <b>ZONE COVERAGE</b> 🛡️, Swipe left/right = <b>MAN COVERAGE</b> 👤, Short swipe = <b>RB SPY</b> 🕵️‍♂️! Drag center defender to reposition anywhere!</li>
                    </ul>
                  </li>
                  <li><b className="text-white">Call a Run Play vs RB Tap Toggle:</b> Swipe left or right on the Running Back to call a <b>Designed Run Play</b> (QB hands off to RB)! Tapping the RB toggles between <b>Pass Protection</b> (RB lead-blocks rushers) and <b>Pass Route</b> (Flat checkdown)!</li>
                  <li><b className="text-white">Single Tap for Run Blocking:</b> Simply tap any receiver (WR or Center) to assign them to <b>RUN BLOCKING</b>! A white block bar appears across them and they lead-block downfield! Tap again to toggle back to route.</li>
                  <li><b className="text-white">Start the Play:</b> Touch the field joystick on offense or defense. The same joystick starts kickoffs and punts; drag it to steer once play is live. Tap assignment-controlled defenders to cycle blitz, man, RB spy, and zone.</li>
                  <li><b className="text-white">Flip Running Back:</b> Quick double-tap left or right of center to shift the RB side.</li>
                </ul>
              </div>
              )}

              <div className="bg-black/60 p-2.5 rounded border border-neutral-800">
                <span className="text-[#ffcc00] font-bold block mb-1">2. TAP TO THROW & RELATIVE JOYSTICK CONTROLS:</span>
                <ul className="list-disc list-inside space-y-1 text-neutral-300">
                  <li><b className="text-white">Tap to Throw:</b> Tap any eligible receiver downfield (WR, Center, or RB) to launch a crisp pass with smart lead targeting so they catch the ball in stride!</li>
                  <li><b className="text-white">Side-View Controls:</b> Touch the field to start the play, then drag left or right to run along the field and up or down to move across it. On keyboard, press Space to snap; WASD or arrow keys move your player in the same screen directions.</li>
                  <li><b className="text-white">Quarterback Control:</b> Maneuver the QB in the pocket, step up to avoid blitzers, roll out, or cross the line of scrimmage to scramble!</li>
                  <li><b className="text-white">Ball Carrier Control:</b> Steer the Running Back through holes, cut laterally, or slow down behind lead blockers!</li>
                  <li><b className="text-white">Edge Rusher on Defense:</b> Take control of the edge rusher with the joystick, bend around the tackle, collapse the pocket, and deliver a bone-crushing sack!</li>
                  <li><b className="text-white">Zero Interference:</b> The relative joystick never interferes with tapping a receiver to pass—two-thumb control works effortlessly!</li>
                </ul>
              </div>

              <div className="bg-black/60 p-2.5 rounded border border-neutral-800">
                <span className="text-[#00ffaa] font-bold block mb-1">3. BALL CARRIER MOVES & BROKEN TACKLES:</span>
                <ul className="list-disc list-inside space-y-1 text-neutral-300">
                  <li><b className="text-white">Broken Tackles:</b> Runner power, defender tackling, and fatigue determine contact outcomes. A broken tackle briefly slows momentum; it does not grant a free sprint boost. Powerful runners can gain up to two yards falling forward against weaker tacklers.</li>
                  <li><b className="text-white">Player Identity:</b> The field stays free of player badges. Tap a receiver or defender before the snap to scout their ratings, or inspect the roster during team selection.</li>
                  <li><b className="text-white">Team Playbooks:</b> Each team has restricted calls built for its roster, including two exclusive offensive plays and two exclusive defensive schemes with their own routes, blocking, and coverage landmarks. Open Team playbook before the snap; Elite swipes cycle available team calls. CPU teams use the same packages. Punt and Field Goal remain available to every team. Elite route and assignment adjustments still work within a selected call.</li>
                  <li><b className="text-white">Real Tradeoffs:</b> Speedsters accelerate quickly but struggle with contact and blocking. Power backs are slower but can fall forward against weaker tacklers. Strong coverage wins more tight-window contests; open throws stay reliable. Ratings are out of 99.</li>
                  <li><b className="text-white">Pursuit:</b> Defenders accelerate to a bounded top speed and take angles to cut off the runner.</li>
                  <li><b className="text-white">Fumbles & Live Scrambles:</b> Hard hits can pop the football loose! Both offense and defense dive for the tumbling ball—defense recovery causes a turnover!</li>
                  <li><b className="text-white">Clean Pocket Protection:</b> Offensive linemen hold blocks for 5 full seconds before breakdown unless an extra blitzer brings immediate pressure!</li>
                  <li><b className="text-white">Lateral Juke:</b> Quick horizontal swipe left or right to side-step defenders. Jukes do not grant tackle immunity.</li>
                  <li><b className="text-white">Truck / Sprint Boost:</b> Quick forward swipe to activate power turbo boost and increase broken tackle chances!</li>
                </ul>
              </div>

              <div className="bg-black/60 p-2.5 rounded border border-neutral-800">
                <span className="text-[#ff9999] font-bold block mb-1">4. COVERAGE & CONTESTED CATCHES:</span>
                <ul className="list-disc list-inside space-y-1 text-neutral-300">
                  <li><b className="text-white">Open Receivers:</b> Accurate throws with clear separation remain high-percentage catches.</li>
                  <li><b className="text-white">Contested Catches:</b> Nearby defenders, double coverage, catch angle, receiver hands, and fatigue determine the catch window. Touching players are not wide open.</li>
                  <li><b className="text-white">Fatigue:</b> Stamina bars under players turn amber when tired and red when exhausted. Each pass target costs a receiver one-third of their stamina; two plays without a target restore it. Exhausted receivers run slower and are more likely to fumble after hard contact.</li>
                </ul>
              </div>

              <div className="bg-black/60 p-2.5 rounded border border-neutral-800">
                <span className="text-red-400 font-bold block mb-1">5. DEFENSIVE SCHEMES & COUNTERS:</span>
                <ul className="list-disc list-inside space-y-1 text-neutral-300">
                  <li><b className="text-white">1-4-2 DEFENSE (COVER 2):</b> One rusher, two middle linebackers, two flat corners, and two deep safeties. <i>Weakness:</i> Deep sideline seams.</li>
                  <li><b className="text-white">3-4 ZONE:</b> Three defenders rush or stunt while four drop into intermediate and deep zones. <i>Weakness:</i> Quick throws behind the rush.</li>
                  <li><b className="text-white">2-3-2 ZONE:</b> Two upfront, three across the middle, and two deep defenders tracking long balls. <i>Weakness:</i> Intermediate sideline windows.</li>
                  <li><b className="text-white">1-5-1 DEFENSE:</b> One rusher, five across the intermediate level, and one deep safety. <i>Weakness:</i> Deep middle and outside vertical routes.</li>
                </ul>
              </div>

              <div className="bg-black/60 p-2.5 rounded border border-neutral-800">
                <span className="text-[#ffd700] font-bold block mb-1">6. FIELD GOALS & SPECIAL TEAMS (UP TO 60 YARDS):</span>
                <ul className="list-disc list-inside space-y-1 text-neutral-300">
                  <li><b className="text-white">Field Goals (3 Points):</b> In Pro mode, choose Field Goal from the offensive playbook, then lock direction and power. Can be attempted from up to 60 yards out. Greater distance significantly tightens accuracy margins and requires higher kicking power!</li>
                  <li><b className="text-white">Two-Stage Skill Meter:</b>
                    <ul className="list-disc list-inside ml-2 text-neutral-400">
                      <li><b>Stage 1 (Direction):</b> Tap to lock horizontal aim. Aim must land between the yellow upright target markers. The target window narrows as distance increases!</li>
                      <li><b>Stage 2 (Distance & Power):</b> Immediately follow with an up/down vertical meter tap to lock kick elevation and distance. Must reach the required yard line threshold to clear the crossbar!</li>
                    </ul>
                  </li>
                  <li><b className="text-white">Uprights & Doinks:</b> Kicks hitting the upright post trigger a realistic metallic DOINK! Missed kicks turn possession over to the defense.</li>
                  <li><b className="text-white">Punts:</b> Choose Punt from the Pro offensive playbook on 4th down to flip field position with a high soaring spiral punt. Current down and distance are shown at the top of the playbook.</li>
                </ul>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={replayTutorial}
                className="rounded border border-[#52715b] px-3 py-2 text-xs font-bold text-[#b9dfc2] transition hover:bg-[#173121]"
              >
                Replay controls tutorial
              </button>
              <button
                onClick={() => setShowHelp(false)}
                className="rounded bg-[#ffcc00] px-3 py-2 text-xs font-bold text-black transition hover:bg-yellow-400"
              >
                GOT IT, LET'S PLAY!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Franchise & Team Selector Modal */}
      {showTeamModal && !hasKickedOff && setupStep === 'MODE' && (
        <section role="dialog" aria-modal="true" aria-labelledby="game-mode-title" className="mobile-main-menu-overlay fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[#07110a]/95 p-2 sm:p-5 backdrop-blur-sm">
          <div className="mobile-main-menu w-full max-w-2xl max-h-[94vh] overflow-y-auto rounded-xl border border-neutral-700 bg-[#0d1710] p-3 sm:p-5 shadow-2xl">
            <h1 id="game-mode-title" className="text-center text-lg sm:text-2xl font-black uppercase text-amber-300">Backyard Football</h1>
            <p className="mt-0.5 sm:mt-1 text-center text-[11px] sm:text-sm text-neutral-300">Choose how you want to play. Pick your teams next.</p>
            <div className="mobile-mode-grid mt-3 sm:mt-4 grid gap-2 sm:gap-2.5 grid-cols-2 lg:grid-cols-4" role="group" aria-label="Game mode">
              {([
                ['ONE_GAME', 'One Game', 'Pick your team and the CPU opponent for a single matchup.'],
                ['SEASON', 'Season', 'Choose your SEC team for a 9-game season and a shot at the championship.'],
                ['DYNASTY', 'Dynasty', 'Choose your program and preview the coming-soon Dynasty mode.']
              ] as const).map(([mode, label, description]) => (
                <button key={mode} type="button" onClick={() => handleGameModeChange(mode)} className="mobile-mode-option rounded-lg border border-neutral-600 bg-[#15251b] p-2.5 sm:p-3 text-left transition hover:border-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 cursor-pointer">
                  <span className="block text-xs sm:text-base font-black text-white">{label}</span>
                  {mode === 'DYNASTY' && <span className="mt-0.5 block text-[8px] sm:text-[9px] font-bold uppercase text-amber-300">Coming soon</span>}
                  <span className="mobile-mode-description mt-0.5 sm:mt-1 block text-[10px] sm:text-[11px] leading-3.5 sm:leading-4 text-neutral-300">{description}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setOnlineError('');
                  setShowOnlineLobby(true);
                }}
                className="mobile-mode-option rounded-lg border border-cyan-500/70 bg-[#10232a] p-2.5 sm:p-3 text-left transition hover:border-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="block text-xs sm:text-base font-black text-white">Online Versus</span>
                  <span className="rounded bg-cyan-400/20 px-1 py-0.2 text-[8px] font-black uppercase text-cyan-300">Coming Soon</span>
                </div>
                <span className="mobile-mode-description mt-0.5 sm:mt-1 block text-[10px] sm:text-[11px] leading-3.5 sm:leading-4 text-neutral-300">Create an invite code or join a friend for a live head-to-head game.</span>
              </button>
            </div>
            {seasonProgress && (
              <button type="button" onClick={handleContinueSeason} className="mt-2.5 sm:mt-3 w-full rounded-md border border-emerald-500/50 bg-emerald-950/40 px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-bold text-emerald-300 hover:bg-emerald-900/50 cursor-pointer">
                Continue season - {getTeam(seasonProgress.teamId).name}
              </button>
            )}
            <button type="button" onClick={replayTutorial} className="mt-2.5 sm:mt-3 flex w-full items-center justify-center gap-1.5 text-xs font-bold text-neutral-300 hover:text-white cursor-pointer">
              <Hand size={14} /> Learn to play
            </button>
          </div>
        </section>
      )}

      {/* Online Versus Lobby Modal with 6-Character Invite Code */}
      {showOnlineLobby && !hasKickedOff && (
        <section role="dialog" aria-modal="true" aria-labelledby="online-lobby-title" className="fixed inset-0 z-[115] flex items-center justify-center bg-[#07110a]/95 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-cyan-500/50 bg-[#0c171b] text-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-white/10 px-5 py-4 bg-gradient-to-r from-[#0c222b] to-[#0c171b]">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-300">
                  <Users size={20} />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase text-cyan-300 tracking-wider">Online Multiplayer</p>
                  <h2 id="online-lobby-title" className="mt-0.5 text-xl font-black uppercase">{onlineLobby ? 'Waiting Room' : 'Play a Friend'}</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => (onlineLobby ? handleLeaveOnlineLobby() : setShowOnlineLobby(false))}
                aria-label="Close online lobby"
                className="rounded-lg p-2 text-neutral-400 hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </header>

            <div className="space-y-4 p-5">
              {!onlineLobby ? (
                <>
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400">
                    Your Name
                    <input
                      value={onlineName}
                      maxLength={20}
                      onChange={event => setOnlineName(event.target.value)}
                      placeholder="Enter your name"
                      className="mt-1.5 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400"
                    />
                  </label>

                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400">
                    Your Team
                    <select
                      value={onlineTeamId}
                      onChange={event => setOnlineTeamId(event.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#142126] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400"
                    >
                      {getAllTeams().map(team => (
                        <option key={team.id} value={team.id}>{team.name}</option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    disabled={onlineBusy}
                    onClick={handleCreateOnlineLobby}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-500 px-4 py-3 text-sm font-black uppercase text-[#061014] shadow-lg transition hover:from-cyan-400 hover:to-teal-400 active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <Users size={18} /> {onlineBusy ? 'Creating...' : 'Create Invite Code & Host'}
                  </button>

                  <div className="flex items-center gap-3 text-[10px] font-bold uppercase text-neutral-500">
                    <span className="h-px flex-1 bg-white/10" />
                    Or Join With Invite Code
                    <span className="h-px flex-1 bg-white/10" />
                  </div>

                  <div className="flex gap-2">
                    <input
                      aria-label="Lobby code"
                      value={lobbyCodeInput}
                      maxLength={6}
                      onChange={event => setLobbyCodeInput(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                      placeholder="6-LETTER CODE"
                      className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2.5 font-mono text-sm uppercase tracking-[0.2em] text-white outline-none focus:border-cyan-400 text-center font-bold"
                    />
                    <button
                      type="button"
                      disabled={onlineBusy || lobbyCodeInput.length !== 6}
                      onClick={handleJoinOnlineLobby}
                      className="rounded-lg border border-cyan-400/50 bg-cyan-950/40 px-5 text-xs font-black uppercase tracking-wider text-cyan-200 transition hover:bg-cyan-400 hover:text-black active:scale-95 disabled:opacity-40 cursor-pointer"
                    >
                      {onlineBusy ? '...' : 'Join'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* Shareable Invite Code Display */}
                  <div className="rounded-xl border border-cyan-400/40 bg-gradient-to-b from-cyan-950/40 to-black/60 p-5 text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-cyan-300">INVITE CODE</p>
                    <p className="my-2 font-mono text-4xl sm:text-5xl font-black tracking-[0.25em] text-white drop-shadow-[0_0_12px_rgba(6,182,212,0.6)]">
                      {onlineLobby.code}
                    </p>
                    <p className="text-xs text-neutral-400 mb-3">Send this 6-character code to your friend to join this match</p>
                    <button
                      type="button"
                      onClick={() => {
                        if (navigator.clipboard) {
                          navigator.clipboard.writeText(onlineLobby.code)
                            .then(() => setCopiedLobbyCode(true))
                            .catch(() => setOnlineError('Could not copy code.'));
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-lg bg-cyan-500/20 border border-cyan-400/40 px-4 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-500/30 active:scale-95 cursor-pointer"
                    >
                      {copiedLobbyCode ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                      {copiedLobbyCode ? 'Copied to Clipboard!' : 'Copy Code'}
                    </button>
                  </div>

                  {/* Player Slot Cards */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3 text-center">
                      <span className="inline-block rounded bg-cyan-400/20 px-2 py-0.5 text-[9px] font-black uppercase text-cyan-300">HOST</span>
                      <p className="mt-1.5 truncate text-sm font-bold text-white">{onlineLobby.host.name}</p>
                      <p className="mt-0.5 text-xs text-neutral-300">{getTeam(onlineLobby.host.teamId || p1TeamState.id).name}</p>
                      <p className="mt-2 text-[10px] font-black uppercase text-emerald-300">Ready</p>
                    </div>

                    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3 text-center">
                      <span className="inline-block rounded bg-amber-400/20 px-2 py-0.5 text-[9px] font-black uppercase text-amber-300">GUEST</span>
                      {onlineLobby.guest ? (
                        <>
                          <p className="mt-1.5 truncate text-sm font-bold text-white">{onlineLobby.guest.name}</p>
                          {onlineRole === 'guest' && !onlineLobby.started ? (
                            <select
                              value={onlineTeamId}
                              onChange={event => {
                                const teamId = event.target.value;
                                setOnlineTeamId(teamId);
                                void loadMultiplayer()
                                  .then(module => module.setLobbyTeam(teamId))
                                  .catch(error => setOnlineError(`Could not update team: ${error instanceof Error ? error.message : String(error)}`));
                              }}
                              className="mt-1 w-full rounded border border-white/15 bg-[#142126] px-2 py-1 text-xs text-white"
                            >
                              {getAllTeams().map(team => (
                                <option key={team.id} value={team.id}>{team.name}</option>
                              ))}
                            </select>
                          ) : (
                            <p className="mt-0.5 text-xs text-neutral-300">{getTeam(onlineLobby.guest.teamId || p2TeamState.id).name}</p>
                          )}
                          <p className={`mt-2 text-[10px] font-black uppercase ${onlineLobby.guest.ready ? 'text-emerald-300' : 'text-amber-300'}`}>
                            {onlineLobby.guest.ready ? 'Ready' : 'Selecting Team'}
                          </p>
                        </>
                      ) : (
                        <p className="mt-3 text-xs text-neutral-400 animate-pulse">Waiting for friend...</p>
                      )}
                    </div>
                  </div>

                  {/* Ready / Start Actions */}
                  {onlineRole === 'guest' && onlineLobby.guest && !onlineLobby.started && (
                    <button
                      type="button"
                      disabled={onlineBusy}
                      onClick={() => {
                        const ready = !onlineLobby.guest?.ready;
                        void loadMultiplayer()
                          .then(module => module.setLobbyReady(ready))
                          .catch(error => setOnlineError(`Could not update ready state: ${error instanceof Error ? error.message : String(error)}`));
                      }}
                      className="w-full rounded-lg bg-emerald-500 px-4 py-3 text-sm font-black uppercase text-[#07110a] hover:bg-emerald-400 active:scale-95 transition cursor-pointer"
                    >
                      {onlineLobby.guest.ready ? 'Cancel Ready' : 'Ready to Play'}
                    </button>
                  )}

                  {onlineRole === 'host' && (
                    <button
                      type="button"
                      disabled={onlineBusy || !onlineLobby.guest?.ready}
                      onClick={handleStartOnlineMatch}
                      className="w-full rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 text-sm font-black uppercase tracking-wider text-white shadow-xl transition hover:from-emerald-500 hover:to-teal-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                    >
                      {onlineBusy ? 'Starting...' : onlineLobby.guest?.ready ? 'Start Head-to-Head Match' : 'Waiting for Guest to Ready Up'}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleLeaveOnlineLobby}
                    className="w-full rounded-lg border border-red-500/40 bg-red-950/20 px-3 py-2 text-xs font-bold uppercase text-red-300 hover:bg-red-900/40 active:scale-95 transition cursor-pointer"
                  >
                    Leave Room
                  </button>
                </>
              )}

              {onlineError && (
                <p role="alert" className="rounded-lg border border-red-400/30 bg-red-950/40 px-3 py-2 text-xs text-red-200 text-center font-bold">
                  {onlineError}
                </p>
              )}
            </div>
          </div>
        </section>
      )}
      {showTeamModal && (hasKickedOff || setupStep === 'TEAMS') && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="team-selector-overlay fixed inset-0 z-[100] flex flex-col items-center justify-start sm:justify-center bg-[#101713]/90 sm:p-3 backdrop-blur-sm overflow-hidden"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="team-selector-title"
            className="team-selector-panel flex flex-col h-full sm:h-auto max-h-[100dvh] sm:max-h-[94vh] w-full max-w-5xl rounded-none sm:rounded-xl border-0 sm:border border-[#d5ded7] bg-[#f2f5f2] text-left text-[#1b3026] shadow-2xl overflow-hidden"
          >
            {/* Consolidated Responsive Header & Controls */}
            <div className="team-selector-header flex shrink-0 flex-wrap items-center justify-between gap-1.5 sm:gap-2 border-b border-[#dce3dd] bg-white px-2.5 py-1.5 sm:px-5 sm:py-2">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <span className="flex h-7 w-7 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-md bg-[#e8f0ea] text-[#246344]">
                  <Users size={15} />
                </span>
                <div className="min-w-0">
                  <h2 id="team-selector-title" className="text-xs sm:text-base font-extrabold leading-tight text-[#1b3026] truncate">
                    {!hasKickedOff ? (gameMode === 'SEASON' ? 'SEC Season Setup' : gameMode === 'DYNASTY' ? 'Choose Dynasty Program' : 'Choose Teams') : 'Team Matchup'}
                  </h2>
                  <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-[#55635a]">
                    <span className="font-bold flex items-center gap-1">
                      <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full inline-block shrink-0" style={{ backgroundColor: p1TeamState.primaryColor }} />
                      You: <b className="text-[#1b3026] truncate max-w-[75px] sm:max-w-none">{p1TeamState.name}</b>
                    </span>
                    {gameMode !== 'DYNASTY' && (
                      <>
                        <span className="text-[#88968d]">vs</span>
                        <span className="font-bold flex items-center gap-1">
                          <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full inline-block shrink-0" style={{ backgroundColor: p2TeamState.primaryColor }} />
                          CPU: <b className="text-[#1b3026] truncate max-w-[75px] sm:max-w-none">{p2TeamState.name}</b>
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Controls: Assignment toggle, Search, Close */}
              <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
                {gameMode === 'ONE_GAME' && (
                  <div className="flex rounded-md border border-[#dce3dd] p-0.5 bg-[#f4f7f4] text-[11px] sm:text-xs font-bold" role="group" aria-label="Choose which side to assign">
                    <button
                      type="button"
                      aria-pressed={teamSelectionSide === 'P1'}
                      onClick={() => setTeamSelectionSide('P1')}
                      className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded transition text-[11px] sm:text-xs font-bold cursor-pointer ${teamSelectionSide === 'P1' ? 'bg-[#246344] text-white shadow-sm' : 'text-[#59685f] hover:text-[#1b3026]'}`}
                    >
                      Pick for You
                    </button>
                    <button
                      type="button"
                      aria-pressed={teamSelectionSide === 'P2'}
                      onClick={() => setTeamSelectionSide('P2')}
                      className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded transition text-[11px] sm:text-xs font-bold cursor-pointer ${teamSelectionSide === 'P2' ? 'bg-[#b45435] text-white shadow-sm' : 'text-[#59685f] hover:text-[#1b3026]'}`}
                    >
                      Pick for CPU
                    </button>
                  </div>
                )}

                <label className="flex w-28 sm:w-44 items-center gap-1 sm:gap-1.5 rounded-md border border-[#dce3dd] bg-[#f9faf9] px-1.5 sm:px-2 py-0.5 sm:py-1 text-[#718077] focus-within:border-[#7da78a] focus-within:bg-white text-xs">
                  <Search size={12} aria-hidden="true" />
                  <input
                    type="search"
                    aria-label="Search SEC teams"
                    placeholder="Search..."
                    value={teamSearch}
                    onChange={event => setTeamSearch(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-[11px] sm:text-xs text-[#253a2d] outline-none placeholder:text-[#87928a]"
                  />
                </label>

                <button
                  onClick={() => {
                    if (hasKickedOff) setShowTeamModal(false);
                    else setSetupStep('MODE');
                  }}
                  className="rounded-md p-1 sm:p-1.5 text-[#66756b] transition hover:bg-[#edf1ed] hover:text-[#1b3026] cursor-pointer"
                  title={hasKickedOff ? 'Close team selector' : 'Back to game modes'}
                  aria-label={hasKickedOff ? 'Close team selector' : 'Back to game modes'}
                >
                  {hasKickedOff ? <X size={16} /> : <ArrowLeft size={16} />}
                </button>
              </div>
            </div>

            <div className="team-selector-list min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
              <div className="p-2 sm:p-4">
                <div className="team-selector-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-1.5 sm:gap-2">
                  {visibleTeams.map((team) => {
                    const isP1 = p1TeamState.id === team.id;
                    const isP2 = p2TeamState.id === team.id;
                    const isActiveSide = teamSelectionSide === 'P1' ? isP1 : isP2;

                    return (
                      <div
                        key={team.id}
                        className={`team-selector-card flex items-center justify-between gap-1 sm:gap-1.5 rounded-lg border px-2 py-1 sm:py-1.5 sm:px-2.5 transition-all ${
                          isActiveSide
                            ? 'border-[#246344] bg-[#e8f0ea] text-[#1e573b] shadow-sm ring-2 ring-[#246344]/50'
                            : 'border-[#dce3dd] bg-white text-[#1b3026] hover:bg-[#f8faf8] hover:border-neutral-400'
                        }`}
                      >
                        <button
                          type="button"
                          aria-pressed={isActiveSide}
                          onClick={() => {
                            if (teamSelectionSide === 'P1') {
                              handleSelectP1Team(team.id);
                            } else {
                              handleSelectP2Team(team.id);
                            }
                          }}
                          className="flex flex-1 items-center gap-1.5 sm:gap-2 text-left text-xs sm:text-sm font-bold min-w-0 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#246344]"
                        >
                          <Suspense fallback={<span className="h-16 w-14 shrink-0" aria-hidden="true" />}>
                            <HelmetSpritePreview team={team} />
                          </Suspense>
                          <span className="team-selector-name min-w-0 truncate text-[11px] sm:text-xs">{team.name}</span>
                          {isActiveSide && (
                            <span className="shrink-0 rounded bg-[#246344] text-white px-1 sm:px-1.5 py-0.5 text-[7px] sm:text-[9px] font-black uppercase ml-auto">
                              {teamSelectionSide === 'P1' ? 'YOU' : 'CPU'}
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingTeam(team)}
                          className="shrink-0 rounded p-0.5 sm:p-1 text-neutral-400 hover:text-neutral-800 hover:bg-black/5 transition cursor-pointer"
                          title={`View ${team.name} scouting report`}
                          aria-label={`View ${team.name} scouting report`}
                        >
                          <Info size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
                {visibleTeams.length === 0 && (
                  <p className="rounded-md border border-dashed border-[#cbd6cd] px-4 py-8 text-center text-sm text-[#68776d]">No SEC teams match that search.</p>
                )}
              </div>
            </div>

            {/* Sticky, Always-Visible Footer with Prominent Kick Off Game Button */}
            <div className="team-selector-footer shrink-0 sticky bottom-0 z-30 border-t border-[#cbd6cd] bg-white px-3 py-2 sm:px-6 sm:py-2.5 shadow-xl">
              <div className="team-selector-footer-actions flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3">
                <span className="text-[11px] sm:text-xs font-bold text-[#59685f]">{gameMode === 'ONE_GAME' ? 'One Game' : gameMode === 'SEASON' ? 'Season' : 'Dynasty preview'}</span>

                <div className="flex items-center gap-1.5 sm:gap-2">
                  {hasKickedOff && (
                    <button
                      type="button"
                      onClick={() => setShowTeamModal(false)}
                      className="rounded-md border border-[#cbd6cd] bg-white px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs font-bold text-[#405047] transition hover:bg-[#edf1ed] cursor-pointer"
                    >
                      Save & resume
                    </button>
                  )}
                  {gameMode === 'SEASON' && seasonForDisplay.results.length > 0 && !seasonComplete && !hasKickedOff && (
                    <button
                      type="button"
                      onClick={() => handleStartNewSeason(p1TeamState.id)}
                      className="rounded-md border border-[#cbd6cd] bg-white px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs font-bold text-[#59685f] transition hover:bg-[#f2f5f2] cursor-pointer"
                    >
                      <RotateCcw size={12} className="inline mr-1" /> Start new season
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (gameMode === 'DYNASTY') {
                        setShowDynastyPreview(true);
                        return;
                      }
                      handleStartGame();
                      const isChampionship = gameMode === 'SEASON' && seasonForDisplay.secChampionship?.userQualified && seasonForDisplay.results.length === seasonForDisplay.opponentIds.length;
                      const rivalry = getRivalryForMatchup(p1TeamState.id, p2TeamState.id);
                      if (isChampionship) {
                        showAnnouncement(`🏆 SEC CHAMPIONSHIP GAME! ${p1TeamState.name.toUpperCase()} VS ${p2TeamState.name.toUpperCase()}! 🏆`, '#ffcc00', true);
                      } else if (rivalry) {
                        showAnnouncement(`⚔️ ${rivalry.name.toUpperCase()}! 🏆 FOR ${rivalry.trophy.toUpperCase()}!`, '#ffcc00', true);
                      } else if (gameMode === 'SEASON') {
                        showAnnouncement(
                          `${p1TeamState.name.toUpperCase()} SEASON • WEEK ${seasonComplete ? 1 : seasonForDisplay.results.length + 1} VS ${p2TeamState.name.toUpperCase()}`,
                          p1TeamState.primaryColor,
                          true
                        );
                      } else {
                        showAnnouncement(
                          `${p1TeamState.name.toUpperCase()} VS ${p2TeamState.name.toUpperCase()} - READY FOR KICKOFF! 🏈`,
                          p1TeamState.primaryColor,
                          true
                        );
                      }
                    }}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#c44d2b] to-[#bd5635] px-4 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm font-black uppercase tracking-wider text-white shadow-xl transition hover:from-[#b03f1f] hover:to-[#a9492d] active:scale-95 cursor-pointer ring-2 ring-[#bd5635]/40"
                  >
                    <span>
                      {gameMode === 'SEASON'
                        ? (isChampionshipWeek
                            ? '🏆 Kick off Championship'
                            : (seasonForDisplay.results.length > 0
                                ? `🏈 Kick off game · Continue season (Wk ${seasonForDisplay.results.length + 1})`
                                : '🏈 Kick off game · Start season'))
                        : gameMode === 'DYNASTY' ? 'Preview Dynasty' : '🏈 Kick off game'}
                    </span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
          {pendingTeam && (
            <div
              onPointerDown={event => event.stopPropagation()}
              className="absolute inset-0 z-[110] flex items-center justify-center bg-[#101713]/65 p-4 backdrop-blur-sm"
            >
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="team-confirmation-title"
                className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg border border-[#d5ded7] bg-[#f2f5f2] p-5 text-left text-[#1b3026] shadow-2xl sm:p-6"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 id="team-confirmation-title" className="text-xl font-extrabold">{pendingTeam.name}</h2>
                    <p className="mt-1 text-xs text-[#405047]">Roster-based team rating across all 16 players</p>
                  </div>
                  <span className="rounded border border-[#246344]/30 bg-[#e2eee4] px-2 py-1 text-sm font-black tabular-nums text-[#246344]">OVR {pendingTeam.overallRating}</span>
                </div>
                <div className="mt-5">
                  <dl className="grid grid-cols-4 gap-2 rounded border border-[#cbd6cd] bg-white p-2 text-center text-[10px] text-[#405047]">
                    {([
                      ['QB', Math.round(pendingTeam.ratings.qbConsistency * 70)],
                      ['DISC', Math.round(pendingTeam.ratings.penaltyDiscipline * 70)],
                      ['DEPTH', Math.round(pendingTeam.ratings.depth * 70)],
                      ['TEMPO', Math.round(pendingTeam.ratings.tempo * 70)]
                    ] as const).map(([label, rating]) => (
                      <div key={label}><dt>{label}</dt><dd className="text-sm font-bold text-[#1b3026]">{rating}</dd></div>
                    ))}
                  </dl>
                  <h3 className="text-xs font-bold uppercase text-[#246344]">Strengths</h3>
                  <p className="mt-1 text-sm leading-5 text-[#405047]">{pendingTeam.strengths}</p>
                  <h3 className="mt-4 text-xs font-bold uppercase text-[#a34d32]">Weaknesses</h3>
                  <p className="mt-1 text-sm leading-5 text-[#405047]">{pendingTeam.weaknesses}</p>
                  <h3 className="mt-4 text-xs font-bold uppercase text-[#246344]">Offensive playbook</h3>
                  <p className="mt-1 text-sm text-[#405047]">{getTeamPlaybook(pendingTeam.id).offenseIdentity}</p>
                  <p className="mt-1 text-xs text-[#405047]">{getTeamOffensePlays(pendingTeam.id, tacticalMode).map(key => offensivePlaybook[key].name).join(' / ')}</p>
                  <h3 className="mt-4 text-xs font-bold uppercase text-[#a34d32]">Defensive playbook</h3>
                  <p className="mt-1 text-sm text-[#405047]">{getTeamPlaybook(pendingTeam.id).defenseIdentity}</p>
                  <p className="mt-1 text-xs text-[#405047]">{getTeamDefensePlays(pendingTeam.id, tacticalMode).map(key => tacticalMode === 'PRO' ? PRO_DEFENSE_PLAYS[key as ProDefensePlayId].name : defensivePlaybook[key].name).join(' / ')}</p>
                </div>
                <details className="mt-4 rounded-md border border-[#cbd6cd] bg-white p-3">
                  <summary className="cursor-pointer text-sm font-bold">Scout roster - player ratings / 99</summary>
                  <p className="mt-2 text-xs text-[#405047]">Tap players before the snap to identify them. Speed and power are separate: choose space for fast players and contact for strong players.</p>
                  <div className="mt-3 space-y-3">
                    {Object.entries(pendingTeam.roster).map(([slot, player]) => (
                      <div key={slot} className="rounded border border-[#d5ded7] p-2">
                        <div className="flex items-center justify-between gap-2 text-xs font-bold">
                          <span>#{player.number} {player.label}</span>
                          <span className="rounded bg-[#17241c] px-2 py-1" style={{ color: PLAYER_TRAIT_COLORS[player.trait] }}>{player.trait}</span>
                        </div>
                        <dl className="mt-2 grid grid-cols-4 gap-x-2 gap-y-1 text-[10px] text-[#405047]">
                          {([
                            ['Speed', player.ratings.speed], ['Power', player.ratings.power],
                            ['Hands', player.ratings.hands], ['Cover', player.ratings.coverage],
                            ['Tackle', player.ratings.tackling], ['Block', player.ratings.blocking],
                            ['Rush', player.ratings.rush], ['Stamina', player.ratings.endurance]
                            , ['Consistency', player.ratings.consistency], ['Discipline', player.ratings.discipline]
                          ] as const).map(([label, rating]) => (
                            <div key={label}><dt>{label}</dt><dd className="text-sm font-bold text-[#1b3026]">{rating}</dd></div>
                          ))}
                        </dl>
                      </div>
                    ))}
                  </div>
                </details>
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (teamSelectionSide === 'P1') {
                        handleSelectP1Team(pendingTeam.id);
                      } else {
                        handleSelectP2Team(pendingTeam.id);
                      }
                      setPendingTeam(null);
                    }}
                    className="rounded-md bg-[#246344] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1e573b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#246344] cursor-pointer"
                  >
                    pick this team
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingTeam(null)}
                    className="rounded-md border border-[#cbd6cd] bg-white px-4 py-2.5 text-sm font-bold text-[#405047] transition hover:bg-[#edf1ed] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#246344] cursor-pointer"
                  >
                    close
                  </button>
                </div>
              </section>
            </div>
          )}
          {showDynastyPreview && (
            <div
              onPointerDown={event => event.stopPropagation()}
              className="absolute inset-0 z-[115] flex items-center justify-center bg-[#101713]/80 p-4 backdrop-blur-sm"
            >
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="dynasty-modal-title"
                className="w-full max-w-md rounded-lg border-2 border-amber-400 bg-[#0f1712] p-5 text-left text-white shadow-2xl sm:p-6"
              >
                <div className="flex items-center justify-between border-b border-amber-500/30 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded bg-amber-500/20 text-amber-400">
                      <Trophy size={20} />
                    </span>
                    <div>
                      <h2 id="dynasty-modal-title" className="text-base font-black uppercase tracking-wide text-amber-300">
                        Dynasty Mode
                      </h2>
                      <span className="text-[10px] font-bold text-amber-200/70">ARCHITECTED FOR FUTURE EXPANSION</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowDynastyPreview(false)}
                    className="rounded p-1 text-neutral-400 hover:text-white"
                    aria-label="Close dynasty preview"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="mt-4 space-y-3 text-xs leading-relaxed text-neutral-300">
                  <p className="text-sm font-semibold text-amber-100">
                    {p1TeamState.name} is your selected program. Dynasty is coming soon and is not playable yet.
                  </p>
                  <ul className="space-y-2 pl-1">
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-amber-400">⭐</span>
                      <span><b>Multi-Year Legacy:</b> Lead your SEC program across decades with coach prestige tracking and historical records.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-amber-400">🏆</span>
                      <span><b>Trophy Case:</b> Accumulate iconic rivalry trophies like the Iron Bowl Foy-ODK and Golden Egg across consecutive campaigns.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-amber-400">👑</span>
                      <span><b>Championship Dominance:</b> Compete year-in and year-out for the SEC Championship Game in Atlanta and national prestige.</span>
                    </li>
                  </ul>
                </div>

                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowDynastyPreview(false)}
                    className="rounded bg-amber-500 px-4 py-2 text-xs font-black uppercase text-black transition hover:bg-amber-400"
                  >
                    Got It
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>
      )}

      {showPauseMenu && hasKickedOff && (
        <div className="absolute inset-0 z-[120] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="pause-menu-title"
            className="w-full max-w-sm rounded-lg border-2 border-[#ffcc00] bg-[#07110a] p-5 text-center shadow-2xl"
          >
            <h2 id="pause-menu-title" className="text-xl font-black uppercase text-[#ffcc00]">Game Paused</h2>
            <div className="mt-5 grid gap-3">
              <button
                onClick={() => {
                  engineRef.current?.setPaused(false);
                  setShowPauseMenu(false);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[#246344] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#2c7751] cursor-pointer"
              >
                <Play size={17} /> Continue game
              </button>
              {tacticalMode !== 'PRO' && <button
                onClick={handlePauseAttemptFieldGoal}
                className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-amber-400 bg-gradient-to-r from-amber-600 to-yellow-600 px-4 py-3 text-sm font-black uppercase text-white shadow-xl transition hover:from-amber-500 hover:to-yellow-500 active:scale-95 cursor-pointer"
              >
                <Crosshair size={17} />
                <span>Attempt Field Goal</span>
                <span className="text-xs font-semibold opacity-90">
                  ({engineRef.current?.getFieldGoalDistance?.() ?? fgMeterState?.distanceYards ?? 40} YD)
                </span>
              </button>}

              {onlineRole && (
                <button
                  type="button"
                  onClick={handleLeaveOnlineLobby}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-cyan-400/40 bg-cyan-950/30 px-4 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-900/50 cursor-pointer"
                >
                  <Users size={17} /> Leave online match
                </button>
              )}

              <button
                onClick={handleReturnToMainMenu}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-[#bd5635] bg-[#32170f] px-4 py-3 text-sm font-bold text-[#ffd8ca] transition hover:bg-[#512116] cursor-pointer"
              >
                <Home size={17} /> Return to main menu
              </button>
            </div>
          </section>
        </div>
      )}

      {finishedGame && (
        <div className="absolute inset-0 z-[140] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="box-score-title"
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg border-2 border-[#ffcc00] bg-[#07110a] p-5 shadow-2xl"
          >
            <div className="text-center">
              <p className="text-[0.65rem] font-bold uppercase tracking-widest text-neutral-400">Final</p>
              <h2 id="box-score-title" className="mt-1 text-xl font-black uppercase text-[#ffcc00]">Box Score</h2>
              <p className="mt-2 text-sm font-bold text-white">
                {finishedGame.p1Score === finishedGame.p2Score
                  ? 'Tie game'
                  : finishedGame.p1Score > finishedGame.p2Score
                    ? `${p1TeamState.name} win`
                    : `${p2TeamState.name} win`}
              </p>
            </div>

            <table className="mt-5 w-full table-fixed border-collapse text-center text-[0.68rem] sm:text-xs">
              <thead>
                <tr className="border-b border-white/20 text-neutral-400">
                  <th className="w-[42%] px-1 py-2 text-left">Team</th>
                  {[1, 2, 3, 4].map(quarterNumber => (
                    <th key={quarterNumber} className="px-0.5 py-2">Q{quarterNumber}</th>
                  ))}
                  <th className="px-1 py-2 text-white">Final</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-white/10">
                  <th className="break-words px-1 py-3 text-left font-bold" style={getTeamTextStyle(p1TeamState.primaryColor)}>
                    {p1TeamState.name} <span className="text-[0.58rem]">YOU</span>
                  </th>
                  {finishedGame.boxScore.p1Quarters.map((points, index) => (
                    <td key={index} className="px-0.5 py-3 text-neutral-200">{points}</td>
                  ))}
                  <td className="px-1 py-3 text-lg font-black text-white">{finishedGame.p1Score}</td>
                </tr>
                <tr>
                  <th className="break-words px-1 py-3 text-left font-bold" style={getTeamTextStyle(p2TeamState.primaryColor)}>
                    {p2TeamState.name} <span className="text-[0.58rem]">CPU</span>
                  </th>
                  {finishedGame.boxScore.p2Quarters.map((points, index) => (
                    <td key={index} className="px-0.5 py-3 text-neutral-200">{points}</td>
                  ))}
                  <td className="px-1 py-3 text-lg font-black text-white">{finishedGame.p2Score}</td>
                </tr>
              </tbody>
            </table>

            <div className="mt-4 overflow-x-auto rounded border border-white/10">
              <table className="w-full table-fixed border-collapse text-[0.62rem] sm:text-[0.68rem]">
                <thead>
                  <tr className="border-b border-white/20 text-neutral-400">
                    <th className="w-[45%] px-2 py-1.5 text-left">Team Stats</th>
                    <th className="px-1 py-1.5 text-cyan-300">YOU</th>
                    <th className="px-1 py-1.5 text-red-300">CPU</th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    ['Total yards', finishedGame.boxScore.p1Stats.totalYards, finishedGame.boxScore.p2Stats.totalYards],
                    ['Passing', `${finishedGame.boxScore.p1Stats.completions}/${finishedGame.boxScore.p1Stats.passAttempts} · ${finishedGame.boxScore.p1Stats.passingYards}`, `${finishedGame.boxScore.p2Stats.completions}/${finishedGame.boxScore.p2Stats.passAttempts} · ${finishedGame.boxScore.p2Stats.passingYards}`],
                    ['Rushing', `${finishedGame.boxScore.p1Stats.rushAttempts} · ${finishedGame.boxScore.p1Stats.rushingYards}`, `${finishedGame.boxScore.p2Stats.rushAttempts} · ${finishedGame.boxScore.p2Stats.rushingYards}`],
                    ['First downs', finishedGame.boxScore.p1Stats.firstDowns, finishedGame.boxScore.p2Stats.firstDowns],
                    ['Touchdowns', `${finishedGame.boxScore.p1Stats.touchdowns} (${finishedGame.boxScore.p1Stats.passingTouchdowns} P / ${finishedGame.boxScore.p1Stats.rushingTouchdowns} R)`, `${finishedGame.boxScore.p2Stats.touchdowns} (${finishedGame.boxScore.p2Stats.passingTouchdowns} P / ${finishedGame.boxScore.p2Stats.rushingTouchdowns} R)`],
                    ['INT thrown / caught', `${finishedGame.boxScore.p1Stats.interceptionsThrown} / ${finishedGame.boxScore.p1Stats.interceptionsCaught}`, `${finishedGame.boxScore.p2Stats.interceptionsThrown} / ${finishedGame.boxScore.p2Stats.interceptionsCaught}`],
                    ['Sacks made / allowed', `${finishedGame.boxScore.p1Stats.sacks} / ${finishedGame.boxScore.p1Stats.sacksAllowed}`, `${finishedGame.boxScore.p2Stats.sacks} / ${finishedGame.boxScore.p2Stats.sacksAllowed}`],
                    ['Fumbles / lost', `${finishedGame.boxScore.p1Stats.fumbles} / ${finishedGame.boxScore.p1Stats.fumblesLost}`, `${finishedGame.boxScore.p2Stats.fumbles} / ${finishedGame.boxScore.p2Stats.fumblesLost}`],
                    ['Returns', `${finishedGame.boxScore.p1Stats.returns} · ${finishedGame.boxScore.p1Stats.returnYards}`, `${finishedGame.boxScore.p2Stats.returns} · ${finishedGame.boxScore.p2Stats.returnYards}`],
                    ['Field goals', `${finishedGame.boxScore.p1Stats.fieldGoalsMade}/${finishedGame.boxScore.p1Stats.fieldGoalsAttempted}`, `${finishedGame.boxScore.p2Stats.fieldGoalsMade}/${finishedGame.boxScore.p2Stats.fieldGoalsAttempted}`]
                  ] as const).map(([label, p1Value, p2Value]) => (
                    <tr key={label} className="border-b border-white/5 last:border-0">
                      <th className="px-2 py-1 text-left font-medium text-neutral-400">{label}</th>
                      <td className="px-1 py-1 text-center tabular-nums text-neutral-100">{p1Value}</td>
                      <td className="px-1 py-1 text-center tabular-nums text-neutral-100">{p2Value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Rivalry Trophy celebration */}
            {currentRivalry && finishedGame.p1Score > finishedGame.p2Score && (
              <div className="mt-4 rounded-lg border-2 border-yellow-400 bg-gradient-to-r from-amber-950 via-yellow-900 to-amber-950 p-3 text-center shadow-lg">
                <p className="text-xs font-black uppercase tracking-wider text-yellow-300">🏆 RIVALRY TROPHY SECURED! 🏆</p>
                <p className="mt-1 text-sm font-extrabold text-white">{currentRivalry.name} Champions!</p>
                <p className="mt-0.5 text-xs text-yellow-200">Hoisted {currentRivalry.trophy}</p>
                <p className="mt-1 text-[0.65rem] italic text-neutral-300">{currentRivalry.historicFact}</p>
              </div>
            )}

            {/* SEC Championship victory celebration */}
            {seasonProgress?.secChampionship?.played && seasonProgress?.secChampionship?.trophyWon && (
              <div className="mt-4 rounded-lg border-2 border-yellow-300 bg-gradient-to-r from-yellow-700 via-amber-600 to-yellow-700 p-3 text-center shadow-xl">
                <p className="text-xs font-black uppercase tracking-wider text-black">👑 SEC CHAMPIONS! 👑</p>
                <p className="mt-1 text-base font-black text-white">SEC Championship Trophy Won!</p>
                <p className="mt-0.5 text-xs text-yellow-100">Top of the SEC! The Crown Belongs to {p1TeamState.name}!</p>
              </div>
            )}

            <div className={`mt-5 grid gap-2 ${canContinueSeason ? 'sm:grid-cols-2' : ''}`}>
              {canContinueSeason && (
                <button
                  type="button"
                  onClick={() => {
                    setFinishedGame(null);
                    handleStartGame();
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-[#246344] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#2c7751]"
                >
                  Next game <ArrowRight size={17} />
                </button>
              )}
              <button
                type="button"
                onClick={handleReturnToMainMenu}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-[#bd5635] bg-[#32170f] px-4 py-3 text-sm font-bold text-[#ffd8ca] transition hover:bg-[#512116]"
              >
                <Home size={17} /> Return to main menu
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Season Choice Modal (Continue Season vs Start New Season) */}
      {showSeasonChoiceModal && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute inset-0 z-[120] flex flex-col items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="season-choice-title"
            className="flex w-full max-w-md flex-col overflow-hidden rounded-xl border-2 border-emerald-500/60 bg-[#0c1610] text-left text-white shadow-2xl"
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-emerald-500/30 bg-gradient-to-r from-[#14291c] to-[#0c1610] px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                  <Trophy size={20} />
                </span>
                <div>
                  <h3 id="season-choice-title" className="text-base font-black uppercase tracking-wider text-white">
                    SEC Season Mode
                  </h3>
                  <p className="text-[0.68rem] text-emerald-300/80">9-Game SEC Campaign + SEC Championship</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSeasonChoiceModal(false)}
                className="rounded-lg p-1.5 text-neutral-400 transition hover:bg-white/10 hover:text-white"
                title="Close"
                aria-label="Close season choice dialog"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex flex-col gap-3 p-5">
              {/* Option 1: Continue Existing Season */}
              {seasonProgress && (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 p-4 transition hover:border-emerald-400">
                  <span className="inline-block rounded bg-emerald-500/20 px-2 py-0.5 text-[0.65rem] font-black uppercase text-emerald-300">
                    {seasonProgress.results.length > 0 ? 'In Progress' : 'Current Season'}
                  </span>
                  <h4 className="mt-1 text-sm font-black text-white">
                    {getTeam(seasonProgress.teamId).name} Season
                  </h4>
                  <p className="mt-0.5 text-xs text-neutral-300">
                    {seasonProgress.secChampionship?.userQualified && seasonProgress.results.length === seasonProgress.opponentIds.length
                      ? '🏆 SEC Championship Game in Atlanta'
                      : `Week ${seasonProgress.results.length + 1} of 9 · Next: vs ${getTeam(seasonProgress.opponentIds[seasonProgress.results.length] || seasonProgress.opponentIds[0]).name}`}
                  </p>
                  <p className="mt-1 text-[0.72rem] font-bold text-emerald-400">
                    Record: {getSeasonRecord(seasonProgress).wins}-{getSeasonRecord(seasonProgress).losses}
                    {getSeasonRecord(seasonProgress).ties ? `-${getSeasonRecord(seasonProgress).ties}` : ''}
                  </p>
                  <button
                    type="button"
                    onClick={handleContinueSeason}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg transition hover:bg-emerald-500 active:scale-95 cursor-pointer"
                  >
                    Continue Season <ArrowRight size={15} />
                  </button>
                </div>
              )}

              {/* Option 2: Start New Season */}
              <div className="rounded-lg border border-neutral-700 bg-neutral-900/60 p-4 transition hover:border-amber-500/60">
                <span className="inline-block rounded bg-amber-500/20 px-2 py-0.5 text-[0.65rem] font-black uppercase text-amber-300">
                  Fresh Campaign
                </span>
                <h4 className="mt-1 text-sm font-black text-white">
                  Start New Season
                </h4>
                <p className="mt-0.5 text-xs text-neutral-300">
                  Begin a new 9-game regular season schedule from Week 1 with {p1TeamState.name}.
                </p>
                <button
                  type="button"
                  onClick={() => handleStartNewSeason(p1TeamState.id)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-amber-500/60 bg-amber-600/20 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-amber-200 transition hover:bg-amber-600 hover:text-white active:scale-95 cursor-pointer"
                >
                  <RotateCcw size={14} /> Start New Season (Week 1)
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end border-t border-white/10 bg-black/40 px-5 py-3">
              <button
                type="button"
                onClick={() => setShowSeasonChoiceModal(false)}
                className="rounded-lg px-4 py-1.5 text-xs font-bold text-neutral-400 transition hover:bg-white/10 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showTutorial && (
        <Suspense fallback={null}>
          <RealPlayTutorial onFinish={finishTutorial} />
        </Suspense>
      )}

      {showSettings && (
        <section role="dialog" aria-modal="true" aria-labelledby="settings-title" className="fixed inset-0 z-[160] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-neutral-600 bg-[#0d1710] p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 id="settings-title" className="text-lg font-black text-white">Settings</h2>
              <button type="button" onClick={() => setShowSettings(false)} aria-label="Close settings" className="rounded p-2 text-neutral-300 hover:text-white"><X size={20} /></button>
            </div>
            <p className="mt-3 text-xs text-neutral-300">Playbook-based Pro gameplay is the default. Elite unlocks freeform routes and assignments.</p>
            <button type="button" disabled={isTacticalModeLocked} aria-pressed={tacticalMode === 'ELITE'}
              onClick={() => handleSetTacticalMode(tacticalMode === 'ELITE' ? 'PRO' : 'ELITE')}
              className="mt-4 w-full rounded-md border border-emerald-500 bg-emerald-950 px-4 py-3 text-sm font-bold text-emerald-200 hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-40">
              {tacticalMode === 'ELITE' ? 'Disable Elite Mode' : 'Enable Elite Mode'}
            </button>
            {isTacticalModeLocked && <p className="mt-2 text-xs text-neutral-400">Gameplay mode is locked during a game. Return to the main menu to change it.</p>}
            <button type="button" onClick={toggleSound} className="mt-3 w-full rounded-md border border-neutral-600 px-4 py-2 text-sm text-neutral-200">{soundEnabled ? 'Mute sound' : 'Enable sound'}</button>
            <button type="button" onClick={() => { setShowSettings(false); replayTutorial(); }} className="mt-3 w-full rounded-md border border-neutral-600 px-4 py-2 text-sm text-neutral-200">Pro controls tutorial</button>
          </div>
        </section>
      )}

      {showPlaybookCards && (
        <Suspense fallback={null}>
          <TecmoPlaybookCards
            teamId={onlineRole ? onlinePlayerTeam.id : p1TeamState.id}
            opposingTeamId={onlineRole ? onlineOpponentTeam.id : p2TeamState.id}
            isDefense={onlineRole ? !isOnlinePlayerOnOffense : activeOffenseState === 'P2'}
            activeOffensePlay={onlineRole && isOnlinePlayerOnOffense ? onlineSelectedPlay : p1OffPlayState}
            activeDefensePlay={onlineRole && !isOnlinePlayerOnOffense ? onlineSelectedPlay : p1DefPlayState}
            attackDirection={engineRef.current?.attackDirection ?? -1}
            scoreboard={playbookScoreboard}
            canPunt={is4thDown}
            fieldGoalDistance={engineRef.current?.getFieldGoalDistance?.()}
            onSelectPlay={(playId) => {
              if (onlineRole) {
                selectOnlinePlay(playId, isOnlinePlayerOnOffense);
              } else if (activeOffenseState === 'P1') {
                handleSelectOffensePlay(playId);
              } else {
                handleSelectDefensePlay(playId);
              }
            }}
            onSelectSpecialTeams={onlineRole
              ? isOnlinePlayerOnOffense ? playId => selectOnlinePlay(playId, true) : undefined
              : activeOffenseState === 'P1' ? playId => {
                handleSelectOffensePlay(playId);
              } : undefined
            }
            onClose={() => setShowPlaybookCards(false)}
          />
        </Suspense>
      )}
      {showElitePlaybook && isUserPreSnapPhase && tacticalMode === 'ELITE' && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/85 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="elite-playbook-title" className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-neutral-700 bg-[#0d131a] p-4">
            {playbookScoreboard}
            <div className="flex items-center justify-between gap-3">
              <h2 id="elite-playbook-title" className="font-bold">{p1TeamState.nickname} team playbook</h2>
              <button type="button" onClick={() => setShowElitePlaybook(false)} aria-label="Close team playbook"><X size={20} /></button>
            </div>
            <p className="mt-2 text-sm text-neutral-300">{activeOffenseState === 'P1' ? userTeamPlaybook.offenseIdentity : userTeamPlaybook.defenseIdentity}</p>
            <div className="mt-4 space-y-2">
              {(activeOffenseState === 'P1'
                ? [...userTeamPlaybook.eliteOffense, 'FIELD_GOAL', ...(is4thDown ? ['PUNT'] : [])]
                : userTeamPlaybook.eliteDefense).map(key => {
                const play = activeOffenseState === 'P1' ? offensivePlaybook[key] : defensivePlaybook[key];
                return (
                  <button key={key} type="button" onClick={() => {
                    if (activeOffenseState === 'P1') handleSelectOffensePlay(key);
                    else handleSelectDefensePlay(key);
                    setShowElitePlaybook(false);
                  }} className="w-full rounded border border-neutral-600 bg-[#121c27] p-3 text-left hover:border-amber-300">
                    <span className="block text-sm font-bold">{play.name}</span>
                    <span className="mt-1 block text-xs text-neutral-400">{play.desc}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}

    </div>
  );
}

// Mini Canvas component for rendering playbook schematic cards
function PlaySchematicMini({
  playKey,
  isDefense,
  onRender
}: {
  playKey: string;
  isDefense: boolean;
  onRender: (canvas: HTMLCanvasElement | null, playKey: string, isDefense: boolean) => void;
}) {
  const miniCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    onRender(miniCanvasRef.current, playKey, isDefense);
  }, [playKey, isDefense, onRender]);

  return <canvas ref={miniCanvasRef} width={90} height={45} className="w-[90px] h-[45px]" />;
}
