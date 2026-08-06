#!/usr/bin/env bash
set -euo pipefail

EXPECTED_BRANCH="spec10-019-coach-route-transition"
EXPECTED_HEAD="5f46f6d9230db5ed75d2745c49478e47da0d149c"
REPORT_DIR="validation-output"
REPORT="$REPORT_DIR/merge-gate-SPEC10-019.json"
LOGDIR="$(mktemp -d)"

export EXPECTED_BRANCH EXPECTED_HEAD REPORT LOGDIR

run() {
  local name="$1"
  shift
  echo "▶ $name"
  if "$@" >"$LOGDIR/$name.log" 2>&1; then
    echo "✓ $name"
  else
    local code=$?
    echo "✗ $name — exit $code"
    tail -160 "$LOGDIR/$name.log"
    exit "$code"
  fi
}

if [ "$(git branch --show-current)" != "$EXPECTED_BRANCH" ]; then
  echo "Rama incorrecta: $(git branch --show-current)"
  echo "Esperada: $EXPECTED_BRANCH"
  exit 2
fi

if [ "$(git rev-parse HEAD)" != "$EXPECTED_HEAD" ]; then
  echo "HEAD incorrecto: $(git rev-parse HEAD)"
  echo "Esperado:       $EXPECTED_HEAD"
  exit 3
fi

if [ -n "$(git status --short)" ]; then
  echo "El repositorio no está limpio:"
  git status --short
  exit 4
fi

mkdir -p "$REPORT_DIR"
grep -qxF "/$REPORT_DIR/" .git/info/exclude 2>/dev/null \
  || echo "/$REPORT_DIR/" >> .git/info/exclude

cp docs/evidence/SPEC10-019-coach-route-transition.json "$LOGDIR/spec19-before.json"
cp docs/coverage/SPEC10-019-COACH-ROUTE-TRANSITION.md "$LOGDIR/spec19-coverage-before.md"
cp docs/evidence/SPEC10-016-full-a2-canonical-template.json "$LOGDIR/spec16-before.json"
cp docs/coverage/SPEC10-016-FULL-A2-TEMPLATE.md "$LOGDIR/spec16-coverage-before.md"

run typescript npm run check
run planner-next node script/run-test-suite.mjs engine/planner-next
run npm-test npm test
run build npm run build
run migrations npm run check:migrations
run focal ./validate-focal-a2-010.sh current

cp planner-next-focal-a2-itinerant-spec08-foundation-v4.json "$LOGDIR/focal.json"
git restore -- planner-next-focal-a2-itinerant-spec08-foundation-v4.json

run spec19-run1 npm run benchmark:planner-next:spec10-019
cmp "$LOGDIR/spec19-before.json" docs/evidence/SPEC10-019-coach-route-transition.json
cmp "$LOGDIR/spec19-coverage-before.md" docs/coverage/SPEC10-019-COACH-ROUTE-TRANSITION.md
cp docs/evidence/SPEC10-019-coach-route-transition.json "$LOGDIR/spec19-run1.json"

run spec19-run2 npm run benchmark:planner-next:spec10-019
cmp "$LOGDIR/spec19-run1.json" docs/evidence/SPEC10-019-coach-route-transition.json
cmp "$LOGDIR/spec19-before.json" docs/evidence/SPEC10-019-coach-route-transition.json
cmp "$LOGDIR/spec19-coverage-before.md" docs/coverage/SPEC10-019-COACH-ROUTE-TRANSITION.md

run spec16-run1 npm run benchmark:planner-next:a2-full-template
cmp "$LOGDIR/spec16-before.json" docs/evidence/SPEC10-016-full-a2-canonical-template.json
cmp "$LOGDIR/spec16-coverage-before.md" docs/coverage/SPEC10-016-FULL-A2-TEMPLATE.md
cp docs/evidence/SPEC10-016-full-a2-canonical-template.json "$LOGDIR/spec16-run1.json"

run spec16-run2 npm run benchmark:planner-next:a2-full-template
cmp "$LOGDIR/spec16-run1.json" docs/evidence/SPEC10-016-full-a2-canonical-template.json
cmp "$LOGDIR/spec16-before.json" docs/evidence/SPEC10-016-full-a2-canonical-template.json
cmp "$LOGDIR/spec16-coverage-before.md" docs/coverage/SPEC10-016-FULL-A2-TEMPLATE.md

run diff-check git diff --check

if [ -n "$(git status --short)" ]; then
  echo "El repositorio quedó modificado:"
  git status --short
  exit 5
fi

node <<'NODE'
const fs = require("node:fs");
const crypto = require("node:crypto");
const cp = require("node:child_process");

const logdir = process.env.LOGDIR;
const reportPath = process.env.REPORT;

const readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const sha256 = (path) => crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex");

