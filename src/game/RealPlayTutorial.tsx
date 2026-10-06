import { useEffect, useRef, useState } from 'react';
import { ArrowRight, RefreshCw, X } from 'lucide-react';
import { mountFootballGame } from './engine';

const steps = [
  ['Offense', 'Set the formation', 'Swipe horizontally on empty field space to cycle your offensive formation.'],
  ['Offense', 'Set the running back side', 'Double-tap empty field space on the side you want the RB to line up.'],
  ['Offense', 'Draw a receiver route', 'Drag the highlighted receiver horizontally to assign a crossing route.'],
  ['Offense', 'Assign a blocker', 'Tap the highlighted center to switch him to BLOCK.'],
  ['Offense', 'Snap the ball', 'Touch the field joystick to snap the ball.'],
  ['Offense', 'Throw the ball', 'Tap an eligible receiver, or drag back from the QB and release to throw.'],
  ['Offense', 'Finish the play', 'Your pass, receivers, defenders, and tackle rules resolve the play.'],
  ['Defense', 'Choose a defensive alignment', 'Swipe horizontally on empty field space to cycle defensive schemes.'],
  ['Defense', 'Change teammate assignments', 'Tap an assignment-controlled defender to cycle MAN, ZONE, BLITZ, and RB SPY. A horizontal swipe assigns MAN.'],
  ['Defense', 'Move the free defender', 'Drag the yellow-ringed player with the red arrow. Only this unassigned defender can be repositioned; keep him on your side of the line.'],
  ['Defense', 'Start the defensive play', 'Touch the field joystick to start. Your alignment, assignments, and free defender position carry into the play.'],
  ['Defense', 'Control the free defender', 'Use the joystick to move the highlighted defender. Tap or quickly swipe the field to dive-tackle.'],
  ['Complete', 'Both sides played', 'You set up offense, made a defensive call, moved the free defender, and played both sides.']
];

export function RealPlayTutorial({ onFinish }: { onFinish: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [step, setStep] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [formation, setFormation] = useState('SPREAD');
  const [defense, setDefense] = useState('COVER2');
  const [result, setResult] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setStep(0);
    setResult('');
    return mountFootballGame(canvas, {
      setP2OffPlayState: () => {}, setP2DefPlayState: () => {},
      setDownDistanceText: () => {}, setActiveOffenseState: () => {},
      setUserScore: () => {}, setCpuScore: () => {}, setP1DefPlayState: setDefense,
      setP1OffFormationState: setFormation, setMomentumState: () => {},
      setGameClockState: () => {}, onEngineReady: () => {},
      showAnnouncement: text => setResult(text),
      onTutorialStep: setStep
    }, { tutorial: true });
  }, [attempt]);

  const [side, title, instruction] = steps[step] || steps[12];
  return (
    <section role="dialog" aria-modal="true" aria-labelledby="real-tutorial-title" className="fixed inset-0 z-[140] flex items-center justify-center overflow-hidden bg-[#07110a] text-white">
      <canvas ref={canvasRef} aria-label="Live tutorial football field" className="block h-auto! w-[min(95vw,71dvh,600px)]! touch-none border-2 border-white" style={{ aspectRatio: '340 / 450' }} />
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
          <span>{step < 7 ? formation : defense}</span>
          <span className="min-w-0 truncate">{result}</span>
        </div>
      </div>
      {step === 12 && (
        <button onClick={onFinish} className="absolute bottom-4 flex items-center gap-2 rounded-md bg-emerald-600 px-5 py-3 text-sm font-bold hover:bg-emerald-500">Finish tutorial <ArrowRight size={18} /></button>
      )}
    </section>
  );
}