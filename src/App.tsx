import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, RefreshCw, HelpCircle, X, Users, Shield, ArrowRight, Search, Pause, Play, Home, Hand } from 'lucide-react';
import { offensivePlaybook, defensivePlaybook } from './game/playbook';
import { sounds } from './game/sound';
import { hasSavedGameSession, mountFootballGame, type GameEngineHandle } from './game/engine';
import { HelmetSpritePreview } from './game/HelmetSpritePreview';
import { RealPlayTutorial } from './game/RealPlayTutorial';
import { TEAM_KEYS, TEAMS, getAllTeams, getTeam, type TeamProfile } from './game/teams';
import { createSeason, getSeasonRecord, loadGameMode, loadSeasonProgress, recordSeasonGame, saveGameMode, saveSeasonProgress, type GameMode, type SeasonProgress } from './game/season';

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
  const [p1DefPlayState, setP1DefPlayState] = useState('COVER3');
  const [p2OffPlayState, setP2OffPlayState] = useState('SHORT_PASS');
  const [p2DefPlayState, setP2DefPlayState] = useState('COVER3');
  const [activeOffenseState, setActiveOffenseState] = useState('P1');
  const [p1TeamState, setP1TeamState] = useState<TeamProfile>(TEAMS.ALABAMA);
  const [p2TeamState, setP2TeamState] = useState<TeamProfile>(TEAMS.GEORGIA);
  const [teamSelectionSide, setTeamSelectionSide] = useState<'P1' | 'P2'>('P1');
  const [pendingTeam, setPendingTeam] = useState<TeamProfile | null>(null);
  const [teamSearch, setTeamSearch] = useState('');
  const [showTeamModal, setShowTeamModal] = useState(() => !hasSavedGameSession());
  const [hasKickedOff, setHasKickedOff] = useState(hasSavedGameSession);
  const [showPauseMenu, setShowPauseMenu] = useState(hasSavedGameSession);
  const [gameMode, setGameMode] = useState<GameMode>(() => loadGameMode());
  const [seasonProgress, setSeasonProgress] = useState<SeasonProgress | null>(() => loadSeasonProgress());
  const [finishedGame, setFinishedGame] = useState<{ p1Score: number; p2Score: number; restored: boolean } | null>(null);
  const gameModeRef = useRef(gameMode);
  const seasonProgressRef = useRef(seasonProgress);
  const [isKickoffActive, setIsKickoffActive] = useState(true);
  const [kickoffSide, setKickoffSide] = useState<{ kicking: 'P1' | 'P2'; receiving: 'P1' | 'P2' }>({ kicking: 'P2', receiving: 'P1' });
  const [is4thDown, setIs4thDown] = useState(false);
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

      if (playKey === 'BLITZ') {
        drawZoneLine(18, canvas.height / 2 - 10, 82, canvas.height / 2 - 10);
        drawDefender(18, canvas.height / 2 - 10, '#ff3333');
        drawDefender(28, canvas.height / 2 - 10, '#ff3333');
        drawDefender(38, canvas.height / 2 - 10, '#ff3333');
        drawDefender(48, canvas.height / 2 - 10, '#ff3333');
        drawDefender(58, canvas.height / 2 - 10, '#ff3333');
        drawDefender(68, canvas.height / 2 - 10, '#ff3333');
        drawDefender(50, canvas.height / 2 + 8, '#ffb3b3');
        drawDefender(37, canvas.height / 2 + 9, '#ffb3b3');
        drawDefender(63, canvas.height / 2 + 9, '#ffb3b3');
      } else if (playKey === 'QUARTERS') {
        drawDefender(18, canvas.height / 2 - 12, '#ff6666');
        drawDefender(32, canvas.height / 2 - 12, '#ff6666');
        drawDefender(68, canvas.height / 2 - 12, '#ff6666');
        drawDefender(82, canvas.height / 2 - 12, '#ff6666');
        drawDefender(18, canvas.height / 2 + 12, '#ff6666');
        drawDefender(32, canvas.height / 2 + 12, '#ff6666');
        drawDefender(68, canvas.height / 2 + 12, '#ff6666');
        drawDefender(82, canvas.height / 2 + 12, '#ff6666');
        drawZoneLine(18, canvas.height / 2 - 12, 18, 8);
        drawZoneLine(82, canvas.height / 2 - 12, 82, 8);
        drawZoneLine(18, canvas.height / 2 + 12, 18, canvas.height - 8);
        drawZoneLine(82, canvas.height / 2 + 12, 82, canvas.height - 8);
      } else if (playKey === 'TAMPA2') {
        drawDefender(22, canvas.height / 2 - 12, '#ff6666');
        drawDefender(50, canvas.height / 2 - 14, '#ffcccc');
        drawDefender(78, canvas.height / 2 - 12, '#ff6666');
        drawDefender(38, canvas.height / 2 + 10, '#ff6666');
        drawDefender(62, canvas.height / 2 + 10, '#ff6666');
        drawDefender(50, canvas.height / 2 + 18, '#ff6666');
        drawZoneLine(50, canvas.height / 2 - 14, 50, 30);
      } else if (playKey === 'COVER2MAN') {
        drawDefender(22, canvas.height / 2 - 14, '#ff6666');
        drawDefender(78, canvas.height / 2 - 14, '#ff6666');
        drawDefender(22, canvas.height / 2 + 10, '#ff6666');
        drawDefender(78, canvas.height / 2 + 10, '#ff6666');
        drawDefender(38, canvas.height / 2 + 10, '#ffcccc');
        drawDefender(62, canvas.height / 2 + 10, '#ffcccc');
        drawDefender(50, canvas.height / 2 + 18, '#ffcccc');
        drawZoneLine(22, canvas.height / 2 - 14, 22, 8);
        drawZoneLine(78, canvas.height / 2 - 14, 78, 8);
      } else if (playKey === 'ROBBER') {
        drawDefender(22, canvas.height / 2 - 10, '#ff6666');
        drawDefender(38, canvas.height / 2 - 4, '#ff6666');
        drawDefender(50, canvas.height / 2 - 15, '#ff3333');
        drawDefender(62, canvas.height / 2 - 4, '#ff6666');
        drawDefender(78, canvas.height / 2 - 10, '#ff6666');
        drawDefender(50, canvas.height / 2 + 18, '#ffcccc');
        drawZoneLine(50, canvas.height / 2 - 15, 50, 10);
      } else {
        drawDefender(50, canvas.height / 2 - 14, '#ff3333');
        drawDefender(28, canvas.height / 2 + 2, '#ff6666');
        drawDefender(72, canvas.height / 2 + 2, '#ff6666');
        drawDefender(38, canvas.height / 2 + 10, '#ff6666');
        drawDefender(62, canvas.height / 2 + 10, '#ff6666');
        drawDefender(50, canvas.height / 2 + 18, '#ffcccc');
        drawZoneLine(50, canvas.height / 2 - 14, 50, 8);
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
      onGameOver: (p1FinalScore, p2FinalScore, restored) => {
        setFinishedGame({ p1Score: p1FinalScore, p2Score: p2FinalScore, restored: Boolean(restored) });
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
    if (activeOffenseState === 'P1') {
      setP1OffPlayState(key);
      if (engineRef.current) {
        engineRef.current.selectOffense(key);
      }
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
    saveGameMode(gameMode);
    gameModeRef.current = gameMode;
    if (gameMode === 'SEASON') {
      let currentSeason = seasonProgressRef.current;
      if (!currentSeason || currentSeason.teamId !== p1TeamState.id || currentSeason.results.length >= currentSeason.opponentIds.length) {
        currentSeason = createSeason(p1TeamState.id, TEAM_KEYS);
      }
      const nextOpponentId = currentSeason.opponentIds[currentSeason.results.length];
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
    setUserScore(0);
    setCpuScore(0);
    setHasKickedOff(false);
    setShowPauseMenu(false);
    setShowTeamModal(true);
  };

  useEffect(() => {
    if (!finishedGame) return;
    setFinishedGame(null);
    if (gameModeRef.current === 'ONE_GAME') {
      handleReturnToMainMenu();
      return;
    }

    const currentSeason = seasonProgressRef.current;
    if (!currentSeason) {
      handleReturnToMainMenu();
      return;
    }
    const savedResult = currentSeason.results[currentSeason.results.length - 1];
    const resultAlreadySaved = finishedGame.restored && savedResult
      && savedResult.p1Score === finishedGame.p1Score && savedResult.p2Score === finishedGame.p2Score;
    const updatedSeason = resultAlreadySaved
      ? currentSeason
      : recordSeasonGame(currentSeason, finishedGame.p1Score, finishedGame.p2Score);
    seasonProgressRef.current = updatedSeason;
    setSeasonProgress(updatedSeason);
    saveSeasonProgress(updatedSeason);
    if (updatedSeason.results.length < updatedSeason.opponentIds.length) {
      handleStartGame();
    } else {
      handleReturnToMainMenu();
    }
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

  const handleGameModeChange = (mode: GameMode) => {
    gameModeRef.current = mode;
    setGameMode(mode);
    saveGameMode(mode);
    if (mode === 'SEASON') {
      setTeamSelectionSide('P1');
      const currentSeason = seasonProgressRef.current;
      const nextSeason = currentSeason?.teamId === p1TeamState.id
        ? currentSeason
        : createSeason(p1TeamState.id, TEAM_KEYS);
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

  const visibleTeams = getAllTeams().filter(team =>
    team.name.toLowerCase().includes(teamSearch.trim().toLowerCase())
  );
  const seasonForDisplay = seasonProgress?.teamId === p1TeamState.id
    ? seasonProgress
    : createSeason(p1TeamState.id, TEAM_KEYS);
  const seasonRecord = getSeasonRecord(seasonForDisplay);
  const seasonComplete = seasonForDisplay.results.length >= seasonForDisplay.opponentIds.length;

  return (
    <div className="relative w-screen h-screen overflow-hidden flex flex-col items-center justify-center bg-[#030704] text-white font-mono select-none">
      
      {/* Top Header & Scoreboard */}
      <header className="flex flex-col items-center justify-center z-20 mb-1 w-full max-w-[430px] px-2 pt-1">
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
          </div>

          {/* P1 YOU Score & Quick Controls */}
          <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
            <span className="rounded-sm px-0.5 font-extrabold text-[0.60rem]" style={getTeamTextStyle(p1TeamState.primaryColor)}>
              {p1TeamState.name} (YOU)
            </span>
            <span className="text-white text-base font-black bg-emerald-950/80 border border-emerald-500/50 px-2 py-0.5 rounded leading-none">
              {userScore}
            </span>

            <div className="flex items-center gap-1 ml-1 border-l border-white/20 pl-1">
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
        </div>
      </header>

      {/* Special Teams: Kickoff Controls & Status HUD */}
      {isKickoffActive ? (
        <div className="flex items-center justify-between w-full max-w-[420px] bg-black/95 border-2 border-[#ffcc00] px-3 py-1.5 rounded-lg mb-1 shadow-2xl z-20">
          {kickoffSide.kicking === 'P1' ? (
            <>
              <div className="flex flex-col text-left">
                <span className="text-[#ffcc00] font-black text-[0.72rem] tracking-wider flex items-center gap-1">
                  🏈 YOU ARE KICKING OFF
                </span>
                <span className="text-neutral-300 text-[0.58rem]">
                  POWER: <b className="text-white">{Math.round(kickMeterPower * 100)}%</b> • TAP FIELD OR BUTTON
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-20 h-3 bg-neutral-800 rounded border border-white/40 overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 via-cyan-400 to-emerald-400 transition-all duration-75"
                    style={{ width: `${kickMeterPower * 100}%` }}
                  />
                </div>
                <button
                  onClick={() => engineRef.current?.kickoff?.(kickMeterPower)}
                  className="px-3 py-1 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-black font-black text-xs uppercase rounded transition cursor-pointer shadow-lg active:scale-95"
                >
                  BOOT KICK 🏈
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between w-full">
              <span className="text-[#00ffff] font-black text-[0.72rem] tracking-wide flex items-center gap-1.5">
                🏈 {p2TeamState.name.toUpperCase()} KICKING OFF
              </span>
              <span className="text-neutral-300 text-[0.58rem] bg-neutral-900 border border-neutral-700 px-2 py-0.5 rounded font-bold">
                PREPARE FOR RETURN 🏃
              </span>
            </div>
          )}
        </div>
      ) : activeOffenseState === 'P1' && p1OffPlayState === 'PUNT' ? (
        /* Special Teams: Punt Skill Meter HUD */
        <div className="flex items-center justify-between w-full max-w-[420px] bg-black/95 border-2 border-[#00ffff] px-3 py-1.5 rounded-lg mb-1 shadow-2xl z-20">
          <div className="flex flex-col text-left">
            <span className="text-[#00ffff] font-black text-[0.72rem] tracking-wider flex items-center gap-1">
              🏈 PUNT UNIT READY
            </span>
            <span className="text-neutral-300 text-[0.58rem]">
              POWER: <b className="text-white">{Math.round(kickMeterPower * 100)}%</b> (~{Math.round(25 + kickMeterPower * 30)} YDS)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-20 h-3 bg-neutral-800 rounded border border-white/40 overflow-hidden relative">
              <div
                className="h-full bg-gradient-to-r from-amber-400 via-cyan-400 to-emerald-400 transition-all duration-75"
                style={{ width: `${kickMeterPower * 100}%` }}
              />
            </div>
            <button
              onClick={() => engineRef.current?.punt?.(kickMeterPower)}
              className="px-3 py-1 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-black font-black text-xs uppercase rounded transition cursor-pointer shadow-lg active:scale-95"
            >
              BOOT PUNT 🏈
            </button>
            <button
              onClick={() => handleSelectOffensePlay('SHORT_PASS')}
              className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-600 rounded font-bold text-[0.60rem] transition cursor-pointer"
            >
              AUDIBLE
            </button>
          </div>
        </div>
      ) : is4thDown && activeOffenseState === 'P1' ? (
        /* Special Teams: 4th Down Decision & Punt Option HUD */
        <div className="flex items-center justify-between w-full max-w-[420px] bg-red-950/95 border-2 border-red-500 px-3 py-1.5 rounded-lg mb-1 shadow-2xl z-20 animate-pulse">
          <div className="flex flex-col text-left">
            <span className="text-white font-black text-[0.72rem] tracking-wider flex items-center gap-1">
              ⚠️ 4TH DOWN DECISION!
            </span>
            <span className="text-red-200 text-[0.56rem]">
              Punt to flip field or Go For It!
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => engineRef.current?.callPunt?.()}
              className="px-3 py-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded font-black text-xs uppercase tracking-wide transition cursor-pointer shadow-md"
            >
              🏈 PUNT UNIT
            </button>
            <button
              onClick={() => handleSelectOffensePlay('SHORT_PASS')}
              className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-600 rounded font-bold text-[0.62rem] transition cursor-pointer"
            >
              GO FOR IT
            </button>
          </div>
        </div>
      ) : null}

      {/* Small UI: Active On-Field Alignment Indicator & Shift Controls */}
      <div className="flex items-center justify-between w-full max-w-[420px] bg-black/85 border border-[#ffcc00]/50 px-3 py-1 rounded-md mb-1 shadow-lg text-[0.68rem] z-20">
        <div className="flex items-center gap-2">
          <span className="text-neutral-400 font-bold uppercase tracking-wider text-[0.60rem]">
            {activeOffenseState === 'P1' ? 'Offense Alignment:' : 'Defense Alignment:'}
          </span>
          <span className={`font-black text-[0.76rem] tracking-wide ${activeOffenseState === 'P1' ? 'text-[#00ffff]' : 'text-[#ff6666]'}`}>
            {activeOffenseState === 'P1'
              ? p1OffFormationState
              : (defensivePlaybook[p1DefPlayState]?.name || p1DefPlayState)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[0.58rem] text-neutral-300">
          <button
            onClick={() => engineRef.current?.shiftFormation?.(-1)}
            className="px-1.5 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-[#ffcc00] border border-neutral-600 rounded font-bold transition cursor-pointer active:scale-95"
            title="Previous Alignment"
          >
            ◀
          </button>
          <span className="text-[0.54rem] text-neutral-400 font-semibold uppercase tracking-tight">SWIPE TO SHIFT</span>
          <button
            onClick={() => engineRef.current?.shiftFormation?.(1)}
            className="px-1.5 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-[#ffcc00] border border-neutral-600 rounded font-bold transition cursor-pointer active:scale-95"
            title="Next Alignment"
          >
            ▶
          </button>
        </div>
      </div>

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
                <span className="flex items-center gap-1.5">
                  <span className="animate-ping inline-block h-2 w-2 rounded-full bg-black/80" />
                  🚨 TURNOVER ALERT 🚨
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
                <span className="flex items-center gap-1.5">
                  🏆 TOUCHDOWN! 🏆
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
                <span>
                  {banner.category === 'FIRST_DOWN'
                    ? '🎯 1ST DOWN ACHIEVED'
                    : banner.category === 'FUMBLE'
                      ? '⚠️ LOOSE BALL! FUMBLE'
                      : '⚡ KEY PLAY'}
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
              {banner.text}
            </div>
          )}
        </div>
      )}

      {/* Canvas Element */}
      <div className="relative max-w-full">
        <canvas
          ref={canvasRef}
          className="bg-[#176620] shadow-[0_8px_30px_rgba(0,0,0,0.9)] rounded-md border-3 border-white max-w-full touch-none"
        />
      </div>

      {/* Footer Controls & Info */}
      <footer className="mt-1 text-[0.54rem] text-[#adff2f] text-center z-20 px-2 max-w-[420px] flex items-center justify-between gap-2">
        <span className="font-bold opacity-90">v2.8.6 • 7v7 Football Sandbox</span>
        <span className="text-neutral-300">
          {activeOffenseState === 'P1'
            ? 'Draw Route Lines • Tap for Run Blocking • Tap QB to Snap'
            : 'Tap Defenders to Toggle • Swipe to Shift • Tap QB to Start'}
        </span>
      </footer>

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
                  <li><b className="text-white">Draw Routes in the Dirt:</b> Touch any player and draw a line in the direction you want them to run:
                    <ul className="list-disc list-inside ml-2 text-neutral-300">
                      <li><b className="text-[#00ffaa]">Running Back (RB):</b> Straight forward line calls a <b>FLY / GO</b> route streaking deep downfield! Diagonal line calls a <b>FLAT</b> checkdown route!</li>
                      <li><b className="text-[#00ffff]">Receivers (WR / Center):</b> Straight line = Fly, Inside diagonal = Slant, Horizontal = Cross, Outside diagonal = Corner, Pull back = Curl!</li>
                    </ul>
                  </li>
                  <li><b className="text-white">Single Tap for Run Blocking:</b> Simply tap any player (WR, Center, or RB) to assign them to <b>RUN BLOCKING</b>! A white block bar appears across them and they lead-block for the runner! Tap again to toggle back to route.</li>
                  <li><b className="text-white">Snap the Ball:</b> Tap the QB (yellow circle) to snap. On defense, tap the QB to start the play! Tap defenders to toggle blitz, man, RB spy, and zone.</li>
                  <li><b className="text-white">Flip Running Back:</b> Quick double-tap left or right of center to shift the RB side.</li>
                </ul>
              </div>

              <div className="bg-black/60 p-2.5 rounded border border-neutral-800">
                <span className="text-[#ffcc00] font-bold block mb-1">2. PASSING & REALISTIC ARC (OVER THE LINEMEN):</span>
                <ul className="list-disc list-inside space-y-1 text-neutral-300">
                  <li><b className="text-white">High Clearance Over Linemen:</b> Passes release overhand from shoulder height into a realistic parabolic trajectory that climbs high over the helmets and blocks of offensive and defensive linemen in the pocket, complete with a realistic 3D turf drop shadow underneath the football!</li>
                  <li><b className="text-white">Slingshot Pass:</b> Touch and drag backwards to aim forward. Release to launch the football cleanly!</li>
                  <li><b className="text-white">Backward Throw / QB Run:</b> Aiming and releasing backwards turns the QB into a runner with all teammates lead-blocking!</li>
                  <li><b className="text-white">Throw to RB:</b> Hit your Running Back streaking deep on a fly or checking down into the flat!</li>
                  <li><b className="text-white">QB Scramble:</b> Pull and release backward to tuck the ball and run with the QB.</li>
                </ul>
              </div>

              <div className="bg-black/60 p-2.5 rounded border border-neutral-800">
                <span className="text-[#00ffaa] font-bold block mb-1">3. BALL CARRIER MOVES & BROKEN TACKLES:</span>
                <ul className="list-disc list-inside space-y-1 text-neutral-300">
                  <li><b className="text-white">Broken Tackles for Long Gains:</b> Ball carriers can break and shed tackles! Shedding a defender grants tackle immunity and a turbo boost to break away for massive yardage or touchdowns!</li>
                  <li><b className="text-white">Relentless Pursuit:</b> Defenders in pursuit steadily accelerate with ever-increasing catch-up speed to hunt down breakaway ball carriers!</li>
                  <li><b className="text-white">Fumbles & Live Scrambles:</b> Hard hits can pop the football loose! Both offense and defense dive for the tumbling ball—defense recovery causes a turnover!</li>
                  <li><b className="text-white">Clean Pocket Protection:</b> Offensive linemen hold blocks for 5 full seconds before breakdown unless an extra blitzer brings immediate pressure!</li>
                  <li><b className="text-white">Lateral Juke:</b> Quick horizontal swipe left or right to side-step defenders. Jukes do not grant tackle immunity.</li>
                  <li><b className="text-white">Truck / Sprint Boost:</b> Quick forward swipe to activate power turbo boost and increase broken tackle chances!</li>
                </ul>
              </div>

              <div className="bg-black/60 p-2.5 rounded border border-neutral-800">
                <span className="text-[#ff9999] font-bold block mb-1">4. COVERAGE & CONTESTED CATCHES:</span>
                <ul className="list-disc list-inside space-y-1 text-neutral-300">
                  <li><b className="text-white">Open Receivers (&gt; 20px):</b> High-percentage clean catches in stride!</li>
                  <li><b className="text-white">Tight NFL Windows (12–20px):</b> Rewarding on-time throws (~72% completions) with potential pass breakups.</li>
                  <li><b className="text-white">Tight Blanket (&lt; 12px):</b> Contested grabs (40%), pass breakups, deflections, and rare interceptions.</li>
                </ul>
              </div>

              <div className="bg-black/60 p-2.5 rounded border border-neutral-800">
                <span className="text-red-400 font-bold block mb-1">5. DEFENSIVE SCHEMES & COUNTERS:</span>
                <ul className="list-disc list-inside space-y-1 text-neutral-300">
                  <li><b className="text-white">MAN ROBBER:</b> Middle safety specifically undercuts and robs center slants and crossing routes! <i>Weakness:</i> Outside 1-on-1 boundary routes (Go, Flag) and RB flats!</li>
                  <li><b className="text-white">TAMPA 2:</b> Hook LB drops right into the intermediate slant window while corners cover the flat. <i>Weakness:</i> Sideline "Honey Hole" seam between corner and deep safety!</li>
                  <li><b className="text-white">COVER 2 MAN:</b> Slot defender plays tight inside hip leverage against slants. <i>Weakness:</i> Running Back in the flat is uncovered!</li>
                  <li><b className="text-white">COVER 3:</b> 3 deep DBs protect against deep passes, while right Hook LB squeezes crossing routes. <i>Weakness:</i> Out routes and flat checkdowns!</li>
                  <li><b className="text-white">ZERO BLITZ:</b> All-out pass rush. <i>Weakness:</i> Zero deep safety help! Quick hot throws break for huge gains!</li>
                  <li><b className="text-white">COVER 4:</b> 4 deep DBs prevent any big play. <i>Weakness:</i> Concedes underneath hitches and short flat dump-offs!</li>
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
                  <p className="mt-0.5 text-xs text-[#66756b]">{gameMode === 'SEASON' ? 'Four-game schedule' : 'Single matchup'}</p>
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
              <div className="grid shrink-0 grid-cols-3 gap-1 border-b border-[#dce3dd] bg-[#f7f9f7] p-2" role="group" aria-label="Game mode">
                <button
                  type="button"
                  aria-pressed={gameMode === 'ONE_GAME'}
                  onClick={() => handleGameModeChange('ONE_GAME')}
                  className={`rounded-md px-3 py-2 text-sm font-bold transition ${gameMode === 'ONE_GAME' ? 'bg-[#246344] text-white' : 'text-[#59685f] hover:bg-[#e9efea]'}`}
                >
                  One Game
                </button>
                <button
                  type="button"
                  aria-pressed={gameMode === 'SEASON'}
                  onClick={() => handleGameModeChange('SEASON')}
                  className={`rounded-md px-3 py-2 text-sm font-bold transition ${gameMode === 'SEASON' ? 'bg-[#bd5635] text-white' : 'text-[#59685f] hover:bg-[#f4e9e4]'}`}
                >
                  Season
                </button>
                <button
                  type="button"
                  onClick={replayTutorial}
                  className="flex items-center justify-center gap-1 rounded-md px-3 py-2 text-sm font-bold text-[#246344] transition hover:bg-[#e9efea]"
                >
                  <Hand size={16} aria-hidden="true" /> Tutorial
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

            {gameMode === 'SEASON' && !hasKickedOff && (
              <section className="shrink-0 border-b border-[#dce3dd] bg-white px-4 py-3 sm:px-6" aria-label="Season schedule">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-bold text-[#253a2d]">Four-game season</h3>
                  <span className="text-xs font-semibold text-[#246344]">
                    {seasonRecord.wins}-{seasonRecord.losses}-{seasonRecord.ties}
                    <span className="ml-1 font-normal text-[#718077]">W-L-T</span>
                  </span>
                </div>
                <div className="grid gap-1 sm:grid-cols-2">
                  {seasonForDisplay.opponentIds.map((opponentId, index) => {
                    const result = seasonForDisplay.results[index];
                    const upcoming = index === seasonForDisplay.results.length && !seasonComplete;
                    return (
                      <div key={`${index}-${opponentId}`} className={`flex items-center justify-between gap-2 rounded border px-2.5 py-1.5 text-xs ${upcoming ? 'border-[#bd5635]/50 bg-[#fbf2ee]' : 'border-[#e2e8e3] bg-[#fafbfa]'}`}>
                        <span className="font-bold text-[#526157]">WEEK {index + 1}</span>
                        <span className="min-w-0 flex-1 truncate font-semibold text-[#253a2d]">{getTeam(opponentId).name}</span>
                        <span className={`shrink-0 font-bold ${result ? 'text-[#246344]' : upcoming ? 'text-[#a34d32]' : 'text-[#87928a]'}`}>
                          {result ? `${result.p1Score}-${result.p2Score}` : upcoming ? 'UP NEXT' : 'SCHEDULED'}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {seasonComplete && <p className="mt-2 text-xs font-semibold text-[#246344]">Season complete. Start a new season to play again.</p>}
              </section>
            )}

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
                <button
                  onClick={() => {
                    handleStartGame();
                    showAnnouncement(
                      gameMode === 'SEASON'
                        ? `${p1TeamState.name.toUpperCase()} SEASON • WEEK ${seasonComplete ? 1 : seasonForDisplay.results.length + 1} VS ${p2TeamState.name.toUpperCase()}`
                        : `${p1TeamState.name.toUpperCase()} VS ${p2TeamState.name.toUpperCase()} - READY FOR KICKOFF! 🏈`,
                      p1TeamState.primaryColor,
                      true
                    );
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-[#bd5635] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#a9492d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bd5635]"
                >
                  {gameMode === 'SEASON'
                    ? (seasonComplete ? 'Start new season' : seasonForDisplay.results.length ? `Continue season · Week ${seasonForDisplay.results.length + 1}` : 'Start season')
                    : 'Kick off game'} <ArrowRight size={17} />
                </button>
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
