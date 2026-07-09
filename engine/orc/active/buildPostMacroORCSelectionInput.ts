import type { Candidate, CandidateState, CommitDecision, OperationalValue, SimulatedState, ValidationResult } from "../contracts";
import type { ORCShadowModeResult } from "../shadow/runORCShadowMode";
import type { MacroMainZoneBlockRelayoutPassResult } from "./runMacroMainZoneBlockRelayoutPass";

type Rec = Record<string, any>;
type Source = "shadow" | "macro-pass" | "both";

export interface PostMacroORCSelectionInput extends ORCShadowModeResult {
  sourceBreakdown: {
    candidates: Record<Source, number>;
    candidateStates: Record<Source, number>;
    simulatedStates: Record<Source, number>;
    validationResults: Record<Source, number>;
    operationalValues: Record<Source, number>;
    commitDecisions: Record<Source, number>;
    macroPassSimulationIdsResolvedCount: number;
    macroPassSimulationIdsMissingCount: number;
    macroPassSimulationIdsMissing: string[];
    readOnly: true;
  };
  postMacroSelection: {
    postMacroUnifiedPoolBuilt: true;
    postMacroSources: Source[];
    stalePreMacroSelectionDiscarded: boolean;
    stalePreMacroSelectionReason: string | null;
    readOnly: true;
  };
  readOnly: true;
}

const emptyCounts = (): Record<Source, number> => ({ shadow: 0, "macro-pass": 0, both: 0 });
const idOf = (item: any, fallback?: string): string | null => typeof item?.id === "string" ? item.id : (fallback && typeof item?.[fallback] === "string" ? item[fallback] : null);

function mergeById<T>(shadowItems: readonly T[] = [], macroItems: readonly T[] = [], getId: (item: T) => string | null): { items: T[]; counts: Record<Source, number>; sourceById: Map<string, Source> } {
  const byId = new Map<string, T>();
  const sourceById = new Map<string, Source>();
  for (const item of shadowItems) { const id = getId(item); if (!id) continue; byId.set(id, item); sourceById.set(id, "shadow"); }
  for (const item of macroItems) {
    const id = getId(item); if (!id) continue;
    const prev = sourceById.get(id);
    byId.set(id, prev === "shadow" ? ({ ...(byId.get(id) as any), ...(item as any), planningMaterialization: (item as any).planningMaterialization ?? (byId.get(id) as any)?.planningMaterialization } as T) : item);
    sourceById.set(id, prev === "shadow" ? "both" : "macro-pass");
  }
  const counts = emptyCounts();
  for (const src of sourceById.values()) counts[src] += 1;
  return { items: [...byId.values()], counts, sourceById };
}

export function buildPostMacroORCSelectionInput(args: { shadow: ORCShadowModeResult | null; macroMainZoneBlockRelayoutPass: MacroMainZoneBlockRelayoutPassResult | null; preMacroSelection?: { diagnostics?: Rec | null } | null; preMacroCompositeSummary?: Rec | null }): PostMacroORCSelectionInput | null {
  const shadow = args.shadow;
  if (!shadow) return null;
  const pass = args.macroMainZoneBlockRelayoutPass;
  const pipeline = pass?.pipeline;
  const candidates = mergeById<Candidate>(shadow.candidates ?? [], pass?.candidates ?? [], (x) => idOf(x));
  const candidateStates = mergeById<CandidateState>(shadow.candidateStates ?? [], pipeline?.transformation?.candidateStates ?? [], (x) => idOf(x));
  const simulatedStates = mergeById<SimulatedState>(shadow.simulatedStates ?? [], pipeline?.simulation?.simulatedStates ?? [], (x) => idOf(x));
  const validationResults = mergeById<ValidationResult>(shadow.validationResults ?? [], pipeline?.validation?.validationResults ?? [], (x) => idOf(x, "simulatedStateId"));
  const operationalValues = mergeById<OperationalValue>(shadow.operationalValues ?? [], pipeline?.ranking?.rankedOperationalValues ?? [], (x) => idOf(x, "simulatedStateId"));
  const commitDecisions = mergeById<CommitDecision>(shadow.commitDecisions ?? [], pipeline?.commit?.commitDecisions ?? [], (x) => idOf(x, "operationalValueId"));
  const macroPassSimulationIds = new Set<string>((pipeline?.simulation?.simulatedStates ?? []).map((s: any) => s.id).filter((id: any): id is string => typeof id === "string"));
  const missing = [...macroPassSimulationIds].filter((id) => !simulatedStates.sourceById.has(id)).sort();
  const stale = args.preMacroSelection?.diagnostics?.selectedBucket === "valid-committed-macro-main-zone-block-relayout" && pass?.summary?.selectedAsCommit !== true;
  const summary = { ...(shadow.summary as Rec ?? {}), macroMainZoneBlockRelayout: pass?.summary ?? (shadow.summary as Rec | undefined)?.macroMainZoneBlockRelayout ?? null };
  const sources = new Set<Source>([...candidates.sourceById.values(), ...candidateStates.sourceById.values(), ...simulatedStates.sourceById.values(), ...validationResults.sourceById.values(), ...operationalValues.sourceById.values(), ...commitDecisions.sourceById.values()]);
  return {
    ...shadow,
    candidates: candidates.items,
    candidateStates: candidateStates.items,
    simulatedStates: simulatedStates.items,
    validationResults: validationResults.items,
    operationalValues: operationalValues.items,
    commitDecisions: commitDecisions.items,
    summary: summary as any,
    sourceBreakdown: { candidates: candidates.counts, candidateStates: candidateStates.counts, simulatedStates: simulatedStates.counts, validationResults: validationResults.counts, operationalValues: operationalValues.counts, commitDecisions: commitDecisions.counts, macroPassSimulationIdsResolvedCount: macroPassSimulationIds.size - missing.length, macroPassSimulationIdsMissingCount: missing.length, macroPassSimulationIdsMissing: missing, readOnly: true },
    postMacroSelection: { postMacroUnifiedPoolBuilt: true, postMacroSources: [...sources].sort() as Source[], stalePreMacroSelectionDiscarded: stale, stalePreMacroSelectionReason: stale ? "final_macro_summary_rejected_candidate" : null, readOnly: true },
    readOnly: true,
  };
}
