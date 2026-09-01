import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const FULL_A2_RESULT_MARKER = "FULL_A2_EXEC_RESULT";

type Result = {
  execution: null | {
    complete: boolean;
    evidence: null | {
      branchesExplored: number;
      coreBranches: number;
      standaloneBranches: number;
      coreCompleteLeafCount: number;
      deepestPartialCoreTasksRemaining: number;
      standaloneCompleteLeafCount: number;
      lastExhaustionPhase: string | null;
    };
  };
  publishedCanonicalObligations: number;
  targetCanonicalObligations: number;
  fullHardValidEligible: boolean;
  maxBranchExpansions: number;
};

const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

export function extractFullA2Result(log: string): unknown {
  const matches = log.split(/\r?\n/).flatMap((line) => {
    const index = line.indexOf(FULL_A2_RESULT_MARKER);
    return index < 0 ? [] : [line.slice(index + FULL_A2_RESULT_MARKER.length).trim()];
  });
  if (matches.length !== 1 || matches[0] === "") throw new Error(`expected exactly one ${FULL_A2_RESULT_MARKER} marker`);
  try { return JSON.parse(matches[0]); }
  catch { throw new Error(`${FULL_A2_RESULT_MARKER} contains malformed JSON`); }
}

export function checkFullA2StructuralFrontier(value: unknown): void {
  if (!value || typeof value !== "object") throw new Error("result must be an object");
  const result = value as Partial<Result>;
  const execution = result.execution;
  const evidence = execution?.evidence;
  if (!execution || !evidence
    || typeof execution.complete !== "boolean" || typeof result.fullHardValidEligible !== "boolean"
    || !integer(result.publishedCanonicalObligations) || !integer(result.targetCanonicalObligations)
    || !integer(result.maxBranchExpansions) || result.maxBranchExpansions === 0
    || !integer(evidence.branchesExplored) || !integer(evidence.coreBranches) || !integer(evidence.standaloneBranches)
    || !integer(evidence.coreCompleteLeafCount) || !integer(evidence.deepestPartialCoreTasksRemaining)
    || !integer(evidence.standaloneCompleteLeafCount)
    || (evidence.lastExhaustionPhase !== null && typeof evidence.lastExhaustionPhase !== "string"))
    throw new Error("result has a malformed structural/accounting shape");

  if (evidence.branchesExplored !== evidence.coreBranches + evidence.standaloneBranches)
    throw new Error("global branch accounting does not reconcile");
  if (evidence.branchesExplored > result.maxBranchExpansions)
    throw new Error("branchesExplored exceeds maxBranchExpansions");

  const completePublishedPlan = execution.complete === true
    && result.fullHardValidEligible === true
    && result.targetCanonicalObligations > 0
    && result.publishedCanonicalObligations === result.targetCanonicalObligations;
  if (completePublishedPlan) return;

  if (!(evidence.coreCompleteLeafCount > 0
    && evidence.deepestPartialCoreTasksRemaining === 0
    && evidence.standaloneCompleteLeafCount > 0
    && evidence.lastExhaustionPhase === "STANDALONE"))
    throw new Error("Full A2 structural frontier regressed");
}

export function checkFullA2Log(log: string): void {
  checkFullA2StructuralFrontier(extractFullA2Result(log));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.argv[2];
  if (!path) throw new Error("usage: checkFullA2StructuralFrontier.ts <npm-test-log>");
  checkFullA2Log(readFileSync(path, "utf8"));
  console.log("Full A2 structural frontier guard: PASS");
}
