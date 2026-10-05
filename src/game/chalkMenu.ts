import type { Entity } from './types';

export function evaluateDirtSwipeGesture(
  entity: Entity,
  role: 'WR' | 'RB' | 'DEFENDER',
  dx: number,
  dy: number,
  attackDirection: number
): { value: string; label: string; icon: string; color: string } {
  const forwardY = dy * attackDirection; // positive = downfield towards opponent endzone
  const lateralDist = Math.abs(dx);
  const angleDeg = (Math.atan2(dx, forwardY) * 180) / Math.PI;

  if (role === 'WR') {
    // Straight backward pull -> RUN BLOCK
    if (forwardY < -22 && lateralDist < 28) {
      return { value: 'BLOCK', label: 'RUN BLOCK', icon: '🛡️', color: '#ffffff' };
    }
    // Comeback / curl (moderate backward cut)
    if (forwardY < -10) {
      return { value: 'COMEBACK', label: 'CURL / HOOK', icon: '↩️', color: '#ff66aa' };
    }
    // Straight line forward -> FLY / GO ROUTE
    if (Math.abs(angleDeg) <= 25 && forwardY > 16) {
      return { value: 'GO', label: 'FLY (GO)', icon: '🚀', color: '#00ffff' };
    }
    // Pure horizontal crossing route
    if (lateralDist > 30 && Math.abs(forwardY) <= 18) {
      return { value: 'CROSS', label: 'CROSSING ROUTE', icon: '🏃', color: '#ffaa00' };
    }
    // Diagonal routes: Slant (inside towards center) vs Flag / Corner (outside towards sideline)
    const isLeftSide = entity.x < 170;
    const isSwipingInside = isLeftSide ? dx > 0 : dx < 0;
    if (isSwipingInside) {
      return { value: 'SLANT', label: 'QUICK SLANT', icon: '⚡', color: '#00ffaa' };
    } else {
      return { value: 'FLAG', label: 'CORNER / FLAG', icon: '🚩', color: '#ffcc00' };
    }
  }

  if (role === 'RB') {
    // Backward swipe -> RUN BLOCKING / PASS PROTECTION
    if (forwardY < -12 && lateralDist < 20) {
      return { value: 'BLOCK', label: 'PASS BLOCK', icon: '🛡️', color: '#ffffff' };
    }
    // Straight line forward (within 26 degrees) -> FLY (GO) ROUTE!
    if (Math.abs(angleDeg) <= 26 && forwardY > 15) {
      return { value: 'GO', label: 'RB FLY (GO)', icon: '🚀', color: '#00ffff' };
    }
    // Forward diagonal line -> FLAT ROUTE!
    if (forwardY > 15 && lateralDist >= 15) {
      return { value: 'FLAT', label: 'FLAT ROUTE', icon: '➡️', color: '#00ffff' };
    }
    // Left or right swipe on the RB -> CALL A DESIGNED RUN PLAY!
    if (dx < 0) {
      return { value: 'RUN_LEFT', label: 'RUN PLAY (LEFT)', icon: '🏈', color: '#00ffaa' };
    } else {
      return { value: 'RUN_RIGHT', label: 'RUN PLAY (RIGHT)', icon: '🏈', color: '#00ffaa' };
    }
  }

  // DEFENDER
  if (forwardY < -16) {
    // Towards LOS / offense
    return { value: 'BLITZ', label: 'BLITZ / RUSH', icon: '💥', color: '#00ff66' };
  }
  if (forwardY > 18) {
    // Deep back into zone coverage
    return { value: 'ZONE', label: 'ZONE COVERAGE', icon: '🛡️', color: '#ff3333' };
  }
  if (lateralDist > 24) {
    return { value: 'MAN', label: 'MAN COVERAGE', icon: '👤', color: '#ffcc00' };
  }
  return { value: 'RB_SPY', label: 'RB SPY / COVER', icon: '🕵️‍♂️', color: '#00ffaa' };
}

export function getBackyardBuddyCallout(
  role: 'WR' | 'RB' | 'DEFENDER',
  routeValue: string,
  isBlocker = false
): string {
  if (isBlocker || routeValue === 'BLOCK') {
    const quotes = [
      "Run block set! Sealing the edge! 🛡️",
      "Pancake block coming up! 🛡️",
      "Lead blocking for the run! 🛡️",
      "I got the edge locked down! 🛡️"
    ];
    return quotes[Math.floor(Math.random() * quotes.length)];
  }

  if (role === 'WR') {
    switch (routeValue) {
      case 'GO':
        return "Burn 'em deep to the fire hydrant! 🚀";
      case 'SLANT':
      case 'SLANT-L':
      case 'SLANT-R':
        return "Slanting inside behind the tree! ⚡";
      case 'CROSS':
      case 'CROSS-L':
      case 'CROSS-R':
        return "Crossing through the yard! 🏃";
      case 'COMEBACK':
        return "Curling back at the fence! ↩️";
      case 'FLAG':
      case 'FLAG-L':
      case 'FLAG-R':
        return "Heading for the back corner! 🚩";
      default:
        return "Got the route! 🏈";
    }
  }

  if (role === 'RB') {
    switch (routeValue) {
      case 'RUN':
      case 'RUN_LEFT':
      case 'RUN_RIGHT':
        return "I got the rock! Running it! 🏈💨";
      case 'GO':
        return "Streaking deep on the fly! 🚀";
      case 'FLAT':
        return "Leaking into the flat for checkdown! ➡️";
      case 'ANGLE':
        return "Angle cut right up the middle! ↗️";
      default:
        return "Ready in the backfield! 🏈";
    }
  }

  // DEFENDER
  switch (routeValue) {
    case 'BLITZ':
      return "All out blitz! Rush the QB! 💥";
    case 'MAN':
      return "I got him locked in man! 👤";
    case 'ZONE':
      return "Patrolling my deep zone! 🛡️";
    case 'QB_SPY':
      return "Eyes on the QB scramble! 🕵️";
    case 'RB_SPY':
      return "I'm locking down the Running Back! 🕵️‍♂️";
    default:
      return "Base defense aligned! ⚪";
  }
}

export function drawDirtSwipeGesture(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  curX: number,
  curY: number,
  detectedLabel: string,
  detectedIcon: string,
  detectedColor: string,
  cameraScale: number
): void {
  ctx.save();

  // Chalk line from player to finger
  ctx.strokeStyle = detectedColor || '#00ffff';
  ctx.lineWidth = 3.5 / cameraScale;
  ctx.setLineDash([5, 3]);
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(curX, curY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Arrowhead at current finger pos
  const angle = Math.atan2(curY - startY, curX - startX);
  const headLen = 14 / cameraScale;
  ctx.fillStyle = detectedColor || '#00ffff';
  ctx.beginPath();
  ctx.moveTo(curX, curY);
  ctx.lineTo(curX - headLen * Math.cos(angle - Math.PI / 6), curY - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(curX - headLen * Math.cos(angle + Math.PI / 6), curY - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();

  // Floating chalk tooltip pill
  const pillText = `${detectedIcon} ${detectedLabel}`;
  ctx.font = `bold ${Math.round(10.5 / cameraScale)}px Courier New, monospace`;
  const textWidth = ctx.measureText(pillText).width;
  const pillW = textWidth + 16;
  const pillH = 20 / cameraScale;
  const pillX = curX - pillW / 2;
  const pillY = curY - 28 / cameraScale;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
  ctx.strokeStyle = detectedColor || '#00ffff';
  ctx.lineWidth = 1.6 / cameraScale;
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pillText, curX, pillY + pillH / 2);

  ctx.restore();
}
