import type { ProDefensePlayId, ProOffensePlayId } from './proMode';
import type { TacticalMode } from './types';
import { SIGNATURE_PLAYS, signatureOffenseIds, signatureDefenseIds, type SignatureOffenseId, type SignatureDefenseId } from './signaturePlays';

type EliteOffensePlayId = 'SHORT_PASS' | 'CONTROL_PASS' | 'DEEP_SHOT' | 'ISO' | 'SWEEP' | 'POWER' | 'MESH' | 'SMASH' | 'POST_WHEEL' | SignatureOffenseId;
type EliteDefensePlayId = 'COVER2' | 'ZONE34' | 'ZONE232' | 'ZONE151' | 'MAN_FREE' | 'DEEP_THIRDS' | SignatureDefenseId;

export interface TeamPlaybook {
  offenseIdentity: string;
  defenseIdentity: string;
  eliteOffense: readonly EliteOffensePlayId[];
  eliteDefense: readonly EliteDefensePlayId[];
  proOffense: readonly ProOffensePlayId[];
  proDefense: readonly ProDefensePlayId[];
}

function book(
  offenseIdentity: string, defenseIdentity: string,
  eliteOffense: readonly EliteOffensePlayId[], eliteDefense: readonly EliteDefensePlayId[],
  proOffense: readonly ProOffensePlayId[], proDefense: readonly ProDefensePlayId[]
): TeamPlaybook {
  return { offenseIdentity, defenseIdentity, eliteOffense, eliteDefense, proOffense, proDefense };
}

