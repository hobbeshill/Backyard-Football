import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { mountFootballGame, type GameEngineHandle } from './engine';
import { isLiveBallAnnouncement, shouldShowAnnouncement } from './announcements';
import { chooseAvailableDefensiveCounter, chooseProDefensiveCall, chooseTeamOffensivePlay, getRepeatedOffensivePlay, getSuccessfulPlayCounter } from './ai';
import { PRO_OFFENSE_PLAYS } from './proMode';
import { TEAMS } from './teams';
import { getInterceptionTouchbackY } from './rules';

function createGame(context: TestContext) {
  let frame: FrameRequestCallback | undefined;
  context.mock.method(globalThis, 'requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; });
  context.mock.method(globalThis, 'cancelAnimationFrame', () => {});
  const drawing = new Proxy({
    measureText: () => ({ width: 40 }),
    canvas: { width: 450, height: 340 },
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} })
  }, { get: (target, key) => Reflect.get(target, key) ?? (() => {}) });
  const canvas = {
    width: 450, height: 340,
    getContext: () => drawing,
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 450, height: 340 })
  } as unknown as HTMLCanvasElement;
  const announcements: Array<{ text: string; big?: boolean; meta?: { category?: string; durationMs?: number; possessionTeam?: string; subtext?: string } }> = [];
  const holder: { game?: GameEngineHandle } = {};
  const cleanup = mountFootballGame(canvas, {
    setP2OffPlayState() {}, setP2DefPlayState() {}, setDownDistanceText() {},
    setActiveOffenseState() {}, setUserScore() {}, setCpuScore() {},
    setP1DefPlayState() {}, setMomentumState() {}, setGameClockState() {},
    showAnnouncement: (text, _color, big, meta) => announcements.push({ text, big, meta }),
    onEngineReady: game => { holder.game = game ?? undefined; }
  });
  context.after(() => cleanup?.());
  assert.ok(holder.game);
  let timestamp = 0;
  return {
    game: holder.game,
    announcements,
    advance() {
      assert.ok(frame);
      frame(timestamp);
      timestamp += 1000 / 60;
    }
  };
}

// Node has no animation frame API; install placeholders for the per-test mocks.
globalThis.requestAnimationFrame ??= () => 1;
globalThis.cancelAnimationFrame ??= () => {};

test('all modes preserve fractional dead-ball spots through the next formation and snap', context => {
  const { game } = createGame(context);
  for (const mode of ['PRO', 'ELITE'] as const) {
    game.setTacticalMode?.(mode);
    for (const side of ['P1', 'P2'] as const) {
      for (const result of ['TACKLE', 'SACK', 'OUT_OF_BOUNDS', 'COMPLETE', 'CATCH']) {
        game.setPossessionForTest?.(side);
        game.resetDrill();
        const before = game.getNetworkSnapshot!();
        // Exercise Tecmo's exact and run/pass mismatch handling as well.
        if (mode === 'ELITE') {
          before.p1OffPlay = 'BAMA_R1';
          before.p2OffPlay = 'BAMA_R1';
          before.p1DefPlay = 'BAMA_R1';
          before.p2DefPlay = 'BAMA_R1';
          game.applyNetworkSnapshot!(before);
          game.startPlay?.();
        }
        const endingY = before.lineOfScrimmageY + 37.625 * game.attackDirection;
        game.triggerPlayEnd?.(endingY, result);
        assert.equal(game.getNetworkSnapshot!().lineOfScrimmageY, endingY, `${mode} ${side} ${result}`);
        game.resetDrill();
        assert.equal(game.getNetworkSnapshot!().lineOfScrimmageY, endingY);
        game.startPlay?.();
        assert.equal(game.getNetworkSnapshot!().lineOfScrimmageY, endingY);
      }
    }
  }
});

test('snap near the goal line retains the clamped pre-snap camera position', context => {
  const { game } = createGame(context);
  game.setPossessionForTest?.('P1');
  game.resetDrill();
  const snapshot = game.getNetworkSnapshot!();
  snapshot.lineOfScrimmageY = 130;
  snapshot.firstDownMarkerY = 30;
  snapshot.attackDirection = -1;
  snapshot.currentDown = 1;
  snapshot.yardsToGo = 10;
  game.applyNetworkSnapshot!(snapshot);
  game.resetDrill();

  const beforeSnap = game.getNetworkSnapshot!();
  game.startPlay?.();
  const afterSnap = game.getNetworkSnapshot!();
  assert.equal(afterSnap.phase, 'QB_DROP');
  assert.equal(afterSnap.cameraY, beforeSnap.cameraY);
  assert.equal(afterSnap.playSnapCameraY, beforeSnap.cameraY);
});

