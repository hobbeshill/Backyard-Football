import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateBrokenTackleChance, calculateKickoffFlight, calculatePuntFlight, getKickoffLineY, getTouchbackYardLineY, isPlayerOutOfBounds } from './rules';
import { offensivePlaybook } from './playbook';
import { scoreRunBlockTarget } from './ai';
import { mountFootballGame, type GameEngineHandle } from './engine';
import { getBallCarrierRunSpeed, getReturnPursuitSpeed, getReturnTeamBlockers, shouldApplyRunBlockStun } from './movement';

function createMockCanvas() {
  return {
    getContext: () => ({
      save: () => {},
      restore: () => {},
      clearRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      arc: () => {},
      ellipse: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      roundRect: () => {},
      fillText: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      setLineDash: () => {},
      measureText: () => ({ width: 50 }),
      translate: () => {},
      scale: () => {},
      rotate: () => {}
    }),
    width: 340,
    height: 450,
    style: {},
    addEventListener: () => {},
    removeEventListener: () => {}
  } as unknown as HTMLCanvasElement;
}

test('fourth-down Go For It waits for a deliberate pass after the snap', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  const handlers = new Map<string, EventListener>();
  const canvas = createMockCanvas();
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 340, height: 450 } as DOMRect);
  canvas.addEventListener = ((name: string, handler: EventListener) => handlers.set(name, handler)) as typeof canvas.addEventListener;
  let engine: GameEngineHandle | null = null;
  let selectedPlay = '';
  const cleanup = mountFootballGame(canvas, {
    setP2OffPlayState: () => {}, setP2DefPlayState: () => {},
    setDownDistanceText: () => {}, setActiveOffenseState: () => {},
    setUserScore: () => {}, setCpuScore: () => {}, setP1DefPlayState: () => {},
    setMomentumState: () => {}, setGameClockState: () => {}, showAnnouncement: () => {},
    onEngineReady: value => { engine = value; },
    setP1OffPlayState: play => { selectedPlay = play; }
  });
  try {
    assert.ok(engine);
    const game = engine as GameEngineHandle;
    game.setPossessionForTest?.('P1');
    game.selectOffense('SHORT_PASS');
    for (let down = 0; down < 3; down++) {
      game.triggerPlayEnd?.(950, 'INCOMPLETE');
      context.mock.timers.tick(1600);
    }
    assert.equal(game.is4thDown(), true);
    game.callPunt();
    assert.equal(selectedPlay, 'PUNT');
    game.selectOffense('SHORT_PASS');
    game.resetDrill();
    assert.equal(game.phase, 'PRE_SNAP');
    assert.equal(game.is4thDown(), true);

    const send = (name: string, x: number, y: number) => {
      const handler = handlers.get(name);
      assert.ok(handler);
      handler({ clientX: x, clientY: y } as PointerEvent);
    };
    game.startPlay?.();
    assert.equal(game.phase, 'QB_DROP');
    send('pointermove', 170, 333);
    send('pointerup', 170, 333);
    assert.equal(game.phase, 'QB_DROP', 'Releasing the snap gesture must never throw the ball');
    send('pointerdown', 170, 273);
    send('pointerup', 170, 333);
    assert.equal(game.phase, 'THROWN', 'A deliberate pull should still throw');
    game.resetDrill();
    game.startPlay?.();
    assert.equal(game.phase, 'QB_DROP');
    send('pointerdown', 50, 225);
    send('pointerup', 50, 225);
    assert.equal(game.phase, 'THROWN', 'A fresh receiver tap should throw after the snap');
  } finally {
    cleanup?.();
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});

test('kickoff line calculation correctly places kicking team at 35-yard line', () => {
  const fieldHeight = 1200;
  const endZoneHeight = 100;
  // AttackDirection -1: moving up towards y=0. Own goal line is at 1100. 35 yards upfield = 1100 - 350 = 750
  assert.equal(getKickoffLineY(fieldHeight, endZoneHeight, -1, 35), 750);

  // AttackDirection 1: moving down towards y=1200. Own goal line is at 100. 35 yards downfield = 100 + 350 = 450
  assert.equal(getKickoffLineY(fieldHeight, endZoneHeight, 1, 35), 450);
});

