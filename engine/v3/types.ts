import type { EngineInput, EngineOutput } from "../types";

export type EngineV3Input = EngineInput;
export type EngineV3Output = EngineOutput;

export type EngineV3Options = {
  requestId?: string;
  timeLimitMs?: number | null;
  onProgress?: (progress: {
    phase: "prevalidation" | "build_input" | "solving_feasible" | "optimizing" | "persisting";
    progressPct: number;
    message?: string;
  }) => void;
};
