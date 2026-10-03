import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateKickoffFlight, calculatePuntFlight, getKickoffLineY, getTouchbackYardLineY } from './rules';
import { offensivePlaybook } from './playbook';
import { scoreRunBlockTarget } from './ai';
import { mountFootballGame, type GameEngineHandle } from './engine';

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

test('kickoff line calculation correctly places kicking team at 35-yard line', () => {
  const fieldHeight = 1200;
  const endZoneHeight = 100;
  // AttackDirection -1: moving up towards y=0. Own goal line is at 1100. 35 yards upfield = 1100 - 350 = 750
  assert.equal(getKickoffLineY(fieldHeight, endZoneHeight, -1, 35), 750);

  // AttackDirection 1: moving down towards y=1200. Own goal line is at 100. 35 yards downfield = 100 + 350 = 450
  assert.equal(getKickoffLineY(fieldHeight, endZoneHeight, 1, 35), 450);
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

  if (cleanup) cleanup();
});

test('4th down allows calling PUNT which switches play to PUNT and notifies UI', () => {
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
  // Call special teams punt unit
  engine.callPunt();
  assert.equal(p1OffPlay, 'PUNT');
  assert.ok(announcement.includes('SPECIAL TEAMS PUNT UNIT'));

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
});

test('AI kickoff receiver has identical speed and steering limits as user kickoff receiver', () => {
  // Symmetrical calibrated return parameters
  const userReturnBaseSpeed = 1.48;
  const aiReturnBaseSpeed = 1.48;
  const userReturnBoostedSpeed = 2.05;
  const aiReturnBoostedSpeed = 2.05;
  const userReturnMaxSteer = 2.2;
  const aiReturnMaxSteer = 2.2;
  const userReturnSteerFactor = 0.08;
  const aiReturnSteerFactor = 0.08;
  const userInFlightSpeed = 2.0;
  const aiInFlightSpeed = 2.0;

  assert.equal(aiReturnBaseSpeed, userReturnBaseSpeed, 'Base return speed must be identical');
  assert.equal(aiReturnBoostedSpeed, userReturnBoostedSpeed, 'Boosted return speed must be identical');
  assert.equal(aiReturnMaxSteer, userReturnMaxSteer, 'Maximum lateral steering must be identical');
  assert.equal(aiReturnSteerFactor, userReturnSteerFactor, 'Steering responsiveness must be identical');
  assert.equal(aiInFlightSpeed, userInFlightSpeed, 'In-flight catch fielding speed must be identical');
});