test('incompletions keep the previous spot, record zero yards and cannot score at the target', context => {
  const { game } = createGame(context);
  for (const side of ['P1', 'P2'] as const) {
    for (const result of ['INCOMPLETE', 'DEFLECT', 'BATTED_DOWN', 'BROKEN_UP']) {
      game.setPossessionForTest?.(side);
      game.resetDrill();
      const before = game.getNetworkSnapshot!();
      game.triggerPlayEnd?.(side === 'P1' ? 50 : 1150, result);
      const after = game.getNetworkSnapshot!();
      assert.equal(after.lineOfScrimmageY, before.lineOfScrimmageY);
      assert.equal(after.currentDown, 2);
      assert.equal(after.p1Score, 0);
      assert.equal(after.p2Score, 0);
      assert.equal((side === 'P1' ? after.userPlayHistory : after.cpuPlayHistory).at(-1).yardsGained, 0);
    }
  }
});

test('Tecmo run/pass mismatches do not manufacture gains at the end of a play', context => {
  const { game } = createGame(context);
  game.setPossessionForTest?.('P1');
  game.resetDrill();
  const snapshot = game.getNetworkSnapshot!();
  snapshot.p1TeamId = 'ALABAMA';
  snapshot.p1OffPlay = 'BAMA_R1';
  snapshot.p2DefPlay = 'BAMA_P1';
  game.applyNetworkSnapshot!(snapshot);
  game.startPlay?.();
  const endingY = snapshot.lineOfScrimmageY - 21.125;
  game.triggerPlayEnd?.(endingY, 'TACKLE');
  game.resetDrill();
  assert.equal(game.getNetworkSnapshot!().lineOfScrimmageY, endingY);
});

test('turnover on downs changes direction without changing the spot and announces possession', context => {
  const { game, announcements } = createGame(context);
  for (const side of ['P1', 'P2'] as const) {
    game.setPossessionForTest?.(side);
    game.resetDrill();
    game.set4thDownForTest?.();
    const direction = game.attackDirection;
    const endingY = game.getNetworkSnapshot!().lineOfScrimmageY + 31.25 * direction;
    announcements.length = 0;
    game.triggerPlayEnd?.(endingY, 'TACKLE');
    const turnover = announcements.find(entry => entry.meta?.category === 'TURNOVER');
    assert.ok(turnover);
    assert.match(turnover.text, /TURNOVER ON DOWNS/);
    assert.equal(turnover.meta?.possessionTeam, side === 'P1' ? 'P2' : 'P1');
    assert.ok((turnover.meta?.durationMs ?? 0) >= 5000);
    assert.match(turnover.meta?.subtext ?? '', /POSSESSION/);
    assert.equal(game.attackDirection, -direction);
    game.resetDrill();
    assert.equal(game.getNetworkSnapshot!().lineOfScrimmageY, endingY);
  }
});

test('returns end at the actual spot without consuming downs or polluting offensive tendencies', context => {
  const { game, announcements } = createGame(context);
  for (const side of ['P1', 'P2'] as const) {
    for (const returnType of ['INT', 'KICKOFF', 'PUNT']) {
      game.setPossessionForTest?.(side);
      game.resetDrill();
      const before = game.getNetworkSnapshot!();
      before.isInterceptionReturn = returnType === 'INT';
      before.isSpecialTeamsReturn = returnType !== 'INT';
      before.specialTeamsReturnType = returnType === 'INT' ? null : returnType;
      game.applyNetworkSnapshot!(before);
      const endingY = before.lineOfScrimmageY + 143.625 * game.attackDirection;
      announcements.length = 0;
      game.triggerPlayEnd?.(endingY, 'OUT_OF_BOUNDS');
      const after = game.getNetworkSnapshot!();
      assert.equal(after.currentDown, 1);
      assert.equal(after.yardsToGo, 10);
      assert.equal(after.activeOffense, side);
      assert.equal(after.userPlayHistory.length, before.userPlayHistory.length);
      assert.equal(after.cpuPlayHistory.length, before.cpuPlayHistory.length);
      game.flushPostPlayAnnouncement?.();
      assert.equal(announcements.length, 0, 'A return is not an offensive first down');
      game.resetDrill();
      assert.equal(game.getNetworkSnapshot!().lineOfScrimmageY, endingY);
    }
  }
});

