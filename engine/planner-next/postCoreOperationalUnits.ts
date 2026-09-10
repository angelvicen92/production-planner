import type { Task } from "./contracts";

export interface PostCoreWorkItem {
  readonly id: string;
  readonly kind?: string;
  readonly tasks: readonly Task[];
}

export interface PostCoreOperationalUnit<T extends PostCoreWorkItem> {
  readonly id: string;
  readonly workItems: readonly T[];
  readonly memberCount: number;
}

const canonicalResourceSignature = (item: PostCoreWorkItem): string =>
  [...new Set(item.tasks.flatMap((task) => task.requiredResourceIds ?? []))].sort().join("\u0000");

/** Derives identity groups without confusing resource conflicts with identity. */
export function derivePostCoreOperationalUnits<T extends PostCoreWorkItem>(items: readonly T[]): PostCoreOperationalUnit<T>[] {
  const ordered = [...items].sort((a, b) => a.id.localeCompare(b.id, "en"));
  const groups = new Map<string, T[]>();
  for (const item of ordered) {
    const itinerantIds = [...new Set(item.tasks.flatMap((task) =>
      task.itinerantUnitId === undefined ? [] : [task.itinerantUnitId]))].sort();
    const identity = itinerantIds.length === 1
      ? `itinerant:${itinerantIds[0]}`
      : item.kind === "RESOURCE_TASK" && itinerantIds.length === 0
        ? `resource-signature:${canonicalResourceSignature(item)}`
        : `structural:${item.id}`;
    const group = groups.get(identity) ?? [];
    group.push(item);
    groups.set(identity, group);
  }
  return [...groups.values()].map((workItems) => {
    workItems.sort((a, b) => a.id.localeCompare(b.id, "en"));
    return { id: `operational:${workItems.map(({ id }) => id).join("+")}`, workItems,
      memberCount: workItems.reduce((count, item) => count + item.tasks.length, 0) };
  }).sort((a, b) => a.id.localeCompare(b.id, "en"));
}
