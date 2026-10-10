import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TEAM_KEYS, TEAMS } from './teams';
import { getTeamDefensePlays, getTeamOffensePlays, getTeamPlaybook, TEAM_PLAYBOOKS } from './teamPlaybooks';
import { allDefensivePlaybook, offensivePlaybook, eliteOffensiveKeys, eliteDefensiveKeys, proOffensiveKeys, proDefensiveKeys, allRoutes } from './playbook';
import { ProPlaybookCards } from './ProPlaybookCards';
import { mountFootballGame, type GameEngineHandle } from './engine';
import { alignDefenders } from './defense';
import type { Entity, TacticalMode } from './types';
import { SIGNATURE_PLAYS, signatureOffenseIds, signatureDefenseIds } from './signaturePlays';
import { PRO_OFFENSE_PLAYS, PRO_DEFENSE_PLAYS, evaluateProMatchup } from './proMode';
import { chooseProDefensiveCall } from './ai';
import { evaluateTecmoMatchup, getTecmoPlaysForTeam } from './tecmoPlaybook';

test('each team gains exactly two exclusive executable calls per side in both modes', () => {
  const priorCounts: Record<string, readonly [number, number, number, number]> = {
    ALABAMA: [5, 3, 4, 4], ARKANSAS: [4, 2, 3, 3], AUBURN: [4, 3, 4, 3], FLORIDA: [4, 3, 4, 3],
    GEORGIA: [5, 3, 4, 4], KENTUCKY: [4, 3, 3, 3], LSU: [5, 3, 5, 3], MISSISSIPPI_STATE: [4, 3, 4, 3],
    MISSOURI: [5, 3, 4, 3], OKLAHOMA: [5, 3, 4, 3], OLE_MISS: [4, 3, 5, 3], SOUTH_CAROLINA: [4, 3, 4, 3],
    TENNESSEE: [5, 3, 4, 3], TEXAS: [5, 3, 5, 3], TEXAS_AM: [4, 3, 3, 3], VANDERBILT: [4, 3, 3, 4]
  };
  assert.deepEqual(Object.keys(SIGNATURE_PLAYS).sort(), [...TEAM_KEYS].sort());
  const offenseSignatures = new Set<string>();
  const defenseSignatures = new Set<string>();
  const names = new Set<string>();
  for (const teamId of TEAM_KEYS) {
    const book = getTeamPlaybook(teamId);
    assert.deepEqual([book.eliteOffense.length, book.eliteDefense.length, book.proOffense.length, book.proDefense.length],
      priorCounts[teamId].map(count => count + 2), teamId);
    for (const mode of ['ELITE', 'PRO'] as const) {
      const prefix = mode === 'PRO' ? 'PRO_' : '';
      for (const id of signatureOffenseIds(teamId)) {
        const key = `${prefix}${id}`;
        assert.ok(getTeamOffensePlays(teamId, mode).includes(key));
        const play = offensivePlaybook[key];
        for (const route of [play.left, play.right, play.center, play.slot]) assert.ok(route && allRoutes.includes(route), `${key}: ${route}`);
        for (const opponentId of TEAM_KEYS.filter(id => id !== teamId)) {
          assert.ok(!getTeamOffensePlays(opponentId, mode).includes(key), key);
        }
      }
      for (const id of signatureDefenseIds(teamId)) {
        const key = `${prefix}${id}`;
        assert.ok(getTeamDefensePlays(teamId, mode).includes(key));
        assert.equal(allDefensivePlaybook[key].landmarks?.length, 7, key);
        for (const opponentId of TEAM_KEYS.filter(id => id !== teamId)) {
          assert.ok(!getTeamDefensePlays(opponentId, mode).includes(key), key);
        }
      }
    }
    for (const play of SIGNATURE_PLAYS[teamId].offense) {
      const signature = JSON.stringify([play.type, play.alignment, play.left, play.right, play.center, play.slot]);
      assert.ok(!offenseSignatures.has(signature), `${teamId}: renamed offense duplicate`);
      offenseSignatures.add(signature);
      assert.ok(!names.has(play.name));
      names.add(play.name);
    }
    for (const defense of SIGNATURE_PLAYS[teamId].defense) {
      const signature = JSON.stringify(defense.landmarks);
      assert.ok(!defenseSignatures.has(signature), `${teamId}: renamed defense duplicate`);
      defenseSignatures.add(signature);
      assert.ok(defense.weakness && defense.desc);
      assert.ok(!names.has(defense.name));
      names.add(defense.name);
    }
  }
  assert.equal(offenseSignatures.size, 32);
  assert.equal(defenseSignatures.size, 32);
});