export const TEAM_PLAYBOOKS: Record<string, TeamPlaybook> = {
  ALABAMA: book('Protected vertical passing with a power change-up.', 'Front pressure with two-high protection.',
    ['SHORT_PASS', 'MESH', 'DEEP_SHOT', 'POWER', 'SMASH'], ['COVER2', 'ZONE34', 'ZONE232'],
    ['PRO_QUICK_SLANTS', 'PRO_MESH', 'PRO_VERTS', 'PRO_DRAW'], ['PRO_COVER2_HARD_FLAT', 'PRO_COVER3_DEEP', 'PRO_BLITZ_ZERO', 'PRO_COVER1_MAN']),
  ARKANSAS: book('Inside power and isolation; controlled passes when the box loads up.', 'Heavy fronts and shallow zones; limited deep coverage options.',
    ['POWER', 'ISO', 'SHORT_PASS', 'CONTROL_PASS'], ['ZONE34', 'COVER2'],
    ['PRO_DRAW', 'PRO_QUICK_SLANTS', 'PRO_MESH'], ['PRO_RUN_STOP_BOX', 'PRO_BLITZ_ZERO', 'PRO_COVER2_HARD_FLAT']),
  AUBURN: book('Edge runs and quick throws support a mobile quarterback.', 'Pressure and man coverage; little conservative safety help.',
    ['SWEEP', 'SHORT_PASS', 'MESH', 'POST_WHEEL'], ['ZONE34', 'ZONE151', 'MAN_FREE'],
    ['PRO_JET_SWEEP', 'PRO_QUICK_SLANTS', 'PRO_SCREEN', 'PRO_DOUBLE_MOVES'], ['PRO_BLITZ_ZERO', 'PRO_COVER1_MAN', 'PRO_RUN_STOP_BOX']),
  FLORIDA: book('Screens, sweeps and vertical speed; no downhill power package.', 'Fast defensive backs protect space rather than stacking the box.',
    ['SWEEP', 'SHORT_PASS', 'DEEP_SHOT', 'SMASH'], ['COVER2', 'ZONE232', 'MAN_FREE'],
    ['PRO_SCREEN', 'PRO_JET_SWEEP', 'PRO_QUICK_SLANTS', 'PRO_VERTS'], ['PRO_COVER4_QUARTERS', 'PRO_COVER1_MAN', 'PRO_COVER2_HARD_FLAT']),
  GEORGIA: book('Strong protection, tight-end crossers and inside runs.', 'Disciplined layered zones and a stout run front.',
    ['POWER', 'ISO', 'MESH', 'SHORT_PASS', 'CONTROL_PASS'], ['COVER2', 'DEEP_THIRDS', 'ZONE34'],
    ['PRO_DRAW', 'PRO_MESH', 'PRO_QUICK_SLANTS', 'PRO_DOUBLE_MOVES'], ['PRO_TAMPA2', 'PRO_RUN_STOP_BOX', 'PRO_COVER3_DEEP', 'PRO_COVER1_MAN']),
  KENTUCKY: book('Patient inside runs and possession throws; no deep-shot package.', 'Run-first front with underneath help.',
    ['ISO', 'POWER', 'SHORT_PASS', 'MESH'], ['ZONE34', 'ZONE151', 'COVER2'],
    ['PRO_DRAW', 'PRO_SCREEN', 'PRO_QUICK_SLANTS'], ['PRO_RUN_STOP_BOX', 'PRO_TAMPA2', 'PRO_COVER1_MAN']),
  LSU: book('Posts, wheels and double moves lean on explosive receivers.', 'Ball-hawk coverage; avoid relying on a weak run front.',
    ['POST_WHEEL', 'DEEP_SHOT', 'SMASH', 'SHORT_PASS', 'SWEEP'], ['DEEP_THIRDS', 'ZONE151', 'MAN_FREE'],
    ['PRO_VERTS', 'PRO_DOUBLE_MOVES', 'PRO_QUICK_SLANTS', 'PRO_JET_SWEEP', 'PRO_MESH'], ['PRO_COVER3_DEEP', 'PRO_COVER4_QUARTERS', 'PRO_COVER1_MAN']),
  MISSISSIPPI_STATE: book('Quick rhythm, crossing routes and slot screens protect the pocket.', 'Underneath zones with deep help; no all-out pressure package.',
    ['SHORT_PASS', 'MESH', 'CONTROL_PASS', 'SMASH'], ['ZONE151', 'COVER2', 'ZONE232'],
    ['PRO_QUICK_SLANTS', 'PRO_SCREEN', 'PRO_MESH', 'PRO_DRAW'], ['PRO_COVER2_HARD_FLAT', 'PRO_TAMPA2', 'PRO_COVER3_DEEP']),
  MISSOURI: book('Inside runs, controlled crossers and a selective wheel shot.', 'Layered coverage supported by a physical front.',
    ['ISO', 'SHORT_PASS', 'CONTROL_PASS', 'POST_WHEEL', 'POWER'], ['DEEP_THIRDS', 'ZONE232', 'ZONE34'],
    ['PRO_DRAW', 'PRO_QUICK_SLANTS', 'PRO_MESH', 'PRO_JET_SWEEP'], ['PRO_COVER3_DEEP', 'PRO_RUN_STOP_BOX', 'PRO_TAMPA2']),
  OKLAHOMA: book('Fast slot throws and vertical shots; sweeps replace interior power.', 'Attack the pocket, mix man and deep thirds.',
    ['MESH', 'DEEP_SHOT', 'SHORT_PASS', 'SWEEP', 'POST_WHEEL'], ['ZONE34', 'DEEP_THIRDS', 'MAN_FREE'],
    ['PRO_MESH', 'PRO_VERTS', 'PRO_SCREEN', 'PRO_QUICK_SLANTS'], ['PRO_BLITZ_ZERO', 'PRO_COVER3_DEEP', 'PRO_COVER1_MAN']),
  OLE_MISS: book('Space-back sweeps and receiver screens; no inside power runs.', 'Keep two safeties back and concede underneath space.',
    ['SWEEP', 'POST_WHEEL', 'SHORT_PASS', 'DEEP_SHOT'], ['ZONE232', 'COVER2', 'DEEP_THIRDS'],
    ['PRO_JET_SWEEP', 'PRO_SCREEN', 'PRO_VERTS', 'PRO_QUICK_SLANTS', 'PRO_DOUBLE_MOVES'], ['PRO_COVER4_QUARTERS', 'PRO_COVER3_DEEP', 'PRO_TAMPA2']),
  SOUTH_CAROLINA: book('Tight-end and quick passing with an inside run outlet.', 'Edge pressure is the weapon; coverage is the compromise.',
    ['SHORT_PASS', 'CONTROL_PASS', 'ISO', 'SMASH'], ['ZONE34', 'ZONE151', 'ZONE232'],
    ['PRO_QUICK_SLANTS', 'PRO_DRAW', 'PRO_SCREEN', 'PRO_DOUBLE_MOVES'], ['PRO_BLITZ_ZERO', 'PRO_RUN_STOP_BOX', 'PRO_COVER3_DEEP']),
  TENNESSEE: book('Vertical tempo and outside runs; few slow-developing possession calls.', 'Zone shells keep explosive plays in front.',
    ['DEEP_SHOT', 'POST_WHEEL', 'SWEEP', 'SHORT_PASS', 'POWER'], ['ZONE232', 'ZONE151', 'DEEP_THIRDS'],
    ['PRO_VERTS', 'PRO_JET_SWEEP', 'PRO_DOUBLE_MOVES', 'PRO_QUICK_SLANTS'], ['PRO_COVER4_QUARTERS', 'PRO_COVER2_HARD_FLAT', 'PRO_TAMPA2']),
  TEXAS: book('Protected boundary shots, tight-end mesh and draw runs.', 'Shutdown-corner man coverage backed by layered zones.',
    ['CONTROL_PASS', 'MESH', 'SMASH', 'SHORT_PASS', 'ISO'], ['COVER2', 'ZONE151', 'MAN_FREE'],
    ['PRO_DOUBLE_MOVES', 'PRO_MESH', 'PRO_DRAW', 'PRO_QUICK_SLANTS', 'PRO_SCREEN'], ['PRO_COVER1_MAN', 'PRO_TAMPA2', 'PRO_COVER3_DEEP']),
  TEXAS_AM: book('Power-back isolation with max-protection shots as the change-up.', 'Physical box pressure; fewer deep coverage tools.',
    ['POWER', 'ISO', 'SHORT_PASS', 'DEEP_SHOT'], ['ZONE34', 'ZONE232', 'MAN_FREE'],
    ['PRO_DRAW', 'PRO_QUICK_SLANTS', 'PRO_DOUBLE_MOVES'], ['PRO_RUN_STOP_BOX', 'PRO_BLITZ_ZERO', 'PRO_TAMPA2']),
  VANDERBILT: book('Reliable hands and short controlled throws; no speed-based sweep package.', 'Disciplined safety coverage instead of heavy pressure.',
    ['CONTROL_PASS', 'SHORT_PASS', 'MESH', 'ISO'], ['ZONE151', 'DEEP_THIRDS', 'COVER2'],
    ['PRO_QUICK_SLANTS', 'PRO_MESH', 'PRO_SCREEN'], ['PRO_TAMPA2', 'PRO_COVER4_QUARTERS', 'PRO_COVER2_HARD_FLAT', 'PRO_COVER3_DEEP'])
};

