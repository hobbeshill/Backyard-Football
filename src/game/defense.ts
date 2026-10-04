import type { DefensiveAssignment, Entity } from './types';

export interface CpuDefenseSituation {
  down: number;
  yardsToGo: number;
  lineOfScrimmageY: number;
  attackDirection: number;
  recentPlays: Array<{
    play: string;
    isPass: boolean;
    isQbRun?: boolean;
    targetWasRb?: boolean;
    isFlatPass?: boolean;
    formation?: string;
    routes?: {
      left?: string;
      slot?: string;
      center?: string;
      right?: string;
      rb?: string;
    };
  }>;
}

export function alignDefenderAcrossFromRunningBack(
  defender: Entity,
  runningBack: Entity,
  lineOfScrimmageY: number,
  attackDirection: number,
  fieldWidth = 340
): void {
  const radius = defender.radius || 10;
  const targetX = Math.max(radius, Math.min(fieldWidth - radius, runningBack.x));
  const targetY = lineOfScrimmageY + (24 * attackDirection);
  defender.startX = targetX;
  defender.startY = targetY;
  defender.x = targetX;
  defender.y = targetY;
  defender.vx = 0;
  defender.vy = 0;
}

export function alignDefenderAcrossFromReceiver(
  defender: Entity,
  receiver: Entity,
  lineOfScrimmageY: number,
  attackDirection: number,
  fieldWidth = 340
): void {
  const radius = defender.radius || 10;
  const targetX = Math.max(radius, Math.min(fieldWidth - radius, receiver.x));
  const shellDepth = defender.startY === undefined
    ? 24
    : (defender.startY - lineOfScrimmageY) * attackDirection;
  const coverageDepth = Math.max(24, Math.min(180, shellDepth));
  const targetY = lineOfScrimmageY + (coverageDepth * attackDirection);
  defender.startX = targetX;
  defender.startY = targetY;
  defender.x = targetX;
  defender.y = targetY;
  defender.vx = 0;
  defender.vy = 0;
}

export function separateDefenderAlignments(defenders: Entity[], fieldWidth = 340, minimumPadding = 10): void {
  const positioned: Entity[] = [];

  defenders.forEach((defender, index) => {
    const originalX = defender.startX ?? defender.x;
    const originalY = defender.startY ?? defender.y;
    let x = originalX;
    let y = originalY;

    for (let pass = 0; pass < defenders.length; pass++) {
      const overlap = positioned.find(other => {
        const minimumDistance = (defender.radius || 10) + (other.radius || 10) + minimumPadding;
        return Math.hypot(x - other.x, y - other.y) < minimumDistance;
      });
      if (!overlap) break;

      let dx = x - overlap.x;
      let dy = y - overlap.y;
      let distance = Math.hypot(dx, dy);
      if (distance === 0) {
        dx = index % 2 === 0 ? 1 : -1;
        distance = 1;
      }

      const minimumDistance = (defender.radius || 10) + (overlap.radius || 10) + minimumPadding;
      const separation = minimumDistance - distance;
      x += (dx / distance) * separation;
      y += (dy / distance) * separation;
      x = Math.max(defender.radius || 10, Math.min(fieldWidth - (defender.radius || 10), x));
      const remainingDistance = Math.hypot(x - overlap.x, y - overlap.y);
      if (remainingDistance < minimumDistance) {
        const verticalDistance = Math.sqrt(Math.max(0, minimumDistance ** 2 - (x - overlap.x) ** 2)) + 1;
        y = overlap.y + (index % 2 === 0 ? verticalDistance : -verticalDistance);
      }
    }

    const deltaX = x - originalX;
    const deltaY = y - originalY;
    defender.x = x;
    defender.y = y;
    defender.startX = x;
    defender.startY = y;
    if (defender.zoneX !== undefined) defender.zoneX += deltaX;
    if (defender.zoneY !== undefined) defender.zoneY += deltaY;
    positioned.push(defender);
  });
}

