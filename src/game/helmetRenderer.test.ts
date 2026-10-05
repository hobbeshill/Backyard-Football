import assert from 'node:assert/strict';
import test from 'node:test';
import { getHelmetDesign } from './helmetDesigns';
import { drawHelmetSprite, type HelmetDrawingContext } from './helmetRenderer';
import { TEAMS, getAllTeams } from './teams';

function createRecordingContext() {
  const fills: { color: string | CanvasGradient | CanvasPattern; x: number; width: number }[] = [];
  const rotations: number[] = [];
  const text: string[] = [];
  const scales: [number, number][] = [];
  const ellipses: [number, number][] = [];
  const movePoints: [number, number][] = [];
  const lineToX: number[] = [];
  const lineToPoints: [number, number][] = [];
  const quadraticEndY: number[] = [];
  const quadraticControlY: number[] = [];
  const bezierCurveYs: [number, number, number][] = [];
  const bezierCurveXs: [number, number, number][] = [];
  let saveDepth = 0;
  const gradient: CanvasGradient = { addColorStop() {} };
  const context: HelmetDrawingContext = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: 'round',
    lineCap: 'round',
    font: '',
    textAlign: 'center',
    textBaseline: 'middle',
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
    save() { saveDepth++; },
    restore() { saveDepth--; },
    translate() {},
    rotate(angle: number) { rotations.push(angle); },
    scale(x: number, y: number) { scales.push([x, y]); },
    beginPath() {},
    moveTo(x, y) { movePoints.push([x, y]); },
    lineTo(x, y) { lineToX.push(x); lineToPoints.push([x, y]); },
    quadraticCurveTo(_controlX, controlY, _x, y) {
      quadraticControlY.push(controlY);
      quadraticEndY.push(y);
    },
    bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
      bezierCurveXs.push([cp1x, cp2x, x]);
      bezierCurveYs.push([cp1y, cp2y, y]);
    },
    closePath() {},
    fill() {},
    stroke() {},
    clip() {},
    ellipse(_x, _y, radiusX, radiusY) { ellipses.push([radiusX, radiusY]); },
    drawImage() {},
    fillText(value: string) { text.push(value); },
    createRadialGradient() { return gradient; },
    fillRect(x: number, _y: number, width: number) {
      fills.push({ color: this.fillStyle, x, width });
    }
  };
  return {
    ctx: context,
    fills,
    rotations,
    text,
    scales,
    ellipses,
    movePoints,
    lineToX,
    lineToPoints,
    quadraticEndY,
    quadraticControlY,
    bezierCurveYs,
    bezierCurveXs,
    getSaveDepth: () => saveDepth
  };
}

test('helmet schemes follow the supplied reference and explicit Arkansas and Auburn corrections', () => {
  assert.deepEqual(getHelmetDesign(TEAMS.ARKANSAS).centerStripe, []);
  assert.equal(getHelmetDesign(TEAMS.ARKANSAS).shell, '#9D2235');
  assert.equal(getHelmetDesign(TEAMS.AUBURN).shell, '#FFFFFF');
  assert.deepEqual(getHelmetDesign(TEAMS.AUBURN).centerStripe, ['#0C2340', '#FFFFFF', '#E87722', '#FFFFFF', '#0C2340']);
  assert.equal(getHelmetDesign(TEAMS.FLORIDA).shell, '#FA4616');
  assert.equal(getHelmetDesign(TEAMS.MISSOURI).shell, '#101820');
  assert.equal(getHelmetDesign(TEAMS.OLE_MISS).shell, '#65A7CD');
  assert.equal(getHelmetDesign(TEAMS.TENNESSEE).shell, '#FF8200');
  assert.deepEqual(getHelmetDesign(TEAMS.TEXAS).centerStripe, ['#BF5700']);
  assert.deepEqual(getHelmetDesign(TEAMS.TEXAS_AM).centerStripe, []);
  assert.equal(getHelmetDesign(TEAMS.GEORGIA).shell, '#BA0C2F');
  assert.equal(getAllTeams().length, 16, 'Do not add the bogus GERAGIA team');
});

