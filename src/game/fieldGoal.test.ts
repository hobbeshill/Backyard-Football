import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateFieldGoalFlight,
  getFieldGoalBallHeight,
  getFieldGoalDistanceYards,
  getInterceptionTouchbackY,
  GOALPOST_CENTER_X,
  GOALPOST_LEFT_UPRIGHT_X,
  GOALPOST_RIGHT_UPRIGHT_X,
  GOALPOST_CROSSBAR_HEIGHT_Z
} from './rules';
import { offensivePlaybook } from './playbook';
import { mountFootballGame, GameEngineCallbacks, type GameEngineHandle } from './engine';
import { TEAMS } from './teams';

test('Field goals can be made from up to 60 yards out with accurate aim and power', () => {
  // A 60-yard field goal attempt (aim dead center, full power)
  const fg60 = calculateFieldGoalFlight(60, 0.0, 0.98, -1, 1.0);
  assert.equal(fg60.isGood, true, '60-yard field goal should be good with center aim and 98% power');
  assert.equal(fg60.distanceYards, 60);
  assert.ok(fg60.arrivalZ >= GOALPOST_CROSSBAR_HEIGHT_Z, 'Arrival height must clear the crossbar');
  assert.ok(
    fg60.targetX >= GOALPOST_LEFT_UPRIGHT_X && fg60.targetX <= GOALPOST_RIGHT_UPRIGHT_X,
    'Ball must pass between the uprights'
  );
  assert.equal(fg60.missReason, undefined);
});

test('Field goal flight reaches the calculated height at the uprights', () => {
  const goodKick = calculateFieldGoalFlight(42, 0, 0.85, -1);
  const shortKick = calculateFieldGoalFlight(52, 0, 0.50, -1);

  assert.equal(getFieldGoalBallHeight(goodKick.maxZ, goodKick.arrivalZ, 1), goodKick.arrivalZ);
  assert.equal(getFieldGoalBallHeight(goodKick.maxZ, goodKick.arrivalZ, 1.1), goodKick.arrivalZ);
  assert.ok(getFieldGoalBallHeight(goodKick.maxZ, goodKick.arrivalZ, 1) >= GOALPOST_CROSSBAR_HEIGHT_Z);
  assert.ok(getFieldGoalBallHeight(shortKick.maxZ, shortKick.arrivalZ, 1) < GOALPOST_CROSSBAR_HEIGHT_Z);
});

test('End-zone interceptions spot the new offense at its own 20-yard line', () => {
  assert.equal(getInterceptionTouchbackY(80, 1200, 100, -1), 300);
  assert.equal(getInterceptionTouchbackY(1120, 1200, 100, 1), 900);
  assert.equal(getInterceptionTouchbackY(300, 1200, 100, -1), null);
});

test('Field goals become more difficult as distance increases (lateral drift and power requirements scale with distance)', () => {
  // Same aim offset (0.26) on a short 22-yard field goal vs a 60-yard field goal
  const shortKick = calculateFieldGoalFlight(22, 0.26, 0.70, -1, 1.0);
  const longKick = calculateFieldGoalFlight(60, 0.26, 0.98, -1, 1.0);

  // At 22 yards, slight deviation stays within the uprights
  assert.equal(shortKick.isGood, true, 'Slight aim deviation on a short 22-yard kick is forgiving and makes the FG');
  assert.ok(shortKick.targetX >= GOALPOST_LEFT_UPRIGHT_X && shortKick.targetX <= GOALPOST_RIGHT_UPRIGHT_X);

  // At 60 yards, the exact same aim deviation drifts wide right because of increased flight distance
  assert.equal(longKick.isGood, false, 'The same aim deviation on a 60-yard kick carries wide and misses');
  assert.equal(longKick.missReason, 'WIDE_RIGHT');
  assert.ok(longKick.targetX > GOALPOST_RIGHT_UPRIGHT_X, 'Target X drifted past the right upright');

  // Power required at 22 yards is much lower than at 60 yards
  const lowPowerShort = calculateFieldGoalFlight(22, 0.0, 0.45, -1, 1.0);
  const lowPowerLong = calculateFieldGoalFlight(60, 0.0, 0.45, -1, 1.0);
  assert.equal(lowPowerShort.isGood, true, '45% power is sufficient for a 22-yard attempt');
  assert.equal(lowPowerLong.isGood, false, '45% power falls short on a 60-yard attempt');
  assert.equal(lowPowerLong.missReason, 'SHORT');
});

