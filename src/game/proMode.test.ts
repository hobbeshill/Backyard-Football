import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRO_OFFENSE_PLAYS,
  PRO_DEFENSE_PLAYS,
  evaluateProMatchup,
  ProOffensePlayId,
  ProDefensePlayId
} from './proMode';
import { offensivePlaybook, defensivePlaybook, eliteOffensiveKeys, eliteDefensiveKeys, proOffensiveKeys, proDefensiveKeys } from './playbook';
import { getCatchCompletionChance, resolveCatchContestOutcome } from './rules';
import { getCpuCounterReason } from './ai';
import { mountFootballGame, type GameEngineHandle } from './engine';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProPlaybookCards } from './ProPlaybookCards';

test('Pro playbooks retain the seven base calls and add 32 team-exclusive calls per side', () => {
  const offKeys = Object.keys(PRO_OFFENSE_PLAYS) as ProOffensePlayId[];
  const defKeys = Object.keys(PRO_DEFENSE_PLAYS) as ProDefensePlayId[];

  assert.equal(offKeys.length, 39);
  assert.equal(defKeys.length, 39);

  assert.deepEqual(offKeys.filter(key => !key.startsWith('PRO_TEAM_')), [
    'PRO_QUICK_SLANTS',
    'PRO_MESH',
    'PRO_VERTS',
    'PRO_DOUBLE_MOVES',
    'PRO_SCREEN',
    'PRO_JET_SWEEP',
    'PRO_DRAW'
  ]);

  assert.deepEqual(defKeys.filter(key => !key.startsWith('PRO_TEAM_')), [
    'PRO_COVER2_HARD_FLAT',
    'PRO_COVER1_MAN',
    'PRO_COVER3_DEEP',
    'PRO_COVER4_QUARTERS',
    'PRO_BLITZ_ZERO',
    'PRO_RUN_STOP_BOX',
    'PRO_TAMPA2'
  ]);
});

test('Exact Counter Rule: Every offensive play has an exact counter defense that limits gain to -1 to +2 yards', () => {
  const exactCounters: Record<ProOffensePlayId, ProDefensePlayId> = {
    PRO_QUICK_SLANTS: 'PRO_COVER1_MAN',
    PRO_MESH: 'PRO_COVER3_DEEP',
    PRO_VERTS: 'PRO_COVER4_QUARTERS',
    PRO_DOUBLE_MOVES: 'PRO_COVER2_HARD_FLAT',
    PRO_SCREEN: 'PRO_BLITZ_ZERO',
    PRO_JET_SWEEP: 'PRO_RUN_STOP_BOX',
    PRO_DRAW: 'PRO_RUN_STOP_BOX'
  };

  for (const [offId, expectedDefId] of Object.entries(exactCounters) as [ProOffensePlayId, ProDefensePlayId][]) {
    const res = evaluateProMatchup(offId, expectedDefId);
    assert.equal(res.isExactCounter, true, `${offId} countered by ${expectedDefId}`);
    assert.equal(res.effectiveness, 'SHUTDOWN');
    assert.ok(res.expectedYardsRange[0] >= -2 && res.expectedYardsRange[1] <= 2);
  }
});

test('Run vs. Deep Pass Mismatch Rule: 80% big gain (20+ yds) and 20% QB rushed/sack failure variance', () => {
  const deepPlays: ProOffensePlayId[] = ['PRO_VERTS', 'PRO_DOUBLE_MOVES'];
  const runDefenses: ProDefensePlayId[] = ['PRO_RUN_STOP_BOX', 'PRO_BLITZ_ZERO'];

  for (const off of deepPlays) {
    for (const def of runDefenses) {
      if (def === 'PRO_RUN_STOP_BOX') {
        // Roll <= 0.80 -> success
        const win = evaluateProMatchup(off, def, 0.50);
        assert.equal(win.isBigGainMismatch, true);
        assert.equal(win.bigGainSuccess, true);
        assert.ok(win.expectedYardsRange[0] >= 20);

        // Roll > 0.80 -> pressure sack
        const lose = evaluateProMatchup(off, def, 0.90);
        assert.equal(lose.isBigGainMismatch, true);
        assert.equal(lose.bigGainSuccess, false);
        assert.ok(lose.expectedYardsRange[0] < 0);
      }
    }
  }
});

