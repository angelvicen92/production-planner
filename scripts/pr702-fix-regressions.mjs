import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";

const TARGET_BRANCH = "codex/crea-nueva-rama-para-implementar-delta-full-a2";
const SELF = "scripts/pr702-fix-regressions.mjs";

const run = (command) => {
  console.log(`\n$ ${command}`);
  execSync(command, { stdio: "inherit" });
};

const replaceOnce = (path, before, after) => {
  const source = readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${path}: expected exactly one replacement target, found ${count}`);
  writeFileSync(path, source.replace(before, after));
};

if (execSync("git status --porcelain", { encoding: "utf8" }).trim()) {
  throw new Error("Working tree is not clean before repair.");
}

// Direct PlannerNext fixture: units 7 and 8 are productive identities, so they
// must carry explicit neutral availability independent from their meal break.
{
  const path = "engine/planner-next/scenarios/itinerantUnitMealScenario.ts";
  const source = readFileSync(path, "utf8");
  if (!source.includes("problem.itinerantUnits=")) {
    const needle = "  for(const task of problem.tasks){";
    const count = source.split(needle).length - 1;
    if (count !== 1) throw new Error(`${path}: unexpected insertion target count ${count}`);
    writeFileSync(path, source.replace(
      needle,
      "  problem.itinerantUnits=[{id:\"itinerant-team:7\",availability:[{...problem.day}]},{id:\"itinerant-team:8\",availability:[{...problem.day}]}];\n" + needle,
    ));
  }
}

// Coverage probe: when it synthesizes an itinerant unit, also synthesize the
// unit's authoritative availability from the fixture work day.
replaceOnce(
  "engine/planner-next/coverage/focalA2CapabilityProbes.ts",
  `  } else if (scope === "itinerant-unit") {\n    input.protectedBreaks = [{ id: "unit-meal", kind: "meal", start, end, itinerantTeamId: options.itinerantTeamId ?? 7 }];\n  } else {`,
  `  } else if (scope === "itinerant-unit") {\n    const itinerantTeamId = options.itinerantTeamId ?? 7;\n    input.protectedBreaks = [{ id: "unit-meal", kind: "meal", start, end, itinerantTeamId }];\n    input.itinerantUnitAvailabilityById = { [itinerantTeamId]: [{ ...input.workDay }] };\n  } else {`,
);

// A direct placement unit-scope test builds from mainFlowVocalScenario rather
// than the itinerant fixture, so give its two synthetic units explicit windows.
replaceOnce(
  "engine/planner-next/itinerantUnitMeals.spec.ts",
  `problem.itinerantUnitMeals=[{id:"meal-7",itinerantUnitId:"itinerant-team:7",interval:{start:720,end:780}}];\n  assert.equal(canPlaceTask`,
  `problem.itinerantUnitMeals=[{id:"meal-7",itinerantUnitId:"itinerant-team:7",interval:{start:720,end:780}}];problem.itinerantUnits=[{id:"itinerant-team:7",availability:[{...problem.day}]},{id:"itinerant-team:8",availability:[{...problem.day}]}];\n  assert.equal(canPlaceTask`,
);

run("npx tsx engine/planner-next/benchmarks/runPlannerNextItinerantUnitMealsBenchmark.ts > engine/planner-next/benchmarks/fixtures/spec10-015-itinerant-unit-meals-evidence.json");
run("npx tsx --test engine/planner-next/benchmarks/runPlannerNextItinerantUnitMealsBenchmark.spec.ts engine/planner-next/coverage/focalA2CapabilityAudit.spec.ts engine/planner-next/itinerantUnitMeals.spec.ts");
run("npm run check");
run("git diff --check");

unlinkSync(SELF);
run("git add engine/planner-next/scenarios/itinerantUnitMealScenario.ts engine/planner-next/coverage/focalA2CapabilityProbes.ts engine/planner-next/itinerantUnitMeals.spec.ts engine/planner-next/benchmarks/fixtures/spec10-015-itinerant-unit-meals-evidence.json scripts/pr702-fix-regressions.mjs");
run('git commit -m "Fix itinerant availability regression fixtures"');
run(`git push origin HEAD:${TARGET_BRANCH}`);

console.log("\nPR #702 actualizado; el script temporal se ha eliminado del resultado final.");