export function alignDefenders(
  defenders: Entity[],
  playKey: string,
  attackDirection: number,
  lineOfScrimmageY: number,
  receivers: Entity[],
  centerReceiver: Entity | null
): void {
  if (defenders.length < 7) return;
  const defOffset = 24 * attackDirection;

  defenders.forEach(defender => {
    defender.assignedReceiver = undefined;
    defender.coverageLeverage = undefined;
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

  const placeDefender = (
    index: number,
    x: number,
    depth: number,
    zoneDepth: number,
    type: string,
    passRusher = false
  ) => {
    const defender = defenders[index];
    defender.startX = x;
    defender.startY = lineOfScrimmageY + (depth * attackDirection);
    defender.zoneX = x;
    defender.zoneY = lineOfScrimmageY + (zoneDepth * attackDirection);
    defender.type = type;
    defender.passRusher = passRusher;
  };

  if (playKey === 'COVER2') {
    placeDefender(1, 55, 42, 72, 'CB');
    placeDefender(2, 285, 42, 72, 'CB');
    placeDefender(3, 125, 70, 112, 'LB');
    placeDefender(4, 215, 70, 112, 'LB');
    placeDefender(5, 105, 185, 245, 'FS');
    placeDefender(6, 235, 185, 245, 'SS');
  } else if (playKey === 'ZONE34') {
    placeDefender(0, 105, 24, 24, 'DL', true);
    placeDefender(1, 170, 24, 24, 'DL', true);
    placeDefender(2, 235, 24, 24, 'DL', true);
    placeDefender(3, 75, 105, 155, 'CB');
    placeDefender(4, 265, 105, 155, 'CB');
    placeDefender(5, 135, 175, 235, 'FS');
    placeDefender(6, 205, 175, 235, 'SS');
  } else if (playKey === 'ZONE232') {
    placeDefender(0, 130, 24, 24, 'DL', true);
    placeDefender(1, 210, 24, 24, 'DL', true);
    placeDefender(2, 55, 80, 125, 'LB');
    placeDefender(3, 170, 80, 125, 'LB');
    placeDefender(4, 285, 80, 125, 'LB');
    placeDefender(5, 105, 185, 245, 'FS');
    placeDefender(6, 235, 185, 245, 'SS');
  } else if (playKey === 'ZONE151') {
    placeDefender(1, 50, 75, 125, 'CB');
    placeDefender(2, 290, 75, 125, 'CB');
    placeDefender(3, 105, 80, 130, 'LB');
    placeDefender(4, 170, 80, 130, 'LB');
    placeDefender(5, 235, 80, 130, 'LB');
    placeDefender(6, 170, 220, 250, 'FS');
  }

  // Shift the shell to the offense's actual alignment before the snap.
  // The coverage roles above remain the same, but defenders should not reset to
  // a stock spread when the offense stacks or overloads one side.
  const leftReceiverX = receivers[0]?.x ?? 80;
  const rightReceiverX = receivers[receivers.length - 1]?.x ?? 260;
  const slotReceiverX = centerReceiver?.x ?? 170;
  const clampX = (x: number) => Math.max(35, Math.min(305, x));

  if (playKey === 'COVER2') {
    defenders[1].startX = clampX(leftReceiverX);
    defenders[2].startX = clampX(rightReceiverX);
    defenders[3].startX = clampX(leftReceiverX + (slotReceiverX - leftReceiverX) * 0.35);
    defenders[4].startX = clampX(rightReceiverX + (slotReceiverX - rightReceiverX) * 0.35);
  } else if (playKey === 'ZONE34') {
    defenders[3].startX = clampX(leftReceiverX);
    defenders[4].startX = clampX(rightReceiverX);
  } else if (playKey === 'ZONE232') {
    defenders[2].startX = clampX(leftReceiverX);
    defenders[3].startX = clampX(slotReceiverX);
    defenders[4].startX = clampX(rightReceiverX);
  } else if (playKey === 'ZONE151') {
    const underneathXs = [leftReceiverX, leftReceiverX + (slotReceiverX - leftReceiverX) * 0.5, slotReceiverX,
      rightReceiverX + (slotReceiverX - rightReceiverX) * 0.5, rightReceiverX];
    [1, 3, 4, 5, 2].forEach((index, position) => {
      defenders[index].startX = clampX(underneathXs[position]);
    });
  } else {
    defenders[1].startX = clampX(leftReceiverX);
    defenders[2].startX = clampX(rightReceiverX);
    defenders[3].startX = clampX(leftReceiverX + (slotReceiverX - leftReceiverX) * 0.35);
    defenders[4].startX = clampX(rightReceiverX + (slotReceiverX - rightReceiverX) * 0.35);
    defenders[5].startX = clampX(slotReceiverX);
  }

  // Roll safety support toward overloaded formations (like TRIPS)
  const allReceivers = [...receivers, centerReceiver].filter((r): r is Entity => Boolean(r));
  const rightOverload = allReceivers.filter(r => r.x > 185).length >= 3;
  const leftOverload = allReceivers.filter(r => r.x < 155).length >= 3;
  if (rightOverload && defenders[6] && playKey !== 'COVER2') {
    defenders[6].startX = clampX(235);
  } else if (leftOverload && defenders[6] && playKey !== 'COVER2') {
    defenders[6].startX = clampX(105);
  }

  defenders.forEach(defender => {
    defender.x = defender.startX || 170;
    defender.y = defender.startY || lineOfScrimmageY;
    defender.vx = 0;
    defender.vy = 0;
  });
}

export function chooseCpuDefensiveAssignments(
  defenders: Entity[],
  eligibleReceivers: Entity[],
  situation: CpuDefenseSituation,
  random: () => number = Math.random
): Map<number, DefensiveAssignment> {
  const assignments = new Map<number, DefensiveAssignment>();
  const receivingThreats = eligibleReceivers.filter(receiver => !receiver.isBlocker && receiver.routeType !== 'BLOCK');
  defenders.forEach((defender, index) => {
    assignments.set(index, defender.passRusher
      ? 'BLITZ'
      : defender.assignedReceiver
        ? 'MAN'
        : 'ZONE');
  });

  const recentPlays = situation.recentPlays.slice(-6);
  const routeCounts = new Map<string, number>();
  recentPlays.forEach(play => {
    if (!play.isPass || !play.routes) return;
    new Set(Object.values(play.routes).filter((route): route is string => Boolean(route) && route !== 'BLOCK'))
      .forEach(route => routeCounts.set(route, (routeCounts.get(route) || 0) + 1));
  });
  const repeatedRoutes = new Set(
    [...routeCounts].filter(([, count]) => count >= 2).map(([route]) => route)
  );
  const repeatedVerticalRoute = [...repeatedRoutes].some(route => route === 'GO' || route.startsWith('FLAG'));
  const repeatedShortRoute = [...repeatedRoutes].some(route =>
    route.startsWith('SLANT') || route.startsWith('CROSS') || route === 'COMEBACK'
  );
  const recentRuns = recentPlays.filter(play => !play.isPass).length;
  const runRate = recentPlays.length > 0 ? recentRuns / recentPlays.length : 0.45;
  const shortPassCount = recentPlays.filter(play => play.isPass && play.play !== 'DEEP_SHOT').length;
  const deepPassCount = recentPlays.filter(play => play.play === 'DEEP_SHOT').length;
  const runSituation =
    ((situation.down === 3 || situation.down === 4) && situation.yardsToGo <= 3) ||
    (situation.down <= 2 && situation.yardsToGo <= 2) ||
    (recentPlays.length >= 3 && runRate >= 0.6 && situation.yardsToGo <= 6);
  const passSituation =
    ((situation.down === 3 || situation.down === 4) && situation.yardsToGo >= 6) ||
    situation.yardsToGo >= 9;
  const deepThreat = deepPassCount >= 2 || repeatedVerticalRoute ||
    (passSituation && situation.yardsToGo >= 8 && runRate < 0.5);

  const targetXs = receivingThreats.filter(receiver => !receiver.isRB).map(receiver => receiver.x);
  const compactFormation = targetXs.length >= 3 && (
    Math.max(...targetXs) - Math.min(...targetXs) <= 140 ||
    targetXs.some((firstX, index) => targetXs.slice(index + 1).some(secondX => Math.abs(firstX - secondX) <= 35))
  );
  const shortPassThreat = shortPassCount >= 2 || repeatedShortRoute || compactFormation ||
    ((situation.down === 3 || situation.down === 4) && situation.yardsToGo <= 5 && !runSituation);

  if (shortPassThreat) {
    const desiredManCount = shortPassCount >= 2 || repeatedShortRoute ? 3 : 2;
    const currentManCount = () => [...assignments.values()].filter(assignment => assignment === 'MAN').length;
    const manCandidates = defenders
      .map((defender, index) => ({ defender, index }))
      .filter(({ defender, index }) => {
        if (index === 0 || index === defenders.length - 1 || assignments.get(index) !== 'ZONE') return false;
        const depth = ((defender.startY ?? defender.y) - situation.lineOfScrimmageY) * situation.attackDirection;
        return depth <= 145;
      })
      .map(candidate => ({
        ...candidate,
        distance: receivingThreats.length > 0
          ? Math.min(...receivingThreats.map(receiver =>
            Math.hypot(receiver.x - candidate.defender.x, receiver.y - candidate.defender.y)
          ))
          : Infinity
      }))
      .sort((first, second) => first.distance - second.distance || first.index - second.index);

    while (currentManCount() < desiredManCount && manCandidates.length > 0) {
      const candidate = manCandidates.shift();
      if (candidate) assignments.set(candidate.index, 'MAN');
    }
  }

  const rushCount = () => [...assignments.values()].filter(assignment => assignment === 'BLITZ').length;
  const maxRushers = runSituation ? 4 : deepThreat ? 2 : passSituation ? 3 : 2;
  const blitzChance = runSituation ? 0.84 : deepThreat ? 0.14 : passSituation ? 0.48 : runRate >= 0.5 ? 0.3 : 0.16;

  while (rushCount() < maxRushers) {
    if (random() >= blitzChance) break;

    const candidates = defenders
      .map((defender, index) => ({ defender, index }))
      .filter(({ defender, index }) =>
        index > 0 && index < defenders.length - 1 && assignments.get(index) !== 'BLITZ' &&
        defender.type !== 'FS' && defender.type !== 'SS'
      )
      .map(candidate => {
        const depth = Math.max(0, ((candidate.defender.startY ?? candidate.defender.y) - situation.lineOfScrimmageY) * situation.attackDirection);
        const roleWeight = candidate.defender.type === 'LB' ? 3.5 : candidate.defender.type === 'CB' ? 1.8 : 2.5;
        const depthWeight = Math.max(0.35, 1.5 - depth / 180);
        const coverageCost = assignments.get(candidate.index) === 'MAN'
          ? (runSituation ? 0.7 : 0.35)
          : 1;
        return { ...candidate, weight: roleWeight * depthWeight * coverageCost };
      });

    const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
    if (totalWeight === 0) break;

    let selection = Math.min(0.999999, Math.max(0, random())) * totalWeight;
    const chosen = candidates.find(candidate => {
      selection -= candidate.weight;
      return selection < 0;
    });
    if (!chosen) break;
    assignments.set(chosen.index, 'BLITZ');
  }

  // QB Scramble & Run Adaptation:
  // If the user has scrambled or run with the QB recently, assign a linebacker to QB_SPY to shadow the QB
  const recentQbRuns = recentPlays.filter(play => play.isQbRun).length;
  if (recentQbRuns >= 1) {
    const spyCandidateIndex = [5, 4, 3].find(idx => assignments.get(idx) === 'ZONE' && defenders[idx]?.type !== 'FS')
      ?? [5, 4, 3].find(idx => assignments.get(idx) === 'MAN' && defenders[idx]?.type !== 'FS');
    if (spyCandidateIndex !== undefined) {
      assignments.set(spyCandidateIndex, 'QB_SPY');
    }
    // If QB runs are spammed (2+ times in recent history, or back-to-back), also assign an edge contain rusher
    if (recentQbRuns >= 2) {
      const containCandidate = [3, 4, 2, 1].find(idx => idx !== spyCandidateIndex && assignments.get(idx) !== 'BLITZ' && defenders[idx]?.type !== 'FS' && defenders[idx]?.type !== 'SS');
      if (containCandidate !== undefined) {
        assignments.set(containCandidate, 'BLITZ');
      }
    }
  }

  // RB Pass & Flat Spam Adaptation:
  // If the user has targeted the RB or spammed passes to the RB in the flat, assign a defender to RB_SPY
  const recentRbPasses = recentPlays.filter(play => play.targetWasRb || play.isFlatPass || play.routes?.rb === 'FLAT').length;
  if (recentRbPasses >= 1) {
    const rbSpyCandidateIndex = [4, 3, 5, 2, 1].find(idx => assignments.get(idx) === 'ZONE' && defenders[idx]?.type !== 'FS' && defenders[idx]?.type !== 'SS')
      ?? [4, 3, 5, 2, 1].find(idx => assignments.get(idx) !== 'BLITZ' && defenders[idx]?.type !== 'FS' && defenders[idx]?.type !== 'SS');
    if (rbSpyCandidateIndex !== undefined) {
      assignments.set(rbSpyCandidateIndex, 'RB_SPY');
    }
    // If RB passes/flats are spammed (2+ times), also match an extra defender to lock down the flat
    if (recentRbPasses >= 2) {
      const flatHelpIdx = [3, 4, 2, 1].find(idx => idx !== rbSpyCandidateIndex && assignments.get(idx) === 'ZONE' && defenders[idx]?.type !== 'FS');
      if (flatHelpIdx !== undefined) {
        assignments.set(flatHelpIdx, 'MAN');
      }
    }
  }

  // Repeated Play Spam Adaptation (same play called 2+ times in recent history or back-to-back)
  const lastPlay = recentPlays[recentPlays.length - 1];
  const secondLastPlay = recentPlays.length >= 2 ? recentPlays[recentPlays.length - 2] : null;
  const isPlaySpammed = Boolean(
    (secondLastPlay && lastPlay?.play === secondLastPlay?.play) ||
    (recentPlays.length >= 3 && recentPlays.filter(p => p.play === lastPlay?.play).length >= 2)
  );

  const currentManCount = () => [...assignments.values()].filter(assignment => assignment === 'MAN').length;
  if ((isPlaySpammed || repeatedRoutes.size > 0) && lastPlay?.isPass && currentManCount() < Math.min(3, receivingThreats.length)) {
    // Match extra receivers when either the play call or route concept repeats.
    const zoneDefenderIdx = [3, 4, 2, 1].find(idx => assignments.get(idx) === 'ZONE');
    if (zoneDefenderIdx !== undefined) {
      assignments.set(zoneDefenderIdx, 'MAN');
    }
  }

  const blockerCount = eligibleReceivers.length - receivingThreats.length;
  if (receivingThreats.length === 1 && blockerCount >= 2 && defenders.length >= 7) {
    const loneReceiver = receivingThreats[0];
    const coverageCandidates = [1, 2, 3, 4].sort((first, second) =>
      Math.abs(defenders[first].x - loneReceiver.x) - Math.abs(defenders[second].x - loneReceiver.x)
    );
    assignments.set(0, 'BLITZ');
    coverageCandidates.forEach((index, order) => assignments.set(index, order < 2 ? 'MAN' : 'BLITZ'));
    assignments.set(5, 'QB_SPY');
    assignments.set(6, 'ZONE');
  }

  return assignments;
}

export function getBracketCoverageTarget(defender: Entity, receiver: Entity, attackDirection: number): { x: number; y: number } {
  const insideDirection = receiver.x >= 170 ? -1 : 1;
  const isInside = defender.coverageLeverage === 'INSIDE';
  return {
    x: receiver.x + insideDirection * (isInside ? 8 : -8),
    y: receiver.y + attackDirection * (isInside ? 4 : 20)
  };
}

export function matchCpuDefendersToReceivers(defenders: Entity[], eligibleReceivers: Entity[], situation: CpuDefenseSituation): void {
  const threats = eligibleReceivers.filter(receiver => !receiver.caught && !receiver.isBlocker && receiver.routeType !== 'BLOCK');
  const matched = new Set<Entity>();
  defenders.forEach(defender => {
    defender.coverageLeverage = undefined;
    if (defender.defenseAssignment !== 'MAN') return;
    const unmatched = threats.filter(receiver => !matched.has(receiver));
    const candidates = unmatched.length > 0 ? unmatched : threats;
    defender.assignedReceiver = candidates.slice().sort((first, second) =>
      Math.hypot(first.x - defender.x, first.y - defender.y) - Math.hypot(second.x - defender.x, second.y - defender.y)
    )[0];
    if (defender.assignedReceiver) matched.add(defender.assignedReceiver);
  });

  if (threats.length !== 1 || eligibleReceivers.length - threats.length < 2 || defenders.length < 7) return;
  const receiver = threats[0];
  const repeatedRouteCount = situation.recentPlays.slice(-6).filter(play =>
    play.isPass && receiver.routeType !== undefined && Object.values(play.routes || {}).includes(receiver.routeType)
  ).length;
  const coverageDefenders = defenders.filter(defender => defender.defenseAssignment === 'MAN');
  coverageDefenders.forEach((defender, index) => {
    defender.coverageLeverage = index === 0 ? 'INSIDE' : 'OUTSIDE';
    const target = getBracketCoverageTarget(defender, receiver, situation.attackDirection);
    defender.startX = Math.max(25, Math.min(315, target.x));
    defender.startY = situation.lineOfScrimmageY + situation.attackDirection * (index === 0
      ? repeatedRouteCount >= 2 ? 24 : 30
      : repeatedRouteCount >= 2 ? 45 : 60);
    defender.x = defender.startX;
    defender.y = defender.startY;
  });
  const safety = defenders[6];
  safety.zoneX = receiver.x;
  safety.zoneY = situation.lineOfScrimmageY + situation.attackDirection * (repeatedRouteCount >= 2 ? 95 : 120);
  safety.startX = safety.zoneX;
  safety.startY = safety.zoneY;
  safety.x = safety.startX;
  safety.y = safety.startY;
  defenders.filter(defender => defender.passRusher).forEach((defender, index) => {
    defender.startX = index === 0 ? 170 : index === 1 ? 105 : 235;
    defender.startY = situation.lineOfScrimmageY + 24 * situation.attackDirection;
    defender.x = defender.startX;
    defender.y = defender.startY;
  });
}