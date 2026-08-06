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
    locks: [
      { id: 1, planId: 701, taskId: 101, lockType: "resource", lockedResourceId: 501 },
      { id: 2, planId: 701, taskId: 105, lockType: "resource", lockedResourceId: 502 },
    ],
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

export function createSpec10017JointGroupEngineInputFixture(): EngineInput {
  const input = createSupportedEngineInputAdapterFixture();
  input.tasks = input.tasks.filter((task) => task.id !== 105);
  input.locks = input.locks.filter((lock) => lock.taskId !== 105);
  input.plannerNext!.mainFlow.preferredEnd = "12:30";
  input.plannerNext!.searchBudget = { bestK: 5, maxBacktracks: 200, maxPatterns: 200, maxBranchExpansions: 10000 };
  input.planSpaceSettings.push({ spaceId: 304, zoneId: 403, availabilityStart: "12:30", availabilityEnd: "13:00", source: "spec10-017" });
  input.contestantAvailabilityById = { ...input.contestantAvailabilityById, 201: { start: "08:00", end: "13:00" }, 202: { start: "08:00", end: "13:00" } };
  input.tasks.push(
    task(201, { templateId: 9201, plannerNextKind: "auxiliary", contestantId: 201, spaceId: 304, zoneId: 403, durationOverrideMin: 10, jointGroupId: "a2-c06-c10-alfombra-roja" }),
    task(202, { templateId: 9201, plannerNextKind: "auxiliary", contestantId: 202, spaceId: 304, zoneId: 403, durationOverrideMin: 10, jointGroupId: "a2-c06-c10-alfombra-roja" }),
    task(203, { templateId: 9202, plannerNextKind: "auxiliary", contestantId: 201, spaceId: 304, zoneId: 403, durationOverrideMin: 5, jointGroupId: "a2-c06-c10-totales-post", dependsOnTaskIds: [201] }),
    task(204, { templateId: 9202, plannerNextKind: "auxiliary", contestantId: 202, spaceId: 304, zoneId: 403, durationOverrideMin: 5, jointGroupId: "a2-c06-c10-totales-post", dependsOnTaskIds: [202] }),
    task(205, { templateId: 9203, plannerNextKind: "auxiliary", contestantId: 201, spaceId: 302, zoneId: 402, durationOverrideMin: 5 }),
    task(206, { templateId: 9204, plannerNextKind: "technical", spaceId: 303, zoneId: 403, durationOverrideMin: 5 }),
  );
  return input;
}


export function createSpec10018SetupPolicyEngineInputFixture(familyOrder: string[] = ["sillon", "estrellas"]): EngineInput {
  const input = createSupportedEngineInputAdapterFixture();
  input.plannerNext!.searchBudget = { bestK: 5, maxBacktracks: 200, maxPatterns: 200, maxBranchExpansions: 300000 };
  input.planSpaceSettings.push({ spaceId: 304, zoneId: 403, availabilityStart: "12:30", availabilityEnd: "13:00", source: "spec10-018" });
  input.contestantAvailabilityById = {
    ...input.contestantAvailabilityById,
    211: { start: "08:00", end: "13:00" },
    212: { start: "08:00", end: "13:00" },
    213: { start: "08:00", end: "13:00" },
    214: { start: "08:00", end: "13:00" },
  };
  input.setupPolicies = [{
    spaceId: 304,
    families: ["sillon", "estrellas"],
    oneBlockPerFamily: true,
    orderConstraint: "EXPLICIT",
    familyOrder,
    reentry: "FORBIDDEN",
    preparationMinutesBetweenFamilies: 10,
  }];
  input.tasks.push(
    task(301, { templateId: 9301, plannerNextKind: "auxiliary", contestantId: 211, spaceId: 304, zoneId: 403, durationOverrideMin: 5, setupFamilyId: "sillon" }),
    task(302, { templateId: 9301, plannerNextKind: "auxiliary", contestantId: 212, spaceId: 304, zoneId: 403, durationOverrideMin: 5, setupFamilyId: "sillon" }),
    task(303, { templateId: 9302, plannerNextKind: "auxiliary", contestantId: 213, spaceId: 304, zoneId: 403, durationOverrideMin: 5, setupFamilyId: "estrellas" }),
    task(304, { templateId: 9302, plannerNextKind: "auxiliary", contestantId: 214, spaceId: 304, zoneId: 403, durationOverrideMin: 5, setupFamilyId: "estrellas" }),
  );
  return input;
}

export function createSpec10018SetupPolicyEngineInputFixtureReverseOrder(): EngineInput {
  return createSpec10018SetupPolicyEngineInputFixture(["estrellas", "sillon"]);
}

export function createSpec10020FlexibleSetupOrderEngineInputFixture(): EngineInput {
  const input = createSpec10018SetupPolicyEngineInputFixture();
  input.tasks = input.tasks.filter(({ id }) => id !== 105);
  input.locks = input.locks.filter(({ taskId }) => taskId !== 105);
  input.setupPolicies = input.setupPolicies?.map((policy) => {
    const flexible = { ...policy, orderConstraint: "UNSPECIFIED" as const };
    delete flexible.familyOrder;
    return flexible;
  });
  return input;
}
