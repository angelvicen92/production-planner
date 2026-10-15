import assert from "node:assert/strict";
import test from "node:test";
import { settingsSectionKey, settingsSectionChanged, readSettingsSection, writeSettingsSection, clearSettingsSectionMemory } from "./settings-section-preferences";

test("global sections isolate users and sections, reload, corrupt storage and quota fallback", () => {
  const storage = new Map<string, string>();
  const target = new EventTarget();
  Object.assign(globalThis, { window: Object.assign(target, { localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
  } }) });
  try {
    let changes = 0;
    target.addEventListener(settingsSectionChanged, () => changes++);
    const key = settingsSectionKey("operator:a", "program");
    assert.equal(readSettingsSection(key), true);
    writeSettingsSection(key, false);
    assert.equal(changes, 1);
    clearSettingsSectionMemory(key);
    assert.equal(readSettingsSection(key), false);
    assert.equal(readSettingsSection(settingsSectionKey("operator:b", "program")), true);
    assert.equal(readSettingsSection(settingsSectionKey("operator:a", "templates")), true);
    storage.set(key, "invalid");
    assert.equal(readSettingsSection(key), true);
    storage.delete(key);
    assert.equal(readSettingsSection(key), true);
    window.localStorage.setItem = () => { throw new Error("quota"); };
    writeSettingsSection(key, false);
    window.localStorage.getItem = () => { throw new Error("blocked"); };
    assert.equal(readSettingsSection(key), false);
    assert.equal(readSettingsSection("new"), true);
    assert.ok(!key.includes("day-section"));
    assert.notEqual(settingsSectionKey("a:b", "program"), settingsSectionKey("a%3Ab", "program"));
  } finally { Reflect.deleteProperty(globalThis, "window"); }
});
