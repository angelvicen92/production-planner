import assert from "node:assert/strict";
import test from "node:test";
import { daySectionDefaults, daySectionDefault, daySectionKey, readDaySection, writeDaySection, clearDaySectionMemory, type DaySection } from "./day-section-preferences";

test("preferences isolate user, day and section, tolerate bad storage and retain useful defaults", () => {
  const storage = new Map<string, string>();
  const target = new EventTarget();
  Object.assign(globalThis, { window: Object.assign(target, { localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
  } }) });
  const key = daySectionKey("operator", 42, "assisted-scope");
  assert.equal(readDaySection(key, true), true);
  writeDaySection(key, false);
  clearDaySectionMemory(key); // A fresh mount/reload reads the stored preference.
  assert.equal(readDaySection(key, true), false);
  assert.equal(readDaySection(daySectionKey("other", 42, "assisted-scope"), true), true);
  assert.equal(readDaySection(daySectionKey("operator", 43, "assisted-scope"), true), true);
  assert.equal(readDaySection(daySectionKey("operator", 42, "task-contestants"), true), true);
  storage.set(key, "{bad json}");
  assert.equal(readDaySection(key, true), true);
  storage.delete(key);
  assert.equal(readDaySection(key, true), true);
  window.localStorage.setItem = () => { throw new Error("quota"); };
  writeDaySection(key, false);
  assert.equal(readDaySection(key, true), false);
  window.localStorage.getItem = () => { throw new Error("blocked"); };
  assert.equal(readDaySection(key, true), false);
  assert.equal(readDaySection("unseen", true), true);
  assert.equal(daySectionDefaults["assisted-scope"], true);
  for (const section of ["assisted-editing", "assisted-history", "assisted-maintenance", "task-administration"] as const)
    assert.equal(daySectionDefaults[section], false);
  Reflect.deleteProperty(globalThis, "window");
});

test("remaining tabs and stable dynamic identities preserve independent preferences after reload", () => {
  const storage = new Map<string, string>();
  Object.assign(globalThis, { window: Object.assign(new EventTarget(), { localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
  } }) });
  try {
    const sections: DaySection[] = ["resources-add", "resources-zones", "resources-zone-8", "resources-zone-9", "resources-type-8", "staff-zones", "staff-zone-8", "staff-reality", "staff-team-8", "configuration-workday", "configuration-flow", "configuration-rules", "configuration-optimization", "configuration-complementary", "configuration-capabilities", "execution-filters", "execution-tasks"];
    assert.equal(daySectionDefault("execution-tasks"), true);
    for (const section of ["resources-add", "configuration-complementary", "configuration-capabilities", "execution-filters"] as const) assert.equal(daySectionDefault(section), false);
    assert.equal(daySectionDefault("resources-zone-8"), true);
    const keys = sections.map(section => daySectionKey("operator:name/ñ", 27001, section));
    assert.equal(new Set(keys).size, sections.length);
    for (const [index, key] of keys.entries()) {
      writeDaySection(key, index % 2 === 0);
      clearDaySectionMemory(key);
    }
    // Reordering or renaming a dynamic group cannot change its ID-based key.
    for (const section of [...sections].reverse()) {
      const index = sections.indexOf(section);
      const key = daySectionKey("operator:name/ñ", 27001, section);
      assert.equal(readDaySection(key, !Boolean(index % 2 === 0)), index % 2 === 0);
      assert.equal(readDaySection(daySectionKey("viewer", 27001, section), daySectionDefault(section)), daySectionDefault(section));
      assert.equal(readDaySection(daySectionKey("operator:name/ñ", 27002, section), daySectionDefault(section)), daySectionDefault(section));
    }
  } finally { Reflect.deleteProperty(globalThis, "window"); }
});
