import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { discoverSpecFiles } from "../../script/run-test-suite.mjs";

test("discoverSpecFiles finds only nested .spec.ts files in sorted repo-relative order", () => {
  const root = mkdtempSync(path.join(tmpdir(), "run-test-suite-"));
  mkdirSync(path.join(root, "engine", "z"), { recursive: true });
  mkdirSync(path.join(root, "engine", "a"), { recursive: true });
  mkdirSync(path.join(root, "server"), { recursive: true });
  writeFileSync(path.join(root, "engine", "z", "later.spec.ts"), "");
  writeFileSync(path.join(root, "engine", "a", "first.spec.ts"), "");
  writeFileSync(path.join(root, "engine", "a", "helper.ts"), "");
  writeFileSync(path.join(root, "engine", "a", "almost.spec.tsx"), "");
  writeFileSync(path.join(root, "server", "api.spec.ts"), "");

  assert.deepEqual(discoverSpecFiles(["engine", "server"], { root }), [
    "engine/a/first.spec.ts",
    "engine/z/later.spec.ts",
    "server/api.spec.ts",
  ]);
});

test("discoverSpecFiles returns an empty list when no tests exist", () => {
  const root = mkdtempSync(path.join(tmpdir(), "run-test-suite-empty-"));
  mkdirSync(path.join(root, "engine", "nested"), { recursive: true });
  writeFileSync(path.join(root, "engine", "nested", "helper.ts"), "");
  assert.deepEqual(discoverSpecFiles(["engine"], { root }), []);
});
