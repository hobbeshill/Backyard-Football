import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseProDefensiveCall, chooseTeamOffensivePlay } from './ai';
import { getPursuitTarget, getRunBlockEffect, getPassBlockHoldFrames, moveToward, updateRouteMovement } from './movement';
import { applyPlayerProfile, getPlayerSpeedMultiplier, getPlayerSummary } from './roster';
import { calculateBrokenTackleChance, getCatchCompletionChance, getContactGainYards } from './rules';
import { TEAMS, getAllTeams } from './teams';
import type { Entity } from './types';

test('all teams have unique, bounded rosters and persistent jersey identities', () => {
  const rosters = new Set<string>();
  for (const team of getAllTeams()) {
    const players = Object.values(team.roster);
    assert.equal(players.length, 14);
    assert.equal(new Set(players.map(player => player.number)).size, players.length, team.id);
    for (const player of players) {
      for (const rating of Object.values(player.ratings)) {
        assert.ok(Number.isInteger(rating) && rating >= 30 && rating <= 95, team.id);
      }
      assert.match(getPlayerSummary(player), new RegExp(`#${player.number} `));
    }
    rosters.add(JSON.stringify(team.roster));
  }
  assert.equal(rosters.size, getAllTeams().length);
});

test('power backs are stronger but at least 20 percent slower than elite space backs', () => {
  const power = TEAMS.ARKANSAS.roster.rb;
  const speed = TEAMS.OLE_MISS.roster.rb;
  assert.ok(power.ratings.power - speed.ratings.power >= 35);
  assert.ok(getPlayerSpeedMultiplier(speed.ratings.speed) / getPlayerSpeedMultiplier(power.ratings.speed) >= 1.2);
  assert.equal(power.trait, 'PWR');
  assert.equal(speed.trait, 'SPD');
});

test('team receiver speed differences visibly change actual route distance', () => {
  const distance = (teamId: 'FLORIDA' | 'KENTUCKY') => {
    const receiver: Entity = { x: 100, y: 500, radius: 10, routeType: 'GO', stamina: 100 };
    applyPlayerProfile(receiver, TEAMS[teamId].roster['wr-0']);
    for (let frame = 0; frame < 60; frame++) updateRouteMovement(receiver, 'QB_DROP', 1, [], 340);
    return receiver.y - 500;
  };
  assert.ok(distance('FLORIDA') / distance('KENTUCKY') >= 1.12);
});

test('fast players accelerate faster without using power as a speed bonus', () => {
  const move = (teamId: 'ARKANSAS' | 'OLE_MISS') => {
    const runner: Entity = { x: 170, y: 500, radius: 10, stamina: 100 };
    applyPlayerProfile(runner, TEAMS[teamId].roster.rb);
    moveToward(runner, 170, 800, 0.2, 2, 0);
    return runner.y - 500;
  };
  assert.ok(move('OLE_MISS') / move('ARKANSAS') >= 1.35);
});

test('power and tackling produce meaningful matchups without automatic broken tackles', () => {
  const base = { isRB: true, isBoosted: false, brokenCount: 0, isBlitzer: false, stamina: 100 };
  const powerBack = TEAMS.ARKANSAS.roster.rb.ratings.power;
  const speedBack = TEAMS.OLE_MISS.roster.rb.ratings.power;
  const weakTackler = TEAMS.FLORIDA.roster['def-4'].ratings.tackling;
  const strongTackler = TEAMS.GEORGIA.roster['def-5'].ratings.tackling;
  const strongVsWeak = calculateBrokenTackleChance({ ...base, carrierPower: powerBack, defenderTackling: weakTackler });
  const weakVsStrong = calculateBrokenTackleChance({ ...base, carrierPower: speedBack, defenderTackling: strongTackler });
  assert.ok(strongVsWeak >= weakVsStrong * 3);
  assert.ok(strongVsWeak <= 0.45);
  assert.ok(calculateBrokenTackleChance({ ...base, carrierPower: powerBack, defenderTackling: weakTackler, stamina: 0 }) < strongVsWeak);
  assert.equal(getContactGainYards(powerBack, weakTackler), 2);
  assert.equal(getContactGainYards(powerBack, strongTackler), 0);
  assert.equal(getContactGainYards(powerBack, weakTackler, 0), 0);
  assert.ok(calculateBrokenTackleChance({ ...base, carrierPower: powerBack, defenderTackling: weakTackler, brokenCount: 2 }) < strongVsWeak);
});

