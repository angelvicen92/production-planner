import type { EngineInput, EngineOutput } from "../types";
import type { EngineV3Options } from "../v3/types";
import type { V4StrategicAnalysis } from "./analysis";
import type { V4GuidedOrderingDiagnostics } from "./guidedInput";
import type { V4PlanQualityEvaluation } from "./quality";
import type { MainFlowImprovementDiagnostics } from "./improvement";
import type { V4PostOptimizerDiagnostics } from "./postOptimizer";
import type { V4BlockRepackerDiagnostics } from "./blockRepacker";
import type { V4ImprovementEngineDiagnostics } from "./improvementEngine";
import type { V4CandidateRunnerDiagnostics, V4CandidateStrategyId } from "./candidates";
import type { MainFlowSequenceSearchDiagnostics } from "./mainFlowSequenceSearch";
import type { V3V4QualityComparison } from "./comparison";
import { runV4ProOrchestrator } from "./orchestrator";
import { consultORCAdvisory, type AdvisoryIntegrationResult } from "../orc/integration/advisoryIntegration";
import type { ORCShadowModeResult } from "../orc/shadow/runORCShadowMode";

export const ENGINE_V4_VERSION = "v4" as const;

export interface EngineV4Diagnostics {
  status: "success" | "infeasible";
  engineVersion: typeof ENGINE_V4_VERSION;
  generatedAt: string;
  plannedTasks: number;
  unplannedTasks: number;
  warning: string;
  strategicAnalysis: V4StrategicAnalysis;
  guidedOrdering: V4GuidedOrderingDiagnostics;
  quality: V4PlanQualityEvaluation;
  qualityBeforeImprovement?: V4PlanQualityEvaluation;
  qualityBeforePostOptimizer?: V4PlanQualityEvaluation;
  postOptimizer: V4PostOptimizerDiagnostics;
  blockRepacker?: V4BlockRepackerDiagnostics;
  improvementEngine?: V4ImprovementEngineDiagnostics;
  mainFlowImprovement: MainFlowImprovementDiagnostics;
  mainFlowSequenceSearch?: MainFlowSequenceSearchDiagnostics;
  candidateRunner: V4CandidateRunnerDiagnostics;
  v3V4Comparison: { v3Baseline: V4PlanQualityEvaluation | null; v4Final: V4PlanQualityEvaluation; comparison: V3V4QualityComparison | null };
  bestStrategyId: V4CandidateStrategyId;
  finalAcceptance?: { accepted: boolean; fallbackToV3Baseline: boolean; reason: string; checks?: Record<string, boolean> };
  performance?: { runtimeMs: number; strategiesEvaluated: number; profile: string; budgetExceeded: boolean; skippedStrategies: V4CandidateStrategyId[]; warnings?: string[] };
  executiveSummary?: { verdict: string; headline: string; wins: string[]; losses: string[]; risks: string[]; selectedStrategy: V4CandidateStrategyId };
  complexityAssessment?: import("./orchestrator/complexity").V4ScenarioComplexityAssessment;
  earlyExit?: { applied: boolean; fallbackToV3Baseline: boolean; reason: string };
  orcAdvisoryIntegration?: AdvisoryIntegrationResult;
}

type EngineV4ORCAdvisoryOptions = EngineV3Options & {
  orcAdvisoryIntegration?: {
    enabled?: boolean;
    shadowResult?: ORCShadowModeResult | null;
  };
};

export interface EngineV4Result {
  output: EngineOutput;
  diagnostics: EngineV4Diagnostics;
}

export function generatePlanV4(input: EngineInput, options?: EngineV3Options): EngineV4Result {
  const result = runV4ProOrchestrator(input, options as any);
  const advisoryOptions = (options as EngineV4ORCAdvisoryOptions | undefined)?.orcAdvisoryIntegration;
  if (advisoryOptions?.enabled === true) {
    return {
      ...result,
      diagnostics: {
        ...result.diagnostics,
        orcAdvisoryIntegration: consultORCAdvisory(advisoryOptions.shadowResult ?? null),
      },
    };
  }
  return result;
}

export type * from "../orc/contracts";
