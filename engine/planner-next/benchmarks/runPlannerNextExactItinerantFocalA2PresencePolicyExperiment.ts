import assert from "node:assert/strict";
import type { PlannerNextProblem, PreferenceLevel, ScheduledTask } from "../contracts";
import { constructExactItinerantPlan, type ExactItinerantPlanResult } from "../exactItinerantPlan";
import { evaluateParticipantItineraryQuality, type ParticipantItineraryQualityEvaluation } from "../participantItineraryQuality";
import { validatePlan } from "../validate";
import { focalA2RealityAuxiliaryPolicy } from "./focal-a2/focalA2RealityOperationalConfiguration";
import { itinerantOperationProfiles, projectCombinedFocalA2ItinerantProblem } from "./focal-a2/focalA2RealityReference";

const POLICIES: PreferenceLevel[] = ["OFF", "LOW", "MEDIUM", "HIGH", "MAXIMUM"];
const OFF = { branches: 85_557, core: "0948b758c96f17ec546c331ce6d8b42464dbdbe95970d0640ae5fbea95fdbae9",
  full: "825314fa954d2511c5cef2bcd2d6f988efe560131c6039dc99d4ba4c80b662b4",
  quality: "39163b08d0f377ddd1bbc5bcb5ad1332d9f0c18b699643e0453cdddf547fda12" } as const;

const stable = (value: unknown) => JSON.stringify(value);
function createProblem(policy: PreferenceLevel, reversed = false): PlannerNextProblem {
  const problem = projectCombinedFocalA2ItinerantProblem(reversed ? [...itinerantOperationProfiles].reverse() : itinerantOperationProfiles);
  problem.searchPolicy = "EXACT_CONSTRUCTIVE";
  problem.auxiliaryPolicy = { ...problem.auxiliaryPolicy, participantPresencePreference: policy };
  if (reversed) {
    problem.tasks.reverse(); problem.participants.reverse(); problem.spaces.reverse(); problem.resources.reverse(); problem.coaches.reverse();
    problem.anchoredAccompaniments?.reverse();
    for (const item of [...problem.participants, ...problem.coaches, ...problem.spaces, ...problem.resources]) item.availability.reverse();
    for (const task of problem.tasks) task.availability?.reverse();
  }
  return problem;
}

function productiveMinutes(problem: PlannerNextProblem, tasks: ScheduledTask[]): number {
  const byId = new Map(tasks.map(task => [task.id, task]));
  return itinerantOperationProfiles.reduce((sum, profile) => {
    if (profile.type === "STANDALONE") return sum + (byId.get(profile.id)?.duration ?? 0);
    const contract = problem.anchoredAccompaniments?.find(item => item.id === profile.id);
    const members = contract ? [...contract.beforeTaskIds, contract.anchorTaskId, ...contract.afterTaskIds].map(id => byId.get(id)) : [];
    return sum + (members.every(Boolean) ? (members as ScheduledTask[]).reduce((minutes, task) => minutes + task.duration, 0) : 0);
  }, 0);
}

function run(policy: PreferenceLevel, reversed = false) {
  const problem = createProblem(policy, reversed), before = stable(problem);
  assert.equal(problem.searchPolicy, "EXACT_CONSTRUCTIVE");
  assert.equal(problem.auxiliaryPolicy?.participantPresencePreference, policy);
  const plan = constructExactItinerantPlan(problem);
  const inputUnchanged = stable(problem) === before;
  const hardValid = plan.complete && validatePlan(problem, plan.scheduledTasks, [], plan.scheduledSpaceMeals).hardValid;
  const quality = plan.complete ? evaluateParticipantItineraryQuality(problem, plan.scheduledTasks) : null;
  return { problem, plan, inputUnchanged, hardValid, quality };
}

const gapKey = (participantId: string, gap: { beforeTaskId: string; afterTaskId: string; duration: number }) =>
  `${participantId}:${gap.beforeTaskId}->${gap.afterTaskId}:${gap.duration}`;
