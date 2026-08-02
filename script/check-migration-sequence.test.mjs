import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkMigrationDirectory } from "./check-migration-sequence.mjs";

const baseline = Object.freeze({
  cutoff: 70,
  firstPostCutoff: 71,
  historicalFiles: Object.freeze(["034_a.sql", "034_b.sql", "070_cutoff.sql"]),
});
const valid = ["034_a.sql", "034_b.sql", "070_cutoff.sql", "071_one.sql", "072_two.sql", "073_three.sql"];

async function fixture(names, assertion) {
  const directory = await mkdtemp(join(tmpdir(), "migration-sequence-"));
  try {
    for (const name of names) await writeFile(join(directory, name), "-- fixture\n");
    return await assertion(directory);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test("accepts audited historical baseline and continuous 071-073", async () => {
  await fixture(valid, async (directory) => assert.deepEqual((await checkMigrationDirectory(directory, baseline)).postCutoffPrefixes, [71, 72, 73]));
});
test("rejects a post-cutoff duplicate", async () => {
  await fixture([...valid, "072_duplicate.sql"], async (directory) => await assert.rejects(checkMigrationDirectory(directory, baseline), /duplicate prefix 072/));
});
test("rejects a new migration at or below 070", async () => {
  await fixture([...valid, "069_late.sql"], async (directory) => await assert.rejects(checkMigrationDirectory(directory, baseline), /prefix 069.*not in the audited historical baseline/));
});
test("rejects a gap in the post-cutoff sequence", async () => {
  await fixture(valid.filter((name) => name !== "072_two.sql"), async (directory) => await assert.rejects(checkMigrationDirectory(directory, baseline), /expected prefix 072, found 073/));
});
test("rejects a filename without a canonical prefix", async () => {
  await fixture([...valid, "migration.sql"], async (directory) => await assert.rejects(checkMigrationDirectory(directory, baseline), /invalid migration filename/));
});
test("filesystem order does not affect deterministic output", async () => {
  const first = await fixture(valid, (directory) => checkMigrationDirectory(directory, baseline));
  const second = await fixture([...valid].reverse(), (directory) => checkMigrationDirectory(directory, baseline));
  assert.deepEqual(first, second);
});
test("rejects a new unauthorized historical collision", async () => {
  await fixture([...valid, "034_new.sql"], async (directory) => await assert.rejects(checkMigrationDirectory(directory, baseline), /prefix 034.*not in the audited historical baseline/));
});
test("rejects a missing audited historical file", async () => {
  await fixture(valid.filter((name) => name !== "034_b.sql"), async (directory) => await assert.rejects(checkMigrationDirectory(directory, baseline), /034_b.sql: audited historical migration is missing/));
});
