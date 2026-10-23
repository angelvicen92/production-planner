import type {EngineInput,TaskInput} from "./types";

const isPositiveInteger=(value:unknown):value is number=>typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0;
const normalizedIds=(values:readonly number[]):readonly number[]=>Object.freeze([...new Set(values.filter(isPositiveInteger))].sort((a,b)=>a-b));

/** No selection: only a single daily identity can represent one concrete item. */
export function resolveConcreteTaskResourceRequirements(input: EngineInput, task: TaskInput) {
  const resourceIds: number[] = [];
  const issues: {resourceItemId: string; quantity: number; dailyResourceIds: number[]; reason: string}[] = [];
  for (const [resourceItemId, quantity] of Object.entries(task.resourceRequirements?.byItem ?? {}).sort(([a],[b])=>a.localeCompare(b))) {
    const matches = input.planResourceItems.filter(item => String(item.resourceItemId) === resourceItemId);
    // The input has no contract for an auxiliary's zone-sharing/attention capacity.
    // A concrete identity must not silently turn that capacity into exclusivity.
    const auxiliaryCapacityMissing = matches.length === 1 && (matches[0].typeCode === "auxiliar" || matches[0].category === "auxiliar");
    if (quantity !== 1 || matches.length !== 1 || !isPositiveInteger(matches[0].id) || auxiliaryCapacityMissing) {
      issues.push({resourceItemId, quantity, dailyResourceIds: matches.map(item=>item.id).sort((a,b)=>a-b),
        reason: quantity !== 1 ? "UNREPRESENTABLE_QUANTITY" : matches.length > 1 ? "AMBIGUOUS_DAILY_RESOURCE" : auxiliaryCapacityMissing ? "UNREPRESENTABLE_AUXILIARY_CAPACITY" : "MISSING_DAILY_RESOURCE"});
    } else resourceIds.push(matches[0].id);
  }
  return {resourceIds: normalizedIds(resourceIds), issues};
}

