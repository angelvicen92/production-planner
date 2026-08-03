import type { EngineInput, TaskInput } from "../../types";

const task = (id: number, values: Partial<TaskInput>): TaskInput => ({
  id, planId: 701, templateId: 800 + id, status: "pending", durationOverrideMin: 30, ...values,
});

/** Synthetic contract fixture; labels are deliberately non-authoritative. */
export function createSupportedEngineInputAdapterFixture(): EngineInput {
  return {
    planId: 701,
    workDay: { start: "08:00", end: "18:00" },
    mealMode: "global_hard_break",
    meal: { start: "13:00", end: "14:00" },
    plannerNext: {
      searchPolicy: "EXACT_CONSTRUCTIVE",
      searchBudget: { bestK: 3, maxBacktracks: 40, maxPatterns: 50, maxBranchExpansions: 200 },
      timeGridMinutes: 5,
      participantTransitionMinutes: 10,
      resourceTransitionMinutes: 15,
      mainFlow: { spaceId: 301, preferredEnd: "12:30", continuity: "REQUIRED", maxBlocksByKey: 2, minTasksPerBlock: 1 },
    },
    camerasAvailable: 0,
    tasks: [
      task(101, { plannerNextKind: "main", contestantId: 201, spaceId: 301, zoneId: 401, assignedResourceIds: [501], dependsOnTaskIds: [102] }),
      task(102, { plannerNextKind: "vocal", contestantId: 201, spaceId: 302, zoneId: 402, assignedResourceIds: [501] }),
      task(103, { plannerNextKind: "main", contestantId: 202, spaceId: 301, zoneId: 401, assignedResourceIds: [501], dependsOnTaskIds: [104] }),
      task(104, { plannerNextKind: "vocal", contestantId: 202, spaceId: 302, zoneId: 402, assignedResourceIds: [501] }),
      task(105, { plannerNextKind: "technical", spaceId: 303, zoneId: 403, assignedResourceIds: [503] }),
    ],
    locks: [],
    planZoneSettings: [
      { zoneId: 401, availabilityStart: null, availabilityEnd: null, source: "fixture" },
      { zoneId: 402, availabilityStart: "09:00", availabilityEnd: "17:00", source: "fixture" },
      { zoneId: 403, availabilityStart: null, availabilityEnd: null, source: "fixture" },
    ],
    planSpaceSettings: [
      { spaceId: 301, zoneId: 401, availabilityStart: null, availabilityEnd: null, source: "fixture" },
      { spaceId: 302, zoneId: 402, availabilityStart: "09:30", availabilityEnd: "16:30", source: "fixture" },
      { spaceId: 303, zoneId: 403, availabilityStart: null, availabilityEnd: null, source: "fixture" },
    ],
    contestantAvailabilityById: { 201: { start: "08:00", end: "17:00" }, 202: { start: "09:00", end: "16:30" } },
    planResourceItems: [
      { id: 501, resourceItemId: 601, typeId: 11, name: "display-only-a", isAvailable: true, availabilityStart: null, availabilityEnd: null },
      { id: 502, resourceItemId: 602, typeId: 12, name: "display-only-b", isAvailable: true, availabilityStart: "09:00", availabilityEnd: "17:00" },
      { id: 503, resourceItemId: 603, typeId: 13, name: "display-only-c", isAvailable: true, availabilityStart: "09:30", availabilityEnd: "16:30" },
      { id: 504, resourceItemId: 604, typeId: 14, name: "display-only-d", isAvailable: true, availabilityStart: null, availabilityEnd: null },
    ],
    vocalCoachPlanResourceItemIdByContestantId: { 201: 501, 202: 501 },
    spaceResourceAssignments: { 301: [504] },
    zoneResourceAssignments: { 403: [503] },
    spaceResourceTypeRequirements: {},
    zoneResourceTypeRequirements: {},
    resourceItemComponents: {},
    groupingZoneIds: [],
  };
}
