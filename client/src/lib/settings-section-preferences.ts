export type SettingsSection = "program" | "optimizer" | "control-room" | "templates" | "spaces" | "column-order" | "transport" | "resources" | "people" | "teams" | "staff-defaults" | "users";
export const settingsSectionKey = (userId: string, section: SettingsSection) =>
  `optiplan:settings-section:v1:${encodeURIComponent(userId)}:${section}`;
export const settingsSectionChanged = "optiplan:settings-section-change";
const memory = new Map<string, boolean>();

export function readSettingsSection(key: string): boolean {
  if (memory.has(key)) return memory.get(key)!;
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === "true" || stored === "false") return stored === "true";
  } catch {}
  return true;
}
export function writeSettingsSection(key: string, open: boolean) {
  memory.set(key, open);
  try { window.localStorage.setItem(key, String(open)); } catch {}
  window.dispatchEvent(new Event(settingsSectionChanged));
}
export function clearSettingsSectionMemory(key: string) { memory.delete(key); }
