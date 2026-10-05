import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, RefreshCw, HelpCircle, X, Users, Shield, ArrowRight, Search, Pause, Play, Home, Hand, Crosshair, Trophy, Award, RotateCcw } from 'lucide-react';
import { offensivePlaybook, defensivePlaybook } from './game/playbook';
import { sounds } from './game/sound';
import { hasSavedGameSession, mountFootballGame, type GameBoxScore, type GameEngineHandle } from './game/engine';
import { HelmetSpritePreview } from './game/HelmetSpritePreview';
import { RealPlayTutorial } from './game/RealPlayTutorial';
import { TEAM_KEYS, TEAMS, getAllTeams, getTeam, type TeamProfile } from './game/teams';
import { createSeason, getSeasonRecord, loadGameMode, loadSeasonProgress, recordSeasonGame, saveGameMode, saveSeasonProgress, type GameMode, type SeasonProgress } from './game/season';
import { getRivalryForMatchup, type RivalryGame } from './game/rivalries';

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

const CONTROLS_TUTORIAL_KEY = 'backyard-football-controls-tutorial-complete-v1';

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
      onEngineReady: engine => { engineRef.current = engine; },
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
      setP1OffPlayState
    });
  }, []);

  useEffect(() => {
    if (showPauseMenu) engineRef.current?.setPaused(true);
  }, [showPauseMenu]);

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
    if (activeOffenseState === 'P1' && engineRef.current?.phase === 'PRE_SNAP' &&
      !engineRef.current.isKickoffActive() && (key !== 'PUNT' || is4thDown)) {
      setP1OffPlayState(key);
      engineRef.current.selectOffense(key);
    }
  };

  const handleSelectDefensePlay = (key: string) => {
    if (activeOffenseState === 'P2') {
      setP1DefPlayState(key);
      if (engineRef.current) {
        engineRef.current.selectDefense(key);
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
  const isReadyPhase = hasKickedOff && engineRef.current?.phase === 'PRE_SNAP' && !engineRef.current.isKickoffActive();
  const showPuntAction = isReadyPhase && activeOffenseState === 'P1' && is4thDown;

  return (
    <div className="relative w-screen min-h-[100dvh] h-[100dvh] overflow-hidden flex flex-col items-center justify-between py-1 bg-[#030704] text-white font-mono select-none">
      
      {/* Top Header & Scoreboard */}
      <header className="flex flex-col items-center justify-center z-20 mb-0.5 w-full max-w-[430px] px-2 pt-0.5 shrink-0">
        {/* Team Matchup Selector Button */}
        <button
          onClick={() => setShowTeamModal(true)}
          className="flex max-w-full flex-wrap items-center justify-center gap-1.5 px-2.5 py-0.5 mb-1 bg-black/85 hover:bg-neutral-900 border border-[#ffcc00]/60 rounded text-[0.60rem] font-bold text-neutral-200 transition cursor-pointer active:scale-95 shadow-md"
          title="Change Teams, Rosters & Strengths/Weaknesses"
        >
          <Users size={11} className="text-[#ffcc00]" />
          <span className="rounded-sm px-0.5" style={getTeamTextStyle(p1TeamState.primaryColor)}>{p1TeamState.name}</span>
          <span className="text-neutral-400 font-normal">VS</span>
          <span className="rounded-sm px-0.5" style={getTeamTextStyle(p2TeamState.primaryColor)}>{p2TeamState.name}</span>
          {gameMode === 'SEASON' && (
            <span className="text-emerald-400 font-bold ml-0.5">
              • {isChampionshipWeek ? '🏆 SEC TITLE' : `WK ${currentWeekNumber} (${getSeasonRecord(seasonForDisplay).wins}-${getSeasonRecord(seasonForDisplay).losses})`}
            </span>
          )}
          <span className="text-[#ffcc00] ml-1">▾ TEAMS</span>
        </button>

        <div className="grid grid-cols-3 items-center gap-1 w-full bg-black/90 border-2 border-[#ffcc00] px-3 py-1.5 rounded-lg shadow-xl">
          {/* P2 CPU Score */}
          <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
            <span className="rounded-sm px-0.5 font-extrabold text-[0.60rem]" style={getTeamTextStyle(p2TeamState.primaryColor)}>
              {p2TeamState.name} (CPU)
            </span>
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
                onClick={toggleSound}
                className="p-1 text-[#ffcc00] hover:text-white transition cursor-pointer"
                title={soundEnabled ? "Mute" : "Unmute"}
              >
                {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} className="text-neutral-500" />}
              </button>
              <button
                onClick={() => setShowHelp(true)}
                className="p-1 text-[#00ffff] hover:text-white transition cursor-pointer"
                title="Help & Controls"
              >
                <HelpCircle size={13} />
              </button>
              <button
                onClick={handleResetGame}
                className="p-1 text-emerald-400 hover:text-white transition cursor-pointer"
                title="Reset Game"
              >
                <RefreshCw size={13} />
              </button>
              {hasKickedOff && (
                <button
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
            </div>
          </div>

          {/* P1 YOU Score & Quick Controls */}
          <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
            <span className="rounded-sm px-0.5 font-extrabold text-[0.60rem]" style={getTeamTextStyle(p1TeamState.primaryColor)}>
              {p1TeamState.name} (YOU)
            </span>
            <span className="text-white text-base font-black bg-emerald-950/80 border border-emerald-500/50 px-2 py-0.5 rounded leading-none">
              {userScore}
            </span>
          </div>
        </div>
      </header>

      {/* 4th Down Special Teams Punt / Audible Action Controls */}
      {((showPuntAction && p1OffPlayState !== 'PUNT') || p1OffPlayState === 'PUNT') && (
        <div className="flex items-center justify-center gap-2 mb-1 z-30 w-full max-w-[420px] px-2 shrink-0">
          {showPuntAction && p1OffPlayState !== 'PUNT' && (
            <button
              type="button"
              onClick={() => engineRef.current?.callPunt?.()}
              className="min-w-0 px-3.5 py-1.5 rounded-lg border-2 border-cyan-300 bg-gradient-to-r from-cyan-600 to-blue-600 text-xs font-black uppercase text-white shadow-xl transition hover:from-cyan-500 hover:to-blue-500 active:scale-95"
            >
              PUNT
            </button>
          )}
          {p1OffPlayState === 'PUNT' && (
            <button
              type="button"
              onClick={() => handleSelectOffensePlay('SHORT_PASS')}
              className="min-w-0 px-3.5 py-1.5 rounded-lg border border-neutral-500 bg-neutral-900 text-neutral-100 text-xs font-bold shadow-xl transition hover:bg-neutral-800 active:scale-95"
            >
              Audible
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

      {/* Canvas Element */}
      <div className="relative flex-1 flex flex-col items-center justify-center min-h-0 w-full overflow-hidden">
        <canvas
          ref={canvasRef}
          className="bg-[#176620] shadow-[0_8px_30px_rgba(0,0,0,0.9)] rounded-md border-2 border-white touch-none"
        />
      </div>

      {/* Footer Controls & Info */}
      {phaseState === 'RUNNING' && activeOffenseState === 'P2' && !showPauseMenu && !finishedGame && (
        <button type="button" onClick={() => engineRef.current?.diveTackle()} title="Dive tackle" aria-label="Dive tackle" className="fixed bottom-4 right-4 z-[85] flex h-14 w-14 items-center justify-center rounded-lg border-2 border-cyan-300 bg-neutral-950 text-cyan-200 shadow-xl">
          <Crosshair size={26} />
        </button>
      )}

      <footer className="mt-0.5 text-[0.52rem] text-[#adff2f] text-center z-20 px-2 max-w-[420px] flex items-center justify-between gap-2 shrink-0">
        <span className="font-bold opacity-90">v2.8.6 • 7v7 Football</span>
        <span className="text-neutral-300">
          {activeOffenseState === 'P1'
            ? 'Draw Routes • Swipe RB Left/Right for Run Play • Tap RB for Protection • Tap QB to Snap'
            : 'Move Highlighted Defender • Ready to Start'}
        </span>
      </footer>
      <p className="keyboard-controls hidden sm:block mt-0.5 max-w-[420px] px-2 text-center text-[11px] text-neutral-300 shrink-0">
        <kbd>Space</kbd> Ready / Snap · <kbd>WASD</kbd> / <kbd>Arrow keys</kbd> Move
      </p>

      {/* Ready button for user defense */}
      {isReadyPhase && activeOffenseState === 'P2' && !showPauseMenu && !finishedGame && (
        <div className="fixed bottom-3 right-3 z-[85]">
          <button
            type="button"
            onClick={() => {
              engineRef.current?.startPlay?.();
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-emerald-600 via-emerald-500 to-green-500 hover:from-emerald-500 hover:to-green-400 active:scale-95 text-white font-black text-xs uppercase rounded-xl border-2 border-emerald-300 shadow-2xl transition cursor-pointer tracking-wider animate-pulse"
            title="Start Defensive Play (Space)"
            aria-keyshortcuts="Space"
          >
            <Play size={14} className="fill-white" /> READY
            <kbd className="keyboard-controls rounded border border-white/40 px-1 text-[10px]">Space</kbd>
          </button>
        </div>
      )}

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
              <div className="bg-black/60 p-2.5 rounded border border-neutral-800">
                <span className="text-[#00ffff] font-bold block mb-1">1. BACKYARD PLAYMAKER (LINE DRAWING & RUN BLOCKING):</span>
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
                  <li><b className="text-white">Start the Play:</b> Tap the QB on offense or READY on defense. Tap assignment-controlled defenders to cycle blitz, man, RB spy, and zone.</li>
                  <li><b className="text-white">Flip Running Back:</b> Quick double-tap left or right of center to shift the RB side.</li>
                </ul>
              </div>

              <div className="bg-black/60 p-2.5 rounded border border-neutral-800">
                <span className="text-[#ffcc00] font-bold block mb-1">2. TAP TO THROW & RELATIVE JOYSTICK CONTROLS:</span>
                <ul className="list-disc list-inside space-y-1 text-neutral-300">
                  <li><b className="text-white">Tap to Throw:</b> Tap any eligible receiver downfield (WR, Center, or RB) to launch a crisp pass with smart lead targeting so they catch the ball in stride!</li>
                  <li><b className="text-white">Relative Virtual Joystick:</b> Touch and drag anywhere on screen (or use WASD / Arrow keys on keyboard) to control your player with a smooth floating joystick!</li>
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
      {showTeamModal && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-[#101713]/75 p-3 backdrop-blur-sm"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="team-selector-title"
            className="team-selector-panel flex max-h-[90dvh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-[#d5ded7] bg-[#f2f5f2] text-left text-[#1b3026] shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[#dce3dd] bg-white px-4 py-3 sm:px-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#e8f0ea] text-[#246344]">
                  <Users size={20} />
                </span>
                <div>
                  <h2 id="team-selector-title" className="text-xl font-extrabold leading-tight sm:text-2xl">
                    {!hasKickedOff ? (gameMode === 'SEASON' ? 'Season setup' : 'Choose teams') : 'Team matchup'}
                  </h2>
                  <p className="mt-0.5 text-xs text-[#66756b]">{gameMode === 'SEASON' ? '9-Game SEC season + SEC Championship' : 'Single matchup'}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (hasKickedOff) setShowTeamModal(false);
                  else handleStartGame();
                }}
                className="rounded-md p-2 text-[#66756b] transition hover:bg-[#edf1ed] hover:text-[#1b3026]"
                title="Close / Start"
                aria-label="Close team selector"
              >
                <X size={18} />
              </button>
            </div>

            {!hasKickedOff && (
              <div className="grid shrink-0 grid-cols-4 gap-1 border-b border-[#dce3dd] bg-[#f7f9f7] p-2" role="group" aria-label="Game mode">
                <button
                  type="button"
                  aria-pressed={gameMode === 'ONE_GAME'}
                  onClick={() => handleGameModeChange('ONE_GAME')}
                  className={`rounded-md px-2 py-2 text-xs font-bold transition sm:text-sm ${gameMode === 'ONE_GAME' ? 'bg-[#246344] text-white' : 'text-[#59685f] hover:bg-[#e9efea]'}`}
                >
                  One Game
                </button>
                <button
                  type="button"
                  aria-pressed={gameMode === 'SEASON'}
                  onClick={() => {
                    const currentSeason = seasonProgressRef.current || loadSeasonProgress();
                    if (currentSeason) {
                      setShowSeasonChoiceModal(true);
                    } else {
                      handleGameModeChange('SEASON');
                    }
                  }}
                  className={`rounded-md px-2 py-2 text-xs font-bold transition sm:text-sm ${gameMode === 'SEASON' ? 'bg-[#bd5635] text-white' : 'text-[#59685f] hover:bg-[#f4e9e4]'}`}
                >
                  Season
                </button>
                <button
                  type="button"
                  onClick={() => setShowDynastyPreview(true)}
                  className="rounded-md border border-amber-300 bg-amber-50 px-2 py-2 text-xs font-bold text-amber-800 transition hover:bg-amber-100 sm:text-sm"
                  title="Dynasty Mode • Coming Soon"
                >
                  Dynasty <span className="ml-0.5 rounded bg-amber-200 px-1 py-0.5 text-[9px] font-black text-amber-900">SOON</span>
                </button>
                <button
                  type="button"
                  onClick={replayTutorial}
                  className="flex items-center justify-center gap-1 rounded-md px-2 py-2 text-xs font-bold text-[#246344] transition hover:bg-[#e9efea] sm:text-sm"
                >
                  <Hand size={14} aria-hidden="true" /> Tutorial
                </button>
              </div>
            )}

            <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-[#dce3dd] bg-[#e9efea] px-4 py-3 sm:px-6">
              <div className="min-w-0">
                <span className="mb-1 block text-[11px] font-bold uppercase text-[#246344]">You</span>
                <span className="flex items-center gap-2 truncate text-sm font-bold sm:text-base">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: p1TeamState.primaryColor }} />
                  {p1TeamState.name}
                </span>
              </div>
              <span className="rounded bg-white px-2 py-1 text-[11px] font-bold text-[#6b786f]">VS</span>
              <div className="min-w-0 text-right">
                <span className="mb-1 block text-[11px] font-bold uppercase text-[#b45435]">CPU</span>
                <span className="flex items-center justify-end gap-2 truncate text-sm font-bold sm:text-base">
                  {p2TeamState.name}
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: p2TeamState.primaryColor }} />
                </span>
              </div>
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
                {gameMode === 'SEASON' ? `Next opponent: ${p2TeamState.name}` : `Assigning to ${teamSelectionSide === 'P1' ? 'You' : 'CPU'}`}
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="p-3 sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-[#253a2d]">SEC teams <span className="ml-1 text-xs font-normal text-[#718077]">{getAllTeams().length}</span></h3>
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
                      <button
                        key={team.id}
                        type="button"
                        aria-pressed={isActiveSide}
                        onClick={() => setPendingTeam(team)}
                        className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm font-bold transition-colors ${isActiveSide ? 'border-[#246344] bg-[#e8f0ea] text-[#1e573b]' : 'border-[#dce3dd] bg-white text-[#1b3026] hover:bg-[#f8faf8]'} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#246344]`}
                      >
                        <HelmetSpritePreview team={team} />
                        <span>{team.name}</span>
                      </button>
                    );
                  })}
                </div>
                {visibleTeams.length === 0 && (
                  <p className="rounded-md border border-dashed border-[#cbd6cd] px-4 py-8 text-center text-sm text-[#68776d]">No SEC teams match that search.</p>
                )}
              </div>
            </div>

            <div className="shrink-0 border-t border-[#dce3dd] bg-white px-4 py-3 sm:px-6">
              {!hasKickedOff ? (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => {
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
                    className="flex w-full items-center justify-center gap-2 rounded-md bg-[#bd5635] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#a9492d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bd5635]"
                  >
                    {gameMode === 'SEASON'
                      ? (isChampionshipWeek
                          ? 'Play SEC Championship Game 🏆'
                          : seasonComplete
                            ? 'Start new season'
                            : seasonForDisplay.results.length
                              ? `Continue season · Week ${seasonForDisplay.results.length + 1}`
                              : 'Start season')
                      : 'Kick off game'} <ArrowRight size={17} />
                  </button>
                  {gameMode === 'SEASON' && seasonForDisplay.results.length > 0 && !seasonComplete && (
                    <button
                      type="button"
                      onClick={() => handleStartNewSeason(p1TeamState.id)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-md border border-[#cbd6cd] bg-white px-4 py-2 text-xs font-bold text-[#59685f] transition hover:bg-[#f2f5f2] hover:text-[#1b3026]"
                    >
                      <RotateCcw size={14} /> Start new season
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setShowTeamModal(false)}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-[#bd5635] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#a9492d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bd5635]"
                >
                  Save and resume <ArrowRight size={17} />
                </button>
              )}
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
                <div className="mt-6 flex justify-end gap-2">
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
                    className="rounded-md bg-[#246344] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1e573b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#246344]"
                  >
                    pick this team
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingTeam(null)}
                    className="rounded-md border border-[#cbd6cd] bg-white px-4 py-2.5 text-sm font-bold text-[#405047] transition hover:bg-[#edf1ed] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#246344]"
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
                    Take the headset as head coach and build an enduring Southeastern Conference powerhouse:
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
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[#246344] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#2c7751]"
              >
                <Play size={17} /> Continue game
              </button>
              <button
                onClick={handleReturnToMainMenu}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-[#bd5635] bg-[#32170f] px-4 py-3 text-sm font-bold text-[#ffd8ca] transition hover:bg-[#512116]"
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
