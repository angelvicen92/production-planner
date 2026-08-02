import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { migrationSequenceBaseline } from "./migration-sequence-baseline.mjs";

const NAME = /^(\d{3})_[a-z0-9][a-z0-9_]*\.sql$/;

export function validateMigrationFilenames(inputFilenames, baseline = migrationSequenceBaseline) {
  const filenames = [...inputFilenames].sort((a, b) => a.localeCompare(b));
  const errors = [];
  const historical = new Set(baseline.historicalFiles);
  const seen = new Map();

  for (const filename of filenames) {
    const match = NAME.exec(filename);
    if (!match) {
      errors.push(`${filename}: invalid migration filename; expected NNN_name.sql`);
      continue;
    }
    const prefix = Number(match[1]);
    const group = seen.get(prefix) ?? [];
    group.push(filename);
    seen.set(prefix, group);
    if (prefix <= baseline.cutoff && !historical.has(filename)) {
      errors.push(`${filename}: prefix ${match[1]} is at or before authoritative cutoff ${String(baseline.cutoff).padStart(3, "0")} and is not in the audited historical baseline`);
    }
  }

  for (const filename of [...historical].sort()) {
    if (!filenames.includes(filename)) errors.push(`${filename}: audited historical migration is missing`);
  }
  for (const [prefix, files] of [...seen.entries()].sort((a, b) => a[0] - b[0])) {
    if (files.length > 1 && (prefix > baseline.cutoff || files.some((file) => !historical.has(file)))) {
      errors.push(`${files.join(", ")}: duplicate prefix ${String(prefix).padStart(3, "0")} is not an authorized historical collision`);
    }
  }

  const postPrefixes = [...seen.keys()].filter((prefix) => prefix > baseline.cutoff).sort((a, b) => a - b);
  if (postPrefixes.length === 0) errors.push(`post-cutoff sequence is missing; expected prefix ${String(baseline.firstPostCutoff).padStart(3, "0")}`);
  else {
    for (let expected = baseline.firstPostCutoff, index = 0; expected <= postPrefixes.at(-1); expected += 1, index += 1) {
      const actual = postPrefixes[index];
      if (actual !== expected) {
        const related = actual === undefined ? "<none>" : (seen.get(actual) ?? []).join(", ");
        errors.push(`${related}: post-cutoff sequence gap; expected prefix ${String(expected).padStart(3, "0")}, found ${actual === undefined ? "end of sequence" : String(actual).padStart(3, "0")}`);
        break;
      }
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  return Object.freeze({ historicalCount: historical.size, postCutoffPrefixes: Object.freeze(postPrefixes), files: Object.freeze(filenames) });
}

export async function checkMigrationDirectory(directory, baseline = migrationSequenceBaseline) {
  const filenames = (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith(".sql")).map((entry) => entry.name);
  return validateMigrationFilenames(filenames, baseline);
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const directory = resolve(dirname(fileURLToPath(import.meta.url)), "../supabase/migrations");
  try {
    const result = await checkMigrationDirectory(directory);
    console.log(`Migration sequence valid: ${result.historicalCount} historical files; post-cutoff ${result.postCutoffPrefixes.map((value) => String(value).padStart(3, "0")).join(", ")}.`);
  } catch (error) {
    console.error(`Migration sequence invalid:\n${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