test('Auburn crown separates the orange center and blue sides with narrow white bands', () => {
  const { ctx, fills } = createRecordingContext();
  drawHelmetSprite(ctx, { x: 0, y: 0, radius: 10 }, getHelmetDesign(TEAMS.AUBURN), -1);
  const stripes = fills.slice(0, 5);
  assert.deepEqual(stripes.map(stripe => stripe.color), ['#0C2340', '#FFFFFF', '#E87722', '#FFFFFF', '#0C2340']);
  assert.ok(stripes[0].x < 0);
  assert.ok(stripes[2].x < 0 && stripes[2].x + stripes[2].width > 0);
  assert.ok(stripes[4].x > 0);
  assert.ok(stripes[1].width < stripes[0].width && stripes[1].width < stripes[2].width);
  assert.equal(stripes[1].width, stripes[3].width);
  for (let i = 1; i < stripes.length; i++) {
    assert.ok(Math.abs(stripes[i - 1].x + stripes[i - 1].width - stripes[i].x) < 1e-10);
  }
});

test('Arkansas solid shell does not draw crown stripe bands', () => {
  const { ctx, fills } = createRecordingContext();
  drawHelmetSprite(ctx, { x: 0, y: 0, radius: 10 }, getHelmetDesign(TEAMS.ARKANSAS), -1);
  assert.equal(fills.length, 1, 'Only the shell shading rectangle is drawn');
  assert.ok(typeof fills[0].color !== 'string', 'Shell shading uses a gradient');
});

test('all team sprites render at gameplay size and preserve canvas save/restore balance', () => {
  for (const team of getAllTeams()) {
    const { ctx, getSaveDepth } = createRecordingContext();
    drawHelmetSprite(ctx, { x: 170, y: 200, radius: 10 }, getHelmetDesign(team), -1);
    assert.equal(getSaveDepth(), 0, team.name);
  }
});

test('helmet visuals use the same dimensions regardless of player collision radius', () => {
  for (const viewMode of ['TOP_DOWN', 'THREE_QUARTER'] as const) {
    for (const forwardDirection of [-1, 1]) {
      const standard = createRecordingContext();
      const largerHitbox = createRecordingContext();
      const design = getHelmetDesign(TEAMS.AUBURN);
      drawHelmetSprite(standard.ctx, { x: 0, y: 0, radius: 10 }, design, forwardDirection, 1, viewMode);
      drawHelmetSprite(largerHitbox.ctx, { x: 0, y: 0, radius: 12 }, design, forwardDirection, 1, viewMode);

      assert.deepEqual(largerHitbox.ellipses, standard.ellipses, `${viewMode} ellipses`);
      assert.deepEqual(largerHitbox.movePoints, standard.movePoints, `${viewMode} paths`);
      assert.deepEqual(largerHitbox.lineToX, standard.lineToX, `${viewMode} facemask`);
    }
  }
});

test('shared helmet sprites face attack direction when stationary and velocity when moving', () => {
  const { ctx, rotations } = createRecordingContext();
  const design = getHelmetDesign(TEAMS.ARKANSAS);
  drawHelmetSprite(ctx, { x: 0, y: 0, radius: 10 }, design, -1);
  drawHelmetSprite(ctx, { x: 0, y: 0, radius: 10 }, design, 1);
  drawHelmetSprite(ctx, { x: 0, y: 0, radius: 10, vx: 2, vy: 0 }, design, -1);
  assert.deepEqual(rotations, [0, Math.PI, Math.PI / 2]);
});

test('quarterback keeps facing downfield while backpedaling in the pocket', () => {
  const design = getHelmetDesign(TEAMS.AUBURN);
  const backpedalingQb = { x: 0, y: 0, radius: 10, vx: 0, vy: -2 };

  const threeQuarter = createRecordingContext();
  drawHelmetSprite(threeQuarter.ctx, backpedalingQb, design, 1, 1, 'THREE_QUARTER', true);
  assert.equal(threeQuarter.text.length, 2, 'The QB shows the front helmet and facemask while moving backward');

  const topDown = createRecordingContext();
  drawHelmetSprite(topDown.ctx, backpedalingQb, design, 1, 1, 'TOP_DOWN', true);
  assert.equal(topDown.rotations[0], Math.PI);
});

