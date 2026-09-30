import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, BookOpen, RefreshCw, HelpCircle, X, Shield, Award, ChevronRight } from 'lucide-react';
import { defensiveKeys, defensivePlaybook, offensiveKeys, offensivePlaybook } from './game/playbook';
import { sounds } from './game/sound';
import { mountFootballGame, type GameEngineHandle } from './game/engine';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // UI States
  const [userScore, setUserScore] = useState(0);
  const [cpuScore, setCpuScore] = useState(0);
  const [downDistanceText, setDownDistanceText] = useState('1st & 10 at OWN 20');
  const [p1OffPlayState, setP1OffPlayState] = useState('SHORT_PASS');
  const [p1DefPlayState, setP1DefPlayState] = useState('COVER3');
  const [p2OffPlayState, setP2OffPlayState] = useState('SHORT_PASS');
  const [p2DefPlayState, setP2DefPlayState] = useState('COVER3');
  const [activeOffenseState, setActiveOffenseState] = useState('P1');
  const [banner, setBanner] = useState<{ text: string; color: string; visible: boolean }>({
    text: '',
    color: '#ffcc00',
    visible: false
  });
  const [playbookModal, setPlaybookModal] = useState<'OFFENSE' | 'DEFENSE' | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Synchronize sound toggle
  const toggleSound = () => {
    sounds.enabled = !soundEnabled;
    setSoundEnabled(!soundEnabled);
  };

  // Banner timeout ref
  const bannerTimeoutRef = useRef<any>(null);
  const showAnnouncement = (text: string, color = '#ffcc00') => {
    if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
    setBanner({ text, color, visible: true });
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
        ? [24, 38, 72]
        : alignment === 'TRIPS'
          ? [68, 82, 94]
          : [12, 50, 88];

      cx.fillStyle = '#ffcc00';
      cx.beginPath();
      cx.arc(canvas.width / 2, canvas.height / 2 + 14, 3.5, 0, Math.PI * 2);
      cx.fill();
      cx.fillStyle = '#00ffff';
      positions.forEach((position, index) => {
        const x = canvas.width * position / 100;
        const y = canvas.height / 2;
        cx.beginPath();
        cx.arc(x, y, 3.5, 0, Math.PI * 2);
        cx.fill();
        cx.strokeStyle = '#00ffff';
        cx.lineWidth = 1.2;
        cx.beginPath();
        cx.moveTo(x, y);
        cx.lineTo(x + (index === 0 ? -8 : index === 2 ? 8 : 0), 8 + index * 3);
        cx.stroke();
      });
      cx.fillStyle = '#00ffaa';
      cx.beginPath();
      cx.arc(alignment === 'TRIPS' ? 22 : canvas.width - 22, canvas.height / 2 + 12, 3, 0, Math.PI * 2);
      cx.fill();
    } else {
      cx.fillStyle = '#ff6666';
      if (playKey === 'BLITZ') {
        cx.fillStyle = '#ff3333';
        cx.beginPath();
        cx.arc(canvas.width / 2 - 10, canvas.height / 2 + 5, 3.5, 0, Math.PI * 2);
        cx.arc(canvas.width / 2 + 10, canvas.height / 2 + 5, 3.5, 0, Math.PI * 2);
        cx.fill();
        cx.strokeStyle = '#ff3333';
        cx.lineWidth = 1.5;
        cx.beginPath();
        cx.moveTo(canvas.width / 2 - 10, canvas.height / 2 + 5);
        cx.lineTo(canvas.width / 2 - 10, canvas.height / 2 - 12);
        cx.moveTo(canvas.width / 2 + 10, canvas.height / 2 + 5);
        cx.lineTo(canvas.width / 2 + 10, canvas.height / 2 - 12);
        cx.stroke();
      } else if (playKey === 'QUARTERS') {
        cx.beginPath();
        cx.arc(canvas.width / 2 - 30, canvas.height / 2 - 12, 3, 0, Math.PI * 2);
        cx.arc(canvas.width / 2 - 10, canvas.height / 2 - 12, 3, 0, Math.PI * 2);
        cx.arc(canvas.width / 2 + 10, canvas.height / 2 - 12, 3, 0, Math.PI * 2);
        cx.arc(canvas.width / 2 + 30, canvas.height / 2 - 12, 3, 0, Math.PI * 2);
        cx.fill();
      } else if (playKey === 'TAMPA2' || playKey === 'COVER2MAN') {
        cx.beginPath();
        cx.arc(canvas.width / 2 - 20, canvas.height / 2 - 12, 3, 0, Math.PI * 2);
        cx.arc(canvas.width / 2 + 20, canvas.height / 2 - 12, 3, 0, Math.PI * 2);
        cx.arc(canvas.width / 2, canvas.height / 2 + 2, 3, 0, Math.PI * 2);
        cx.fill();
      } else {
        cx.beginPath();
        cx.arc(canvas.width / 2, canvas.height / 2 - 14, 3, 0, Math.PI * 2);
        cx.arc(canvas.width / 2 - 25, canvas.height / 2 - 5, 3, 0, Math.PI * 2);
        cx.arc(canvas.width / 2 + 25, canvas.height / 2 - 5, 3, 0, Math.PI * 2);
        cx.fill();
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
      setPlaybookModal,
      showAnnouncement,
      onEngineReady: engine => { engineRef.current = engine; }
    });
  }, []);

  // Handlers for user changing offensive/defensive plays (user only controls their own side)
  const handleSelectOffensePlay = (key: string) => {
    if (activeOffenseState === 'P1') {
      setP1OffPlayState(key);
      if (engineRef.current) {
        engineRef.current.selectOffense(key);
      }
    }
    setPlaybookModal(null);
  };

  const handleSelectDefensePlay = (key: string) => {
    if (activeOffenseState === 'P2') {
      setP1DefPlayState(key);
      if (engineRef.current) {
        engineRef.current.selectDefense(key);
      }
    }
    setPlaybookModal(null);
  };

  const handleOpenPlaybook = () => {
    if (activeOffenseState === 'P1' && engineRef.current) {
      engineRef.current.openPlaybook();
    }
  };

  const handleOpenDefPlaybook = () => {
    if (activeOffenseState === 'P2' && engineRef.current) {
      engineRef.current.openDefPlaybook();
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

  const offensiveAlignmentKeys = offensiveKeys.filter(key => offensivePlaybook[key].type === 'PASS');
  const offensiveRunKeys = ['ISO'];

  const renderOffensivePlayCard = (key: string) => {
    const play = offensivePlaybook[key];
    return (
      <div
        key={key}
        onClick={() => handleSelectOffensePlay(key)}
        className={`bg-[#112211] border-2 rounded-lg p-2.5 text-center cursor-pointer transition hover:bg-[#1a331a] hover:scale-102 flex flex-col items-center justify-between shadow ${
          p1OffPlayState === key ? 'border-[#ffcc00] ring-1 ring-[#ffcc00]' : 'border-[#00ffff]'
        }`}
      >
        <h3 className="text-[#ffcc00] font-bold text-[0.72rem] m-0 mb-1">{play.name}</h3>
        <p className="text-[#adff2f] text-[0.52rem] leading-tight m-0 mb-2">{play.desc}</p>
        <div className="w-[100px] h-[50px] bg-[#114418] border border-white/40 rounded flex items-center justify-center overflow-hidden">
          <PlaySchematicMini playKey={key} isDefense={false} onRender={drawCardSchematic} />
        </div>
      </div>
    );
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden flex flex-col items-center justify-center bg-[#030704] text-white font-mono select-none">
      
      {/* Top Header & Scoreboard */}
      <header className="flex flex-col items-center justify-center z-20 mb-1 w-full max-w-[420px] px-2">
        <div className="flex items-center justify-between w-full bg-black/85 border-2 border-[#ffcc00] px-3 py-1 rounded-md text-[0.7rem] font-bold tracking-wider shadow-lg mb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-red-400">P2 (CPU):</span>
            <span className="text-white text-[0.8rem]">{cpuScore}</span>
          </div>
          <div className="text-[#00ffff] font-extrabold tracking-normal">
            {downDistanceText}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-green-400">P1 (YOU):</span>
            <span className="text-white text-[0.8rem]">{userScore}</span>
          </div>
        </div>

        {/* Action Buttons Bar: Only active side is accessible to user; CPU calls its own plays */}
        <div className="flex items-center gap-1.5 w-full justify-between">
          {activeOffenseState === 'P1' ? (
            <>
              {/* P1 on Offense: Clickable Offensive Playbook */}
              <button
                onClick={handleOpenPlaybook}
                className="flex-1 bg-black/85 hover:bg-neutral-900 border-2 border-[#ffcc00] px-2 py-1 rounded-md text-[0.68rem] font-bold text-center cursor-pointer transition active:scale-95 text-white flex items-center justify-center gap-1 shadow"
                title="Choose your offensive play (Pass/Run)"
              >
                <span className="text-[#00ffff]">P1 OFF:</span>
                <span className="truncate">{offensivePlaybook[p1OffPlayState]?.name || 'SHORT PASS'}</span>
                <span className="text-[0.6rem] text-[#ffcc00] ml-0.5">▼</span>
              </button>

              {/* CPU on Defense: Autonomous CPU Defense - Non-clickable */}
              <div
                className="flex-1 bg-neutral-950/90 border border-neutral-700 px-2 py-1 rounded-md text-[0.68rem] font-bold text-center text-neutral-300 flex items-center justify-center gap-1 shadow select-none"
                title="CPU Defensive Coordinator calls its own scheme autonomously"
              >
                <span className="text-red-400 font-extrabold">CPU DEF:</span>
                <span className="text-white truncate">
                  {defensivePlaybook[p2DefPlayState]?.name || 'COVER 3'}
                </span>
                <span className="text-[0.55rem] px-1 py-0.2 bg-red-950 border border-red-500/50 text-red-300 rounded uppercase font-semibold tracking-wider">AI</span>
              </div>
            </>
          ) : (
            <>
              {/* CPU on Offense: Autonomous CPU Offense - Non-clickable */}
              <div
                className="flex-1 bg-neutral-950/90 border border-neutral-700 px-2 py-1 rounded-md text-[0.68rem] font-bold text-center text-neutral-300 flex items-center justify-center gap-1 shadow select-none"
                title="CPU Offensive Coordinator calls its own play autonomously"
              >
                <span className="text-red-400 font-extrabold">CPU OFF:</span>
                <span className="text-white truncate">
                  {offensivePlaybook[p2OffPlayState]?.name || 'SHORT PASS'}
                </span>
                <span className="text-[0.55rem] px-1 py-0.2 bg-red-950 border border-red-500/50 text-red-300 rounded uppercase font-semibold tracking-wider">AI</span>
              </div>

              {/* P1 on Defense: Clickable Defensive Playbook */}
              <button
                onClick={handleOpenDefPlaybook}
                className="flex-1 bg-black/85 hover:bg-neutral-900 border-2 border-[#ffcc00] px-2 py-1 rounded-md text-[0.68rem] font-bold text-center cursor-pointer transition active:scale-95 text-white flex items-center justify-center gap-1 shadow"
                title="Call your defensive scheme"
              >
                <span className="text-[#ff6666]">P1 DEF:</span>
                <span className="truncate">{defensivePlaybook[p1DefPlayState]?.name || 'COVER 3'}</span>
                <span className="text-[0.6rem] text-[#ffcc00] ml-0.5">▼</span>
              </button>
            </>
          )}

          {/* Utility Quick Buttons */}
          <button
            onClick={toggleSound}
            className="bg-black/85 hover:bg-neutral-900 border-2 border-[#ffcc00] p-1.5 rounded-md text-[#ffcc00] cursor-pointer transition active:scale-90"
            title={soundEnabled ? "Mute Sound" : "Enable Sound"}
          >
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} className="text-neutral-500" />}
          </button>

          <button
            onClick={() => setShowHelp(true)}
            className="bg-black/85 hover:bg-neutral-900 border-2 border-[#ffcc00] p-1.5 rounded-md text-[#00ffff] cursor-pointer transition active:scale-90"
            title="View playbook manual & mechanics"
          >
            <HelpCircle size={14} />
          </button>

          <button
            onClick={handleResetGame}
            className="bg-black/85 hover:bg-neutral-900 border-2 border-[#ffcc00] p-1.5 rounded-md text-emerald-400 cursor-pointer transition active:scale-90"
            title="Reset Ball & Scrimmage"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </header>

      {/* Main Game Announcement Banner */}
      {banner.visible && (
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/95 border-3 rounded-lg px-6 py-3 font-extrabold text-center z-50 tracking-wider shadow-[0_5px_30px_rgba(0,0,0,0.9)] animate-pulse"
          style={{ borderColor: banner.color, color: banner.color, fontSize: '0.95rem' }}
        >
          {banner.text}
        </div>
      )}

      {/* Canvas Element */}
      <canvas
        ref={canvasRef}
        className="bg-[#176620] shadow-[0_8px_30px_rgba(0,0,0,0.9)] rounded-md border-3 border-white max-w-full touch-none"
      />

      {/* Footer Controls & Info */}
      <footer className="mt-1 text-[0.54rem] text-[#adff2f] text-center z-20 px-2 max-w-[420px] flex items-center justify-between gap-2">
        <span className="font-bold opacity-90">v2.8.6 • 7v7 Football Sandbox</span>
        <span className="text-neutral-300">
          {activeOffenseState === 'P1'
            ? 'Tap QB to Snap • Slingshot Throw • Swipe Juke'
            : 'Select Defense • Tap Screen to Start Play'}
        </span>
      </footer>

      {/* Playbook Overlay Modal */}
      {playbookModal && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-0 bg-black/92 flex flex-col items-center justify-center z-100 p-4"
        >
          <div className="flex items-center justify-between w-full max-w-[360px] mb-2 px-1">
            <h2 className="text-[#ffcc00] font-bold text-sm tracking-wider flex items-center gap-1.5">
              <BookOpen size={16} />
              {playbookModal === 'OFFENSE' ? 'P1: SELECT OFFENSIVE PLAY' : 'P1: CALL DEFENSIVE SCHEME'}
            </h2>
            <button
              onClick={() => setPlaybookModal(null)}
              className="text-neutral-400 hover:text-white p-1 rounded-md"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5 max-w-[360px] w-full max-h-[75vh] overflow-y-auto p-1 scrollbar-thin">
            {playbookModal === 'OFFENSE' ? (
              <>
                <div className="col-span-2 text-[#00ffff] text-[0.62rem] font-bold tracking-wider text-left px-1">ALIGNMENTS</div>
                {offensiveAlignmentKeys.map(renderOffensivePlayCard)}
                <div className="col-span-2 text-[#00ffaa] text-[0.62rem] font-bold tracking-wider text-left px-1 mt-1">RUN PLAYS</div>
                {offensiveRunKeys.map(renderOffensivePlayCard)}
              </>
            ) : (
              Object.keys(defensivePlaybook).map((key) => {
                const play = defensivePlaybook[key];
                return (
                  <div
                    key={key}
                    onClick={() => handleSelectDefensePlay(key)}
                    className={`bg-[#112211] border-2 rounded-lg p-2.5 text-center cursor-pointer transition hover:bg-[#1a331a] hover:scale-102 flex flex-col items-center justify-between shadow ${
                      p1DefPlayState === key ? 'border-[#ffcc00] ring-1 ring-[#ffcc00]' : 'border-[#ff6666]'
                    }`}
                  >
                    <h3 className="text-[#ffcc00] font-bold text-[0.72rem] m-0 mb-1">{play.name}</h3>
                    <p className="text-[#adff2f] text-[0.52rem] leading-tight m-0 mb-2">{play.desc}</p>
                    <div className="w-[100px] h-[50px] bg-[#114418] border border-white/40 rounded flex items-center justify-center overflow-hidden">
                      <PlaySchematicMini playKey={key} isDefense={true} onRender={drawCardSchematic} />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div
            onClick={() => setPlaybookModal(null)}
            className="mt-3 text-[0.65rem] text-neutral-400 hover:text-white cursor-pointer underline underline-offset-4"
          >
            [ Tap anywhere here to close ]
          </div>
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
                <span className="text-[#00ffff] font-bold block mb-1">1. PRE-SNAP TACTICS:</span>
                <ul className="list-disc list-inside space-y-1 text-neutral-300">
                  <li><b className="text-white">Snap the Ball:</b> On offense, tap the QB (yellow circle) to snap. On defense, pick your scheme and tap anywhere on the field to start the play!</li>
                  <li><b className="text-white">Alignments:</b> Choose Spread, Stack, or Trips before the snap to change receiver spacing, or select a run play.</li>
                  <li><b className="text-white">Audible Routes:</b> Tap a receiver (cyan) to cycle its route. Tap the RB (green) to switch between Flat and Angle paths.</li>
                  <li><b className="text-white">Flip Running Back:</b> Quick double-tap left or right of center to shift the RB side.</li>
                </ul>
              </div>

              <div className="bg-black/60 p-2.5 rounded border border-neutral-800">
                <span className="text-[#ffcc00] font-bold block mb-1">2. PASSING & SCRAMBLING:</span>
                <ul className="list-disc list-inside space-y-1 text-neutral-300">
                  <li><b className="text-white">Slingshot Pass:</b> Touch and drag backwards to aim. The yellow trajectory line and reticle show your target. Release to launch the football cleanly!</li>
                  <li><b className="text-white">Throw to RB:</b> Aim directly at your Running Back (green circle) leaking into the flat for quick checkdowns and screen plays!</li>
                  <li><b className="text-white">QB Scramble:</b> Tap the QB during dropback to tuck the ball and scramble as a runner!</li>
                </ul>
              </div>

              <div className="bg-black/60 p-2.5 rounded border border-neutral-800">
                <span className="text-[#00ffaa] font-bold block mb-1">3. BALL CARRIER MOVES & BROKEN TACKLES:</span>
                <ul className="list-disc list-inside space-y-1 text-neutral-300">
                  <li><b className="text-white">Broken Tackles for Long Gains:</b> Ball carriers can break and shed tackles! Shedding a defender grants tackle immunity and a turbo boost to break away for massive yardage or touchdowns!</li>
                  <li><b className="text-white">Relentless Pursuit:</b> Defenders in pursuit steadily accelerate with ever-increasing catch-up speed to hunt down breakaway ball carriers!</li>
                  <li><b className="text-white">Fumbles & Live Scrambles:</b> Hard hits can pop the football loose! Both offense and defense dive for the tumbling ball—defense recovery causes a turnover!</li>
                  <li><b className="text-white">3-Second OL Pocket:</b> Offensive linemen hold blocks for 3 full seconds before breakdown, giving QBs time to scan progressions downfield.</li>
                  <li><b className="text-white">Lateral Juke:</b> Quick horizontal swipe left or right to juke past diving defenders and gain tackle immunity!</li>
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
