import assert from 'node:assert/strict';
import test from 'node:test';
import { mountFootballGame, type GameEngineHandle } from './engine';

function createMockCanvas(): HTMLCanvasElement {
  const listeners: Record<string, Function[]> = {};
  return {
    width: 340,
    height: 450,
    getContext: () => ({
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      fillText: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      quadraticCurveTo: () => {},
      bezierCurveTo: () => {},
      closePath: () => {},
      setLineDash: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      measureText: () => ({ width: 40 }),
      canvas: { width: 340, height: 450 }
    }),
    addEventListener: (evt: string, fn: Function) => {
      listeners[evt] = listeners[evt] || [];
      listeners[evt].push(fn);
    },
    removeEventListener: (evt: string, fn: Function) => {
      if (listeners[evt]) {
        listeners[evt] = listeners[evt].filter(f => f !== fn);
      }
    },
    dispatchEvent: () => true
  } as unknown as HTMLCanvasElement;
}

test('after P1 scores a touchdown, scoring team (P1) kicks off to the other team (P2)', () => {
  let isKickoff = false;
  let kickingTeam = '';
  let receivingTeam = '';
  let activeOffense = '';
  let userScore = 0;
  let cpuScore = 0;
  let announcements: string[] = [];

  const mockCanvas = createMockCanvas();
  let engineInstance: GameEngineHandle | null = null;

  const cleanup = mountFootballGame(mockCanvas, {
    setP2OffPlayState: () => {},
    setP2DefPlayState: () => {},
    setDownDistanceText: () => {},
    setActiveOffenseState: (off) => { activeOffense = off; },
    setUserScore: (score) => { userScore = score; },
    setCpuScore: (score) => { cpuScore = score; },
    setP1DefPlayState: () => {},
    setP1OffFormationState: () => {},
    setMomentumState: () => {},
    setP1TeamState: () => {},
    setP2TeamState: () => {},
    setGameClockState: () => {},
    showAnnouncement: (text) => { announcements.push(text); },
    onEngineReady: (engine) => { engineInstance = engine; },
    setIsKickoffState: (active, kick, rec) => {
      isKickoff = active;
      kickingTeam = kick;
      receivingTeam = rec;
    }
  });

  assert.ok(engineInstance);
  const engine = engineInstance as GameEngineHandle;

  // 1. Initial state: Game opens with P2 (Georgia) kicking off to P1 (Alabama)
  assert.equal(isKickoff, true);
  assert.equal(kickingTeam, 'P2');
  assert.equal(receivingTeam, 'P1');
  assert.equal(engine.isKickoffActive(), true);

  // 2. Set P1 on offense
  assert.ok(engine.setPossessionForTest);
  engine.setPossessionForTest('P1');
  assert.equal(activeOffense, 'P1');
  assert.equal(engine.isKickoffActive(), false);

  // 3. P1 scores a touchdown
  assert.ok(engine.triggerPlayEnd);
  engine.triggerPlayEnd(100, 'TD');

  // Verify P1 score increased by 7
  assert.equal(userScore, 7);

  // Reset drill after touchdown
  engine.resetDrill();

  // 4. Verify that scoring team (P1) kicks off to the other team (P2)
  assert.equal(engine.isKickoffActive(), true);
  assert.equal(isKickoff, true);
  assert.equal(kickingTeam, 'P1', 'The scoring team (P1) must kick off to P2');
  assert.equal(receivingTeam, 'P2', 'The non-scoring team (P2) must receive from P1');

  if (cleanup) cleanup();
});

test('after CPU (P2) scores a touchdown, scoring team (P2) kicks off to the other team (P1)', () => {
  let isKickoff = false;
  let kickingTeam = '';
  let receivingTeam = '';
  let activeOffense = '';
  let userScore = 0;
  let cpuScore = 0;

  const mockCanvas = createMockCanvas();
  let engineInstance: GameEngineHandle | null = null;

  const cleanup = mountFootballGame(mockCanvas, {
    setP2OffPlayState: () => {},
    setP2DefPlayState: () => {},
    setDownDistanceText: () => {},
    setActiveOffenseState: (off) => { activeOffense = off; },
    setUserScore: (score) => { userScore = score; },
    setCpuScore: (score) => { cpuScore = score; },
    setP1DefPlayState: () => {},
    setP1OffFormationState: () => {},
    setMomentumState: () => {},
    setP1TeamState: () => {},
    setP2TeamState: () => {},
    setGameClockState: () => {},
    showAnnouncement: () => {},
    onEngineReady: (engine) => { engineInstance = engine; },
    setIsKickoffState: (active, kick, rec) => {
      isKickoff = active;
      kickingTeam = kick;
      receivingTeam = rec;
    }
  });

  assert.ok(engineInstance);
  const engine = engineInstance as GameEngineHandle;

  // Set P2 on offense
  assert.ok(engine.setPossessionForTest);
  engine.setPossessionForTest('P2');
  assert.equal(activeOffense, 'P2');

  // P2 scores a touchdown
  assert.ok(engine.triggerPlayEnd);
  engine.triggerPlayEnd(1100, 'TD');
  assert.equal(cpuScore, 7);

  // Reset drill after touchdown
  engine.resetDrill();

  // Verify that scoring team (P2) kicks off to the other team (P1)
  assert.equal(engine.isKickoffActive(), true);
  assert.equal(isKickoff, true);
  assert.equal(kickingTeam, 'P2', 'The scoring team (P2) must kick off to P1');
  assert.equal(receivingTeam, 'P1', 'The non-scoring team (P1) must receive from P2');

  if (cleanup) cleanup();
});

test('after an interception returned for a touchdown (pick-six), the scoring defense kicks off', () => {
  let isKickoff = false;
  let kickingTeam = '';
  let receivingTeam = '';
  let cpuScore = 0;

  const mockCanvas = createMockCanvas();
  let engineInstance: GameEngineHandle | null = null;

  const cleanup = mountFootballGame(mockCanvas, {
    setP2OffPlayState: () => {},
    setP2DefPlayState: () => {},
    setDownDistanceText: () => {},
    setActiveOffenseState: () => {},
    setUserScore: () => {},
    setCpuScore: (score) => { cpuScore = score; },
    setP1DefPlayState: () => {},
    setP1OffFormationState: () => {},
    setMomentumState: () => {},
    setP1TeamState: () => {},
    setP2TeamState: () => {},
    setGameClockState: () => {},
    showAnnouncement: () => {},
    onEngineReady: (engine) => { engineInstance = engine; },
    setIsKickoffState: (active, kick, rec) => {
      isKickoff = active;
      kickingTeam = kick;
      receivingTeam = rec;
    }
  });

  assert.ok(engineInstance);
  const engine = engineInstance as GameEngineHandle;

  // Set P1 on offense
  assert.ok(engine.setPossessionForTest);
  engine.setPossessionForTest('P1');

  // Trigger interception by P2
  assert.ok(engine.triggerPlayEnd);
  // Pick-six: P2 intercepts and scores in endzone
  engine.setPossessionForTest('P2');
  engine.triggerPlayEnd(1100, 'TD');
  assert.equal(cpuScore, 7);

  engine.resetDrill();

  // Scoring team (P2) kicks off to P1
  assert.equal(engine.isKickoffActive(), true);
  assert.equal(isKickoff, true);
  assert.equal(kickingTeam, 'P2');
  assert.equal(receivingTeam, 'P1');

  if (cleanup) cleanup();
});
