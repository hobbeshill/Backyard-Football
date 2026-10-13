import React from 'react';
import { getTecmoPlaysForTeam, type TecmoPlayOption } from './tecmoPlaybook';
import { getTeam } from './teams';
import { getScreenTravelDirection } from './playbook';
import { Shield, Zap, Target, Lock, ArrowUpRight, ChevronRight, X } from 'lucide-react';

interface TecmoPlaybookCardsProps {
  teamId: string;
  opposingTeamId: string;
  isDefense: boolean;
  attackDirection: number;
  activeOffensePlay?: string;
  activeDefensePlay?: string;
  scoreboard?: React.ReactNode;
  canPunt?: boolean;
  fieldGoalDistance?: number;
  onSelectPlay: (playId: string) => void;
  onSelectSpecialTeams?: (playId: 'PUNT' | 'FIELD_GOAL') => void;
  onClose: () => void;
}

function MiniRouteDiagram({ play, attackDirection }: { play: TecmoPlayOption; attackDirection: number }) {
  const isRun = play.isRun;
  const screenDirection = getScreenTravelDirection(attackDirection);
  const direction = -screenDirection;
  const lineY = screenDirection === 1 ? 85 : 25;
  const qbY = lineY - 12 * direction;
  const rbY = lineY - 18 * direction;
  const advance = (depth: number) => lineY + depth * direction;
  const depthScale = 160 / 110;
  const crossScale = 110 / 160;
  const lineX = 160 - lineY * depthScale;
  const routeTransform = `matrix(0 ${crossScale} ${-depthScale} 0 160 0)`;
  return (
    <svg viewBox="0 0 160 110" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      {/* Field Background & Line of Scrimmage */}
      <rect x="0" y="0" width="160" height="110" fill="#0d1b12" />
      {/* 5-yard yardlines */}
      {(screenDirection === 1 ? [25, 55] : [55, 85]).map(y => (
        <line key={y} x1={160 - y * depthScale} y1="0" x2={160 - y * depthScale} y2="110" stroke="#ffffff15" strokeWidth="1" strokeDasharray="3 3" />
      ))}
      {/* Line of Scrimmage */}
      <line x1={lineX} y1="0" x2={lineX} y2="110" stroke="#3b82f6" strokeWidth="1.5" />
      {/* Offensive Line (Center + Guards/Tackles) */}
      <circle cx={lineX} cy="55" r="3.5" fill="#ffffff" />
      <circle cx={lineX} cy={68 * crossScale} r="3" fill="#94a3b8" />
      <circle cx={lineX} cy={92 * crossScale} r="3" fill="#94a3b8" />
      {/* QB */}
      <circle cx={160 - qbY * depthScale} cy="55" r="3.5" fill="#38bdf8" />
      {/* RB */}
      <circle cx={160 - rbY * depthScale} cy={70 * crossScale} r="3" fill="#f59e0b" />

      {/* Receiver Route Schematics */}
      {/* Left WR (x=24) */}
      <circle cx={lineX} cy={24 * crossScale} r="3" fill="#ec4899" />
      <RoutePath route={play.left} startX={24} startY={lineY} direction={direction} transform={routeTransform} />

      {/* Slot WR (x=50) */}
      <circle cx={lineX} cy={50 * crossScale} r="3" fill="#a855f7" />
      <RoutePath route={play.slot} startX={50} startY={lineY} direction={direction} transform={routeTransform} />

      {/* Center/TE (x=110) */}
      <circle cx={lineX} cy={110 * crossScale} r="3" fill="#34d399" />
      <RoutePath route={play.center} startX={110} startY={lineY} direction={direction} transform={routeTransform} />

      {/* Right WR (x=136) */}
      <circle cx={lineX} cy={136 * crossScale} r="3" fill="#ec4899" />
      <RoutePath route={play.right} startX={136} startY={lineY} direction={direction} transform={routeTransform} />

      {/* Run Action Path for Designed Runs */}
      {isRun && (
        <g transform={routeTransform}>
          <path
            d={
              play.type === 'SWEEP'
                ? `M 70 ${rbY} Q 40 ${rbY - 5 * direction} 25 ${advance(15)} Q 18 ${advance(40)} 22 ${advance(70)}`
                : play.type === 'COUNTER'
                  ? `M 70 ${rbY} Q 92 ${rbY - 4 * direction} 96 ${rbY + 5 * direction} Q 68 ${advance(15)} 52 ${advance(65)}`
                  : play.type === 'INSIDE_ZONE'
                    ? `M 70 ${rbY} L 70 ${advance(18)} Q 58 ${advance(36)} 62 ${advance(70)} M 70 ${advance(18)} Q 82 ${advance(36)} 80 ${advance(70)}`
                : play.type === 'POWER'
                  ? `M 70 ${rbY} Q 75 ${rbY - 11 * direction} 88 ${advance(10)} L 94 ${advance(65)}`
                  : `M 70 ${rbY} Q 74 ${rbY - 11 * direction} 80 ${advance(10)} L 80 ${advance(70)}`
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
                ? `22,${advance(70)} 18,${advance(62)} 26,${advance(62)}`
                : play.type === 'COUNTER'
                  ? `52,${advance(65)} 48,${advance(57)} 56,${advance(57)}`
                  : play.type === 'INSIDE_ZONE'
                    ? `62,${advance(70)} 58,${advance(62)} 66,${advance(62)}`
                : play.type === 'POWER'
                  ? `94,${advance(65)} 90,${advance(57)} 98,${advance(57)}`
                  : `80,${advance(70)} 76,${advance(62)} 84,${advance(62)}`
            }
            fill="#f59e0b"
          />
        </g>
      )}
    </svg>
  );
}

