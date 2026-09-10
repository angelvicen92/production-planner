import type { Task } from "./contracts";

export interface PostCoreWorkItem {
  readonly id: string;
  readonly tasks: readonly Task[];
}

export interface PostCoreOperationalUnit<T extends PostCoreWorkItem> {
  readonly id: string;
  readonly workItems: readonly T[];
  readonly memberCount: number;
}

/**
 * Derives connected components exclusively from explicit hard authorities. An
 * itinerant-unit authority or a required resource shared by any member joins
 * whole work items; the transitive closure deliberately preserves that
 * structural relationship without inferring one from names or spaces.
 */
export function derivePostCoreOperationalUnits<T extends PostCoreWorkItem>(items: readonly T[]): PostCoreOperationalUnit<T>[] {
  const ordered = [...items].sort((a, b) => a.id.localeCompare(b.id, "en"));
  const parent = ordered.map((_, index) => index);
  const root = (index: number): number => parent[index] === index ? index : (parent[index] = root(parent[index]!));
  const join = (left: number, right: number): void => {
    const a = root(left), b = root(right);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  };
  const owners = new Map<string, number>();
  ordered.forEach((item, index) => {
    const authorities = new Set<string>();
    for (const task of item.tasks) {
      if (task.itinerantUnitId !== undefined) authorities.add(`itinerant:${task.itinerantUnitId}`);
      for (const resourceId of task.requiredResourceIds ?? []) authorities.add(`resource:${resourceId}`);
    }
    for (const authority of [...authorities].sort()) {
      const owner = owners.get(authority);
      if (owner === undefined) owners.set(authority, index); else join(index, owner);
    }
  });
  const components = new Map<number, T[]>();
  ordered.forEach((item, index) => {
    const component = components.get(root(index)) ?? [];
    component.push(item); components.set(root(index), component);
  });
  return [...components.values()].map((workItems) => {
    workItems.sort((a, b) => a.id.localeCompare(b.id, "en"));
    return { id: `operational:${workItems.map(({ id }) => id).join("+")}`, workItems,
      memberCount: workItems.reduce((count, item) => count + item.tasks.length, 0) };
  }).sort((a, b) => a.id.localeCompare(b.id, "en"));
}