test('signature defensive landmarks and man assignments execute in both directions and modes', () => {
  for (const teamId of TEAM_KEYS) {
    for (const mode of ['ELITE', 'PRO'] as const) {
      for (const direction of [-1, 1]) {
        for (const id of signatureDefenseIds(teamId)) {
          const key = mode === 'PRO' ? `PRO_${id}` : id;
          const landmarks = allDefensivePlaybook[key].landmarks;
          assert.ok(landmarks);
          const receivers: Entity[] = [45, 115, 295].map(x => ({ x, y: 500, radius: 10, routeType: 'GO' }));
          const center: Entity = { x: 225, y: 500, radius: 10, routeType: 'HITCH' };
          const defenders: Entity[] = Array.from({ length: 7 }, () => ({ x: 170, y: 500, radius: 10 }));
          alignDefenders(defenders, key, direction, 500, receivers, center);
          const manTargets = new Set<Entity>();
          defenders.forEach((defender, index) => {
            const landmark = landmarks[index];
            assert.equal(defender.passRusher, landmark.assignment === 'BLITZ', key);
            assert.ok((defender.y - 500) * direction >= 16, `${key} crossed LOS`);
            assert.ok(defender.x >= 10 && defender.x <= 330, key);
            if (landmark.assignment === 'MAN') {
              assert.ok(defender.assignedReceiver, key);
              manTargets.add(defender.assignedReceiver);
            } else {
              assert.equal(defender.x, landmark.x, key);
              assert.equal(defender.y, 500 + landmark.depth * direction, key);
              assert.equal(defender.zoneY, 500 + landmark.zoneDepth * direction, key);
            }
          });
          assert.equal(manTargets.size, landmarks.filter(landmark => landmark.assignment === 'MAN').length, key);
        }
      }
    }
  }
});

test('all expanded Pro matchups are complete and new plays have functional exact counters', () => {
  for (const offense of Object.values(PRO_OFFENSE_PLAYS)) {
    for (const defense of Object.values(PRO_DEFENSE_PLAYS)) {
      assert.ok(offense.matchups[defense.id], `${offense.id} vs ${defense.id}`);
      const result = evaluateProMatchup(offense.id, defense.id, 0.5);
      assert.equal(result.isExactCounter, defense.exactCounterAgainst.includes(offense.id));
      assert.ok(result.summaryText.includes(offense.name));
    }
    const counter = evaluateProMatchup(offense.id, offense.counterDefenseId, 0.5);
    assert.equal(counter.isExactCounter, true, offense.id);
  }
});

test('CPU reads new deep, screen and power-run tendencies and rotates away from signature all-out pressure', () => {
  const situation = { down: 1, yardsToGo: 10, previousCall: 'PRO_TAMPA2' };
  const repeated = (play: string) => [{ play }, { play }];
  assert.equal(chooseProDefensiveCall({ ...situation, recentPlays: repeated('PRO_TEAM_LSU_O1') }, () => 0.1), 'PRO_COVER4_QUARTERS');
  assert.equal(chooseProDefensiveCall({ ...situation, recentPlays: repeated('PRO_TEAM_ARKANSAS_O1') }, () => 0.1), 'PRO_RUN_STOP_BOX');
  assert.equal(chooseProDefensiveCall({ ...situation, recentPlays: repeated('PRO_TEAM_OLE_MISS_O2') }, () => 0.1), 'PRO_BLITZ_ZERO');
  assert.equal(chooseProDefensiveCall({
    ...situation, previousCall: 'PRO_TEAM_AUBURN_D2', recentPlays: []
  }, () => 0.1), 'PRO_TAMPA2');
});

