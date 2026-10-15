import assert from "node:assert/strict";
import test from "node:test";
import { daySectionDefaults, daySectionKey, readDaySection, writeDaySection, clearDaySectionMemory } from "./day-section-preferences";

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
