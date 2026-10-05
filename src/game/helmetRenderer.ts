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

export function drawThreeQuarterHelmetSprite(
  ctx: HelmetDrawingContext,
  entity: Pick<Entity, 'x' | 'y' | 'radius' | 'vx' | 'vy'>,
  design: HelmetDesign,
  forwardDirection: number,
  sizeScale = 1
) {
  const radius = entity.radius * 1.15 * sizeScale;
  const velocityX = entity.vx || 0;
  const velocityY = entity.vy || 0;
  const moving = Math.hypot(velocityX, velocityY) > 0.4;
  // If moving, facing direction follows velocity; otherwise follows forwardDirection (-1 = downfield away from camera, 1 = upfield towards camera)
  const facingAway = moving ? velocityY < -0.15 : forwardDirection === -1;
  const lateralBias = moving ? Math.max(-1, Math.min(1, velocityX / 1.5)) : 0;

  ctx.save();
  ctx.translate(entity.x, entity.y);

  // 1. Cleat & Turf Ground Shadow
  ctx.save();
  ctx.translate(0, radius * 0.95);
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.05, radius * 0.35, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.fill();
  ctx.restore();

  // 2. Shoulder Pads & Jersey Yoke (gives authentic football player silhouette)
  ctx.save();
  ctx.translate(0, radius * 0.40);
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.35, radius * 0.60, 0, 0, Math.PI * 2);
  ctx.fillStyle = design.shell;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.lineWidth = Math.max(1, radius * 0.1);
  ctx.stroke();

  // Jersey neck opening / collar
  ctx.beginPath();
  ctx.ellipse(0, -radius * 0.12, radius * 0.50, radius * 0.24, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.restore();

  // 3. 3/4 Perspective Helmet
  ctx.save();
  const helmetOffsetY = -radius * 0.20;
  ctx.translate(lateralBias * radius * 0.15, helmetOffsetY);

  if (facingAway) {
    // --- OFFENSE / MOVING DOWNFIELD (Rear 3/4 View) ---
    // Smooth 3D dome shell seen from behind
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.92, radius * 0.95, 0, 0, Math.PI * 2);
    ctx.fillStyle = design.shell;
    ctx.fill();
    ctx.strokeStyle = '#151d20';
    ctx.lineWidth = Math.max(1.2, radius * 0.11);
    ctx.stroke();

    // Crown Center Stripe(s)
    if (design.centerStripe.length > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * 0.90, radius * 0.93, 0, 0, Math.PI * 2);
      ctx.clip();

      const stripeWidth = radius * (design.centerStripe.length === 1 ? 0.22 : 0.40);
      const weights = design.stripeWidths ?? design.centerStripe.map(() => 1);
      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
      let stripeX = -stripeWidth / 2;
      design.centerStripe.forEach((color, index) => {
        const bandWidth = stripeWidth * weights[index] / totalWeight;
        ctx.fillStyle = color;
        ctx.fillRect(stripeX, -radius * 1.2, bandWidth, radius * 2.4);
        stripeX += bandWidth;
      });
      ctx.restore();
    }

    // 3D Spherical High Stadium Lighting Gradient
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.90, radius * 0.93, 0, 0, Math.PI * 2);
    ctx.clip();
    const domeShade = ctx.createRadialGradient(-radius * 0.25, -radius * 0.35, radius * 0.1, 0, 0, radius * 1.05);
    domeShade.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
    domeShade.addColorStop(0.45, 'rgba(255, 255, 255, 0.08)');
    domeShade.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
    ctx.fillStyle = domeShade;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.restore();

    // Earhole & side logo decals on visible flanks
    for (const side of [-1, 1]) {
      if (!design.decalMark && !design.decalShape) continue;
      ctx.save();
      ctx.translate(side * radius * 0.72, radius * 0.05);
      ctx.scale(0.55, 0.85);
      if (design.decalBackground) {
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 0.32, radius * 0.26, 0, 0, Math.PI * 2);
        ctx.fillStyle = design.decalBackground;
        ctx.fill();
      }
      if (design.decalShape === 'longhorn') {
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 0.20, radius * 0.20, 0, 0, Math.PI * 2);
        ctx.fillStyle = design.decalColor;
        ctx.fill();
      } else if (design.decalMark) {
        ctx.fillStyle = design.decalColor;
        ctx.font = `bold ${Math.max(6, radius * 0.36)}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(design.decalMark, 0, 0);
      }
      ctx.restore();
    }

    // Facemask cage profile angled forward on the sides
    ctx.strokeStyle = design.facemask;
    ctx.lineWidth = Math.max(1.3, radius * 0.10);
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * radius * 0.65, -radius * 0.20);
      ctx.lineTo(side * radius * 0.76, -radius * 0.50);
      ctx.lineTo(side * radius * 0.48, -radius * 0.75);
      ctx.stroke();
    }
  } else {
    // --- DEFENSE / FACING UPFIELD (Front 3/4 View) ---
    // Upper dome shell
    ctx.beginPath();
    ctx.ellipse(0, -radius * 0.12, radius * 0.90, radius * 0.88, 0, 0, Math.PI * 2);
    ctx.fillStyle = design.shell;
    ctx.fill();
    ctx.strokeStyle = '#151d20';
    ctx.lineWidth = Math.max(1.2, radius * 0.11);
    ctx.stroke();

    // Center stripe over top crown
    if (design.centerStripe.length > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, -radius * 0.12, radius * 0.88, radius * 0.86, 0, 0, Math.PI * 2);
      ctx.clip();

      const stripeWidth = radius * (design.centerStripe.length === 1 ? 0.22 : 0.40);
      const weights = design.stripeWidths ?? design.centerStripe.map(() => 1);
      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
      let stripeX = -stripeWidth / 2;
      design.centerStripe.forEach((color, index) => {
        const bandWidth = stripeWidth * weights[index] / totalWeight;
        ctx.fillStyle = color;
        ctx.fillRect(stripeX, -radius * 1.1, bandWidth, radius * 1.5);
        stripeX += bandWidth;
      });
      ctx.restore();
    }

    // Visor opening / eyes area
    ctx.beginPath();
    ctx.ellipse(0, radius * 0.05, radius * 0.65, radius * 0.26, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.fill();

    // Visor glare streak
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.60)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-radius * 0.35, radius * 0.02);
    ctx.lineTo(radius * 0.22, -radius * 0.02);
    ctx.stroke();

    // Front Facemask Grill (Shadow base + colored metallic grill)
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = Math.max(2.4, radius * 0.20);
    ctx.beginPath();
    ctx.moveTo(-radius * 0.62, radius * 0.12);
    ctx.quadraticCurveTo(0, radius * 0.25, radius * 0.62, radius * 0.12);
    ctx.moveTo(-radius * 0.52, radius * 0.38);
    ctx.quadraticCurveTo(0, radius * 0.50, radius * 0.52, radius * 0.38);
    for (const bx of [-0.28, 0, 0.28]) {
      ctx.moveTo(bx * radius, -radius * 0.02);
      ctx.lineTo(bx * radius * 0.85, radius * 0.46);
    }
    ctx.stroke();

    // Colored facemask bars
    ctx.strokeStyle = design.facemask;
    ctx.lineWidth = Math.max(1.2, radius * 0.09);
    ctx.stroke();

    // Side decals on temples
    for (const side of [-1, 1]) {
      if (!design.decalMark && !design.decalShape) continue;
      ctx.save();
      ctx.translate(side * radius * 0.70, -radius * 0.10);
      ctx.scale(0.50, 0.75);
      if (design.decalBackground) {
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 0.30, radius * 0.24, 0, 0, Math.PI * 2);
        ctx.fillStyle = design.decalBackground;
        ctx.fill();
      }
      if (design.decalShape === 'longhorn') {
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 0.18, radius * 0.18, 0, 0, Math.PI * 2);
        ctx.fillStyle = design.decalColor;
        ctx.fill();
      } else if (design.decalMark) {
        ctx.fillStyle = design.decalColor;
        ctx.font = `bold ${Math.max(5, radius * 0.32)}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(design.decalMark, 0, 0);
      }
      ctx.restore();
    }
  }

  ctx.restore(); // helmet translation
  ctx.restore(); // player translation
}

export function drawHelmetSprite(
  ctx: HelmetDrawingContext,
  entity: Pick<Entity, 'x' | 'y' | 'radius' | 'vx' | 'vy'>,
  design: HelmetDesign,
  forwardDirection: number,
  sizeScale = 1,
  viewMode: 'TOP_DOWN' | 'THREE_QUARTER' = 'TOP_DOWN'
) {
  if (viewMode === 'THREE_QUARTER') {
    drawThreeQuarterHelmetSprite(ctx, entity, design, forwardDirection, sizeScale);
    return;
  }
  const radius = entity.radius * 1.16 * sizeScale;
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