test('Field goal misses identify wide left, wide right, short, and upright doinks', () => {
  // Wide Left
  const wideLeft = calculateFieldGoalFlight(45, -0.65, 0.85, -1, 1.0);
  assert.equal(wideLeft.isGood, false);
  assert.equal(wideLeft.missReason, 'WIDE_LEFT');
  assert.ok(wideLeft.targetX < GOALPOST_LEFT_UPRIGHT_X);

  // Wide Right
  const wideRight = calculateFieldGoalFlight(45, 0.65, 0.85, -1, 1.0);
  assert.equal(wideRight.isGood, false);
  assert.equal(wideRight.missReason, 'WIDE_RIGHT');
  assert.ok(wideRight.targetX > GOALPOST_RIGHT_UPRIGHT_X);

  // Short of crossbar
  const shortKick = calculateFieldGoalFlight(52, 0.0, 0.50, -1, 1.0);
  assert.equal(shortKick.isGood, false);
  assert.equal(shortKick.missReason, 'SHORT');
  assert.ok(shortKick.arrivalZ < GOALPOST_CROSSBAR_HEIGHT_Z);

  // Upright Doink (when targetX lands right on the upright post, x ~ 151 or 189)
  // At 40 yds, driftScale is 38 + (25/45)*44 = 62.4. aimOffset = (189 - 170) / 62.4 = 0.3045
  const doinkKick = calculateFieldGoalFlight(40, (GOALPOST_RIGHT_UPRIGHT_X - GOALPOST_CENTER_X) / (38 + ((40 - 15) / 45) * 44), 0.90, -1, 1.0);
  assert.equal(doinkKick.isGood, false);
  assert.equal(doinkKick.missReason, 'UPRIGHT_DOINK');
});

test('getFieldGoalDistanceYards computes distance to uprights correctly including 17-yard endzone + snap offset', () => {
  const fieldHeight = 1200;
  const endZoneHeight = 100;
  const attackDirection = -1; // attacking towards y=100

  // At opponent 43-yard line (y = 530): 43 yards to goal line + 17 = 60 yards
  const dist60 = getFieldGoalDistanceYards(530, attackDirection, fieldHeight, endZoneHeight);
  assert.equal(dist60, 60);

  // At opponent 20-yard line (y = 300): 20 yards to goal line + 17 = 37 yards
  const dist37 = getFieldGoalDistanceYards(300, attackDirection, fieldHeight, endZoneHeight);
  assert.equal(dist37, 37);

  // At opponent 5-yard line (y = 150): 5 yards to goal line + 17 = 22 yards
  const dist22 = getFieldGoalDistanceYards(150, attackDirection, fieldHeight, endZoneHeight);
  assert.equal(dist22, 22);
});

test('Offensive playbook includes SPECIAL TEAMS: FIELD GOAL play option', () => {
  const fgPlay = offensivePlaybook.FIELD_GOAL;
  assert.ok(fgPlay, 'Playbook must contain FIELD_GOAL');
  assert.equal(fgPlay.type, 'FIELD_GOAL');
  assert.ok(fgPlay.desc.includes('60 yards'), 'Description mentions 60 yards range');
});

function createMockCanvas(): HTMLCanvasElement {
  return {
    width: 340,
    height: 450,
    clientWidth: 340,
    clientHeight: 450,
    getContext: () => ({
      save: () => {},
      restore: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      arc: () => {},
      ellipse: () => {},
      roundRect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      clearRect: () => {},
      fillText: () => {},
      measureText: () => ({ width: 40 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      setLineDash: () => {},
      clip: () => {}
    }),
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 340, height: 450 })
  } as unknown as HTMLCanvasElement;
}