test('every team has distinct restricted offense and defense in each mode', () => {
  assert.deepEqual(Object.keys(TEAM_PLAYBOOKS).sort(), [...TEAM_KEYS].sort());
  for (const mode of ['ELITE', 'PRO'] as const) {
    const offenseSets = new Set<string>();
    const defenseSets = new Set<string>();
    for (const id of TEAM_KEYS) {
      const offense = getTeamOffensePlays(id, mode);
      const defense = getTeamDefensePlays(id, mode);
      const fullOffense = mode === 'PRO' ? proOffensiveKeys : eliteOffensiveKeys;
      const fullDefense = mode === 'PRO' ? proDefensiveKeys : eliteDefensiveKeys;
      assert.ok(offense.length >= 3 && offense.length < fullOffense.length, id);
      assert.ok(defense.length >= 2 && defense.length < fullDefense.length, id);
      assert.equal(new Set(offense).size, offense.length, id);
      assert.equal(new Set(defense).size, defense.length, id);
      for (const play of offense) assert.ok(fullOffense.includes(play) && offensivePlaybook[play], `${id}: ${play}`);
      for (const play of defense) assert.ok(fullDefense.includes(play) && allDefensivePlaybook[play], `${id}: ${play}`);
      assert.ok(offense.some(key => offensivePlaybook[key].type === 'PASS'));
      const offenseSignature = [...offense].sort().join(',');
      const defenseSignature = [...defense].sort().join(',');
      assert.ok(!offenseSets.has(offenseSignature), `${mode} ${id} duplicates another team's offense`);
      assert.ok(!defenseSets.has(defenseSignature), `${mode} ${id} duplicates another team's defense`);
      offenseSets.add(offenseSignature);
      defenseSets.add(defenseSignature);
    }
  }
  assert.throws(() => getTeamPlaybook('MISSING'), /No playbook configured/);
});

test('playbook packages reflect roster strengths and leave exploitable weaknesses', () => {
  assert.ok(getTeamOffensePlays('ARKANSAS', 'ELITE').includes('POWER'));
  assert.ok(!getTeamOffensePlays('ARKANSAS', 'PRO').includes('PRO_VERTS'));
  assert.ok(getTeamOffensePlays('FLORIDA', 'PRO').includes('PRO_JET_SWEEP'));
  assert.ok(!getTeamOffensePlays('FLORIDA', 'ELITE').includes('POWER'));
  assert.ok(getTeamDefensePlays('AUBURN', 'PRO').includes('PRO_BLITZ_ZERO'));
  assert.ok(!getTeamDefensePlays('AUBURN', 'PRO').includes('PRO_COVER4_QUARTERS'));
  assert.ok(getTeamDefensePlays('GEORGIA', 'PRO').includes('PRO_RUN_STOP_BOX'));
  assert.ok(!getTeamDefensePlays('VANDERBILT', 'PRO').includes('PRO_BLITZ_ZERO'));
});

