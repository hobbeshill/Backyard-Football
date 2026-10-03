import { useEffect, useRef } from 'react';
import { getHelmetDesign } from './helmetDesigns';
import { drawHelmetSprite } from './helmetRenderer';
import type { TeamProfile } from './teams';

export function HelmetSpritePreview({ team }: { team: TeamProfile }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Cannot render helmet sprite preview: Canvas 2D is unavailable.');
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.round(56 * pixelRatio);
    canvas.height = Math.round(64 * pixelRatio);
    ctx.scale(pixelRatio * 2, pixelRatio * 2);
    drawHelmetSprite(ctx, { x: 14, y: 17, radius: 10 }, getHelmetDesign(team), -1);
  }, [team]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`${team.name} gameplay helmet sprite`}
      width={56}
      height={64}
      className="h-16 w-14 shrink-0"
    />
  );
}
