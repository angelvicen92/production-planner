import { readFileSync, writeFileSync } from "node:fs";
import { produce } from "./asst010JointComponentExperiment";
import type {
  PlannerNextProblem,
  ScheduledTask,
} from "../../engine/planner-next/contracts";
import type { FutureJointCompletionWitnessV1 } from "../../engine/planner-next/anonymousPipelineWitness";
// Reads only current canon, literal protections and the actual prior accepted-run lineage.
// The external positive artifact's `witness` is never passed to the search.
const inputPath =
  process.argv[2] ?? "docs/evidence/ASST-010-S2-PROTECTED-FEASIBLE.json";
const outputPath =
  process.argv[3] ?? "work/asst-s2-components/current-stress.json";
const artifact = JSON.parse(readFileSync(inputPath, "utf8")) as {
  source: PlannerNextProblem;
  priorJoint: FutureJointCompletionWitnessV1;
  protectedTasks: ScheduledTask[];
  witness?: FutureJointCompletionWitnessV1;
};
const { source, priorJoint, protectedTasks } = artifact;
const before = JSON.stringify({ source, priorJoint, protectedTasks });
let charges = 0;
const start = performance.now();
const consume = () => (charges < 100000 ? (charges++, true) : false);
// Independent diagnostic ceiling, not a change to the production request's 300 seconds.
const checkpoint = () => {
  if (performance.now() - start >= 60000) throw Error("DIAGNOSTIC_TIME_LIMIT");
};
let result: unknown;
try {
  const auditOnly = process.argv[4] === "--audit-model";
  if (auditOnly && !artifact.witness)
    throw Error("NO_DIAGNOSTIC_WITNESS_FOR_MODEL_AUDIT");
  const found = produce(
    source,
    priorJoint,
    protectedTasks,
    consume,
    checkpoint,
    auditOnly ? artifact.witness : undefined,
    process.argv[4] === "--first-conflict",
  );
  result = {
    ...found,
    outcome: auditOnly
      ? "MODEL_AUDIT_ONLY"
      : "witness" in found && found.witness
        ? "CERTIFIED_DIAGNOSTIC_COMPLETION"
        : "INCONCLUSIVE",
  };
} catch (error) {
  const e = error as Error & { stats?: unknown };
  result = {
    outcome: "INCONCLUSIVE",
    stopReason: e.message,
    stats: e.stats ?? null,
  };
}
if (before !== JSON.stringify({ source, priorJoint, protectedTasks }))
  throw Error("DIAGNOSTIC_MUTATED_INPUT");
const report = {
  inputPath,
  charges,
  wallMs: performance.now() - start,
  requestLedgerLimit: 100000,
  diagnosticTimeLimitMs: 60000,
  productionWiring: false,
  diagnosticSolutionInjected: false,
  inputImmutable: true,
  result,
};
writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    outputPath,
    charges: report.charges,
    wallMs: report.wallMs,
    outcome: (result as { outcome: string }).outcome,
  }),
);