function testSummary(path) {
  const text = fs.readFileSync(path, "utf8");
  const last = (re) => [...text.matchAll(re)].at(-1)?.[1] ?? null;
  return {
    tests: Number(last(/# tests\s+(\d+)/g) ?? 0),
    passed: Number(last(/# pass\s+(\d+)/g) ?? 0),
    failed: Number(last(/# fail\s+(\d+)/g) ?? 0),
  };
}

const spec19 = readJson("docs/evidence/SPEC10-019-coach-route-transition.json");
const spec16 = readJson("docs/evidence/SPEC10-016-full-a2-canonical-template.json");
const focal = readJson(`${logdir}/focal.json`);
const activeScenarioId = focal.activeScenarioId ?? null;
const scenario = activeScenarioId && focal.scenarios ? focal.scenarios[activeScenarioId] ?? {} : {};

const report = {
  iterationId: "SPEC10-019",
  head: cp.execSync("git rev-parse HEAD", { encoding: "utf8" }).trim(),
  expectedHead: process.env.EXPECTED_HEAD,
  branch: cp.execSync("git branch --show-current", { encoding: "utf8" }).trim(),
  commands: {
    typescript: true,
    plannerNextSuite: true,
    npmTest: true,
    build: true,
    migrations: true,
    focalProtected: true,
    spec10019Twice: true,
    spec10016Twice: true,
    byteEquality: true,
    diffCheck: true,
  },
  tests: {
    plannerNext: testSummary(`${logdir}/planner-next.log`),
    npmTest: testSummary(`${logdir}/npm-test.log`),
  },
  focalProtected: {
    accepted: focal.acceptance?.accepted ?? focal.accepted ?? null,
    scenarioCount: focal.scenarioCount ?? Object.keys(focal.scenarios ?? {}).length,
    activeScenarioId,
    complete: scenario.complete ?? null,
    hardValid: scenario.hardValid ?? null,
    plannedTaskCount: scenario.plannedTaskCount ?? null,
    pendingTaskCount: scenario.pendingTaskCount ?? scenario.unplannedTaskCount ?? null,
    branchesExplored: scenario.branchesExplored ?? null,
    maxBranchExpansions: scenario.maxBranchExpansions ?? null,
    planFingerprint: scenario.planFingerprint ?? scenario.fingerprint ?? null,
    artifactSha256: sha256(`${logdir}/focal.json`),
  },
  spec10019: {
    engineInputPreflightStatus: spec19.baseline?.engineInputPreflightStatus,
    adapterStatus: spec19.baseline?.adapterStatus,
    plannerNextPreflightReasonCodes: spec19.baseline?.plannerNextPreflightReasonCodes,
    complete: spec19.baseline?.complete,
    hardValid: spec19.baseline?.hardValid,
    plannedTaskCount: spec19.baseline?.plannedTaskCount,
    unplannedTaskCount: spec19.baseline?.unplannedTaskCount,
    globalResourceTransitionMinutes: spec19.baseline?.globalResourceTransitionMinutes,
    projectedRouteCount: spec19.baseline?.projectedRouteCount,
    routeMinutes: spec19.baseline?.routeMinutes,
    scheduledGapMinutes: spec19.baseline?.scheduledGapMinutes,
    rejectsTwentyNineMinutes: spec19.baseline?.rejectsTwentyNineMinutes,
    acceptsThirtyMinutes: spec19.baseline?.acceptsThirtyMinutes,
    transitionViolationsAtTwentyNine: spec19.baseline?.validationAtTwentyNine?.transitionViolationCount,
    transitionViolationsAtThirty: spec19.baseline?.validationAtThirty?.transitionViolationCount,
    reverseDirectionMinutes: spec19.baseline?.reverseDirectionMinutes,
    unrelatedCoachMinutes: spec19.baseline?.unrelatedCoachMinutes,
    deterministic: spec19.deterministic,
    orderInvariant: spec19.orderInvariant,
    inputImmutable: spec19.inputImmutable,
    negativeTestCount: Array.isArray(spec19.negativeTests) ? spec19.negativeTests.length : 0,
    allNegativeTestsPassed: Array.isArray(spec19.negativeTests)
      ? spec19.negativeTests.every((test) => test.passed === true)
      : false,
  },
  spec10016: {
    representabilityStatus: spec16.representabilityStatus ?? spec16.representabilityGate?.analysis?.status ?? null,
    gateStatus: spec16.gateStatus ?? spec16.representabilityGate?.status ?? null,
    executorCallCount: spec16.executorCallCount ?? spec16.representabilityGate?.executorCallCount ?? null,
    nextImplementationBlocker: spec16.nextImplementationBlocker?.code ?? null,
    coachRouteSupported: spec16.adapterProbe?.supportsSpecificCoachRouteTransition ?? null,
  },
  hashes: {
    spec10019Evidence: sha256("docs/evidence/SPEC10-019-coach-route-transition.json"),
    spec10019Coverage: sha256("docs/coverage/SPEC10-019-COACH-ROUTE-TRANSITION.md"),
    spec10016Evidence: sha256("docs/evidence/SPEC10-016-full-a2-canonical-template.json"),
    spec10016Coverage: sha256("docs/coverage/SPEC10-016-FULL-A2-TEMPLATE.md"),
  },
  byteEquality: {
    spec10019Evidence: true,
    spec10019Coverage: true,
    spec10016Evidence: true,
    spec10016Coverage: true,
  },
  workingTreeClean: true,
  merged: false,
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
NODE

echo
echo "Informe generado: $REPORT"
echo "No hagas merge."