test('Passing Defense vs Passing Offense Rule: Non-counter pass defense containment yields 4 to 9 yards', () => {
  // Quick Slants vs Cover 2 Hard Flat
  const res = evaluateProMatchup('PRO_QUICK_SLANTS', 'PRO_COVER2_HARD_FLAT');
  assert.equal(res.isExactCounter, false);
  assert.equal(res.isBigGainMismatch, false);
  assert.equal(res.effectiveness, 'EFFECTIVE');
  assert.deepEqual(res.expectedYardsRange, [4, 9]);
});

test('Pro and Elite keys are properly separated in playbook', () => {
  assert.equal(eliteOffensiveKeys.length, 41);
  assert.equal(eliteDefensiveKeys.length, 38);
  assert.equal(proOffensiveKeys.length, 39);
  assert.equal(proDefensiveKeys.length, 39);
});

test('Pro CPU counter cues match repeated tendencies and the selected defense', () => {
  const repeatedScreens = [
    { play: 'PRO_SCREEN', isPass: true },
    { play: 'PRO_SCREEN', isPass: true }
  ];
  assert.equal(getCpuCounterReason(repeatedScreens, 'PRO_BLITZ_ZERO', true), 'repeated screens');
  assert.equal(getCpuCounterReason(repeatedScreens, 'PRO_TAMPA2', true), null);
});

test('Pro mode allows players to pick every offensive play with valid route assignments', () => {
  for (const playId of proOffensiveKeys) {
    const play = offensivePlaybook[playId];
    assert.ok(play, `Play ${playId} must exist in offensivePlaybook`);
    assert.ok(play.alignment, `Play ${playId} must have an alignment`);
    assert.ok(play.left && play.right && play.center && play.rbRoute, `Play ${playId} must have routes assigned`);
    assert.ok(PRO_OFFENSE_PLAYS[playId as ProOffensePlayId], `Play ${playId} must exist in PRO_OFFENSE_PLAYS`);
  }
});

test('every Pro passing play keeps the RB in pass protection', () => {
  for (const play of Object.values(PRO_OFFENSE_PLAYS)) {
    if (play.isRun) continue;
    assert.equal(play.rbRoute, 'BLOCK', `${play.id} should keep an RB pass protector`);
    assert.equal(offensivePlaybook[play.id].rbRoute, 'BLOCK', `${play.id} engine routes should match its card`);
  }
});

test('Pro card routes match all four receivers in the engine playbook', () => {
  for (const play of Object.values(PRO_OFFENSE_PLAYS)) {
    const enginePlay = offensivePlaybook[play.id];
    assert.deepEqual(
      [play.leftRoute, play.rightRoute, play.centerRoute, play.slotRoute],
      [enginePlay.left, enginePlay.right, enginePlay.center, enginePlay.slot],
      play.id
    );
  }
  for (const playId of ['PRO_QUICK_SLANTS', 'PRO_MESH', 'PRO_DOUBLE_MOVES'] as const) {
    assert.equal(offensivePlaybook[playId].slot, 'HITCH', `${playId} needs a short checkdown`);
  }
  assert.equal(offensivePlaybook.PRO_VERTS.slot, 'GO');
});

test('live Pro playbook shows situation and special teams, with punts restricted to fourth down', () => {
  const render = (canPunt: boolean, initialTab: 'OFFENSE' | 'DEFENSE' = 'OFFENSE') =>
    renderToStaticMarkup(React.createElement(ProPlaybookCards, {
      onClose: () => {},
      selectionOnly: true,
      initialTab,
      downDistanceText: '3rd & 12 at OPP 30',
      canPunt,
      fieldGoalDistance: 47,
      onSelectSpecialTeams: () => {}
    }));
  const offense = render(false);
  assert.ok(offense.indexOf('3rd &amp; 12 at OPP 30') < offense.indexOf('Choose an Offensive Play'));
  assert.match(offense, /Field Goal \(47 YD\)/);
  assert.match(offense, /<button[^>]*disabled=""[^>]*>.*?Punt/s);
  assert.doesNotMatch(render(true), /disabled=""/);
  const defense = render(false, 'DEFENSE');
  assert.match(defense, /3rd &amp; 12 at OPP 30/);
  assert.doesNotMatch(defense, /Field Goal|>Punt</);
});

