import type { HelmetDesign } from './helmetDesigns';
import type { Entity } from './types';

export type HelmetDrawingContext = Pick<CanvasRenderingContext2D,
  | 'save' | 'restore' | 'translate' | 'rotate' | 'scale'
  | 'beginPath' | 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'bezierCurveTo'
  | 'closePath' | 'fill' | 'stroke' | 'clip' | 'ellipse' | 'fillText'
  | 'createRadialGradient' | 'fillRect'
  | 'fillStyle' | 'strokeStyle' | 'lineWidth' | 'lineJoin' | 'lineCap'
  | 'font' | 'textAlign' | 'textBaseline'
>;

export function drawHelmetSprite(
  ctx: HelmetDrawingContext,
  entity: Pick<Entity, 'x' | 'y' | 'radius' | 'vx' | 'vy'>,
  design: HelmetDesign,
  forwardDirection: number
) {
  const radius = entity.radius * 1.16;
  const velocityX = entity.vx || 0;
  const velocityY = entity.vy || 0;
  const moving = Math.hypot(velocityX, velocityY) > 0.5;
  const rotation = moving
    ? Math.atan2(velocityX, -velocityY)
    : forwardDirection === -1 ? 0 : Math.PI;
  const drawShellPath = () => {
    ctx.beginPath();
    ctx.moveTo(-radius * 0.72, -radius * 0.66);
    ctx.quadraticCurveTo(0, -radius * 0.92, radius * 0.72, -radius * 0.66);
    ctx.bezierCurveTo(radius * 0.93, -radius * 0.43, radius * 0.98, radius * 0.42, radius * 0.64, radius * 0.80);
    ctx.quadraticCurveTo(0, radius * 1.11, -radius * 0.64, radius * 0.80);
    ctx.bezierCurveTo(-radius * 0.98, radius * 0.42, -radius * 0.93, -radius * 0.43, -radius * 0.72, -radius * 0.66);
    ctx.closePath();
  };

  ctx.save();
  ctx.translate(entity.x, entity.y);
  ctx.rotate(rotation);

  ctx.save();
  ctx.translate(radius * 0.12, radius * 0.18);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  drawShellPath();
  ctx.fill();
  ctx.restore();

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-radius * 0.72, -radius * 0.48);
  ctx.lineTo(-radius * 0.66, -radius * 0.99);
  ctx.quadraticCurveTo(0, -radius * 1.43, radius * 0.66, -radius * 0.99);
  ctx.lineTo(radius * 0.72, -radius * 0.48);
  ctx.moveTo(-radius * 0.64, -radius * 0.89);
  ctx.quadraticCurveTo(0, -radius * 1.18, radius * 0.64, -radius * 0.89);
  for (const side of [-1, 1]) {
    ctx.moveTo(side * radius * 0.37, -radius * 0.65);
    ctx.lineTo(side * radius * 0.43, -radius * 1.10);
  }
  ctx.strokeStyle = '#172127';
  ctx.lineWidth = Math.max(2.2, radius * 0.19);
  ctx.stroke();
  ctx.strokeStyle = design.facemask;
  ctx.lineWidth = Math.max(0.9, radius * 0.075);
  ctx.stroke();

  ctx.fillStyle = design.shell;
  drawShellPath();
  ctx.fill();
  ctx.strokeStyle = '#151d20';
  ctx.lineWidth = Math.max(1.2, radius * 0.11);
  ctx.stroke();

  ctx.save();
  drawShellPath();
  ctx.clip();
  if (design.centerStripe.length > 0) {
    const stripeWidth = radius * (design.centerStripe.length === 1 ? 0.18 : 0.36);
    const weights = design.stripeWidths ?? design.centerStripe.map(() => 1);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let stripeX = -stripeWidth / 2;
    design.centerStripe.forEach((color, index) => {
      const bandWidth = stripeWidth * weights[index] / totalWeight;
      ctx.fillStyle = color;
      ctx.fillRect(stripeX, -radius, bandWidth, radius * 2.2);
      stripeX += bandWidth;
    });
  }

  for (const side of [-1, 1]) {
    if (!design.decalMark && !design.decalShape) continue;
    ctx.save();
    ctx.translate(side * radius * 0.68, radius * 0.28);
    // Each decal's top faces the crown; foreshorten its height on the curved side.
    ctx.rotate(-side * Math.PI / 2);
    ctx.scale(1, 0.55);
    if (design.decalBackground) {
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * 0.30, radius * 0.25, 0, 0, Math.PI * 2);
      ctx.fillStyle = design.decalBackground;
      ctx.fill();
      ctx.strokeStyle = 'rgba(20, 29, 32, 0.72)';
      ctx.lineWidth = Math.max(0.5, radius * 0.035);
      ctx.stroke();
    }

    if (design.decalShape === 'longhorn') {
      ctx.beginPath();
      ctx.moveTo(-radius * 0.09, -radius * 0.02);
      ctx.lineTo(-radius * 0.27, -radius * 0.15);
      ctx.quadraticCurveTo(-radius * 0.32, -radius * 0.16, -radius * 0.29, -radius * 0.09);
      ctx.lineTo(-radius * 0.18, radius * 0.01);
      ctx.lineTo(-radius * 0.22, radius * 0.17);
      ctx.quadraticCurveTo(-radius * 0.12, radius * 0.16, 0, radius * 0.09);
      ctx.quadraticCurveTo(radius * 0.12, radius * 0.16, radius * 0.22, radius * 0.17);
      ctx.lineTo(radius * 0.18, radius * 0.01);
      ctx.lineTo(radius * 0.29, -radius * 0.09);
      ctx.quadraticCurveTo(radius * 0.32, -radius * 0.16, radius * 0.27, -radius * 0.15);
      ctx.lineTo(radius * 0.09, -radius * 0.02);
      ctx.quadraticCurveTo(0, -radius * 0.08, -radius * 0.09, -radius * 0.02);
      ctx.closePath();
      ctx.fillStyle = design.decalColor;
      ctx.fill();
    } else if (design.decalMark) {
      ctx.fillStyle = design.decalColor;
      ctx.font = `900 ${Math.max(2, radius * Math.min(0.42, 0.52 / design.decalMark.length))}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(design.decalMark, 0, 0);
    }
    ctx.restore();
  }

  const shellShade = ctx.createRadialGradient(-radius * 0.28, -radius * 0.24, radius * 0.08, 0, radius * 0.12, radius * 1.06);
  shellShade.addColorStop(0, 'rgba(255, 255, 255, 0.40)');
  shellShade.addColorStop(0.38, 'rgba(255, 255, 255, 0.12)');
  shellShade.addColorStop(0.72, 'rgba(0, 0, 0, 0.04)');
  shellShade.addColorStop(1, 'rgba(0, 0, 0, 0.40)');
  ctx.fillStyle = shellShade;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2.2);

  for (const side of [-1, 1]) {
    for (const ventY of [-0.30, -0.04]) {
      ctx.beginPath();
      ctx.moveTo(side * radius * 0.39, radius * ventY);
      ctx.lineTo(side * radius * 0.43, radius * (ventY + 0.14));
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.60)';
      ctx.lineWidth = Math.max(1.2, radius * 0.10);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.20)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.36)';
  ctx.lineWidth = Math.max(0.7, radius * 0.055);
  ctx.beginPath();
  ctx.moveTo(-radius * 0.68, radius * 0.31);
  ctx.bezierCurveTo(-radius * 0.78, -radius * 0.04, -radius * 0.69, -radius * 0.48, -radius * 0.35, -radius * 0.58);
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = '#263036';
  ctx.lineWidth = Math.max(1.6, radius * 0.14);
  ctx.beginPath();
  ctx.moveTo(-radius * 0.65, -radius * 0.63);
  ctx.quadraticCurveTo(0, -radius * 0.87, radius * 0.65, -radius * 0.63);
  ctx.stroke();

  for (const side of [-1, 1]) {
    ctx.fillStyle = '#d6dcdb';
    ctx.strokeStyle = '#273139';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.ellipse(side * radius * 0.78, -radius * 0.43, radius * 0.065, radius * 0.095, side * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
