import type { CognitiveState, Evidence, OperationalState } from "../contracts";
import { understandOperationalCriticality, type OperationalCriticality } from "../understanding/operationalCriticality";

export interface SearchAndExplorationUnderstanding {
  readonly operationalCriticality: OperationalCriticality;
  readonly cognitiveState: CognitiveState | null;
  readonly evidence: readonly Evidence[];
  readonly informationalOnly: true;
}

export function buildSearchAndExplorationUnderstanding(
  state: OperationalState,
  cognitiveState?: CognitiveState | null,
  createdAt: string | null = null,
): SearchAndExplorationUnderstanding {
  const result = understandOperationalCriticality(state, cognitiveState, createdAt);
  return Object.freeze({
    operationalCriticality: result.operationalCriticality,
    cognitiveState: result.cognitiveState,
    evidence: result.evidence,
    informationalOnly: true,
  });
}
