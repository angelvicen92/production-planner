import type { EngineInput } from "../../types";
import { realProductionScenarios } from "./fixtures/real-scenarios/realProductionScenarios";

export interface RealProductionScenario {
  id: string;
  name: string;
  description: string;
  input: EngineInput;
  expectedPlanningMetadata?: Record<string, unknown>;
}

export interface RealProductionScenarioSuite {
  scenarios: RealProductionScenario[];
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function buildRealProductionScenarioSuite(
  scenarios: RealProductionScenario[] = realProductionScenarios,
): RealProductionScenarioSuite {
  return {
    scenarios: clone(scenarios),
  };
}
