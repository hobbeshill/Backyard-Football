import type { HelmetDesign } from './helmetDesigns';
import type { Entity } from './types';

export type HelmetDrawingContext = Pick<CanvasRenderingContext2D,
  | 'save' | 'restore' | 'translate' | 'rotate' | 'scale'
  | 'drawImage'
  | 'beginPath' | 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'bezierCurveTo'
  | 'closePath' | 'fill' | 'stroke' | 'clip' | 'ellipse' | 'fillText'
  | 'createRadialGradient' | 'fillRect'
  | 'fillStyle' | 'strokeStyle' | 'lineWidth' | 'lineJoin' | 'lineCap'
  | 'font' | 'textAlign' | 'textBaseline'
  | 'imageSmoothingEnabled' | 'imageSmoothingQuality'
>;

const TEAM_DECAL_CROPS = [
  { x: 45, y: 160, width: 620, height: 230 },
  { x: 749, y: 160, width: 620, height: 230 },
  { x: 1453, y: 160, width: 620, height: 230 },
  { x: 2157, y: 160, width: 620, height: 230 },
  { x: 45, y: 490, width: 620, height: 230 },
  { x: 749, y: 490, width: 620, height: 230 },
  { x: 1453, y: 490, width: 620, height: 230 },
  { x: 2157, y: 490, width: 620, height: 230 },
  { x: 45, y: 818, width: 620, height: 258 },
  { x: 749, y: 818, width: 620, height: 258 },
  { x: 1453, y: 818, width: 620, height: 258 },
  { x: 2157, y: 818, width: 620, height: 258 },
  { x: 45, y: 1160, width: 620, height: 266 },
  { x: 749, y: 1160, width: 620, height: 266 },
  { x: 1453, y: 1160, width: 620, height: 266 },
  { x: 2157, y: 1160, width: 620, height: 266 }
];
const HELMET_VISUAL_RADIUS = 10;
const helmetDecalCache = new Map<number, HTMLCanvasElement>();
let helmetDecalSheet: HTMLImageElement | null = null;