for (const teamId of Object.keys(SIGNATURE_PLAYS)) {
  const playbook = TEAM_PLAYBOOKS[teamId];
  if (!playbook) throw new Error(`Signature plays have no team playbook: ${teamId}`);
  const offense = signatureOffenseIds(teamId);
  const defense = signatureDefenseIds(teamId);
  playbook.eliteOffense = [...playbook.eliteOffense, ...offense];
  playbook.eliteDefense = [...playbook.eliteDefense, ...defense];
  playbook.proOffense = [...playbook.proOffense, ...offense.map((id): ProOffensePlayId => `PRO_${id}`)];
  playbook.proDefense = [...playbook.proDefense, ...defense.map((id): ProDefensePlayId => `PRO_${id}`)];
}

export function getTeamPlaybook(teamId: string): TeamPlaybook {
  const playbook = TEAM_PLAYBOOKS[teamId];
  if (!playbook) throw new Error(`No playbook configured for team ${teamId}`);
  return playbook;
}

export function getTeamOffensePlays(teamId: string, mode: TacticalMode): readonly string[] {
  const playbook = getTeamPlaybook(teamId);
  return mode === 'PRO' ? playbook.proOffense : playbook.eliteOffense;
}

export function getTeamDefensePlays(teamId: string, mode: TacticalMode): readonly string[] {
  const playbook = getTeamPlaybook(teamId);
  return mode === 'PRO' ? playbook.proDefense : playbook.eliteDefense;
}
