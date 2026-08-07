import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routes = await readFile(new URL("./routes.ts", import.meta.url), "utf8");
const sharedRoutes = await readFile(new URL("../shared/routes.ts", import.meta.url), "utf8");

function between(source: string, start: string, end: string): string {
  const a = source.indexOf(start); assert.notEqual(a, -1, `missing ${start}`);
  const b = source.indexOf(end, a + start.length); assert.notEqual(b, -1, `missing ${end}`);
  return source.slice(a, b);
}

test("shared contract exposes one read-only plan optimizer refresh preview endpoint", () => {
  const block = between(sharedRoutes, "planOptimizerSnapshotRefreshPreview:", "optimizerSettings:");
  assert.match(block, /method: "GET"/);
  assert.match(block, /\/api\/plans\/:id\/optimizer-snapshot\/refresh-preview/);
  assert.match(block, /planOptimizerRefreshPreviewApiSchema/);
  assert.doesNotMatch(block, /PATCH|POST|PUT|DELETE/);
});

test("server route validates access and delegates semantics to the preview service", () => {
  const block = between(routes, "// SPEC11-010 read-only optimizer refresh preview", "// Optimizer Settings \(defaults globales\)");
  assert.match(block, /app\.get\(api\.planOptimizerSnapshotRefreshPreview\.get\.path/);
  assert.match(block, /ensureUserCanAccessPlan/);
  assert.match(block, /getPlanOptimizerRefreshPreviewV1/);
  assert.match(block, /responses\[200\]\.parse\(preview\)/);
  assert.doesNotMatch(block, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});