test('tutorial playbook can limit cards to passing plays without affecting the normal playbook', () => {
  const markup = renderToStaticMarkup(React.createElement(ProPlaybookCards, {
    onClose: () => {}, selectionOnly: true,
    offensePlayIds: ['PRO_QUICK_SLANTS', 'PRO_MESH', 'PRO_VERTS', 'PRO_DOUBLE_MOVES', 'PRO_SCREEN']
  }));
  assert.match(markup, /Select Mesh Concept/);
  assert.match(markup, /Select Verts/);
  assert.doesNotMatch(markup, /Select Jet Sweep|Select Draw/);
  const specialTeams = renderToStaticMarkup(React.createElement(ProPlaybookCards, {
    onClose: () => {}, selectionOnly: true, specialTeamsOnly: true,
    canPunt: true, fieldGoalDistance: 47, onSelectSpecialTeams: () => {}
  }));
  assert.match(specialTeams, /Choose a Special Teams Play/);
  assert.match(specialTeams, /Punt/);
  assert.match(specialTeams, /Field Goal \(47 YD\)/);
  assert.doesNotMatch(specialTeams, /Select Mesh|Select Quick Slants|disabled=""/);
});

test('Pro mode allows players to pick every defensive scheme with valid counters and descriptions', () => {
  for (const defId of proDefensiveKeys) {
    const def = PRO_DEFENSE_PLAYS[defId as ProDefensePlayId];
    assert.ok(def, `Defense ${defId} must exist in PRO_DEFENSE_PLAYS`);
    assert.ok(def.name && def.scheme && def.description, `Defense ${defId} must have descriptive fields`);
  }
});

test('Pro mode significantly boosts pass catch completion rate across all coverage levels', () => {
  const tightContest = { effectiveDefDist: 20, effectiveBallDist: 20, isTargetSpammed: false, isRbFlatSpammed: false, isRb: false };
  const standardTightChance = getCatchCompletionChance(tightContest);
  const proTightChance = getCatchCompletionChance({ ...tightContest, isProMode: true });

  assert.ok(standardTightChance < 0.40, `Standard tight chance was ${standardTightChance}`);
  assert.ok(proTightChance >= 0.60, `Pro mode tight chance should be >= 0.60, got ${proTightChance}`);
  assert.ok(proTightChance > standardTightChance + 0.20, 'Pro mode provides a meaningful catch boost in tight coverage');

  const openContest = { effectiveDefDist: 60, effectiveBallDist: 60, isTargetSpammed: false, isRbFlatSpammed: false, isRb: false };
  const proOpenChance = getCatchCompletionChance({ ...openContest, isProMode: true });
  assert.ok(proOpenChance >= 0.90 && proOpenChance <= 0.94, `Pro mode open chance should be high but not automatic, got ${proOpenChance}`);

  // Test resolveCatchContestOutcome in Pro mode
  const proOutcome = resolveCatchContestOutcome({ ...tightContest, isProMode: true, roll: 0.50 });
  assert.equal(proOutcome.type, 'COMPLETE');
  assert.equal(proOutcome.caught, true);
  const proDrop = resolveCatchContestOutcome({ ...tightContest, isProMode: true, roll: 0.20 });
  assert.notEqual(proDrop.type, 'COMPLETE');
  assert.equal(proDrop.caught, false);
});

