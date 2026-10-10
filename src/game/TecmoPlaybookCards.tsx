import React from 'react';
import { getTecmoPlaysForTeam, type TecmoPlayOption } from './tecmoPlaybook';
import { getTeam } from './teams';
import { Shield, Zap, Target, Lock, ArrowUpRight, ChevronRight, X } from 'lucide-react';

interface TecmoPlaybookCardsProps {
  teamId: string;
  opposingTeamId: string;
  isDefense: boolean;
  activeOffensePlay?: string;
  activeDefensePlay?: string;
  downDistanceText?: string;
  canPunt?: boolean;
  fieldGoalDistance?: number;
  onSelectPlay: (playId: string) => void;
  onSelectSpecialTeams?: (playId: 'PUNT' | 'FIELD_GOAL') => void;
  onClose: () => void;
}

function MiniRouteDiagram({ play }: { play: TecmoPlayOption }) {
  const isRun = play.isRun;
  return (
    <svg viewBox="0 0 160 110" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      {/* Field Background & Line of Scrimmage */}
      <rect x="0" y="0" width="160" height="110" fill="#0d1b12" />
      {/* 5-yard yardlines */}
      <line x1="0" y1="25" x2="160" y2="25" stroke="#ffffff15" strokeWidth="1" strokeDasharray="3 3" />
      <line x1="0" y1="55" x2="160" y2="55" stroke="#ffffff15" strokeWidth="1" strokeDasharray="3 3" />
      {/* Line of Scrimmage */}
      <line x1="0" y1="85" x2="160" y2="85" stroke="#3b82f6" strokeWidth="1.5" />
      {/* Offensive Line (Center + Guards/Tackles) */}
      <circle cx="80" cy="85" r="3.5" fill="#ffffff" />
      <circle cx="68" cy="85" r="3" fill="#94a3b8" />
      <circle cx="92" cy="85" r="3" fill="#94a3b8" />
      {/* QB */}
      <circle cx="80" cy="97" r="3.5" fill="#38bdf8" />
      {/* RB */}
      <circle cx="70" cy="103" r="3" fill="#f59e0b" />

      {/* Receiver Route Schematics */}
      {/* Left WR (x=24) */}
      <circle cx="24" cy="85" r="3" fill="#ec4899" />
      <RoutePath route={play.left} startX={24} startY={85} />

      {/* Slot WR (x=50) */}
      <circle cx="50" cy="85" r="3" fill="#a855f7" />
      <RoutePath route={play.slot} startX={50} startY={85} />

      {/* Center/TE (x=110) */}
      <circle cx="110" cy="85" r="3" fill="#34d399" />
      <RoutePath route={play.center} startX={110} startY={85} />

      {/* Right WR (x=136) */}
      <circle cx="136" cy="85" r="3" fill="#ec4899" />
      <RoutePath route={play.right} startX={136} startY={85} />

      {/* Run Action Path for Designed Runs */}
      {isRun && (
        <>
          <path
            d={
              play.type === 'SWEEP'
                ? 'M 70 103 Q 40 98 25 70 Q 18 45 22 15'
                : play.type === 'POWER'
                  ? 'M 70 103 Q 75 92 88 75 L 94 20'
                  : 'M 70 103 Q 74 92 80 75 L 80 18'
            }
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2.5"
            strokeDasharray="4 2"
          />
          {/* Arrowhead at end */}
          <polygon
            points={
              play.type === 'SWEEP'
                ? '22,12 18,20 26,20'
                : play.type === 'POWER'
                  ? '94,17 90,25 98,25'
                  : '80,15 76,23 84,23'
            }
            fill="#f59e0b"
          />
        </>
      )}
    </svg>
  );
}

