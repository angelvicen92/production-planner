import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { executePlannerNext } from "../executePlannerNext";
import { adaptEngineInputToPlannerNextProblem } from "../integration/engineInputAdapter";
import { preflightEngineInputForPlannerNext } from "../integration/engineInputPreflight";
import { buildCanonicalFullA2EngineInput } from "./canonicalFullA2EngineInput";

const PLAN_ID = 27001;
const EVIDENCE_PATH = "docs/evidence/A2-FULL-EXEC-001-first-execution.json";
const branchBudgetOverride = process.env.PLANNER_NEXT_FULL_A2_BRANCH_BUDGET;
const branchBudget = branchBudgetOverride === undefined ? 300_000 : Number(branchBudgetOverride);
if (!Number.isSafeInteger(branchBudget) || branchBudget <= 0)
  throw new Error("INVALID_PLANNER_NEXT_FULL_A2_BRANCH_BUDGET");

function writeStable(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

const { input, expansion, validation, config, itinerantUnitId } = buildCanonicalFullA2EngineInput({
  planId: PLAN_ID,
  branchBudget,
});

const preflight = preflightEngineInputForPlannerNext(input);
const adapted = adaptEngineInputToPlannerNextProblem(input);
const execution = adapted.status === "SUPPORTED" ? executePlannerNext(adapted.problem,{causalDiagnostic:true}) : null;
const exactResult = execution?.kind === "EXACT_CONSTRUCTIVE" ? execution.result : null;
const scheduledCanonicalObligations = exactResult
  ? exactResult.scheduledTasks.length + exactResult.scheduledParticipantMeals.length
  : 0;
const publishedCanonicalObligations = exactResult?.complete ? scheduledCanonicalObligations : 0;
const projectedItinerantAvailability = adapted.status === "SUPPORTED"
  ? adapted.problem.itinerantUnits ?? []
  : [];
const itineraryAvailabilityProjected = expansion.itinerantUnits.every((unit) => {
  const source = config.itinerantUnitAvailability[unit.id as keyof typeof config.itinerantUnitAvailability];
  const projected = projectedItinerantAvailability.find((entry) => entry.id === `itinerant-team:${itinerantUnitId.get(unit.id)}`);
  return Boolean(source && projected?.availability.some((window) => window.start === Number(source.start.slice(0, 2)) * 60 + Number(source.start.slice(3)) && window.end === Number(source.end.slice(0, 2)) * 60 + Number(source.end.slice(3))));
});

const diagnostic = exactResult?.evidence.causalDiagnostic ?? null;
const criticalDepth = exactResult?.evidence.coreMaximumDepth ?? null;
const criticalRejections = diagnostic?.feederRejections.filter((row) => row.depth === criticalDepth).map(row=>({...row,causalCount:row.count,reason:row.firstRejectionReason})) ?? [];
const criticalEliminations = diagnostic?.feederCoachDomainEliminations.filter((row) => row.depth === criticalDepth).map(row=>({...row,causalCount:row.startsEliminated})) ?? [];
const criticalCauses=[...criticalRejections,...criticalEliminations];
const top = (key: (row: typeof criticalCauses[number]) => string | null) => Object.entries(criticalCauses.reduce<Record<string,number>>((counts,row)=>{const value=key(row);if(value)counts[value]=(counts[value]??0)+row.causalCount;return counts;},{})).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,10).map(([id,count])=>({id,count}));
const criticalRejectionCount = criticalCauses.reduce((sum, row) => sum + row.causalCount, 0);
const leadingBlocker = top((row) => row.blockingPlacedTaskId)[0] ?? null;
const recommendation = leadingBlocker && criticalRejectionCount > 0
  ? `Next PR: run one feeder-aware core-ordering experiment around blocker ${leadingBlocker.id}, which accounts for ${new Intl.NumberFormat("en-US").format(leadingBlocker.count)} of ${new Intl.NumberFormat("en-US").format(criticalRejectionCount)} (${(leadingBlocker.count / criticalRejectionCount * 100).toFixed(1)}%) depth-${criticalDepth} feeder rejections, while preserving every hard constraint and the ${new Intl.NumberFormat("en-US").format(exactResult!.evidence.branchesExplored)}-branch budget.`
  : null;
const diagnosticReport = diagnostic ? {
  waterfallByDepth: diagnostic.waterfallByDepth,
  waterfallReconciles: Object.values(diagnostic.waterfallByDepth).reduce((sum,row)=>sum+row.total,0) === exactResult!.evidence.branchesExplored,
  feederByDepth: diagnostic.feederByDepth,
  futureFeasibility: diagnostic.futureFeasibility,
  criticalDepth,
  criticalRejectionReasons: top((row)=>row.reason),
  topMainTasks: top((row)=>row.mainTaskId),
  topFeederTasks: top((row)=>row.feederTaskId),
  topBlockingPlacedTasks: top((row)=>row.blockingPlacedTaskId),
  topFeederBlockerPairs: top((row)=>row.blockingPlacedTaskId?`${row.feederTaskId} + ${row.blockingPlacedTaskId}`:null),
  criticalRejectionCount,
  recommendation,
} : null;

const evidence = {
  evidenceId: "A2-FULL-EXEC-001-first-execution",
  canonicalObligationCount: expansion.tasks.length,
  canonicalValidationStatus: validation.status,
  engineInput: {
    taskCount: input.tasks.length,
    participantCount: expansion.participants.length,
    sourceHumanTimesUsed: false,
    searchBudgetIsTechnicalExecutionConfiguration: true,
    maxBranchExpansions: branchBudget,
    genericTransitionMinutes: { participant: 0, resource: 0 },
    operationalMealProjection: operationalMealGroups,
    itineraryAvailabilityProjected,
    ...(!itineraryAvailabilityProjected ? { itineraryAvailabilityGap: "Not every referenced itinerant unit has its source availability represented losslessly in Planner Next." } : {}),
  },
  preflight: {
    status: preflight.status,
    reasonCodes: preflight.reasonCodes,
    issues: preflight.issues.map(({ code, entityKind, entityId, path, message, details }) => ({ code, entityKind, entityId, path, message, details })),
  },
  adapter: {
    status: adapted.status,
    reasonCodes: adapted.reasonCodes,
    issues: adapted.issues.map(({ code, entityKind, entityId, path, message, details }) => ({ code, entityKind, entityId, path, message, details })),
    problemFingerprint: adapted.problemFingerprint,
  },
  execution: execution ? {
    kind: execution.kind,
    reasonCodes: execution.reasonCodes,
    status: exactResult?.status ?? null,
    complete: exactResult?.complete ?? false,
    scheduledTaskCount: exactResult?.scheduledTasks.length ?? 0,
    scheduledParticipantMealCount: exactResult?.scheduledParticipantMeals.length ?? 0,
    scheduledOperationalMealCount: exactResult?.scheduledOperationalMeals.length ?? 0,
    remainingTaskIds: exactResult?.remainingTaskIds ?? [],
    evidence: exactResult?.evidence ?? null,
    diagnosticReport,
  } : null,
  result: {
    publishedCanonicalObligations,
    diagnosticScheduledCanonicalObligations: scheduledCanonicalObligations,
    targetCanonicalObligations: expansion.tasks.length,
    fullHardValidEligible: Boolean(exactResult?.complete && publishedCanonicalObligations === expansion.tasks.length && itineraryAvailabilityProjected),
  },
};

writeStable(EVIDENCE_PATH, evidence);
console.log(JSON.stringify(evidence));
