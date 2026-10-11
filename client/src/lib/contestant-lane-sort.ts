import { timeToMinutes } from "./time";

type SortTask = { templateId: number; startPlanned: string | null };
type Lane<T> = [string, { name: string; tasks: T[] }];

export function sortContestantLanes<T extends SortTask>(entries: Lane<T>[], templateId?: number): Lane<T>[] {
  const earliest = (lane: Lane<T>): number | null => {
    const starts = lane[1].tasks.filter(task => Number(task.templateId) === templateId && task.startPlanned)
      .map(task => timeToMinutes(task.startPlanned!)).filter(Number.isFinite);
    return starts.length ? Math.min(...starts) : null;
  };
  return entries.map(entry => ({ entry, start: templateId === undefined ? null : earliest(entry) }))
    .sort((a, b) => {
      if (a.entry[0] === "none") return 1;
      if (b.entry[0] === "none") return -1;
      if (a.start !== null && b.start !== null) return a.start - b.start || a.entry[1].name.localeCompare(b.entry[1].name);
      if (a.start !== null) return -1;
      if (b.start !== null) return 1;
      return a.entry[1].name.localeCompare(b.entry[1].name);
    }).map(row => row.entry);
}