test('defensive fumble recoveries announce turnovers and preserve the recovery spot in both directions', context => {
  const { game, announcements, advance } = createGame(context);
  advance();
  for (const side of ['P1', 'P2'] as const) {
    for (const isReturn of [false, true]) {
      game.setPossessionForTest?.(side);
      game.resetDrill();
      const snapshot = game.getNetworkSnapshot!();
      const endingY = 612.375;
      for (const record of Object.values(snapshot.entities) as Array<{ data: { x: number; y: number } }>) {
        record.data.x = 40;
        record.data.y = 300;
      }
      const recoveryId = isReturn ? 'qb' : snapshot.defenderIds[0];
      snapshot.entities[recoveryId].data.x = 170;
      snapshot.entities[recoveryId].data.y = endingY;
      snapshot.phase = 'FUMBLE';
      snapshot.isInterceptionReturn = isReturn;
      snapshot.fumbleBall = { x: 170, y: endingY, z: 0, vx: 0, vy: 0, timer: 12, fumblingTeam: side };
      snapshot.formationTransitions = [];
      snapshot.playEnding = false;
      game.applyNetworkSnapshot!(snapshot);
      announcements.length = 0;
      advance();
      const after = game.getNetworkSnapshot!();
      assert.equal(after.activeOffense, side === 'P1' ? 'P2' : 'P1');
      assert.equal(after.lineOfScrimmageY, endingY);
      assert.equal(after.isInterceptionReturn, false);
      const turnover = announcements.find(entry => entry.meta?.category === 'TURNOVER');
      assert.ok(turnover);
      assert.match(turnover.text, /FUMBLE.*TURNOVER/);
      assert.equal(turnover.meta?.possessionTeam, after.activeOffense);
      assert.ok((turnover.meta?.durationMs ?? 0) >= 5000);
      game.resetDrill();
      assert.equal(game.getNetworkSnapshot!().lineOfScrimmageY, endingY);
    }
  }
});

test('live interceptions and end-zone picks announce the new offense immediately in both directions', context => {
  const { game, announcements, advance } = createGame(context);
  game.setOnlineGuestControl?.(true);
  for (const side of ['P1', 'P2'] as const) {
    for (const isTouchback of [false, true]) {
      game.setPossessionForTest?.(side);
      game.resetDrill();
      const snapshot = game.getNetworkSnapshot!();
      const pickY = isTouchback ? side === 'P1' ? 50 : 1150 : 612.375;
      const defenderId = snapshot.defenderIds[0];
      snapshot.entities[defenderId].data.x = 170;
      snapshot.entities[defenderId].data.y = pickY;
      snapshot.userControlledDefenderIndex = 0;
      snapshot.phase = 'THROWN';
      snapshot.playEnding = false;
      snapshot.ball = {
        x: 170, y: pickY, z: 5, startX: 170, startY: snapshot.lineOfScrimmageY,
        vx: 0, vy: 0, maxZ: 38, flightFrames: 30, currentFrame: 29,
        targetX: 170, targetY: pickY, intendedTargetId: snapshot.receiverIds[0]
      };
      game.applyNetworkSnapshot!(snapshot);
      announcements.length = 0;
      game.attemptSwatOrInterception?.('INT');
      const after = game.getNetworkSnapshot!();
      const newOffense = side === 'P1' ? 'P2' : 'P1';
      assert.equal(after.activeOffense, newOffense);
      assert.equal(after.phase, isTouchback ? 'DEAD' : 'RUNNING');
      const turnover = announcements.find(entry => entry.meta?.category === 'TURNOVER');
      assert.ok(turnover);
      assert.match(turnover.text, /INTERCEPTION.*TURNOVER/);
      assert.match(turnover.text, new RegExp(`${TEAMS[newOffense === 'P1' ? 'ALABAMA' : 'GEORGIA'].nickname.toUpperCase()} BALL`));
      assert.equal(turnover.meta?.possessionTeam, newOffense);
      assert.ok((turnover.meta?.durationMs ?? 0) >= 5000);
      if (isTouchback) {
        game.resetDrill();
        assert.equal(game.getNetworkSnapshot!().lineOfScrimmageY, side === 'P1' ? 300 : 900);
      } else {
        const returnStart = game.getNetworkSnapshot!();
        const returnerY = returnStart.entities[defenderId].data.y;
        for (let frame = 0; frame < 12; frame++) advance();
        const returnProgress = game.getNetworkSnapshot!();
        assert.equal(returnProgress.phase, 'RUNNING', 'The interception stays live until the carrier is tackled');
        assert.equal(returnProgress.activeEntityId, defenderId);
        assert.ok((returnProgress.entities[defenderId].data.y - returnerY) * returnProgress.attackDirection > 2,
          `The returner advances downfield (${returnerY} -> ${returnProgress.entities[defenderId].data.y}, vy ${returnProgress.entities[defenderId].data.vy}, clock ${returnProgress.playClock}, dir ${returnProgress.attackDirection})`);

        const endingY = returnProgress.entities[defenderId].data.y + 32.125 * game.attackDirection;
        game.triggerPlayEnd?.(endingY, 'TACKLE');
        game.resetDrill();
        assert.equal(game.getNetworkSnapshot!().lineOfScrimmageY, endingY);
        assert.equal(game.getNetworkSnapshot!().currentDown, 1);
      }
    }
  }
});

