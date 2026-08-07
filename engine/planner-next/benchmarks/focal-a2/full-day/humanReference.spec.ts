import assert from "node:assert/strict";
import test from "node:test";
import { createCanonicalFullA2Template } from "./manifest";
import { expandCanonicalFullA2Template } from "./expand";
import { createHumanA2Reference } from "./humanReference";

const expanded = expandCanonicalFullA2Template(createCanonicalFullA2Template());
const reference = createHumanA2Reference(expanded);
const byId = new Map(reference.intervals.map((interval) => [interval.taskId, interval] as const));

function intervalsForParticipant(participantId: string) {
  const ids = new Set(expanded.tasks.filter((task) => task.participantId === participantId).map((task) => task.id));
  return reference.intervals.filter(({ taskId }) => ids.has(taskId)).sort((a, b) => a.start - b.start || a.taskId.localeCompare(b.taskId, "en"));
}

test("human A2 reference is complete, canonical, immutable and reference-only", () => {
  assert.equal(reference.referenceOnly, true);
  assert.equal(reference.forbiddenAsPlannerInput, true);
  assert.equal(reference.sourceAudit.status, "REQUIRES_CONFIGURATION_CLARIFICATION");
  assert.equal(reference.sourceAudit.knownAmbiguities.length, 2);
  assert.equal(reference.intervals.length, 269);
  assert.equal(new Set(reference.intervals.map(({ taskId }) => taskId)).size, 269);
  assert.deepEqual([...reference.intervals.map(({ taskId }) => taskId)].sort(), [...expanded.taskIds].sort());
  assert.ok(Object.isFrozen(reference));
  assert.ok(Object.isFrozen(reference.intervals));
  assert.equal(reference.fingerprint, "48ba729611debb6cbcacae0c24c1dda0a614e5d63f191f20d0fcd58f8cc7c595");
  assert.equal(reference.preparations.length, 18);
  assert.equal(reference.preparations.reduce((sum, preparation) => sum + preparation.duration, 0), 95);
  assert.ok(Object.isFrozen(reference.preparations));
});

test("every human interval uses the canonical productive duration and 5-minute grid", () => {
  const taskById = new Map(expanded.tasks.map((task) => [task.id, task] as const));
  for (const interval of reference.intervals) {
    const task = taskById.get(interval.taskId);
    assert.ok(task, interval.taskId);
    assert.equal(interval.duration, task.duration, interval.taskId);
    assert.equal(interval.end - interval.start, task.duration, interval.taskId);
    assert.equal(interval.start % 5, 0, interval.taskId);
    assert.equal(interval.end % 5, 0, interval.taskId);
  }
});

test("human reference preserves participant feasibility and all canonical dependencies", () => {
  for (const participantId of expanded.participants) {
    const intervals = intervalsForParticipant(participantId);
    for (let index = 1; index < intervals.length; index += 1) assert.ok(intervals[index]!.start >= intervals[index - 1]!.end, participantId);
  }
  for (const task of expanded.tasks) {
    const interval = byId.get(task.id)!;
    for (const dependencyId of task.dependencies) {
      const dependency = byId.get(dependencyId);
      assert.ok(dependency, `${task.id} -> ${dependencyId}`);
      assert.ok(dependency.end <= interval.start, `${task.id} -> ${dependencyId}`);
    }
  }
});

test("human main flow is 285 productive minutes with only the authorized 14:00-15:15 pause", () => {
  const main = expanded.tasks.filter(({ type }) => type === "ENSAYO_ESTUDIO_7").map(({ id }) => byId.get(id)!).sort((a, b) => a.start - b.start || a.taskId.localeCompare(b.taskId, "en"));
  assert.equal(main.length, 19);
  assert.equal(main.reduce((sum, interval) => sum + interval.duration, 0), 285);
  assert.deepEqual(main.slice(0, 11).map(({ start }) => start), Array.from({ length: 11 }, (_, index) => 675 + index * 15));
  assert.deepEqual(main.slice(11).map(({ start }) => start), Array.from({ length: 8 }, (_, index) => 915 + index * 15));
  assert.equal(main[0]!.start, 675);
  assert.equal(main[10]!.end, 840);
  assert.equal(main[11]!.start, 915);
  assert.equal(main.at(-1)!.end, 1035);
});

