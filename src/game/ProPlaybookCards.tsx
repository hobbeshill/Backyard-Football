import React, { useState } from 'react';
import {
  PRO_OFFENSE_PLAYS,
  PRO_DEFENSE_PLAYS,
  ProOffensePlayId,
  ProDefensePlayId,
  ProOffensePlay,
  ProDefensePlay,
  evaluateProMatchup
} from './proMode';
import { X, Shield, Zap, ChevronRight, Info } from 'lucide-react';
import { getRouteWaypoints } from './movement';

interface ProPlaybookCardsProps {
  onClose: () => void;
  onSelectOffensePlay?: (playId: ProOffensePlayId) => void;
  onSelectDefensePlay?: (playId: ProDefensePlayId) => void;
  activeOffensePlay?: string;
  activeDefensePlay?: string;
  initialTab?: 'OFFENSE' | 'DEFENSE' | 'MATRIX';
  selectionOnly?: boolean;
  downDistanceText?: string;
  canPunt?: boolean;
  fieldGoalDistance?: number;
  onSelectSpecialTeams?: (playId: 'PUNT' | 'FIELD_GOAL') => void;
  offensePlayIds?: readonly ProOffensePlayId[];
  specialTeamsOnly?: boolean;
}

export const ProPlaybookCards: React.FC<ProPlaybookCardsProps> = ({
  onClose,
  onSelectOffensePlay,
  onSelectDefensePlay,
  activeOffensePlay,
  activeDefensePlay,
  initialTab = 'OFFENSE',
  selectionOnly = false,
  downDistanceText,
  canPunt = false,
  fieldGoalDistance,
  onSelectSpecialTeams,
  offensePlayIds,
  specialTeamsOnly = false
}) => {
  const [activeTab, setActiveTab] = useState<'OFFENSE' | 'DEFENSE' | 'MATRIX'>(initialTab);
  const [selectedOffenseId, setSelectedOffenseId] = useState<ProOffensePlayId>(
    (activeOffensePlay as ProOffensePlayId) || 'PRO_QUICK_SLANTS'
  );
  const [selectedDefenseId, setSelectedDefenseId] = useState<ProDefensePlayId>(
    (activeDefensePlay as ProDefensePlayId) || 'PRO_COVER2_HARD_FLAT'
  );

  const offensePlayList = specialTeamsOnly ? [] : Object.values(PRO_OFFENSE_PLAYS).filter(play => !offensePlayIds || offensePlayIds.includes(play.id));
  const defensePlayList = Object.values(PRO_DEFENSE_PLAYS);
  const currentOffense = PRO_OFFENSE_PLAYS[selectedOffenseId] || PRO_OFFENSE_PLAYS.PRO_QUICK_SLANTS;
  const currentDefense = PRO_DEFENSE_PLAYS[selectedDefenseId] || defensePlayList[0];
  const specialTeamsCards = onSelectSpecialTeams && (
    <div className="col-span-full grid grid-cols-2 gap-2 border-t border-neutral-700 pt-3">
      {(['PUNT', 'FIELD_GOAL'] as const).map(playId => (
        <button
          key={playId}
          type="button"
          disabled={playId === 'PUNT' && !canPunt}
          onClick={() => {
            onSelectSpecialTeams(playId);
            onClose();
          }}
          className="rounded-md border border-amber-500/60 bg-[#121c27] px-3 py-4 text-center hover:border-amber-300 disabled:cursor-not-allowed disabled:border-neutral-700 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          <span className="block text-sm font-black uppercase text-white">
            {playId === 'PUNT' ? 'Punt' : 'Field Goal'}
            {playId === 'FIELD_GOAL' && fieldGoalDistance !== undefined ? ` (${fieldGoalDistance} YD)` : ''}
          </span>
          <span className="mt-1 block text-xs text-neutral-400">
            {playId === 'PUNT' ? (canPunt ? 'Flip field position' : 'Available on 4th down') : 'Attempt 3 points; range up to 60 yards'}
          </span>
        </button>
      ))}
    </div>
  );

  if (selectionOnly) {
    const isDefense = initialTab === 'DEFENSE';
    const title = isDefense ? 'Choose a Defensive Scheme' : specialTeamsOnly ? 'Choose a Special Teams Play' : 'Choose an Offensive Play';

    return (
      <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/90 p-2 sm:p-4 backdrop-blur-sm">
        <div className="flex max-h-[96dvh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-neutral-700 bg-[#0d131a] text-neutral-200 shadow-2xl">
          <div className="shrink-0 border-b border-neutral-800 px-4 py-3 text-center">
            {downDistanceText && <p className="mb-1 text-base font-black text-amber-300">{downDistanceText}</p>}
            <h2 className="text-sm font-black uppercase text-white">{title}</h2>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto p-2 sm:grid-cols-3 sm:gap-3 sm:p-3 lg:grid-cols-4">
            {isDefense ? defensePlayList.map((play) => (
              <button
                key={play.id}
                type="button"
                onClick={() => {
                  onSelectDefensePlay?.(play.id);
                  onClose();
                }}
                className="group flex min-h-[220px] flex-col overflow-hidden rounded-md border border-neutral-700 bg-[#121c27] text-left transition hover:border-cyan-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 sm:min-h-[252px]"
                aria-label={`Select ${play.name}`}
              >
                <div className="h-44 w-full shrink-0 overflow-hidden bg-[#09150d] sm:h-52">
                  <DefenseSchemeDiagram defense={play} />
                </div>
                <span className="w-full shrink-0 border-t border-neutral-700 px-2 py-2 text-center text-[11px] font-black uppercase leading-tight text-white group-hover:text-cyan-300 sm:text-xs">
                  {play.name}
                </span>
              </button>
            )) : offensePlayList.map((play) => (
              <button
                key={play.id}
                type="button"
                onClick={() => {
                  onSelectOffensePlay?.(play.id);
                  onClose();
                }}
                className="group flex min-h-[220px] flex-col overflow-hidden rounded-md border border-neutral-700 bg-[#121c27] text-left transition hover:border-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 sm:min-h-[252px]"
                aria-label={`Select ${play.name}`}
              >
                <div className="h-44 w-full shrink-0 overflow-hidden bg-[#09150d] sm:h-52">
                  <OffenseRouteDiagram play={play} />
                </div>
                <span className="w-full shrink-0 border-t border-neutral-700 px-2 py-2 text-center text-[11px] font-black uppercase leading-tight text-white group-hover:text-amber-300 sm:text-xs">
                  {play.name}
                </span>
              </button>
            ))}
            {!isDefense && specialTeamsCards}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/85 p-3 sm:p-5 backdrop-blur-md">
      <div className="relative flex flex-col w-full max-w-4xl max-h-[92vh] rounded-xl border border-neutral-700 bg-[#0d131a] text-neutral-200 shadow-2xl overflow-hidden">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-neutral-800 bg-[#121a24] px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <Zap size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-wide text-white uppercase">
                  7-on-7 Pro Playbook & Matchup Schemes
                </h2>
                <span className="text-[10px] font-black tracking-widest uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-1.5 py-0.5 rounded">
                  PRO MODE
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Strategic rock-paper-scissors playbook with exact counters, mismatch variance, and containment rules
              </p>
              {downDistanceText && <p className="mt-1 text-sm font-black text-amber-300">{downDistanceText}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close playbook"
            className="rounded-lg p-1.5 text-neutral-400 transition hover:bg-neutral-800 hover:text-white cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-800 bg-[#0f1720] px-4 sm:px-6 gap-2 pt-2">
          <button
            onClick={() => setActiveTab('OFFENSE')}
            className={`px-4 py-2 text-xs sm:text-sm font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'OFFENSE'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <span>Offensive Playbook (7)</span>
          </button>
          <button
            onClick={() => setActiveTab('DEFENSE')}
            className={`px-4 py-2 text-xs sm:text-sm font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'DEFENSE'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Shield size={14} />
            <span>Defensive Schemes (7)</span>
          </button>
          <button
            onClick={() => setActiveTab('MATRIX')}
            className={`px-4 py-2 text-xs sm:text-sm font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'MATRIX'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <span>Matchup Effectiveness Matrix</span>
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {activeTab === 'OFFENSE' && specialTeamsCards}
          {activeTab === 'OFFENSE' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Play Selector List */}
              <div className="lg:col-span-5 flex flex-col gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                  Select Offensive Play
                </span>
                <div className="flex flex-col gap-1.5">
                  {offensePlayList.map((play) => {
                    const isSelected = play.id === currentOffense.id;
                    return (
                      <button
                        key={play.id}
                        onClick={() => setSelectedOffenseId(play.id)}
                        className={`flex items-center justify-between rounded-lg p-3 text-left transition cursor-pointer border ${
                          isSelected
                            ? 'bg-amber-950/30 border-amber-400/80 text-white shadow-md'
                            : 'bg-[#141d27] border-neutral-800 text-neutral-300 hover:bg-[#1a2533]'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm tracking-tight">{play.name}</span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                              {play.category}
                            </span>
                          </div>
                          <p className="text-xs text-neutral-400 truncate mt-0.5">
                            Counter: <span className="text-red-400 font-medium">{play.counterDefenseName}</span>
                          </p>
                        </div>
                        <ChevronRight
                          size={16}
                          className={`shrink-0 ${isSelected ? 'text-amber-400' : 'text-neutral-500'}`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Visual Card View */}
              <div className="lg:col-span-7 flex flex-col gap-4">
                <div className="rounded-xl border border-neutral-800 bg-[#121c27] p-4 sm:p-5 shadow-lg">
                  <div className="flex items-start justify-between border-b border-neutral-800/80 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-black text-white">{currentOffense.name}</h3>
                        <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300 border border-amber-500/30">
                          {currentOffense.category}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-300 mt-1">{currentOffense.description}</p>
                    </div>
                    {onSelectOffensePlay && (
                      <button
                        onClick={() => {
                          onSelectOffensePlay(currentOffense.id);
                          onClose();
                        }}
                        className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-black uppercase text-black transition hover:bg-amber-400 active:scale-95 cursor-pointer shadow-md"
                      >
                        Call Play
                      </button>
                    )}
                  </div>

                  {/* SVG Route Diagram */}
                  <div className="mt-4 overflow-hidden rounded-lg border border-neutral-700/60 bg-[#09150d] relative shadow-inner">
                    <OffenseRouteDiagram play={currentOffense} />
                  </div>

                  {/* Route & Concept Details */}
                  <div className="mt-4 rounded-lg bg-[#0d151f] p-3 border border-neutral-800">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                      Route Concept & Primary Reads
                    </div>
                    <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
                      {currentOffense.routesSummary}
                    </p>
                  </div>

                  {/* Exact Counter Alert Banner */}
                  <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-950/20 p-3">
                    <Info size={16} className="text-red-400 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <span className="font-bold text-red-300 uppercase">Exact Counter Defense: </span>
                      <span className="font-semibold text-white">{currentOffense.counterDefenseName}</span>
                      <p className="text-neutral-400 mt-0.5">
                        Calling this play against {currentOffense.counterDefenseName} results in a SHUTDOWN (0-2 yards or TFL).
                      </p>
                    </div>
                  </div>

                  {/* Matchup vs All 7 Defenses */}
                  <div className="mt-4">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-2">
                      Defensive Scheme Matchups
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {defensePlayList.map((def) => {
                        const effectiveness = currentOffense.matchups[def.id];
                        const isCounter = currentOffense.counterDefenseId === def.id;
                        let badgeStyle = 'bg-sky-500/10 text-sky-400 border-sky-500/30';
                        let label = 'Effective (3-7 yds)';

                        if (isCounter || effectiveness === 'SHUTDOWN') {
                          badgeStyle = 'bg-red-500/15 text-red-400 border-red-500/40 font-black';
                          label = 'Shutdown (0-2 yds)';
                        } else if (effectiveness === 'BIG_GAIN') {
                          badgeStyle = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 font-black';
                          label = 'Big Gain (15+ yds)';
                        } else if (effectiveness === 'MODERATE') {
                          badgeStyle = 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
                          label = 'Moderate (8-14 yds)';
                        }

                        return (
                          <div
                            key={def.id}
                            className="flex items-center justify-between rounded bg-[#172230] px-2.5 py-1.5 text-xs border border-neutral-800"
                          >
                            <span className="text-neutral-300 font-medium truncate pr-1">{def.name}</span>
                            <span
                              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase border ${badgeStyle}`}
                            >
                              {label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'DEFENSE' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Defense Selector List */}
              <div className="lg:col-span-5 flex flex-col gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                  Select Defensive Scheme
                </span>
                <div className="flex flex-col gap-1.5">
                  {defensePlayList.map((def) => {
                    const isSelected = def.id === currentDefense.id;
                    return (
                      <button
                        key={def.id}
                        onClick={() => setSelectedDefenseId(def.id)}
                        className={`flex items-center justify-between rounded-lg p-3 text-left transition cursor-pointer border ${
                          isSelected
                            ? 'bg-cyan-950/30 border-cyan-400/80 text-white shadow-md'
                            : 'bg-[#141d27] border-neutral-800 text-neutral-300 hover:bg-[#1a2533]'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm tracking-tight">{def.name}</span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                              {def.scheme}
                            </span>
                          </div>
                          <p className="text-xs text-neutral-400 truncate mt-0.5">
                            {def.exactCounterAgainst.length > 0 ? (
                              <>
                                Shuts down:{' '}
                                <span className="text-emerald-400 font-medium">
                                  {def.exactCounterAgainst.map((p) => PRO_OFFENSE_PLAYS[p].name).join(', ')}
                                </span>
                              </>
                            ) : (
                              <span className="text-neutral-400">Balanced zone coverage</span>
                            )}
                          </p>
                        </div>
                        <ChevronRight
                          size={16}
                          className={`shrink-0 ${isSelected ? 'text-cyan-400' : 'text-neutral-500'}`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Visual Card View */}
              <div className="lg:col-span-7 flex flex-col gap-4">
                <div className="rounded-xl border border-neutral-800 bg-[#121c27] p-4 sm:p-5 shadow-lg">
                  <div className="flex items-start justify-between border-b border-neutral-800/80 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-black text-white">{currentDefense.name}</h3>
                        <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-xs font-bold text-cyan-300 border border-cyan-500/30">
                          {currentDefense.scheme}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-300 mt-1">{currentDefense.description}</p>
                    </div>
                    {onSelectDefensePlay && (
                      <button
                        onClick={() => {
                          onSelectDefensePlay(currentDefense.id);
                          onClose();
                        }}
                        className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-black uppercase text-black transition hover:bg-cyan-400 active:scale-95 cursor-pointer shadow-md"
                      >
                        Set Defense
                      </button>
                    )}
                  </div>

                  {/* SVG Coverage Scheme Diagram */}
                  <div className="mt-4 overflow-hidden rounded-lg border border-neutral-700/60 bg-[#09150d] relative shadow-inner">
                    <DefenseSchemeDiagram defense={currentDefense} />
                  </div>

                  {/* Strengths & Weaknesses */}
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-lg bg-[#0d151f] p-3 border border-neutral-800">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                        Defensive Strengths
                      </div>
                      <p className="text-xs text-neutral-300 mt-1">{currentDefense.strengths}</p>
                    </div>
                    <div className="rounded-lg bg-[#0d151f] p-3 border border-neutral-800">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-red-400">
                        Vulnerabilities
                      </div>
                      <p className="text-xs text-neutral-300 mt-1">{currentDefense.vulnerableAgainst}</p>
                    </div>
                  </div>

                  {/* Exact Offensive Counters */}
                  <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3">
                    <Shield size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <span className="font-bold text-emerald-300 uppercase">Shuts Down Offenses: </span>
                      {currentDefense.exactCounterAgainst.length > 0 ? (
                        <span className="font-semibold text-white">
                          {currentDefense.exactCounterAgainst
                            .map((p) => PRO_OFFENSE_PLAYS[p].name)
                            .join(', ')}
                        </span>
                      ) : (
                        <span className="text-neutral-300">Generalist coverage without single hard-counter</span>
                      )}
                      <p className="text-neutral-400 mt-0.5">
                        Neutralizes countered offenses into -1 to +2 yards or turnover on downs.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'MATRIX' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">
                    7-on-7 Strategic Matchup Matrix
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Cross-referenced effectiveness matrix for all 49 offensive vs defensive play calls
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-bold">
                  <span className="flex items-center gap-1 text-red-400">
                    <span className="h-2 w-2 rounded-full bg-red-400" /> Shutdown (0-2 yds)
                  </span>
                  <span className="flex items-center gap-1 text-sky-400">
                    <span className="h-2 w-2 rounded-full bg-sky-400" /> Effective (3-7 yds)
                  </span>
                  <span className="flex items-center gap-1 text-yellow-400">
                    <span className="h-2 w-2 rounded-full bg-yellow-400" /> Moderate (8-14 yds)
                  </span>
                  <span className="flex items-center gap-1 text-emerald-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" /> Big Gain (15+ yds)
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-[#121c27]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-800 bg-[#172230] text-neutral-300">
                      <th className="p-3 font-bold">Offensive Play</th>
                      {defensePlayList.map((def) => (
                        <th key={def.id} className="p-2.5 font-bold text-[11px] text-center border-l border-neutral-800/60">
                          <span className="block truncate max-w-[90px] mx-auto" title={def.name}>
                            {def.name}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {offensePlayList.map((off, idx) => (
                      <tr
                        key={off.id}
                        className={`border-b border-neutral-800/60 ${idx % 2 === 0 ? 'bg-[#121c27]' : 'bg-[#151f2b]'}`}
                      >
                        <td className="p-3 font-bold text-white whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span>{off.name}</span>
                            <span className="text-[9px] px-1 py-0.2 rounded bg-neutral-800 text-neutral-400">
                              {off.category}
                            </span>
                          </div>
                        </td>
                        {defensePlayList.map((def) => {
                          const result = evaluateProMatchup(off.id, def.id, 0.5);
                          let cellStyle = 'bg-sky-500/10 text-sky-300';
                          let label = 'Effective';

                          if (result.isExactCounter || result.effectiveness === 'SHUTDOWN') {
                            cellStyle = 'bg-red-500/20 text-red-300 font-black';
                            label = 'Shutdown';
                          } else if (result.effectiveness === 'BIG_GAIN') {
                            cellStyle = 'bg-emerald-500/20 text-emerald-300 font-black';
                            label = 'Big Gain*';
                          } else if (result.effectiveness === 'MODERATE') {
                            cellStyle = 'bg-yellow-500/10 text-yellow-300';
                            label = 'Moderate';
                          }

                          return (
                            <td
                              key={def.id}
                              className={`p-2 text-center text-[11px] border-l border-neutral-800/60 ${cellStyle}`}
                              title={`${off.name} vs ${def.name}: ${result.summaryText}`}
                            >
                              {label}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-lg bg-[#0e1722] p-3 text-xs text-neutral-400 border border-neutral-800 leading-relaxed">
                <strong className="text-white">Game Engine Variance Rules:</strong>
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>
                    <span className="text-white font-medium">Exact Counter Rule:</span> Countering play shuts down gain to narrow -1 to +2 yards (or incomplete pass).
                  </li>
                  <li>
                    <span className="text-white font-medium">Deep Pass vs Run Defense (*):</span> Verts or Double Moves vs Box Stack or Blitz triggers an 80% explosive play rate (20+ yds or TD) and 20% QB rushed/sack failure rate.
                  </li>
                  <li>
                    <span className="text-white font-medium">Passing Containment:</span> Passing defenses vs non-counter passing offenses reliably contain explosive gains, yielding 4 to 9 yards.
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * High quality SVG route diagram for 7-on-7 offense
 */
const OffenseRouteDiagram: React.FC<{ play: ProOffensePlay }> = ({ play }) => {
  if (!play.isRun) {
    const positions = play.alignment === 'TRIPS'
      ? [50, 290, 250, 215]
      : play.alignment === 'STACK' ? [80, 275, 215, 105] : [45, 295, 225, 115];
    const routes = [play.leftRoute, play.rightRoute, play.centerRoute, play.slotRoute];
    return (
      <svg viewBox="0 0 340 430" className="h-full w-full select-none" aria-label={`${play.name} routes`}>
        <defs>
          <marker id={`routeArrow-${play.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#fbbf24" />
          </marker>
        </defs>
        <rect width="340" height="430" fill="#0d2616" />
        {[50, 100, 150, 200, 250, 300].map(y => <line key={y} x1="0" y1={y} x2="340" y2={y} stroke="#ffffff18" />)}
        <line x1="0" y1="350" x2="340" y2="350" stroke="#3b82f6" strokeWidth="2" />
        <line x1="0" y1="250" x2="340" y2="250" stroke="#eab308" strokeDasharray="5 4" />
        <text x="8" y="244" fill="#facc15" fontSize="10">10 YDS</text>
        {routes.map((routeType, index) => {
          const x = positions[index];
          const points = getRouteWaypoints({ x, y: 350, routeType, radius: 10 }, -1, 340, 430);
          return (
            <g key={index}>
              {routeType === 'BLOCK'
                ? <path d={`M ${x} 350 L ${x} 328 M ${x - 9} 328 L ${x + 9} 328`} stroke="#34d399" strokeWidth="3" />
                : <path d={`M ${x} 350 ${points.map(point => `L ${point.x} ${point.y}`).join(' ')}`} fill="none" stroke={routeType === 'HITCH' ? '#38bdf8' : '#fbbf24'} strokeWidth="3" markerEnd={`url(#routeArrow-${play.id})`} />}
              <circle cx={x} cy="350" r="6" fill="#3b82f6" stroke="#fff" />
              <text x={x} y="370" fill="#93c5fd" fontSize="10" textAnchor="middle">{['WR-L', 'WR-R', 'TE', 'SLOT'][index]}</text>
            </g>
          );
        })}
        <circle cx="170" cy="395" r="7" fill="#eab308" stroke="#fff" />
        <text x="170" y="415" fill="#fbbf24" fontSize="10" textAnchor="middle">QB</text>
        <circle cx={play.alignment === 'TRIPS' ? 90 : 220} cy="405" r="6" fill="#3b82f6" stroke="#fff" />
        <path d={`M ${play.alignment === 'TRIPS' ? 90 : 220} 399 v -16 m -9 0 h 18`} stroke="#34d399" strokeWidth="3" />
        <text x={play.alignment === 'TRIPS' ? 90 : 220} y="425" fill="#93c5fd" fontSize="10" textAnchor="middle">RB BLOCK</text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 340 200" className="w-full h-44 sm:h-52 select-none">
      <defs>
        {/* Field Grid Pattern */}
        <pattern id="yardLines" width="340" height="40" patternUnits="userSpaceOnUse">
          <line x1="0" y1="39" x2="340" y2="39" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          <line x1="110" y1="35" x2="110" y2="40" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
          <line x1="230" y1="35" x2="230" y2="40" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
        </pattern>
        {/* Markers */}
        <marker id="arrowAmber" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#fbbf24" />
        </marker>
        <marker id="arrowEmerald" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#34d399" />
        </marker>
        <marker id="arrowCyan" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
        </marker>
      </defs>

      {/* Field Background */}
      <rect width="340" height="200" fill="#0d2616" />
      <rect width="340" height="200" fill="url(#yardLines)" />

      {/* Line of Scrimmage */}
      <line x1="0" y1="130" x2="340" y2="130" stroke="#3b82f6" strokeWidth="2" strokeDasharray="4 3" />
      <text x="8" y="126" fill="#60a5fa" fontSize="8" fontWeight="bold">LINE OF SCRIMMAGE</text>

      {/* First Down Line (10 yards ahead) */}
      <line x1="0" y1="70" x2="340" y2="70" stroke="#eab308" strokeWidth="1.5" />
      <text x="8" y="66" fill="#facc15" fontSize="8" fontWeight="bold">1ST DOWN MARKER (10 YDS)</text>

      {/* Offensive Players (Blue/Gold) */}
      {/* Center Lineman */}
      <circle cx="170" cy="130" r="5" fill="#f59e0b" stroke="#fff" strokeWidth="1" />
      {/* QB */}
      <circle cx="170" cy="160" r="6" fill="#eab308" stroke="#fff" strokeWidth="1.5" />
      <text x="170" y="174" fill="#fbbf24" fontSize="8" fontWeight="bold" textAnchor="middle">QB</text>

      {/* Running Back */}
      <circle cx="140" cy="165" r="5.5" fill="#3b82f6" stroke="#fff" strokeWidth="1" />
      <text x="140" y="178" fill="#93c5fd" fontSize="7" fontWeight="bold" textAnchor="middle">RB</text>

      {/* Wide Receivers Left & Right & Slot */}
      <circle cx="50" cy="130" r="5" fill="#3b82f6" stroke="#fff" strokeWidth="1" />
      <text x="50" y="142" fill="#93c5fd" fontSize="7" fontWeight="bold" textAnchor="middle">WR-L</text>

      <circle cx="290" cy="130" r="5" fill="#3b82f6" stroke="#fff" strokeWidth="1" />
      <text x="290" y="142" fill="#93c5fd" fontSize="7" fontWeight="bold" textAnchor="middle">WR-R</text>

      <circle cx="230" cy="130" r="5" fill="#3b82f6" stroke="#fff" strokeWidth="1" />
      <text x="230" y="142" fill="#93c5fd" fontSize="7" fontWeight="bold" textAnchor="middle">SLOT</text>

      {play.id === 'PRO_JET_SWEEP' && (
        <g>
          {/* Motion path before snap */}
          <path d="M 250 140 L 175 152" fill="none" stroke="#38bdf8" strokeWidth="2" strokeDasharray="4 3" markerEnd="url(#arrowCyan)" />
          <text x="215" y="146" fill="#7dd3fc" fontSize="6" fontWeight="bold">PRE-SNAP MOTION</text>
          {/* Edge sprint path */}
          <path d="M 175 152 Q 135 155 100 135 L 45 60 L 45 20" fill="none" stroke="#fbbf24" strokeWidth="3" markerEnd="url(#arrowAmber)" />
          {/* Perimeter seal blocks */}
          <line x1="50" y1="130" x2="65" y2="100" stroke="#34d399" strokeWidth="2.5" />
          <line x1="170" y1="130" x2="150" y2="115" stroke="#34d399" strokeWidth="2.5" />
        </g>
      )}

      {play.id === 'PRO_DRAW' && (
        <g>
          {/* QB fake pass drop */}
          <path d="M 170 160 L 170 178" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeDasharray="3 2" />
          {/* Delayed handoff up the middle */}
          <path d="M 140 165 Q 165 174 170 155 L 170 85 L 170 30" fill="none" stroke="#fbbf24" strokeWidth="3" markerEnd="url(#arrowAmber)" />
          {/* Receivers clear deep */}
          <path d="M 50 130 L 50 60" fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="3 2" />
          <path d="M 290 130 L 290 60" fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="3 2" />
          <text x="170" y="110" fill="#facc15" fontSize="7" fontWeight="bold" textAnchor="middle">DELAYED CREASE</text>
        </g>
      )}

    </svg>
  );
};

/**
 * High quality SVG defensive scheme diagram
 */
const DefenseSchemeDiagram: React.FC<{ defense: ProDefensePlay }> = ({ defense }) => {
  return (
    <svg viewBox="0 0 340 200" className="w-full h-44 sm:h-52 select-none">
      <defs>
        <pattern id="defYardLines" width="340" height="40" patternUnits="userSpaceOnUse">
          <line x1="0" y1="39" x2="340" y2="39" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        </pattern>
        <marker id="arrowRed" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" />
        </marker>
        <marker id="arrowCyanDef" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
        </marker>
      </defs>

      {/* Field Background */}
      <rect width="340" height="200" fill="#13241b" />
      <rect width="340" height="200" fill="url(#defYardLines)" />

      {/* Line of Scrimmage */}
      <line x1="0" y1="130" x2="340" y2="130" stroke="#3b82f6" strokeWidth="2" strokeDasharray="4 3" />
      <text x="8" y="126" fill="#60a5fa" fontSize="8" fontWeight="bold">LINE OF SCRIMMAGE</text>

      {/* Offensive Formation Indicators (Translucent Ghost Dots) */}
      <circle cx="170" cy="130" r="4" fill="rgba(255,255,255,0.25)" />
      <circle cx="170" cy="155" r="4" fill="rgba(255,255,255,0.25)" />
      <circle cx="50" cy="130" r="4" fill="rgba(255,255,255,0.25)" />
      <circle cx="290" cy="130" r="4" fill="rgba(255,255,255,0.25)" />

      {/* Defense Specific Alignment & Zones */}
      {defense.id === 'PRO_COVER2_HARD_FLAT' && (
        <g>
          {/* Two Deep Halves */}
          <rect x="10" y="15" width="155" height="65" fill="rgba(56, 189, 248, 0.12)" stroke="#38bdf8" strokeWidth="1" strokeDasharray="3 2" rx="4" />
          <text x="87" y="50" fill="#38bdf8" fontSize="8" fontWeight="bold" textAnchor="middle">DEEP HALF (SAFETY)</text>
          <circle cx="87" cy="40" r="5" fill="#0284c7" stroke="#fff" strokeWidth="1" />

          <rect x="175" y="15" width="155" height="65" fill="rgba(56, 189, 248, 0.12)" stroke="#38bdf8" strokeWidth="1" strokeDasharray="3 2" rx="4" />
          <text x="252" y="50" fill="#38bdf8" fontSize="8" fontWeight="bold" textAnchor="middle">DEEP HALF (SAFETY)</text>
          <circle cx="252" cy="40" r="5" fill="#0284c7" stroke="#fff" strokeWidth="1" />

          {/* Hard Flats Cornerbacks right at line */}
          <circle cx="45" cy="120" r="5" fill="#ef4444" stroke="#fff" strokeWidth="1" />
          <path d="M 45 120 L 45 105" fill="none" stroke="#ef4444" strokeWidth="2" markerEnd="url(#arrowRed)" />
          <rect x="15" y="90" width="70" height="30" fill="rgba(239, 68, 68, 0.15)" stroke="#ef4444" strokeWidth="1" rx="4" />
          <text x="50" y="102" fill="#f87171" fontSize="7" fontWeight="bold" textAnchor="middle">HARD FLAT</text>

          <circle cx="295" cy="120" r="5" fill="#ef4444" stroke="#fff" strokeWidth="1" />
          <rect x="255" y="90" width="70" height="30" fill="rgba(239, 68, 68, 0.15)" stroke="#ef4444" strokeWidth="1" rx="4" />
          <text x="290" y="102" fill="#f87171" fontSize="7" fontWeight="bold" textAnchor="middle">HARD FLAT</text>
        </g>
      )}

      {defense.id === 'PRO_COVER1_MAN' && (
        <g>
          {/* Single High Safety */}
          <circle cx="170" cy="30" r="6" fill="#0284c7" stroke="#fff" strokeWidth="1.5" />
          <ellipse cx="170" cy="35" rx="60" ry="25" fill="rgba(56, 189, 248, 0.15)" stroke="#38bdf8" strokeWidth="1" strokeDasharray="3 2" />
          <text x="170" y="38" fill="#38bdf8" fontSize="7" fontWeight="bold" textAnchor="middle">SINGLE HIGH FREE SAFETY</text>

          {/* Man to Man Lock Dots with arrows trailing */}
          <circle cx="50" cy="118" r="5" fill="#ef4444" stroke="#fff" strokeWidth="1" />
          <text x="50" y="112" fill="#f87171" fontSize="6" fontWeight="bold" textAnchor="middle">MAN LOCK</text>

          <circle cx="290" cy="118" r="5" fill="#ef4444" stroke="#fff" strokeWidth="1" />
          <text x="290" y="112" fill="#f87171" fontSize="6" fontWeight="bold" textAnchor="middle">MAN LOCK</text>

          <circle cx="230" cy="118" r="5" fill="#ef4444" stroke="#fff" strokeWidth="1" />
          <circle cx="140" cy="140" r="5" fill="#ef4444" stroke="#fff" strokeWidth="1" />
          <circle cx="170" cy="115" r="5" fill="#f59e0b" stroke="#fff" strokeWidth="1" />
        </g>
      )}

      {defense.id === 'PRO_COVER3_DEEP' && (
        <g>
          {/* Three Deep Thirds */}
          <rect x="8" y="15" width="102" height="65" fill="rgba(56, 189, 248, 0.12)" stroke="#38bdf8" strokeWidth="1" rx="4" />
          <text x="59" y="50" fill="#38bdf8" fontSize="7" fontWeight="bold" textAnchor="middle">DEEP 1/3 (CB)</text>
          <circle cx="59" cy="35" r="5" fill="#0284c7" stroke="#fff" />

          <rect x="118" y="15" width="104" height="65" fill="rgba(56, 189, 248, 0.15)" stroke="#38bdf8" strokeWidth="1" rx="4" />
          <text x="170" y="50" fill="#38bdf8" fontSize="7" fontWeight="bold" textAnchor="middle">DEEP 1/3 (FS)</text>
          <circle cx="170" cy="35" r="5" fill="#0284c7" stroke="#fff" />

          <rect x="230" y="15" width="102" height="65" fill="rgba(56, 189, 248, 0.12)" stroke="#38bdf8" strokeWidth="1" rx="4" />
          <text x="281" y="50" fill="#38bdf8" fontSize="7" fontWeight="bold" textAnchor="middle">DEEP 1/3 (CB)</text>
          <circle cx="281" cy="35" r="5" fill="#0284c7" stroke="#fff" />

          {/* Underneath zones */}
          <ellipse cx="115" cy="105" rx="40" ry="16" fill="rgba(234, 179, 8, 0.1)" stroke="#eab308" strokeWidth="1" />
          <ellipse cx="225" cy="105" rx="40" ry="16" fill="rgba(234, 179, 8, 0.1)" stroke="#eab308" strokeWidth="1" />
          <text x="170" y="108" fill="#facc15" fontSize="7" fontWeight="bold" textAnchor="middle">HOOK / CURL ZONES</text>
        </g>
      )}

      {defense.id === 'PRO_COVER4_QUARTERS' && (
        <g>
          {/* 4 Deep Quarters */}
          <rect x="8" y="15" width="76" height="70" fill="rgba(56, 189, 248, 0.14)" stroke="#38bdf8" strokeWidth="1" rx="4" />
          <circle cx="46" cy="38" r="4.5" fill="#0284c7" stroke="#fff" />
          <text x="46" y="52" fill="#38bdf8" fontSize="6.5" fontWeight="bold" textAnchor="middle">QUARTER 1</text>

          <rect x="90" y="15" width="76" height="70" fill="rgba(56, 189, 248, 0.14)" stroke="#38bdf8" strokeWidth="1" rx="4" />
          <circle cx="128" cy="38" r="4.5" fill="#0284c7" stroke="#fff" />
          <text x="128" y="52" fill="#38bdf8" fontSize="6.5" fontWeight="bold" textAnchor="middle">QUARTER 2</text>

          <rect x="174" y="15" width="76" height="70" fill="rgba(56, 189, 248, 0.14)" stroke="#38bdf8" strokeWidth="1" rx="4" />
          <circle cx="212" cy="38" r="4.5" fill="#0284c7" stroke="#fff" />
          <text x="212" y="52" fill="#38bdf8" fontSize="6.5" fontWeight="bold" textAnchor="middle">QUARTER 3</text>

          <rect x="256" y="15" width="76" height="70" fill="rgba(56, 189, 248, 0.14)" stroke="#38bdf8" strokeWidth="1" rx="4" />
          <circle cx="294" cy="38" r="4.5" fill="#0284c7" stroke="#fff" />
          <text x="294" y="52" fill="#38bdf8" fontSize="6.5" fontWeight="bold" textAnchor="middle">QUARTER 4</text>
        </g>
      )}

      {defense.id === 'PRO_BLITZ_ZERO' && (
        <g>
          {/* Zero Deep Safeties Indicator */}
          <text x="170" y="35" fill="#ef4444" fontSize="9" fontWeight="black" textAnchor="middle">
            ZERO DEEP SAFETIES (HOUSE BLITZ)
          </text>
          {/* Heavy Blitz Rush Arrows */}
          <path d="M 120 100 L 160 148" fill="none" stroke="#ef4444" strokeWidth="2.5" markerEnd="url(#arrowRed)" />
          <path d="M 170 100 L 170 148" fill="none" stroke="#ef4444" strokeWidth="2.5" markerEnd="url(#arrowRed)" />
          <path d="M 220 100 L 180 148" fill="none" stroke="#ef4444" strokeWidth="2.5" markerEnd="url(#arrowRed)" />
          <circle cx="120" cy="95" r="5" fill="#ef4444" stroke="#fff" />
          <circle cx="170" cy="95" r="5" fill="#ef4444" stroke="#fff" />
          <circle cx="220" cy="95" r="5" fill="#ef4444" stroke="#fff" />
        </g>
      )}

      {defense.id === 'PRO_RUN_STOP_BOX' && (
        <g>
          {/* 6-1 Box Stacked on Scrimmage */}
          <rect x="75" y="105" width="190" height="25" fill="rgba(239, 68, 68, 0.2)" stroke="#ef4444" strokeWidth="1.5" rx="4" />
          <text x="170" y="121" fill="#fca5a5" fontSize="8" fontWeight="black" textAnchor="middle">
            STACKED 6-1 RUN BOX
          </text>
          {/* 6 Stacked Defenders */}
          {[95, 125, 155, 185, 215, 245].map((x) => (
            <circle key={x} cx={x} cy={110} r="5" fill="#dc2626" stroke="#fff" strokeWidth="1" />
          ))}
          {/* Single Safety */}
          <circle cx="170" cy="40" r="5" fill="#0284c7" stroke="#fff" />
          <text x="170" y="55" fill="#7dd3fc" fontSize="7" fontWeight="bold" textAnchor="middle">LONE SAFETY</text>
        </g>
      )}

      {defense.id === 'PRO_TAMPA2' && (
        <g>
          {/* 2 Deep Safeties */}
          <circle cx="90" cy="40" r="5" fill="#0284c7" stroke="#fff" />
          <circle cx="250" cy="40" r="5" fill="#0284c7" stroke="#fff" />
          {/* MLB Deep Drop Arrow */}
          <circle cx="170" cy="100" r="5" fill="#ef4444" stroke="#fff" />
          <path d="M 170 100 L 170 55" fill="none" stroke="#38bdf8" strokeWidth="2.5" markerEnd="url(#arrowCyanDef)" />
          <text x="170" y="75" fill="#38bdf8" fontSize="7" fontWeight="bold" textAnchor="middle">
            MLB DEEP HOLE DROP
          </text>
          {/* Underneath moderate zones */}
          <rect x="30" y="85" width="80" height="30" fill="rgba(56, 189, 248, 0.1)" stroke="#38bdf8" strokeWidth="1" rx="4" />
          <rect x="230" y="85" width="80" height="30" fill="rgba(56, 189, 248, 0.1)" stroke="#38bdf8" strokeWidth="1" rx="4" />
        </g>
      )}
    </svg>
  );
};