test('Pro playbook field goals preserve the actual down and launch through the meter', () => {
  let engine: GameEngineHandle | null = null;
  let downDistanceText = '';
  let selectedPlay = '';
  const cleanup = mountFootballGame(createMockCanvas(), {
    setP2OffPlayState: () => {}, setP2DefPlayState: () => {},
    setDownDistanceText: text => { downDistanceText = text; },
    setActiveOffenseState: () => {}, setUserScore: () => {}, setCpuScore: () => {},
    setP1DefPlayState: () => {}, setMomentumState: () => {}, setGameClockState: () => {},
    setP1OffPlayState: play => { selectedPlay = play; },
    showAnnouncement: () => {},
    onEngineReady: handle => { engine = handle; }
  });
  try {
    assert.ok(engine);
    const game: GameEngineHandle = engine;
    game.setTacticalMode?.('PRO');
    game.selectOffense('FIELD_GOAL');
    assert.notEqual(game.p1OffPlay, 'FIELD_GOAL', 'Cannot select a field goal during kickoff');
    game.setPossessionForTest?.('P1');
    game.resetDrill();
    game.selectOffense('PRO_VERTS');
    assert.deepEqual(game.getReceivers().map(receiver => receiver.routeType), ['GO', 'GO', 'GO']);
    game.selectOffense('PRO_MESH');
    assert.deepEqual(game.getReceivers().map(receiver => receiver.routeType), ['CROSS-R', 'HITCH', 'CROSS-L']);
    const originalDown = downDistanceText;
    game.selectOffense('FIELD_GOAL');
    assert.equal(game.p1OffPlay, 'FIELD_GOAL');
    assert.equal(selectedPlay, 'FIELD_GOAL');
    assert.equal(downDistanceText, originalDown);
    assert.match(downDistanceText, /^1st & 10/);
    assert.equal(game.getFieldGoalMeterState?.().stage, 'AIM');
    game.lockFieldGoalMeter?.();
    assert.equal(game.getFieldGoalMeterState?.().stage, 'POWER');
    game.lockFieldGoalMeter?.();
    assert.equal(game.phase, 'THROWN');
  } finally {
    cleanup?.();
  }
});

test('Pro playbook punts require fourth down and clear the play-selection gate', () => {
  let engine: GameEngineHandle | null = null;
  const cleanup = mountFootballGame(createMockCanvas(), {
    setP2OffPlayState: () => {}, setP2DefPlayState: () => {},
    setDownDistanceText: () => {}, setActiveOffenseState: () => {},
    setUserScore: () => {}, setCpuScore: () => {}, setP1DefPlayState: () => {},
    setMomentumState: () => {}, setGameClockState: () => {}, showAnnouncement: () => {},
    onEngineReady: handle => { engine = handle; }
  });
  try {
    assert.ok(engine);
    const game: GameEngineHandle = engine;
    game.setPossessionForTest?.('P1');
    game.setTacticalMode?.('PRO');
    game.resetDrill();
    game.selectOffense('PUNT');
    assert.notEqual(game.p1OffPlay, 'PUNT');
    game.set4thDownForTest?.();
    game.selectOffense('PUNT');
    assert.equal(game.p1OffPlay, 'PUNT');
    game.startPlay?.();
    assert.equal(game.phase, 'THROWN', 'Selected punt starts without another offensive card');
  } finally {
    cleanup?.();
  }
});

test('Field Goal two-stage skill meter: directional meter followed by up/down distance meter', () => {
  let engineHandle: any = null;
  const callbacks: GameEngineCallbacks = {
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
    onEngineReady: (handle) => { engineHandle = handle; }
  };

  const canvas = createMockCanvas();
  const cleanup = mountFootballGame(canvas, callbacks);
  assert.ok(engineHandle);

  // Set possession to P1 on 4th down at opponent 30-yard line (47-yard attempt)
  engineHandle.setPossessionForTest?.('P1');
  engineHandle.set4thDownForTest?.();

  // Call Field Goal
  engineHandle.callFieldGoal();
  assert.equal(engineHandle.p1OffPlay, 'FIELD_GOAL');

  // Verify initial stage is 'AIM' (direction meter)
  let meterState = engineHandle.getFieldGoalMeterState();
  assert.equal(meterState.stage, 'AIM', 'Initial meter stage must be AIM for direction');
  assert.ok(meterState.distanceYards > 0);

  // Lock Stage 1 (Direction)
  engineHandle.lockFieldGoalMeter();
  meterState = engineHandle.getFieldGoalMeterState();
  assert.equal(meterState.stage, 'POWER', 'Stage 1 locks direction and transitions to POWER for distance');
  assert.notEqual(meterState.lockedAim, null, 'Locked aim must be recorded');

  // Lock Stage 2 (Distance / Power)
  engineHandle.lockFieldGoalMeter();
  assert.equal(engineHandle.phase, 'THROWN', 'Stage 2 locks distance and executes the kick into flight');

  if (cleanup) cleanup();
});

