import { useEffect, useRef, useState } from 'react';
import { ArrowRight, RefreshCw, X } from 'lucide-react';
import { mountFootballGame, type GameEngineHandle } from './engine';
import { ProPlaybookCards } from './ProPlaybookCards';

const steps = [
  ['Offense', 'Choose a Pro play card', 'Check the down and distance, then choose a pass or run card. The card shows the routes and blocking plan. Your call sets the formation and receiver routes before the snap.'],
  ['Offense', 'Snap the ball', 'Tap the lower-left joystick zone to snap, or press Space. Keep dragging from that touch to control the quarterback: left or right moves upfield, up or down moves across the field. WASD and arrow keys also move.'],
  ['Offense', 'Throw to a receiver', 'Tap an eligible WR, Center, or RB to throw. Keep your finger down, or touch and hold during flight: the joystick stays live for the catch without another tap. Separation creates safer catches; tight coverage can break up or intercept the pass.'],
  ['Offense', 'Run after the catch', 'A completed pass puts you in control of the receiver. Steer with the floating joystick or WASD/arrow keys. The next snap uses the actual tackle or sideline spot; incomplete passes keep the previous spot. Interceptions and defensive fumble recoveries announce the new possession.'],
  ['Defense', 'Call a defensive scheme', 'Open the defensive playbook and choose a coverage or pressure card before the snap. That call assigns your teammates; choose a scheme to match the opponent’s likely pass or run.'],
  ['Defense', 'Snap on defense', 'Tap the lower-left joystick zone or press Space to start the play. Tapping elsewhere does not snap. Your teammates follow the called scheme while you control the highlighted defender.'],
  ['Defense', 'Pursue and tackle', 'Steer the highlighted defender with the floating joystick or WASD/arrow keys. Close on the quarterback to sack, or meet the ball carrier to tackle. Tap or quickly swipe during live play to dive.'],
  ['Special teams', 'Choose a kick from the playbook', 'Open the offensive playbook and choose Punt or Field Goal. Punts are available on fourth down. The field-goal card shows the attempt distance.'],
  ['Special teams', 'Use the kick meters', 'For a field goal, lock the aim meter, then lock power to kick. For a punt, tap the lower-left joystick zone or press Space to launch.'],
  ['Complete', 'Ready to play', 'Choose a card, snap from the lower-left zone or with Space, and tap a receiver to pass. Mix your calls: the CPU learns repeated successful plays and adjusts its counters. On defense, vary schemes too; the CPU offense adapts to repeated coverage.']
];