test('User can pick which defender to control before starting the play in Pro mode', () => {
  const listeners = new Map<string, EventListener>();
  const drawingContext = {
    save: () => {}, restore: () => {}, translate: () => {}, scale: () => {},
    clearRect: () => {}, fillRect: () => {}, strokeRect: () => {},
    beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {},
    stroke: () => {}, fill: () => {}, arc: () => {}, bezierCurveTo: () => {},
    quadraticCurveTo: () => {}, ellipse: () => {}, clip: () => {}, roundRect: () => {},
    setLineDash: () => {}, createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }), fillText: () => {},
    measureText: () => ({ width: 40 }), rotate: () => {}
  };
  const canvas = {
    width: 340, height: 450, style: {},
    getContext: () => drawingContext,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 340, height: 450 } as DOMRect),
    addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
    _listeners: listeners
  } as unknown as HTMLCanvasElement;

  let engine: GameEngineHandle | null = null;
  let controlledChangedIndex = -1;
  const cleanup = mountFootballGame(canvas, {
    setP2OffPlayState: () => {}, setP2DefPlayState: () => {},
    setDownDistanceText: () => {}, setActiveOffenseState: () => {},
    setUserScore: () => {}, setCpuScore: () => {}, setP1DefPlayState: () => {},
    setMomentumState: () => {}, setGameClockState: () => {}, showAnnouncement: () => {},
    onEngineReady: value => { engine = value; },
    onControlledDefenderChange: (index) => { controlledChangedIndex = index; }
  });

  try {
    assert.ok(engine);
    const game = engine as GameEngineHandle;
    game.setTacticalMode?.('PRO');
    game.setPossessionForTest?.('P2'); // P1 on defense
    game.selectDefense('PRO_COVER2_HARD_FLAT');

    const defenders = game.getDefenders?.();
    assert.ok(defenders && defenders.length >= 7, 'Must have 7 defenders');

    // Default is defender 0 (DL)
    assert.equal(game.getControlledDefender?.(), defenders[0]);

    // Pick Cornerback #4 (index 3)
    game.selectDefender?.(3);
    assert.equal(game.getControlledDefender?.(), defenders[3]);
    assert.equal(game.getControlledDefenderIndex?.(), 3);
    assert.equal(controlledChangedIndex, 3);

    // Pick Free Safety #7 (index 6)
    game.selectDefender?.(6);
    assert.equal(game.getControlledDefender?.(), defenders[6]);
    assert.equal(game.getControlledDefenderIndex?.(), 6);
    assert.equal(controlledChangedIndex, 6);

    // Cycle defender forward
    const nextIdx = game.cycleControlledDefender?.(1);
    assert.equal(nextIdx, 0);
    assert.equal(game.getControlledDefender?.(), defenders[0]);

    game.selectDefender?.(3);
    game.startDefensePlay?.();
    assert.notEqual(game.phase, 'PRE_SNAP', 'Starting the play should lock the selected defender');
    game.selectDefender?.(6);
    assert.equal(game.cycleControlledDefender?.(1), 3);
    assert.equal(game.getControlledDefenderIndex?.(), 3);
    assert.equal(game.getControlledDefender?.(), defenders[3]);
    assert.equal(controlledChangedIndex, 3);
  } finally {
    cleanup?.();
  }
});

test('Pro hot route on a run call converts it into a passing play', () => {
  const listeners = new Map<string, EventListener>();
  const drawingContext = {
    save: () => {}, restore: () => {}, translate: () => {}, scale: () => {},
    clearRect: () => {}, fillRect: () => {}, strokeRect: () => {},
    beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {},
    stroke: () => {}, fill: () => {}, arc: () => {}, bezierCurveTo: () => {},
    quadraticCurveTo: () => {}, ellipse: () => {}, clip: () => {}, roundRect: () => {},
    setLineDash: () => {}, createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }), fillText: () => {},
    measureText: () => ({ width: 40 }), rotate: () => {}
  };
  const canvas = {
    width: 340, height: 450, style: {},
    getContext: () => drawingContext,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 340, height: 450 } as DOMRect),
    addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
    _listeners: listeners
  } as unknown as HTMLCanvasElement;

  let engine: GameEngineHandle | null = null;
  const cleanup = mountFootballGame(canvas, {
    setP2OffPlayState: () => {}, setP2DefPlayState: () => {},
    setDownDistanceText: () => {}, setActiveOffenseState: () => {},
    setUserScore: () => {}, setCpuScore: () => {}, setP1DefPlayState: () => {},
    setMomentumState: () => {}, setGameClockState: () => {}, showAnnouncement: () => {},
    onEngineReady: value => { engine = value; }
  });

  try {
    assert.ok(engine);
    const game = engine as GameEngineHandle;
    game.setTacticalMode?.('PRO');
    game.setPossessionForTest?.('P1');
    game.selectOffense('PRO_DRAW');

    const receiver = game.getReceiverScreenPositionForTest?.(0);
    assert.ok(receiver, 'The outside receiver should be available for route drawing');
    listeners.get('pointerdown')?.({ clientX: receiver.x, clientY: receiver.y, pointerId: 1 } as PointerEvent);
    listeners.get('pointermove')?.({ clientX: receiver.x + 55, clientY: receiver.y, pointerId: 1 } as PointerEvent);
    listeners.get('pointerup')?.({ clientX: receiver.x + 55, clientY: receiver.y, pointerId: 1 } as PointerEvent);

    assert.notEqual(game.p1OffPlay, 'PRO_DRAW');
    assert.equal(offensivePlaybook[game.p1OffPlay].type, 'PASS');
    assert.equal(game.getReceivers()[0].routeType, 'CROSS-R');

    game.startPlay?.();
    assert.equal(game.phase, 'QB_DROP', 'Converted run call should begin as a passing play');
  } finally {
    cleanup?.();
  }
});
