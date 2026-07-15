import { createHash } from "node:crypto";
import type { EngineInput } from "../../types";
import type { CandidateAssignment, OperationalState } from "../contracts";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";
import { resolveInitialConstructionCanonicalContext, type InitialConstructionCanonicalContext } from "../understanding/initialConstructionCanonicalContext";

const hash=(x:any)=>createHash("sha256").update(stableStringify(x)).digest("hex");
export const normalizeOptionalTaskIds = (xs: readonly unknown[] | null | undefined): number[] => [...new Set((xs ?? []).map((x:any)=> (typeof x === "string" && x.trim() === "") ? NaN : Number(x)).filter((n)=>Number.isInteger(n)&&n>0))].sort((a,b)=>a-b);
const uniq = normalizeOptionalTaskIds;
export interface InitialConstructionRepairCandidateProfile { readonly blockedAnchorTaskId: number; readonly temporalCandidateFingerprint: string; readonly windowIndex: number; readonly candidateRank: number; readonly startPlanned: string; readonly endPlanned: string; readonly sourceKinds: readonly string[]; readonly frontierSourceTaskIds: readonly number[]; readonly dependencyBoundSourceTaskIds: readonly number[]; readonly reasonCodes: readonly string[]; readonly taskWindowConflictDetails: readonly any[]; readonly contestantConflictTaskIds: readonly number[]; readonly spaceConflictTaskIds: readonly number[]; readonly resourceConflictTaskIds: readonly number[]; readonly dependencyLowerBoundTaskIds: readonly number[]; readonly dependencyUpperBoundTaskIds: readonly number[]; readonly protectedIntervalConflictIds: readonly string[]; readonly directCausalTaskIds: readonly number[]; readonly repairableConflictTaskIds: readonly number[]; readonly immutableConflictTaskIds: readonly number[]; readonly staticUnrepairableReasonCodes: readonly string[]; readonly repairableReasonCodes: readonly string[]; readonly allHardBlockersRepairable: boolean; readonly uncoveredBlockerReasonCodes: readonly string[]; readonly uncoveredBlockerTaskIds: readonly number[]; readonly repairable: boolean; readonly evidenceComplete: boolean; readonly fingerprint: string; readonly readOnly: true }

export interface InitialConstructionRepairEjectionSet { readonly ejectedTaskIds: readonly number[]; readonly repairDependencyClosureTaskIds: readonly number[]; readonly repairNeighborhoodTaskIds: readonly number[]; readonly repairNeighborhoodTopologicalTaskIds: readonly number[]; readonly repairNeighborhoodDependencyFingerprint: string; readonly candidateProfileFingerprint?: string | null; readonly causalTemporalCandidateFingerprint?: string | null; readonly frontierSourceTaskIds?: readonly number[]; ejectionReasonByTaskId?: Readonly<Record<string,string[]>>; readonly coveredBlockerTaskIds?: readonly number[]; readonly uncoveredBlockerTaskIds?: readonly number[]; readonly coveredReasonCodes?: readonly string[]; readonly uncoveredReasonCodes?: readonly string[]; readonly allKnownCandidateBlockersCovered?: boolean; readonly executable?: boolean; readonly rejectionReason?: string | null; readonly combinatorialExpansionUsed?: false; readonly fingerprint: string; readonly readOnly: true }
export interface InitialConstructionRepairProblem {
  readonly residualFingerprint: string; readonly blockedAnchorTaskId: number; readonly blockedAnchorRank: number | null; readonly blockedAnchorClosureTaskIds: readonly number[];
  readonly directConflictTaskIds: readonly number[]; readonly dependencyConflictTaskIds: readonly number[]; readonly repairCandidateProfiles: readonly InitialConstructionRepairCandidateProfile[]; readonly repairCandidateProfileCount: number; readonly repairableCandidateProfileCount: number; readonly unrepairableCandidateProfileCount: number; readonly candidateProfilesWithDependencyBoundBlockers: number; readonly repairCandidateProfilesFingerprint: string; readonly combinatorialExpansionUsed: false; readonly candidateEjectionSets: readonly InitialConstructionRepairEjectionSet[];
  readonly protectedTaskIds: readonly number[]; readonly immutableTaskIds: readonly number[]; readonly repairableConflictTaskIds: readonly number[]; readonly immutableConflictTaskIds: readonly number[]; readonly maximumEjectionDepth: number; readonly fingerprint: string; readonly readOnly: true;
}

