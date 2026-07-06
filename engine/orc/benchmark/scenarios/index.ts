import type { EngineInput, TaskInput } from "../../../types";
import { realVoiceAuditionDayScenario } from "./realVoiceAuditionDay";

export type ProductionScenarioId =
  | "initial-planning"
  | "replanning"
  | "continuous-main-flow"
  | "critical-resources"
  | "multiple-any-of"
  | "resource-pressure"
  | "high-fragmentation"
  | "multiple-locks"
  | "simple-day"
  | "complex-day"
  | "real-voice-audition-day"
  | "macro-main-zone-block-relayout-positive"
  | "macro-main-zone-block-relayout-blocked"
  | "macro-main-zone-block-relayout-dependency-aware-positive"
  | "macro-main-zone-block-relayout-dependency-chain-blocked"
  | "macro-main-zone-block-relayout-local-positive-global-neutral"
  | "macro-main-zone-block-relayout-global-positive"
  | "macro-main-zone-suffix-compaction-dominant-positive"
  | "macro-main-zone-suffix-compaction-compactness-warning"
  | "macro-main-zone-suffix-compaction-small-gain-rejected"
  | "macro-main-zone-suffix-compaction-severe-regression-rejected";

export interface ProductionBenchmarkScenario {
  id: ProductionScenarioId;
  name: string;
  category: string;
  description: string;
  expectation: string;
  input: EngineInput;
}

const PLAN_ID = 17400;
const MAIN_ZONE_ID = 1;
const MAIN_SPACE_ID = 101;
const AUX_SPACE_ID = 202;
const COACH_SPACE_ID = 201;
const CAMERA_TYPE_ID = 1;
const COACH_TYPE_ID = 10;

const task = (id: number, patch: Partial<TaskInput>): TaskInput => ({
  id,
  planId: PLAN_ID,
  templateId: 1000 + id,
  status: "pending",
  contestantId: id,
  zoneId: MAIN_ZONE_ID,
  spaceId: MAIN_SPACE_ID,
  durationOverrideMin: 30,
  ...patch,
});

const baseInput = (tasks: TaskInput[], overrides: Partial<EngineInput> = {}): EngineInput => ({
  planId: PLAN_ID,
  workDay: { start: "09:00", end: "14:00" },
  meal: { start: "12:00", end: "12:30" },
  camerasAvailable: 2,
  tasks,
  locks: [],
  optimizerMainZoneId: MAIN_ZONE_ID,
  groupingZoneIds: [MAIN_ZONE_ID],
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [
    { id: 1, resourceItemId: 501, typeId: CAMERA_TYPE_ID, name: "Camera A", isAvailable: true },
    { id: 2, resourceItemId: 502, typeId: CAMERA_TYPE_ID, name: "Camera B", isAvailable: true },
    { id: 3, resourceItemId: 901, typeId: COACH_TYPE_ID, name: "Coach Alpha", isAvailable: true },
    { id: 4, resourceItemId: 902, typeId: COACH_TYPE_ID, name: "Coach Beta", isAvailable: true },
  ],
  resourceItemComponents: {},
  spaceNameById: { [MAIN_SPACE_ID]: "Main Stage", [AUX_SPACE_ID]: "Interview", [COACH_SPACE_ID]: "Coach Room" },
  ...overrides,
});

export { realVoiceAuditionDayScenario };

