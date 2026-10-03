import { useEffect, useRef, useState } from 'react';
import { ArrowRight, RefreshCw, X } from 'lucide-react';
import { mountFootballGame } from './engine';

const steps = [
  ['Offense', 'Change the alignment', 'Swipe horizontally on empty grass to change your formation.'],
  ['Offense', 'Move the running back', 'Double-tap empty grass on the opposite side of the RB to move him there.'],
  ['Offense', 'Change a receiver route', 'Drag the highlighted WR horizontally to give him a crossing route.'],
  ['Offense', 'Create a blocker', 'Tap the highlighted center once. His route changes to BLOCK.'],
  ['Offense', 'Snap the ball', 'Tap the highlighted QB. Your formation, RB position, route, and blocker are now set.'],
  ['Offense', 'Throw the ball', 'Tap a WR for a quick pass, or drag backward from the QB and release to throw forward.'],
  ['Offense', 'Watch your play finish', 'Your pass uses the real ball physics, receivers, defenders, and tackle rules.'],
  ['Defense', 'Change the defensive alignment', 'Swipe horizontally on empty grass to change the defense.'],
  ['Defense', 'Change an assignment', 'Tap the highlighted defender to cycle Blitz, Man, RB Spy, and Zone, or swipe him horizontally for Man.'],
  ['Defense', 'Start the defensive play', 'Tap the opposing QB to start. Your defensive changes carry into the play.'],
  ['Defense', 'Make the stop', 'Watch the defense react. When the opponent runs, tap or quickly swipe the field to dive-tackle.'],
  ['Complete', 'Both plays completed', 'You set up and played both sides using the same controls as a regular game.']
];

export function RealPlayTutorial({ onFinish }: { onFinish: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [step, setStep] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [formation, setFormation] = useState('SPREAD');
  const [defense, setDefense] = useState('COVER3');
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

  const [side, title, instruction] = steps[step] || steps[11];
  return (
    <section role="dialog" aria-modal="true" aria-labelledby="real-tutorial-title" className="fixed inset-0 z-[140] flex items-center justify-center overflow-hidden bg-[#07110a] text-white">
      <canvas ref={canvasRef} aria-label="Live tutorial football field" className="block h-auto! w-[min(95vw,71dvh,600px)]! touch-none border-2 border-white" style={{ aspectRatio: '340 / 450' }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 mx-auto w-full max-w-xl bg-white/95 text-[#1b3026] shadow-lg">
        <header className="flex items-center justify-between gap-3 px-3 py-1">
          <span className="text-xs font-bold text-[#246344]">Tutorial · {side} · {Math.min(step + 1, 12)}/12</span>
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
      {step === 11 && (
        <button onClick={onFinish} className="absolute bottom-4 flex items-center gap-2 rounded-md bg-emerald-600 px-5 py-3 text-sm font-bold hover:bg-emerald-500">Finish tutorial <ArrowRight size={18} /></button>
      )}
    </section>
  );
}