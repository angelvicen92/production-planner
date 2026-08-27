import { performance } from "node:perf_hooks";
import type { PlannerNextProblem,Task,TransportGroupingPolicy } from "../contracts";
import { emptyTransportGroupingExplorerEvidence,exploreTransportGroups,type TransportGroupingExplorerMode } from "../transportGrouping";

const count=14,window=[{start:0,end:600}],tasks:Task[]=Array.from({length:count},(_,index)=>({
  id:`arrival-${String(index).padStart(2,"0")}`,kind:"auxiliary",participantId:`p-${index}`,duration:10,
  spaceId:`s-${index}`,dependencies:[],availability:index<7?[{start:0,end:60}]:[{start:300,end:360}],
}));
const problem={day:{start:0,end:600},participants:tasks.map((_,i)=>({id:`p-${i}`,availability:window})),
  spaces:tasks.map((_,i)=>({id:`s-${i}`,availability:window})),resources:[],coaches:[],tasks,
  participantTransitionMinutes:0,resourceTransitionMinutes:0,budget:{bestK:1,maxBacktracks:1,maxPatterns:1,maxBranchExpansions:1},
  auxiliaryPolicy:{participantPresencePreference:"OFF"},searchPolicy:"EXACT_CONSTRUCTIVE"} as PlannerNextProblem;
const policy:TransportGroupingPolicy={taskIds:tasks.map(x=>x.id),minimumGroupSize:7,maximumGroupSize:7,minGapMinutes:0,groupingWeight:1};
function run(mode:TransportGroupingExplorerMode){const evidence=emptyTransportGroupingExplorerEvidence(),rows:string[]=[];let branches=0;const before=performance.now();
  exploreTransportGroups(problem,tasks,[],[],policy,()=>{branches+=1;return true;},evidence,(group,start)=>{rows.push(`${group.map(x=>x.id).join(",")}@${start}`);return "CONTINUE";},mode);
  return {runtimeMs:performance.now()-before,branches,groupsAndStarts:rows,evidence};}
const legacy=run("LEGACY_COMBINATIONS_FULL_GRID"),lazy=run("EXACT_LAZY_ANALYTIC");
process.stdout.write(JSON.stringify({version:"transport-grouping-explorer-v1",identicalGroupsAndStarts:JSON.stringify(legacy.groupsAndStarts)===JSON.stringify(lazy.groupsAndStarts),
  legacyCombinationsMaterialized:legacy.evidence.transportGroupMembershipCandidatesEvaluated,
  lazyPartialsExpanded:lazy.evidence.transportGroupMembershipPartialsExpanded,
  lazyDomainPrunes:lazy.evidence.transportGroupMembershipDomainPrunes,
  fullGridStartsLogical:lazy.evidence.transportGroupFullGridStarts,startsActuallyEvaluated:lazy.evidence.transportGroupStartsEvaluated,
  legacyRuntimeMs:legacy.runtimeMs,lazyRuntimeMs:lazy.runtimeMs},null,2)+"\n");
