#!/usr/bin/env bash
set -euo pipefail

TARGET_BRANCH="spec10-020-flexible-setup-order"
BASE="fe27d13ef04fe6b0d66ec38f883f124dad7d237f"

if [[ "$(git branch --show-current)" != "$TARGET_BRANCH" ]]; then
  echo "Expected branch $TARGET_BRANCH" >&2
  exit 1
fi
if [[ "$(git rev-parse HEAD)" != "$BASE" ]]; then
  echo "Expected HEAD $BASE" >&2
  exit 1
fi
if [[ ! -f engine/planner-next/exactSetupBlocks.ts || ! -f engine/planner-next/exactFlexibleSetupOrder.spec.ts ]]; then
  echo "Expected the partial SPEC10-020 exact-route worktree" >&2
  exit 1
fi

node <<'NODE'
const fs = require("node:fs");

const replaceExact = (path, before, after) => {
  const source = fs.readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`Expected one exact match in ${path}, found ${count}`);
  fs.writeFileSync(path, source.replace(before, after));
};

replaceExact(
  "engine/planner-next/exactMainAndFeederCore.ts",
  `      const reduced: PlannerNextProblem = { ...problem, tasks: problem.tasks.filter(({ id }) => coreIds.has(id)),
        anchoredAccompaniments: applicableContracts, participantMeals: undefined, participantMealCapacity: undefined };`,
  `      const reducedTasks = problem.tasks.filter(({ id }) => coreIds.has(id));
      const deferredSetupSpaceIds = new Set(problem.spaces
        .filter((space) => space.setupPolicy !== undefined
          && !reducedTasks.some((task) => task.spaceId === space.id))
        .map(({ id }) => id));
      const reduced: PlannerNextProblem = {
        ...problem,
        tasks: reducedTasks,
        spaces: problem.spaces.map((space) => deferredSetupSpaceIds.has(space.id)
          ? { ...space, secondaryContinuity: "OFF" as const, setupPolicy: undefined }
          : space),
        anchoredAccompaniments: applicableContracts,
        participantMeals: undefined,
        participantMealCapacity: undefined,
      };`,
);

replaceExact(
  "engine/planner-next/benchmarks/__tests__/fullA2CanonicalTemplate.test.ts",
  `  assert.ok(analysis.implementationBlockers.some((blocker) => blocker.code === "PLANNER_NEXT_FLEXIBLE_SETUP_ORDER_UNSUPPORTED"));`,
  `  assert.ok(!analysis.implementationBlockers.some((blocker) => blocker.code === "PLANNER_NEXT_FLEXIBLE_SETUP_ORDER_UNSUPPORTED"));`,
);
replaceExact(
  "engine/planner-next/benchmarks/__tests__/fullA2CanonicalTemplate.test.ts",
  `  assert.equal(analysis.nextImplementationBlocker?.code, "PLANNER_NEXT_FLEXIBLE_SETUP_ORDER_UNSUPPORTED");`,
  `  assert.equal(analysis.nextImplementationBlocker?.code, "PLANNER_NEXT_TOTALES_ROUND_SYNC_UNSUPPORTED");`,
);
NODE

npm exec tsx -- --test \
  engine/planner-next/exactFlexibleSetupOrder.spec.ts \
  engine/planner-next/flexibleSetupOrder.spec.ts \
  engine/planner-next/exactItinerantPlan.spec.ts \
  engine/planner-next/executePlannerNext.spec.ts \
  engine/planner-next/setupGrouping.spec.ts \
  engine/planner-next/setupPreparation.spec.ts \
  engine/planner-next/integration/engineInputPreflight.spec.ts \
  engine/planner-next/integration/engineInputAdapter.spec.ts \
  engine/planner-next/benchmarks/__tests__/fullA2CanonicalTemplate.test.ts
npm run check
git diff --check

git add \
  engine/planner-next/exactSetupBlocks.ts \
  engine/planner-next/exactFlexibleSetupOrder.spec.ts \
  engine/planner-next/exactItinerantPlan.ts \
  engine/planner-next/exactMainAndFeederCore.ts \
  engine/planner-next/integration/engineInputAdapter.fixture.ts \
  engine/planner-next/benchmarks/focal-a2/full-day/representability.ts \
  engine/planner-next/benchmarks/__tests__/fullA2CanonicalTemplate.test.ts \
  engine/planner-next/flexibleSetupOrder.spec.ts

git commit -m "SPEC10-020-WIP: integrate flexible setup into exact route"
git push origin "$TARGET_BRANCH"
echo "SPEC10-020 exact-route checkpoint pushed; do not merge before final evidence and merge gate"
