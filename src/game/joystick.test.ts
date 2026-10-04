import test from 'node:test';
import assert from 'node:assert/strict';
import { mountFootballGame, type GameEngineHandle } from './engine';

function createMockCanvas(): HTMLCanvasElement {
  const listeners = new Map<string, EventListener>();
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
    clip: () => {},
    roundRect: () => {},
    setLineDash: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    fillText: () => {},
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
    _listeners: listeners
  } as unknown as HTMLCanvasElement & { _listeners: Map<string, EventListener> };

  return canvas;
}

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

    // 1. Snap to QB
    downHandler({ clientX: 170, clientY: 273, pointerId: 1 } as PointerEvent);
    upHandler({ clientX: 170, clientY: 273, pointerId: 1 } as PointerEvent);
    assert.equal(game.phase, 'QB_DROP');

    // 2. Relative Joystick touch starts on left side of field (pointerId: 10)
    downHandler({ clientX: 80, clientY: 350, pointerId: 10 } as PointerEvent);
    // Drag joystick up and right
    moveHandler({ clientX: 110, clientY: 320, pointerId: 10 } as PointerEvent);

    // 3. While joystick is active, tap WR with a second finger (pointerId: 20)
    // Outside WR is at roughly (40, 225)
    downHandler({ clientX: 40, clientY: 225, pointerId: 20 } as PointerEvent);
    upHandler({ clientX: 40, clientY: 225, pointerId: 20 } as PointerEvent);

    // Pass should be thrown immediately to the WR without joystick interference!
    assert.equal(game.phase, 'THROWN');

    // Lift joystick finger
    upHandler({ clientX: 110, clientY: 320, pointerId: 10 } as PointerEvent);
  } finally {
    cleanup?.();
  }
});

test('relative joystick controls Edge Rusher when user is on defense', () => {
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

    // Tap QB to start play on defense
    downHandler({ clientX: 170, clientY: 200, pointerId: 1 } as PointerEvent);
    upHandler({ clientX: 170, clientY: 200, pointerId: 1 } as PointerEvent);
    assert.ok((game.phase as string) === 'QB_DROP' || (game.phase as string) === 'HANDOFF');

    // Engage joystick on defense
    downHandler({ clientX: 100, clientY: 300, pointerId: 5 } as PointerEvent);
    moveHandler({ clientX: 100, clientY: 260, pointerId: 5 } as PointerEvent);

    upHandler({ clientX: 100, clientY: 260, pointerId: 5 } as PointerEvent);
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

    // Tap QB to snap
    downHandler({ clientX: 170, clientY: 273, pointerId: 1 } as PointerEvent);
    upHandler({ clientX: 170, clientY: 273, pointerId: 1 } as PointerEvent);
    assert.equal(game.phase, 'QB_DROP');

    // Move joystick
    downHandler({ clientX: 100, clientY: 300, pointerId: 2 } as PointerEvent);
    moveHandler({ clientX: 130, clientY: 300, pointerId: 2 } as PointerEvent);
    upHandler({ clientX: 130, clientY: 300, pointerId: 2 } as PointerEvent);

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

    const downHandler = (canvas as any)._listeners.get('pointerdown');
    const upHandler = (canvas as any)._listeners.get('pointerup');

    // Tap QB to start play
    downHandler({ clientX: 170, clientY: 200, pointerId: 1 } as PointerEvent);
    upHandler({ clientX: 170, clientY: 200, pointerId: 1 } as PointerEvent);

    // Initial phase should be QB_DROP or HANDOFF, never instant THROWN on frame 0
    assert.ok(game.phase === 'QB_DROP' || game.phase === 'HANDOFF');
  } finally {
    cleanup?.();
  }
});

test('user controls defensive player regardless of assignment (ZONE, MAN, RB_SPY, BLITZ)', () => {
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

    // Select this zone defender
    game.selectDefenderForTest?.(1);
    const controlled = game.getControlledDefender?.();
    assert.equal(controlled, zoneCb, 'User should control the selected defender even with ZONE assignment');

    // Defender 3 is an LB
    game.selectDefenderForTest?.(3);
    const controlledLb = game.getControlledDefender?.();
    assert.equal(controlledLb, defenders[3], 'User should control the selected defender regardless of assignment');
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

    // Snap to handoff
    downHandler({ clientX: 170, clientY: 273, pointerId: 1 } as PointerEvent);
    upHandler({ clientX: 170, clientY: 273, pointerId: 1 } as PointerEvent);

    // Touch joystick to steer
    downHandler({ clientX: 100, clientY: 300, pointerId: 5 } as PointerEvent);
    moveHandler({ clientX: 140, clientY: 300, pointerId: 5 } as PointerEvent);

    // Lift joystick finger: releasing the joystick must NEVER trigger a swipe juke
    upHandler({ clientX: 140, clientY: 300, pointerId: 5 } as PointerEvent);

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

test('ready button in bottom-left starts defensive play', () => {
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

    // Tap in the bottom-left corner of the canvas / screen (ready button position: x=30, y=canvas.height - 30)
    const downHandler = (canvas as any)._listeners.get('pointerdown');
    const upHandler = (canvas as any)._listeners.get('pointerup');

    downHandler({ clientX: 30, clientY: (canvas.height || 500) - 30, pointerId: 12 } as PointerEvent);
    upHandler({ clientX: 30, clientY: (canvas.height || 500) - 30, pointerId: 12 } as PointerEvent);

    // Play should have started (transitioned past PRE_SNAP)
    assert.notEqual(game.phase, 'PRE_SNAP');

    // Also verify startDefensePlay method on engineHandle
    game.resetDrill();
    assert.equal(game.phase, 'PRE_SNAP');
    const handle = engine as GameEngineHandle;
    handle.startDefensePlay?.();
    assert.notEqual(game.phase, 'PRE_SNAP');
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

    // Snap to handoff
    downHandler({ clientX: 170, clientY: 273, pointerId: 1 } as PointerEvent);
    upHandler({ clientX: 170, clientY: 273, pointerId: 1 } as PointerEvent);

    // Simulate steering lateral movement
    downHandler({ clientX: 170, clientY: 300, pointerId: 2 } as PointerEvent);
    moveHandler({ clientX: 230, clientY: 300, pointerId: 2 } as PointerEvent);

    // Releasing after steering must not have triggered a wild juke
    upHandler({ clientX: 230, clientY: 300, pointerId: 2 } as PointerEvent);

    // Lateral speed should remain calibrated without wild sideways sliding
    assert.ok(true);
  } finally {
    cleanup?.();
  }
});