export function RealPlayTutorial({ onFinish }: { onFinish: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngineHandle | null>(null);
  const [step, setStep] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [offense, setOffense] = useState('PRO_QUICK_SLANTS');
  const [defense, setDefense] = useState('PRO_COVER2_HARD_FLAT');
  const [downDistance, setDownDistance] = useState('1st & 10');
  const [kick, setKick] = useState<'PUNT' | 'FIELD_GOAL'>('FIELD_GOAL');
  const [meterStage, setMeterStage] = useState<'AIM' | 'POWER' | 'KICKING'>('AIM');
  const [phase, setPhase] = useState('PRE_SNAP');
  const [playbookOpen, setPlaybookOpen] = useState(false);
  const [result, setResult] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setStep(0);
    setResult('');
    setOffense('PRO_QUICK_SLANTS');
    setPlaybookOpen(false);
    return mountFootballGame(canvas, {
      setP2OffPlayState: () => {}, setP2DefPlayState: () => {},
      setDownDistanceText: setDownDistance, setActiveOffenseState: () => {},
      setUserScore: () => {}, setCpuScore: () => {}, setP1DefPlayState: setDefense,
      setP1OffPlayState: setOffense, setMomentumState: () => {},
      setGameClockState: () => {}, onEngineReady: engine => { engineRef.current = engine; },
      setPhaseState: setPhase,
      setFieldGoalMeterState: meter => { if (meter) setMeterStage(meter.stage); },
      showAnnouncement: text => setResult(text),
      onTutorialStep: setStep
    }, { tutorial: true });
  }, [attempt]);

  const [side, title, instruction] = steps[step] || steps[9];
  return (
    <section role="dialog" aria-modal="true" aria-labelledby="real-tutorial-title" className="fixed inset-0 z-[140] flex items-center justify-center overflow-hidden bg-[#07110a] text-white">
      <canvas ref={canvasRef} aria-label="Live tutorial football field" className="block h-auto! w-[min(95vw,71dvh,900px)]! touch-none border-2 border-white" style={{ aspectRatio: '450 / 340' }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 mx-auto w-full max-w-xl bg-white/95 text-[#1b3026] shadow-lg">
        <header className="flex items-center justify-between gap-3 px-3 py-1">
          <span className="text-xs font-bold text-[#246344]">Tutorial · {side} · {Math.min(step + 1, steps.length)}/{steps.length}</span>
          <div className="flex gap-2">
            <button onClick={() => setAttempt(value => value + 1)} aria-label="Restart tutorial" title="Restart tutorial" className="pointer-events-auto rounded p-2 hover:bg-black/10"><RefreshCw size={18} /></button>
            <button onClick={onFinish} aria-label="Exit tutorial" title="Exit tutorial" className="pointer-events-auto rounded p-2 hover:bg-black/10"><X size={20} /></button>
          </div>
        </header>
        <div className="px-3 pb-2" aria-live="polite">
          <h2 id="real-tutorial-title" className="text-sm font-extrabold">{title}</h2>
          <p className="mt-1 text-xs leading-4">{instruction}</p>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-black/10 px-3 py-1 text-xs text-[#405047]">
          <span>{downDistance}</span>
          <span className="min-w-0 truncate">{result}</span>
        </div>
      </div>
      {(step === 0 || step === 4 || step === 7) && (
        <div className="absolute inset-x-0 bottom-4 flex justify-center">
          <button type="button" onClick={() => setPlaybookOpen(true)} className="rounded-md bg-amber-500 px-5 py-3 text-sm font-black text-black hover:bg-amber-400">
            {step === 4 ? 'Open defensive playbook' : step === 7 ? 'Open special teams playbook' : 'Open offensive playbook'}
          </button>
        </div>
      )}
      {step === 8 && kick === 'FIELD_GOAL' && phase === 'PRE_SNAP' && (
        <button type="button" onClick={() => engineRef.current?.lockFieldGoalMeter()} className="absolute bottom-4 rounded-md bg-amber-500 px-5 py-3 text-sm font-black text-black">
          {meterStage === 'AIM' ? 'Lock direction' : 'Kick! Lock power'}
        </button>
      )}
      {playbookOpen && (step === 0 || step === 4 || step === 7) && (
        <ProPlaybookCards
          selectionOnly
          initialTab={step === 4 ? 'DEFENSE' : 'OFFENSE'}
          attackDirection={engineRef.current?.attackDirection ?? -1}
          activeOffensePlay={offense}
          activeDefensePlay={defense}
          downDistanceText={downDistance}
          offensePlayIds={['PRO_QUICK_SLANTS', 'PRO_MESH', 'PRO_VERTS', 'PRO_DOUBLE_MOVES', 'PRO_SCREEN']}
          defensePlayIds={['PRO_COVER2_HARD_FLAT', 'PRO_COVER1_MAN', 'PRO_COVER3_DEEP', 'PRO_COVER4_QUARTERS', 'PRO_BLITZ_ZERO', 'PRO_RUN_STOP_BOX', 'PRO_TAMPA2']}
          specialTeamsOnly={step === 7}
          canPunt={step === 7}
          fieldGoalDistance={engineRef.current?.getFieldGoalDistance?.()}
          onSelectSpecialTeams={step === 7 ? play => {
            setKick(play);
            engineRef.current?.selectOffense(play);
          } : undefined}
          onSelectOffensePlay={play => {
            setOffense(play);
            engineRef.current?.selectOffense(play);
          }}
          onSelectDefensePlay={play => engineRef.current?.selectDefense(play)}
          onClose={() => setPlaybookOpen(false)}
        />
      )}
      {step === 9 && (
        <button onClick={onFinish} className="absolute bottom-4 flex items-center gap-2 rounded-md bg-emerald-600 px-5 py-3 text-sm font-bold hover:bg-emerald-500">Finish tutorial <ArrowRight size={18} /></button>
      )}
    </section>
  );
}