function RoutePath({ route, startX, startY, direction, transform }: { route: string; startX: number; startY: number; direction: number; transform: string }) {
  if (route === 'BLOCK') {
    return (
      <line transform={transform} x1={startX - 6} y1={startY + 6 * direction} x2={startX + 6} y2={startY + 6 * direction} stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
    );
  }
  let pathD = '';
  const dir = startX < 80 ? 1 : -1;
  const advance = (depth: number) => startY + depth * direction;

  switch (route) {
    case 'GO':
      pathD = `M ${startX} ${startY} L ${startX} ${advance(70)}`;
      break;
    case 'SLANT-R':
      pathD = `M ${startX} ${startY} L ${startX} ${advance(15)} L ${startX + 30} ${advance(45)}`;
      break;
    case 'SLANT-L':
      pathD = `M ${startX} ${startY} L ${startX} ${advance(15)} L ${startX - 30} ${advance(45)}`;
      break;
    case 'CROSS-R':
      pathD = `M ${startX} ${startY} L ${startX} ${advance(20)} L ${startX + 55} ${advance(25)}`;
      break;
    case 'CROSS-L':
      pathD = `M ${startX} ${startY} L ${startX} ${advance(20)} L ${startX - 55} ${advance(25)}`;
      break;
    case 'COMEBACK':
      pathD = `M ${startX} ${startY} L ${startX} ${advance(45)} L ${startX + (dir * 8)} ${advance(35)}`;
      break;
    case 'HITCH':
      pathD = `M ${startX} ${startY} L ${startX} ${advance(25)} L ${startX - (dir * 6)} ${advance(20)}`;
      break;
    case 'POST-R':
      pathD = `M ${startX} ${startY} L ${startX} ${advance(35)} L ${startX + 28} ${advance(70)}`;
      break;
    case 'POST-L':
      pathD = `M ${startX} ${startY} L ${startX} ${advance(35)} L ${startX - 28} ${advance(70)}`;
      break;
    case 'FLAG-R':
      pathD = `M ${startX} ${startY} L ${startX} ${advance(35)} L ${startX + 32} ${advance(65)}`;
      break;
    case 'FLAG-L':
      pathD = `M ${startX} ${startY} L ${startX} ${advance(35)} L ${startX - 32} ${advance(65)}`;
      break;
    case 'WHEEL':
      pathD = `M ${startX} ${startY} Q ${startX + (dir * 25)} ${advance(20)} ${startX + (dir * 20)} ${advance(70)}`;
      break;
    default:
      pathD = `M ${startX} ${startY} L ${startX} 25`;
      break;
  }

  return (
    <path
      d={pathD}
      transform={transform}
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
  attackDirection,
  activeOffensePlay,
  activeDefensePlay,
  scoreboard,
  canPunt = false,
  fieldGoalDistance,
  onSelectPlay,
  onSelectSpecialTeams,
  onClose
}) => {
  // Defense chooses from the same expanded play list available to the opponent.
  const relevantTeamId = isDefense ? opposingTeamId : teamId;
  const team = getTeam(relevantTeamId);
  const userTeam = getTeam(teamId);
  const plays = getTecmoPlaysForTeam(relevantTeamId);

  const selectedPlayId = isDefense ? activeDefensePlay : activeOffensePlay;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/92 p-2 sm:p-4 backdrop-blur-md">
      <div className="flex max-h-[96dvh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-neutral-700 bg-[#0a1117] text-neutral-200 shadow-2xl">
        {scoreboard}
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
                    <span>8 Team Plays: 6 Team Calls & 2 Identity Concepts • Varying defensive coverage applies!</span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Team plays grid */}
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
                  <MiniRouteDiagram play={play} attackDirection={attackDirection} />
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