test('side decals face outward on opposite sides and are foreshortened rather than painted across the crown', () => {
  const { ctx, rotations, scales, text } = createRecordingContext();
  drawHelmetSprite(ctx, { x: 0, y: 0, radius: 10 }, getHelmetDesign(TEAMS.AUBURN), -1);
  assert.deepEqual(rotations, [0, Math.PI / 2, -Math.PI / 2]);
  assert.deepEqual(scales, [[1, 0.55], [1, 0.55]]);
  assert.deepEqual(text, ['AU', 'AU']);
});

test('helmets do not substitute invented initials for graphic decals', () => {
  for (const id of ['ARKANSAS', 'FLORIDA', 'MISSISSIPPI_STATE', 'MISSOURI', 'OLE_MISS', 'SOUTH_CAROLINA', 'VANDERBILT']) {
    const { ctx, text } = createRecordingContext();
    drawHelmetSprite(ctx, { x: 0, y: 0, radius: 10 }, getHelmetDesign(TEAMS[id]), -1);
    assert.deepEqual(text, [], id);
  }
});

test('3/4 view helmet sprites render cleanly for all teams with balanced canvas state', () => {
  for (const team of getAllTeams()) {
    const { ctx, getSaveDepth } = createRecordingContext();
    // Test facing downfield (offense rear 3/4)
    drawHelmetSprite(ctx, { x: 170, y: 200, radius: 10 }, getHelmetDesign(team), -1, 1, 'THREE_QUARTER');
    assert.equal(getSaveDepth(), 0, `${team.name} offense 3/4 save/restore balance`);

    // Test facing upfield (defense front 3/4)
    drawHelmetSprite(ctx, { x: 170, y: 200, radius: 10 }, getHelmetDesign(team), 1, 1, 'THREE_QUARTER');
    assert.equal(getSaveDepth(), 0, `${team.name} defense 3/4 save/restore balance`);
  }
});

test('rear 3/4 helmet uses a custom shell silhouette', () => {
  const { ctx, ellipses } = createRecordingContext();
  drawHelmetSprite(ctx, { x: 0, y: 0, radius: 10 }, getHelmetDesign(TEAMS.AUBURN), -1, 1, 'THREE_QUARTER');
  assert.equal(ellipses.length, 1, 'Only the ground shadow is circular');
});

test('rear 3/4 helmet is taller without changing width and has a flat bottom', () => {
  const { ctx, movePoints, lineToPoints, bezierCurveYs } = createRecordingContext();
  drawHelmetSprite(ctx, { x: 0, y: 0, radius: 10 }, getHelmetDesign(TEAMS.AUBURN), -1, 1, 'THREE_QUARTER');
  const radius = 10 * 1.15;

  assert.ok(Math.abs(movePoints[0][0] + radius * 0.72) < 0.000001);
  assert.ok(Math.abs(movePoints[0][1] - lineToPoints[0][1]) < 0.000001);
  assert.ok(Math.abs(lineToPoints[1][0] - radius * 0.92) < 0.000001);
  assert.ok(bezierCurveYs.some(([firstControlY, secondControlY]) => Math.min(firstControlY, secondControlY) < -radius));
});

test('front helmet shell reaches the rear base height while leaving the face opening clear', () => {
  const { ctx, quadraticEndY, quadraticControlY } = createRecordingContext();
  drawHelmetSprite(ctx, { x: 0, y: 0, radius: 10 }, getHelmetDesign(TEAMS.AUBURN), 1, 1, 'THREE_QUARTER');
  const helmetRadius = 10 * 1.15;

  const shellCurveYs = [...quadraticEndY.slice(0, 8), ...quadraticControlY.slice(0, 8)];
  assert.ok(Math.abs(Math.max(...shellCurveYs) - helmetRadius * 0.82) < 0.000001);
  assert.ok(quadraticEndY[4] <= helmetRadius * 0.30);
});

test('front and rear helmet crowns share the same width and height', () => {
  const design = getHelmetDesign(TEAMS.AUBURN);
  const front = createRecordingContext();
  drawHelmetSprite(front.ctx, { x: 0, y: 0, radius: 10 }, design, 1, 1, 'THREE_QUARTER');

  const rear = createRecordingContext();
  drawHelmetSprite(rear.ctx, { x: 0, y: 0, radius: 10 }, design, -1, 1, 'THREE_QUARTER');
  assert.equal(Math.abs(front.bezierCurveXs[0][0]), Math.abs(rear.bezierCurveXs[0][0]));
  const frontCrownY = Math.min(...front.quadraticEndY, ...front.quadraticControlY, ...front.bezierCurveYs.flat());
  const rearCrownY = Math.min(...rear.quadraticEndY, ...rear.quadraticControlY, ...rear.bezierCurveYs.flat());
  assert.ok(Math.abs(frontCrownY - rearCrownY) < 0.000001);
});

