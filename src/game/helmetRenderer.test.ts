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
    save() { saveDepth++; },
    restore() { saveDepth--; },
    translate() {},
    rotate(angle: number) { rotations.push(angle); },
    scale(x: number, y: number) { scales.push([x, y]); },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    bezierCurveTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    clip() {},
    ellipse() {},
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

test('shared helmet sprites face attack direction when stationary and velocity when moving', () => {
  const { ctx, rotations } = createRecordingContext();
  const design = getHelmetDesign(TEAMS.ARKANSAS);
  drawHelmetSprite(ctx, { x: 0, y: 0, radius: 10 }, design, -1);
  drawHelmetSprite(ctx, { x: 0, y: 0, radius: 10 }, design, 1);
  drawHelmetSprite(ctx, { x: 0, y: 0, radius: 10, vx: 2, vy: 0 }, design, -1);
  assert.deepEqual(rotations, [0, Math.PI, Math.PI / 2]);
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