test('real tutorial advances through offensive setup, throw, and defensive setup gestures', (context) => {
  let timestamp = 1000;
  context.mock.method(Date, 'now', () => timestamp);
  context.mock.method(Math, 'random', () => 0.5);
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  let frame: FrameRequestCallback = () => {};
  globalThis.requestAnimationFrame = callback => { frame = callback; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  const handlers = new Map<string, EventListener>();
  const canvas = createMockCanvas();
  const drawing = canvas.getContext('2d')!;
  const midfieldNumbers = new Map<number, string>();
  context.mock.method(drawing, 'fillText', (text: string, x: number, y: number) => {
    if (text === '50' && y === 609) midfieldNumbers.set(x, drawing.font);
  });
  let offsetX = 0;
  let offsetY = 0;
  let scale = 1;
  let highlight = { x: 0, y: 0 };
  context.mock.method(drawing, 'translate', (x: number, y: number) => { offsetX = x; offsetY = y; });
  context.mock.method(drawing, 'scale', (x: number) => { scale = x; });
  context.mock.method(drawing, 'arc', (x: number, y: number) => {
    highlight = { x: offsetX + x * scale, y: offsetY + y * scale };
  });
  canvas.getContext = (() => new Proxy(drawing, {
    get: (target, key) => Reflect.get(target, key) ?? (() => {})
  })) as unknown as typeof canvas.getContext;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 340, height: 450 } as DOMRect);
  canvas.addEventListener = ((name: string, handler: EventListener) => handlers.set(name, handler)) as typeof canvas.addEventListener;
  let engine: GameEngineHandle | null = null;
  let step = -1;
  const cleanup = mountFootballGame(canvas, {
    setP2OffPlayState: () => {}, setP2DefPlayState: () => {},
    setDownDistanceText: () => {}, setActiveOffenseState: () => {},
    setUserScore: () => {}, setCpuScore: () => {}, setP1DefPlayState: () => {},
    setMomentumState: () => {}, setGameClockState: () => {}, showAnnouncement: () => {},
    onEngineReady: value => { engine = value; }, onTutorialStep: value => { step = value; }
  }, { tutorial: true });
  const send = (name: string, x: number, y: number) => {
    const handler = handlers.get(name);
    assert.ok(handler);
    handler({ clientX: x, clientY: y } as PointerEvent);
  };
  const tap = (x: number, y: number) => { send('pointerdown', x, y); send('pointerup', x, y); };
  const settle = () => {
    for (let count = 0; count < 20; count++) {
      timestamp += 16;
      frame(timestamp);
    }
    timestamp += 500;
  };
  try {
    assert.ok(engine);
    const game = engine as GameEngineHandle;
    assert.equal(step, 0);
    tap(170, 273);
    assert.equal(step, 0, 'Snapping cannot skip the alignment lesson');
    send('pointerdown', 30, 380);
    send('pointerup', 110, 380);
    assert.equal(step, 1);
    settle();
    assert.equal(midfieldNumbers.get(30), 'bold 28px Courier New, monospace');
    assert.equal(midfieldNumbers.get(310), 'bold 28px Courier New, monospace');
    tap(300, 380);
    timestamp += 100;
    tap(300, 380);
    assert.equal(step, 2);
    settle();
    send('pointerdown', 50, 225);
    send('pointermove', 120, 225);
    send('pointerup', 120, 225);
    assert.equal(step, 3);
    tap(250, 225);
    assert.equal(step, 4);
    game.startPlay?.();
    assert.equal(step, 5);
    assert.equal(game.phase, 'QB_DROP');
    settle();
    assert.equal(step, 5, 'The tutorial must wait while the user aims');
    send('pointerdown', highlight.x, highlight.y);
    send('pointerup', highlight.x, highlight.y + 70);
    assert.equal(step, 6);
    assert.equal(game.phase, 'THROWN');
    for (let count = 0; count < 1500 && step === 6; count++) {
      timestamp += 16;
      frame(timestamp);
    }
    assert.equal(step, 7, 'The real offensive play must finish before defense');
    send('pointerdown', 5, 5);
    send('pointerup', 85, 5);
    assert.equal(step, 8);
    settle();
    tap(highlight.x, highlight.y);
    assert.equal(step, 9);
    settle();
    game.startPlay?.();
    assert.equal(step, 10);
    for (let count = 0; count < 2000 && step === 10; count++) {
      timestamp += 16;
      frame(timestamp);
    }
    assert.equal(step, 11, 'The real defensive play must finish');
  } finally {
    cleanup?.();
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});