function getHelmetDecal(index: number): HTMLCanvasElement | null {
  if (typeof Image === 'undefined' || typeof document === 'undefined') return null;
  const cached = helmetDecalCache.get(index);
  if (cached) return cached;

  if (!helmetDecalSheet) {
    helmetDecalSheet = new Image();
    helmetDecalSheet.src = '/assets/helmet-decals.png.jpeg';
  }
  if (!helmetDecalSheet.complete || !helmetDecalSheet.naturalWidth) return null;

  const crop = TEAM_DECAL_CROPS[index];
  if (!crop) return null;
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = crop.width;
  sourceCanvas.height = crop.height;
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!sourceContext) return null;
  sourceContext.drawImage(helmetDecalSheet, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);

  const image = sourceContext.getImageData(0, 0, crop.width, crop.height);
  const { data, width, height } = image;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const enqueueBackground = (pixelIndex: number) => {
    if (visited[pixelIndex]) return;
    const offset = pixelIndex * 4;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    if (red < 228 || green < 228 || blue < 228 || Math.max(red, green, blue) - Math.min(red, green, blue) > 24) return;
    visited[pixelIndex] = 1;
    queue[tail++] = pixelIndex;
  };

  for (let x = 0; x < width; x++) {
    enqueueBackground(x);
    enqueueBackground((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    enqueueBackground(y * width);
    enqueueBackground(y * width + width - 1);
  }

  while (head < tail) {
    const pixelIndex = queue[head++];
    data[pixelIndex * 4 + 3] = 0;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    if (x > 0) enqueueBackground(pixelIndex - 1);
    if (x < width - 1) enqueueBackground(pixelIndex + 1);
    if (y > 0) enqueueBackground(pixelIndex - width);
    if (y < height - 1) enqueueBackground(pixelIndex + width);
  }
  sourceContext.putImageData(image, 0, 0);

  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return null;

  const decalCanvas = document.createElement('canvas');
  decalCanvas.width = right - left + 1;
  decalCanvas.height = bottom - top + 1;
  const decalContext = decalCanvas.getContext('2d');
  if (!decalContext) return null;
  decalContext.putImageData(sourceContext.getImageData(left, top, decalCanvas.width, decalCanvas.height), 0, 0);
  helmetDecalCache.set(index, decalCanvas);
  return decalCanvas;
}

function drawHelmetTeamDecalAt(
  ctx: HelmetDrawingContext,
  design: HelmetDesign,
  radius: number,
  centerX: number,
  centerY: number,
  widthScale: number,
  heightScale: number
): boolean {
  if (design.decalSheetIndex === undefined) return false;
  const decal = getHelmetDecal(design.decalSheetIndex);
  if (!decal) return false;
  const scale = Math.min(radius * widthScale / decal.width, radius * heightScale / decal.height);
  const width = decal.width * scale;
  const height = decal.height * scale;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(decal, centerX - width / 2, centerY - height / 2, width, height);
  ctx.restore();
  return true;
}

function drawHelmetTeamDecal(ctx: HelmetDrawingContext, design: HelmetDesign, direction: number, radius: number): boolean {
  return drawHelmetTeamDecalAt(ctx, design, radius, -direction * radius * 0.10, radius * 0.08, 1.42, 1.0);
}
export function drawThreeQuarterHelmetSprite(
  ctx: HelmetDrawingContext,
  entity: Pick<Entity, 'x' | 'y' | 'radius' | 'vx' | 'vy'>,
  design: HelmetDesign,
  forwardDirection: number,
  sizeScale = 1
) {
  const radius = HELMET_VISUAL_RADIUS * 1.15 * sizeScale;
  const velocityX = entity.vx || 0;
  const velocityY = entity.vy || 0;
  const moving = Math.hypot(velocityX, velocityY) > 0.4;
  const profileDirection = moving && Math.abs(velocityX) > Math.abs(velocityY) ? Math.sign(velocityX) : 0;
  const facingAway = profileDirection ? false : moving ? velocityY < -0.15 : forwardDirection === -1;

  ctx.save();
  ctx.translate(entity.x, entity.y);

  ctx.save();
  ctx.translate(0, radius * 0.95);
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.05, radius * 0.35, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(moving ? Math.max(-1, Math.min(1, velocityX / 1.5)) * radius * 0.15 : 0, -radius * 0.20);

  if (profileDirection) {
    ctx.beginPath();
    ctx.moveTo(-profileDirection * radius * 0.78, radius * 0.10);
    ctx.quadraticCurveTo(-profileDirection * radius * 0.94, -radius * 0.32, -profileDirection * radius * 0.62, -radius * 0.68);
    ctx.quadraticCurveTo(-profileDirection * radius * 0.34, -radius * 0.96, profileDirection * radius * 0.08, -radius * 0.93);
    ctx.quadraticCurveTo(profileDirection * radius * 0.52, -radius * 0.91, profileDirection * radius * 0.68, -radius * 0.55);
    ctx.quadraticCurveTo(profileDirection * radius * 0.78, -radius * 0.34, profileDirection * radius * 0.70, -radius * 0.12);
    ctx.lineTo(profileDirection * radius * 0.82, -radius * 0.08);
    ctx.lineTo(profileDirection * radius * 0.79, radius * 0.03);
    ctx.quadraticCurveTo(profileDirection * radius * 0.58, radius * 0.08, profileDirection * radius * 0.48, radius * 0.30);
    ctx.lineTo(profileDirection * radius * 0.37, radius * 0.56);
    ctx.quadraticCurveTo(-profileDirection * radius * 0.02, radius * 0.70, -profileDirection * radius * 0.40, radius * 0.54);
    ctx.quadraticCurveTo(-profileDirection * radius * 0.73, radius * 0.44, -profileDirection * radius * 0.78, radius * 0.10);
    ctx.closePath();
    ctx.fillStyle = design.shell;
    ctx.fill();
    ctx.strokeStyle = '#151d20';
    ctx.lineWidth = Math.max(1.2, radius * 0.11);
    ctx.stroke();

    if (design.centerStripe.length > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-profileDirection * radius * 0.62, -radius * 0.69);
      ctx.quadraticCurveTo(-profileDirection * radius * 0.28, -radius * 0.98, profileDirection * radius * 0.10, -radius * 0.97);
      ctx.quadraticCurveTo(profileDirection * radius * 0.48, -radius * 0.94, profileDirection * radius * 0.64, -radius * 0.67);
      ctx.lineTo(profileDirection * radius * 0.60, -radius * 0.61);
      ctx.quadraticCurveTo(profileDirection * radius * 0.38, -radius * 0.84, profileDirection * radius * 0.08, -radius * 0.87);
      ctx.quadraticCurveTo(-profileDirection * radius * 0.30, -radius * 0.86, -profileDirection * radius * 0.62, -radius * 0.62);
      ctx.closePath();
      ctx.clip();
      const weights = design.stripeWidths ?? design.centerStripe.map(() => 1);
      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
      let stripeOffset = -radius * 0.045;
      design.centerStripe.forEach((color, index) => {
        const bandWidth = radius * 0.09 * weights[index] / totalWeight;
        const offset = stripeOffset + bandWidth / 2;
        ctx.beginPath();
        ctx.moveTo(-profileDirection * radius * 0.62, -radius * 0.65 + offset);
        ctx.bezierCurveTo(-profileDirection * radius * 0.42, -radius * 0.87 + offset, profileDirection * radius * 0.42, -radius * 0.87 + offset, profileDirection * radius * 0.64, -radius * 0.65 + offset);
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(0.35, bandWidth);
        ctx.stroke();
        stripeOffset += bandWidth;
      });
      ctx.restore();
    }

    if (!drawHelmetTeamDecal(ctx, design, profileDirection, radius) && (design.decalBackground || design.decalMark || design.decalShape)) {
      ctx.save();
      ctx.translate(-profileDirection * radius * 0.10, radius * 0.08);
      if (design.decalBackground) {
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 0.30, radius * 0.24, 0, 0, Math.PI * 2);
        ctx.fillStyle = design.decalBackground;
        ctx.fill();
      }
      if (design.decalShape === 'longhorn') {
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 0.19, radius * 0.17, 0, 0, Math.PI * 2);
        ctx.fillStyle = design.decalColor;
        ctx.fill();
      } else if (design.decalMark) {
        ctx.fillStyle = design.decalColor;
        ctx.font = `bold ${Math.max(6, radius * 0.34)}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(design.decalMark, 0, 0);
      }
      ctx.restore();
    }

    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.beginPath();
    ctx.ellipse(profileDirection * radius * 0.62, radius * 0.02, radius * 0.22, radius * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = Math.max(2.2, radius * 0.18);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(profileDirection * radius * 0.45, -radius * 0.13);
    ctx.lineTo(profileDirection * radius * 0.80, -radius * 0.17);
    ctx.lineTo(profileDirection * radius * 0.90, radius * 0.12);
    ctx.lineTo(profileDirection * radius * 0.62, radius * 0.31);
    ctx.moveTo(profileDirection * radius * 0.53, -radius * 0.10);
    ctx.lineTo(profileDirection * radius * 0.57, radius * 0.39);
    ctx.stroke();
    ctx.strokeStyle = design.facemask;
    ctx.lineWidth = Math.max(1.2, radius * 0.09);
    ctx.stroke();
  } else if (facingAway) {
    const drawRearShellPath = () => {
      ctx.beginPath();
      ctx.moveTo(-radius * 0.72, radius * 0.82);
      ctx.lineTo(radius * 0.72, radius * 0.82);
      ctx.quadraticCurveTo(radius * 0.92, radius * 0.66, radius * 0.92, radius * 0.20);
      ctx.lineTo(radius * 0.92, -radius * 0.24);
      ctx.bezierCurveTo(radius * 0.92, -radius * 0.75, radius * 0.42, -radius * 1.08, 0, -radius * 1.08);
      ctx.bezierCurveTo(-radius * 0.42, -radius * 1.08, -radius * 0.92, -radius * 0.75, -radius * 0.92, -radius * 0.24);
      ctx.lineTo(-radius * 0.92, radius * 0.20);
      ctx.quadraticCurveTo(-radius * 0.92, radius * 0.66, -radius * 0.72, radius * 0.82);
      ctx.closePath();
    };

    drawRearShellPath();
    ctx.fillStyle = design.shell;
    ctx.fill();
    ctx.strokeStyle = '#151d20';
    ctx.lineWidth = Math.max(1.2, radius * 0.11);
    ctx.stroke();

    if (design.centerStripe.length > 0) {
      ctx.save();
      drawRearShellPath();
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

    ctx.save();
    drawRearShellPath();
    ctx.clip();
    const domeShade = ctx.createRadialGradient(-radius * 0.25, -radius * 0.35, radius * 0.1, 0, 0, radius * 1.05);
    domeShade.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
    domeShade.addColorStop(0.45, 'rgba(255, 255, 255, 0.08)');
    domeShade.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
    ctx.fillStyle = domeShade;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.restore();

    ctx.strokeStyle = '#151d20';
    ctx.lineWidth = Math.max(1.3, radius * 0.12);
    ctx.beginPath();
    ctx.moveTo(-radius * 0.42, radius * 0.58);
    ctx.lineTo(radius * 0.42, radius * 0.58);
    ctx.stroke();
  } else {
    const drawFrontShellPath = () => {
      ctx.beginPath();
      ctx.moveTo(-radius * 0.82, radius * 0.18);
      ctx.bezierCurveTo(-radius * 0.92, -radius * 0.02, -radius * 0.92, -radius * 0.72, -radius * 0.40, -radius * 0.94);
      ctx.quadraticCurveTo(0, -radius * 1.08, radius * 0.40, -radius * 0.94);
      ctx.bezierCurveTo(radius * 0.92, -radius * 0.72, radius * 0.92, -radius * 0.02, radius * 0.82, radius * 0.18);
      ctx.quadraticCurveTo(radius * 0.82, radius * 0.38, radius * 0.76, radius * 0.58);
      ctx.quadraticCurveTo(radius * 0.72, radius * 0.82, radius * 0.60, radius * 0.82);
      ctx.lineTo(radius * 0.46, radius * 0.55);
      ctx.quadraticCurveTo(radius * 0.42, radius * 0.40, radius * 0.42, radius * 0.26);
      ctx.quadraticCurveTo(0, radius * 0.14, -radius * 0.42, radius * 0.26);
      ctx.quadraticCurveTo(-radius * 0.42, radius * 0.40, -radius * 0.46, radius * 0.55);
      ctx.lineTo(-radius * 0.60, radius * 0.82);
      ctx.quadraticCurveTo(-radius * 0.72, radius * 0.82, -radius * 0.76, radius * 0.58);
      ctx.quadraticCurveTo(-radius * 0.82, radius * 0.38, -radius * 0.82, radius * 0.18);
      ctx.closePath();
    };

    drawFrontShellPath();
    ctx.fillStyle = design.shell;
    ctx.fill();
    ctx.strokeStyle = '#151d20';
    ctx.lineWidth = Math.max(1.2, radius * 0.11);
    ctx.stroke();

    if (design.centerStripe.length > 0) {
      ctx.save();
      drawFrontShellPath();
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

    ctx.beginPath();
    ctx.ellipse(0, radius * 0.05, radius * 0.65, radius * 0.26, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.60)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-radius * 0.35, radius * 0.02);
    ctx.lineTo(radius * 0.22, -radius * 0.02);
    ctx.stroke();

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = Math.max(2.4, radius * 0.20);
    ctx.beginPath();
    ctx.moveTo(-radius * 0.62, radius * 0.12);
    ctx.quadraticCurveTo(0, radius * 0.25, radius * 0.62, radius * 0.12);
    ctx.moveTo(-radius * 0.52, radius * 0.38);
    ctx.quadraticCurveTo(0, radius * 0.50, radius * 0.52, radius * 0.38);
    for (const barX of [-0.28, 0, 0.28]) {
      ctx.moveTo(barX * radius, -radius * 0.02);
      ctx.lineTo(barX * radius * 0.85, radius * 0.46);
    }
    ctx.stroke();

    ctx.strokeStyle = design.facemask;
    ctx.lineWidth = Math.max(1.2, radius * 0.09);
    ctx.stroke();

    const decalDrawn = drawHelmetTeamDecalAt(ctx, design, radius, -radius * 0.70, -radius * 0.10, 0.46, 0.42) &&
      drawHelmetTeamDecalAt(ctx, design, radius, radius * 0.70, -radius * 0.10, 0.46, 0.42);
    if (!decalDrawn && (design.decalBackground || design.decalMark || design.decalShape)) {
      for (const side of [-1, 1]) {
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
  }

  ctx.restore();
  ctx.restore();
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
  const radius = HELMET_VISUAL_RADIUS * 1.15 * sizeScale;
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
