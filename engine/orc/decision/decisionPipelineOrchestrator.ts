import type { Evidence, OperationalState } from "../contracts";
import { deepFreeze } from "../immutability";
import { analyzeFutureImpact } from "../analysis/futureImpactAnalyzer";
import type { CommitEngineResult } from "../commit/commitEngine";
import { buildCommitDecisions } from "../commit/commitEngine";
import type { OperationalEvaluatorResult } from "../evaluator/operationalEvaluator";
import { evaluateSimulatedStates } from "../evaluator/operationalEvaluator";
import type { SimulationEngineResult } from "../simulation/simulationEngine";
import { simulateCandidateStates } from "../simulation/simulationEngine";
import type { TransformationEngineResult } from "../transformation/transformationEngine";
import { buildCandidateStates } from "../transformation/transformationEngine";
import type { ValidationEngineResult } from "../validation/validationEngine";
import { validateSimulatedStates } from "../validation/validationEngine";
import type { DecisionInput } from "./decisionInput";
import type { PartialPlanDecisionUnit } from "./decisionEngine";
import { preparePartialPlanDecisionUnits } from "./decisionEngine";
import type { DecisionTrace } from "./decisionTraceBuilder";
import { buildDecisionTrace } from "./decisionTraceBuilder";
import type { GlobalSolutionAssemblerResult } from "./globalSolutionAssembler";
import { assembleGlobalSolutions } from "./globalSolutionAssembler";
import type { RankingEngineResult } from "./rankingEngine";
import { rankDecisionInput } from "./rankingEngine";

export type TransformationResult = TransformationEngineResult;
export type SimulationResult = SimulationEngineResult;
export type ValidationResult = ValidationEngineResult;
export type EvaluationResult = OperationalEvaluatorResult;
export type RankingResult = RankingEngineResult;
export type GlobalSolutionsResult = GlobalSolutionAssemblerResult;
export type CommitResult = CommitEngineResult;

export interface DecisionPipelineResult {
  transformation: TransformationResult;
  simulation: SimulationResult;
  validation: ValidationResult;
  evaluation: EvaluationResult;
  ranking: RankingResult;
  globalSolutions: GlobalSolutionsResult;
  commit: CommitResult;
  evidence: Evidence[];
  decisionTrace: DecisionTrace;
}

export interface DecisionPipelineInput extends DecisionInput {
  operationalState: OperationalState;
  createdAt?: string | null;
}

type StageName = "transformation" | "simulation" | "validation" | "future-impact" | "evaluation" | "ranking" | "commit";
type StageBoundary = "start" | "end";

const PIPELINE_SOURCE = "orc-decision-pipeline-orchestrator";

function stageEvidenceId(stage: StageName, boundary: StageBoundary): string {
  return `evidence:${PIPELINE_SOURCE}:${stage}:${boundary}:v1`;
}

function buildStageEvidence(
  stage: StageName,
  boundary: StageBoundary,
  subjectId: string,
  createdAt: string | null,
  contracts: Record<string, unknown>,
  counts: Record<string, number>,
): Evidence {
  return deepFreeze({
    id: stageEvidenceId(stage, boundary),
    source: PIPELINE_SOURCE,
    kind: `decision-pipeline-stage-${boundary}`,
    subjectId,
    createdAt,
    data: {
      stage,
      boundary,
      contracts,
      counts,
      contractVersion: "DecisionPipeline-v1",
      readOnly: true,
      mutatesOperationalState: false,
      commitsPlanning: false,
    },
  }) as Evidence;
}