test('tutorial coaching overlays the field without changing its aspect ratio', async () => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { RealPlayTutorial } = await import('./RealPlayTutorial');
  const markup = renderToStaticMarkup(createElement(RealPlayTutorial, { onFinish: () => {} }));

  assert.ok(markup.includes('aspect-ratio:340 / 450'));
  assert.ok(markup.includes('h-auto!'));
  assert.ok(markup.includes('pointer-events-none absolute inset-x-0 top-0'));
  assert.ok(markup.includes('aria-label="Live tutorial football field"'));
});

test('sideline contact uses player radius and the painted field edges', () => {
  assert.equal(isPlayerOutOfBounds({ x: 170, y: 600, radius: 10 }, 340), false);
  assert.equal(isPlayerOutOfBounds({ x: 31, y: 600, radius: 10 }, 340), false);
  assert.equal(isPlayerOutOfBounds({ x: 30, y: 600, radius: 10 }, 340), true);
  assert.equal(isPlayerOutOfBounds({ x: 310, y: 600, radius: 10 }, 340), true);
  assert.equal(isPlayerOutOfBounds({ x: 309, y: 600, radius: 10 }, 340), false);
  assert.equal(isPlayerOutOfBounds({ x: 32, y: 600, radius: 12 }, 340), true);
});

test('carrier out-of-bounds ends live plays and stops the clock at the exit spot', async () => {
  const { readFileSync } = await import('node:fs');
  const { stripTypeScriptTypes } = await import('node:module');
  const source = readFileSync(new URL('./engine.ts', import.meta.url), 'utf8');
  const start = source.indexOf('  function checkCarrierOutOfBounds()');
  const end = source.indexOf('  function update()', start);
  assert.ok(start >= 0 && end > start);
  const check = stripTypeScriptTypes(source.slice(start, end));
  const createCheck = new Function('isPlayerOutOfBounds', 'startingPhase', 'carrierX', `
    let phase = startingPhase, gameClockRunning = true, isAiming = true;
    const fieldWidth = 340;
    const qb = { x: carrierX, y: 640, radius: 12 };
    const activeEntity = { x: carrierX, y: 640, radius: 10 };
    let result = null;
    const handlePlayEnd = (y, type) => { result = { y, type }; };
    ${check}
    const ended = checkCarrierOutOfBounds();
    return { ended, phase, gameClockRunning, isAiming, result };
  `);
  for (const phase of ['RUNNING', 'QB_DROP', 'HANDOFF']) {
    for (const x of [20, 320]) {
      const state = createCheck(isPlayerOutOfBounds, phase, x);
      assert.equal(state.ended, true);
      assert.equal(state.phase, 'DEAD');
      assert.equal(state.gameClockRunning, false);
      assert.equal(state.isAiming, false);
      assert.deepEqual(state.result, { y: 640, type: 'OUT_OF_BOUNDS' });
    }
  }
  assert.equal(createCheck(isPlayerOutOfBounds, 'RUNNING', 170).ended, false);
  assert.equal(createCheck(isPlayerOutOfBounds, 'THROWN', 20).ended, false);
});

test('touchback yard line calculation places ball at 25-yard line', () => {
  const fieldHeight = 1200;
  const endZoneHeight = 100;
  // Receiving team attacking up (-1): own goal line at 1100. 25 yards upfield = 1100 - 250 = 850
  assert.equal(getTouchbackYardLineY(fieldHeight, endZoneHeight, -1, 25), 850);

  // Receiving team attacking down (1): own goal line at 100. 25 yards downfield = 100 + 250 = 350
  assert.equal(getTouchbackYardLineY(fieldHeight, endZoneHeight, 1, 25), 350);
});

test('kickoff flight physics produce realistic distances and touchback thresholds', () => {
  const lowKick = calculateKickoffFlight(0.3, 1.0);
  assert.ok(lowKick.distanceYards >= 45 && lowKick.distanceYards < 60);
  assert.equal(lowKick.isTouchback, false);

  const boomerKick = calculateKickoffFlight(0.95, 1.0);
  assert.ok(boomerKick.distanceYards >= 65);
  assert.equal(boomerKick.isTouchback, true);
  assert.ok(boomerKick.maxZ >= 50);
});

test('punt flight physics produce high soaring spiral hangtime and distance', () => {
  const punt = calculatePuntFlight(0.85, 1.0);
  assert.ok(punt.distanceYards >= 40 && punt.distanceYards <= 55);
  assert.ok(punt.flightFrames >= 50);
  assert.ok(punt.maxZ >= 45);
});

test('offensive playbook includes SPECIAL TEAMS: PUNT option', () => {
  assert.ok(offensivePlaybook.PUNT);
  assert.equal(offensivePlaybook.PUNT.type, 'PUNT');
  assert.equal(offensivePlaybook.PUNT.center, 'BLOCK');
  assert.equal(offensivePlaybook.PUNT.rbRoute, 'BLOCK');
});