export function resolveInitialConstructionImmutableTaskIds(args: { input: EngineInput; originOperationalState: OperationalState; protectedTaskIds?: readonly number[] }): number[] {
  const out = new Set<number>(args.protectedTaskIds ?? []);
  for (const t of args.input.tasks ?? []) if (["done", "in_progress"].includes(String((t as any).status))) out.add(Number((t as any).id));
  for (const l of (args.input as any).locks ?? []) out.add(Number(l.taskId ?? l.task_id ?? l.id));
  for (const p of args.originOperationalState.planning ?? []) out.add(Number((p as any).taskId));
  return uniq([...out]);
}

export function repairDependencyClosure(args: { input: EngineInput; seedTaskIds: readonly number[]; provisionalAssignmentTaskIds: readonly number[]; canonicalContext?: InitialConstructionCanonicalContext | null }): number[] {
  const graph = resolveInitialConstructionCanonicalContext({ input: args.input, canonicalContext: args.canonicalContext });
  const provisional = new Set(args.provisionalAssignmentTaskIds.map(Number));
  const closure = new Set(args.seedTaskIds.map(Number).filter((id)=>provisional.has(id)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const taskId of [...closure]) {
      for (const dependent of graph.dependentsByTaskId.get(taskId) ?? []) {
        if (provisional.has(dependent) && !closure.has(dependent)) { closure.add(dependent); changed = true; }
      }
    }
  }
  return graph.topologicalTaskIds.filter((id) => closure.has(id));
}

