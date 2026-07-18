import { createHash } from "node:crypto";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";

const digest = (value: any) => createHash("sha256").update(stableStringify(value)).digest("hex");
const uniq = (values: readonly number[]) => [...new Set(values.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
const minNullable = (values: readonly any[]) => { const nums = values.map(Number).filter(Number.isFinite); return nums.length ? Math.min(...nums) : null; };
const maxNumber = (values: readonly any[]) => Math.max(0, ...values.map(Number).filter(Number.isFinite));

export interface InitialConstructionExecutableFrontierCandidate {
  readonly executionTaskId: number;
  readonly primaryGoalTaskId: number;
  readonly supportedGoalTaskIds: readonly number[];
  readonly supportingChainFingerprints: readonly string[];
  readonly supportingChainRanks: readonly number[];
  readonly supportingChainCount: number;
  readonly criticalSupportingGoalTaskIds: readonly number[];
  readonly mainFlowSupportingGoalTaskIds: readonly number[];
  readonly feederSupportingGoalTaskIds: readonly number[];
  readonly minimumChainSlackMinutes: number | null;
  readonly minimumOwnSlackMinutes: number | null;
  readonly maximumDownstreamCriticalDurationMinutes: number;
  readonly maximumUnlockPotential: number;
  readonly maximumResourcePressure: number;
  readonly maximumSpacePressure: number;
  readonly inheritedCriticalitySourceTaskIds: readonly number[];
  readonly canonicalAnchorTaskId: number | null;
  readonly canonicalAnchorFingerprint: string | null;
  readonly priorityKey: readonly number[];
  readonly fingerprint: string;
  readonly readOnly: true;
}

export interface InitialConstructionExecutableFrontierPortfolio {
  readonly parentAssignmentsFingerprint: string;
  readonly chainFrontierOccurrenceCount: number;
  readonly uniqueExecutableFrontierTaskCount: number;
  readonly duplicateChainFrontierOccurrenceCount: number;
  readonly sharedExecutableFrontierTaskCount: number;
  readonly candidates: readonly InitialConstructionExecutableFrontierCandidate[];
  readonly portfolioFingerprint: string;
  readonly readOnly: true;
}

export function buildInitialConstructionExecutableFrontierPortfolio(args: { parentAssignmentsFingerprint: string; initialConstructionMap: any; canonicalAnchors?: readonly any[] | null }): InitialConstructionExecutableFrontierPortfolio {
  const anchorsByTaskId = new Map([...(args.canonicalAnchors ?? [])].map((a: any) => [Number(a.anchorTaskId), a]));
  const groups = new Map<number, any[]>();
  const chains = [...(args.initialConstructionMap?.criticalChains ?? [])];
  chains.forEach((chain: any, index: number) => {
    const rank = index + 1;
    for (const executionTaskId of uniq(chain.executableFrontierTaskIds ?? [])) {
      const occurrence = { chain, chainRank: rank, executionTaskId, goalTaskId: Number(chain.goalTaskId), chainFingerprint: String(chain.fingerprint ?? digest({ rank, goalTaskId: chain.goalTaskId, executionTaskId })) };
      groups.set(executionTaskId, [...(groups.get(executionTaskId) ?? []), occurrence]);
    }
  });
  const chainFrontierOccurrenceCount = [...groups.values()].reduce((sum, xs) => sum + xs.length, 0);
  const candidates = [...groups.entries()].map(([executionTaskId, occurrences]) => {
    occurrences.sort((a, b) => a.chainRank - b.chainRank || a.goalTaskId - b.goalTaskId || a.chainFingerprint.localeCompare(b.chainFingerprint));
    const primaryGoalTaskId = occurrences[0].goalTaskId;
    const supportedGoalTaskIds = uniq(occurrences.map((o) => o.goalTaskId));
    const criticalSupportingGoalTaskIds = uniq(occurrences.filter((o) => Number(o.chain?.priorityKey?.hardRiskRank ?? 0) < 0 || Number(o.chain?.chainSlackMinutes ?? 999999) <= 0).map((o) => o.goalTaskId));
    const mainFlowSupportingGoalTaskIds = uniq(occurrences.filter((o) => o.chain?.goalMainFlow).map((o) => o.goalTaskId));
    const feederSupportingGoalTaskIds = uniq(occurrences.filter((o) => o.chain?.feedsMainFlow).map((o) => o.goalTaskId));
    const anchor: any = anchorsByTaskId.get(executionTaskId) ?? null;
    const supportingChainRanks = occurrences.map((o) => o.chainRank).sort((a, b) => a - b);
    const minimumChainSlackMinutes = minNullable(occurrences.map((o) => o.chain?.chainSlackMinutes));
    const minimumOwnSlackMinutes = minNullable(occurrences.map((o) => o.chain?.ownSlackMinutes));
    const maximumDownstreamCriticalDurationMinutes = maxNumber(occurrences.map((o) => o.chain?.downstreamCriticalDurationMinutes));
    const maximumUnlockPotential = maxNumber(occurrences.map((o) => o.chain?.unlockPotential));
    const maximumResourcePressure = maxNumber(occurrences.map((o) => o.chain?.resourcePressure));
    const maximumSpacePressure = maxNumber(occurrences.map((o) => o.chain?.spacePressure));
    const ownAnchorPriority = anchor?.lexicographicPriority?.[0] ?? Object.values(anchor?.priorityKey ?? {})[0] ?? 0;
    const hardRisk = occurrences.some((o) => Number(o.chain?.priorityKey?.hardRiskRank ?? 0) < 0 || Number(o.chain?.dependentDeadlinePressure ?? 0) > 0) ? 0 : 1;
    const priorityKey = [Math.min(...supportingChainRanks), hardRisk, minimumChainSlackMinutes ?? 999999, -criticalSupportingGoalTaskIds.length, -mainFlowSupportingGoalTaskIds.length, -maximumDownstreamCriticalDurationMinutes, -maximumUnlockPotential, -maximumResourcePressure, -maximumSpacePressure, Number(ownAnchorPriority) || 0, executionTaskId];
    const raw = { executionTaskId, primaryGoalTaskId, supportedGoalTaskIds, supportingChainFingerprints: [...new Set(occurrences.map((o) => o.chainFingerprint))].sort(), supportingChainRanks, supportingChainCount: occurrences.length, criticalSupportingGoalTaskIds, mainFlowSupportingGoalTaskIds, feederSupportingGoalTaskIds, minimumChainSlackMinutes, minimumOwnSlackMinutes, maximumDownstreamCriticalDurationMinutes, maximumUnlockPotential, maximumResourcePressure, maximumSpacePressure, inheritedCriticalitySourceTaskIds: uniq(occurrences.flatMap((o) => o.chain?.inheritedCriticalitySourceTaskIds ?? [])), canonicalAnchorTaskId: anchor ? Number(anchor.anchorTaskId) : null, canonicalAnchorFingerprint: anchor?.fingerprint ?? null, priorityKey };
    return { ...raw, fingerprint: digest(raw), readOnly: true } as InitialConstructionExecutableFrontierCandidate;
  }).sort((a, b) => { for (let i = 0; i < Math.max(a.priorityKey.length, b.priorityKey.length); i++) if (a.priorityKey[i] !== b.priorityKey[i]) return a.priorityKey[i] - b.priorityKey[i]; return a.executionTaskId - b.executionTaskId; });
  const uniqueExecutableFrontierTaskCount = candidates.length;
  const raw = { parentAssignmentsFingerprint: args.parentAssignmentsFingerprint, chainFrontierOccurrenceCount, uniqueExecutableFrontierTaskCount, duplicateChainFrontierOccurrenceCount: Math.max(0, chainFrontierOccurrenceCount - uniqueExecutableFrontierTaskCount), sharedExecutableFrontierTaskCount: candidates.filter((c) => c.supportingChainCount > 1 || c.supportedGoalTaskIds.length > 1).length, candidates };
  return deepFreeze({ ...raw, portfolioFingerprint: digest({ parent: raw.parentAssignmentsFingerprint, candidates: candidates.map((c) => c.fingerprint) }), readOnly: true }) as InitialConstructionExecutableFrontierPortfolio;
}