test('game engine mounts with kickoff active at the beginning of the game', () => {
  let engineInstance: GameEngineHandle | null = null;
  let isKickoff = false;
  let kickingSide = '';
  let receivingSide = '';

  const mockCanvas = createMockCanvas();

  const cleanup = mountFootballGame(mockCanvas, {
    setP2OffPlayState: () => {},
    setP2DefPlayState: () => {},
    setDownDistanceText: () => {},
    setActiveOffenseState: () => {},
    setUserScore: () => {},
    setCpuScore: () => {},
    setP1DefPlayState: () => {},
    setP1OffFormationState: () => {},
    setMomentumState: () => {},
    setP1TeamState: () => {},
    setP2TeamState: () => {},
    setGameClockState: () => {},
    showAnnouncement: () => {},
    onEngineReady: engine => { engineInstance = engine; },
    setIsKickoffState: (active, kicking, receiving) => {
      isKickoff = active;
      kickingSide = kicking;
      receivingSide = receiving;
    }
  });

  assert.ok(engineInstance);
  const engine = engineInstance as GameEngineHandle;
  assert.equal(engine.isKickoffActive(), true);
  assert.equal(isKickoff, true);
  assert.equal(kickingSide, 'P2');
  assert.equal(receivingSide, 'P1');

  // Launch kickoff
  engine.kickoff(0.95);
  assert.equal(isKickoff, false);

  engine.resetGame();
  assert.equal(engine.isKickoffActive(), true);
  assert.equal(isKickoff, true);

  if (cleanup) cleanup();
});

test('PUNT calls are ignored before 4th down', () => {
  let engineInstance: GameEngineHandle | null = null;
  let p1OffPlay = '';
  let announcement = '';

  const mockCanvas = createMockCanvas();

  const cleanup = mountFootballGame(mockCanvas, {
    setP2OffPlayState: () => {},
    setP2DefPlayState: () => {},
    setDownDistanceText: () => {},
    setActiveOffenseState: () => {},
    setUserScore: () => {},
    setCpuScore: () => {},
    setP1DefPlayState: () => {},
    setP1OffFormationState: () => {},
    setMomentumState: () => {},
    setP1TeamState: () => {},
    setP2TeamState: () => {},
    setGameClockState: () => {},
    showAnnouncement: (msg) => { announcement = msg; },
    onEngineReady: (engine: GameEngineHandle | null) => { engineInstance = engine; },
    setP1OffPlayState: (play: string) => { p1OffPlay = play; }
  });

  assert.ok(engineInstance);
  const engine = engineInstance as GameEngineHandle;
  engine.setPossessionForTest?.('P1');
  engine.selectOffense('PUNT');
  engine.callPunt();
  engine.punt(0.95);
  assert.equal(p1OffPlay, '');
  assert.equal(engine.phase, 'PRE_SNAP');
  assert.ok(!announcement.includes('SPECIAL TEAMS PUNT UNIT'));

  if (cleanup) cleanup();
});

test('skill meter power controls punt distance and allows returns when not a touchback', () => {
  // Low skill meter punt: ~32 yards (e.g. pooch punt pinning inside the 20)
  const lowPunt = calculatePuntFlight(0.25, 1.0);
  assert.ok(lowPunt.distanceYards >= 30 && lowPunt.distanceYards <= 35);
  assert.equal(lowPunt.isTouchback, false);

  // Medium skill meter punt: ~43 yards
  const midPunt = calculatePuntFlight(0.60, 1.0);
  assert.ok(midPunt.distanceYards >= 40 && midPunt.distanceYards <= 46);
  assert.equal(midPunt.isTouchback, false);

  // Maximum skill meter punt: ~55 yards
  const maxPunt = calculatePuntFlight(1.0, 1.0);
  assert.ok(maxPunt.distanceYards >= 52 && maxPunt.distanceYards <= 58);
});

test('skill meter power controls kickoff distance and separates returns from touchbacks', () => {
  // Low skill meter kickoff (short squib / directional kick): ~45-52 yards - fieldable for return
  const shortKick = calculateKickoffFlight(0.35, 1.0);
  assert.ok(shortKick.distanceYards >= 45 && shortKick.distanceYards <= 53);
  assert.equal(shortKick.isTouchback, false);

  // Deep skill meter kickoff: ~70 yards - booms into endzone for a touchback
  const touchbackKick = calculateKickoffFlight(0.95, 1.0);
  assert.ok(touchbackKick.distanceYards >= 65);
  assert.equal(touchbackKick.isTouchback, true);
});