test('delayed first-down and touchdown announcements survive an early formation reset', context => {
  const { game, announcements } = createGame(context);
  for (const result of ['TACKLE', 'TD']) {
    game.setPossessionForTest?.('P1');
    game.resetDrill();
    announcements.length = 0;
    game.triggerPlayEnd?.(result === 'TD' ? 50 : 800, result);
    assert.equal(announcements.length, 0);
    game.resetDrill();
    assert.equal(announcements.filter(entry => entry.meta?.category === (result === 'TD' ? 'TOUCHDOWN' : 'FIRST_DOWN')).length, 1);
  }
});

test('UI shows turnovers and loose-ball events immediately while ordinary results stay quiet', () => {
  for (const [text, category] of [
    ['INTERCEPTION! TURNOVER!', 'TURNOVER'],
    ['FUMBLE RECOVERED BY DEFENSE! TURNOVER!', 'TURNOVER'],
    ['FUMBLE! LOOSE BALL!', 'FUMBLE'],
    ['OFFENSE RECOVERS OWN FUMBLE!', 'FUMBLE']
  ]) {
    assert.equal(shouldShowAnnouncement(text, category), true);
    assert.equal(isLiveBallAnnouncement(text, category), true);
  }
  assert.equal(shouldShowAnnouncement('SACK!', 'SACK'), false);
  assert.equal(shouldShowAnnouncement('GAIN OF 3 YARDS'), false);
  assert.equal(shouldShowAnnouncement('CPU AUDIBLE: QUICK PASS'), false);
  assert.equal(shouldShowAnnouncement('FIRST DOWN!', 'FIRST_DOWN'), true);
});

test('Pro AI sustains exact counters for every successful repeated base and signature play', () => {
  for (const play of Object.values(PRO_OFFENSE_PLAYS)) {
    const history = [{ play: play.id, isSuccessful: true }, { play: play.id, isSuccessful: true }];
    for (const previousCall of ['PRO_BLITZ_ZERO', 'PRO_RUN_STOP_BOX', 'PRO_TAMPA2']) {
      assert.equal(chooseProDefensiveCall({ recentPlays: history, down: 1, yardsToGo: 10, previousCall }, () => 0.99), play.counterDefenseId, play.id);
    }
  }
  assert.equal(getRepeatedOffensivePlay([{ play: 'A' }, { play: 'B' }, { play: 'A' }]), 'A');
  assert.equal(getRepeatedOffensivePlay([{ play: 'A', isSuccessful: false }, { play: 'A', isSuccessful: false }], true), null);
  assert.equal(getSuccessfulPlayCounter([
    { play: 'PRO_MESH', isPass: true, isSuccessful: true, routes: { center: 'POST-R' } },
    { play: 'PRO_MESH', isPass: true, isSuccessful: true, routes: { center: 'POST-R' } }
  ]), 'ZONE151', 'One clearing route does not turn mesh into a deep-pass concept');
  assert.equal(chooseAvailableDefensiveCounter([
    { play: 'PRO_SCREEN', isPass: true, isSuccessful: true },
    { play: 'PRO_SCREEN', isPass: true, isSuccessful: true }
  ], ['PRO_COVER4_QUARTERS', 'PRO_COVER2_HARD_FLAT'], 'PRO_BLITZ_ZERO'), 'PRO_COVER2_HARD_FLAT');
});