function attachOperationalValues(input: DecisionPipelineInput, evaluation: EvaluationResult, simulation: SimulationResult, transformation: TransformationResult): DecisionInput {
  const simulatedById = new Map(simulation.simulatedStates.map((simulatedState) => [simulatedState.id, simulatedState]));
  const candidateStateById = new Map(transformation.candidateStates.map((candidateState) => [candidateState.id, candidateState]));
  const operationalValuesByCandidateId = new Map<string, EvaluationResult["operationalValues"]>();
  const candidateById = new Map(input.candidates.map((candidate) => [candidate.id, candidate]));

  for (const operationalValue of evaluation.operationalValues) {
    const simulatedState = simulatedById.get(operationalValue.simulatedStateId);
    const candidateState = simulatedState == null ? undefined : candidateStateById.get(simulatedState.candidateStateId);
    if (candidateState == null) continue;
    const candidate = candidateById.get(candidateState.candidateId);
    operationalValuesByCandidateId.set(candidateState.candidateId, [
      ...(operationalValuesByCandidateId.get(candidateState.candidateId) ?? []),
      deepFreeze({
        ...operationalValue,
        metadata: {
          ...operationalValue.metadata,
          partialPlanId: candidate?.metadata.partialPlanId ?? null,
          partialPlanCandidateIds: candidate?.metadata.partialPlanCandidateIds ?? [],
          partialPlanCompatibilityScore: candidate?.metadata.partialPlanCompatibilityScore ?? null,
        },
      }) as EvaluationResult["operationalValues"][number],
    ]);
  }

  return deepFreeze({
    candidates: input.candidates.map((candidate) => deepFreeze({
      ...candidate,
      operationalValues: operationalValuesByCandidateId.get(candidate.id) ?? [],
    })),
    evidence: input.evidence,
    metadata: input.metadata,
  }) as DecisionInput;
}

function attachEvaluatedSyntheticCandidates(
  decisionUnits: readonly PartialPlanDecisionUnit[],
  evaluatedDecisionInput: DecisionInput,
): readonly PartialPlanDecisionUnit[] {
  const evaluatedById = new Map(evaluatedDecisionInput.candidates.map((candidate) => [candidate.id, candidate]));
  return deepFreeze(decisionUnits.map((unit) => deepFreeze({
    partialPlan: unit.partialPlan,
    candidates: unit.candidates,
    syntheticCandidate: evaluatedById.get(unit.syntheticCandidate.id) ?? unit.syntheticCandidate,
  }) as PartialPlanDecisionUnit)) as readonly PartialPlanDecisionUnit[];
}

