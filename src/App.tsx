import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, RefreshCw, HelpCircle, X, Users, Shield, ArrowRight, Search, Pause, Play, Home, Hand, Crosshair, Trophy, Award, RotateCcw, Zap, BookOpen, SlidersHorizontal, Info, Settings, ArrowLeft } from 'lucide-react';
import { offensivePlaybook, defensivePlaybook } from './game/playbook';
import { sounds } from './game/sound';
import { hasSavedGameSession, mountFootballGame, type GameBoxScore, type GameEngineHandle } from './game/engine';
import { HelmetSpritePreview } from './game/HelmetSpritePreview';
import { RealPlayTutorial } from './game/RealPlayTutorial';
import { TEAM_KEYS, TEAMS, getAllTeams, getTeam, type TeamProfile } from './game/teams';
import { createSeason, getSeasonRecord, loadGameMode, loadSeasonProgress, recordSeasonGame, saveGameMode, saveSeasonProgress, type GameMode, type SeasonProgress } from './game/season';
import { getRivalryForMatchup, type RivalryGame } from './game/rivalries';
import type { TacticalMode } from './game/types';
import { PRO_OFFENSE_PLAYS, PRO_DEFENSE_PLAYS, type ProOffensePlayId, type ProDefensePlayId } from './game/proMode';
import { ProPlaybookCards } from './game/ProPlaybookCards';

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

