import { timeToMinutes } from "./time";

type SortTask = { templateId: number; startPlanned: string | null; endPlanned?: string | null };
type Lane<T> = [string, { name: string; tasks: T[] }];
export type ContestantLaneOrder = { mode: "name" | "arrival" | "first" | "last"; arrivals?: Record<string, string | null> } | { mode: "task"; templateId: number };

export function sortContestantLanes<T extends SortTask>(entries: Lane<T>[], order?: number | ContestantLaneOrder): Lane<T>[] {
  const mode = typeof order === "number" ? "task" : order?.mode ?? "name";
  const templateId = typeof order === "number" ? order : order?.mode === "task" ? order.templateId : undefined;
  const earliest = (lane: Lane<T>): number | null => {
    if (mode === "name") return null;
    if (mode === "arrival") {
      const arrival = typeof order === "object" && "arrivals" in order ? order.arrivals?.[lane[0]] : null;
      return arrival && /^\d{2}:\d{2}/.test(arrival) ? timeToMinutes(arrival) : null;
    }
    const starts = lane[1].tasks.filter(task => mode !== "task" || Number(task.templateId) === templateId)
      .map(task => mode === "last" ? task.endPlanned : task.startPlanned).filter((time): time is string => !!time)
      .map(timeToMinutes).filter(Number.isFinite);
    return starts.length ? mode === "last" ? Math.max(...starts) : Math.min(...starts) : null;
  };
  return entries.map(entry => ({ entry, start: earliest(entry) }))
    .sort((a, b) => {
      if (a.entry[0] === "none") return 1;
      if (b.entry[0] === "none") return -1;
      if (a.start !== null && b.start !== null) return a.start - b.start || a.entry[1].name.localeCompare(b.entry[1].name) || a.entry[0].localeCompare(b.entry[0], undefined, { numeric: true });
      if (a.start !== null) return -1;
      if (b.start !== null) return 1;
      return a.entry[1].name.localeCompare(b.entry[1].name) || a.entry[0].localeCompare(b.entry[0], undefined, { numeric: true });
    }).map(row => row.entry);
}
