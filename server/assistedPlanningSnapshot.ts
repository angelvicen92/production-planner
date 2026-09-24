import { createHash } from "node:crypto";
import {
  ASSISTED_PLANNING_SNAPSHOT_CONTRACT_VERSION,
  type AssistedPlanningSnapshotV1,
  type AssistedPlanningBlockV1,
  type AssistedOperationalMealSnapshotV1,
  type AssistedSetupPreparationSnapshotV1,
} from "../shared/assistedPlanningSnapshotContracts";

export {
  ASSISTED_PLANNING_SNAPSHOT_CONTRACT_VERSION,
  type AssistedPlanningSnapshotV1,
  type AssistedPlanningTaskSnapshotV1,
  type AssistedPlanningBlockV1,
  type AssistedOperationalMealSnapshotV1,
  type AssistedSetupPreparationSnapshotV1,
} from "../shared/assistedPlanningSnapshotContracts";

export type AssistedPlanningTaskSource = Readonly<{
  id: number;
  startPlanned?: string | null;
  endPlanned?: string | null;
  zoneId?: number | null;
  spaceId?: number | null;
  locationLabel?: string | null;
  durationOverride?: number | null;
  camerasOverride?: number | null;
}> & Readonly<Record<string, unknown>>;

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonicalJson(item)]));
  return value;
}

export function buildAssistedPlanningSnapshotV1(
  rows: readonly AssistedPlanningTaskSource[],
  planningBlocks?: readonly AssistedPlanningBlockV1[],
  operationalMeals?: readonly AssistedOperationalMealSnapshotV1[],
  setupPreparations?: readonly AssistedSetupPreparationSnapshotV1[],
): AssistedPlanningSnapshotV1 {
  const tasks = rows.map((row) => {
    if (!Number.isInteger(row.id) || row.id <= 0) throw new Error("task id must be a positive integer");
    return {
      taskId: row.id,
      startPlanned: row.startPlanned ?? null,
      endPlanned: row.endPlanned ?? null,
      zoneId: row.zoneId ?? null,
      spaceId: row.spaceId ?? null,
      locationLabel: row.locationLabel ?? null,
      durationOverride: row.durationOverride ?? null,
      camerasOverride: row.camerasOverride ?? null,
    };
  }).sort((a, b) => a.taskId - b.taskId);
  if (tasks.some((task, index) => index > 0 && tasks[index - 1].taskId === task.taskId)) {
    throw new Error("snapshot cannot contain duplicate task ids");
  }
  const meals = operationalMeals?.map(meal => ({...meal})).sort((a,b)=>a.policyId.localeCompare(b.policyId,"en"));
  if(meals?.some((meal,index)=>!meal.policyId||!/^\d{2}:\d{2}$/.test(meal.startPlanned)||!/^\d{2}:\d{2}$/.test(meal.endPlanned)
    ||meal.startPlanned>=meal.endPlanned||(index>0&&meals[index-1]!.policyId===meal.policyId)))
    throw new Error("invalid or duplicate operational meal");
  const mealProperty=meals?.length?{operationalMeals:meals}:{};
  const preparations=setupPreparations?.map(item=>({...item})).sort((a,b)=>a.start-b.start||a.end-b.end||a.id.localeCompare(b.id,"en"));
  const preparationIdentities=new Set<string>();
  for(const [index,item] of (preparations??[]).entries()){
    const identity=`${item.spaceId}|${item.setupFamilyId}|${item.entryIndex}`;
    if(!item.id||!Number.isInteger(item.spaceId)||item.spaceId<=0||!item.setupFamilyId
      ||!Number.isInteger(item.entryIndex)||item.entryIndex<=0||!Number.isInteger(item.duration)||item.duration<=0
      ||!Number.isInteger(item.start)||!Number.isInteger(item.end)||item.start>=item.end||item.end-item.start!==item.duration
      ||preparationIdentities.has(identity)||(index>0&&preparations![index-1]!.id===item.id))throw new Error("invalid or duplicate setup preparation");
    preparationIdentities.add(identity);
  }
  const preparationProperty=preparations?.length?{setupPreparations:preparations}:{};
  if (planningBlocks === undefined || planningBlocks.length === 0) return freeze({ contractVersion: ASSISTED_PLANNING_SNAPSHOT_CONTRACT_VERSION, tasks, ...mealProperty, ...preparationProperty });
  const seen = new Set<number>();
  const blocks = planningBlocks.map((block) => ({
    ...structuredClone(block),
    memberTaskIds: [...block.memberTaskIds],
    scopeProvenance: canonicalJson(block.scopeProvenance) as Readonly<Record<string, unknown>>,
  })).sort((a, b) => a.order - b.order || a.blockId.localeCompare(b.blockId));
  for (const [index, block] of blocks.entries()) {
    if (!block.blockId || block.order !== index || block.memberTaskIds.length < 2 || new Set(block.memberTaskIds).size !== block.memberTaskIds.length)
      throw new Error("invalid planning block");
    for (const id of block.memberTaskIds) {
      if (!tasks.some((task) => task.taskId === id) || seen.has(id)) throw new Error("contradictory planning block membership");
      seen.add(id);
    }
  }
  return freeze({ contractVersion: ASSISTED_PLANNING_SNAPSHOT_CONTRACT_VERSION, tasks, planningBlocks: blocks, ...mealProperty, ...preparationProperty });
}

export function fingerprintAssistedPlanningSnapshotV1(snapshot: AssistedPlanningSnapshotV1): string {
  const canonical = buildAssistedPlanningSnapshotV1(snapshot.tasks.map((task) => ({ id: task.taskId, ...task })), snapshot.planningBlocks, snapshot.operationalMeals, snapshot.setupPreparations);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