test('hands and coverage matter in both modes while open catches remain reliable', () => {
  for (const isProMode of [false, true]) {
    const contest = { effectiveDefDist: 24, effectiveBallDist: 24, isTargetSpammed: false, isRbFlatSpammed: false, isRb: false, isProMode };
    const reliable = getCatchCompletionChance({ ...contest, handsRating: 95, coverageRating: 60 });
    const coveredSpeedster = getCatchCompletionChance({ ...contest, handsRating: 61, coverageRating: 95 });
    assert.ok(reliable - coveredSpeedster >= 0.15);
    assert.ok(getCatchCompletionChance({ ...contest, handsRating: 61, coverageRating: 95, defenderCount: 3, ballSideDefender: true }) < coveredSpeedster);
    const open = { ...contest, effectiveDefDist: 80, effectiveBallDist: 80 };
    assert.equal(getCatchCompletionChance({ ...open, handsRating: 61, coverageRating: 95 }), getCatchCompletionChance({ ...open, handsRating: 95, coverageRating: 60 }));
    assert.ok(getCatchCompletionChance(open) >= 0.90);
  }
});

test('strong blockers hold rushers longer and weak receiver blocks do not erase powerful defenders', () => {
  const blocker: Entity = { x: 170, y: 500, radius: 10 };
  const defender: Entity = { x: 170, y: 520, radius: 10 };
  applyPlayerProfile(defender, TEAMS.GEORGIA.roster['def-5']);
  applyPlayerProfile(blocker, TEAMS.FLORIDA.roster['wr-0']);
  const weakEffect = getRunBlockEffect(blocker, defender);
  applyPlayerProfile(blocker, TEAMS.GEORGIA.roster['line-0']);
  assert.ok(getRunBlockEffect(blocker, defender) >= weakEffect * 3);
  assert.ok(weakEffect < 0.2);
  const goodProtection = getPassBlockHoldFrames(155, TEAMS.GEORGIA.roster['line-0'].ratings.blocking / 70, 95 / 70);
  const weakProtection = getPassBlockHoldFrames(155, TEAMS.FLORIDA.roster['line-0'].ratings.blocking / 70, 95 / 70);
  assert.ok(goodProtection - weakProtection >= 35);
});

test('pursuit cuts off the actual heading on either side rather than running past the carrier', () => {
  for (const direction of [-1, 1]) {
    const runner: Entity = { x: 170, y: 500, radius: 10, vx: 1.5, vy: 1.2 * direction };
    const ahead: Entity = { x: 240, y: 500 + 100 * direction, radius: 10 };
    const behind: Entity = { x: 100, y: 500 - 100 * direction, radius: 10 };
    const cutoff = getPursuitTarget(ahead, runner, direction);
    const chase = getPursuitTarget(behind, runner, direction);
    assert.ok(cutoff.x > runner.x);
    assert.ok((cutoff.y - runner.y) * direction > 0);
    assert.equal(chase.y, runner.y);
    runner.vx = -1.5;
    assert.ok(getPursuitTarget(ahead, runner, direction).x < runner.x);
    runner.vx = 0;
    runner.vy = 0;
    assert.deepEqual(getPursuitTarget(ahead, runner, direction), { x: runner.x, y: runner.y });
  }
});

test('CPU team identity changes measurable run-pass tendencies in both playbooks', () => {
  for (const plays of [
    ['SHORT_PASS', 'MESH', 'SMASH', 'CONTROL_PASS', 'DEEP_SHOT', 'POST_WHEEL', 'POWER', 'ISO', 'SWEEP'],
    ['PRO_QUICK_SLANTS', 'PRO_MESH', 'PRO_VERTS', 'PRO_DOUBLE_MOVES', 'PRO_SCREEN', 'PRO_DRAW', 'PRO_JET_SWEEP']
  ]) {
    const runRate = (teamId: 'ARKANSAS' | 'FLORIDA') => {
      let runs = 0;
      for (let sample = 0; sample < 1000; sample++) {
        const play = chooseTeamOffensivePlay(plays, TEAMS[teamId], () => (sample + 0.5) / 1000);
        assert.ok(plays.includes(play));
        if (['POWER', 'ISO', 'SWEEP', 'PRO_DRAW', 'PRO_JET_SWEEP'].includes(play)) runs++;
      }
      return runs / 1000;
    };
    assert.ok(runRate('ARKANSAS') >= 0.65);
    assert.ok(runRate('FLORIDA') <= 0.25);
    assert.ok(runRate('ARKANSAS') - runRate('FLORIDA') >= 0.4);
  }
  assert.throws(() => chooseTeamOffensivePlay([], TEAMS.FLORIDA), /empty playbook/);
  assert.equal(chooseTeamOffensivePlay(['CONTROL_PASS'], TEAMS.ARKANSAS), 'CONTROL_PASS');
});

test('aggressive defenses use their identity but still alternate away from repeated all-out pressure', () => {
  const situation = { recentPlays: [], down: 1, yardsToGo: 10, previousCall: 'PRO_COVER2_HARD_FLAT', teamArchetype: 'BLITZ_HAWKS' as const };
  assert.equal(chooseProDefensiveCall(situation, () => 0.9), 'PRO_BLITZ_ZERO');
  assert.equal(chooseProDefensiveCall({ ...situation, previousCall: 'PRO_BLITZ_ZERO' }, () => 0.9), 'PRO_TAMPA2');
});
