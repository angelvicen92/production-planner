import type { EngineInput } from "../../types";
import { executePlannerNext } from "../executePlannerNext";
import { adaptEngineInputToPlannerNextProblem } from "../integration/engineInputAdapter";
import { createSupportedEngineInputAdapterFixture } from "../integration/engineInputAdapter.fixture";
import { preflightEngineInputForPlannerNext } from "../integration/engineInputPreflight";
import { validatePlan } from "../validate";
import type { LayerExecutionStatus } from "./focalA2EvidenceRegistry";

export type ProbeScope = "END_TO_END" | "PLANNER_LAYER" | "SOURCE_ONLY";
export interface CapabilityProbeResult {
  readonly id: string; readonly probeScope: ProbeScope; readonly exactFunctionExecuted: readonly string[];
  readonly nonEndToEndReason: string | null; readonly preflightStatus: LayerExecutionStatus;
  readonly adapterStatus: LayerExecutionStatus; readonly dispatcherStatus: LayerExecutionStatus;
  readonly validationStatus: LayerExecutionStatus; readonly reasonCodes: readonly string[]; readonly inputImmutable: boolean;
}

const snapshot = (value: unknown): string => JSON.stringify(value);

/** Executes every integration boundary, including the official policy dispatcher. */
function createPlanifiableIntegrationFixture(): EngineInput {
  const fixture = structuredClone(createSupportedEngineInputAdapterFixture());
  fixture.tasks = fixture.tasks.filter(({ id }) => id !== 105);
  fixture.locks = fixture.locks.filter(({ taskId }) => taskId !== 105);
  return fixture;
}

export function runSupportedIntegrationProbe(input: EngineInput = createPlanifiableIntegrationFixture()): CapabilityProbeResult {
  const before = snapshot(input);
  const preflight = preflightEngineInputForPlannerNext(input);
  if (preflight.status !== "SUPPORTED") return Object.freeze({ id: "supported-engine-input", probeScope: "END_TO_END", exactFunctionExecuted: ["preflightEngineInputForPlannerNext"], nonEndToEndReason: null, preflightStatus: "UNSUPPORTED", adapterStatus: "NOT_EXECUTED", dispatcherStatus: "NOT_EXECUTED", validationStatus: "NOT_EXECUTED", reasonCodes: preflight.reasonCodes, inputImmutable: before === snapshot(input) });
  const adapted = adaptEngineInputToPlannerNextProblem(input);
  if (adapted.status !== "SUPPORTED") return Object.freeze({ id: "supported-engine-input", probeScope: "END_TO_END", exactFunctionExecuted: ["preflightEngineInputForPlannerNext", "adaptEngineInputToPlannerNextProblem"], nonEndToEndReason: null, preflightStatus: "SUPPORTED", adapterStatus: "UNSUPPORTED", dispatcherStatus: "NOT_EXECUTED", validationStatus: "NOT_EXECUTED", reasonCodes: adapted.reasonCodes, inputImmutable: before === snapshot(input) });
  const execution = executePlannerNext(adapted.problem);
  if (!execution.result) return Object.freeze({ id: "supported-engine-input", probeScope: "END_TO_END", exactFunctionExecuted: ["preflightEngineInputForPlannerNext", "adaptEngineInputToPlannerNextProblem", "executePlannerNext"], nonEndToEndReason: null, preflightStatus: "SUPPORTED", adapterStatus: "SUPPORTED", dispatcherStatus: "UNSUPPORTED", validationStatus: "NOT_EXECUTED", reasonCodes: execution.policyResolution.reasonCodes, inputImmutable: before === snapshot(input) });
  const validation = validatePlan(adapted.problem, execution.result.scheduledTasks, "scheduledSetupPreparations" in execution.result ? execution.result.scheduledSetupPreparations : [], execution.result.scheduledSpaceMeals);
  return Object.freeze({ id: "supported-engine-input", probeScope: "END_TO_END", exactFunctionExecuted: ["preflightEngineInputForPlannerNext", "adaptEngineInputToPlannerNextProblem", "executePlannerNext", "validatePlan"], nonEndToEndReason: null, preflightStatus: "SUPPORTED", adapterStatus: "SUPPORTED", dispatcherStatus: "SUPPORTED", validationStatus: validation.hardValid ? "SUPPORTED" : "FAILED", reasonCodes: validation.reasonCodes, inputImmutable: before === snapshot(input) });
}

export function plannerLayerProbeRecord(id: string, exactFunctionExecuted: string, reason: string): CapabilityProbeResult {
  return Object.freeze({ id, probeScope: "PLANNER_LAYER", exactFunctionExecuted: [exactFunctionExecuted], nonEndToEndReason: reason, preflightStatus: "NOT_EXECUTED", adapterStatus: "NOT_EXECUTED", dispatcherStatus: "NOT_EXECUTED", validationStatus: "NOT_EXECUTED", reasonCodes: [], inputImmutable: true });
}

export const PLANNER_LAYER_PROBES = Object.freeze([
  plannerLayerProbeRecord("joint-tasks", "synchronizedJointTasks", "Audits Planner Next joint semantics, not EngineInput integration."),
  plannerLayerProbeRecord("technical-chain", "getTechnicalChains", "Audits the internal technical-chain authority only."),
  plannerLayerProbeRecord("reality-families", "evaluateFocalA2RealityUnits", "Audits exact Focal unit composition from benchmark Evidence."),
]);