test('Field goal execution launches ball with isFieldGoal flag and proper target coordinates', () => {
  let engineHandle: any = null;
  const callbacks: GameEngineCallbacks = {
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
    onEngineReady: (handle) => { engineHandle = handle; }
  };

  const canvas = createMockCanvas();
  const cleanup = mountFootballGame(canvas, callbacks);
  assert.ok(engineHandle);

  engineHandle.setPossessionForTest?.('P1');
  engineHandle.set4thDownForTest?.();

  // Field goal with aim 0 and power 0.95
  engineHandle.fieldGoal(0.0, 0.95);
  assert.equal(engineHandle.phase, 'THROWN');

  if (cleanup) cleanup();
});

test('Pause menu Field Goal is rejected on defense and available to P1 on offense', () => {
  let engineHandle: any = null;
  let fgMeterState: any = null;
  let p1OffPlay = 'SHORT_PASS';

  const callbacks: GameEngineCallbacks = {
    setP1OffPlayState: (p) => { p1OffPlay = p; },
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
    setFieldGoalMeterState: (s) => { fgMeterState = s; },
    onEngineReady: (handle) => { engineHandle = handle; }
  };

  const canvas = createMockCanvas();
  const cleanup = mountFootballGame(canvas, callbacks);
  assert.ok(engineHandle);

  // Initially on opening kickoff
  assert.equal(engineHandle.isKickoffActive(), true);
  // Meter should be null initially on kickoff
  assert.equal(fgMeterState, null, 'Field goal meter must be null on kickoff');

  // A forced pause-menu attempt must not interrupt a kickoff.
  engineHandle.callFieldGoal(true);
  assert.notEqual(engineHandle.p1OffPlay, 'FIELD_GOAL');
  assert.equal(engineHandle.isKickoffActive(), true);

  // It must also be rejected when P1 is on defense during a live possession.
  engineHandle.setPossessionForTest?.('P2');
  engineHandle.callFieldGoal(true);
  assert.notEqual(engineHandle.p1OffPlay, 'FIELD_GOAL');

  engineHandle.setPossessionForTest?.('P1');
  engineHandle.callFieldGoal(true);
  assert.equal(engineHandle.p1OffPlay, 'FIELD_GOAL');
  assert.equal(p1OffPlay, 'FIELD_GOAL');
  assert.equal(engineHandle.isKickoffActive(), false, 'Kickoff should be ended when forcing FG');
  assert.ok(fgMeterState !== null, 'FG meter state active after calling FG');
  assert.equal((fgMeterState as any)?.stage, 'AIM', 'First stage is directional meter');
  assert.ok(engineHandle.getFieldGoalDistance() > 0, 'Field goal distance is available');

  // Lock meter and execute kick
  engineHandle.lockFieldGoalMeter();
  assert.equal((fgMeterState as any)?.stage, 'POWER', 'Transitions to up/down distance meter');

  engineHandle.lockFieldGoalMeter();
  assert.equal(engineHandle.phase, 'THROWN', 'Ball kicked');
  // Immediately upon kick, meter state must be cleared to null
  assert.equal(fgMeterState, null, 'Field goal meter cleared after kick');
  assert.equal(engineHandle.p1OffPlay, 'SHORT_PASS', 'Offense play reset after kick');

  if (cleanup) cleanup();
});
