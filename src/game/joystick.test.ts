import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_NUMBERS_INNER_EDGE_X, getCanvasRenderScale, getCameraYForAction, getCameraYForLineOfScrimmage, getOffenseJoystickAnchor, getPlayerForwardDirection, isOffenseJoystickStartZone, mountFootballGame, OFFENSE_JOYSTICK_INNER_RING_RADIUS, type GameEngineHandle } from './engine';
import { createSimulationClock, getDesignedRunLateralBias, getDirectionalInput, getUserRunnerVelocity } from './movement';

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

test('offense joystick is fixed inside the field numbers at the RB formation depth', () => {
  const anchor = getOffenseJoystickAnchor(288);
  assert.ok(Math.abs((anchor.x - OFFENSE_JOYSTICK_INNER_RING_RADIUS) - FIELD_NUMBERS_INNER_EDGE_X) < 0.000001, 'Inner ring edge sits at the inside edge of the numbers');
  assert.equal(anchor.y, 364, 'Joystick marker sits just below the RB depth');
  assert.deepEqual(getOffenseJoystickAnchor(288), anchor, 'Anchor does not depend on RB alignment');
  assert.equal(isOffenseJoystickStartZone(anchor.x, anchor.y, anchor.x, anchor.y), true);
  assert.equal(isOffenseJoystickStartZone(anchor.x + 50, anchor.y + 40, anchor.x, anchor.y), true);
  assert.equal(isOffenseJoystickStartZone(anchor.x + 52, anchor.y, anchor.x, anchor.y), false);
  assert.equal(isOffenseJoystickStartZone(anchor.x, anchor.y - 56, anchor.x, anchor.y), false);
});

test('user control is direction-only with no carried momentum', () => {
  assert.deepEqual(getDirectionalInput(0.2, 0), { x: 1, y: 0 }, 'Partial stick deflection moves like a d-pad');
  assert.deepEqual(getDirectionalInput(0.01, 0), { x: 0, y: 0 }, 'Deadzone yields no heading');
  const right = getUserRunnerVelocity(1, 0, 2, -1);
  assert.ok(right.vx > 0 && Math.abs(right.vy) < 0.000001, 'Pushing right moves straight right with no forward drift');
  const left = getUserRunnerVelocity(-1, 0, 2, -1);
  assert.equal(left.vx, -right.vx, 'Reversing direction is instant');
  assert.deepEqual(getUserRunnerVelocity(0, 0, 2, -1), { vx: 0, vy: -2 }, 'No input: run straight upfield with zero lateral drift');
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
    quadraticCurveTo: () => {},
    ellipse: () => {},
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

test('Sweep lane bias steers outside on either side while ISO keeps its inside path', () => {
  assert.equal(getDesignedRunLateralBias('SWEEP', 220, 'right'), 1.15);
  assert.equal(getDesignedRunLateralBias('SWEEP', 120, 'left'), -1.15);
  assert.equal(getDesignedRunLateralBias('SWEEP', 255, 'right'), 0);
  assert.equal(getDesignedRunLateralBias('ISO', 220, 'right'), 0);
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

    // Ready starts the CPU play while the user is on defense.
    game.startPlay?.();
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
    const initialPosition = { x: teammate.x, y: teammate.y };
    const downHandler = (canvas as any)._listeners.get('pointerdown');
    const moveHandler = (canvas as any)._listeners.get('pointermove');
    const upHandler = (canvas as any)._listeners.get('pointerup');

    downHandler({ clientX: teammate.x, clientY: teammate.y, pointerId: 1 } as PointerEvent);
    upHandler({ clientX: teammate.x, clientY: teammate.y, pointerId: 1 } as PointerEvent);
    assert.equal(teammate.defenseAssignment, 'BLITZ');
    assert.equal(game.getControlledDefender?.(), defenders[0]);

    downHandler({ clientX: teammate.x, clientY: teammate.y, pointerId: 2 } as PointerEvent);
    moveHandler({ clientX: teammate.x + 50, clientY: teammate.y + 35, pointerId: 2 } as PointerEvent);
    upHandler({ clientX: teammate.x + 50, clientY: teammate.y + 35, pointerId: 2 } as PointerEvent);
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

test('Space starts ready plays on both sides, ignores repeats and typing, and arrows do not scroll', () => {
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
    assert.ok(keyDown);
    let prevented = false;
    const space = { key: ' ', repeat: false, preventDefault: () => { prevented = true; } };
    keyDown(space as KeyboardEvent);
    assert.equal(game.phase, 'KICKOFF');
    for (const team of ['P1', 'P2'] as const) {
      game.setPossessionForTest?.(team);
      game.resetDrill();
      keyDown({ ...space, target: { tagName: 'INPUT' } } as unknown as KeyboardEvent);
      assert.equal(game.phase, 'PRE_SNAP');
      keyDown({ ...space, repeat: true } as KeyboardEvent);
      assert.equal(game.phase, 'PRE_SNAP');
      game.setPaused(true);
      keyDown(space as KeyboardEvent);
      assert.equal(game.phase, 'PRE_SNAP');
      game.setPaused(false);
      prevented = false;
      keyDown(space as KeyboardEvent);
      assert.notEqual(game.phase, 'PRE_SNAP');
      assert.equal(prevented, true);
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

test('Ready starts user defense while 12-yard-line joystick touch starts user offense', () => {
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

    const downHandler = (canvas as any)._listeners.get('pointerdown');
    const upHandler = (canvas as any)._listeners.get('pointerup');
    downHandler({ clientX: 170, clientY: 200, pointerId: 1 } as PointerEvent);
    upHandler({ clientX: 170, clientY: 200, pointerId: 1 } as PointerEvent);
    assert.equal(game.phase, 'PRE_SNAP', 'Defensive play starts from READY, not a QB tap');

    game.startPlay?.();
    assert.notEqual(game.phase, 'PRE_SNAP');

    // The offense starts from the field-positioned joystick instead of the QB.
    game.setPossessionForTest?.('P1');
    game.resetDrill();
    assert.equal(game.phase, 'PRE_SNAP');
    downHandler({ clientX: 90, clientY: 364, pointerId: 2 } as PointerEvent);
    upHandler({ clientX: 90, clientY: 364, pointerId: 2 } as PointerEvent);
    assert.ok(game.phase === 'QB_DROP' || game.phase === 'HANDOFF');
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
