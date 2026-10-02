import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, RefreshCw, HelpCircle, X, Users, Shield } from 'lucide-react';
import { offensivePlaybook, defensivePlaybook } from './game/playbook';
import { sounds } from './game/sound';
import { mountFootballGame, type GameEngineHandle } from './game/engine';
import { TEAMS, getAllTeams, type TeamProfile } from './game/teams';

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
  const [p1TeamState, setP1TeamState] = useState<TeamProfile>(TEAMS.ARROWS);
  const [p2TeamState, setP2TeamState] = useState<TeamProfile>(TEAMS.ENFORCERS);
  const [showTeamModal, setShowTeamModal] = useState(true);
  const [hasKickedOff, setHasKickedOff] = useState(false);
  const [momentumState, setMomentumState] = useState(0);
  const [gameClockState, setGameClockState] = useState({ quarter: 1, seconds: 120 });
  const [banner, setBanner] = useState<{ text: string; color: string; visible: boolean; big: boolean }>({
    text: '',
    color: '#ffcc00',
    visible: false,
    big: false
  });
  const [showHelp, setShowHelp] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Synchronize sound toggle
  const toggleSound = () => {
    sounds.enabled = !soundEnabled;
    setSoundEnabled(!soundEnabled);
  };

  // Banner timeout ref
  const bannerTimeoutRef = useRef<any>(null);
  const showAnnouncement = (text: string, color = '#ffcc00', big = false) => {
    if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
    setBanner({ text, color, visible: true, big });
    bannerTimeoutRef.current = setTimeout(() => {
      setBanner(prev => ({ ...prev, visible: false }));
    }, 2800);
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
      onEngineReady: engine => { engineRef.current = engine; }
    });
  }, []);

  // Handlers for switching teams
  const handleSelectP1Team = (teamId: string) => {
    if (engineRef.current) {
      engineRef.current.selectP1Team(teamId);
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

  return (
    <div className="relative w-screen h-screen overflow-hidden flex flex-col items-center justify-center bg-[#030704] text-white font-mono select-none">
      
      {/* Top Header & Scoreboard */}
      <header className="flex flex-col items-center justify-center z-20 mb-1 w-full max-w-[430px] px-2 pt-1">
        {/* Team Matchup Selector Button */}
        <button
          onClick={() => setShowTeamModal(true)}
          className="flex items-center gap-1.5 px-2.5 py-0.5 mb-1 bg-black/85 hover:bg-neutral-900 border border-[#ffcc00]/60 rounded text-[0.60rem] font-bold text-neutral-200 transition cursor-pointer active:scale-95 shadow-md"
          title="Change Teams, Rosters & Strengths/Weaknesses"
        >
          <Users size={11} className="text-[#ffcc00]" />
          <span style={{ color: p1TeamState.primaryColor }}>{p1TeamState.nickname.toUpperCase()}</span>
          <span className="text-neutral-400 font-normal">VS</span>
          <span style={{ color: p2TeamState.primaryColor }}>{p2TeamState.nickname.toUpperCase()}</span>
          <span className="text-[#ffcc00] ml-1">▾ TEAMS</span>
        </button>

        <div className="flex items-center justify-between w-full bg-black/90 border-2 border-[#ffcc00] px-3 py-1.5 rounded-lg shadow-xl">
          {/* P2 CPU Score */}
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-[0.68rem] tracking-wide" style={{ color: p2TeamState.primaryColor }}>
              {p2TeamState.nickname.toUpperCase()} (CPU):
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
          <div className="flex items-center gap-1.5">
            <span className="text-white text-base font-black bg-emerald-950/80 border border-emerald-500/50 px-2 py-0.5 rounded leading-none">
              {userScore}
            </span>
            <span className="font-extrabold text-[0.68rem] tracking-wide" style={{ color: p1TeamState.primaryColor }}>
              {p1TeamState.nickname.toUpperCase()} (YOU)
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
            </div>
          </div>
        </div>
      </header>

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

      {/* Main Game Announcement Banner */}
      {banner.visible && (
        <div
          className={`absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/95 border-3 rounded-lg font-extrabold text-center z-50 tracking-wider shadow-[0_5px_30px_rgba(0,0,0,0.9)] animate-pulse ${banner.big ? 'max-w-[92vw] px-4 py-4 text-2xl leading-tight' : 'max-w-[90vw] px-6 py-3 text-[0.95rem]'}`}
          style={{ borderColor: banner.color, color: banner.color }}
        >
          {banner.text}
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

            <button
              onClick={() => setShowHelp(false)}
              className="mt-4 w-full bg-[#ffcc00] text-black font-bold py-1.5 rounded text-xs hover:bg-yellow-400 transition"
            >
              GOT IT, LET'S PLAY!
            </button>
          </div>
        </div>
      )}

      {/* Franchise & Team Selector Modal */}
      {showTeamModal && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute inset-0 bg-black/92 flex flex-col items-center justify-center z-100 p-4"
        >
          <div className="bg-[#0b170e] border-2 border-[#ffcc00] rounded-lg max-w-[390px] w-full p-4 max-h-[85vh] overflow-y-auto text-left shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-700 pb-2 mb-3">
              <div>
                <h2 className="text-[#ffcc00] font-black text-sm tracking-wider flex items-center gap-1.5">
                  <Users size={16} /> {!hasKickedOff ? 'CHOOSE TEAMS TO KICK OFF' : 'FRANCHISE & TEAM SELECTOR'}
                </h2>
                <p className="text-[0.58rem] text-neutral-400">Select teams below — each card highlights key strengths to exploit</p>
              </div>
              <button onClick={() => { setShowTeamModal(false); setHasKickedOff(true); }} className="text-neutral-400 hover:text-white p-1" title="Close / Start">
                <X size={18} />
              </button>
            </div>

            {/* Current Matchup Summary */}
            <div className="flex items-center justify-between bg-black/80 border border-[#ffcc00]/50 p-2.5 rounded-lg mb-3 text-[0.66rem] shadow-md">
              <div className="text-left">
                <span className="text-[0.54rem] text-emerald-400 block font-black uppercase">P1 (YOU):</span>
                <span className="font-black text-xs" style={{ color: p1TeamState.primaryColor }}>
                  {p1TeamState.city} {p1TeamState.nickname}
                </span>
                <span className="text-[0.55rem] text-neutral-400 block">{p1TeamState.archetype.replace('_', ' ')}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[#ffcc00] font-black text-xs">VS</span>
                <span className="text-[0.50rem] text-neutral-400">MATCHUP</span>
              </div>
              <div className="text-right">
                <span className="text-[0.54rem] text-red-400 block font-black uppercase">P2 (CPU):</span>
                <span className="font-black text-xs" style={{ color: p2TeamState.primaryColor }}>
                  {p2TeamState.city} {p2TeamState.nickname}
                </span>
                <span className="text-[0.55rem] text-neutral-400 block">{p2TeamState.archetype.replace('_', ' ')}</span>
              </div>
            </div>

            {/* Teams List */}
            <div className="space-y-3">
              {getAllTeams().map((team) => {
                const isP1 = p1TeamState.id === team.id;
                const isP2 = p2TeamState.id === team.id;

                return (
                  <div
                    key={team.id}
                    className={`bg-neutral-950/90 border-2 rounded-xl p-3 transition shadow-md ${
                      isP1
                        ? 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.35)] ring-1 ring-emerald-400'
                        : isP2
                          ? 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.35)] ring-1 ring-red-400'
                          : 'border-neutral-800 hover:border-neutral-600'
                    }`}
                  >
                    {/* Team Header */}
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full border-2 border-white/80 shadow"
                          style={{ backgroundColor: team.primaryColor }}
                        />
                        <div>
                          <span className="font-black text-xs tracking-wider" style={{ color: team.primaryColor }}>
                            {team.name.toUpperCase()}
                          </span>
                          <span className="ml-2 text-[0.52rem] px-1.5 py-0.5 bg-neutral-800 text-neutral-300 rounded font-bold uppercase tracking-wider">
                            {team.archetype.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                      {isP1 && (
                        <span className="text-[0.52rem] font-black bg-emerald-500 text-black px-1.5 py-0.5 rounded shadow">
                          YOU (P1)
                        </span>
                      )}
                      {isP2 && (
                        <span className="text-[0.52rem] font-black bg-red-500 text-white px-1.5 py-0.5 rounded shadow">
                          CPU (P2)
                        </span>
                      )}
                    </div>

                    <p className="text-[0.58rem] text-neutral-300 mb-2 leading-relaxed">{team.description}</p>

                    {/* Prominent Card Section: Team Strengths */}
                    <div className="bg-emerald-950/70 border border-emerald-500/50 rounded-lg p-2 mb-1.5 shadow-inner">
                      <div className="flex items-center gap-1.5 text-emerald-400 font-extrabold text-[0.60rem] mb-0.5">
                        <span className="bg-emerald-500 text-black text-[0.50rem] font-black px-1 rounded uppercase tracking-wider">
                          STRENGTHS
                        </span>
                        <span>CORE TEAM ADVANTAGE</span>
                      </div>
                      <p className="text-[0.60rem] text-emerald-200 font-semibold leading-snug">
                        {team.strengths}
                      </p>
                    </div>

                    {/* Team Weaknesses */}
                    <div className="bg-red-950/30 border border-red-500/30 rounded p-1.5 mb-2">
                      <div className="flex items-start gap-1 text-[0.56rem]">
                        <span className="text-red-400 font-bold uppercase shrink-0">WEAKNESS:</span>
                        <span className="text-neutral-300 leading-tight">{team.weaknesses}</span>
                      </div>
                    </div>

                    {/* Ratings Grid */}
                    <div className="grid grid-cols-3 gap-1 text-[0.52rem] text-neutral-400 bg-neutral-900/90 p-1.5 rounded-lg mb-2.5 font-mono border border-neutral-800">
                      <div>WR Speed: <b className="text-white">{Math.round(team.ratings.wrSpeed * 100)}</b></div>
                      <div>Pass Pro: <b className="text-white">{Math.round(team.ratings.passProtection * 100)}</b></div>
                      <div>Run Power: <b className="text-white">{Math.round(team.ratings.runPower * 100)}</b></div>
                      <div>DB Speed: <b className="text-white">{Math.round(team.ratings.dbClosingSpeed * 100)}</b></div>
                      <div>Pass Rush: <b className="text-white">{Math.round(team.ratings.passRush * 100)}</b></div>
                      <div>Discipline: <b className="text-white">{Math.round((2 - team.ratings.mistakeChance) * 100)}</b></div>
                    </div>

                    {/* Action Select Buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSelectP1Team(team.id)}
                        className={`flex-1 py-1.5 px-2 rounded-md text-[0.62rem] font-extrabold transition cursor-pointer active:scale-95 ${
                          isP1
                            ? 'bg-emerald-600 text-white border border-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                            : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200'
                        }`}
                      >
                        {isP1 ? '✓ ACTIVE AS P1 (YOU)' : 'PLAY AS P1 (YOU)'}
                      </button>
                      <button
                        onClick={() => handleSelectP2Team(team.id)}
                        className={`flex-1 py-1.5 px-2 rounded-md text-[0.62rem] font-extrabold transition cursor-pointer active:scale-95 ${
                          isP2
                            ? 'bg-red-600 text-white border border-red-400 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                            : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200'
                        }`}
                      >
                        {isP2 ? '✓ OPPONENT (CPU)' : 'SET OPPONENT (CPU)'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Modal CTA */}
            {!hasKickedOff ? (
              <button
                onClick={() => {
                  setShowTeamModal(false);
                  setHasKickedOff(true);
                  sounds.playWhistle();
                  showAnnouncement(`${p1TeamState.name.toUpperCase()} VS ${p2TeamState.name.toUpperCase()} - READY FOR KICKOFF! 🏈`, p1TeamState.primaryColor, true);
                }}
                className="mt-4 w-full bg-[#ffcc00] hover:bg-yellow-400 text-black font-black py-2.5 rounded-lg text-xs transition cursor-pointer tracking-wider shadow-[0_0_15px_rgba(255,204,0,0.4)] active:scale-98 flex items-center justify-center gap-2"
              >
                <span>KICK OFF GAME 🏈</span>
                <span className="text-[0.62rem] opacity-75 font-bold">({p1TeamState.nickname} vs {p2TeamState.nickname})</span>
              </button>
            ) : (
              <button
                onClick={() => setShowTeamModal(false)}
                className="mt-4 w-full bg-[#ffcc00] hover:bg-yellow-400 text-black font-black py-2 rounded-lg text-xs transition cursor-pointer tracking-wider shadow-md active:scale-98"
              >
                SAVE & RESUME GAME
              </button>
            )}
          </div>
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
