import type { EngineInput } from "../../../types";
import type { GoldenBenchmarkScenario } from "../goldenBenchmarkSuite";

const baseInput = (planId: number): EngineInput => ({
  planId,
  workDay: { start: "09:00", end: "18:00" },
  meal: { start: "13:00", end: "14:00" },
  camerasAvailable: 2,
  tasks: [],
  locks: [],
  optimizerMainZoneId: 10,
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [
    { id: 7, resourceItemId: 70, typeId: 1, name: "Camera 1", isAvailable: true },
    { id: 8, resourceItemId: 80, typeId: 1, name: "Camera 2", isAvailable: true },
  ],
  resourceItemComponents: {},
  groupingZoneIds: [],
});

export const goldenBenchmarkScenarios: GoldenBenchmarkScenario[] = [
  {
    id: "golden-minimal-main-zone",
    name: "Minimal main-zone continuity",
    description: "Small deterministic ORC reference case with two planned tasks in one zone and one unscheduled pending task.",
    input: {
      ...baseInput(11401),
      tasks: [
        { id: 1, planId: 11401, templateId: 10, status: "pending", contestantId: 1, zoneId: 10, spaceId: 10, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [7] },
        { id: 2, planId: 11401, templateId: 11, status: "pending", contestantId: 1, zoneId: 10, spaceId: 10, startPlanned: "10:00", endPlanned: "10:30", assignedResourceIds: [7] },
        { id: 3, planId: 11401, templateId: 12, status: "pending", contestantId: 2 },
      ],
    },
  },
  {
    id: "golden-resource-pressure",
    name: "Resource pressure with lock",
    description: "Deterministic ORC reference case with a fixed task and a shared camera resource pressure.",
    input: {
      ...baseInput(11402),
      locks: [{ taskId: 11, start: "09:30", end: "10:00" }],
      tasks: [
        { id: 10, planId: 11402, templateId: 20, status: "pending", contestantId: 3, zoneId: 10, spaceId: 20, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [7] },
        { id: 11, planId: 11402, templateId: 21, status: "pending", contestantId: 3, zoneId: 10, spaceId: 20, startPlanned: "09:30", endPlanned: "10:00", assignedResourceIds: [7] },
        { id: 12, planId: 11402, templateId: 22, status: "pending", contestantId: 4, zoneId: 11, spaceId: 21, startPlanned: "10:00", endPlanned: "10:30", assignedResourceIds: [8] },
      ],
    },
  },
];
