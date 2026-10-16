export type StageLineageNode = { id: number; parentStageId: number | null };

// Shared with accepted-exception inheritance. Returns active → root; callers
// choose presentation order without inferring ancestry from ordinal or date.
export function resolveActiveStageLineage<T extends StageLineageNode>(stages: readonly T[], stageId: number): T[] {
  const byId = new Map(stages.map(stage => [stage.id, stage]));
  const lineage: T[] = [], seen = new Set<number>();
  let cursor = byId.get(stageId);
  while (cursor) {
    if (seen.has(cursor.id)) throw new Error("CORRUPT_STAGE_LINEAGE");
    seen.add(cursor.id);
    lineage.push(cursor);
    if (cursor.parentStageId == null) break;
    cursor = byId.get(cursor.parentStageId);
    if (!cursor) throw new Error("CORRUPT_STAGE_LINEAGE");
  }
  if (lineage[0]?.id !== stageId) throw new Error("STALE_BASE_STAGE");
  return lineage;
}
