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
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProPlaybookCards } from './ProPlaybookCards';

test('Pro Mode 7-on-7 Playbooks contain exactly 7 offensive and 7 defensive plays', () => {
  const offKeys = Object.keys(PRO_OFFENSE_PLAYS) as ProOffensePlayId[];
  const defKeys = Object.keys(PRO_DEFENSE_PLAYS) as ProDefensePlayId[];

  assert.equal(offKeys.length, 7, 'Offensive playbook must have 7 plays');
  assert.equal(defKeys.length, 7, 'Defensive playbook must have 7 plays');

  assert.deepEqual(offKeys, [
    'PRO_QUICK_SLANTS',
    'PRO_MESH',
    'PRO_VERTS',
    'PRO_DOUBLE_MOVES',
    'PRO_SCREEN',
    'PRO_JET_SWEEP',
    'PRO_DRAW'
  ]);

  assert.deepEqual(defKeys, [
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
  assert.equal(eliteOffensiveKeys.length, 9);
  assert.equal(eliteDefensiveKeys.length, 4);
  assert.equal(proOffensiveKeys.length, 7);
  assert.equal(proDefensiveKeys.length, 7);
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
