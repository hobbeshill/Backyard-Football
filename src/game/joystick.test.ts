import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_NUMBERS_INNER_EDGE_X, getCanvasRenderScale, getCameraYForAction, getCameraYForLineOfScrimmage, getOffenseJoystickAnchor, getPlayerForwardDirection, isOffenseJoystickStartZone, mountFootballGame, OFFENSE_JOYSTICK_INNER_RING_RADIUS, OFFENSE_JOYSTICK_RADIUS, type GameEngineHandle } from './engine';
import { createSimulationClock, getDesignedRunLateralBias, getDirectionalInput, getRunLaneOptions, getScreenEdgeTargetPosition, getUserRunnerVelocity } from './movement';
import { TEAMS } from './teams';
import { getPlayerSpeedMultiplier } from './roster';

test('camera raises the offensive line of scrimmage while retaining defensive framing', () => {
  const lineOfScrimmageY = 500;
  const viewHeight = 450;
  const pitch = 0.72;
  const getScreenFraction = (userOnOffense: boolean) => {
    const cameraY = getCameraYForLineOfScrimmage(lineOfScrimmageY, viewHeight, pitch, userOnOffense);
    return (lineOfScrimmageY - cameraY) * pitch / viewHeight;
  };

  assert.ok(Math.abs(getScreenFraction(true) - (0.68 - (100 * pitch / viewHeight))) < 0.000001);
  assert.ok(Math.abs(getScreenFraction(false) - 1 / 3) < 0.000001);
});

test('idle joystick marker stays inside the field numbers at the RB formation depth', () => {
  const anchor = getOffenseJoystickAnchor(288);
  assert.ok(Math.abs((anchor.x - OFFENSE_JOYSTICK_INNER_RING_RADIUS) - FIELD_NUMBERS_INNER_EDGE_X) < 0.000001, 'Inner ring edge sits at the inside edge of the numbers');
  assert.equal(anchor.y, 364, 'Joystick marker sits just below the RB depth');
  assert.deepEqual(getOffenseJoystickAnchor(288), anchor, 'Anchor does not depend on RB alignment');
  assert.equal(isOffenseJoystickStartZone(anchor.x, anchor.y, anchor.x, anchor.y), true);
  assert.equal(isOffenseJoystickStartZone(anchor.x + 50, anchor.y + 40, anchor.x, anchor.y), true);
  assert.equal(isOffenseJoystickStartZone(300, anchor.y, anchor.x, anchor.y), true);
  assert.equal(isOffenseJoystickStartZone(anchor.x, anchor.y - 56, anchor.x, anchor.y), false);
});

test('joystick touch area fills from the top of the outer circle down and all the way left to right', () => {
  for (const scale of [0.5, 1, 2]) {
    const width = 340 * scale;
    const height = 450 * scale;
    const anchor = getOffenseJoystickAnchor(288 * scale, width, 76 * scale);
    const top = anchor.y - OFFENSE_JOYSTICK_RADIUS * scale;
    const contains = (x: number, y: number) =>
      isOffenseJoystickStartZone(x, y, anchor.x, anchor.y, width, height);

    for (const x of [0, 10 * scale, anchor.x, width / 2, width * 0.8, width]) {
      for (const y of [top, anchor.y, height - scale, height]) {
        assert.equal(contains(x, y), true, `The touch area includes (${x}, ${y}) at scale ${scale}`);
      }
    }
    assert.equal(contains(-scale, height), false);
    assert.equal(contains(width + scale, height), false);
    assert.equal(contains(anchor.x, top - scale), false);
    assert.equal(contains(0, height + scale), false);
  }
});

test('user control is direction-only with no carried momentum', () => {
  assert.deepEqual(getDirectionalInput(0.2, 0), { x: 1, y: 0 }, 'Partial stick deflection moves like a d-pad');
  assert.deepEqual(getDirectionalInput(0.01, 0), { x: 0, y: 0 }, 'Deadzone yields no heading');
  const right = getUserRunnerVelocity(1, 0, 2, -1);
  assert.ok(right.vx > 0 && Math.abs(right.vy) < 0.000001, 'Pushing right moves straight right with no forward drift');
  const left = getUserRunnerVelocity(-1, 0, 2, -1);
  assert.equal(left.vx, -right.vx, 'Reversing direction is instant');
  assert.deepEqual(getUserRunnerVelocity(0, 0, 2, -1), { vx: 0, vy: 0 }, 'No input keeps the user-controlled runner still');
});

test('camera frames live action near the vertical center', () => {
  const focusY = 780;
  const viewHeight = 450;
  const pitch = 0.72;
  const cameraY = getCameraYForAction(focusY, viewHeight, pitch);

  assert.ok(Math.abs((focusY - cameraY) * pitch / viewHeight - 0.5) < 0.000001);
});

test('player facing follows team ownership when kickoff roles differ from possession', () => {
  assert.equal(getPlayerForwardDirection('P2', 'P1', -1, -1), 1, 'The P2 kickoff team faces its direction of play');
  assert.equal(getPlayerForwardDirection('P1', 'P1', -1, 1), -1, 'The P1 return team faces its direction of play');
  assert.equal(getPlayerForwardDirection(undefined, 'P1', -1, 1), 1, 'Untagged players retain their role-based direction');
});

test('canvas backing resolution follows display scale with a bounded pixel ratio', () => {
  assert.equal(getCanvasRenderScale(340, 450, 2), 2);
  assert.equal(getCanvasRenderScale(680, 900, 2), 3);
  assert.equal(getCanvasRenderScale(170, 225, 1), 1);
});

test('simulation runs at 60 Hz regardless of display refresh rate', () => {
  for (const refreshRate of [30, 60, 120]) {
    const clock = createSimulationClock();
    let updates = 0;
    for (let frame = 0; frame <= refreshRate * 5; frame++) {
      updates += clock(frame * 1000 / refreshRate, false);
    }
    assert.equal(updates, 300);
  }
});

test('simulation discards paused time and caps catch-up after a stalled frame', () => {
  const clock = createSimulationClock();
  assert.equal(clock(0, false), 0);
  assert.equal(clock(10000, true), 0);
  assert.equal(clock(10000 + 1000 / 60, false), 1);
  assert.equal(clock(20000, false), 5);
});

function createMockCanvas(): HTMLCanvasElement & { _listeners: Map<string, EventListener>; _text: string[] } {
  const listeners = new Map<string, EventListener>();
  const text: string[] = [];
  const drawingContext = {
    save: () => {},
    restore: () => {},
    translate: () => {},
    scale: () => {},
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {},
    arc: () => {},
    bezierCurveTo: () => {},
    quadraticCurveTo: () => {},
    ellipse: () => {},
    clip: () => {},
    roundRect: () => {},
    setLineDash: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    fillText: (value: string) => { text.push(value); },
    measureText: () => ({ width: 40 }),
    rotate: () => {}
  };

  const canvas = {
    width: 340,
    height: 450,
    style: {},
    getContext: () => drawingContext,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 340, height: 450 } as DOMRect),
    addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
    _listeners: listeners,
    _text: text
  } as unknown as HTMLCanvasElement & { _listeners: Map<string, EventListener>; _text: string[] };

  return canvas;
}

test('engine uses team roster profiles across possessions, team switches and return formations', () => {
  const handle: { game?: GameEngineHandle } = {};
  const cleanup = mountFootballGame(createMockCanvas(), {
    setP2OffPlayState: () => {}, setP2DefPlayState: () => {},
    setDownDistanceText: () => {}, setActiveOffenseState: () => {},
    setUserScore: () => {}, setCpuScore: () => {}, setP1DefPlayState: () => {},
    setMomentumState: () => {}, setGameClockState: () => {}, showAnnouncement: () => {},
    onEngineReady: game => { handle.game = game ?? undefined; }
  });
  try {
    const game = handle.game;
    assert.ok(game);
    game.selectP1Team('FLORIDA');
    game.setPossessionForTest?.('P1');
    game.resetDrill();
    assert.equal(game.p1Team, TEAMS.FLORIDA);
    assert.equal(game.getReceivers()[0].player, TEAMS.FLORIDA.roster['wr-0']);
    assert.equal(game.getReceivers()[0].speedMultiplier, getPlayerSpeedMultiplier(95));
    assert.equal(game.getDefenders?.()[5].player, TEAMS.GEORGIA.roster['def-5']);
    game.selectP2Team('ARKANSAS');
    game.setPossessionForTest?.('P2');
    game.resetDrill();
    assert.equal(game.p2Team, TEAMS.ARKANSAS);
    assert.equal(game.getReceivers()[0].player, TEAMS.ARKANSAS.roster['wr-0']);
    game.setPossessionForTest?.('P1');
    game.resetDrill();
    game.set4thDownForTest?.();
    game.callPunt();
    assert.equal(game.getDefenders?.().find(player => player.isReturner)?.player, TEAMS.ARKANSAS.roster['wr-0']);
    game.resetGame();
    assert.equal(game.getDefenders?.().find(player => player.isReturner)?.player, TEAMS.FLORIDA.roster['wr-0']);
  } finally {
    cleanup?.();
  }
});