function deltas(current: ParticipantItineraryQualityEvaluation | null, baseline: ParticipantItineraryQualityEvaluation,
  plan: ExactItinerantPlanResult, baselinePlan: ExactItinerantPlanResult) {
  if (!current) return null;
  const a = current.summary, b = baseline.summary, baselineById = new Map(baseline.participants.map(item => [item.participantId, item]));
  const changes = current.participants.map(item => ({ participantId: item.participantId,
    idleDelta: item.idleMinutes - baselineById.get(item.participantId)!.idleMinutes,
    presenceDelta: item.presenceSpanMinutes - baselineById.get(item.participantId)!.presenceSpanMinutes }));
  const oldGaps = new Set(baseline.participants.flatMap(item => item.gaps.map(gap => gapKey(item.participantId, gap))));
  const newGaps = new Set(current.participants.flatMap(item => item.gaps.map(gap => gapKey(item.participantId, gap))));
  return { presenceSpanDelta: a.totalPresenceSpanMinutes - b.totalPresenceSpanMinutes, idleMinutesDelta: a.totalIdleMinutes - b.totalIdleMinutes,
    overallIdleRatioDelta: a.overallIdleRatio - b.overallIdleRatio,
    maximumParticipantIdleDelta: a.maximumParticipantIdleMinutes - b.maximumParticipantIdleMinutes,
    maximumSingleGapDelta: a.maximumSingleGapMinutes - b.maximumSingleGapMinutes, totalGapCountDelta: a.totalGapCount - b.totalGapCount,
    spaceChangeCountDelta: a.totalSpaceChangeCount - b.totalSpaceChangeCount,
    branchesDelta: plan.evidence.branchesExplored - baselinePlan.evidence.branchesExplored,
    coreBranchesDelta: plan.evidence.coreBranches - baselinePlan.evidence.coreBranches,
    standaloneBranchesDelta: plan.evidence.standaloneBranches - baselinePlan.evidence.standaloneBranches,
    improvedParticipants: changes.filter(x => x.idleDelta < 0).sort((x, y) => x.idleDelta - y.idleDelta || x.participantId.localeCompare(y.participantId)),
    worsenedParticipants: changes.filter(x => x.idleDelta > 0).sort((x, y) => y.idleDelta - x.idleDelta || x.participantId.localeCompare(y.participantId)),
    unchangedParticipants: changes.filter(x => x.idleDelta === 0).map(x => x.participantId).sort(),
    removedGaps: [...oldGaps].filter(gap => !newGaps.has(gap)).sort(), newGaps: [...newGaps].filter(gap => !oldGaps.has(gap)).sort(),
    operationalFingerprintChanged: plan.evidence.fullFingerprint !== baselinePlan.evidence.fullFingerprint,
    qualityFingerprintChanged: a.qualityFingerprint !== b.qualityFingerprint };
}

function operational(runResult: ReturnType<typeof run>) {
  const { problem, plan, hardValid } = runResult, standaloneIds = new Set(itinerantOperationProfiles.filter(x => x.type === "STANDALONE").map(x => x.id));
  return { status: plan.status, complete: plan.complete, hardValid, taskCount: plan.scheduledTasks.length, remainingTaskCount: plan.remainingTaskIds.length,
    mainTaskCount: plan.scheduledTasks.filter(x => x.kind === "main").length, vocalTaskCount: plan.scheduledTasks.filter(x => x.kind === "vocal").length,
    standaloneTaskCount: plan.scheduledTasks.filter(x => standaloneIds.has(x.id)).length,
    anchoredSegmentCount: plan.scheduledTasks.filter(x => x.kind === "auxiliary" && !standaloneIds.has(x.id)).length,
    itinerantOperationCount: plan.complete ? itinerantOperationProfiles.length : 0,
    itinerantProductiveMinutes: plan.complete ? productiveMinutes(problem, plan.scheduledTasks) : 0,
    branchesExplored: plan.evidence.branchesExplored, coreBranches: plan.evidence.coreBranches, standaloneBranches: plan.evidence.standaloneBranches,
    standaloneForwardBranches: plan.evidence.standaloneForwardBranches, standaloneLeafSearchBranches: plan.evidence.standaloneLeafSearchBranches,
    coreBacktracks: plan.evidence.coreBacktracks, standaloneBacktracks: plan.evidence.standaloneBacktracks,
    selectedCoreFingerprint: plan.evidence.selectedCoreFingerprint, fullFingerprint: plan.evidence.fullFingerprint,
    reasonCodes: plan.evidence.reasonCodes, lastExhaustionPhase: plan.evidence.lastExhaustionPhase };
}

const policyRuns = POLICIES.map(policy => {
  const first = run(policy), second = run(policy), reversed = run(policy, true);
  const deterministic = stable(first.plan) === stable(second.plan) && stable(first.quality) === stable(second.quality);
  const orderInvariant = stable(first.plan) === stable(reversed.plan) && stable(first.quality) === stable(reversed.quality);
  const inputUnchanged = first.inputUnchanged && second.inputUnchanged && reversed.inputUnchanged;
  const op = operational(first), quality = first.quality;
  const topGaps = quality?.participants.flatMap(item => item.gaps.map(gap => ({ participantId: item.participantId, ...gap })))
    .sort((a, b) => b.duration - a.duration || a.participantId.localeCompare(b.participantId) || a.start - b.start).slice(0, 10) ?? [];
  return { policy, operational: op, quality: quality ? { summary: quality.summary, participants: quality.participants,
    topFiveByIdle: quality.summary.participantIdsByIdleDescending.slice(0, 5), topFiveByPresence: quality.summary.participantIdsByPresenceDescending.slice(0, 5), topTenGaps: topGaps } : null,
    checks: { deterministic, orderInvariant, inputUnchanged, effectivePolicy: first.problem.auxiliaryPolicy?.participantPresencePreference,
      explicitSearchPolicy: first.problem.searchPolicy, atomicFailure: first.plan.complete || (first.plan.scheduledTasks.length === 0 && first.plan.scheduledSpaceMeals.length === 0) },
    _plan: first.plan, _quality: quality };
});