test('Tecmo CPU predicts repeated calls from history rather than reading the current offensive call', context => {
  context.mock.method(Math, 'random', () => 0.99);
  const { game } = createGame(context);
  game.setPossessionForTest?.('P1');
  game.resetDrill();
  const snapshot = game.getNetworkSnapshot!();
  snapshot.p1TeamId = 'ALABAMA';
  snapshot.p1OffPlay = 'BAMA_P4';
  snapshot.userPlayHistory = [
    { play: 'BAMA_P1', isPass: true, isSuccessful: true },
    { play: 'BAMA_P2', isPass: true, isSuccessful: false },
    { play: 'BAMA_P1', isPass: true, isSuccessful: true }
  ];
  game.applyNetworkSnapshot!(snapshot);
  game.resetDrill();
  assert.equal(game.p2DefPlay, 'BAMA_P1');
  assert.equal(game.p1OffPlay, 'BAMA_P4');
});

test('CPU defense scouting counts snapped plays, not repeated formation resets', context => {
  const { game } = createGame(context);
  game.setPossessionForTest?.('P2');
  for (let index = 0; index < 4; index++) game.resetDrill();
  assert.equal(game.getNetworkSnapshot!().userDefenseHistory.length, 0);
  game.startDefensePlay?.();
  assert.equal(game.getNetworkSnapshot!().userDefenseHistory.length, 1);
});

test('an early reset cancels the old post-play reset instead of interrupting the next play', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { game } = createGame(context);
  game.setPossessionForTest?.('P1');
  game.resetDrill();
  game.triggerPlayEnd?.(929.125, 'TACKLE');
  game.resetDrill();
  game.startPlay?.();
  const startedPhase = game.phase;
  assert.notEqual(startedPhase, 'PRE_SNAP');
  context.mock.timers.tick(1700);
  assert.equal(game.phase, startedPhase);
  assert.equal(game.getNetworkSnapshot!().lineOfScrimmageY, 929.125);
});

test('CPU offense favors situational calls and attacks repeated user defenses in every playbook', () => {
  const base = { down: 1, yardsToGo: 10, distanceToEndzoneYards: 70, recentDefenses: [], recentPlays: [] };
  const count = (plays: string[], situation: Parameters<typeof chooseTeamOffensivePlay>[3], target: string) =>
    Array.from({ length: 1000 }, (_, index) => chooseTeamOffensivePlay(plays, TEAMS.ALABAMA, () => (index + 0.5) / 1000, situation)).filter(play => play === target).length;
  const pro = ['PRO_DRAW', 'PRO_VERTS'];
  assert.ok(count(pro, { ...base, down: 3, yardsToGo: 12 }, 'PRO_VERTS') > 850);
  assert.ok(count(pro, { ...base, yardsToGo: 1 }, 'PRO_DRAW') > count(pro, base, 'PRO_DRAW'));
  assert.ok(count(pro, { ...base, distanceToEndzoneYards: 10 }, 'PRO_VERTS') < count(pro, base, 'PRO_VERTS'));
  for (const [plays, defense, target] of [
    [['PRO_DRAW', 'PRO_VERTS'], 'PRO_RUN_STOP_BOX', 'PRO_VERTS'],
    [['POWER', 'DEEP_SHOT'], 'ZONE151', 'DEEP_SHOT'],
    [['BAMA_R1', 'BAMA_P2'], 'BAMA_R1', 'BAMA_P2']
  ] as Array<[string[], string, string]>) {
    assert.ok(count(plays, { ...base, recentDefenses: [defense, defense] }, target) > count(plays, base, target), defense);
  }
});

test('interception touchbacks use the proper receiving-team spot rather than the pick in the end zone', () => {
  assert.equal(getInterceptionTouchbackY(50, 1200, 100, -1), 300);
  assert.equal(getInterceptionTouchbackY(1150, 1200, 100, 1), 900);
});
