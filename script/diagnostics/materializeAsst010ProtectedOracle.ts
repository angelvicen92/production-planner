import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

// Converts an external diagnostic result into an artifact for the read-only canonical audit.
// It never submits a candidate to the production planner or changes the saved evidence.
const directory = process.argv[2] ?? "work/asst010-protected-oracle";
const mode = process.argv[3] ?? "permuted-core";
const artifactPath = process.argv[4] ?? "docs/evidence/ASST-010-S2-PROTECTED-FEASIBLE.json";
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
const input = JSON.parse(readFileSync(`${directory}/full-oracle-input.json`, "utf8"));
const result = JSON.parse(readFileSync(`${directory}/full-oracle-${mode}-result.json`, "utf8"));
if (!result.starts) throw new Error("No diagnostic candidate; a restricted negative or timeout is not a global infeasibility proof");
const tasks = input.tasks.map((task: any) => input.protectedTasks.find((fixed: any) => fixed.id === task.id)
  ?? { ...task, start: result.starts[task.id], end: result.starts[task.id] + task.duration });
const movePreparation = (preparation: any) => {
  const { reference, offset, ...body } = preparation;
  const start = reference ? result.starts[reference] + offset : preparation.start;
  return { ...body, start, end: start + preparation.duration };
};
const participantMeals = input.priorJoint.participantMeals.map((meal: any) => ({ ...meal,
  start: result.starts[meal.sourceTaskId], end: result.starts[meal.sourceTaskId] + meal.duration }));
const body = { kind: "JOINT_COMPLETION", version: 1, tasks,
  preparations: input.preparations.map(movePreparation), roundPreparations: input.roundPreparations.map(movePreparation),
  participantMeals, operationalMeals: input.priorJoint.operationalMeals, spaceMeals: input.priorJoint.spaceMeals };
const witness = { ...body, fingerprint: createHash("sha256").update(JSON.stringify(body)).digest("hex") };
writeFileSync(`${directory}/candidate.json`, JSON.stringify({ ...artifact, witness,
  qualification: "Uncertified external candidate. Run auditAsst010ProtectedWitness.ts before asserting FEASIBLE." }, null, 2));
console.log(JSON.stringify({ candidate: `${directory}/candidate.json`, status: "UNCERTIFIED", fingerprint: witness.fingerprint }));
