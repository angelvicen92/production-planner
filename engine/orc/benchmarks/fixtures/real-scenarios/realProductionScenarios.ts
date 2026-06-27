import type { EngineInput } from "../../../../types";
import type { RealProductionScenario } from "../../realProductionScenarioSuite";

const baseInput = (planId: number): EngineInput => ({
  planId,
  workDay: { start: "08:30", end: "18:30" },
  meal: { start: "13:30", end: "14:30" },
  camerasAvailable: 2,
  tasks: [],
  locks: [],
  optimizerMainZoneId: 101,
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [
    { id: 101, resourceItemId: 1001, typeId: 1, name: "Camera A", isAvailable: true },
    { id: 102, resourceItemId: 1002, typeId: 1, name: "Camera B", isAvailable: true },
    { id: 201, resourceItemId: 2001, typeId: 2, name: "Coach A", isAvailable: true },
  ],
  resourceItemComponents: {},
  groupingZoneIds: [101],
  protectedBreaks: [],
});

export const realProductionScenarios: RealProductionScenario[] = [
  {
    id: "real-main-stage-with-backlog",
    name: "Main stage with contestant backlog",
    description: "Representative production day where one contestant has consecutive planned work and another pending task waits for placement.",
    input: {
      ...baseInput(12201),
      tasks: [
        { id: 1220101, planId: 12201, templateId: 501, status: "pending", contestantId: 301, contestantName: "Contestant A", zoneId: 101, spaceId: 10001, startPlanned: "09:00", endPlanned: "09:45", assignedResourceIds: [101] },
        { id: 1220102, planId: 12201, templateId: 502, status: "pending", contestantId: 301, contestantName: "Contestant A", zoneId: 101, spaceId: 10001, startPlanned: "10:00", endPlanned: "10:45", assignedResourceIds: [101] },
        { id: 1220103, planId: 12201, templateId: 503, status: "pending", contestantId: 302, contestantName: "Contestant B", durationOverrideMin: 30, camerasOverride: 1 },
      ],
    },
    expectedPlanningMetadata: {
      profile: "main-stage-backlog",
      plannedTasks: 2,
      pendingUnscheduledTasks: 1,
      fixedLocks: 0,
    },
  },
  {
    id: "real-resource-lock-pressure",
    name: "Resource lock pressure across spaces",
    description: "Representative resource pressure case with one locked shoot and adjacent planned tasks competing for camera continuity.",
    input: {
      ...baseInput(12202),
      locks: [{ id: 122020201, planId: 12202, taskId: 1220202, lockType: "full", lockedStart: "11:00", lockedEnd: "11:45" }],
      tasks: [
        { id: 1220201, planId: 12202, templateId: 601, status: "pending", contestantId: 401, contestantName: "Contestant C", zoneId: 101, spaceId: 10002, startPlanned: "10:00", endPlanned: "10:45", assignedResourceIds: [101] },
        { id: 1220202, planId: 12202, templateId: 602, status: "pending", contestantId: 402, contestantName: "Contestant D", zoneId: 102, spaceId: 10003, startPlanned: "11:00", endPlanned: "11:45", assignedResourceIds: [101] },
        { id: 1220203, planId: 12202, templateId: 603, status: "pending", contestantId: 403, contestantName: "Contestant E", zoneId: 102, spaceId: 10004, startPlanned: "12:00", endPlanned: "12:30", assignedResourceIds: [102] },
      ],
    },
    expectedPlanningMetadata: {
      profile: "resource-lock-pressure",
      plannedTasks: 3,
      pendingUnscheduledTasks: 0,
      fixedLocks: 1,
    },
  },
  {
    id: "real-protected-break-recovery",
    name: "Protected break recovery window",
    description: "Representative recovery case with a protected break splitting the production day and one recovery task awaiting placement.",
    input: {
      ...baseInput(12203),
      protectedBreaks: [{ id: "global-meal", kind: "meal", label: "Production meal", start: "13:30", end: "14:30" }],
      tasks: [
        { id: 1220301, planId: 12203, templateId: 701, status: "pending", contestantId: 501, contestantName: "Contestant F", zoneId: 101, spaceId: 10005, startPlanned: "12:30", endPlanned: "13:15", assignedResourceIds: [101] },
        { id: 1220302, planId: 12203, templateId: 702, status: "pending", contestantId: 501, contestantName: "Contestant F", durationOverrideMin: 30, camerasOverride: 1 },
        { id: 1220303, planId: 12203, templateId: 703, status: "pending", contestantId: 502, contestantName: "Contestant G", zoneId: 101, spaceId: 10006, startPlanned: "15:00", endPlanned: "15:45", assignedResourceIds: [102] },
      ],
    },
    expectedPlanningMetadata: {
      profile: "protected-break-recovery",
      plannedTasks: 2,
      pendingUnscheduledTasks: 1,
      protectedBreaks: 1,
    },
  },
];