export function profileFromAnchorPlacementEvidence(args:{ blockedAnchorTaskId:number; evidence:any; provisionalTaskIds: readonly number[]; immutableTaskIds: readonly number[] }): InitialConstructionRepairCandidateProfile {
  const ev=args.evidence??{}; const causal=ev.causalConflictEvidence??{}; const provisional=new Set(normalizeOptionalTaskIds(args.provisionalTaskIds as any)); const immutable=new Set(normalizeOptionalTaskIds(args.immutableTaskIds as any));
  const frontierSources=Array.isArray(ev.frontierSources)?ev.frontierSources:[];
  const depSourceIds=normalizeOptionalTaskIds([...(ev.dependencyBoundSourceTaskIds??[]),...frontierSources.filter((s:any)=>s?.kind==="assigned-prerequisite-end"||s?.kind==="assigned-dependent-start").flatMap((s:any)=>[s.taskId,...(s.taskIds??[]),...(s.sourceTaskIds??[])])]).filter(id=>provisional.has(id));
  const contestant=normalizeOptionalTaskIds(causal.contestantConflictTaskIds).filter(id=>provisional.has(id));
  const space=normalizeOptionalTaskIds(causal.spaceConflictTaskIds).filter(id=>provisional.has(id));
  const resource=normalizeOptionalTaskIds(causal.resourceConflictTaskIds).filter(id=>provisional.has(id));
  const lower=normalizeOptionalTaskIds(causal.dependencyLowerBoundTaskIds).filter(id=>provisional.has(id));
  const upper=normalizeOptionalTaskIds(causal.dependencyUpperBoundTaskIds).filter(id=>provisional.has(id));
  const detailIds=normalizeOptionalTaskIds((causal.taskWindowConflictDetails??[]).flatMap((d:any)=>[d.taskId,...(d.conflictTaskIds??[]),...(d.dependencyBoundSourceTaskIds??[])])).filter(id=>provisional.has(id));
  const direct=normalizeOptionalTaskIds([...(causal.causalConflictTaskIds??[]),...contestant,...space,...resource,...lower,...upper,...detailIds,...depSourceIds]).filter(id=>id!==Number(args.blockedAnchorTaskId));
  const repairableIds=direct.filter(id=>!immutable.has(id)); const immutableIds=direct.filter(id=>immutable.has(id));
  const reasons=[...(ev.reasonCodes??[]),...(causal.reasonCodes??[])].map(String).sort();
  const repairableReasonCodes=[...(contestant.length?["CONTESTANT_OVERLAP"]:[]),...(space.length?["SPACE_OVERLAP"]:[]),...(resource.length?["RESOURCE_OVERLAP"]:[]),...(lower.length?["DEPENDENCY_LOWER_BOUND"]:[]),...(upper.length?["DEPENDENCY_UPPER_BOUND"]:[]),...(depSourceIds.length?["DEPENDENCY_BOUND_FRONTIER"]:[])].sort();
  const staticHints=["WORKDAY","AVAILABILITY","FIXED_WINDOW","DURATION","PROTECTED_INTERVAL","DONE","IN_PROGRESS","LOCK","OPERATIONAL_STATE_PLANNING","NO_STRUCTURAL_TASK_ID"];
  const staticUnrepairableReasonCodes=normalizeOptionalTaskIds(direct).length===0?reasons:reasons.filter(r=>staticHints.some(h=>r.toUpperCase().includes(h)) && !(depSourceIds.length && r.toUpperCase().includes("WORKDAY")));
  const uncoveredBlockerTaskIds=immutableIds; const uncoveredBlockerReasonCodes=[...staticUnrepairableReasonCodes,...(immutableIds.length?["IMMUTABLE_BLOCKER"]:[])].sort();
  const allHardBlockersRepairable=direct.length>0 && repairableIds.length===direct.length && staticUnrepairableReasonCodes.length===0;
  const base:any={blockedAnchorTaskId:Number(args.blockedAnchorTaskId),temporalCandidateFingerprint:String(ev.temporalCandidateFingerprint??ev.fingerprint??hash({s:ev.startPlanned,e:ev.endPlanned,w:ev.windowIndex,r:ev.candidateRankWithinWindow})),windowIndex:Number(ev.windowIndex??0),candidateRank:Number(ev.candidateRankWithinWindow??ev.candidateRank??0),startPlanned:String(ev.startPlanned??""),endPlanned:String(ev.endPlanned??""),sourceKinds:[...(ev.sourceKinds??[]),...frontierSources.map((s:any)=>String(s.kind??""))].filter(Boolean).sort(),frontierSourceTaskIds:normalizeOptionalTaskIds([...(ev.frontierSourceTaskIds??[]),...frontierSources.flatMap((s:any)=>[s.taskId,...(s.taskIds??[]),...(s.sourceTaskIds??[])])]),dependencyBoundSourceTaskIds:depSourceIds,reasonCodes:reasons,taskWindowConflictDetails:causal.taskWindowConflictDetails??[],contestantConflictTaskIds:contestant,spaceConflictTaskIds:space,resourceConflictTaskIds:resource,dependencyLowerBoundTaskIds:lower,dependencyUpperBoundTaskIds:upper,protectedIntervalConflictIds:[...(causal.protectedIntervalConflictIds??[])].map(String).sort(),directCausalTaskIds:direct,repairableConflictTaskIds:repairableIds,immutableConflictTaskIds:immutableIds,staticUnrepairableReasonCodes,repairableReasonCodes,allHardBlockersRepairable,uncoveredBlockerReasonCodes,uncoveredBlockerTaskIds,repairable:allHardBlockersRepairable,evidenceComplete:causal.evidenceComplete!==false,fingerprint:"",readOnly:true};
  base.fingerprint=hash({...base,fingerprint:undefined}); return deepFreeze(base) as any;
}

