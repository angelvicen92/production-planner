import type {EngineInput,TaskInput} from "./types";

const isPositiveInteger=(value:unknown):value is number=>typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0;
const normalizedIds=(values:readonly number[]):readonly number[]=>Object.freeze([...new Set(values.filter(isPositiveInteger))].sort((a,b)=>a-b));

/** Same identity/capacity authority for fixed requirements and nominal domains. */
export function resolveConcreteResourceItem(input: EngineInput, resourceItemId: string, quantity: number) {
  const matches = input.planResourceItems.filter(item => String(item.resourceItemId) === resourceItemId);
  const auxiliaryCapacityMissing = matches.length === 1 && (matches[0].typeCode === "auxiliar" || matches[0].category === "auxiliar");
  const reason = quantity !== 1 ? "UNREPRESENTABLE_QUANTITY" : matches.length > 1 ? "AMBIGUOUS_DAILY_RESOURCE"
    : matches.length !== 1 || !isPositiveInteger(matches[0].id) ? "MISSING_DAILY_RESOURCE"
    : auxiliaryCapacityMissing ? "UNREPRESENTABLE_AUXILIARY_CAPACITY" : null;
  return {resource: reason ? undefined : matches[0], issue: reason ? {resourceItemId,quantity,dailyResourceIds:matches.map(item=>item.id).sort((a,b)=>a-b),reason} : undefined};
}

/** No selection: only a single daily identity can represent one concrete item. */
export function resolveConcreteTaskResourceRequirements(input: EngineInput, task: TaskInput) {
  const resourceIds: number[] = [];
  const issues: {resourceItemId: string; quantity: number; dailyResourceIds: number[]; reason: string}[] = [];
  for (const [resourceItemId, quantity] of Object.entries(task.resourceRequirements?.byItem ?? {}).sort(([a],[b])=>a.localeCompare(b))) {
    const resolved=resolveConcreteResourceItem(input,resourceItemId,quantity);
    if(resolved.issue)issues.push(resolved.issue);else resourceIds.push(resolved.resource!.id);
  }
  return {resourceIds: normalizedIds(resourceIds), issues};
}