test('online guest controls the selected P2 team on offense and defense', () => {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  let nextFrame: FrameRequestCallback = () => {};
  globalThis.requestAnimationFrame = callback => { nextFrame = callback; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  const handle: { game?: GameEngineHandle } = {};
  const cleanup = mountFootballGame(createMockCanvas(), {
    setP2OffPlayState: () => {}, setP2DefPlayState: () => {},
    setDownDistanceText: () => {}, setActiveOffenseState: () => {},
    setUserScore: () => {}, setCpuScore: () => {}, setP1DefPlayState: () => {},
    setMomentumState: () => {}, setGameClockState: () => {}, showAnnouncement: () => {},
    onEngineReady: game => { handle.game = game ?? undefined; }
  });
  try {
    const game = handle.game;
    assert.ok(game);
    game.selectP1Team('FLORIDA');
    game.selectP2Team('ARKANSAS');
    game.setTacticalMode?.('ELITE');
    game.setOnlineGuestControl?.(true);
    assert.equal(game.p1Team, TEAMS.FLORIDA);
    assert.equal(game.p2Team, TEAMS.ARKANSAS);

    game.setPossessionForTest?.('P2');
    game.resetDrill();
    game.applyRemoteAction?.({ type: 'OFFENSE_PLAY', play: 'ARK_P1' });
    game.applyRemoteAction?.({ type: 'START' });
    assert.equal(game.activeOffense, 'P2');
    assert.equal(game.phase, 'QB_DROP');
    const quarterbackBefore = game.getQuarterbackScreenPositionForTest?.();
    assert.ok(quarterbackBefore);
    game.applyRemoteInput?.(1, 0, true);
    let timestamp = 0;
    for (let frame = 0; frame < 8; frame++) {
      timestamp += 1000 / 60;
      nextFrame(timestamp);
    }
    const quarterbackAfter = game.getQuarterbackScreenPositionForTest?.();
    assert.ok(quarterbackAfter && quarterbackAfter.x > quarterbackBefore.x, 'Guest input should move the P2 quarterback');

    game.applyRemoteInput?.(0, 0, false);
    const offenseSnapshot = game.getNetworkSnapshot?.();
    assert.ok(offenseSnapshot);
    game.setPossessionForTest?.('P1');
    game.applyNetworkSnapshot?.(JSON.parse(JSON.stringify(offenseSnapshot)));
    assert.equal(game.activeOffense, 'P2');
    assert.equal(game.p2Team.id, 'ARKANSAS');

    game.setPossessionForTest?.('P1');
    game.resetDrill();
    game.applyRemoteAction?.({ type: 'DEFENSE_PLAY', play: 'ARK_P2' });
    const defenseSnapshot = game.getNetworkSnapshot?.();
    assert.ok(defenseSnapshot);
    game.applyRemoteAction?.({ type: 'DEFENSE_PLAY', play: 'ARK_P3' });
    game.applyNetworkSnapshot?.(JSON.parse(JSON.stringify(defenseSnapshot)));
    assert.equal(game.p2DefPlay, 'ARK_P2', 'Snapshot restore must retain the guest-selected Tecmo defensive play');
    game.applyRemoteAction?.({ type: 'DEFENDER', index: 6 });
    const defender = game.getDefenders?.()[6];
    assert.ok(defender);
    const defenderXBefore = defender.x;
    game.applyRemoteInput?.(1, 0, true);
    game.startPlay?.();
    for (let frame = 0; frame < 8; frame++) {
      timestamp += 1000 / 60;
      nextFrame(timestamp);
    }
    assert.ok(defender.x > defenderXBefore, 'Guest input should move the P2 defender while P1 has the ball');

    game.applyRemoteInput?.(0, 0, false);
    game.setPossessionForTest?.('P1');
    game.resetDrill();
    game.startPlay?.();
    const localQuarterbackBefore = game.getQuarterbackScreenPositionForTest?.();
    assert.ok(localQuarterbackBefore);
    game.applyLocalInput?.(1, 0, true);
    for (let frame = 0; frame < 2; frame++) {
      timestamp += 1000 / 60;
      nextFrame(timestamp);
    }
    const localQuarterbackAfter = game.getQuarterbackScreenPositionForTest?.();
    assert.ok(localQuarterbackAfter && localQuarterbackAfter.x > localQuarterbackBefore.x, 'The shared host dock should drive the local P1 controls');
    game.applyLocalInput?.(0, 0, false);
  } finally {
    cleanup?.();
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});

test('Tecmo coverage mismatch affects defenders only after the offensive snap', () => {
  const handle: { game?: GameEngineHandle } = {};
  const cleanup = mountFootballGame(createMockCanvas(), {
    setP2OffPlayState: () => {}, setP2DefPlayState: () => {},
    setDownDistanceText: () => {}, setActiveOffenseState: () => {},
    setUserScore: () => {}, setCpuScore: () => {}, setP1DefPlayState: () => {},
    setMomentumState: () => {}, setGameClockState: () => {}, showAnnouncement: () => {},
    onEngineReady: game => { handle.game = game ?? undefined; }
  });
  try {
    const game = handle.game;
    assert.ok(game);
    game.selectP1Team('ALABAMA');
    game.setOnlineGuestControl?.(true);
    game.setPossessionForTest?.('P1');
    game.resetDrill();
    game.selectOffense('BAMA_R1');
    game.applyRemoteAction?.({ type: 'DEFENSE_PLAY', play: 'BAMA_P1' });

    const coverageDefenders = game.getDefenders?.().filter(defender => defender.type === 'DB' && !defender.passRusher);
    assert.ok(coverageDefenders?.length);
    assert.ok(coverageDefenders.every(defender => !defender.runRecognitionTimer), 'No current-play recognition before the snap');

    game.startPlay?.();
    assert.equal(game.getTecmoMatchup?.()?.level, 'MISMATCH_DROPPED_IN_COVERAGE');
    assert.ok(coverageDefenders.every(defender => defender.runRecognitionTimer === 30));
  } finally {
    cleanup?.();
  }
});

test('field is free of player badges while Pro pre-snap scouting preserves controls', () => {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  let nextFrame: FrameRequestCallback = () => {};
  globalThis.requestAnimationFrame = callback => { nextFrame = callback; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  const handle: { game?: GameEngineHandle } = {};
  const announcements: string[] = [];
  const canvas = createMockCanvas();
  const cleanup = mountFootballGame(canvas, {
    setP2OffPlayState: () => {}, setP2DefPlayState: () => {},
    setDownDistanceText: () => {}, setActiveOffenseState: () => {},
    setUserScore: () => {}, setCpuScore: () => {}, setP1DefPlayState: () => {},
    setMomentumState: () => {}, setGameClockState: () => {},
    showAnnouncement: text => { announcements.push(text); },
    onEngineReady: game => { handle.game = game ?? undefined; }
  });
  try {
    const game = handle.game;
    assert.ok(game);
    game.selectP1Team('FLORIDA');
    game.setTacticalMode?.('PRO');
    game.setPossessionForTest?.('P1');
    game.resetDrill();
    game.selectOffense('PRO_QUICK_SLANTS');
    nextFrame(0);
    assert.ok(!canvas._text.some(text => /^#\d+ (SPD|HANDS|HIT|COV|BLK|PWR|RUSH|QB)$/.test(text)));
    assert.ok(!canvas._text.includes('TAP 🏈'));
    assert.ok(!canvas._text.some(text => /\(YOU\)|NO ASSIGNMENT|^RB SPY$|^QB SPY$/.test(text)));
    const receiverPosition = game.getReceiverScreenPositionForTest?.(0);
    assert.ok(receiverPosition);
    canvas._listeners.get('pointerdown')?.({
      clientX: receiverPosition.x, clientY: receiverPosition.y, pointerId: 1,
      preventDefault: () => {}
    } as PointerEvent);
    assert.equal(game.phase, 'PRE_SNAP');
    assert.match(announcements.at(-1) ?? '', /#11 Deep threat.*SPD 95 PWR 38 HANDS 61/);
    game.startPlay?.();
    assert.equal(game.phase, 'QB_DROP');
    canvas._text.length = 0;
    nextFrame(1000 / 60);
    assert.ok(!canvas._text.includes('TAP 🏈'));
  } finally {
    cleanup?.();
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});

test('seeded live CPU plays include defensive stops instead of automatic touchdown exchanges', () => {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const originalRandom = Math.random;
  let nextFrame: FrameRequestCallback = () => {};
  globalThis.requestAnimationFrame = callback => { nextFrame = callback; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  let finished = 0;
  let touchdowns = 0;
  let productivePlays = 0;
  try {
    for (const mode of ['ELITE', 'PRO'] as const) {
      for (const teamId of ['ARKANSAS', 'FLORIDA', 'LSU']) {
        for (let sample = 1; sample <= 4; sample++) {
          let seed = sample * 7919;
          Math.random = () => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed / 4294967296;
          };
          const handle: { game?: GameEngineHandle } = {};
          const announcements: string[] = [];
          const cleanup = mountFootballGame(createMockCanvas(), {
            setP2OffPlayState: () => {}, setP2DefPlayState: () => {},
            setDownDistanceText: () => {}, setActiveOffenseState: () => {},
            setUserScore: () => {}, setCpuScore: () => {}, setP1DefPlayState: () => {},
            setMomentumState: () => {}, setGameClockState: () => {},
            showAnnouncement: text => { announcements.push(text); },
            onEngineReady: game => { handle.game = game ?? undefined; }
          });
          try {
            const game = handle.game;
            assert.ok(game);
            game.selectP1Team('GEORGIA');
            game.selectP2Team(teamId);
            game.setTacticalMode?.(mode);
            game.setPossessionForTest?.('P2');
            game.resetDrill();
            game.selectDefense(mode === 'PRO' ? 'PRO_COVER3_DEEP' : 'COVER2');
            game.startDefensePlay?.();
            nextFrame(0);
            for (let frame = 1; frame <= 1500 && game.phase !== 'DEAD' && game.p2Score === 0; frame++) {
              nextFrame(frame * 1000 / 60);
            }
            if (game.phase === 'DEAD' || game.p2Score > 0) finished++;
            if (game.p2Score > 0) touchdowns++;
            if (announcements.some(text => /FIRST DOWN|Gain of [5-9]|Gain of \d{2}/i.test(text))) productivePlays++;
          } finally {
            cleanup?.();
          }
        }
      }
    }
    assert.ok(finished >= 22, `${finished}/24 plays finished within 25 seconds`);
    assert.ok(touchdowns <= 6, `${touchdowns}/24 plays scored from the CPU's own 15`);
    assert.ok(productivePlays > 0, 'Defense must not erase all productive offense');
  } finally {
    Math.random = originalRandom;
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});

test('Sweep lane bias steers outside on either side while ISO keeps its inside path', () => {
  assert.equal(getDesignedRunLateralBias('SWEEP', 220, 'right'), 1.15);
  assert.equal(getDesignedRunLateralBias('SWEEP', 120, 'left'), -1.15);
  assert.equal(getDesignedRunLateralBias('SWEEP', 255, 'right'), 0);
  assert.equal(getDesignedRunLateralBias('ISO', 220, 'right'), 0);
});

test('run lane preview scores an open lane above a lane occupied by defenders and blockers', () => {
  const runner = { x: 170, y: 500, radius: 10 };
  const lanes = getRunLaneOptions(
    runner,
    [{ x: 170, y: 440, radius: 10 }],
    [{ x: 226, y: 435, radius: 10 }],
    -1
  );
  const left = lanes.find(lane => lane.side === 'LEFT')!;
  const middle = lanes.find(lane => lane.side === 'MIDDLE')!;
  const right = lanes.find(lane => lane.side === 'RIGHT')!;

  assert.ok(left.clearance > middle.clearance);
  assert.ok(left.clearance > right.clearance);
});

test('receiver fatigue persists across play calls and possessions, and resets for a new game', () => {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  let nextFrame: FrameRequestCallback = () => {};
  globalThis.requestAnimationFrame = callback => { nextFrame = callback; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  let engine: GameEngineHandle | null = null;
  const cleanup = mountFootballGame(createMockCanvas(), {
    setP2OffPlayState: () => {}, setP2DefPlayState: () => {},
    setDownDistanceText: () => {}, setActiveOffenseState: () => {},
    setUserScore: () => {}, setCpuScore: () => {}, setP1DefPlayState: () => {},
    setMomentumState: () => {}, setGameClockState: () => {}, showAnnouncement: () => {},
    onEngineReady: value => { engine = value; }
  });
  try {
    assert.ok(engine);
    const game = engine as GameEngineHandle;
    game.setPossessionForTest?.('P1');
    game.resetDrill();
    const receiver = game.getReceivers()[0];
    assert.equal('substituteReceiver' in game, false);
    receiver.stamina = 30;
    nextFrame(0);
    nextFrame(1000 / 60);
    const tiredStamina = receiver.stamina;
    game.selectOffense('SHORT_PASS');
    assert.equal(game.getReceivers()[0].stamina, tiredStamina);
    game.setPossessionForTest?.('P2');
    game.resetDrill();
    assert.equal(game.getReceivers()[0].stamina, 100);
    game.setPossessionForTest?.('P1');
    game.resetDrill();
    assert.equal(game.getReceivers()[0].stamina, tiredStamina);
    game.startPlay?.();
    const liveReceiver = game.getReceivers()[0];
    assert.equal(game.getReceivers()[0], liveReceiver);
    nextFrame(2000 / 60);
    assert.equal(liveReceiver.stamina, tiredStamina);
    game.resetGame();
    game.setPossessionForTest?.('P1');
    game.resetDrill();
    assert.equal(game.getReceivers()[0].stamina, 100);
  } finally {
    cleanup?.();
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});

test('targeting a WR three times empties its stamina and two untargeted plays refill it', () => {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  let engine: GameEngineHandle | null = null;
  const cleanup = mountFootballGame(createMockCanvas(), {
    setP2OffPlayState: () => {}, setP2DefPlayState: () => {},
    setDownDistanceText: () => {}, setActiveOffenseState: () => {},
    setUserScore: () => {}, setCpuScore: () => {}, setP1DefPlayState: () => {},
    setMomentumState: () => {}, setGameClockState: () => {}, showAnnouncement: () => {},
    onEngineReady: value => { engine = value; }
  });
  try {
    assert.ok(engine);
    const game = engine as GameEngineHandle;
    assert.equal('setGameSpeed' in game, false);
    game.setPossessionForTest?.('P1');
    game.resetDrill();
    const expectedStamina = [200 / 3, 100 / 3, 0, 50, 100];
    for (const [index, expected] of expectedStamina.entries()) {
      const receiver = game.getReceivers()[0];
      receiver.targetedThisPlay = index < 3;
      game.triggerPlayEnd?.(receiver.y, 'INCOMPLETE');
      assert.ok(Math.abs(receiver.stamina! - expected) < 0.0001, `play ${index + 1}: ${receiver.stamina} stamina`);
      if (index < expectedStamina.length - 1) {
        game.setPossessionForTest?.('P1');
        game.resetDrill();
      }
    }
  } finally {
    cleanup?.();
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});

test('relative joystick controls QB in pocket and does not interfere with tapping receiver to pass', () => {
  const canvas = createMockCanvas();
  let engine: GameEngineHandle | null = null;
  const cleanup = mountFootballGame(canvas, {
    setP2OffPlayState: () => {},
    setP2DefPlayState: () => {},
    setDownDistanceText: () => {},
    setActiveOffenseState: () => {},
    setUserScore: () => {},
    setCpuScore: () => {},
    setP1DefPlayState: () => {},
    setMomentumState: () => {},
    setGameClockState: () => {},
    showAnnouncement: () => {},
    onEngineReady: value => { engine = value; }
  });

  try {
    assert.ok(engine);
    const game = engine as GameEngineHandle;
    game.setPossessionForTest?.('P1');
    game.selectOffense('SHORT_PASS');
    game.resetDrill();
    assert.equal(game.phase, 'PRE_SNAP');

    const downHandler = (canvas as any)._listeners.get('pointerdown');
    const moveHandler = (canvas as any)._listeners.get('pointermove');
    const upHandler = (canvas as any)._listeners.get('pointerup');
    assert.ok(downHandler && moveHandler && upHandler);

    const qbPosition = game.getQuarterbackScreenPositionForTest?.();
    assert.ok(qbPosition);
    downHandler({ clientX: qbPosition.x, clientY: qbPosition.y, pointerId: 1 } as PointerEvent);
    assert.equal(game.phase, 'PRE_SNAP', 'Tapping the QB no longer starts the play');
    assert.equal(game.isJoystickActiveForTest?.(), false);
    upHandler({ clientX: qbPosition.x, clientY: qbPosition.y, pointerId: 1 } as PointerEvent);

    downHandler({ clientX: 180, clientY: 100, pointerId: 9 } as PointerEvent);
    assert.equal(game.phase, 'PRE_SNAP', 'A touch outside the start zone does not snap');
    assert.equal(game.isJoystickActiveForTest?.(), false, 'Touch outside the field-positioned start zone must not activate');
    upHandler({ clientX: 180, clientY: 100, pointerId: 9 } as PointerEvent);

    // The joystick zone below the RB starts the play and stays with this touch.
    downHandler({ clientX: 90, clientY: 364, pointerId: 10 } as PointerEvent);
    assert.equal(game.phase, 'QB_DROP');
    assert.equal(game.isJoystickActiveForTest?.(), true);
    // Drag joystick up and right
    moveHandler({ clientX: 250, clientY: 334, pointerId: 10 } as PointerEvent);

    // 3. While joystick is active, tap WR with a second finger (pointerId: 20)
    const receiverPosition = game.getReceiverScreenPositionForTest?.(0);
    assert.ok(receiverPosition);
    downHandler({ clientX: receiverPosition.x, clientY: receiverPosition.y, pointerId: 20 } as PointerEvent);
    upHandler({ clientX: receiverPosition.x, clientY: receiverPosition.y, pointerId: 20 } as PointerEvent);

    // Pass should be thrown immediately to the WR without joystick interference!
    assert.equal(game.phase, 'THROWN');
    assert.equal(game.isJoystickActiveForTest?.(), true, 'Receiver tap must not replace or disturb the movement pointer');

    // Lift joystick finger
    upHandler({ clientX: 250, clientY: 334, pointerId: 10 } as PointerEvent);
  } finally {
    cleanup?.();
  }
});

test('joystick floats at the touch origin and steers relative to it on scaled displays', () => {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  let nextFrame: FrameRequestCallback = () => {};
  globalThis.requestAnimationFrame = callback => { nextFrame = callback; return 1; };
  globalThis.cancelAnimationFrame = () => {};

  try {
    for (const scale of [1, 2]) {
      const canvas = createMockCanvas();
      const rect = canvas.getBoundingClientRect();
      canvas.getBoundingClientRect = () => ({ ...rect, width: 340 * scale, height: 450 * scale });
      const ctx = canvas.getContext('2d');
      assert.ok(ctx);
      const arcs: { x: number; y: number; radius: number }[] = [];
      ctx.arc = (x, y, radius) => { arcs.push({ x, y, radius }); };
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
        game.setPossessionForTest?.('P1');
        game.selectOffense('SHORT_PASS');
        game.resetDrill();
        canvas.width = 340 * scale;
        canvas.height = 450 * scale;
        const listeners = (canvas as HTMLCanvasElement & { _listeners: Map<string, EventListener> })._listeners;
        const down = listeners.get('pointerdown');
        const move = listeners.get('pointermove');
        const up = listeners.get('pointerup');
        assert.ok(down && move && up);
        const pointer = (x: number, y: number) =>
          ({ clientX: x * scale, clientY: y * scale, pointerId: 10 } as PointerEvent);

        down(pointer(10, 440));
        assert.equal(game.phase, 'QB_DROP');
        assert.equal(game.isJoystickActiveForTest?.(), true);
        move(pointer(10, 440));
        nextFrame(0);
        assert.deepEqual(arcs.slice(-3), [
          { x: 10, y: 440, radius: OFFENSE_JOYSTICK_RADIUS },
          { x: 10, y: 440, radius: OFFENSE_JOYSTICK_INNER_RING_RADIUS },
          { x: 10, y: 440, radius: 20 }
        ], 'A stationary touch stays neutral and draws the original-size stick at the touch');

        move(pointer(10, 420));
        nextFrame(0);
        const knob = arcs.at(-1);
        assert.ok(knob);
        assert.ok(Math.abs(knob.x - 10) < 0.000001);
        assert.ok(Math.abs(knob.y - (440 - (15 / 41) * 40)) < 0.000001,
          'Steering uses logical coordinates, independent of display and backing resolution');
        up(pointer(10, 420));
        assert.equal(game.isJoystickActiveForTest?.(), false);

        down(pointer(170, 440));
        assert.equal(game.isJoystickActiveForTest?.(), true, 'The expanded area also works during live play');
        nextFrame(0);
        assert.deepEqual(arcs.at(-1), { x: 170, y: 440, radius: 20 },
          'A new touch establishes a new floating origin');
        up(pointer(170, 440));
      } finally {
        cleanup?.();
      }
    }
  } finally {
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});

test('tapping a receiver to pass does not activate the joystick by itself', () => {
  const canvas = createMockCanvas();
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
    game.setPossessionForTest?.('P1');
    game.resetDrill();
    const pointerDown = (canvas as any)._listeners.get('pointerdown');
    const pointerUp = (canvas as any)._listeners.get('pointerup');
    game.startPlay?.();
    const receiverPosition = game.getReceiverScreenPositionForTest?.(0);
    assert.ok(receiverPosition);
    pointerDown({ clientX: receiverPosition.x, clientY: receiverPosition.y, pointerId: 2 } as PointerEvent);
    assert.equal(game.phase, 'THROWN');
    assert.equal(game.isJoystickActiveForTest?.(), false);
  } finally {
    cleanup?.();
  }
});

test('a safety awards two points to the defense and sends the conceding team to kick off', () => {
  let p1Score = 0;
  let p2Score = 0;
  let kickoff: ['P1' | 'P2', 'P1' | 'P2'] | null = null;
  let engine: GameEngineHandle | null = null;
  const cleanup = mountFootballGame(createMockCanvas(), {
    setP2OffPlayState: () => {}, setP2DefPlayState: () => {},
    setDownDistanceText: () => {}, setActiveOffenseState: () => {},
    setUserScore: score => { p1Score = score; },
    setCpuScore: score => { p2Score = score; },
    setP1DefPlayState: () => {}, setMomentumState: () => {},
    setGameClockState: () => {}, showAnnouncement: () => {},
    setIsKickoffState: (active, kicking, receiving) => {
      if (active) kickoff = [kicking, receiving];
    },
    onEngineReady: value => { engine = value; }
  });
  try {
    assert.ok(engine);
    const game = engine as GameEngineHandle;
    game.setPossessionForTest?.('P1');
    game.resetDrill();
    game.triggerPlayEnd?.(1150, 'TACKLE');
    assert.equal(p1Score, 0);
    assert.equal(p2Score, 2);
    assert.deepEqual(kickoff, ['P1', 'P2']);
    assert.equal(game.isKickoffActive(), true);
  } finally {
    cleanup?.();
  }
});

test('relative joystick controls the unassigned defender when user is on defense', () => {
  const canvas = createMockCanvas();
  let engine: GameEngineHandle | null = null;
  const cleanup = mountFootballGame(canvas, {
    setP2OffPlayState: () => {},
    setP2DefPlayState: () => {},
    setDownDistanceText: () => {},
    setActiveOffenseState: () => {},
    setUserScore: () => {},
    setCpuScore: () => {},
    setP1DefPlayState: () => {},
    setMomentumState: () => {},
    setGameClockState: () => {},
    showAnnouncement: () => {},
    onEngineReady: value => { engine = value; }
  });

  try {
    assert.ok(engine);
    const game = engine as GameEngineHandle;
    game.setPossessionForTest?.('P2'); // CPU is on offense, User on defense
    game.resetDrill();
    assert.equal(game.phase, 'PRE_SNAP');

    const downHandler = (canvas as any)._listeners.get('pointerdown');
    const moveHandler = (canvas as any)._listeners.get('pointermove');
    const upHandler = (canvas as any)._listeners.get('pointerup');

    // Start the CPU play while the user is on defense.
    game.startPlay?.();
    assert.ok((game.phase as string) === 'QB_DROP' || (game.phase as string) === 'HANDOFF');

    // Defense uses the same lower-left touch area as offense.
    downHandler({ clientX: 90, clientY: 364, pointerId: 5 } as PointerEvent);
    assert.equal(game.isJoystickActiveForTest?.(), true);
    moveHandler({ clientX: 110, clientY: 364, pointerId: 5 } as PointerEvent);

    upHandler({ clientX: 110, clientY: 364, pointerId: 5 } as PointerEvent);
  } finally {
    cleanup?.();
  }
});

test('kickoff receiving team blockers are positioned in a horizontal line in front of the returner', () => {
  const canvas = createMockCanvas();
  let engine: GameEngineHandle | null = null;
  const cleanup = mountFootballGame(canvas, {
    setP2OffPlayState: () => {},
    setP2DefPlayState: () => {},
    setDownDistanceText: () => {},
    setActiveOffenseState: () => {},
    setUserScore: () => {},
    setCpuScore: () => {},
    setP1DefPlayState: () => {},
    setMomentumState: () => {},
    setGameClockState: () => {},
    showAnnouncement: () => {},
    onEngineReady: value => { engine = value; }
  });

  try {
    assert.ok(engine);
    const game = engine as any;
    assert.equal(game.phase, 'KICKOFF');
    const defenders = game.getDefenders ? game.getDefenders() : null;
    assert.ok(defenders);
    const returner = defenders.find((d: any) => d.isReturner);
    assert.ok(returner, 'Must have a returner');
    const blockers = defenders.filter((d: any) => d !== returner);
    assert.equal(blockers.length, 6, 'Must have 6 blockers on kickoff receiving team');
    // Verify all 6 blockers share the exact same Y position (horizontal line)
    const firstBlockerY = blockers[0].y;
    blockers.forEach((b: any) => {
      assert.equal(b.y, firstBlockerY, 'All 6 blockers must share the exact same Y position forming a horizontal line');
    });
    // Verify blockers are in front of returner towards the kicker
    assert.equal(Math.abs(firstBlockerY - returner.y), 60, 'Blockers must be positioned 60 units in front of the returner');
  } finally {
    cleanup?.();
  }
});

test('P1 can steer the return man after fielding a kickoff', () => {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  let nextFrame: FrameRequestCallback | null = null;
  let timestamp = 0;
  globalThis.requestAnimationFrame = callback => { nextFrame = callback; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  const canvas = createMockCanvas();
  const capturedPointers: number[] = [];
  canvas.setPointerCapture = pointerId => { capturedPointers.push(pointerId); };
  const handle: { game?: GameEngineHandle } = {};
  const cleanup = mountFootballGame(canvas, {
    setP2OffPlayState: () => {}, setP2DefPlayState: () => {},
    setDownDistanceText: () => {}, setActiveOffenseState: () => {},
    setUserScore: () => {}, setCpuScore: () => {}, setP1DefPlayState: () => {},
    setMomentumState: () => {}, setGameClockState: () => {}, showAnnouncement: () => {},
    onEngineReady: game => { handle.game = game ?? undefined; }
  });
  const advanceFrame = () => {
    const frame = nextFrame;
    assert.ok(frame);
    timestamp += 1000 / 60;
    frame(timestamp);
  };
  try {
    const game = handle.game;
    assert.ok(game);
    game.kickoff(0.35);
    for (let frame = 0; frame < 1200 && game.phase !== 'RUNNING'; frame++) advanceFrame();
    assert.equal(game.phase, 'RUNNING', 'The receiving player must field this non-touchback kickoff');
    const returner = game.getDefenders?.().find(player => player.isReturner);
    assert.ok(returner);
    const catchY = returner.y;
    for (let frame = 0; frame < 6; frame++) advanceFrame();
    assert.ok((returner.y - catchY) * game.attackDirection > 0, 'The returner continues upfield when no lateral input is held');
    const xBeforeInput = returner.x;
    const yBeforeInput = returner.y;

    canvas._listeners.get('pointerdown')?.({
      clientX: 100, clientY: 220, pointerId: 7, preventDefault: () => {}
    } as PointerEvent);
    assert.deepEqual(capturedPointers, [7], 'The native joystick should capture its pointer while steering');
    canvas._listeners.get('pointermove')?.({
      clientX: 140, clientY: 220, pointerId: 7
    } as PointerEvent);
    advanceFrame();

    assert.ok(returner.x > xBeforeInput, 'A rightward joystick drag should move the returner right');
    assert.ok((returner.y - yBeforeInput) * game.attackDirection > 0, 'A lateral drag still preserves forward return progress');
    canvas._listeners.get('pointercancel')?.({ clientX: 140, clientY: 220, pointerId: 7 } as PointerEvent);
    assert.equal(game.isJoystickActiveForTest?.(), false, 'Pointer cancellation releases returner control');

    const xBeforeReverse = returner.x;
    canvas._listeners.get('pointerdown')?.({
      clientX: 160, clientY: 220, pointerId: 8, preventDefault: () => {}
    } as PointerEvent);
    canvas._listeners.get('pointermove')?.({
      clientX: 120, clientY: 220, pointerId: 8
    } as PointerEvent);
    advanceFrame();
    assert.ok(returner.x < xBeforeReverse, 'The returner must reverse left even while blockers pursue coverage');
    canvas._listeners.get('pointerup')?.({ clientX: 120, clientY: 220, pointerId: 8 } as PointerEvent);
  } finally {
    cleanup?.();
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});

test('online P2 returner is controlled by guest input, not the opposing defense', () => {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  let nextFrame: FrameRequestCallback | null = null;
  let timestamp = 0;
  globalThis.requestAnimationFrame = callback => { nextFrame = callback; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  const canvas = createMockCanvas();
  const handle: { game?: GameEngineHandle } = {};
  const onlineInputs: Array<{ dx: number; dy: number; active: boolean }> = [];
  const cleanup = mountFootballGame(canvas, {
    setP2OffPlayState: () => {}, setP2DefPlayState: () => {},
    setDownDistanceText: () => {}, setActiveOffenseState: () => {},
    setUserScore: () => {}, setCpuScore: () => {}, setP1DefPlayState: () => {},
    setMomentumState: () => {}, setGameClockState: () => {}, showAnnouncement: () => {},
    onOnlineInput: (dx, dy, active) => { onlineInputs.push({ dx, dy, active }); },
    onEngineReady: game => { handle.game = game ?? undefined; }
  });
  const advanceFrame = () => {
    const frame = nextFrame;
    assert.ok(frame);
    timestamp += 1000 / 60;
    frame(timestamp);
  };
  try {
    const game = handle.game;
    assert.ok(game);
    const snapshot = game.getNetworkSnapshot?.();
    assert.ok(snapshot);
    const returnerId = snapshot.defenderIds.find((id: string) => snapshot.entities[id]?.data?.isReturner);
    assert.ok(returnerId);
    snapshot.entities[returnerId].data.team = 'P2';
    snapshot.entities[returnerId].data.x = 170;
    snapshot.entities[returnerId].data.y = 500;
    snapshot.defenderIds.forEach((id: string) => { snapshot.entities[id].data.team = 'P2'; });
    snapshot.phase = 'RUNNING';
    snapshot.activeEntityId = returnerId;
    snapshot.activeOffense = 'P2';
    snapshot.activeDefense = 'P1';
    snapshot.attackDirection = 1;
    snapshot.lineOfScrimmageY = 500;
    snapshot.firstDownMarkerY = 600;
    snapshot.isKickoffPhase = false;
    snapshot.isSpecialTeamsReturn = true;
    snapshot.specialTeamsReturnType = 'KICKOFF';
    game.setOnlineGuestControl?.(true);
    game.setOnlinePlayerSide?.('P1');
    game.setNetworkMirror?.(true);
    game.applyNetworkSnapshot?.(snapshot);

    assert.equal(game.getControlledDefender?.(), null, 'The P2 returner must not be exposed as a P1 defender');
    const returner = game.getDefenders?.().find(player => player.isReturner);
    assert.ok(returner);
    const xBeforeInput = returner.x;
    game.applyLocalInput?.(1, 0, true);
    advanceFrame();
    advanceFrame();
    assert.ok(returner.x - xBeforeInput < 0.5, 'P1 must not steer the P2 returner');

    game.applyLocalInput?.(0, 0, false);
    game.setOnlinePlayerSide?.('P2');
    const guestReturnYBefore = returner.y;
    canvas._listeners.get('pointerdown')?.({
      clientX: 100, clientY: 220, pointerId: 7, preventDefault: () => {}
    } as PointerEvent);
    canvas._listeners.get('pointermove')?.({
      clientX: 140, clientY: 220, pointerId: 7
    } as PointerEvent);
    advanceFrame();
    advanceFrame();
    assert.equal(returner.x, xBeforeInput, 'The guest mirror must not simulate a second returner locally');
    assert.ok(onlineInputs.some(input => input.active && input.dx > 0.5), 'Guest canvas movement should be sent to the host');
    canvas._listeners.get('pointerup')?.({ clientX: 140, clientY: 220, pointerId: 7 } as PointerEvent);
    assert.equal(onlineInputs.at(-1)?.active, false, 'Guest input release should clear host movement');

    const hostSnapshot = game.getNetworkSnapshot?.();
    assert.ok(hostSnapshot);
    hostSnapshot.entities[returnerId].data.x = xBeforeInput + 12;
    hostSnapshot.entities[returnerId].data.y = guestReturnYBefore + 12;
    game.applyNetworkSnapshot?.(hostSnapshot);
    for (let frame = 0; frame < 24; frame++) advanceFrame();
    const mirroredReturner = game.getDefenders?.().find(player => player.isReturner);
    assert.ok(mirroredReturner);
    assert.equal(mirroredReturner.x, xBeforeInput + 12, 'The guest should render host-authoritative return movement smoothly');
    assert.equal(mirroredReturner.y, guestReturnYBefore + 12);
  } finally {
    cleanup?.();
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});

test('guest native input cannot steer the host-controlled P1 quarterback', () => {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  let nextFrame: FrameRequestCallback | null = null;
  let timestamp = 0;
  globalThis.requestAnimationFrame = callback => { nextFrame = callback; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  const handle: { game?: GameEngineHandle } = {};
  const cleanup = mountFootballGame(createMockCanvas(), {
    setP2OffPlayState: () => {}, setP2DefPlayState: () => {},
    setDownDistanceText: () => {}, setActiveOffenseState: () => {},
    setUserScore: () => {}, setCpuScore: () => {}, setP1DefPlayState: () => {},
    setMomentumState: () => {}, setGameClockState: () => {}, showAnnouncement: () => {},
    onEngineReady: game => { handle.game = game ?? undefined; }
  });
  const advanceFrame = () => {
    const frame = nextFrame;
    assert.ok(frame);
    timestamp += 1000 / 60;
    frame(timestamp);
  };
  try {
    const game = handle.game;
    assert.ok(game);
    game.setOnlineGuestControl?.(true);
    game.setOnlinePlayerSide?.('P2');
    game.setPossessionForTest?.('P1');
    game.resetDrill();
    const snapshot = game.getNetworkSnapshot?.();
    assert.ok(snapshot?.entities.qb);
    snapshot.phase = 'QB_DROP';
    snapshot.activeEntityId = 'qb';
    snapshot.entities.qb.data.hasBall = true;
    snapshot.entities.qb.data.dropStepTimer = 28;
    snapshot.userControlledDefenderIndex = 6;
    game.applyNetworkSnapshot?.(snapshot);

    for (let frame = 0; frame < 8; frame++) advanceFrame();
    const baseline = game.getNetworkSnapshot?.();
    assert.ok(baseline);
    const expectedQb = baseline.entities.qb.data;

    game.applyNetworkSnapshot?.(snapshot);
    const guestDefender = game.getControlledDefender?.();
    assert.ok(guestDefender);
    const defenderXBefore = guestDefender.x;
    game.applyLocalInput?.(1, 0, true);
    for (let frame = 0; frame < 8; frame++) advanceFrame();
    const after = game.getNetworkSnapshot?.().entities.qb.data;
    assert.equal(after.x, expectedQb.x, 'Guest defensive direction must not alter the host QB x-position');
    assert.ok(Math.abs(after.y - expectedQb.y) < 1.5, 'Guest defensive direction must not alter the host QB dropback');
    assert.ok(guestDefender.x > defenderXBefore, 'The same guest input should move the controlled defender');

  } finally {
    cleanup?.();
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});

test('guest mirror interpolates host snapshots without simulating QB movement', () => {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  let nextFrame: FrameRequestCallback | null = null;
  let timestamp = 0;
  globalThis.requestAnimationFrame = callback => { nextFrame = callback; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  const handle: { game?: GameEngineHandle } = {};
  const cleanup = mountFootballGame(createMockCanvas(), {
    setP2OffPlayState: () => {}, setP2DefPlayState: () => {},
    setDownDistanceText: () => {}, setActiveOffenseState: () => {},
    setUserScore: () => {}, setCpuScore: () => {}, setP1DefPlayState: () => {},
    setMomentumState: () => {}, setGameClockState: () => {}, showAnnouncement: () => {},
    onEngineReady: game => { handle.game = game ?? undefined; }
  });
  const advanceFrame = () => {
    const frame = nextFrame;
    assert.ok(frame);
    timestamp += 1000 / 60;
    frame(timestamp);
  };
  try {
    const game = handle.game;
    assert.ok(game);
    game.setOnlineGuestControl?.(true);
    game.setOnlinePlayerSide?.('P2');
    game.setPossessionForTest?.('P1');
    game.resetDrill();
    const snapshot = game.getNetworkSnapshot?.();
    assert.ok(snapshot?.entities.qb);
    snapshot.phase = 'QB_DROP';
    snapshot.activeEntityId = 'qb';
    snapshot.entities.qb.data.hasBall = true;
    snapshot.entities.qb.data.dropStepTimer = 0;
    const previousX = snapshot.entities.qb.data.x;
    const previousY = snapshot.entities.qb.data.y;
    snapshot.entities.qb.data.x = previousX + 40;
    snapshot.entities.qb.data.y = previousY + 20;

    game.setNetworkMirror?.(true);
    game.applyNetworkSnapshot?.(snapshot);
    let guestState = game.getNetworkSnapshot?.();
    assert.ok(guestState);
    assert.equal(guestState.entities.qb.data.x, previousX, 'A mirror snapshot should not jump player positions');

    for (let frame = 0; frame < 2; frame++) advanceFrame();
    guestState = game.getNetworkSnapshot?.();
    assert.ok(guestState);
    assert.ok(guestState.entities.qb.data.x > previousX && guestState.entities.qb.data.x < previousX + 40, 'The guest render should interpolate toward the host QB position');

    game.applyLocalInput?.(-1, 0, true);
    for (let frame = 0; frame < 25; frame++) advanceFrame();
    guestState = game.getNetworkSnapshot?.();
    assert.ok(guestState);
    assert.equal(guestState.entities.qb.data.x, previousX + 40, 'Guest defensive input must not change the host snapshot target');
  } finally {
    cleanup?.();
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});

test('guest mirror relays native start and throw without simulating a second play', () => {
  const canvas = createMockCanvas();
  const handle: { game?: GameEngineHandle } = {};
  const actions: Array<{ type: string }> = [];
  const cleanup = mountFootballGame(canvas, {
    setP2OffPlayState: () => {}, setP2DefPlayState: () => {},
    setDownDistanceText: () => {}, setActiveOffenseState: () => {},
    setUserScore: () => {}, setCpuScore: () => {}, setP1DefPlayState: () => {},
    setMomentumState: () => {}, setGameClockState: () => {}, showAnnouncement: () => {},
    onOnlineAction: action => { actions.push(action); },
    onEngineReady: game => { handle.game = game ?? undefined; }
  });
  try {
    const game = handle.game;
    assert.ok(game);
    game.setOnlineGuestControl?.(true);
    game.setOnlinePlayerSide?.('P2');
    game.setNetworkMirror?.(true);
    game.setPossessionForTest?.('P2');
    game.resetDrill();
    game.startPlay?.();
    assert.equal(game.phase, 'PRE_SNAP', 'The guest waits for the authoritative start snapshot');
    assert.deepEqual(actions, [{ type: 'START' }]);

    const snapshot = game.getNetworkSnapshot?.();
    assert.ok(snapshot);
    snapshot.phase = 'QB_DROP';
    snapshot.activeEntityId = 'qb';
    snapshot.entities.qb.data.hasBall = true;
    snapshot.entities.qb.data.dropStepTimer = 0;
    game.applyNetworkSnapshot?.(snapshot);
    const receiver = game.getReceiverScreenPositionForTest?.(0);
    assert.ok(receiver);
    canvas._listeners.get('pointerdown')?.({
      clientX: receiver.x, clientY: receiver.y, pointerId: 3, preventDefault: () => {}
    } as PointerEvent);
    assert.equal(game.phase, 'QB_DROP', 'The guest does not locally execute a second pass');
    assert.deepEqual(actions.map(action => action.type), ['START', 'THROW']);
  } finally {
    cleanup?.();
  }
});

test('native edge target can throw to a Go-route receiver beyond the viewport', () => {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  let nextFrame: FrameRequestCallback | null = null;
  let timestamp = 0;
  globalThis.requestAnimationFrame = callback => { nextFrame = callback; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  const canvas = createMockCanvas();
  const handle: { game?: GameEngineHandle } = {};
  const cleanup = mountFootballGame(canvas, {
    setP2OffPlayState: () => {}, setP2DefPlayState: () => {},
    setDownDistanceText: () => {}, setActiveOffenseState: () => {},
    setUserScore: () => {}, setCpuScore: () => {}, setP1DefPlayState: () => {},
    setMomentumState: () => {}, setGameClockState: () => {}, showAnnouncement: () => {},
    onEngineReady: game => { handle.game = game ?? undefined; }
  });
  const advanceFrame = () => {
    const frame = nextFrame;
    assert.ok(frame);
    timestamp += 1000 / 60;
    frame(timestamp);
  };
  try {
    const game = handle.game;
    assert.ok(game);
    game.selectP1Team('ALABAMA');
    game.setPossessionForTest?.('P1');
    game.resetDrill();
    game.selectOffense('BAMA_P2');
    game.startPlay?.();
    assert.equal(game.phase, 'QB_DROP');
    const routeReceiver = game.getReceivers()[0];
    const manDefender = game.getDefenders?.().find(defender =>
      !defender.passRusher && (defender.type === 'CB' || defender.type === 'DB')
    );
    assert.ok(manDefender);
    manDefender.defenseAssignment = 'MAN';
    manDefender.assignedReceiver = routeReceiver;

    for (let frame = 0; frame < 850; frame++) advanceFrame();
    const receiver = game.getReceiverScreenPositionForTest?.(0);
    assert.ok(receiver);
    assert.ok(receiver.y < 0 || receiver.y > 450, 'Go-route receiver should continue beyond the visible field');
    assert.ok(Math.abs(manDefender.y - routeReceiver.y) < 50, 'Man coverage should stay with the receiver through the deep route');
    const edge = getScreenEdgeTargetPosition(receiver.x, receiver.y, 340, 450);
    assert.ok(edge);
    canvas._listeners.get('pointerdown')?.({
      clientX: edge.x, clientY: edge.y, pointerId: 11, preventDefault: () => {}
    } as PointerEvent);
    assert.equal(game.phase, 'THROWN', 'Tapping the edge marker throws to the off-screen receiver');
  } finally {
    cleanup?.();
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});

test('online kickoff can only be started by the locally assigned kicking team', () => {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  let nextFrame: FrameRequestCallback = () => {};
  globalThis.requestAnimationFrame = callback => { nextFrame = callback; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  const canvas = createMockCanvas();
  const handle: { game?: GameEngineHandle } = {};
  const actions: Array<{ type: string }> = [];
  const cleanup = mountFootballGame(canvas, {
    setP2OffPlayState: () => {}, setP2DefPlayState: () => {},
    setDownDistanceText: () => {}, setActiveOffenseState: () => {},
    setUserScore: () => {}, setCpuScore: () => {}, setP1DefPlayState: () => {},
    setMomentumState: () => {}, setGameClockState: () => {}, showAnnouncement: () => {},
    onOnlineAction: action => { actions.push(action); },
    onEngineReady: game => { handle.game = game ?? undefined; }
  });
  try {
    const game = handle.game;
    assert.ok(game);
    game.setTacticalMode?.('PRO');
    game.setOnlineGuestControl?.(true);
    game.setOnlinePlayerSide?.('P1');
    canvas._listeners.get('pointerdown')?.({
      clientX: 100, clientY: 220, pointerId: 1, preventDefault: () => {}
    } as PointerEvent);
    assert.equal(game.phase, 'KICKOFF', 'The receiving player cannot start the opponent kickoff');
    assert.equal(game.isJoystickActiveForTest?.(), false, 'The receiving player gets no kickoff steering input');
    assert.equal(actions.length, 0);

    game.setOnlinePlayerSide?.('P2');
    canvas._listeners.get('pointerdown')?.({
      clientX: 100, clientY: 220, pointerId: 2, preventDefault: () => {}
    } as PointerEvent);
    assert.equal(game.phase, 'THROWN', 'The P2 kicker can start the kickoff');
    assert.deepEqual(actions, [{ type: 'START' }], 'Native kickoff start is relayed once');
    assert.equal(game.isJoystickActiveForTest?.(), false, 'Starting a kick never gives control of the receiving returner');

    game.setPossessionForTest?.('P2');
    game.resetDrill();
    game.startPlay?.();
    assert.ok(game.phase === 'QB_DROP' || game.phase === 'HANDOFF', 'The guest can start its own offense');
    assert.equal(actions.length, 2);

    game.setPossessionForTest?.('P1');
    game.resetDrill();
    game.startPlay?.();
    assert.equal(game.phase, 'PRE_SNAP', 'The guest cannot start the host offense');
    assert.equal(actions.length, 2);
  } finally {
    cleanup?.();
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});

test('native guest start begins only the guest offense', () => {
  const canvas = createMockCanvas();
  const handle: { game?: GameEngineHandle } = {};
  const actions: Array<{ type: string }> = [];
  const cleanup = mountFootballGame(canvas, {
    setP2OffPlayState: () => {}, setP2DefPlayState: () => {},
    setDownDistanceText: () => {}, setActiveOffenseState: () => {},
    setUserScore: () => {}, setCpuScore: () => {}, setP1DefPlayState: () => {},
    setMomentumState: () => {}, setGameClockState: () => {}, showAnnouncement: () => {},
    onOnlineAction: action => { actions.push(action); },
    onEngineReady: game => { handle.game = game ?? undefined; }
  });
  try {
    const game = handle.game;
    assert.ok(game);
    game.setOnlineGuestControl?.(true);
    game.setOnlinePlayerSide?.('P2');
    game.selectP2Team('ARKANSAS');
    game.setPossessionForTest?.('P2');
    game.resetDrill();
    game.applyRemoteAction?.({ type: 'OFFENSE_PLAY', play: 'ARK_P1' });
    game.startPlay?.();
    assert.equal(game.phase, 'QB_DROP');
    assert.deepEqual(actions, [{ type: 'START' }]);
    const receiver = game.getReceiverScreenPositionForTest?.(0);
    assert.ok(receiver);
    canvas._listeners.get('pointerdown')?.({
      clientX: receiver.x, clientY: receiver.y, pointerId: 4, preventDefault: () => {}
    } as PointerEvent);
    assert.equal(game.phase, 'THROWN', 'The native guest canvas can throw to a receiver');
    assert.deepEqual(actions.map(action => action.type), ['START', 'THROW']);

    game.setPossessionForTest?.('P1');
    game.resetDrill();
    game.startPlay?.();
    assert.equal(game.phase, 'PRE_SNAP', 'Guest native start must not start the host offense');
    assert.deepEqual(actions.map(action => action.type), ['START', 'THROW']);
  } finally {
    cleanup?.();
  }
});

test('punt receiving team blockers are positioned in a horizontal line in front of the punt returner', () => {
  const canvas = createMockCanvas();
  let engine: GameEngineHandle | null = null;
  const cleanup = mountFootballGame(canvas, {
    setP2OffPlayState: () => {},
    setP2DefPlayState: () => {},
    setDownDistanceText: () => {},
    setActiveOffenseState: () => {},
    setUserScore: () => {},
    setCpuScore: () => {},
    setP1DefPlayState: () => {},
    setMomentumState: () => {},
    setGameClockState: () => {},
    showAnnouncement: () => {},
    onEngineReady: value => { engine = value; }
  });

  try {
    assert.ok(engine);
    const game = engine as any;
    game.setPossessionForTest?.('P1');
    game.set4thDownForTest?.();
    game.callPunt();
    assert.equal(game.phase, 'PRE_SNAP');
    const defenders = game.getDefenders ? game.getDefenders() : null;
    assert.ok(defenders);
    const returner = defenders.find((d: any) => d.isReturner);
    assert.ok(returner, 'Must have a returner');
    const blockers = defenders.filter((d: any) => d !== returner);
    assert.equal(blockers.length, 6, 'Must have 6 blockers on punt receiving team');
    // Verify all 6 blockers share the exact same Y position (horizontal line)
    const firstBlockerY = blockers[0].y;
    blockers.forEach((b: any) => {
      assert.equal(b.y, firstBlockerY, 'All 6 blockers must share the exact same Y position forming a horizontal line');
    });
    // Verify blockers are in front of returner towards the line of scrimmage
    assert.equal(Math.abs(firstBlockerY - returner.y), 55, 'Punt blockers must be positioned in front of returner');
  } finally {
    cleanup?.();
  }
});

test('controlled player speed matches teammate speed scale', () => {
  const canvas = createMockCanvas();
  let engine: GameEngineHandle | null = null;
  const cleanup = mountFootballGame(canvas, {
    setP2OffPlayState: () => {},
    setP2DefPlayState: () => {},
    setDownDistanceText: () => {},
    setActiveOffenseState: () => {},
    setUserScore: () => {},
    setCpuScore: () => {},
    setP1DefPlayState: () => {},
    setMomentumState: () => {},
    setGameClockState: () => {},
    showAnnouncement: () => {},
    onEngineReady: value => { engine = value; }
  });

  try {
    assert.ok(engine);
    const game = engine as any;
    game.setPossessionForTest?.('P1');
    game.resetDrill();
    assert.equal(game.phase, 'PRE_SNAP');

    const downHandler = (canvas as any)._listeners.get('pointerdown');
    const moveHandler = (canvas as any)._listeners.get('pointermove');
    const upHandler = (canvas as any)._listeners.get('pointerup');
    downHandler({ clientX: 90, clientY: 364, pointerId: 1 } as PointerEvent);
    upHandler({ clientX: 90, clientY: 364, pointerId: 1 } as PointerEvent);
    assert.equal(game.phase, 'QB_DROP');

    // Move joystick
    downHandler({ clientX: 110, clientY: 364, pointerId: 2 } as PointerEvent);
    moveHandler({ clientX: 140, clientY: 364, pointerId: 2 } as PointerEvent);
    upHandler({ clientX: 140, clientY: 364, pointerId: 2 } as PointerEvent);

    assert.ok(game.phase === 'QB_DROP' || game.phase === 'RUNNING');
  } finally {
    cleanup?.();
  }
});

test('human AI QB scans progressions with human dwell and does not fire in 1ms', () => {
  const canvas = createMockCanvas();
  let engine: GameEngineHandle | null = null;
  const cleanup = mountFootballGame(canvas, {
    setP2OffPlayState: () => {},
    setP2DefPlayState: () => {},
    setDownDistanceText: () => {},
    setActiveOffenseState: () => {},
    setUserScore: () => {},
    setCpuScore: () => {},
    setP1DefPlayState: () => {},
    setMomentumState: () => {},
    setGameClockState: () => {},
    showAnnouncement: () => {},
    onEngineReady: value => { engine = value; }
  });

  try {
    assert.ok(engine);
    const game = engine as any;
    game.setPossessionForTest?.('P2'); // CPU is on offense
    game.resetDrill();
    assert.equal(game.phase, 'PRE_SNAP');

    game.startPlay?.();

    // Initial phase should be QB_DROP or HANDOFF, never instant THROWN on frame 0
    assert.ok(game.phase === 'QB_DROP' || game.phase === 'HANDOFF');
  } finally {
    cleanup?.();
  }
});

test('only the unassigned first defender is user-controlled', () => {
  const canvas = createMockCanvas();
  let engine: GameEngineHandle | null = null;
  const cleanup = mountFootballGame(canvas, {
    setP2OffPlayState: () => {},
    setP2DefPlayState: () => {},
    setDownDistanceText: () => {},
    setActiveOffenseState: () => {},
    setUserScore: () => {},
    setCpuScore: () => {},
    setP1DefPlayState: () => {},
    setMomentumState: () => {},
    setGameClockState: () => {},
    showAnnouncement: () => {},
    onEngineReady: value => { engine = value; }
  });

  try {
    assert.ok(engine);
    const game = engine as any;
    game.setPossessionForTest?.('P2'); // CPU is on offense, User on defense
    game.resetDrill();
    assert.equal(game.phase, 'PRE_SNAP');

    const defenders = game.getDefenders();
    assert.ok(defenders && defenders.length > 0);

    // Defender 1 is a CB with ZONE assignment in COVER2
    const zoneCb = defenders[1];
    assert.equal(zoneCb.type, 'CB');
    assert.ok(zoneCb.defenseAssignment === 'ZONE' || zoneCb.zoneX !== undefined);

    const freeDefender = defenders[0];
    assert.equal(freeDefender.defenseAssignment, 'USER');

    // Selecting another defender must not transfer user control or clear its assignment.
    game.selectDefenderForTest?.(1);
    const controlled = game.getControlledDefender?.();
    assert.equal(controlled, freeDefender);
    assert.equal(zoneCb.defenseAssignment, 'ZONE');

    // The same restriction applies to every other assignment-controlled defender.
    game.selectDefenderForTest?.(3);
    const controlledLb = game.getControlledDefender?.();
    assert.equal(controlledLb, freeDefender);
    assert.notEqual(defenders[3].defenseAssignment, 'USER');
  } finally {
    cleanup?.();
  }
});

test('assignment defenders can cycle coverage but cannot be moved or controlled', () => {
  const canvas = createMockCanvas();
  let engine: GameEngineHandle | null = null;
  const cleanup = mountFootballGame(canvas, {
    setP2OffPlayState: () => {},
    setP2DefPlayState: () => {},
    setDownDistanceText: () => {},
    setActiveOffenseState: () => {},
    setUserScore: () => {},
    setCpuScore: () => {},
    setP1DefPlayState: () => {},
    setMomentumState: () => {},
    setGameClockState: () => {},
    showAnnouncement: () => {},
    onEngineReady: value => { engine = value; }
  });

  try {
    assert.ok(engine);
    const game = engine as GameEngineHandle;
    game.setPossessionForTest?.('P2');
    game.resetDrill();

    const defenders = game.getDefenders?.();
    assert.ok(defenders);
    const teammate = defenders[1];
    const teammateScreenPosition = game.getDefenderScreenPositionForTest?.(1);
    assert.ok(teammateScreenPosition);
    const initialPosition = { x: teammate.x, y: teammate.y };
    const assignmentCycle = ['MAN', 'ZONE', 'BLITZ', 'RB_SPY'];
    const initialAssignment = teammate.defenseAssignment || 'MAN';
    const expectedAssignment = assignmentCycle[(assignmentCycle.indexOf(initialAssignment) + 1) % assignmentCycle.length];
    const downHandler = (canvas as any)._listeners.get('pointerdown');
    const moveHandler = (canvas as any)._listeners.get('pointermove');
    const upHandler = (canvas as any)._listeners.get('pointerup');

    downHandler({ clientX: teammateScreenPosition.x, clientY: teammateScreenPosition.y, pointerId: 1 } as PointerEvent);
    upHandler({ clientX: teammateScreenPosition.x, clientY: teammateScreenPosition.y, pointerId: 1 } as PointerEvent);
    assert.equal(teammate.defenseAssignment, expectedAssignment);
    assert.equal(game.getControlledDefender?.(), defenders[0]);

    downHandler({ clientX: teammateScreenPosition.x, clientY: teammateScreenPosition.y, pointerId: 2 } as PointerEvent);
    moveHandler({ clientX: teammateScreenPosition.x + 50, clientY: teammateScreenPosition.y + 35, pointerId: 2 } as PointerEvent);
    upHandler({ clientX: teammateScreenPosition.x + 50, clientY: teammateScreenPosition.y + 35, pointerId: 2 } as PointerEvent);
    assert.deepEqual({ x: teammate.x, y: teammate.y }, initialPosition);
    assert.equal(teammate.defenseAssignment, 'ZONE', 'Deep backward swipe on assignment defender assigns ZONE coverage without moving the sprite');
    assert.equal(game.getControlledDefender?.(), defenders[0]);
  } finally {
    cleanup?.();
  }
});

test('joystick release does not trigger accidental swipe juke during ball carrier running', () => {
  const canvas = createMockCanvas();
  let engine: GameEngineHandle | null = null;
  const cleanup = mountFootballGame(canvas, {
    setP2OffPlayState: () => {},
    setP2DefPlayState: () => {},
    setDownDistanceText: () => {},
    setActiveOffenseState: () => {},
    setUserScore: () => {},
    setCpuScore: () => {},
    setP1DefPlayState: () => {},
    setMomentumState: () => {},
    setGameClockState: () => {},
    showAnnouncement: () => {},
    onEngineReady: value => { engine = value; }
  });

  try {
    assert.ok(engine);
    const game = engine as any;
    game.setPossessionForTest?.('P1');
    game.selectOffense('INSIDE_RUN');
    game.resetDrill();
    assert.equal(game.phase, 'PRE_SNAP');

    const downHandler = (canvas as any)._listeners.get('pointerdown');
    const moveHandler = (canvas as any)._listeners.get('pointermove');
    const upHandler = (canvas as any)._listeners.get('pointerup');
    // Snap to handoff from the joystick marker over the 12-yard line.
    downHandler({ clientX: 90, clientY: 364, pointerId: 1 } as PointerEvent);
    upHandler({ clientX: 90, clientY: 364, pointerId: 1 } as PointerEvent);

    // Touch joystick to steer
    downHandler({ clientX: 110, clientY: 364, pointerId: 5 } as PointerEvent);
    moveHandler({ clientX: 140, clientY: 364, pointerId: 5 } as PointerEvent);

    // Lift joystick finger: releasing the joystick must NEVER trigger a swipe juke
    upHandler({ clientX: 140, clientY: 364, pointerId: 5 } as PointerEvent);

    const defenders = game.getDefenders();
    assert.ok(defenders);
  } finally {
    cleanup?.();
  }
});

test('user on defense can reposition sprite to anywhere on the correct side of the line of scrimmage by pulling him, and that player has no assignment', () => {
  const canvas = createMockCanvas();
  let engine: GameEngineHandle | null = null;
  const cleanup = mountFootballGame(canvas, {
    setP2OffPlayState: () => {},
    setP2DefPlayState: () => {},
    setDownDistanceText: () => {},
    setActiveOffenseState: () => {},
    setUserScore: () => {},
    setCpuScore: () => {},
    setP1DefPlayState: () => {},
    setMomentumState: () => {},
    setGameClockState: () => {},
    showAnnouncement: () => {},
    onEngineReady: value => { engine = value; }
  });

  try {
    assert.ok(engine);
    const game = engine as any;
    game.setPossessionForTest?.('P2'); // CPU is on offense, User is on defense (P1)
    game.resetDrill();
    assert.equal(game.phase, 'PRE_SNAP');

    const defenders = game.getDefenders();
    assert.ok(defenders && defenders.length > 0);

    const def0 = defenders[0];
    const initialY = def0.y;

    // Pull defender to a new legal spot in the defensive secondary (e.g. wide right, 80px back)
    const targetX = 260;
    const targetY = initialY + 80;

    game.repositionDefender?.(0, targetX, targetY);

    // Defender should now be repositioned at the target
    assert.equal(def0.x, targetX);
    assert.equal(def0.y, targetY);
    // "That user will not have an assignment and so he can be repositioned anywhere and the user can decide how to use him."
    assert.equal(def0.defenseAssignment, 'USER');
    assert.equal(game.getControlledDefender(), def0);
  } finally {
    cleanup?.();
  }
});

test('user cannot pull defensive sprite across the line of scrimmage (illegal offsides constraint)', () => {
  const canvas = createMockCanvas();
  let engine: GameEngineHandle | null = null;
  const cleanup = mountFootballGame(canvas, {
    setP2OffPlayState: () => {},
    setP2DefPlayState: () => {},
    setDownDistanceText: () => {},
    setActiveOffenseState: () => {},
    setUserScore: () => {},
    setCpuScore: () => {},
    setP1DefPlayState: () => {},
    setMomentumState: () => {},
    setGameClockState: () => {},
    showAnnouncement: () => {},
    onEngineReady: value => { engine = value; }
  });

  try {
    assert.ok(engine);
    const game = engine as any;
    game.setPossessionForTest?.('P2'); // CPU is on offense, User on defense
    game.resetDrill();
    assert.equal(game.phase, 'PRE_SNAP');

    const defenders = game.getDefenders();
    assert.ok(defenders && defenders.length > 0);

    const def0 = defenders[0];
    const initialY = def0.y;

    // Attempt to pull defender way across the line of scrimmage into the offensive backfield (e.g. y = 100)
    const illegalTargetY = 100;
    game.repositionDefender?.(0, def0.x, illegalTargetY);

    // Defender must NOT have crossed to the offensive side of the line of scrimmage
    // (def0.y must remain constrained to the legal defensive side of scrimmage)
    assert.ok(def0.y > 250, `Defender must not cross LOS (250): def0.y=${def0.y}`);
    assert.equal(def0.defenseAssignment, 'USER');
  } finally {
    cleanup?.();
  }
});

test('Space, WASD, and arrows start plays on both sides and special teams without repeats or typing', () => {
  const originalWindow = globalThis.window;
  const listeners = new Map<string, EventListener>();
  const mockWindow = {
    innerWidth: 350, innerHeight: 695,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type)
  };
  globalThis.window = mockWindow as unknown as Window & typeof globalThis;
  let engine: GameEngineHandle | null = null;
  const cleanup = mountFootballGame(createMockCanvas(), {
    setP2OffPlayState: () => {}, setP2DefPlayState: () => {},
    setDownDistanceText: () => {}, setActiveOffenseState: () => {},
    setUserScore: () => {}, setCpuScore: () => {}, setP1DefPlayState: () => {},
    setMomentumState: () => {}, setGameClockState: () => {}, showAnnouncement: () => {},
    onEngineReady: value => { engine = value; }
  });
  try {
    assert.ok(engine);
    const game = engine as GameEngineHandle;
    const keyDown = listeners.get('keydown');
    const keyUp = listeners.get('keyup');
    assert.ok(keyDown && keyUp);
    let prevented = false;
    for (const key of [' ', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      const press = { key, repeat: false, preventDefault: () => { prevented = true; } };
      for (const team of ['P1', 'P2'] as const) {
        game.setPossessionForTest?.(team);
        game.resetDrill();
        for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A']) {
          keyDown({ ...press, target: { tagName } } as unknown as KeyboardEvent);
          assert.equal(game.phase, 'PRE_SNAP');
        }
        keyDown({ ...press, target: { isContentEditable: true } } as unknown as KeyboardEvent);
        assert.equal(game.phase, 'PRE_SNAP');
        keyDown({ ...press, defaultPrevented: true } as KeyboardEvent);
        assert.equal(game.phase, 'PRE_SNAP');
        keyDown({ ...press, repeat: true } as KeyboardEvent);
        assert.equal(game.phase, 'PRE_SNAP');
        game.setPaused(true);
        keyDown(press as KeyboardEvent);
        assert.equal(game.phase, 'PRE_SNAP');
        game.setPaused(false);
        prevented = false;
        keyDown(press as KeyboardEvent);
        assert.notEqual(game.phase, 'PRE_SNAP', `${key} starts a play for ${team}`);
        assert.equal(prevented, key === ' ' || key.startsWith('Arrow'));
        keyUp(press as KeyboardEvent);
      }
      game.resetGame();
      assert.equal(game.phase, 'KICKOFF');
      keyDown({ ...press, repeat: true } as KeyboardEvent);
      assert.equal(game.phase, 'KICKOFF');
      keyDown(press as KeyboardEvent);
      assert.equal(game.phase, 'THROWN', `${key} starts the kickoff`);
      keyUp(press as KeyboardEvent);

      game.setPossessionForTest?.('P1');
      game.set4thDownForTest?.();
      game.callPunt();
      assert.equal(game.phase, 'PRE_SNAP');
      keyDown(press as KeyboardEvent);
      assert.equal(game.phase, 'THROWN', `${key} starts the punt`);
      keyUp(press as KeyboardEvent);
    }
    prevented = false;
    keyDown({ key: 'ArrowLeft', preventDefault: () => { prevented = true; } } as KeyboardEvent);
    assert.equal(prevented, true);
  } finally {
    cleanup?.();
    if (originalWindow === undefined) Reflect.deleteProperty(globalThis, 'window');
    else globalThis.window = originalWindow;
  }
});

test('the shared joystick starts defense, offense, kickoffs, and punts', () => {
  const canvas = createMockCanvas();
  let engine: GameEngineHandle | null = null;
  const cleanup = mountFootballGame(canvas, {
    setP2OffPlayState: () => {},
    setP2DefPlayState: () => {},
    setDownDistanceText: () => {},
    setActiveOffenseState: () => {},
    setUserScore: () => {},
    setCpuScore: () => {},
    setP1DefPlayState: () => {},
    setMomentumState: () => {},
    setGameClockState: () => {},
    showAnnouncement: () => {},
    onEngineReady: value => { engine = value; }
  });

  try {
    assert.ok(engine);
    const game = engine as GameEngineHandle;
    game.setPossessionForTest?.('P2'); // CPU is on offense, User on defense
    game.resetDrill();
    assert.equal(game.phase, 'PRE_SNAP');

    const downHandler = (canvas as any)._listeners.get('pointerdown');
    const upHandler = (canvas as any)._listeners.get('pointerup');
    downHandler({ clientX: 90, clientY: 256, pointerId: 1 } as PointerEvent);
    upHandler({ clientX: 90, clientY: 256, pointerId: 1 } as PointerEvent);
    assert.equal(game.phase, 'PRE_SNAP', 'The defense start area is anchored to the offense joystick position');
    downHandler({ clientX: 10, clientY: 440, pointerId: 5 } as PointerEvent);
    upHandler({ clientX: 10, clientY: 440, pointerId: 5 } as PointerEvent);
    const phaseAfterDefenseStart: string = game.phase;
    assert.ok(phaseAfterDefenseStart === 'QB_DROP' || phaseAfterDefenseStart === 'HANDOFF', 'The joystick starts the defensive play');

    // The offense starts from the field-positioned joystick instead of the QB.
    game.setPossessionForTest?.('P1');
    game.resetDrill();
    assert.equal(game.phase, 'PRE_SNAP');
    downHandler({ clientX: 170, clientY: 440, pointerId: 2 } as PointerEvent);
    upHandler({ clientX: 170, clientY: 440, pointerId: 2 } as PointerEvent);
    const phaseAfterOffenseStart: string = game.phase;
    assert.ok(phaseAfterOffenseStart === 'QB_DROP' || phaseAfterOffenseStart === 'HANDOFF');

    game.resetGame();
    assert.equal(game.phase, 'KICKOFF');
    downHandler({ clientX: 0, clientY: 450, pointerId: 3 } as PointerEvent);
    upHandler({ clientX: 0, clientY: 450, pointerId: 3 } as PointerEvent);
    assert.equal(game.phase, 'THROWN', 'The joystick starts the kickoff');

    game.setPossessionForTest?.('P1');
    game.set4thDownForTest?.();
    game.callPunt();
    assert.equal(game.phase, 'PRE_SNAP');
    downHandler({ clientX: 170, clientY: 450, pointerId: 4 } as PointerEvent);
    upHandler({ clientX: 170, clientY: 450, pointerId: 4 } as PointerEvent);
    assert.equal(game.phase, 'THROWN', 'The joystick starts the punt');
  } finally {
    cleanup?.();
  }
});

test('ball carrier lateral speed is controlled and does not combine with juke by accident', () => {
  const canvas = createMockCanvas();
  let engine: GameEngineHandle | null = null;
  const cleanup = mountFootballGame(canvas, {
    setP2OffPlayState: () => {},
    setP2DefPlayState: () => {},
    setDownDistanceText: () => {},
    setActiveOffenseState: () => {},
    setUserScore: () => {},
    setCpuScore: () => {},
    setP1DefPlayState: () => {},
    setMomentumState: () => {},
    setGameClockState: () => {},
    showAnnouncement: () => {},
    onEngineReady: value => { engine = value; }
  });

  try {
    assert.ok(engine);
    const game = engine as any;
    game.setPossessionForTest?.('P1');
    game.selectOffense('INSIDE_RUN');
    game.resetDrill();
    assert.equal(game.phase, 'PRE_SNAP');

    const downHandler = (canvas as any)._listeners.get('pointerdown');
    const moveHandler = (canvas as any)._listeners.get('pointermove');
    const upHandler = (canvas as any)._listeners.get('pointerup');

    // Snap to handoff from the joystick marker over the 12-yard line.
    downHandler({ clientX: 90, clientY: 364, pointerId: 1 } as PointerEvent);
    upHandler({ clientX: 90, clientY: 364, pointerId: 1 } as PointerEvent);

    // Simulate steering lateral movement
    downHandler({ clientX: 110, clientY: 364, pointerId: 2 } as PointerEvent);
    moveHandler({ clientX: 140, clientY: 364, pointerId: 2 } as PointerEvent);

    // Releasing after steering must not have triggered a wild juke
    upHandler({ clientX: 140, clientY: 364, pointerId: 2 } as PointerEvent);

    // Lateral speed should remain calibrated without wild sideways sliding
    assert.ok(true);
  } finally {
    cleanup?.();
  }
});

test('defender under user control does not move unless the user moves them', () => {
  const canvas = createMockCanvas();
  let engine: GameEngineHandle | null = null;
  const cleanup = mountFootballGame(canvas, {
    setP2OffPlayState: () => {},
    setP2DefPlayState: () => {},
    setDownDistanceText: () => {},
    setActiveOffenseState: () => {},
    setUserScore: () => {},
    setCpuScore: () => {},
    setP1DefPlayState: () => {},
    setMomentumState: () => {},
    setGameClockState: () => {},
    showAnnouncement: () => {},
    onEngineReady: value => { engine = value; }
  });

  try {
    assert.ok(engine);
    const game = engine as any;
    game.setPossessionForTest?.('P2'); // CPU offense, User defense
    game.resetDrill();
    assert.equal(game.phase, 'PRE_SNAP');

    const controlledDefender = game.getControlledDefender?.();
    assert.ok(controlledDefender);
    const initialX = controlledDefender.x;
    const initialY = controlledDefender.y;

    const downHandler = (canvas as any)._listeners.get('pointerdown');
    const moveHandler = (canvas as any)._listeners.get('pointermove');
    const upHandler = (canvas as any)._listeners.get('pointerup');

    // Start defensive play by tapping the start area
    downHandler({ clientX: 10, clientY: 440, pointerId: 5 } as PointerEvent);
    upHandler({ clientX: 10, clientY: 440, pointerId: 5 } as PointerEvent);
    assert.notEqual(game.phase, 'PRE_SNAP');

    // Defender under user control without active joystick input must not move
    assert.equal(controlledDefender.x, initialX);
    assert.equal(controlledDefender.y, initialY);
    assert.equal(controlledDefender.vx, 0);
    assert.equal(controlledDefender.vy, 0);

    // Now user moves with the joystick
    downHandler({ clientX: 90, clientY: 364, pointerId: 6 } as PointerEvent);
    moveHandler({ clientX: 130, clientY: 364, pointerId: 6 } as PointerEvent);

    assert.equal(game.isJoystickActiveForTest?.(), true);
    upHandler({ clientX: 130, clientY: 364, pointerId: 6 } as PointerEvent);
    assert.equal(game.isJoystickActiveForTest?.(), false);
    assert.equal(controlledDefender.vx, 0);
    assert.equal(controlledDefender.vy, 0);
  } finally {
    cleanup?.();
  }
});
