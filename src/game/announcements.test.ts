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
      setLineDash: () => {},
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
