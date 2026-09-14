const columnMap: Record<string, string> = {
  planId: "plan_id", parentRevisionId: "parent_revision_id", createdBy: "created_by", createdAt: "created_at",
  identityJson: "identity_json", replaySnapshotJson: "replay_snapshot_json", diffJson: "diff_json",
  activeStageId: "active_stage_id", draftBaseStageId: "draft_base_stage_id", currentConfigRevisionId: "current_config_revision_id",
  draftScopeJson: "draft_scope_json", draftSnapshotJson: "draft_snapshot_json", draftFingerprint: "draft_fingerprint",
  draftValidationId: "draft_validation_id", updatedAt: "updated_at", sessionId: "session_id", parentStageId: "parent_stage_id",
  scopeJson: "scope_json", scopeTaskIdsJson: "scope_task_ids_json", includePrerequisites: "include_prerequisites",
  configRevisionId: "config_revision_id", proposalRunId: "proposal_run_id", snapshotJson: "snapshot_json",
  snapshotFingerprint: "snapshot_fingerprint", validationSummaryJson: "validation_summary_json", acceptedBy: "accepted_by",
  acceptedAt: "accepted_at", archivedAt: "archived_at", baseStageId: "base_stage_id", hardCount: "hard_count",
  requiredCount: "required_count", preferredCount: "preferred_count", reportJson: "report_json", ruleCode: "rule_code",
  violationKey: "violation_key", affectedTaskIdsJson: "affected_task_ids_json", detailsJson: "details_json", resolvedAt: "resolved_at",
};

export function mapAssistedPersistenceRow<T>(row: Record<string, unknown>): T {
  const reverse = Object.fromEntries(Object.entries(columnMap).map(([camel, snake]) => [snake, camel]));
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [reverse[key] ?? key, value])) as T;
}

export function toAssistedPersistenceRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined).map(([key, value]) => [columnMap[key] ?? key, value]));
}
