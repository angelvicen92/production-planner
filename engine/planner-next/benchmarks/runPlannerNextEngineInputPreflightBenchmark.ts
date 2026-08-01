import type { EngineInput } from "../../types";
import { realProductionScenarios } from "../../orc/benchmarks/fixtures/real-scenarios/realProductionScenarios";
import { preflightEngineInputForPlannerNext } from "../integration/engineInputPreflight";

const clone = <T>(v: T): T => structuredClone(v);
const freeze = <T>(v: T): T => { if (v && typeof v === "object") { Object.values(v as object).forEach(freeze); Object.freeze(v); } return v; };
const reversed = (source: EngineInput): EngineInput => { const v = clone(source); v.tasks.reverse().forEach(t => { t.dependsOnTaskIds?.reverse(); t.assignedResourceIds?.reverse(); }); v.locks.reverse(); v.planResourceItems.reverse(); v.protectedBreaks?.reverse(); return v; };
const evidence = (input: EngineInput) => { const r = preflightEngineInputForPlannerNext(input); return { status: r.status, reasonCodes: r.reasonCodes, diagnostics: r.diagnostics, sourceFingerprint: r.sourceFingerprint, identityMapFingerprint: r.identityMapFingerprint, inputImmutable: Object.isFrozen(input) }; };
const output = realProductionScenarios.map(scenario => {
  const input = freeze(clone(scenario.input)); const normal = evidence(input), repeated = evidence(input), inverted = evidence(freeze(reversed(input)));
  if (JSON.stringify(normal) !== JSON.stringify(repeated) || JSON.stringify(normal) !== JSON.stringify(inverted)) throw new Error(`Non-deterministic preflight evidence: ${scenario.id}`);
  return { scenarioId: scenario.id, ...normal };
});
process.stdout.write(`${JSON.stringify({ benchmark: "SPEC10-001-engine-input-preflight", scenarios: output }, null, 2)}\n`);
