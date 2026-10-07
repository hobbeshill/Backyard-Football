import { useEffect, useRef, useState } from 'react';
import { ArrowRight, RefreshCw, X } from 'lucide-react';
import { mountFootballGame, type GameEngineHandle } from './engine';
import { ProPlaybookCards } from './ProPlaybookCards';

const steps = [
  ['Offense', 'Choose a Pro play card', 'Read down and distance at the top of the playbook. Pick a passing play; long routes stretch coverage and blue short routes offer checkdowns. The RB stays in pass protection.'],
  ['Offense', 'Snap the ball', 'Touch the joystick area in the lower-left corner to snap. On keyboard, press Space, WASD, or an arrow key.'],
  ['Offense', 'Throw the ball', 'Tap an eligible receiver to pass, or drag back from the QB and release. Look for an open target; use a short checkdown if deep coverage holds.'],
  ['Offense', 'Finish the play', 'The live pass and tackle rules resolve the play. After a catch, drag the joystick to steer your runner.'],
  ['Defense', 'Choose a defensive scheme card', 'Pick a scheme from the Pro playbook. Deep zones protect against long passes; man coverage and pressure attack shorter plays.'],
  ['Defense', 'Start the defensive play', 'Touch the lower-left joystick to start. Pro mode assigns your teammates from the chosen scheme; you control the highlighted free defender once the play starts. Space, WASD, and arrows also start the play.'],
  ['Defense', 'Control the free defender', 'Drag the joystick or use WASD / arrows to move the highlighted defender. Tap or quickly swipe the field to dive-tackle; Space also dives on defense.'],
  ['Special teams', 'Choose a kick from the playbook', 'Punt and Field Goal are in the offensive Pro playbook, not the pause menu. Open the playbook below. Punt is available on fourth down; field goals show the attempt distance.'],
  ['Special teams', 'Execute your kick', 'For a field goal, lock direction first, then power. For a punt, touch the lower-left joystick or press Space to launch.'],
  ['Complete', 'Ready for Pro football', 'You called plays, used a checkdown-ready offense, chose a defense, controlled the free defender, and tried special teams. Choose One Game, Season, or the Dynasty preview, then your teams.']
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
          activeOffensePlay={offense}
          activeDefensePlay={defense}
          downDistanceText={downDistance}
          offensePlayIds={['PRO_QUICK_SLANTS', 'PRO_MESH', 'PRO_VERTS', 'PRO_DOUBLE_MOVES', 'PRO_SCREEN']}
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