import type { Entity } from './types';

export function alignDefenders(
  defenders: Entity[],
  playKey: string,
  attackDirection: number,
  lineOfScrimmageY: number,
  receivers: Entity[],
  centerReceiver: Entity | null
): void {
  if (defenders.length < 7) return;
  const defOffset = 3 * attackDirection;

  defenders.forEach(defender => {
    defender.assignedReceiver = undefined;
    defender.assignedCenter = undefined;
    defender.zoneX = undefined;
    defender.zoneY = undefined;
    defender.passRusher = false;
    defender.type = 'DB';
    defender.color = '#ff6666';
  });

  defenders[0].startX = 170;
  defenders[0].startY = lineOfScrimmageY + defOffset;
  defenders[0].type = 'DL';
  defenders[0].passRusher = true;
  defenders[0].color = '#ff3333';

  if (playKey === 'COVER3') {
    defenders[1].startX = 75; defenders[1].startY = lineOfScrimmageY + (130 * attackDirection); defenders[1].zoneX = 65; defenders[1].zoneY = lineOfScrimmageY + (190 * attackDirection);
    defenders[2].startX = 265; defenders[2].startY = lineOfScrimmageY + (130 * attackDirection); defenders[2].zoneX = 275; defenders[2].zoneY = lineOfScrimmageY + (190 * attackDirection);
    defenders[3].startX = 120; defenders[3].startY = lineOfScrimmageY + (65 * attackDirection); defenders[3].zoneX = 120; defenders[3].zoneY = lineOfScrimmageY + (85 * attackDirection);
    defenders[4].startX = 215; defenders[4].startY = lineOfScrimmageY + (55 * attackDirection); defenders[4].zoneX = 215; defenders[4].zoneY = lineOfScrimmageY + (60 * attackDirection);
    defenders[5].startX = 170; defenders[5].startY = lineOfScrimmageY + (90 * attackDirection); defenders[5].zoneX = 170; defenders[5].zoneY = lineOfScrimmageY + (110 * attackDirection);
    defenders[6].startX = 170; defenders[6].startY = lineOfScrimmageY + (220 * attackDirection); defenders[6].zoneX = 170; defenders[6].zoneY = lineOfScrimmageY + (250 * attackDirection);
  } else if (playKey === 'COVER2MAN') {
    defenders[1].startX = 80; defenders[1].startY = lineOfScrimmageY + (18 * attackDirection); defenders[1].assignedReceiver = receivers[0];
    defenders[2].startX = 260; defenders[2].startY = lineOfScrimmageY + (18 * attackDirection); defenders[2].assignedReceiver = receivers[1];
    defenders[3].startX = 175; defenders[3].startY = lineOfScrimmageY + (25 * attackDirection); defenders[3].assignedReceiver = centerReceiver;
    defenders[4].startX = 170; defenders[4].startY = lineOfScrimmageY + (65 * attackDirection); defenders[4].zoneX = 170; defenders[4].zoneY = lineOfScrimmageY + (75 * attackDirection);
    defenders[5].startX = 95; defenders[5].startY = lineOfScrimmageY + (190 * attackDirection); defenders[5].zoneX = 95; defenders[5].zoneY = lineOfScrimmageY + (230 * attackDirection);
    defenders[6].startX = 245; defenders[6].startY = lineOfScrimmageY + (190 * attackDirection); defenders[6].zoneX = 245; defenders[6].zoneY = lineOfScrimmageY + (230 * attackDirection);
  } else if (playKey === 'TAMPA2') {
    defenders[1].startX = 65; defenders[1].startY = lineOfScrimmageY + (25 * attackDirection); defenders[1].zoneX = 65; defenders[1].zoneY = lineOfScrimmageY + (55 * attackDirection);
    defenders[2].startX = 275; defenders[2].startY = lineOfScrimmageY + (25 * attackDirection); defenders[2].zoneX = 275; defenders[2].zoneY = lineOfScrimmageY + (55 * attackDirection);
    defenders[3].startX = 120; defenders[3].startY = lineOfScrimmageY + (55 * attackDirection); defenders[3].zoneX = 120; defenders[3].zoneY = lineOfScrimmageY + (85 * attackDirection);
    defenders[4].startX = 215; defenders[4].startY = lineOfScrimmageY + (48 * attackDirection); defenders[4].zoneX = 215; defenders[4].zoneY = lineOfScrimmageY + (50 * attackDirection);
    defenders[5].startX = 170; defenders[5].startY = lineOfScrimmageY + (85 * attackDirection); defenders[5].zoneX = 170; defenders[5].zoneY = lineOfScrimmageY + (175 * attackDirection);
    defenders[6].startX = 200; defenders[6].startY = lineOfScrimmageY + (200 * attackDirection); defenders[6].zoneX = 200; defenders[6].zoneY = lineOfScrimmageY + (240 * attackDirection);
  } else if (playKey === 'BLITZ') {
    defenders[0].startX = 145; defenders[0].passRusher = true;
    defenders[1].startX = 195; defenders[1].startY = lineOfScrimmageY + (3 * attackDirection); defenders[1].type = 'DL'; defenders[1].passRusher = true;
    defenders[2].startX = 170; defenders[2].startY = lineOfScrimmageY + (3 * attackDirection); defenders[2].type = 'DL'; defenders[2].passRusher = true;
    defenders[3].startX = 80; defenders[3].startY = lineOfScrimmageY + (18 * attackDirection); defenders[3].assignedReceiver = receivers[0];
    defenders[4].startX = 260; defenders[4].startY = lineOfScrimmageY + (18 * attackDirection); defenders[4].assignedReceiver = receivers[1];
    defenders[5].startX = 175; defenders[5].startY = lineOfScrimmageY + (22 * attackDirection); defenders[5].assignedReceiver = centerReceiver;
    defenders[6].startX = 170; defenders[6].startY = lineOfScrimmageY + (70 * attackDirection); defenders[6].zoneX = 170; defenders[6].zoneY = lineOfScrimmageY + (80 * attackDirection);
  } else if (playKey === 'QUARTERS') {
    defenders[3].startX = 120; defenders[3].startY = lineOfScrimmageY + (50 * attackDirection); defenders[3].zoneX = 115; defenders[3].zoneY = lineOfScrimmageY + (65 * attackDirection); defenders[3].type = 'LB'; defenders[3].color = '#ff5555';
    defenders[4].startX = 215; defenders[4].startY = lineOfScrimmageY + (48 * attackDirection); defenders[4].zoneX = 215; defenders[4].zoneY = lineOfScrimmageY + (55 * attackDirection); defenders[4].type = 'LB'; defenders[4].color = '#ff5555';
    defenders[1].startX = 60; defenders[1].startY = lineOfScrimmageY + (120 * attackDirection); defenders[1].zoneX = 55; defenders[1].zoneY = lineOfScrimmageY + (200 * attackDirection); defenders[1].type = 'CB';
    defenders[2].startX = 280; defenders[2].startY = lineOfScrimmageY + (120 * attackDirection); defenders[2].zoneX = 285; defenders[2].zoneY = lineOfScrimmageY + (200 * attackDirection); defenders[2].type = 'CB';
    defenders[5].startX = 125; defenders[5].startY = lineOfScrimmageY + (160 * attackDirection); defenders[5].zoneX = 120; defenders[5].zoneY = lineOfScrimmageY + (235 * attackDirection); defenders[5].type = 'FS';
    defenders[6].startX = 215; defenders[6].startY = lineOfScrimmageY + (160 * attackDirection); defenders[6].zoneX = 220; defenders[6].zoneY = lineOfScrimmageY + (235 * attackDirection); defenders[6].type = 'SS';
  } else if (playKey === 'ROBBER') {
    defenders[1].startX = 80; defenders[1].startY = lineOfScrimmageY + (18 * attackDirection); defenders[1].assignedReceiver = receivers[0];
    defenders[2].startX = 260; defenders[2].startY = lineOfScrimmageY + (18 * attackDirection); defenders[2].assignedReceiver = receivers[1];
    defenders[3].startX = 175; defenders[3].startY = lineOfScrimmageY + (25 * attackDirection); defenders[3].assignedReceiver = centerReceiver;
    defenders[4].startX = 120; defenders[4].startY = lineOfScrimmageY + (50 * attackDirection); defenders[4].zoneX = 120; defenders[4].zoneY = lineOfScrimmageY + (65 * attackDirection);
    defenders[5].startX = 170; defenders[5].startY = lineOfScrimmageY + (65 * attackDirection); defenders[5].zoneX = 170; defenders[5].zoneY = lineOfScrimmageY + (65 * attackDirection);
    defenders[6].startX = 170; defenders[6].startY = lineOfScrimmageY + (220 * attackDirection); defenders[6].zoneX = 170; defenders[6].zoneY = lineOfScrimmageY + (250 * attackDirection);
  }

  // Shift the shell to the offense's actual alignment before the snap.
  // The coverage roles above remain the same, but defenders should not reset to
  // a stock spread when the offense stacks or overloads one side.
  const leftReceiverX = receivers[0]?.x ?? 80;
  const rightReceiverX = receivers[1]?.x ?? 260;
  const slotReceiverX = centerReceiver?.x ?? 170;
  const clampX = (x: number) => Math.max(35, Math.min(305, x));

  if (playKey === 'COVER2MAN' || playKey === 'BLITZ' || playKey === 'ROBBER') {
    defenders[1].startX = clampX(leftReceiverX);
    defenders[2].startX = clampX(rightReceiverX);
    defenders[3].startX = clampX(slotReceiverX);
  } else if (playKey === 'QUARTERS') {
    defenders[1].startX = clampX(leftReceiverX);
    defenders[2].startX = clampX(rightReceiverX);
    defenders[5].startX = clampX((leftReceiverX + slotReceiverX) / 2);
    defenders[6].startX = clampX((rightReceiverX + slotReceiverX) / 2);
  } else {
    defenders[1].startX = clampX(leftReceiverX);
    defenders[2].startX = clampX(rightReceiverX);
    defenders[3].startX = clampX(leftReceiverX + (slotReceiverX - leftReceiverX) * 0.35);
    defenders[4].startX = clampX(rightReceiverX + (slotReceiverX - rightReceiverX) * 0.35);
    defenders[5].startX = clampX(slotReceiverX);
  }

  defenders.forEach(defender => {
    defender.x = defender.startX || 170;
    defender.y = defender.startY || lineOfScrimmageY;
    defender.vx = 0;
    defender.vy = 0;
  });
}