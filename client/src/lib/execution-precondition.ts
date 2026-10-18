/** Adapt existing Start/Finish callers without changing their components.
 * Disagreeing/missing cache versions fail closed at the HTTP schema boundary.
 */
export function executionPrecondition(method: string, path: string, data: unknown, snapshots: unknown[]): unknown {
  const match = /^\/api\/tasks\/(\d+)\/status\/?$/i.exec(path);
  if (method.toUpperCase() !== 'PATCH' || !match || !data || typeof data !== 'object' || 'expectedVersion' in data) return data;
  const versions = new Set<number>();
  for (const snapshot of snapshots) {
    const tasks = Array.isArray(snapshot) ? snapshot : (snapshot as any)?.dailyTasks;
    if (!Array.isArray(tasks)) continue;
    for (const task of tasks) if (Number(task?.id) === Number(match[1]) && task?.status === (data as any).expectedStatus && Number.isSafeInteger(task?.executionVersion)) versions.add(task.executionVersion);
  }
  return { ...data, expectedVersion: versions.size === 1 ? [...versions][0] : undefined };
}
