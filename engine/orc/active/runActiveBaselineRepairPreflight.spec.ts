import assert from "node:assert/strict";
import test from "node:test";
import type { OperationalState } from "../contracts";
import { runActiveBaselineRepairPreflight, hasRepairableBaselineSpaceOverlapGroup, ORC_RUNTIME_CONTRACT_VERSION_ID224, buildORCRuntimeContractID224 } from "./runActiveBaselineRepairPreflight";

const audit = { available: true, hardFeasible: false, reason: "baseline_seed_hard_infeasible", violatedConstraints: ["SPACE_OVERLAP"], spaceOverlapGroups: [{ taskIds: [315, 504], taskCount: 2, spaceId: 48, roleLabels: ["productive_task", "productive_task"], occupancyModes: ["exclusive", "exclusive"], timeWindow: { start: "10:20", end: "10:35" } }] } as any;
const state = (extra: Partial<OperationalState> = {}): OperationalState => ({ id: "state:v4-29", planId: 27, workDay: { start: "09:00", end: "13:00" }, planning: [
  { taskId: 286, startPlanned: "09:55", endPlanned: "10:10", assignedResourceIds: [336], spaceId: 47, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true },
  { taskId: 504, startPlanned: "10:05", endPlanned: "10:50", assignedResourceIds: [], spaceId: 48, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true },
  { taskId: 315, startPlanned: "10:20", endPlanned: "10:35", assignedResourceIds: [336], spaceId: 48, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true },
  { taskId: 296, startPlanned: "10:35", endPlanned: "10:50", assignedResourceIds: [336], spaceId: 47, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true },
  { taskId: 306, startPlanned: "10:50", endPlanned: "11:05", assignedResourceIds: [336], spaceId: 47, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true },
  { taskId: 285, startPlanned: "12:05", endPlanned: "12:20", assignedResourceIds: [336], spaceId: 48, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true },
], tasks: [286,504,315,296,306,285].map((id) => ({ id, templateId: id, status: "pending", spaceId: id === 315 || id === 504 || id === 285 ? 48 : 47, assignedResourceIds: id === 504 ? [] : [336] } as any)), resources: [{ id: 336, name: "R" } as any], spaces: { parentById: {}, nameById: { 47: "A", 48: "B", 49: "Transport" }, capacityById: { 47: 1, 48: 1, 49: 6 }, concurrencyById: { 47: 1, 48: 1, 49: 6 }, exclusiveById: { 47: true, 48: true, 49: false }, priorityById: {} }, availability: { workDay: null, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [], contestantAvailabilityById: {} }, dependencies: [], locks: [], constraints: {}, operationalMetrics: {}, cognitive: { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} }, source: "EngineInput", schemaVersion: "ORC-SPEC-01", ...extra });

test("generates and validates repair candidates from official audit", () => {
  const result = runActiveBaselineRepairPreflight({ input: {} as any, operationalState: state(), baselineSeedHardFeasibility: audit, maxCandidates: 4 });
  assert.equal(result.summary.executed, true);
  assert.ok(result.summary.generatedCandidateCount > 0);
  assert.ok(result.summary.simulatedStateCount > 0);
  assert.ok(result.summary.validSimulationCount > 0);
  assert.equal(result.summary.selectedAsCommit, true);
  assert.equal(result.baselineOverlapRepairSummary.summaryContractVersion, "BASELINE-OVERLAP-REPAIR-SUMMARY-ID224");
});

test("does not consolidate when every simulation is invalid", () => {
  const blocked = state({ planning: [...state().planning, { taskId: 900, startPlanned: "09:00", endPlanned: "10:20", assignedResourceIds: [], spaceId: 48, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true } as any, { taskId: 901, startPlanned: "10:50", endPlanned: "13:00", assignedResourceIds: [], spaceId: 48, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true } as any], tasks: [...state().tasks, { id: 900, status: "pending", spaceId: 48, assignedResourceIds: [] } as any, { id: 901, status: "pending", spaceId: 48, assignedResourceIds: [] } as any] });
  const result = runActiveBaselineRepairPreflight({ input: {} as any, operationalState: blocked, baselineSeedHardFeasibility: audit, maxCandidates: 4 });
  assert.equal(result.selected, null);
  assert.equal(result.summary.selectedAsCommit, false);
  assert.ok(result.summary.reason);
});

test("does not move done or in_progress tasks", () => {
  const protectedState = state({ tasks: state().tasks.map((t: any) => t.id === 315 ? { ...t, status: "done" } : t.id === 504 ? { ...t, status: "in_progress" } : t) });
  const result = runActiveBaselineRepairPreflight({ input: {} as any, operationalState: protectedState, baselineSeedHardFeasibility: audit });
  assert.equal(result.selected, null);
  assert.equal(result.summary.generatedCandidateCount, 0);
});

test("valid transport overlap does not create repair preflight", () => {
  const transportAudit = { hardFeasible: true, spaceOverlapGroups: [{ taskIds: [1,2], taskCount: 2, spaceId: 49, roleLabels: ["transport_arrival", "transport_arrival"], occupancyModes: ["shared", "shared"] }] };
  assert.equal(hasRepairableBaselineSpaceOverlapGroup(transportAudit), false);
  assert.equal(buildORCRuntimeContractID224().orcRuntimeContractVersion, ORC_RUNTIME_CONTRACT_VERSION_ID224);
});