export function buildInitialConstructionRepairProblem(args: { input: EngineInput; originOperationalState: OperationalState; residualFingerprint: string; blockedAnchorTaskId: number; blockedAnchorRank?: number | null; blockedAnchorClosureTaskIds?: readonly number[]; terminalEvidence?: any; repairCandidateProfiles?: readonly InitialConstructionRepairCandidateProfile[]; provisionalAssignments: readonly CandidateAssignment[]; protectedTaskIds?: readonly number[]; maxEjectedAssignments?: number; maxRepairNeighborhoodTasks?: number; canonicalContext?: InitialConstructionCanonicalContext | null }): InitialConstructionRepairProblem {
  const canonicalContext = resolveInitialConstructionCanonicalContext({ input: args.input, canonicalContext: args.canonicalContext });
  const maxDepth = args.maxEjectedAssignments ?? 4; const maxNeighborhood = args.maxRepairNeighborhoodTasks ?? 12;
  const provisionalIds = uniq(args.provisionalAssignments.map(a=>Number(a.taskId))); const immutable = resolveInitialConstructionImmutableTaskIds(args); const immutableSet = new Set(immutable);
  const ev = args.terminalEvidence ?? {}; const details = Array.isArray(ev.taskWindowConflictDetails) ? ev.taskWindowConflictDetails : [];
  const direct = uniq([...(ev.causalConflictTaskIds ?? []), ...(ev.contestantConflictTaskIds ?? []), ...(ev.spaceConflictTaskIds ?? []), ...(ev.resourceConflictTaskIds ?? []), ...(ev.dependencyBoundSourceTaskIds ?? []), ...details.flatMap((d:any)=>[...(d.conflictTaskIds ?? []), ...(d.dependencyBoundSourceTaskIds ?? []), d.taskId].filter((id:any)=>Number(id)!==Number(args.blockedAnchorTaskId)))]).filter((id)=>provisionalIds.includes(Number(id)) && !immutableSet.has(Number(id)));
  const dep = uniq([...(ev.dependencyLowerBoundTaskIds ?? []), ...(ev.dependencyUpperBoundTaskIds ?? []), ...(ev.dependencyBoundSourceTaskIds ?? [])]).filter((id)=>provisionalIds.includes(id) && !immutableSet.has(id));
  const immutableConflicts = uniq([...(ev.causalConflictTaskIds ?? []), ...(ev.contestantConflictTaskIds ?? []), ...(ev.spaceConflictTaskIds ?? []), ...(ev.resourceConflictTaskIds ?? []), ...(ev.dependencyLowerBoundTaskIds ?? []), ...(ev.dependencyUpperBoundTaskIds ?? [])].map(Number).filter((id)=>provisionalIds.includes(id) && immutableSet.has(id)));
  const fallbackProfile = profileFromAnchorPlacementEvidence({blockedAnchorTaskId:Number(args.blockedAnchorTaskId), evidence:{...ev,temporalCandidateFingerprint:hash({anchor:args.blockedAnchorTaskId,ev}),causalConflictEvidence:{...ev,causalConflictTaskIds:[...direct,...dep,...immutableConflicts],evidenceComplete:ev.causalConflictEvidenceComplete!==false}}, provisionalTaskIds:provisionalIds, immutableTaskIds:immutable});
  const sessionRequiresProfiles = ev.requireCandidateScopedProfiles===true;
  const profiles = [...(args.repairCandidateProfiles?.length ? args.repairCandidateProfiles : (sessionRequiresProfiles ? [] : [fallbackProfile]))].sort((a,b)=>a.candidateRank-b.candidateRank||a.fingerprint.localeCompare(b.fingerprint));
  const candidateEjectionSets: InitialConstructionRepairEjectionSet[] = []; const seen=new Set<string>();
  for (const profile of profiles) {
    if (!profile.repairable || !profile.allHardBlockersRepairable) continue;
    const seed=uniq(profile.repairableConflictTaskIds.map(Number).filter((id)=>provisionalIds.includes(id)&&!immutableSet.has(id)));
    if (!seed.length) continue;
    if (seed.length>maxDepth) continue;
    const closure = repairDependencyClosure({ input: args.input, seedTaskIds: seed, provisionalAssignmentTaskIds: provisionalIds, canonicalContext });
    const neighborhood = uniq([Number(args.blockedAnchorTaskId), ...(args.blockedAnchorClosureTaskIds ?? []), ...closure]);
    if (closure.length === 0 || neighborhood.length > maxNeighborhood || closure.some((id)=>immutableSet.has(id))) continue;
    const neighborhoodTopo = canonicalContext.topologicalTaskIds.filter((id) => neighborhood.includes(id));
    const depFp = hash({ edges: (canonicalContext.dependencyGraph.edges ?? []).filter((e:any) => neighborhood.includes(e.fromTaskId) && neighborhood.includes(e.toTaskId)) });
    const key=stableStringify({anchor:args.blockedAnchorTaskId,closure,profile:profile.temporalCandidateFingerprint}); if(seen.has(key)) continue; seen.add(key);
    const ejectionReasonByTaskId: Readonly<Record<string,string[]>> = Object.fromEntries(seed.map((id) => [String(id), profile.reasonCodes.length ? [...profile.reasonCodes] : ["CAUSAL_CANDIDATE_BLOCKER"]]));
    const fingerprint = hash({ seed, closure, neighborhoodTopo, depFp, profile: profile.fingerprint });
    candidateEjectionSets.push({ ejectedTaskIds: seed, repairDependencyClosureTaskIds: closure, repairNeighborhoodTaskIds: neighborhood, repairNeighborhoodTopologicalTaskIds: neighborhoodTopo, repairNeighborhoodDependencyFingerprint: depFp, candidateProfileFingerprint: profile.fingerprint, causalTemporalCandidateFingerprint: profile.temporalCandidateFingerprint, frontierSourceTaskIds: profile.frontierSourceTaskIds, ejectionReasonByTaskId, coveredBlockerTaskIds: seed, uncoveredBlockerTaskIds: profile.uncoveredBlockerTaskIds, coveredReasonCodes: profile.repairableReasonCodes, uncoveredReasonCodes: profile.uncoveredBlockerReasonCodes, allKnownCandidateBlockersCovered: profile.uncoveredBlockerTaskIds.length===0 && profile.uncoveredBlockerReasonCodes.length===0, executable: profile.uncoveredBlockerTaskIds.length===0 && profile.uncoveredBlockerReasonCodes.length===0, rejectionReason: null, combinatorialExpansionUsed:false, fingerprint, readOnly: true });
  }
  candidateEjectionSets.sort((a,b)=>a.ejectedTaskIds.length-b.ejectedTaskIds.length||a.repairDependencyClosureTaskIds.length-b.repairDependencyClosureTaskIds.length||String(a.causalTemporalCandidateFingerprint).localeCompare(String(b.causalTemporalCandidateFingerprint))||a.fingerprint.localeCompare(b.fingerprint));
  const related=uniq([...direct,...dep,...profiles.flatMap(p=>p.repairableConflictTaskIds as number[])]);
  const profilesFp=hash(profiles.map(p=>p.fingerprint)); const payload = { residualFingerprint: args.residualFingerprint, blockedAnchorTaskId: Number(args.blockedAnchorTaskId), profiles: profiles.map(p=>p.fingerprint), sets: candidateEjectionSets.map(s=>({e:s.ejectedTaskIds,c:s.repairDependencyClosureTaskIds,p:s.candidateProfileFingerprint})) };
  return deepFreeze({ residualFingerprint: args.residualFingerprint, blockedAnchorTaskId: Number(args.blockedAnchorTaskId), blockedAnchorRank: args.blockedAnchorRank ?? null, blockedAnchorClosureTaskIds: uniq(args.blockedAnchorClosureTaskIds ?? [Number(args.blockedAnchorTaskId)]), directConflictTaskIds: direct, dependencyConflictTaskIds: dep, repairCandidateProfiles: profiles, repairCandidateProfileCount: profiles.length, repairableCandidateProfileCount: profiles.filter(p=>p.repairable).length, unrepairableCandidateProfileCount: profiles.filter(p=>!p.repairable).length, candidateProfilesWithDependencyBoundBlockers: profiles.filter(p=>p.dependencyBoundSourceTaskIds.length>0).length, repairCandidateProfilesFingerprint: profilesFp, combinatorialExpansionUsed:false, candidateEjectionSets, protectedTaskIds: uniq(args.protectedTaskIds ?? []), immutableTaskIds: immutable, repairableConflictTaskIds: related, immutableConflictTaskIds: immutableConflicts, maximumEjectionDepth: maxDepth, fingerprint: hash(payload), readOnly: true });
}