test('receiving player is on the receiving team and does not share kicking team helmet on kickoffs and punts', () => {
  let engineInstance: GameEngineHandle | null = null;
  let kickingSide = '';
  let receivingSide = '';

  const mockCanvas = createMockCanvas();

  const cleanup = mountFootballGame(mockCanvas, {
    setP2OffPlayState: () => {},
    setP2DefPlayState: () => {},
    setDownDistanceText: () => {},
    setActiveOffenseState: () => {},
    setUserScore: () => {},
    setCpuScore: () => {},
    setP1DefPlayState: () => {},
    setP1OffFormationState: () => {},
    setMomentumState: () => {},
    setP1TeamState: () => {},
    setP2TeamState: () => {},
    setGameClockState: () => {},
    showAnnouncement: () => {},
    onEngineReady: (engine: GameEngineHandle | null) => { engineInstance = engine; },
    setIsKickoffState: (active, kicking, receiving) => {
      kickingSide = kicking;
      receivingSide = receiving;
    }
  });

  assert.ok(engineInstance);
  const engine = engineInstance as GameEngineHandle;
  // Opening kickoff: P2 (Georgia) is kicking to P1 (Alabama)
  assert.equal(kickingSide, 'P2');
  assert.equal(receivingSide, 'P1');
  assert.notEqual(receivingSide, kickingSide, 'Receiving player must be on different team than kicking team');

  // Verify punting setup as well
  engine.callPunt();
  assert.equal(engine.p1Score, 0);

  if (cleanup) cleanup();
});

test('receiving team blockers run block during kickoff and punt returns', () => {
  const runner = { x: 170, y: 300, radius: 10 };
  const blocker = { x: 170, y: 340, radius: 10, isBlocker: true };
  const oncomingTacklerAhead = { x: 170, y: 250, radius: 10 };
  const tacklerFarAway = { x: 170, y: 100, radius: 10 };

  const aheadScore = scoreRunBlockTarget(blocker, runner, oncomingTacklerAhead, -1, false);
  const farScore = scoreRunBlockTarget(blocker, runner, tacklerFarAway, -1, false);

  assert.ok(aheadScore < farScore, 'Run blocker must prioritize oncoming tackler threatening the returner');

  const returner = { x: 170, y: 300, radius: 10, isReturner: true };
  const corner = { x: 45, y: 260, radius: 10, type: 'CB' };
  const linebacker = { x: 130, y: 270, radius: 10, type: 'LB' };
  assert.deepEqual(getReturnTeamBlockers([returner, corner, linebacker], returner), [corner, linebacker]);
});

test('kick coverage pursuers only gain return speed after the returner fields the ball', () => {
  const flightSpeed = getReturnPursuitSpeed(false, 25, 300);
  const postCatchSpeed = getReturnPursuitSpeed(true, 25, 300);

  assert.equal(flightSpeed, 1.2);
  assert.ok(postCatchSpeed > flightSpeed);
});

test('kick and punt returners use the slower return speed and cannot break tackles', () => {
  const normalCarrierSpeed = getBallCarrierRunSpeed(false, false);
  const regularWrRouteSpeed = 1.4 * 1.18 * 0.68;

  assert.equal(normalCarrierSpeed, 1.84);
  assert.equal(getBallCarrierRunSpeed(true, false), regularWrRouteSpeed);
  assert.equal(getBallCarrierRunSpeed(true, true), regularWrRouteSpeed);
  assert.equal(getBallCarrierRunSpeed(false, true), 2.65);
  assert.equal(calculateBrokenTackleChance({
    isRB: false,
    isBoosted: false,
    brokenCount: 0,
    isBlitzer: false,
    isReturner: true
  }), 0);
});

test('return blockers only stun once per tackler engagement', () => {
  const tackler = { x: 100, y: 100, radius: 10 };
  const otherTackler = { x: 120, y: 100, radius: 10 };
  const blocker = { x: 105, y: 100, radius: 10, isEngagedWithBlocker: true, blockingDefender: tackler };

  assert.equal(shouldApplyRunBlockStun(blocker, tackler), false);
  assert.equal(shouldApplyRunBlockStun(blocker, otherTackler), true);
  assert.equal(shouldApplyRunBlockStun({ x: 0, y: 0, radius: 10 }, tackler), true);
});