function RoutePath({ route, startX, startY }: { route: string; startX: number; startY: number }) {
  if (route === 'BLOCK') {
    return (
      <line x1={startX - 6} y1={startY - 6} x2={startX + 6} y2={startY - 6} stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
    );
  }
  let pathD = '';
  const dir = startX < 80 ? 1 : -1;

  switch (route) {
    case 'GO':
      pathD = `M ${startX} ${startY} L ${startX} 15`;
      break;
    case 'SLANT-R':
      pathD = `M ${startX} ${startY} L ${startX} ${startY - 15} L ${startX + 30} ${startY - 45}`;
      break;
    case 'SLANT-L':
      pathD = `M ${startX} ${startY} L ${startX} ${startY - 15} L ${startX - 30} ${startY - 45}`;
      break;
    case 'CROSS-R':
      pathD = `M ${startX} ${startY} L ${startX} ${startY - 20} L ${startX + 55} ${startY - 25}`;
      break;
    case 'CROSS-L':
      pathD = `M ${startX} ${startY} L ${startX} ${startY - 20} L ${startX - 55} ${startY - 25}`;
      break;
    case 'COMEBACK':
      pathD = `M ${startX} ${startY} L ${startX} ${startY - 45} L ${startX + (dir * 8)} ${startY - 35}`;
      break;
    case 'HITCH':
      pathD = `M ${startX} ${startY} L ${startX} ${startY - 25} L ${startX - (dir * 6)} ${startY - 20}`;
      break;
    case 'POST-R':
      pathD = `M ${startX} ${startY} L ${startX} ${startY - 35} L ${startX + 28} 15`;
      break;
    case 'POST-L':
      pathD = `M ${startX} ${startY} L ${startX} ${startY - 35} L ${startX - 28} 15`;
      break;
    case 'FLAG-R':
      pathD = `M ${startX} ${startY} L ${startX} ${startY - 35} L ${startX + 32} 20`;
      break;
    case 'FLAG-L':
      pathD = `M ${startX} ${startY} L ${startX} ${startY - 35} L ${startX - 32} 20`;
      break;
    case 'WHEEL':
      pathD = `M ${startX} ${startY} Q ${startX + (dir * 25)} ${startY - 20} ${startX + (dir * 20)} 15`;
      break;
    default:
      pathD = `M ${startX} ${startY} L ${startX} 25`;
      break;
  }

  return (
    <path
      d={pathD}
      fill="none"
      stroke="#38bdf8"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

export const TecmoPlaybookCards: React.FC<TecmoPlaybookCardsProps> = ({
  teamId,
  opposingTeamId,
  isDefense,
  activeOffensePlay,
  activeDefensePlay,
  downDistanceText,
  canPunt = false,
  fieldGoalDistance,
  onSelectPlay,
  onSelectSpecialTeams,
  onClose
}) => {
  // If defense: player chooses what to defend from OPPONENT'S 6 plays (Tecmo Super Bowl style)
  // If offense: player chooses from THEIR OWN 6 plays
  const relevantTeamId = isDefense ? opposingTeamId : teamId;
  const team = getTeam(relevantTeamId);
  const userTeam = getTeam(teamId);
  const plays = getTecmoPlaysForTeam(relevantTeamId);

  const selectedPlayId = isDefense ? activeDefensePlay : activeOffensePlay;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/92 p-2 sm:p-4 backdrop-blur-md">
      <div className="flex max-h-[96dvh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-neutral-700 bg-[#0a1117] text-neutral-200 shadow-2xl">
        {/* Header Bar */}
        <div
          className={`shrink-0 border-b px-4 py-3 sm:px-6 ${
            isDefense
              ? 'border-red-900/60 bg-gradient-to-r from-[#210909] via-[#160a0a] to-[#0a1117]'
              : 'border-amber-900/60 bg-gradient-to-r from-[#231705] via-[#17120a] to-[#0a1117]'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
                  isDefense
                    ? 'border-red-500/40 bg-red-500/20 text-red-400'
                    : 'border-amber-500/40 bg-amber-500/20 text-amber-400'
                }`}
              >
                {isDefense ? <Shield size={20} /> : <Zap size={20} />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-black uppercase text-white tracking-wide">
                    {isDefense ? 'TECMO SUPER BOWL • CHOOSE WHAT TO DEFEND' : `${team.name} • OFFENSIVE PLAYBOOK`}
                  </h2>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest border ${
                      isDefense
                        ? 'border-red-500/40 bg-red-500/20 text-red-300'
                        : 'border-amber-500/40 bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {isDefense ? 'DEFENSE' : 'OFFENSE'}
                  </span>
                </div>
                <p className="text-xs text-neutral-300">
                  {isDefense ? (
                    <span>
                      Opponent: <b className="text-amber-300">{team.name}</b> • <span className="text-emerald-400 font-bold">Pick the same play to TOTALLY SHUT IT DOWN! 🔒💥</span>
                    </span>
                  ) : (
                    <span>6 Unique Plays: 4 Passes & 2 Runs • Varying defensive coverage applies!</span>
                  )}
                </p>
              </div>
            </div>
            {downDistanceText && (
              <span className="hidden sm:inline-block rounded-md border border-amber-400/30 bg-black/60 px-3 py-1 font-mono text-xs font-black uppercase text-amber-300">
                {downDistanceText}
              </span>
            )}
          </div>
          {downDistanceText && (
            <div className="mt-2 sm:hidden text-center">
              <span className="rounded-md border border-amber-400/30 bg-black/60 px-3 py-1 font-mono text-xs font-black uppercase text-amber-300">
                {downDistanceText}
              </span>
            </div>
          )}
        </div>

        {/* 6 Unique Plays Grid (4 Passes, 2 Runs) */}
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto p-2 sm:grid-cols-3 sm:gap-3 sm:p-4">
          {plays.map((play) => {
            const isSelected = selectedPlayId === play.id;
            return (
              <button
                key={play.id}
                type="button"
                onClick={() => {
                  onSelectPlay(play.id);
                  onClose();
                }}
                className={`group flex min-h-[200px] sm:min-h-[235px] flex-col overflow-hidden rounded-lg border text-left transition active:scale-[0.98] cursor-pointer ${
                  isSelected
                    ? isDefense
                      ? 'border-red-400 bg-red-950/40 ring-2 ring-red-500/50'
                      : 'border-amber-400 bg-amber-950/40 ring-2 ring-amber-500/50'
                    : isDefense
                      ? 'border-neutral-800 bg-[#0f1720] hover:border-red-500/70 hover:bg-[#1a1215]'
                      : 'border-neutral-800 bg-[#0f1720] hover:border-amber-400 hover:bg-[#1a1912]'
                }`}
                aria-label={`Select ${play.name}`}
              >
                {/* Play Card Header */}
                <div className="flex items-center justify-between border-b border-neutral-800 bg-black/40 px-2.5 py-1.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${
                      play.isRun ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    }`}
                  >
                    {play.playSlot.replace('_', ' ')}
                  </span>
                  <span className="text-[10px] font-mono text-neutral-400 uppercase font-bold">
                    {play.alignment}
                  </span>
                </div>

                {/* Route Diagram Canvas */}
                <div className="h-24 sm:h-28 w-full shrink-0 overflow-hidden bg-[#09140e]">
                  <MiniRouteDiagram play={play} />
                </div>

                {/* Play Details */}
                <div className="flex flex-1 flex-col justify-between p-2 sm:p-2.5">
                  <div>
                    <h3
                      className={`text-xs sm:text-sm font-black uppercase leading-tight tracking-wide ${
                        isDefense ? 'text-white group-hover:text-red-300' : 'text-white group-hover:text-amber-300'
                      }`}
                    >
                      {play.name}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-[10px] leading-3 text-neutral-400">
                      {play.desc}
                    </p>
                  </div>

                  <div className="mt-2 flex items-center justify-between border-t border-neutral-800/80 pt-1.5 text-[10px] font-mono">
                    <span className="text-neutral-400 font-bold">
                      {isDefense ? (
                        <span className="text-red-400 flex items-center gap-1">
                          <Lock size={10} /> SHUTDOWN TARGET
                        </span>
                      ) : (
                        `EXP: ${play.expectedGain[0]}-${play.expectedGain[1]} YDS`
                      )}
                    </span>
                    <span
                      className={`font-black uppercase text-[9px] px-1.5 py-0.5 rounded ${
                        isDefense
                          ? 'bg-red-500/20 text-red-300'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {isDefense ? 'DEFEND 🛡️' : 'CALL 🏈'}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}

          {/* 4th Down Special Teams (Punt & Field Goal) for Offense */}
          {!isDefense && onSelectSpecialTeams && (
            <div className="col-span-full grid grid-cols-2 gap-2 border-t border-neutral-800 pt-3">
              {(['PUNT', 'FIELD_GOAL'] as const).map((playId) => (
                <button
                  key={playId}
                  type="button"
                  disabled={playId === 'PUNT' && !canPunt}
                  onClick={() => {
                    onSelectSpecialTeams(playId);
                    onClose();
                  }}
                  className="rounded-lg border border-amber-500/60 bg-[#121c27] px-3 py-3 text-center transition hover:border-amber-300 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:opacity-30 cursor-pointer"
                >
                  <span className="block text-xs sm:text-sm font-black uppercase text-white">
                    {playId === 'PUNT' ? 'Punt Unit' : 'Field Goal Unit'}
                    {playId === 'FIELD_GOAL' && fieldGoalDistance !== undefined ? ` (${fieldGoalDistance} YD)` : ''}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-neutral-400">
                    {playId === 'PUNT' ? (canPunt ? 'Flip field position on 4th down' : 'Available only on 4th down') : 'Attempt 3 points from up to 60 yards'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
