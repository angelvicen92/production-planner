import type { PlanOptimizerSnapshotV1 } from "./planOptimizerSnapshot";
import type { PersistedTaskTemplateOperationalSnapshotV1 } from "./taskTemplateSnapshot";
import { buildPlanOptimizerRefreshPreviewV1, type PlanOptimizerRefreshPreviewV1 } from "./planOptimizerSnapshotRefreshPreview";

export interface PlanOptimizerRefreshPreviewStorageV1 {
  getPlanOptimizerSnapshot(planId: number): Promise<PlanOptimizerSnapshotV1>;
  getOptimizerSettings(): Promise<unknown>;
  getPlanTaskTemplateSnapshots(planId: number): Promise<readonly PersistedTaskTemplateOperationalSnapshotV1[]>;
  getPlanZoneSettings(planId: number): Promise<readonly unknown[]>;
}

function positivePlanId(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("INVALID_PLAN_ID: planId must be a positive integer");
  }
  return parsed;
}

function readZoneId(row: unknown): number | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const record = row as Record<string, unknown>;
  const parsed = Number(record.zoneId ?? record.zone_id);
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function getPlanOptimizerRefreshPreviewV1(
  planIdValue: unknown,
  storage: PlanOptimizerRefreshPreviewStorageV1,
): Promise<PlanOptimizerRefreshPreviewV1> {
  const planId = positivePlanId(planIdValue);
  const [currentSnapshot, globalOptimizerSettings, dailyTemplates, zoneRows] = await Promise.all([
    storage.getPlanOptimizerSnapshot(planId),
    storage.getOptimizerSettings(),
    storage.getPlanTaskTemplateSnapshots(planId),
    storage.getPlanZoneSettings(planId),
  ]);

  const dailyZoneIds = zoneRows
    .map(readZoneId)
    .filter((zoneId): zoneId is number => zoneId !== null)
    .sort((left, right) => left - right);

  return buildPlanOptimizerRefreshPreviewV1({
    currentSnapshot,
    globalOptimizerSettings,
    dailyTemplateSnapshots: dailyTemplates.map((snapshot) => ({
      sourceTemplateId: snapshot.sourceTemplateId,
      templateName: snapshot.templateName,
      planTemplateSnapshotId: snapshot.planTemplateSnapshotId,
    })),
    dailyZoneIds,
  });
}