test('rear-facing 3/4 helmets show neither side logos nor the front facemask', () => {
  const design = getHelmetDesign(TEAMS.AUBURN);
  const rear = createRecordingContext();
  drawHelmetSprite(rear.ctx, { x: 0, y: 0, radius: 10 }, design, -1, 1, 'THREE_QUARTER');
  assert.deepEqual(rear.text, []);
  assert.equal(rear.lineToX.some(x => Math.abs(x) < 10 * 1.15 * 0.4), false);

  const front = createRecordingContext();
  drawHelmetSprite(front.ctx, { x: 0, y: 0, radius: 10 }, design, 1, 1, 'THREE_QUARTER');
  assert.equal(front.text.length, 2);
  assert.ok(front.lineToX.some(x => Math.abs(x) < 10 * 1.15 * 0.4));
});

test('3/4 view side profiles keep the crown stripe on top and face logos toward the camera', () => {
  for (const direction of [-1, 1]) {
    const { ctx, ellipses, lineToX, movePoints, text, bezierCurveYs, scales } = createRecordingContext();
    drawHelmetSprite(
      ctx,
      { x: 0, y: 0, radius: 10, vx: direction * 2, vy: 0 },
      getHelmetDesign(TEAMS.AUBURN),
      -1,
      1,
      'THREE_QUARTER'
    );

    assert.equal(ellipses.length, 2, 'Profile has a ground shadow and visor, not colored circles beneath the helmet');
    assert.ok(movePoints[0][1] > 0, 'Shell silhouette has a defined lower edge instead of a circular outline');
    assert.equal(text.length, 1, 'Profile shows the visible side decal once');
    assert.ok(lineToX.some(x => Math.sign(x) === direction && Math.abs(x) > 8), 'Facemask points toward movement');
    assert.ok(bezierCurveYs[0][0] < -6 && bezierCurveYs[0][1] < -6, 'Crown stripe follows the top ridge');
    assert.ok(scales.some(([x, y]) => x === 1.12 && y === 1.35), 'Profile is wider while keeping its forward-facing helmet height');
  }
});

test('3/4 profile facing stays stable through small end-of-play velocity changes', () => {
  const entity = { x: 0, y: 0, radius: 10, vx: 0.5, vy: 0.02 };
  const design = getHelmetDesign(TEAMS.AUBURN);

  for (const velocity of [[0.5, 0.02], [0.39, -0.18], [0.34, 0.12]] as const) {
    entity.vx = velocity[0];
    entity.vy = velocity[1];
    const { ctx, scales } = createRecordingContext();
    drawHelmetSprite(ctx, entity, design, -1, 1, 'THREE_QUARTER');
    assert.ok(scales.some(([x, y]) => x === 1.12 && y === 1.35), 'Small velocity changes do not switch out of profile');
  }
});

test('helmet decal sheet indexes match its four-by-four team order', () => {
  const teamIds = [
    'ALABAMA', 'ARKANSAS', 'AUBURN', 'FLORIDA',
    'GEORGIA', 'KENTUCKY', 'LSU', 'OLE_MISS',
    'MISSISSIPPI_STATE', 'MISSOURI', 'OKLAHOMA', 'SOUTH_CAROLINA',
    'TENNESSEE', 'TEXAS', 'TEXAS_AM', 'VANDERBILT'
  ];

  teamIds.forEach((teamId, index) => {
    assert.equal(getHelmetDesign(TEAMS[teamId]).decalSheetIndex, index, teamId);
  });
});

test('Texas longhorn remains a graphic side decal in profile view', () => {
  const { ctx, lineToX, text } = createRecordingContext();
  drawHelmetSprite(ctx, { x: 0, y: 0, radius: 10, vx: 2, vy: 0 }, getHelmetDesign(TEAMS.TEXAS), -1, 1, 'THREE_QUARTER');

  assert.ok(lineToX.length > 0, 'Longhorn is drawn as a graphic shape');
  assert.deepEqual(text, [], 'Texas uses its graphic decal, not substitute text');
});