const baseline = policyRuns[0]!;
assert.equal(focalA2RealityAuxiliaryPolicy.participantPresencePreference, "OFF");
assert.deepEqual({ status: baseline.operational.status, tasks: baseline.operational.taskCount, remaining: baseline.operational.remainingTaskCount,
  operations: baseline.operational.itinerantOperationCount, minutes: baseline.operational.itinerantProductiveMinutes, hardValid: baseline.operational.hardValid,
  branches: baseline.operational.branchesExplored, core: baseline.operational.selectedCoreFingerprint, full: baseline.operational.fullFingerprint,
  quality: baseline._quality?.summary.qualityFingerprint, presence: baseline._quality?.summary.totalPresenceSpanMinutes,
  productive: baseline._quality?.summary.totalProductiveMinutes, idle: baseline._quality?.summary.totalIdleMinutes,
  maxIdle: baseline._quality?.summary.maximumParticipantIdleMinutes, maxGap: baseline._quality?.summary.maximumSingleGapMinutes,
  gaps: baseline._quality?.summary.totalGapCount }, { status: "COMPLETE", tasks: 53, remaining: 0, operations: 12, minutes: 375, hardValid: true,
  branches: OFF.branches, core: OFF.core, full: OFF.full, quality: OFF.quality, presence: 3565, productive: 900, idle: 2665, maxIdle: 380, maxGap: 225, gaps: 28 });

const publicRows = policyRuns.map(item => ({ ...item, deltaAgainstOff: item.policy === "OFF" ? null : deltas(item._quality, baseline._quality!, item._plan, baseline._plan) }));
const eligible = publicRows.filter(item => item.operational.status === "COMPLETE" && item.operational.taskCount === 53
  && item.operational.remainingTaskCount === 0 && item.operational.hardValid && item.operational.itinerantOperationCount === 12
  && item.operational.itinerantProductiveMinutes === 375 && item.checks.deterministic && item.checks.orderInvariant
  && item.checks.inputUnchanged && item.operational.branchesExplored <= 300_000 && item._quality);
eligible.sort((a, b) => a._quality!.summary.totalIdleMinutes - b._quality!.summary.totalIdleMinutes
  || a._quality!.summary.maximumParticipantIdleMinutes - b._quality!.summary.maximumParticipantIdleMinutes
  || a._quality!.summary.maximumSingleGapMinutes - b._quality!.summary.maximumSingleGapMinutes
  || a._quality!.summary.totalGapCount - b._quality!.summary.totalGapCount
  || a._quality!.summary.totalSpaceChangeCount - b._quality!.summary.totalSpaceChangeCount
  || a.operational.branchesExplored - b.operational.branchesExplored || a.policy.localeCompare(b.policy));
const classMap = new Map<string, PreferenceLevel[]>();
for (const item of publicRows) {
  const key = stable({ status: item.operational.status, plan: item.operational.fullFingerprint, quality: item._quality?.summary.qualityFingerprint ?? null,
    branches: item.operational.branchesExplored, evidence: item._quality?.summary ?? null });
  classMap.set(key, [...(classMap.get(key) ?? []), item.policy]);
}
const report = { iteration: "SPEC09-007", classification: "DB Safe Merge", searchPolicy: "EXACT_CONSTRUCTIVE",
  officialPolicyUnchanged: focalA2RealityAuxiliaryPolicy.participantPresencePreference === "OFF",
  deltaConvention: "Negative idle/gap deltas are improvements; positive deltas are regressions.",
  policies: publicRows.map(({ _plan: _p, _quality: _q, ...item }) => item), behaviorClasses: [...classMap.values()],
  eligiblePolicies: eligible.map(item => item.policy), experimentalWinner: eligible[0]?.policy ?? null,
  winnerScope: "Best first plan among the five existing configurations under the declared experimental comparator; not a global optimum." };
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
assert.ok(publicRows.every(item => item.checks.deterministic && item.checks.orderInvariant && item.checks.inputUnchanged));