export const productionBenchmarkScenarios: ProductionBenchmarkScenario[] = [
  {
    id: "initial-planning",
    name: "Planificación inicial",
    category: "initial-planning",
    description: "Fresh plan with pending main-stage and auxiliary work.",
    expectation: "Both engines receive the same unplanned input and produce comparable official metrics.",
    input: baseInput([task(1, { contestantId: 1 }), task(2, { contestantId: 2, spaceId: AUX_SPACE_ID }), task(3, { contestantId: 1, spaceId: COACH_SPACE_ID })]),
  },
  {
    id: "replanning",
    name: "Replanificación",
    category: "replanning",
    description: "Already executed work plus movable pending work around the existing timeline.",
    expectation: "Executed work and locked context remain benchmark input only; no official planning is mutated.",
    input: baseInput([task(11, { status: "done", startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [1] }), task(12, { contestantId: 12 }), task(13, { contestantId: 13, spaceId: AUX_SPACE_ID })]),
  },
  {
    id: "continuous-main-flow",
    name: "Flujo principal continuo",
    category: "main-flow-continuity",
    description: "Main-stage chain with feeder dependencies that can create visible gaps.",
    expectation: "Main-flow continuity is measured as an official delta metric only.",
    input: baseInput([task(21, { contestantId: 21, spaceId: AUX_SPACE_ID, durationOverrideMin: 20 }), task(22, { contestantId: 21, dependsOnTaskIds: [21] }), task(23, { contestantId: 22 }), task(24, { contestantId: 23 })]),
  },
  {
    id: "critical-resources",
    name: "Recursos críticos",
    category: "critical-resources",
    description: "Several tasks compete for named coach resources.",
    expectation: "Resource utilization and conflict metrics expose critical-resource pressure without changing allocation logic.",
    input: baseInput([task(31, { spaceId: COACH_SPACE_ID, resourceRequirements: { byItem: { 901: 1 } } }), task(32, { spaceId: COACH_SPACE_ID, resourceRequirements: { byItem: { 901: 1 } } }), task(33, { spaceId: COACH_SPACE_ID, resourceRequirements: { byItem: { 902: 1 } } })]),
  },
  {
    id: "multiple-any-of",
    name: "Múltiples ANY_OF",
    category: "resource-alternatives",
    description: "Alternative resource groups appear on several tasks.",
    expectation: "The suite captures ORC/V4 differences using the same ANY_OF input.",
    input: baseInput([task(41, { resourceRequirements: { anyOf: [{ quantity: 1, resourceItemIds: [501, 502] }] } }), task(42, { spaceId: AUX_SPACE_ID, resourceRequirements: { anyOf: [{ quantity: 1, resourceItemIds: [501, 502] }] } }), task(43, { spaceId: COACH_SPACE_ID, resourceRequirements: { anyOf: [{ quantity: 1, resourceItemIds: [901, 902] }] } })]),
  },
  {
    id: "resource-pressure",
    name: "Alta presión de recursos",
    category: "resource-pressure",
    description: "A short day with more demand than comfortable resource slack.",
    expectation: "Conflicts, simulations and utilization provide evidence for pressure.",
    input: baseInput([task(51, {}), task(52, {}), task(53, { spaceId: AUX_SPACE_ID }), task(54, { spaceId: COACH_SPACE_ID, resourceRequirements: { byItem: { 901: 1 } } })], { workDay: { start: "09:00", end: "11:00" } }),
  },
  {
    id: "high-fragmentation",
    name: "Alta fragmentación",
    category: "fragmentation",
    description: "Many short tasks distributed across talents and spaces.",
    expectation: "Permanence and continuity metrics characterize fragmented scheduling.",
    input: baseInput(Array.from({ length: 8 }, (_, index) => task(60 + index, { contestantId: 600 + (index % 4), spaceId: index % 2 === 0 ? MAIN_SPACE_ID : AUX_SPACE_ID, durationOverrideMin: 15 }))),
  },
  {
    id: "multiple-locks",
    name: "Múltiples locks",
    category: "locks",
    description: "Several manually locked tasks coexist with pending movable tasks.",
    expectation: "The benchmark remains observational and verifies no input mutation.",
    input: baseInput([task(71, { durationOverrideMin: 15, zoneId: null, spaceId: null, startPlanned: "09:00", endPlanned: "09:15" }), task(72, { durationOverrideMin: 15, zoneId: null, spaceId: null, startPlanned: "09:30", endPlanned: "09:45" })], { workDay: { start: "09:00", end: "10:00" }, planResourceItems: [], locks: [{ id: 1, planId: PLAN_ID, taskId: 71, lockType: "time", lockedStart: "09:00", lockedEnd: "09:15" }, { id: 2, planId: PLAN_ID, taskId: 72, lockType: "time", lockedStart: "09:30", lockedEnd: "09:45" }] }),
  },
  {
    id: "simple-day",
    name: "Jornada simple",
    category: "simple-day",
    description: "Small uncomplicated production day.",
    expectation: "Acts as a stable smoke scenario for the suite.",
    input: baseInput([task(81, {}), task(82, { contestantId: 81, spaceId: AUX_SPACE_ID })], { workDay: { start: "09:00", end: "12:00" } }),
  },
  {
    id: "complex-day",
    name: "Jornada compleja",
    category: "complex-day",
    description: "Mixed dependencies, locks, resource alternatives and critical resources.",
    expectation: "Consolidates representative production pressure into one deterministic report.",
    input: baseInput([task(91, { spaceId: AUX_SPACE_ID, durationOverrideMin: 20 }), task(92, { durationOverrideMin: 20, dependsOnTaskIds: [91], resourceRequirements: { anyOf: [{ quantity: 1, resourceItemIds: [501, 502] }] } }), task(93, { durationOverrideMin: 20, spaceId: COACH_SPACE_ID, resourceRequirements: { byItem: { 901: 1 } } }), task(94, { durationOverrideMin: 20, spaceId: COACH_SPACE_ID, resourceRequirements: { byItem: { 901: 1 } } }), task(95, { durationOverrideMin: 20, startPlanned: "11:00", endPlanned: "11:20" })], { locks: [{ id: 3, planId: PLAN_ID, taskId: 95, lockType: "time", lockedStart: "11:00", lockedEnd: "11:20" }] }),
  },
  realVoiceAuditionDayScenario,

  {
    id: "macro-main-zone-block-relayout-local-positive-global-neutral",
    name: "Macro local positive / global neutral",
    category: "macro-main-zone",
    description: "ID241 guardrail fixture for a local-only macro improvement that must remain rejected globally.",
    expectation: "Local-only global-neutral macro remains rejected without fallback when the base plan is valid.",
    input: baseInput([task(2441, {}), task(2442, {}), task(2443, {})], { workDay: { start: "09:00", end: "18:00" }, meal: { start: "13:00", end: "16:30" } }),
  },
  {
    id: "macro-main-zone-block-relayout-global-positive",
    name: "Macro global positive",
    category: "macro-main-zone",
    description: "Global-positive macro fixture preserved from ID241/ID242 coverage.",
    expectation: "Hard feasibility, dependencies, assignedSpace and deterministic output are preserved.",
    input: baseInput([task(2451, {}), task(2452, {}), task(2453, {})], { workDay: { start: "09:00", end: "18:00" }, meal: { start: "13:00", end: "16:30" } }),
  },
  {
    id: "macro-main-zone-suffix-compaction-dominant-positive",
    name: "Suffix compaction dominant positive",
    category: "macro-main-zone",
    description: "ID243 v4-49-like suffix compaction benchmark where main-zone idle reduction is dominant.",
    expectation: "Dominant main-zone idle reduction is accepted by the global and dominance gates.",
    input: baseInput([task(2461, {}), task(2462, {}), task(2463, {})], { workDay: { start: "09:00", end: "18:00" }, meal: { start: "13:00", end: "16:30" } }),
  },
  {
    id: "macro-main-zone-suffix-compaction-compactness-warning",
    name: "Suffix compaction compactness warning",
    category: "macro-main-zone",
    description: "ID243 fixture where moderate compactness regression is diagnostic, not blocking.",
    expectation: "Moderate compactness regression is reported as a warning while hard constraints remain preserved.",
    input: baseInput([task(2471, {}), task(2472, {}), task(2473, {})], { workDay: { start: "09:00", end: "18:00" }, meal: { start: "13:00", end: "16:30" } }),
  },
  {
    id: "macro-main-zone-suffix-compaction-small-gain-rejected",
    name: "Suffix compaction small gain rejected",
    category: "macro-main-zone",
    description: "ID243 negative fixture for idle reductions below dominance threshold.",
    expectation: "Small visible-idle gain is rejected without fallback when the base plan is valid.",
    input: baseInput([task(2481, {}), task(2482, {}), task(2483, {})], { workDay: { start: "09:00", end: "18:00" }, meal: { start: "13:00", end: "16:30" } }),
  },
  {
    id: "macro-main-zone-suffix-compaction-severe-regression-rejected",
    name: "Suffix compaction severe regression rejected",
    category: "macro-main-zone",
    description: "ID243 negative fixture for severe secondary regression despite visible idle improvement.",
    expectation: "Severe compactness or talent-wait regression remains rejected and does not relax hard constraints.",
    input: baseInput([task(2491, {}), task(2492, {}), task(2493, {})], { workDay: { start: "09:00", end: "18:00" }, meal: { start: "13:00", end: "16:30" } }),
  },
  {
    id: "macro-main-zone-block-relayout-positive",
    name: "Macro main-zone relayout positive",
    category: "macro-main-zone",
    description: "Main-zone gap benchmark fixture for safe macro block relayout.",
    expectation: "Hard feasibility, assigned space and deterministic output are preserved while visible main-zone idle can improve.",
    input: baseInput([task(2401, {}), task(2402, {}), task(2403, {})], { workDay: { start: "09:00", end: "18:00" }, meal: { start: "13:00", end: "16:30" } }),
  },
  {
    id: "macro-main-zone-block-relayout-blocked",
    name: "Macro main-zone relayout blocked",
    category: "macro-main-zone",
    description: "Blocked macro relayout benchmark fixture.",
    expectation: "No regression is allowed when a macro relayout cannot be safely committed.",
    input: baseInput([task(2411, { status: "done" }), task(2412, { dependsOnTaskIds: [2411] }), task(2413, {})], { workDay: { start: "09:00", end: "18:00" }, meal: { start: "13:00", end: "16:30" } }),
  },
  {
    id: "macro-main-zone-block-relayout-dependency-aware-positive",
    name: "Macro dependency-aware relayout positive",
    category: "macro-main-zone",
    description: "Dependency-aware macro fixture with prerequisites before a later main-zone block.",
    expectation: "Dependencies are preserved and partial visible main-zone idle improvement is an acceptable positive outcome.",
    input: baseInput([task(2421, { spaceId: AUX_SPACE_ID }), task(2422, { dependsOnTaskIds: [2421] }), task(2423, { dependsOnTaskIds: [2422] })], { workDay: { start: "09:00", end: "18:00" }, meal: { start: "13:00", end: "16:30" } }),
  },
  {
    id: "macro-main-zone-block-relayout-dependency-chain-blocked",
    name: "Macro dependency chain blocked",
    category: "macro-main-zone",
    description: "Dependency-aware macro fixture where protected prerequisites block safe relayout.",
    expectation: "The benchmark remains deterministic, preserves hard feasibility and reports no regression when blocked.",
    input: baseInput([task(2431, { status: "in_progress", spaceId: AUX_SPACE_ID }), task(2432, { dependsOnTaskIds: [2431] }), task(2433, {})], { workDay: { start: "09:00", end: "18:00" }, meal: { start: "13:00", end: "16:30" } }),
  },
];
