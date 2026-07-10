import { createHash } from "node:crypto";
import type { EngineInput } from "./types";

export const ENGINE_SCENARIO_SNAPSHOT_VERSION = "optiplan-engine-scenario-v1" as const;

export interface EngineScenarioSnapshotCounts {
  tasks: number;
  pendingTasks: number;
  protectedTasks: number;
  locks: number;
  planResourceItems: number;
  spaces: number;
  zones: number;
  contestants: number;
  dependencies: number;
}

export interface EngineScenarioSnapshotV1 {
  exportVersion: typeof ENGINE_SCENARIO_SNAPSHOT_VERSION;
  generatedAt: string;
  planId: number;
  inputHash: string;
  counts: EngineScenarioSnapshotCounts;
  engineInput: EngineInput;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Object.prototype.toString.call(value) === "[object Object]";

export function canonicalizeForEngineScenario(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalizeForEngineScenario(item));
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child !== undefined) out[key] = canonicalizeForEngineScenario(child);
  }
  return out;
}

export function cloneEngineScenarioValue<T>(value: T): T {
  return canonicalizeForEngineScenario(value) as T;
}

export function hashEngineInput(engineInput: EngineInput): string {
  return createHash("sha256").update(JSON.stringify(canonicalizeForEngineScenario(engineInput))).digest("hex");
}

function countRecordKeys(value: unknown): number {
  return isPlainObject(value) ? Object.keys(value).length : 0;
}

export function countEngineInput(engineInput: EngineInput): EngineScenarioSnapshotCounts {
  const tasks = Array.isArray((engineInput as any)?.tasks) ? (engineInput as any).tasks : [];
  const locks = Array.isArray((engineInput as any)?.locks) ? (engineInput as any).locks : [];
  const planResourceItems = Array.isArray((engineInput as any)?.planResourceItems) ? (engineInput as any).planResourceItems : [];
  const contestantIds = new Set<number>();
  const availabilityContestantIds = new Set(Object.keys((engineInput as any)?.contestantAvailabilityById ?? {}).map(Number).filter(Number.isFinite));
  let dependencies = 0;
  for (const task of tasks) {
    const rawContestantId = (task as any)?.contestantId;
    const contestantId = Number(rawContestantId);
    if (rawContestantId != null && Number.isFinite(contestantId)) contestantIds.add(contestantId);
    if (Array.isArray((task as any)?.dependsOnTaskIds)) dependencies += (task as any).dependsOnTaskIds.length;
    else if ((task as any)?.dependsOnTaskId != null) dependencies += 1;
    if (Array.isArray((task as any)?.dependsOnTemplateIds)) dependencies += (task as any).dependsOnTemplateIds.length;
    else if ((task as any)?.dependsOnTemplateId != null) dependencies += 1;
  }
  return {
    tasks: tasks.length,
    pendingTasks: tasks.filter((task: any) => task?.status === "pending").length,
    protectedTasks: tasks.filter((task: any) => task?.status === "in_progress" || task?.status === "done" || task?.seedSource === "protected_existing_planning").length,
    locks: locks.length,
    planResourceItems: planResourceItems.length,
    spaces: new Set([...Object.keys((engineInput as any)?.spaceNameById ?? {}), ...Object.keys((engineInput as any)?.spaceParentById ?? {}), ...tasks.map((task: any) => task?.spaceId).filter((id: any) => id != null).map(String)]).size,
    zones: new Set([...Object.keys((engineInput as any)?.zoneResourceAssignments ?? {}), ...Object.keys((engineInput as any)?.zoneResourceTypeRequirements ?? {}), ...tasks.map((task: any) => task?.zoneId).filter((id: any) => id != null).map(String)]).size,
    contestants: new Set([...contestantIds, ...availabilityContestantIds]).size,
    dependencies,
  };
}

export function buildEngineScenarioSnapshot(planId: number, engineInput: EngineInput, generatedAt = new Date().toISOString()): EngineScenarioSnapshotV1 {
  if (!Number.isFinite(planId) || planId <= 0) throw new Error(`Invalid planId for engine scenario snapshot: ${planId}`);
  const sanitizedInput = cloneEngineScenarioValue(engineInput);
  return { exportVersion: ENGINE_SCENARIO_SNAPSHOT_VERSION, generatedAt, planId, inputHash: hashEngineInput(sanitizedInput), counts: countEngineInput(sanitizedInput), engineInput: sanitizedInput };
}

export function validateEngineScenarioSnapshot(snapshot: unknown): EngineScenarioSnapshotV1 {
  if (!isPlainObject(snapshot)) throw new Error("Invalid engine scenario snapshot: expected JSON object.");
  if (snapshot.exportVersion !== ENGINE_SCENARIO_SNAPSHOT_VERSION) throw new Error(`Unsupported engine scenario snapshot version: ${String(snapshot.exportVersion)}`);
  if (!Number.isFinite(Number(snapshot.planId)) || Number(snapshot.planId) <= 0) throw new Error("Invalid engine scenario snapshot: planId must be a positive number.");
  if (!isPlainObject(snapshot.engineInput)) throw new Error("Invalid engine scenario snapshot: engineInput is missing or invalid.");
  if (typeof snapshot.inputHash !== "string" || !/^[a-f0-9]{64}$/.test(snapshot.inputHash)) throw new Error("Invalid engine scenario snapshot: inputHash must be a SHA-256 hex string.");
  const sanitized = cloneEngineScenarioValue(snapshot.engineInput) as unknown as EngineInput;
  const actualHash = hashEngineInput(sanitized);
  if (actualHash !== snapshot.inputHash) throw new Error(`Engine scenario snapshot integrity check failed: inputHash mismatch (expected ${snapshot.inputHash}, actual ${actualHash}).`);
  const rebuiltCounts = countEngineInput(sanitized);
  if (isPlainObject(snapshot.counts) && Number((snapshot.counts as any).tasks) !== rebuiltCounts.tasks) throw new Error(`Engine scenario snapshot counts mismatch: counts.tasks=${(snapshot.counts as any).tasks} but engineInput.tasks.length=${rebuiltCounts.tasks}.`);
  return { exportVersion: ENGINE_SCENARIO_SNAPSHOT_VERSION, generatedAt: typeof snapshot.generatedAt === "string" ? snapshot.generatedAt : "", planId: Number(snapshot.planId), inputHash: snapshot.inputHash, counts: rebuiltCounts, engineInput: sanitized };
}

export function parseEngineScenarioSnapshot(json: string | Buffer): EngineScenarioSnapshotV1 {
  try { return validateEngineScenarioSnapshot(JSON.parse(String(json))); }
  catch (error) { if (error instanceof SyntaxError) throw new Error(`Invalid engine scenario snapshot JSON: ${error.message}`); throw error; }
}
