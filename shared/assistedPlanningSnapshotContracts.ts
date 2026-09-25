export const ASSISTED_PLANNING_SNAPSHOT_CONTRACT_VERSION = 1 as const;

export interface AssistedPlanningTaskSnapshotV1 {
  readonly taskId: number;
  readonly startPlanned: string | null;
  readonly endPlanned: string | null;
  readonly zoneId: number | null;
  readonly spaceId: number | null;
  readonly locationLabel: string | null;
  readonly durationOverride: number | null;
  readonly camerasOverride: number | null;
}

export interface AssistedPlanningBlockV1 {
  readonly blockId: string;
  readonly memberTaskIds: readonly number[];
  readonly scopeProvenance: Readonly<Record<string, unknown>>;
  readonly spaceId: number | null;
  readonly activityTemplateId: number;
  readonly order: number;
}

/** An operational meal interval accepted as part of the planning, not policy configuration. */
export interface AssistedOperationalMealSnapshotV1 {
  readonly policyId: string;
  readonly startPlanned: string;
  readonly endPlanned: string;
}

/** A setup occupation accepted with a stage, expressed in source identities. */
export interface AssistedSetupPreparationSnapshotV1 {
  readonly id: string;
  readonly spaceId: number;
  readonly setupFamilyId: string;
  readonly entryIndex: number;
  readonly duration: number;
  readonly start: number;
  readonly end: number;
}

export interface AssistedPlanningSnapshotV1 {
  readonly contractVersion: typeof ASSISTED_PLANNING_SNAPSHOT_CONTRACT_VERSION;
  /** Complete task catalog for the day, including unplaced tasks. */
  readonly tasks: readonly AssistedPlanningTaskSnapshotV1[];
  /** WorkingPlan-only grouping metadata. Omitted for legacy/blockless snapshots. */
  readonly planningBlocks?: readonly AssistedPlanningBlockV1[];
  /** Omitted for legacy snapshots and when no operational meal decision has been accepted. */
  readonly operationalMeals?: readonly AssistedOperationalMealSnapshotV1[];
  /** Omitted for legacy snapshots and when no setup preparation was accepted. */
  readonly setupPreparations?: readonly AssistedSetupPreparationSnapshotV1[];
}