const DEFENDER_ROLES = [
  { id: 'DL', shortLabel: 'DL #1', label: 'Pass Rusher / DL' },
  { id: 'LB1', shortLabel: 'LB #2', label: 'Left Linebacker' },
  { id: 'LB2', shortLabel: 'LB #3', label: 'Right Linebacker' },
  { id: 'CB1', shortLabel: 'CB #4', label: 'Lockdown Corner' },
  { id: 'CB2', shortLabel: 'CB #5', label: 'Boundary Corner' },
  { id: 'MLB', shortLabel: 'MLB #6', label: 'Middle Linebacker' },
  { id: 'FS', shortLabel: 'FS #7', label: 'Free Safety' }
];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // UI States
  const [userScore, setUserScore] = useState(0);
  const [cpuScore, setCpuScore] = useState(0);
  const [downDistanceText, setDownDistanceText] = useState('1st & 10 at OWN 20');
  const [p1OffPlayState, setP1OffPlayState] = useState('SHORT_PASS');
  const [p1OffFormationState, setP1OffFormationState] = useState<'SPREAD' | 'STACK' | 'TRIPS'>('SPREAD');
  const [p1DefPlayState, setP1DefPlayState] = useState('COVER2');
  const [p2OffPlayState, setP2OffPlayState] = useState('SHORT_PASS');
  const [p2DefPlayState, setP2DefPlayState] = useState('COVER2');
  const [activeOffenseState, setActiveOffenseState] = useState('P1');
  const [p1TeamState, setP1TeamState] = useState<TeamProfile>(TEAMS.ALABAMA);
  const [p2TeamState, setP2TeamState] = useState<TeamProfile>(TEAMS.GEORGIA);
  const [teamSelectionSide, setTeamSelectionSide] = useState<'P1' | 'P2'>('P1');
  const [pendingTeam, setPendingTeam] = useState<TeamProfile | null>(null);
  const [teamSearch, setTeamSearch] = useState('');
  const [showTeamModal, setShowTeamModal] = useState(() => !hasSavedGameSession());
  const [setupStep, setSetupStep] = useState<'MODE' | 'TEAMS'>('MODE');
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
  const [selectedDefenderIndex, setSelectedDefenderIndex] = useState(0);
  const [showProPlaybookCards, setShowProPlaybookCards] = useState(false);
  const proPlaybookCallSelectedRef = useRef(false);
  const [phaseState, setPhaseState] = useState('PRE_SNAP');
  const [kickMeterPower, setKickMeterPower] = useState(0.55);
  const [momentumState, setMomentumState] = useState(0);
  const [gameClockState, setGameClockState] = useState({ quarter: 1, seconds: 120 });
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
    const now = Date.now();

    // Priority protection: if a major turnover or touchdown is active (< 3800ms ago),
    // prevent routine priority 1 events from prematurely hiding it!
    if (activePriorityRef.current >= 3 && priority < 3 && now - bannerCreatedAtRef.current < 3800) {
      return;
    }

    activePriorityRef.current = priority;
    bannerCreatedAtRef.current = now;

    if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);

    // Full-screen alert vignette for turnovers and touchdowns
    if (category === 'TURNOVER' || category === 'TOUCHDOWN') {
      if (vignetteTimeoutRef.current) clearTimeout(vignetteTimeoutRef.current);
      setScreenVignette(category);
      vignetteTimeoutRef.current = setTimeout(() => {
        setScreenVignette(null);
      }, 1600);
    }

    setBanner({
      text,
      color,
      visible: true,
      big: big || priority >= 2,
      category,
      subtext: meta?.subtext,
      possessionTeam: meta?.possessionTeam,
      durationMs: duration,
      priority,
      key: now
    });

    bannerTimeoutRef.current = setTimeout(() => {
      setBanner(prev => ({ ...prev, visible: false }));
      activePriorityRef.current = 0;
    }, duration);
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

      if (playKey === 'COVER2') {
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
      setPhaseState,
      setUserScore,
      setCpuScore,
      setP1DefPlayState,
      setP1OffFormationState,
      setMomentumState,
      setP1TeamState,
      setP2TeamState,
      setGameClockState: (quarter, seconds) => setGameClockState({ quarter, seconds }),
      showAnnouncement,
      onEngineReady: engine => {
        engineRef.current = engine;
        engine?.setTacticalMode?.('PRO');
      },
      onGameOver: (p1FinalScore, p2FinalScore, restored, boxScore) => {
        setFinishedGame({
          p1Score: p1FinalScore,
          p2Score: p2FinalScore,
          restored: Boolean(restored),
          boxScore: boxScore ?? { p1Quarters: [0, 0, 0, 0], p2Quarters: [0, 0, 0, 0] }
        });
      },
      setIsKickoffState: (isKickoff, kicking, receiving) => {
        setIsKickoffActive(isKickoff);
        setKickoffSide({ kicking, receiving });
      },
      setIs4thDownState: (val) => setIs4thDown(val),
      setKickMeterPowerState: (power) => setKickMeterPower(power),
      setFieldGoalMeterState: (state) => setFgMeterState(state),
      onControlledDefenderChange: (index) => setSelectedDefenderIndex(index),
      setP1OffPlayState
    });
  }, []);

  useEffect(() => {
    engineRef.current?.setTacticalMode?.(tacticalMode);
  }, [tacticalMode]);

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

  // Handlers for switching teams
  const handleSelectP1Team = (teamId: string) => {
    if (engineRef.current) {
      engineRef.current.selectP1Team(teamId);
    }
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
      }
    }
  };

  const handleSelectP2Team = (teamId: string) => {
    if (engineRef.current) {
      engineRef.current.selectP2Team(teamId);
    }
  };

  // Handlers for user changing offensive/defensive plays (user only controls their own side)
  const handleSelectOffensePlay = (key: string) => {
    setP1OffPlayState(key);
    if (activeOffenseState === 'P1' && engineRef.current?.phase === 'PRE_SNAP' &&
      !engineRef.current.isKickoffActive() && (key !== 'PUNT' || is4thDown)) {
      engineRef.current.selectOffense(key);
    }
  };

  const handleSelectDefensePlay = (key: string) => {
    setP1DefPlayState(key);
    if (activeOffenseState === 'P2') {
      if (engineRef.current) {
        engineRef.current.selectDefense(key);
      }
    }
  };

  const handleSetTacticalMode = (mode: TacticalMode) => {
    if (hasKickedOff) return;
    setTacticalMode(mode);
    engineRef.current?.setTacticalMode?.(mode);
    if (mode === 'PRO') {
      if (!p1OffPlayState.startsWith('PRO_') && p1OffPlayState !== 'FIELD_GOAL' && p1OffPlayState !== 'PUNT') {
        setP1OffPlayState('PRO_QUICK_SLANTS');
        if (activeOffenseState === 'P1') {
          engineRef.current?.selectOffense?.('PRO_QUICK_SLANTS');
        }
      }
      if (!p1DefPlayState.startsWith('PRO_')) {
        setP1DefPlayState('PRO_COVER2_HARD_FLAT');
        if (activeOffenseState === 'P2') {
          engineRef.current?.selectDefense?.('PRO_COVER2_HARD_FLAT');
        }
      }
    } else {
      if (p1OffPlayState.startsWith('PRO_')) {
        setP1OffPlayState('SHORT_PASS');
        if (activeOffenseState === 'P1') {
          engineRef.current?.selectOffense?.('SHORT_PASS');
        }
      }
      if (p1DefPlayState.startsWith('PRO_')) {
        setP1DefPlayState('COVER2');
        if (activeOffenseState === 'P2') {
          engineRef.current?.selectDefense?.('COVER2');
        }
      }
    }
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
  const showPuntAction = tacticalMode !== 'PRO' && isUserPreSnapPhase && activeOffenseState === 'P1' && is4thDown;

  useEffect(() => {
    if (phaseState !== 'PRE_SNAP' || tacticalMode !== 'PRO') {
      proPlaybookCallSelectedRef.current = false;
    }
    const canShowPlaybook = hasKickedOff && phaseState === 'PRE_SNAP' &&
      !isKickoffActive && tacticalMode === 'PRO' &&
      !showPauseMenu && !showTeamModal && !showTutorial && !showSettings && !finishedGame;
    if (!canShowPlaybook) {
      setShowProPlaybookCards(false);
      return;
    }
    if (!proPlaybookCallSelectedRef.current) {
      setShowProPlaybookCards(true);
    }
  }, [finishedGame, hasKickedOff, isKickoffActive, phaseState, showPauseMenu, showTeamModal, showTutorial, showSettings, tacticalMode]);

  return (
    <div className="relative w-screen min-h-[100dvh] h-[100dvh] overflow-hidden flex flex-col items-center justify-between pt-1 pb-0 bg-[#030704] text-white font-mono select-none">
      {!showTutorial && <button
        type="button"
        onClick={() => setShowSettings(true)}
        aria-label="Settings"
        title="Settings"
        className="fixed right-2 top-2 z-[130] rounded-lg border border-neutral-600 bg-neutral-950 p-2 text-neutral-200 shadow-lg hover:text-white"
      >
        <Settings size={20} />
      </button>}
      
      {/* Top Header & Scoreboard */}
      <header className="flex flex-col items-center justify-center z-20 mb-0.5 w-full max-w-[430px] px-2 pt-0.5 shrink-0">
        {/* Relocated Footer / Game Status Bar */}
        <footer className="mb-1 text-[0.52rem] text-[#adff2f] text-center z-20 px-2 w-full max-w-[430px] flex items-center justify-between gap-2 shrink-0">
          <span className="font-bold opacity-90 whitespace-nowrap">
            v2.8.6 • 7v7 Football
            {gameMode === 'SEASON' && (
              <span className="text-emerald-400 font-bold ml-1">
                • {isChampionshipWeek ? '🏆 SEC TITLE' : `WK ${currentWeekNumber} (${getSeasonRecord(seasonForDisplay).wins}-${getSeasonRecord(seasonForDisplay).losses})`}
              </span>
            )}
          </span>
          <span className="text-neutral-300 truncate text-right">
            {isKickoffActive
              ? 'Touch Field or Joystick to Kick Off • WASD/Arrows to Steer Return'
              : tacticalMode === 'PRO'
              ? (activeOffenseState === 'P1'
                  ? 'Choose a Play Card • Touch Joystick to Snap'
                  : 'Pick Defender to Control • Touch Joystick to Start')
              : (activeOffenseState === 'P1'
                  ? 'Draw Routes • Swipe RB Left/Right for Run Play • Touch Joystick to Start'
                  : 'Pick Defender to Control • Touch Joystick to Start')}
          </span>
        </footer>

        <div className="grid grid-cols-3 items-center gap-1 w-full bg-black/90 border-2 border-[#ffcc00] px-3 py-1.5 rounded-lg shadow-xl">
          {/* P2 CPU Score */}
          <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
            <button
              type="button"
              onClick={() => setShowTeamModal(true)}
              className="rounded-sm px-0.5 font-extrabold text-[0.60rem] hover:underline cursor-pointer transition active:scale-95"
              style={getTeamTextStyle(p2TeamState.primaryColor)}
              title="Change Teams"
            >
              {p2TeamState.name} (CPU)
            </button>
            <span className="text-white text-base font-black bg-red-950/80 border border-red-500/50 px-2 py-0.5 rounded leading-none">
              {cpuScore}
            </span>
          </div>

          {/* Down, Distance & Quarter / Clock Center */}
          <div className="flex flex-col items-center text-center px-1">
            <span className="text-[#00ffff] font-extrabold text-[0.72rem] tracking-wide">
              {downDistanceText}
            </span>
            <div className="flex items-center gap-2 text-[0.58rem] text-neutral-300 font-bold mt-0.5">
              <span className="text-[#ffcc00]">Q{gameClockState.quarter}</span>
              <span className={gameClockState.seconds <= 30 ? 'text-red-400 font-extrabold animate-pulse' : 'text-neutral-200'}>
                {Math.floor(gameClockState.seconds / 60)}:{String(gameClockState.seconds % 60).padStart(2, '0')}
              </span>
              {momentumState !== 0 && (
                <span className={momentumState > 0 ? 'text-[#00ffaa]' : 'text-[#ff6666]'}>
                  {momentumState > 0 ? `+${momentumState}` : momentumState} MOM
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center justify-center gap-1 border-t border-white/15 pt-0.5">
              <button
                type="button"
                onClick={() => setShowTeamModal(true)}
                className="p-1 text-[#ffcc00] hover:text-white transition cursor-pointer"
                title="Change Teams"
              >
                <Users size={13} />
              </button>
              <button
                type="button"
                onClick={toggleSound}
                className="p-1 text-[#ffcc00] hover:text-white transition cursor-pointer"
                title={soundEnabled ? "Mute" : "Unmute"}
              >
                {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} className="text-neutral-500" />}
              </button>
              <button
                type="button"
                onClick={() => setShowHelp(true)}
                className="p-1 text-[#00ffff] hover:text-white transition cursor-pointer"
                title="Help & Controls"
              >
                <HelpCircle size={13} />
              </button>
              <button
                type="button"
                onClick={handleResetGame}
                className="p-1 text-emerald-400 hover:text-white transition cursor-pointer"
                title="Reset Game"
              >
                <RefreshCw size={13} />
              </button>
              {hasKickedOff && (
                <button
                  type="button"
                  onClick={() => {
                    engineRef.current?.setPaused(true);
                    setShowPauseMenu(true);
                  }}
                  className="p-1 text-white hover:text-[#ffcc00] transition cursor-pointer"
                  title="Pause game"
                  aria-label="Pause game"
                >
                  <Pause size={13} />
                </button>
              )}
              {!hasKickedOff && (
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
                  className="px-1.5 py-0.5 rounded bg-gradient-to-r from-[#c44d2b] to-[#bd5635] text-[0.55rem] font-black uppercase text-white shadow hover:from-[#b03f1f] hover:to-[#a9492d] active:scale-95 transition cursor-pointer"
                  title="Kick off game now"
                >
                  KICKOFF
                </button>
              )}
            </div>
          </div>

          {/* P1 YOU Score */}
          <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
            <button
              type="button"
              onClick={() => setShowTeamModal(true)}
              className="rounded-sm px-0.5 font-extrabold text-[0.60rem] hover:underline cursor-pointer transition active:scale-95"
              style={getTeamTextStyle(p1TeamState.primaryColor)}
              title="Change Teams"
            >
              {p1TeamState.name} (YOU)
            </button>
            <span className="text-white text-base font-black bg-emerald-950/80 border border-emerald-500/50 px-2 py-0.5 rounded leading-none">
              {userScore}
            </span>
          </div>
        </div>

      </header>

      {/* 4th Down Special Teams Punt / Field Goal Action Controls */}
      {((showPuntAction && p1OffPlayState !== 'PUNT' && p1OffPlayState !== 'FIELD_GOAL') ||
        (isUserPreSnapPhase && !isKickoffActive && activeOffenseState === 'P1' && p1OffPlayState === 'FIELD_GOAL' && fgMeterState !== null)) && (
        <div className="flex items-center justify-center gap-2 mb-1 z-30 w-full max-w-[420px] px-2 shrink-0">
          {showPuntAction && p1OffPlayState !== 'PUNT' && p1OffPlayState !== 'FIELD_GOAL' && (
            <>
              <button
                type="button"
                onClick={() => engineRef.current?.callFieldGoal?.()}
                className="min-w-0 px-3 py-1.5 rounded-lg border-2 border-amber-300 bg-gradient-to-r from-amber-600 to-yellow-500 text-xs font-black uppercase text-white shadow-xl transition hover:from-amber-500 hover:to-yellow-400 active:scale-95 flex items-center gap-1 cursor-pointer"
              >
                <span>FIELD GOAL</span>
                <span className="text-[0.65rem] opacity-90">({engineRef.current?.getFieldGoalDistance?.() ?? fgMeterState?.distanceYards ?? 40} YD)</span>
              </button>
              <button
                type="button"
                onClick={() => engineRef.current?.callPunt?.()}
                className="min-w-0 px-3.5 py-1.5 rounded-lg border-2 border-cyan-300 bg-gradient-to-r from-cyan-600 to-blue-600 text-xs font-black uppercase text-white shadow-xl transition hover:from-cyan-500 hover:to-blue-500 active:scale-95 cursor-pointer"
              >
                PUNT
              </button>
            </>
          )}
          {isUserPreSnapPhase && !isKickoffActive && activeOffenseState === 'P1' && p1OffPlayState === 'FIELD_GOAL' && fgMeterState !== null && (
            <button
              type="button"
              onClick={() => engineRef.current?.lockFieldGoalMeter?.()}
              className="min-w-0 px-4 py-1.5 rounded-lg border-2 border-amber-300 bg-gradient-to-r from-emerald-600 to-teal-500 text-xs font-black uppercase text-white shadow-xl transition hover:from-emerald-500 hover:to-teal-400 active:scale-95 animate-pulse cursor-pointer"
            >
              {fgMeterState.stage === 'POWER' ? '⚡ KICK! (LOCK DISTANCE)' : '🎯 LOCK DIRECTION'}
            </button>
          )}
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
          className={`absolute top-[22%] sm:top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[94vw] max-w-[440px] transition-all duration-200 select-none ${
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
                  className="rounded p-0.5 text-black hover:bg-black/20 transition cursor-pointer"
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
                  className="rounded p-0.5 text-black hover:bg-black/20 transition cursor-pointer"
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
                  className="rounded p-0.5 text-black hover:bg-black/20 transition cursor-pointer"
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

      {/* Canvas Element - Sits directly at the bottom so joystick is available from the bottom of the screen */}
      <div className="relative flex-1 flex flex-col items-center justify-end min-h-0 w-full overflow-hidden pb-0">
        {/* Pre-snap Defender Selector Bar when User is on Defense */}
        {phaseState === 'PRE_SNAP' && activeOffenseState === 'P2' && !showPauseMenu && !finishedGame && !showProPlaybookCards && !showTeamModal && !showSettings && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1 bg-black/85 border border-cyan-400/80 rounded-lg px-2.5 py-1.5 shadow-2xl backdrop-blur-sm max-w-[96%]">
            <div className="flex items-center gap-1.5 text-[0.62rem] font-bold text-cyan-300 uppercase tracking-wider">
              <span>🛡️ Controlled Defender:</span>
              <span className="text-yellow-300 font-extrabold">{DEFENDER_ROLES[selectedDefenderIndex]?.label || 'Defender'}</span>
              <span className="text-neutral-400 font-normal hidden sm:inline">(or tap player on field)</span>
            </div>
            <div className="flex items-center gap-1 flex-wrap justify-center">
              {DEFENDER_ROLES.map((role, idx) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => {
                    engineRef.current?.selectDefender?.(idx);
                    setSelectedDefenderIndex(idx);
                  }}
                  className={`px-1.5 py-0.5 rounded text-[0.60rem] font-bold transition-all ${
                    selectedDefenderIndex === idx
                      ? 'bg-cyan-400 text-black shadow-md shadow-cyan-400/50 scale-105 border border-white'
                      : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white border border-neutral-600'
                  }`}
                  title={`Control ${role.label} with Joystick`}
                >
                  {role.shortLabel}
                </button>
              ))}
            </div>
          </div>
        )}

        <canvas
          ref={canvasRef}
          className="bg-[#176620] shadow-[0_8px_30px_rgba(0,0,0,0.9)] rounded-md border-2 border-white touch-none"
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
                <HelpCircle size={16} /> 7 ON 7 FIELD PLAYBOOK & CONTROLS
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
                    <li>Touch the floating joystick area at the bottom of the screen or press Space, WASD, or an arrow key to start. On defense, steer the highlighted free defender while teammates execute the chosen scheme.</li>
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
                      <li><b className="text-[#00ffaa]">Running Back (RB):</b> Swipe left or right on the RB to call a <b>Designed Run Play</b> (QB hands off to RB)! Straight forward line calls a <b>FLY / GO</b> route streaking deep downfield!</li>
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
                  <li><b className="text-white">Relative Virtual Joystick:</b> Touch anywhere in the bottom control area—from the top of the joystick outer ring to the bottom of the screen, all the way left to right—to start the play. The stick appears where you touch; drag it to control your player! On keyboard, press Space, WASD, or any Arrow key to start snaps, kickoffs, and punts; WASD / Arrow keys also move your player.</li>
                  <li><b className="text-white">Quarterback Control:</b> Maneuver the QB in the pocket, step up to avoid blitzers, roll out, or cross the line of scrimmage to scramble!</li>
                  <li><b className="text-white">Ball Carrier Control:</b> Steer the Running Back through holes, cut laterally, or slow down behind lead blockers!</li>
                  <li><b className="text-white">Edge Rusher on Defense:</b> Take control of the edge rusher with the joystick, bend around the tackle, collapse the pocket, and deliver a bone-crushing sack!</li>
                  <li><b className="text-white">Zero Interference:</b> The relative joystick never interferes with tapping a receiver to pass—two-thumb control works effortlessly!</li>
                </ul>
              </div>

              <div className="bg-black/60 p-2.5 rounded border border-neutral-800">
                <span className="text-[#00ffaa] font-bold block mb-1">3. BALL CARRIER MOVES & BROKEN TACKLES:</span>
                <ul className="list-disc list-inside space-y-1 text-neutral-300">
                  <li><b className="text-white">Broken Tackles:</b> Running backs shed contact more often than receivers. A broken tackle briefly slows momentum before a modest burst.</li>
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
        <section role="dialog" aria-modal="true" aria-labelledby="game-mode-title" className="fixed inset-0 z-[100] flex items-center justify-center bg-[#07110a] p-4">
          <div className="w-full max-w-2xl rounded-xl border border-neutral-700 bg-[#0d1710] p-5 shadow-2xl sm:p-8">
            <h1 id="game-mode-title" className="text-center text-2xl font-black uppercase text-amber-300 sm:text-3xl">Backyard Football</h1>
            <p className="mt-2 text-center text-sm text-neutral-300">Choose how you want to play. Pick your teams next.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3" role="group" aria-label="Game mode">
              {([
                ['ONE_GAME', 'One Game', 'Pick your team and the CPU opponent for a single matchup.'],
                ['SEASON', 'Season', 'Choose your SEC team for a 9-game season and a shot at the championship.'],
                ['DYNASTY', 'Dynasty', 'Choose your program and preview the coming-soon Dynasty mode.']
              ] as const).map(([mode, label, description]) => (
                <button key={mode} type="button" onClick={() => handleGameModeChange(mode)} className="rounded-lg border border-neutral-600 bg-[#15251b] p-4 text-left transition hover:border-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400">
                  <span className="block text-lg font-black text-white">{label}</span>
                  {mode === 'DYNASTY' && <span className="mt-1 block text-[10px] font-bold uppercase text-amber-300">Coming soon</span>}
                  <span className="mt-2 block text-xs leading-5 text-neutral-300">{description}</span>
                </button>
              ))}
            </div>
            {seasonProgress && (
              <button type="button" onClick={handleContinueSeason} className="mt-4 w-full rounded-md border border-emerald-500/50 px-3 py-2 text-sm font-bold text-emerald-300 hover:bg-emerald-900/30">
                Continue season - {getTeam(seasonProgress.teamId).name}
              </button>
            )}
            <button type="button" onClick={replayTutorial} className="mt-5 flex w-full items-center justify-center gap-2 text-sm font-bold text-neutral-300 hover:text-white">
              <Hand size={16} /> Learn to play
            </button>
          </div>
        </section>
      )}
      {showTeamModal && (hasKickedOff || setupStep === 'TEAMS') && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-start sm:justify-center bg-[#101713]/90 sm:p-3 backdrop-blur-sm overflow-hidden"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="team-selector-title"
            className="team-selector-panel flex flex-col h-full sm:h-auto sm:max-h-[94vh] w-full max-w-5xl rounded-none sm:rounded-xl border-0 sm:border border-[#d5ded7] bg-[#f2f5f2] text-left text-[#1b3026] shadow-2xl overflow-hidden"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[#dce3dd] bg-white px-4 py-3 sm:px-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#e8f0ea] text-[#246344]">
                  <Users size={20} />
                </span>
                <div>
                  <h2 id="team-selector-title" className="text-xl font-extrabold leading-tight sm:text-2xl">
                    {!hasKickedOff ? (gameMode === 'SEASON' ? 'Season setup' : gameMode === 'DYNASTY' ? 'Choose your Dynasty team' : 'Choose teams') : 'Team matchup'}
                  </h2>
                  <p className="mt-0.5 text-xs text-[#66756b]">{gameMode === 'SEASON' ? '9-Game SEC season + SEC Championship' : gameMode === 'DYNASTY' ? 'Select one program to preview Dynasty - coming soon' : 'Single matchup'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (hasKickedOff) setShowTeamModal(false);
                    else setSetupStep('MODE');
                  }}
                  className="rounded-md p-2 text-[#66756b] transition hover:bg-[#edf1ed] hover:text-[#1b3026]"
                  title={hasKickedOff ? 'Close team selector' : 'Back to game modes'}
                  aria-label={hasKickedOff ? 'Close team selector' : 'Back to game modes'}
                >
                  {hasKickedOff ? <X size={18} /> : <ArrowLeft size={18} />}
                </button>
              </div>
            </div>

            <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-[#dce3dd] bg-[#e9efea] px-4 py-3 sm:px-6">
              <div className="min-w-0">
                <span className="mb-1 block text-[11px] font-bold uppercase text-[#246344]">You</span>
                <span className="flex items-center gap-2 truncate text-sm font-bold sm:text-base">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: p1TeamState.primaryColor }} />
                  {p1TeamState.name}
                </span>
              </div>
              {gameMode !== 'DYNASTY' && <span className="rounded bg-white px-2 py-1 text-[11px] font-bold text-[#6b786f]">VS</span>}
              {gameMode !== 'DYNASTY' && (
              <div className="min-w-0 text-right">
                <span className="mb-1 block text-[11px] font-bold uppercase text-[#b45435]">CPU</span>
                <span className="flex items-center justify-end gap-2 truncate text-sm font-bold sm:text-base">
                  {p2TeamState.name}
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: p2TeamState.primaryColor }} />
                </span>
              </div>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#dce3dd] bg-white px-4 py-3 sm:px-6">
              <div className="flex gap-2" role="group" aria-label="Choose which side to assign">
                <button
                  type="button"
                  aria-pressed={teamSelectionSide === 'P1'}
                  onClick={() => setTeamSelectionSide('P1')}
                  className={`min-w-28 rounded-md border px-3 py-2 text-left transition ${teamSelectionSide === 'P1' ? 'border-[#246344] bg-[#e8f0ea] text-[#1e573b]' : 'border-[#dce3dd] bg-white text-[#59685f] hover:bg-[#f5f7f5]'}`}
                >
                  <span className="block text-xs font-bold">You</span>
                  <span className="block text-[11px]">{p1TeamState.name}</span>
                </button>
                {gameMode === 'ONE_GAME' && (
                  <button
                    type="button"
                    aria-pressed={teamSelectionSide === 'P2'}
                    onClick={() => setTeamSelectionSide('P2')}
                    className={`min-w-28 rounded-md border px-3 py-2 text-left transition ${teamSelectionSide === 'P2' ? 'border-[#b45435] bg-[#f7ece7] text-[#93442c]' : 'border-[#dce3dd] bg-white text-[#59685f] hover:bg-[#f5f7f5]'}`}
                  >
                    <span className="block text-xs font-bold">CPU</span>
                    <span className="block text-[11px]">{p2TeamState.name}</span>
                  </button>
                )}
              </div>
              <span className="text-xs text-[#758178]">
                {gameMode === 'SEASON' ? `Next opponent: ${p2TeamState.name}` : gameMode === 'DYNASTY' ? 'Choose your program' : `Assigning to ${teamSelectionSide === 'P1' ? 'You' : 'CPU'}`}
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="p-3 sm:p-5">
                {/* Step 2: SEC Teams Selection */}
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-[#253a2d]">Step 2: SEC teams <span className="ml-1 text-xs font-normal text-[#718077]">{getAllTeams().length}</span></h3>
                  <label className="flex w-44 items-center gap-2 rounded-md border border-[#dce3dd] bg-white px-2.5 py-2 text-[#718077] focus-within:border-[#7da78a] sm:w-56">
                    <Search size={15} aria-hidden="true" />
                    <input
                      type="search"
                      aria-label="Search SEC teams"
                      placeholder="Search teams"
                      value={teamSearch}
                      onChange={event => setTeamSearch(event.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-xs text-[#253a2d] outline-none placeholder:text-[#87928a]"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleTeams.map((team) => {
                    const isP1 = p1TeamState.id === team.id;
                    const isP2 = p2TeamState.id === team.id;
                    const isActiveSide = teamSelectionSide === 'P1' ? isP1 : isP2;

                    return (
                      <div
                        key={team.id}
                        className={`flex items-center justify-between gap-1.5 rounded-lg border px-3 py-2 transition-all ${
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
                          className="flex flex-1 items-center gap-2 text-left text-sm font-bold min-w-0 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#246344]"
                        >
                          <HelmetSpritePreview team={team} />
                          <span>{team.name}</span>
                          {isActiveSide && (
                            <span className="shrink-0 rounded bg-[#246344] text-white px-1.5 py-0.5 text-[9px] font-black uppercase ml-auto">
                              {teamSelectionSide === 'P1' ? 'YOU' : 'CPU'}
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingTeam(team)}
                          className="shrink-0 rounded p-1 text-neutral-400 hover:text-neutral-800 hover:bg-black/5 transition cursor-pointer"
                          title={`View ${team.name} scouting report`}
                          aria-label={`View ${team.name} scouting report`}
                        >
                          <Info size={15} />
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
            <div className="shrink-0 sticky bottom-0 z-30 border-t-2 border-[#cbd6cd] bg-white px-4 py-3 sm:px-6 shadow-xl">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <span className="text-xs font-bold text-[#59685f]">{gameMode === 'ONE_GAME' ? 'One Game' : gameMode === 'SEASON' ? 'Season' : 'Dynasty preview'}</span>

                <div className="flex items-center gap-2">
                  {hasKickedOff && (
                    <button
                      type="button"
                      onClick={() => setShowTeamModal(false)}
                      className="rounded-md border border-[#cbd6cd] bg-white px-3 py-2.5 text-xs font-bold text-[#405047] transition hover:bg-[#edf1ed] cursor-pointer"
                    >
                      Save & resume
                    </button>
                  )}
                  {gameMode === 'SEASON' && seasonForDisplay.results.length > 0 && !seasonComplete && !hasKickedOff && (
                    <button
                      type="button"
                      onClick={() => handleStartNewSeason(p1TeamState.id)}
                      className="rounded-md border border-[#cbd6cd] bg-white px-3 py-2.5 text-xs font-bold text-[#59685f] transition hover:bg-[#f2f5f2] cursor-pointer"
                    >
                      <RotateCcw size={13} className="inline mr-1" /> Start new season
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
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#c44d2b] to-[#bd5635] px-6 py-3 text-sm sm:text-base font-black uppercase tracking-wider text-white shadow-xl transition hover:from-[#b03f1f] hover:to-[#a9492d] active:scale-95 cursor-pointer ring-2 ring-[#bd5635]/40"
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
                    <ArrowRight size={18} />
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
                className="w-full max-w-md rounded-lg border border-[#d5ded7] bg-[#f2f5f2] p-5 text-left text-[#1b3026] shadow-2xl sm:p-6"
              >
                <h2 id="team-confirmation-title" className="text-xl font-extrabold">{pendingTeam.name}</h2>
                <div className="mt-5">
                  <h3 className="text-xs font-bold uppercase text-[#246344]">Strengths</h3>
                  <p className="mt-1 text-sm leading-5 text-[#405047]">{pendingTeam.strengths}</p>
                  <h3 className="mt-4 text-xs font-bold uppercase text-[#a34d32]">Weaknesses</h3>
                  <p className="mt-1 text-sm leading-5 text-[#405047]">{pendingTeam.weaknesses}</p>
                </div>
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
        <RealPlayTutorial onFinish={finishTutorial} />
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

      {showProPlaybookCards && (
        <ProPlaybookCards
          activeOffensePlay={p1OffPlayState}
          activeDefensePlay={p1DefPlayState}
          initialTab={activeOffenseState === 'P2' ? 'DEFENSE' : 'OFFENSE'}
          selectionOnly
          downDistanceText={downDistanceText}
          canPunt={is4thDown}
          fieldGoalDistance={engineRef.current?.getFieldGoalDistance?.()}
          onSelectSpecialTeams={activeOffenseState === 'P1' ? (playId) => {
            proPlaybookCallSelectedRef.current = true;
            handleSelectOffensePlay(playId);
          } : undefined}
          onSelectOffensePlay={(playId) => {
            proPlaybookCallSelectedRef.current = true;
            handleSelectOffensePlay(playId);
          }}
          onSelectDefensePlay={(playId) => {
            proPlaybookCallSelectedRef.current = true;
            handleSelectDefensePlay(playId);
          }}
          onClose={() => setShowProPlaybookCards(false)}
        />
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
