import type { EngineInput, EngineOutput } from "../types";

export type EngineV3Input = EngineInput;
export type EngineV3Output = EngineOutput;

export type EngineV3ProgressPhase =
  | "queued"
  | "loading_input"
  | "phase_a_base_solution"
  | "hard_validation"
  | "backtracking"
  | "operational_neighborhoods"
  | "coach_compaction"
  | "coach_wave_ordering"
  | "pipeline_builder"
  | "pipeline_repair"
  | "lane_only_repair"
  | "scoring_candidates"
  | "persisting_result"
  | "success"
  | "failed"
  | "cancelled";

export type EngineV3Progress = {
  phase: EngineV3ProgressPhase;
  label: string;
  progressPercent: number;
  startedAt: string;
  updatedAt: string;
  message: string;
  candidatesEvaluated?: number;
  candidatesGenerated?: number;
  currentBestReason?: string;
};

export type EngineV3Options = {
  requestId?: string;
  timeLimitMs?: number | null;
  enableLimitedBacktracking?: boolean;
  maxBacktrackAttempts?: number;
  maxBacktrackDepth?: number;
  maxSearchMs?: number;
  onProgress?: (progress: EngineV3Progress) => void;
};
