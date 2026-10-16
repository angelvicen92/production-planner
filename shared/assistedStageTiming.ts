export type StageTimeInterval = { start: string; end: string; durationMs: number };
export type AssistedStageTiming = {
  stageId: number;
  generation: StageTimeInterval | null;
  requestToAcceptance: StageTimeInterval | null;
};
export type ProposalRunTimes = { createdAt: string | null; startedAt: string | null; finishedAt: string | null };

// Require a real timestamp with timezone, not a date interpreted in browser time.
export function stageTimestamp(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > days || hour > 23 || minute > 59 || second > 59) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function stageTiming(stage: { id: number; ordinal: number; acceptedAt: string | null }, run?: ProposalRunTimes): AssistedStageTiming {
  const unavailable: AssistedStageTiming = { stageId: Number(stage.id), generation: null, requestToAcceptance: null };
  if (Number(stage.ordinal) === 0 || !run) return unavailable;
  const values = [run.createdAt, run.startedAt, run.finishedAt, stage.acceptedAt];
  const known = values.map(stageTimestamp).filter((ms): ms is number => ms !== null);
  // Reject inconsistent chronology, even when the individual interval is positive.
  if (known.some((ms, index) => index > 0 && ms < known[index - 1])) return unavailable;
  const interval = (start: string | null, end: string | null): StageTimeInterval | null => {
    const from = stageTimestamp(start), to = stageTimestamp(end);
    return from === null || to === null || to < from ? null : { start: start!, end: end!, durationMs: to - from };
  };
  return { stageId: Number(stage.id), generation: interval(run.startedAt, run.finishedAt), requestToAcceptance: interval(run.createdAt, stage.acceptedAt) };
}