export function executeDecisionPipeline(
  input: DecisionPipelineInput,
): DecisionPipelineResult {
  const createdAt = input.createdAt ?? null;
  const stateId = input.operationalState.id;
  const evidence: Evidence[] = [];

  const planPreparation = preparePartialPlanDecisionUnits(input.candidates, input.partialPlans, { createdAt });
  evidence.push(...planPreparation.evidence);

  evidence.push(buildStageEvidence("transformation", "start", stateId, createdAt, { input: "DecisionInput<PartialPlans>", output: "TransformationResult" }, { candidates: input.candidates.length, partialPlans: planPreparation.summary.partialPlanCount }));
  const transformation = buildCandidateStates(input.operationalState, planPreparation.candidates, { createdAt });
  evidence.push(buildStageEvidence("transformation", "end", stateId, createdAt, { input: "DecisionInput<PartialPlans>", output: "TransformationResult" }, { candidates: input.candidates.length, partialPlans: planPreparation.summary.partialPlanCount, candidateStates: transformation.candidateStates.length, evidence: transformation.evidence.length }));

  evidence.push(buildStageEvidence("simulation", "start", stateId, createdAt, { input: "TransformationResult", output: "SimulationResult" }, { candidateStates: transformation.candidateStates.length }));
  const simulation = simulateCandidateStates(input.operationalState, transformation.candidateStates, { createdAt });
  evidence.push(buildStageEvidence("simulation", "end", stateId, createdAt, { input: "TransformationResult", output: "SimulationResult" }, { candidateStates: transformation.candidateStates.length, simulatedStates: simulation.simulatedStates.length, evidence: simulation.evidence.length, realChanges: simulation.simulatedStates.reduce((total, simulated) => total + simulated.appliedTransformations.length, 0) }));

  evidence.push(buildStageEvidence("future-impact", "start", stateId, createdAt, { input: "SimulationResult", output: "FutureImpactAnalysisResult" }, { simulatedStates: simulation.simulatedStates.length }));
  const futureImpact = analyzeFutureImpact(simulation.simulatedStates);
  evidence.push(buildStageEvidence("future-impact", "end", stateId, createdAt, { input: "SimulationResult", output: "FutureImpactAnalysisResult" }, { analyzed: futureImpact.summary.analyzedCount, averageImpactScore: futureImpact.summary.averageImpactScore, evidence: futureImpact.evidence.length }));

  evidence.push(buildStageEvidence("validation", "start", stateId, createdAt, { input: "SimulationResult", output: "ValidationResult" }, { simulatedStates: simulation.simulatedStates.length }));
  const validation = validateSimulatedStates(simulation.simulatedStates, { createdAt });
  evidence.push(buildStageEvidence("validation", "end", stateId, createdAt, { input: "SimulationResult", output: "ValidationResult" }, { simulatedStates: simulation.simulatedStates.length, validationResults: validation.validationResults.length, evidence: validation.evidence.length }));

  evidence.push(buildStageEvidence("evaluation", "start", stateId, createdAt, { input: "SimulationResult+ValidationResult", output: "EvaluationResult" }, { simulatedStates: simulation.simulatedStates.length, validationResults: validation.validationResults.length }));
  const evaluation = evaluateSimulatedStates(simulation.simulatedStates, validation.validationResults, { createdAt, futureImpactAssessments: futureImpact.impacts });
  evidence.push(buildStageEvidence("evaluation", "end", stateId, createdAt, { input: "SimulationResult+ValidationResult", output: "EvaluationResult" }, { operationalValues: evaluation.operationalValues.length, skippedInvalid: evaluation.summary.skippedInvalid, evidence: evaluation.evidence.length }));

  const evaluatedDecisionInput = attachOperationalValues({ ...input, candidates: planPreparation.candidates }, evaluation, simulation, transformation);
  evidence.push(buildStageEvidence("ranking", "start", stateId, createdAt, { input: "DecisionInput<EvaluatedCandidates>", output: "RankingResult" }, { operationalValues: evaluation.operationalValues.length }));
  const ranking = rankDecisionInput(evaluatedDecisionInput, { createdAt });
  evidence.push(buildStageEvidence("ranking", "end", stateId, createdAt, { input: "DecisionInput<EvaluatedCandidates>", output: "RankingResult" }, { rankedOperationalValues: ranking.rankedOperationalValues.length, ties: ranking.summary.tieCount, evidence: ranking.evidence.length }));

  const globalSolutions = assembleGlobalSolutions(attachEvaluatedSyntheticCandidates(planPreparation.decisionUnits, evaluatedDecisionInput), { createdAt });
  evidence.push(...globalSolutions.evidence);

  evidence.push(buildStageEvidence("commit", "start", stateId, createdAt, { input: "RankingResult", output: "CommitResult" }, { rankedOperationalValues: ranking.rankedOperationalValues.length }));
  const commit = buildCommitDecisions(ranking.rankedOperationalValues, { createdAt });
  evidence.push(buildStageEvidence("commit", "end", stateId, createdAt, { input: "RankingResult", output: "CommitResult" }, { commitDecisions: commit.commitDecisions.length, commits: commit.summary.commitCount, rejects: commit.summary.rejectCount, evidence: commit.evidence.length }));

  evidence.push(...futureImpact.evidence.map((item) => ({ ...item, createdAt })));

  const pipelineResult = { transformation, simulation, validation, evaluation, ranking, globalSolutions, commit, evidence } as DecisionPipelineResult;
  const decisionTrace = buildDecisionTrace(pipelineResult);

  return deepFreeze({ ...pipelineResult, decisionTrace }) as DecisionPipelineResult;
}
