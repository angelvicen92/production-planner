import { buildAssistedPlanningSnapshotV1, fingerprintAssistedPlanningSnapshotV1, type AssistedPlanningSnapshotV1, type AssistedPlanningTaskSnapshotV1 } from './assistedPlanningSnapshot';

/** An operational projection, never a replacement for the historical Stage. */
export function projectAssistedWorkingOrigin(stage: AssistedPlanningSnapshotV1, pending: readonly AssistedPlanningTaskSnapshotV1[]) {
  const ids = new Set(stage.tasks.map(task => task.taskId));
  const canonical = buildAssistedPlanningSnapshotV1(
    [...stage.tasks, ...pending.filter(task => !ids.has(task.taskId))].map(task => ({ id: task.taskId, ...task })),
    stage.planningBlocks, stage.operationalMeals, stage.setupPreparations, stage.roundPreparations,
  );
  const snapshot = {...structuredClone(stage),tasks:canonical.tasks};
  return { snapshot, fingerprint: fingerprintAssistedPlanningSnapshotV1(snapshot) };
}

export function assistedWorkingOrigin(session: { workingSnapshotJson?: unknown; workingFingerprint?: string | null }, stage: { snapshotJson: unknown; snapshotFingerprint: string }) {
  return { snapshot: (session.workingSnapshotJson ?? stage.snapshotJson) as AssistedPlanningSnapshotV1,
    fingerprint: session.workingFingerprint ?? stage.snapshotFingerprint };
}
