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

  if (playKey === 'COVER3') {
    defenders[1].startX = 75; defenders[1].startY = lineOfScrimmageY + (130 * attackDirection); defenders[1].zoneX = 65; defenders[1].zoneY = lineOfScrimmageY + (190 * attackDirection);
    defenders[2].startX = 265; defenders[2].startY = lineOfScrimmageY + (130 * attackDirection); defenders[2].zoneX = 275; defenders[2].zoneY = lineOfScrimmageY + (190 * attackDirection);
    defenders[3].startX = 120; defenders[3].startY = lineOfScrimmageY + (65 * attackDirection); defenders[3].zoneX = 120; defenders[3].zoneY = lineOfScrimmageY + (85 * attackDirection);
    defenders[4].startX = 215; defenders[4].startY = lineOfScrimmageY + (55 * attackDirection); defenders[4].zoneX = 215; defenders[4].zoneY = lineOfScrimmageY + (60 * attackDirection);
    defenders[5].startX = 170; defenders[5].startY = lineOfScrimmageY + (90 * attackDirection); defenders[5].zoneX = 170; defenders[5].zoneY = lineOfScrimmageY + (110 * attackDirection);
    defenders[6].startX = 170; defenders[6].startY = lineOfScrimmageY + (220 * attackDirection); defenders[6].zoneX = 170; defenders[6].zoneY = lineOfScrimmageY + (250 * attackDirection);
  } else if (playKey === 'COVER2MAN') {
    defenders[1].startX = 80; defenders[1].startY = lineOfScrimmageY + (28 * attackDirection); defenders[1].assignedReceiver = receivers[0];
    defenders[2].startX = 260; defenders[2].startY = lineOfScrimmageY + (28 * attackDirection); defenders[2].assignedReceiver = receivers[1];
    defenders[3].startX = 175; defenders[3].startY = lineOfScrimmageY + (32 * attackDirection); defenders[3].assignedReceiver = centerReceiver;
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
    defenders[1].startX = 195; defenders[1].startY = lineOfScrimmageY + (28 * attackDirection); defenders[1].type = 'DL'; defenders[1].passRusher = true;
    defenders[2].startX = 170; defenders[2].startY = lineOfScrimmageY + (28 * attackDirection); defenders[2].type = 'DL'; defenders[2].passRusher = true;
    defenders[3].startX = 80; defenders[3].startY = lineOfScrimmageY + (28 * attackDirection); defenders[3].assignedReceiver = receivers[0];
    defenders[4].startX = 260; defenders[4].startY = lineOfScrimmageY + (28 * attackDirection); defenders[4].assignedReceiver = receivers[1];
    defenders[5].startX = 175; defenders[5].startY = lineOfScrimmageY + (32 * attackDirection); defenders[5].assignedReceiver = centerReceiver;
    defenders[6].startX = 170; defenders[6].startY = lineOfScrimmageY + (70 * attackDirection); defenders[6].zoneX = 170; defenders[6].zoneY = lineOfScrimmageY + (80 * attackDirection);
  } else if (playKey === 'QUARTERS') {
    defenders[3].startX = 120; defenders[3].startY = lineOfScrimmageY + (50 * attackDirection); defenders[3].zoneX = 115; defenders[3].zoneY = lineOfScrimmageY + (65 * attackDirection); defenders[3].type = 'LB'; defenders[3].color = '#ff5555';
    defenders[4].startX = 215; defenders[4].startY = lineOfScrimmageY + (48 * attackDirection); defenders[4].zoneX = 215; defenders[4].zoneY = lineOfScrimmageY + (55 * attackDirection); defenders[4].type = 'LB'; defenders[4].color = '#ff5555';
    defenders[1].startX = 60; defenders[1].startY = lineOfScrimmageY + (120 * attackDirection); defenders[1].zoneX = 55; defenders[1].zoneY = lineOfScrimmageY + (200 * attackDirection); defenders[1].type = 'CB';
    defenders[2].startX = 280; defenders[2].startY = lineOfScrimmageY + (120 * attackDirection); defenders[2].zoneX = 285; defenders[2].zoneY = lineOfScrimmageY + (200 * attackDirection); defenders[2].type = 'CB';
    defenders[5].startX = 125; defenders[5].startY = lineOfScrimmageY + (160 * attackDirection); defenders[5].zoneX = 120; defenders[5].zoneY = lineOfScrimmageY + (235 * attackDirection); defenders[5].type = 'FS';
    defenders[6].startX = 215; defenders[6].startY = lineOfScrimmageY + (160 * attackDirection); defenders[6].zoneX = 220; defenders[6].zoneY = lineOfScrimmageY + (235 * attackDirection); defenders[6].type = 'SS';
  } else if (playKey === 'ROBBER') {
    defenders[1].startX = 80; defenders[1].startY = lineOfScrimmageY + (28 * attackDirection); defenders[1].assignedReceiver = receivers[0];
    defenders[2].startX = 260; defenders[2].startY = lineOfScrimmageY + (28 * attackDirection); defenders[2].assignedReceiver = receivers[1];
    defenders[3].startX = 175; defenders[3].startY = lineOfScrimmageY + (32 * attackDirection); defenders[3].assignedReceiver = centerReceiver;
    defenders[4].startX = 120; defenders[4].startY = lineOfScrimmageY + (50 * attackDirection); defenders[4].zoneX = 120; defenders[4].zoneY = lineOfScrimmageY + (65 * attackDirection);
    defenders[5].startX = 170; defenders[5].startY = lineOfScrimmageY + (65 * attackDirection); defenders[5].zoneX = 170; defenders[5].zoneY = lineOfScrimmageY + (65 * attackDirection);
    defenders[6].startX = 170; defenders[6].startY = lineOfScrimmageY + (220 * attackDirection); defenders[6].zoneX = 170; defenders[6].zoneY = lineOfScrimmageY + (250 * attackDirection);
  }

  // Shift the shell to the offense's actual alignment before the snap.
  // The coverage roles above remain the same, but defenders should not reset to
  // a stock spread when the offense stacks or overloads one side.
  const leftReceiverX = receivers[0]?.x ?? 80;
  const rightReceiverX = receivers[receivers.length - 1]?.x ?? 260;
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

  // Roll safety support toward overloaded formations (like TRIPS)
  const allReceivers = [...receivers, centerReceiver].filter((r): r is Entity => Boolean(r));
  const rightOverload = allReceivers.filter(r => r.x > 185).length >= 3;
  const leftOverload = allReceivers.filter(r => r.x < 155).length >= 3;
  if (rightOverload && defenders[6] && playKey !== 'COVER2MAN') {
    defenders[6].startX = clampX(235);
  } else if (leftOverload && defenders[6] && playKey !== 'COVER2MAN') {
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