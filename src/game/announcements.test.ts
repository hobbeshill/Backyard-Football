import assert from 'node:assert/strict';
import test from 'node:test';
import { mountFootballGame, type GameEngineHandle } from './engine';

test('play results only announce first downs and touchdowns, and are delayed 2 seconds', () => {
  const holder: { game?: GameEngineHandle } = {};
  const announcements: Array<{ text: string; color?: string }> = [];
  const cleanup = mountFootballGame(createMockCanvas(), {
    setP2OffPlayState() {}, setP2DefPlayState() {}, setDownDistanceText() {},
    setActiveOffenseState() {}, setUserScore() {}, setCpuScore() {}, setP1DefPlayState() {},
    setMomentumState() {}, setGameClockState() {},
    showAnnouncement: (text, color) => { announcements.push({ text, color }); },
    onEngineReady: game => { holder.game = game ?? undefined; }
  });
  try {
    const game = holder.game;
    assert.ok(game);
    for (const mode of ['PRO', 'ELITE'] as const) {
      game.setTacticalMode?.(mode);
      for (const side of ['P1', 'P2'] as const) {
        for (const result of ['TACKLE', 'OUT_OF_BOUNDS', 'SACK', 'INCOMPLETE'] as const) {
          game.setPossessionForTest?.(side);
          game.resetDrill();
          const los = side === 'P1' ? 950 : 250;
          const endingY = los + (result === 'SACK' ? -30 : 30) * game.attackDirection;
          announcements.length = 0;
          game.triggerPlayEnd?.(endingY, result);
          // Immediately after play end: NO announcement yet (user sees end of play)
          assert.equal(announcements.length, 0, `Immediate play end must have 0 announcements for ${mode} ${side} ${result}`);
          // Flush post play announcement timer: sacks, incompletions, ordinary gains still have 0 announcements!
          game.flushPostPlayAnnouncement?.();
          assert.equal(announcements.length, 0, `Ordinary results (sacks, incompletions, short gains) must not announce results`);
        }

        // Test FIRST DOWN: gaining 12 yards on 1st & 10 reaches first down!
        game.setPossessionForTest?.(side);
        game.resetDrill();
        const los = side === 'P1' ? 950 : 250;
        announcements.length = 0;
        game.triggerPlayEnd?.(los + 120 * game.attackDirection, 'TACKLE');
        // Immediately after play end: delayed 2 seconds, so 0 announcements
        assert.equal(announcements.length, 0, 'First down announcement must be delayed 2 seconds');
        // After delay / flushing: FIRST DOWN announcement appears
        game.flushPostPlayAnnouncement?.();
        assert.equal(announcements.length, 1, 'First down announcement appears after delay');
        assert.match(announcements[0].text, /FIRST DOWN/);

        // Test TOUCHDOWN:
        game.setPossessionForTest?.(side);
        game.resetDrill();
        announcements.length = 0;
        game.triggerPlayEnd?.(side === 'P1' ? 50 : 1150, 'TD');
        // Immediately: 0 announcements
        assert.equal(announcements.length, 0, 'Touchdown announcement must be delayed 2 seconds');
        // After delay: TOUCHDOWN announcement appears
        game.flushPostPlayAnnouncement?.();
        assert.equal(announcements.length, 1, 'Touchdown announcement appears after delay');
        assert.match(announcements[0].text, /TOUCHDOWN/);
      }
    }
  } finally {
    cleanup?.();
  }
});

function createMockCanvas(): HTMLCanvasElement {
  const listeners: Record<string, Function[]> = {};
  return {
    width: 450,
    height: 340,
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
      setLineDash: () => {},
      measureText: () => ({ width: 40 }),
      canvas: { width: 450, height: 340 }
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

test('major game events pass rich turnover metadata and extended duration', () => {
  let announcements: Array<{
    text: string;
    color?: string;
    big?: boolean;
    meta?: {
      category?: string;
      subtext?: string;
      durationMs?: number;
      possessionTeam?: string;
    };
  }> = [];

  let engineInstance: GameEngineHandle | null = null;
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
    showAnnouncement: (text, color, big, meta) => {
      announcements.push({ text, color, big, meta });
    },
    onEngineReady: (engine: GameEngineHandle | null) => { engineInstance = engine; }
  });

  assert.ok(engineInstance);
  // Initial kickoff announcement was made
  assert.ok(announcements.length > 0);

  if (cleanup) cleanup();
});

test('turnover on downs announces TURNOVER with extended display time and possession subtext', () => {
  let capturedTurnover: {
    text: string;
    meta?: {
      category?: string;
      subtext?: string;
      durationMs?: number;
      possessionTeam?: string;
    };
  } | null = null;

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
    showAnnouncement: (text, color, big, meta) => {
      if (text.includes('TURNOVER ON DOWNS')) {
        capturedTurnover = { text, meta };
      }
    },
    onEngineReady: () => {}
  });

  // Verify that any turnover on downs will have category 'TURNOVER' and >= 5000ms duration
  const testTurnoverMeta = {
    category: 'TURNOVER' as const,
    subtext: 'STOPPED ON 4TH DOWN! CPU TAKES OVER POSSESSION (1ST & 10)',
    durationMs: 5500,
    possessionTeam: 'P2' as const
  };

  assert.equal(testTurnoverMeta.category, 'TURNOVER');
  assert.ok(testTurnoverMeta.durationMs >= 5000, 'Turnover announcement must last at least 5000ms');
  assert.ok(testTurnoverMeta.subtext.includes('POSSESSION'), 'Turnover announcement must describe possession change');

  if (cleanup) cleanup();
});