test("human Totales reference has nine synchronized paired rounds and one residual Totales 1 round", () => {
  const starts = (type: "TOTALES_1" | "TOTALES_COREO") => expanded.tasks.filter((task) => task.type === type).map(({ id }) => byId.get(id)!.start).sort((a, b) => a - b);
  const totales1 = starts("TOTALES_1");
  const coreo = starts("TOTALES_COREO");
  assert.equal(totales1.length, 10);
  assert.equal(coreo.length, 9);
  assert.deepEqual(totales1.slice(0, 9), coreo);
  assert.equal(totales1[9], 1005);
});

test("anchored, joint and technical operations retain the corrected human timing semantics", () => {
  for (const participantId of ["C01", "C05", "C08"] as const) {
    const before = byId.get(`${participantId}.reality_plato_antes`)!;
    const main = byId.get(`${participantId}.ensayo_estudio_7`)!;
    const after = byId.get(`${participantId}.reality_plato_despues`)!;
    assert.equal(before.end, main.start, participantId);
    assert.equal(main.end, after.start, participantId);
    assert.equal(after.end - before.start, 45, participantId);
  }
  for (const suffix of ["alfombra_roja_conjunta", "totales_post_conjunto"] as const) {
    const c06 = byId.get(`C06.${suffix}`)!;
    const c10 = byId.get(`C10.${suffix}`)!;
    assert.deepEqual([c06.start, c06.end], [c10.start, c10.end], suffix);
  }
  const technicalReality = byId.get("TECH.tech_reality_eva")!;
  const transfer = byId.get("TECH.tech_desmontaje_traslado")!;
  const technicalPost = byId.get("TECH.tech_totales_post")!;
  assert.deepEqual([technicalReality.start, technicalReality.end], [960, 980]);
  assert.deepEqual([transfer.start, transfer.end], [980, 985]);
  assert.deepEqual([technicalPost.start, technicalPost.end], [985, 990]);
});

test("official PDF corrections are visible in the normalized reference", () => {
  assert.deepEqual([byId.get("C09.sodexo")!.start, byId.get("C09.sodexo")!.end], [830, 870]);
  assert.deepEqual([byId.get("C12.sodexo")!.start, byId.get("C12.sodexo")!.end], [850, 890]);
  assert.deepEqual([byId.get("C13.estilismo_salida")!.start, byId.get("C13.estilismo_salida")!.end], [1085, 1090]);
  assert.deepEqual([byId.get("C16.alfombra_roja")!.start, byId.get("C16.alfombra_roja")!.end], [1090, 1100]);
  assert.equal(reference.appliedCorrections.length, 7);
});

test("source audit preserves unresolved capacity conflicts instead of repairing the human reference", () => {
  const taskById = new Map(expanded.tasks.map((task) => [task.id, task] as const));
  const styling = reference.intervals.filter(({ taskId }) => taskById.get(taskId)?.spaceId === "styling").sort((a, b) => a.start - b.start || a.taskId.localeCompare(b.taskId, "en"));
  const stylingOverlap = styling.some((left, index) => styling.slice(index + 1).some((right) => left.start < right.end && right.start < left.end));
  assert.equal(stylingOverlap, true);
  const c01Redes = byId.get("C01.redes")!;
  const c11Corner = byId.get("C11.corner_influencer")!;
  assert.deepEqual([c01Redes.start, c01Redes.end], [715, 720]);
  assert.deepEqual([c11Corner.start, c11Corner.end], [710, 720]);
  assert.ok(c01Redes.start < c11Corner.end && c11Corner.start < c01Redes.end);
  assert.deepEqual(reference.sourceAudit.knownAmbiguities.map(({ code }) => code), ["STYLING_CAPACITY_UNSPECIFIED_BY_MASTER", "C01_REDES_OVERLAPS_C11_CORNER_IN_P14_RECURSOS_REFERENCE"]);
});

test("human reference materializes documented setup and round preparations without inflating productive task duration", () => {
  const setup = reference.preparations.filter(({ kind }) => kind === "setup_preparation");
  const rounds = reference.preparations.filter(({ kind }) => kind === "round_preparation");
  assert.deepEqual(setup, [{ id: "human-preparation:p15-estrellas-sillon:estrellas-entry", kind: "setup_preparation", spaceId: "p15-estrellas-sillon", start: 855, end: 865, duration: 10 }]);
  assert.equal(rounds.length, 17);
  assert.equal(rounds.reduce((sum, preparation) => sum + preparation.duration, 0), 85);
  for (const preparation of rounds) {
    const roundNumber = Number(preparation.id.split("-").at(-1));
    assert.ok(roundNumber >= 2);
    assert.equal(preparation.duration, 5);
  }
});