test('team Pro cards show only legal offense and defense with scouting identity', () => {
  for (const teamId of TEAM_KEYS) {
    const team = TEAMS[teamId];
    const playbook = getTeamPlaybook(teamId);
    for (const tab of ['OFFENSE', 'DEFENSE'] as const) {
      const html = renderToStaticMarkup(React.createElement(ProPlaybookCards, {
        onClose() {}, selectionOnly: true, initialTab: tab, teamName: team.name,
        offenseIdentity: playbook.offenseIdentity, defenseIdentity: playbook.defenseIdentity,
        offensePlayIds: playbook.proOffense, defensePlayIds: playbook.proDefense
      }));
      const selectionCount = (html.match(/aria-label="Select /g) ?? []).length;
      assert.equal(selectionCount, tab === 'OFFENSE' ? playbook.proOffense.length : playbook.proDefense.length);
      assert.ok(html.includes(`${team.name.replace(/&/g, '&amp;')} playbook`));
      for (const definition of tab === 'OFFENSE' ? SIGNATURE_PLAYS[teamId].offense : SIGNATURE_PLAYS[teamId].defense) {
        assert.ok(html.includes(`aria-label="Select ${definition.name}"`), definition.name);
        assert.ok(html.includes(`aria-label="${definition.name} ${tab === 'OFFENSE' ? 'routes' : 'scheme'}"`), definition.name);
      }
    }
  }
});

function canvas(): HTMLCanvasElement {
  return {
    width: 340, height: 450, style: {},
    getContext: () => ({ scale() {} }),
    addEventListener() {}, removeEventListener() {}
  } as unknown as HTMLCanvasElement;
}

test('CPU keeps Tecmo defensive calls in the opposing six-play book across down transitions', () => {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  const holder: { game?: GameEngineHandle } = {};
  const cleanup = mountFootballGame(canvas(), {
    setP2OffPlayState() {}, setP2DefPlayState() {}, setDownDistanceText() {},
    setActiveOffenseState() {}, setUserScore() {}, setCpuScore() {},
    setP1DefPlayState() {}, setMomentumState() {}, setGameClockState() {}, showAnnouncement() {},
    onEngineReady: game => { holder.game = game ?? undefined; }
  });
  try {
    const game = holder.game;
    assert.ok(game);
    game.selectP1Team('ALABAMA');
    game.selectP2Team('FLORIDA');
    game.setPossessionForTest?.('P1');
    game.resetDrill();
    game.selectOffense('BAMA_R1');

    const defensiveCalls = getTecmoPlaysForTeam('ALABAMA').map(play => play.id);
    assert.ok(defensiveCalls.includes(game.p2DefPlay));
    assert.ok(game.triggerPlayEnd);
    game.triggerPlayEnd(900, 'TACKLE');
    assert.equal(game.activeOffense, 'P1');
    assert.ok(defensiveCalls.includes(game.p2DefPlay), 'The CPU must keep defending with a guessed Tecmo call after a down ends');

    const runAgainstPass = evaluateTecmoMatchup('BAMA_R1', 'BAMA_P1', offensivePlaybook);
    assert.equal(runAgainstPass.level, 'MISMATCH_DROPPED_IN_COVERAGE');
    assert.equal(runAgainstPass.runLaneSpacing, 1.8);
    assert.equal(runAgainstPass.runRecognitionFrames, 30);

    const passAgainstRun = evaluateTecmoMatchup('BAMA_P1', 'BAMA_R1', offensivePlaybook);
    assert.equal(passAgainstRun.level, 'MISMATCH_BIT_ON_RUN');
    assert.equal(passAgainstRun.freezeDefenseFrames, 45);
    assert.equal(passAgainstRun.runRecognitionFrames, undefined);
  } finally {
    cleanup?.();
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});

test('CPU actually selects both new plays and schemes for every team in both modes', () => {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const originalRandom = Math.random;
  let seed = 24119;
  Math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  const holder: { game?: GameEngineHandle } = {};
  const cleanup = mountFootballGame(canvas(), {
    setP2OffPlayState() {}, setP2DefPlayState() {}, setDownDistanceText() {},
    setActiveOffenseState() {}, setUserScore() {}, setCpuScore() {},
    setP1DefPlayState() {}, setMomentumState() {}, setGameClockState() {}, showAnnouncement() {},
    onEngineReady: game => { holder.game = game ?? undefined; }
  });
  try {
    const game = holder.game;
    assert.ok(game);
    for (const mode of ['ELITE', 'PRO'] as const) {
      game.setTacticalMode?.(mode);
      for (const teamId of TEAM_KEYS) {
        game.selectP2Team(teamId);
        const seenOffense = new Set<string>();
        const seenDefense = new Set<string>();
        const isHeavy = (key: string) => key === 'PRO_BLITZ_ZERO' || key === 'PRO_RUN_STOP_BOX' ||
          (allDefensivePlaybook[key].landmarks?.filter(landmark => landmark.assignment === 'BLITZ').length ?? 0) >= 3;
        for (let trial = 0; trial < 200; trial++) {
          game.setPossessionForTest?.('P2');
          game.resetDrill();
          seenOffense.add(game.p2OffPlay);
          game.setPossessionForTest?.('P1');
          const previousDefense: string = game.p2DefPlay;
          game.resetDrill();
          seenDefense.add(game.p2DefPlay);
          if (mode === 'PRO' && isHeavy(previousDefense)) {
            assert.ok(!isHeavy(game.p2DefPlay), `${teamId}: repeated all-out pressure`);
          }
        }
        const prefix = mode === 'PRO' ? 'PRO_' : '';
        for (const key of signatureOffenseIds(teamId)) assert.ok(seenOffense.has(`${prefix}${key}`), `${mode}: CPU never selected ${key}`);
        for (const key of signatureDefenseIds(teamId)) assert.ok(seenDefense.has(`${prefix}${key}`), `${mode}: CPU never selected ${key}`);
      }
    }
  } finally {
    cleanup?.();
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
    Math.random = originalRandom;
  }
});

test('engine restrictions apply to user selection, cycling, CPU calls and team changes', () => {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  const holder: { game?: GameEngineHandle } = {};
  const announcements: string[] = [];
  const cleanup = mountFootballGame(canvas(), {
    setP2OffPlayState() {}, setP2DefPlayState() {}, setDownDistanceText() {},
    setActiveOffenseState() {}, setUserScore() {}, setCpuScore() {},
    setP1DefPlayState() {}, setMomentumState() {}, setGameClockState() {},
    showAnnouncement: text => { announcements.push(text); },
    onEngineReady: game => { holder.game = game ?? undefined; }
  });
  try {
    const game = holder.game;
    assert.ok(game);
    for (const mode of ['ELITE', 'PRO'] as const) {
      game.setTacticalMode?.(mode);
      for (const teamId of TEAM_KEYS) {
        game.selectP1Team(teamId);
        game.selectP2Team(teamId);
        const offense = getTeamOffensePlays(teamId, mode);
        const defense = getTeamDefensePlays(teamId, mode);
        game.setPossessionForTest?.('P1');
        game.resetDrill();
        for (const key of offense) {
          game.selectOffense(key);
          assert.equal(game.p1OffPlay, key, `${mode}: ${teamId}: ${key}`);
          if (key.includes('TEAM_')) {
            const play = offensivePlaybook[key];
            assert.deepEqual(game.getReceivers().map(receiver => receiver.routeType), [play.left, play.slot, play.right], key);
            game.startPlay?.();
            assert.equal(game.phase, play.type === 'PASS' ? 'QB_DROP' : 'HANDOFF', key);
            game.resetDrill();
          }
        }
        const blockedOffense = (mode === 'PRO' ? proOffensiveKeys : eliteOffensiveKeys).find(key => !offense.includes(key));
        assert.ok(blockedOffense);
        const selectedOffense: string = game.p1OffPlay;
        game.selectOffense(blockedOffense);
        assert.equal(game.p1OffPlay, selectedOffense);
        assert.match(announcements.at(-1) ?? '', /NOT IN TEAM PLAYBOOK/);
        for (let cycle = 0; cycle < offense.length + 2; cycle++) {
          game.shiftFormation?.(1);
          assert.ok(offense.includes(game.p1OffPlay));
          assert.ok(defense.includes(game.p2DefPlay));
        }
        game.setPossessionForTest?.('P2');
        game.resetDrill();
        for (const key of defense) {
          game.selectDefense(key);
          assert.equal(game.p1DefPlay, key);
          assert.ok(offense.includes(game.p2OffPlay));
        }
        const blockedDefense = (mode === 'PRO' ? proDefensiveKeys : eliteDefensiveKeys).find(key => !defense.includes(key));
        assert.ok(blockedDefense);
        const selectedDefense: string = game.p1DefPlay;
        game.selectDefense(blockedDefense);
        assert.equal(game.p1DefPlay, selectedDefense);
        assert.match(announcements.at(-1) ?? '', /NOT IN TEAM PLAYBOOK/);
        for (let cycle = 0; cycle < defense.length + 2; cycle++) {
          game.shiftFormation?.(-1);
          assert.ok(defense.includes(game.p1DefPlay));
          assert.ok(offense.includes(game.p2OffPlay));
        }
        game.startDefensePlay?.();
        assert.ok(offense.includes(game.p2OffPlay), 'CPU audible must stay in team playbook');
        game.setPossessionForTest?.('P1');
        game.resetDrill();
        game.selectOffense(getTeamOffensePlays(game.p1Team.id, mode)[0]);
        game.set4thDownForTest?.();
        game.callPunt();
        assert.equal(game.p1OffPlay, 'PUNT');
        game.selectOffense(offense[0]);
        game.callFieldGoal();
        assert.equal(game.p1OffPlay, 'FIELD_GOAL');
      }
      game.setPossessionForTest?.('P1');
      game.resetDrill();
      const otherMode = mode === 'ELITE' ? 'PRO' : 'ELITE';
      game.setTacticalMode?.(otherMode);
      assert.ok(getTeamOffensePlays(game.p1Team.id, otherMode).includes(game.p1OffPlay));
      assert.ok(getTeamDefensePlays(game.p1Team.id, otherMode).includes(game.p1DefPlay));
      assert.ok(getTeamOffensePlays(game.p2Team.id, otherMode).includes(game.p2OffPlay));
      assert.ok(getTeamDefensePlays(game.p2Team.id, otherMode).includes(game.p2DefPlay));
    }
  } finally {
    cleanup?.();
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});

test('saved sessions restore their mode, migrate unavailable pre-snap calls and preserve live plays', () => {
  const originalWindow = globalThis.window;
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  const storage = new Map<string, string>();
  const key = 'backyard-football-game-session-v1';
  globalThis.window = {
    innerWidth: 350, innerHeight: 695,
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    },
    addEventListener() {}, removeEventListener() {}
  } as unknown as Window & typeof globalThis;
  let cleanup: (() => void) | undefined;
  const holder: { game?: GameEngineHandle } = {};
  let restoredMode: TacticalMode | undefined;
  const announcements: string[] = [];
  const mount = () => {
    cleanup = mountFootballGame(canvas(), {
      setP2OffPlayState() {}, setP2DefPlayState() {}, setDownDistanceText() {},
      setActiveOffenseState() {}, setUserScore() {}, setCpuScore() {},
      setP1DefPlayState() {}, setMomentumState() {}, setGameClockState() {},
      setTacticalModeState: mode => { restoredMode = mode; },
      showAnnouncement: text => { announcements.push(text); },
      onEngineReady: game => {
        holder.game = game ?? undefined;
        game?.setTacticalMode?.('PRO');
      }
    });
    assert.ok(holder.game);
    return holder.game;
  };
  try {
    for (const mode of ['ELITE', 'PRO'] as const) {
      for (const legacy of [false, true]) {
        storage.clear();
        const game = mount();
        game.setTacticalMode?.(mode);
        game.selectP1Team('FLORIDA');
        game.selectP2Team('FLORIDA');
        game.resetGame();
        game.setPossessionForTest?.('P1');
        game.resetDrill();
        game.setPaused(true);
        const raw = storage.get(key);
        assert.ok(raw);
        const snapshot = JSON.parse(raw) as {
          tacticalMode?: TacticalMode;
          p1OffPlay: string; p2OffPlay: string;
          p1DefPlay: string; p2DefPlay: string; phase: string;
          entities: Record<string, { data: Entity }>;
        };
        assert.equal(snapshot.tacticalMode, mode);
        if (legacy) delete snapshot.tacticalMode;
        snapshot.p1OffPlay = mode === 'PRO' ? 'PRO_DRAW' : 'POWER';
        snapshot.p2OffPlay = snapshot.p1OffPlay;
        snapshot.p1DefPlay = mode === 'PRO' ? 'PRO_RUN_STOP_BOX' : 'ZONE34';
        snapshot.p2DefPlay = snapshot.p1DefPlay;
        cleanup?.();
        storage.set(key, JSON.stringify(snapshot));
        const resumed = mount();
        assert.equal(resumed.getTacticalMode?.(), mode);
        assert.equal(restoredMode, mode);
        assert.equal(resumed.phase, 'PRE_SNAP');
        assert.ok(getTeamOffensePlays('FLORIDA', mode).includes(resumed.p1OffPlay));
        assert.ok(getTeamDefensePlays('FLORIDA', mode).includes(resumed.p1DefPlay));
        assert.ok(getTeamOffensePlays('FLORIDA', mode).includes(resumed.p2OffPlay));
        assert.ok(getTeamDefensePlays('FLORIDA', mode).includes(resumed.p2DefPlay));
        assert.ok(announcements.includes('TEAM PLAYBOOK UPDATED - CHOOSE YOUR NEXT CALL'));
        cleanup?.();

        snapshot.phase = 'RUNNING';
        snapshot.entities.qb.data.x = 133;
        storage.set(key, JSON.stringify(snapshot));
        const live = mount();
        assert.equal(live.getTacticalMode?.(), mode);
        assert.equal(live.phase, 'RUNNING');
        assert.equal(live.p1OffPlay, snapshot.p1OffPlay, 'finish an already-started legacy play');
        assert.equal(live.p1DefPlay, snapshot.p1DefPlay);
        live.resetDrill();
        assert.ok(getTeamOffensePlays('FLORIDA', mode).includes(live.p1OffPlay));
        assert.ok(getTeamDefensePlays('FLORIDA', mode).includes(live.p1DefPlay));
        cleanup?.();
        cleanup = undefined;
      }
    }
  } finally {
    cleanup?.();
    if (originalWindow === undefined) Reflect.deleteProperty(globalThis, 'window');
    else globalThis.window = originalWindow;
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});

test('filtered full playbook handles stale selections and empty special-teams-only offense', () => {
  const playbook = getTeamPlaybook('ARKANSAS');
  for (const initialTab of ['OFFENSE', 'DEFENSE', 'MATRIX'] as const) {
    const html = renderToStaticMarkup(React.createElement(ProPlaybookCards, {
      onClose() {}, initialTab, activeOffensePlay: 'PRO_VERTS', activeDefensePlay: 'PRO_COVER4_QUARTERS',
      offensePlayIds: playbook.proOffense, defensePlayIds: playbook.proDefense
    }));
    assert.ok(html.includes(`Offensive Playbook (${playbook.proOffense.length})`));
    assert.ok(html.includes(`Defensive Schemes (${playbook.proDefense.length})`));
  }
  const specialTeamsHtml = renderToStaticMarkup(React.createElement(ProPlaybookCards, {
    onClose() {}, specialTeamsOnly: true, onSelectSpecialTeams() {}
  }));
  assert.ok(specialTeamsHtml.includes('Field Goal'));
});

test('Elite man-free and deep-thirds shells use the existing complete coverage assignments', () => {
  for (const [elite, pro] of [['MAN_FREE', 'PRO_COVER1_MAN'], ['DEEP_THIRDS', 'PRO_COVER3_DEEP']]) {
    const receivers: Entity[] = [50, 170, 290].map(x => ({ x, y: 500, radius: 10 }));
    const makeDefense = () => Array.from({ length: 7 }, (): Entity => ({ x: 170, y: 500, radius: 10 }));
    const eliteDefense = makeDefense();
    const proDefense = makeDefense();
    alignDefenders(eliteDefense, elite, 1, 500, receivers, null);
    alignDefenders(proDefense, pro, 1, 500, receivers, null);
    assert.deepEqual(eliteDefense, proDefense);
  }
});
