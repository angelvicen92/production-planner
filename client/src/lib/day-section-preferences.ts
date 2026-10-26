type DynamicDaySection = `resources-zone-${number}` | `resources-type-${number}` | `staff-zone-${number}` | `staff-team-${number}`;
export type DaySection = keyof typeof daySectionDefaults | DynamicDaySection;
export const daySectionDefaults = {
  "assisted-scope": true,
  "assisted-editing": false,
  "assisted-history": false,
  "assisted-maintenance": false,
  "task-contestants": true,
  "task-administration": false,
  "resources-add": false,
  "resources-zones": true,
  "configuration-workday": true,
  "configuration-flow": true,
  "configuration-rules": true,
  "configuration-rounds": true,
  "configuration-technical-chains": true,
  "configuration-continuity": true,
  "configuration-optimization": true,
  "configuration-complementary": false,
  "configuration-capabilities": false,
  "staff-zones": true,
  "staff-reality": true,
  "execution-filters": false,
  "execution-tasks": true,
};
export function daySectionDefault(section: DaySection): boolean {
  return section in daySectionDefaults ? daySectionDefaults[section as keyof typeof daySectionDefaults] : true;
}
export const daySectionKey = (userId: string, planId: number, section: DaySection) =>
  `optiplan:day-section:v1:${encodeURIComponent(userId)}:${planId}:${section}`;

export const daySectionChanged = "optiplan:day-section-change";
// Retain preferences in memory if browser storage is unavailable or full.
const memory = new Map<string, boolean>();
export function readDaySection(key: string, fallback: boolean): boolean {
  if (memory.has(key)) return memory.get(key)!;
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === "true" || stored === "false") return stored === "true";
  } catch {}
  return memory.get(key) ?? fallback;
}
export function writeDaySection(key: string, open: boolean) {
  memory.set(key, open);
  try { window.localStorage.setItem(key, String(open)); } catch {}
  window.dispatchEvent(new Event(daySectionChanged));
}

export function clearDaySectionMemory(key: string) { memory.delete(key); }
