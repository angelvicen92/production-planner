const fs = require("node:fs");

const sourceCriticalityPath = "engine/buildInput.sourceCriticality.spec.ts";
let sourceCriticality = fs.readFileSync(sourceCriticalityPath, "utf8");
const snapshotListAnchor = `  const plan = {`;
if (!sourceCriticality.includes(`  const snapshots = [snapshot];`)) {
  const first = sourceCriticality.indexOf(snapshotListAnchor);
  if (first < 0 || sourceCriticality.indexOf(snapshotListAnchor, first + snapshotListAnchor.length) >= 0) {
    throw new Error("Missing or ambiguous source-criticality snapshot-list anchor");
  }
  sourceCriticality = sourceCriticality.slice(0, first)
    + `  const snapshots = [snapshot];\n`
    + sourceCriticality.slice(first);
}
const loaderAnchor = `    getPlanTaskTemplateSnapshots: async () => [snapshot],`;
if (sourceCriticality.includes(loaderAnchor)) {
  sourceCriticality = sourceCriticality.replace(
    loaderAnchor,
    `    getPlanTaskTemplateSnapshots: async () => snapshots,`,
  );
}
fs.writeFileSync(sourceCriticalityPath, sourceCriticality, "utf8");

const applicatorPath = "scripts/apply-spec11-010-checkpoint3.cjs";
let applicator = fs.readFileSync(applicatorPath, "utf8");
const oldRangeReturn = `  return source.slice(0, startIndex) + replacement + source.slice(endIndex);`;
const newRangeReturn = `  return source.slice(0, startIndex) + replacement + source.slice(endIndex + end.length);`;
if (applicator.split(oldRangeReturn).length - 1 !== 1) {
  throw new Error("Checkpoint-3 applicator range helper is not in the expected preflight state");
}
applicator = applicator.replace(oldRangeReturn, newRangeReturn);

// Execute the reviewed applicator without mutating its versioned source file.
// eslint-disable-next-line no-eval
eval(applicator);
