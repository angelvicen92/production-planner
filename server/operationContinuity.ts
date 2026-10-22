import { z } from "zod";
import type { EngineInput } from "../engine/types";
import { continuityEditSchema, continuityGroupSchema, type ContinuityEdit, type OperationContinuityGroup } from "../shared/operationContinuity";
import type { TaskTemplateOperationalSnapshotV1 } from "./taskTemplateSnapshot";

const overridesSchema = z.array(continuityEditSchema.extend({ by: z.string().uuid(), at: z.string().datetime({ offset: true }) }).strict());
const conflict = () => Object.assign(new Error("OPERATION_CONTINUITY_CONFIGURATION_CONFLICT"), { status: 409 });

export function catalogContinuityGroup(value: any, reference?: string | null) {
  if (reference != null && (!value || value.id !== reference)) throw conflict();
  if (value == null) return undefined;
  return continuityGroupSchema.parse({ id: value.id, name: value.name, policy: value.policy, gapWeight: value.gapWeight ?? value.gap_weight, revision: value.revision });
}

export function snapshotContinuityGroups(input: EngineInput, snapshots: readonly TaskTemplateOperationalSnapshotV1[]) {
  const groups = new Map<string, OperationContinuityGroup>();
  for (const snapshot of snapshots) {
    const group = snapshot.continuityGroup;
    if (!group) continue;
    const taskIds = input.tasks.filter(task => task.templateId === snapshot.sourceTemplateId).map(task => task.id);
    if (!taskIds.length) continue;
    const prior = groups.get(group.id);
    if (prior && (prior.policy !== group.policy || prior.gapWeight !== group.gapWeight)) throw conflict();
    groups.set(group.id, { id: group.id, policy: group.policy, gapWeight: group.gapWeight, taskIds: [...(prior?.taskIds ?? []), ...taskIds].sort((a,b)=>a-b) });
  }
  return [...groups.values()].sort((a,b)=>a.id.localeCompare(b.id));
}

export function applyEffectiveOperationContinuity(input: EngineInput, row: Record<string, any>, snapshots: readonly TaskTemplateOperationalSnapshotV1[]): EngineInput {
  const inherited = snapshotContinuityGroups(input, snapshots);
  // Explicit frozen daily authorities take precedence, without rewriting 088.
  const explicit: OperationContinuityGroup[] = (row.planner_next_configuration ?? row.plannerNextConfiguration)?.operationContinuityGroups ?? [];
  const baseline = [...inherited.filter(group => !explicit.some(other=>other.id===group.id)), ...explicit].sort((a,b)=>a.id.localeCompare(b.id));
  const parsed = overridesSchema.safeParse(row.operation_continuity_overrides ?? []);
  if (!parsed.success || new Set(parsed.data.map(item=>item.groupId)).size !== parsed.data.length) throw conflict();
  if (!baseline.length && !parsed.data.length) return input;
  if (parsed.data.some(override => !baseline.some(group=>group.id===override.groupId))) throw conflict();
  return {...input, operationContinuityGroups:baseline.map(group=>{
    const override=parsed.data.find(item=>item.groupId===group.id);
    return override ? {...group, policy:override.policy, gapWeight:override.gapWeight} : group;
  })};
}

export function candidateOperationContinuity(input: EngineInput, target: ContinuityEdit | {groupId:string}, restoring: boolean,
  baseline: EngineInput): EngineInput {
  const group = input.operationContinuityGroups?.find(group=>group.id===target.groupId);
  const original = baseline.operationContinuityGroups?.find(group=>group.id===target.groupId);
  if (!group || !original) throw conflict();
  const value = restoring ? original : continuityEditSchema.parse(target);
  return {...input, operationContinuityGroups:input.operationContinuityGroups!.map(group=>group.id===target.groupId
    ? {...group, policy:value.policy, gapWeight:value.gapWeight} : group)};
}

export function operationContinuityValues(input: EngineInput, row: Record<string,any>, snapshots: readonly TaskTemplateOperationalSnapshotV1[]) {
  const baseline=applyEffectiveOperationContinuity({...input,operationContinuityGroups:undefined},{...row,operation_continuity_overrides:[]},snapshots);
  const overrides=overridesSchema.parse(row.operation_continuity_overrides??[]);
  return (input.operationContinuityGroups??[]).map(group=>({
    ...group,name:snapshots.find(snapshot=>snapshot.continuityGroup?.id===group.id)?.continuityGroup?.name??"Grupo operativo del día",
    baseline:baseline.operationContinuityGroups!.find(original=>original.id===group.id)!,
    source:overrides.some(item=>item.groupId===group.id)?"DAY_OVERRIDE" as const:"DAY_SNAPSHOT" as const,
  }));
}
