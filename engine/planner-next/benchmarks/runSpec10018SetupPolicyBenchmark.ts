import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EngineInput } from "../../types";
import type {
  PlannerNextProblem,
  ScheduledTask,
} from "../contracts";
import { planMainFlowAndFeeders } from "../planMainFlowAndFeeders";
import {
  preflight as preflightPlannerNextProblem,
  validatePlan,
} from "../validate";
import {
  adaptEngineInputToPlannerNextProblem,
} from "../integration/engineInputAdapter";
import {
  createSpec10018SetupPolicyEngineInputFixture,
  createSupportedEngineInputAdapterFixture,
} from "../integration/engineInputAdapter.fixture";
import {
  preflightEngineInputForPlannerNext,
} from "../integration/engineInputPreflight";

const baseCommit =
  "d3f946e9d1fc93bfa4e7a5f17f5984ae48057237";

const evidencePath =
  "docs/evidence/SPEC10-018-engine-input-setup-policy.json";

const coveragePath =
  "docs/coverage/SPEC10-018-ENGINE-INPUT-SETUP-POLICY.md";

const setupSpaceId = "space:304";

const compare = (
  left: string,
  right: string,
): number => left.localeCompare(right, "en");

const sha256Text = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const sha256File = (path: string): string =>
  createHash("sha256")
    .update(readFileSync(path))
    .digest("hex");

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "runtimeMs")
        .sort(([left], [right]) => compare(left, right))
        .map(([key, item]) => [
          key,
          canonicalize(item),
        ]),
    );
  }

  return value;
}

const canonicalJson = (value: unknown): string =>
  JSON.stringify(canonicalize(value));

function writeStable(
  path: string,
  value: unknown,
): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

function modifiedFiles(): string[] {
  const commands = [
    ["diff", "--name-only", `${baseCommit}...HEAD`],
    ["diff", "--name-only"],
    ["diff", "--cached", "--name-only"],
  ];

  return [
    ...new Set(
      commands.flatMap((args) =>
        execFileSync(
          "git",
          args,
          { encoding: "utf8" },
        )
          .trim()
          .split("\n")
          .filter(Boolean),
      ),
    ),
  ].sort(compare);
}

function invertSetArrays(
  input: EngineInput,
): EngineInput {
  return {
    ...input,
    tasks: [...input.tasks].reverse(),
    locks: [...input.locks].reverse(),
    planResourceItems:
      [...input.planResourceItems].reverse(),
    planSpaceSettings:
      [...(input.planSpaceSettings ?? [])].reverse(),
    planZoneSettings:
      [...(input.planZoneSettings ?? [])].reverse(),
    setupPolicies: input.setupPolicies
      ?.map((policy) => ({
        ...policy,
        families: [...policy.families].reverse(),
      }))
      .reverse(),
  };
}

function logicalMetrics(
  plan: ReturnType<typeof planMainFlowAndFeeders>,
): Record<string, unknown> {
  const {
    runtimeMs: _runtimeMs,
    ...metrics
  } = plan.metrics;

  return metrics;
}

type AdaptedSetupTask = {
  id: string;
  setupFamilyId: string | undefined;
  spaceId: string;
  duration: number;
  participantId: string | undefined;
};

type PlannedSetupTask = AdaptedSetupTask & {
  start: number;
  end: number;
};

export interface Spec10018ProbeRun {
  readonly inputSnapshot: EngineInput;

  readonly engineInputPreflightStatus:
    | "SUPPORTED"
    | "UNSUPPORTED";

  readonly engineInputPreflightReasonCodes:
    readonly string[];

  readonly adapterStatus:
    | "SUPPORTED"
    | "UNSUPPORTED";

  readonly adapterReasonCodes:
    readonly string[];

  readonly plannerNextPreflightReasonCodes:
    readonly string[];

  readonly sourceFingerprint: string;
  readonly identityMapFingerprint: string;
  readonly problemFingerprint: string;
  readonly planFingerprint: string;

  readonly projectedFamilyCount: number;
  readonly projectedPolicyCount: number;

  readonly familyOrder: readonly string[];
  readonly familySequence: readonly string[];

  readonly blockCounts:
    Readonly<Record<string, number>>;

  readonly switchCount: number;

  readonly preparations: readonly {
    id: string;
    spaceId: string;
    setupFamilyId: string;
    start: number;
    end: number;
    duration: number;
  }[];

  readonly adaptedTasks:
    readonly AdaptedSetupTask[];

  readonly plannedTasks:
    readonly PlannedSetupTask[];

  readonly complete: boolean;
  readonly hardValid: boolean;

  readonly setupViolationCount: number;

  readonly setupPreparationViolationCount:
    number;

  readonly plannedTaskCount: number;
  readonly unplannedTaskCount: number;

  readonly logicalMetrics:
    Readonly<Record<string, unknown>>;

  readonly inputImmutable: boolean;
}

function projectAdaptedTasks(
  problem: PlannerNextProblem,
): AdaptedSetupTask[] {
  return problem.tasks
    .filter(
      (task) =>
        task.setupFamilyId !== undefined,
    )
    .sort(
      (left, right) =>
        compare(left.id, right.id),
    )
    .map((task) => ({
      id: task.id,
      setupFamilyId: task.setupFamilyId,
      spaceId: task.spaceId,
      duration: task.duration,
      participantId: task.participantId,
    }));
}

function projectPlannedTasks(
  scheduledTasks: readonly ScheduledTask[],
): PlannedSetupTask[] {
  return scheduledTasks
    .filter(
      (task) =>
        task.setupFamilyId !== undefined,
    )
    .sort(
      (left, right) =>
        compare(left.id, right.id),
    )
    .map((task) => ({
      id: task.id,
      setupFamilyId: task.setupFamilyId,
      spaceId: task.spaceId,
      start: task.start,
      end: task.end,
      duration: task.duration,
      participantId: task.participantId,
    }));
}

export function spec10018LogicalProjection(
  run: Spec10018ProbeRun,
): unknown {
  return {
    sourceFingerprint:
      run.sourceFingerprint,

    identityMapFingerprint:
      run.identityMapFingerprint,

    problemFingerprint:
      run.problemFingerprint,

    planFingerprint:
      run.planFingerprint,

    projectedFamilyCount:
      run.projectedFamilyCount,

    projectedPolicyCount:
      run.projectedPolicyCount,

    familyOrder:
      run.familyOrder,

    familySequence:
      run.familySequence,

    blockCounts:
      run.blockCounts,

    switchCount:
      run.switchCount,

    preparations:
      run.preparations,

    adaptedTasks:
      run.adaptedTasks,

    plannedTasks:
      run.plannedTasks,

    complete:
      run.complete,

    hardValid:
      run.hardValid,

    setupViolationCount:
      run.setupViolationCount,

    setupPreparationViolationCount:
      run.setupPreparationViolationCount,

    plannedTaskCount:
      run.plannedTaskCount,

    unplannedTaskCount:
      run.unplannedTaskCount,

    logicalMetrics:
      run.logicalMetrics,
  };
}

export function runSpec10018Probe(
  familyOrder: string[] = [
    "sillon",
    "estrellas",
  ],
  factory = () =>
    createSpec10018SetupPolicyEngineInputFixture(
      familyOrder,
    ),
  flexibleOrder = false,
): Spec10018ProbeRun {
  const input = factory();
  const inputSnapshot = structuredClone(input);

  const engineInputPreflight =
    preflightEngineInputForPlannerNext(input);

  assert.equal(
    engineInputPreflight.status,
    "SUPPORTED",
    engineInputPreflight.reasonCodes.join(","),
  );

  const adapter =
    adaptEngineInputToPlannerNextProblem(input);

  assert.equal(
    adapter.status,
    "SUPPORTED",
    adapter.status === "UNSUPPORTED"
      ? adapter.reasonCodes.join(",")
      : "",
  );

  assert.ok(
    adapter.problem,
    "adapter.problem must exist",
  );

  const plannerNextPreflightReasonCodes =
    preflightPlannerNextProblem(
      adapter.problem,
    );

  assert.deepEqual(
    plannerNextPreflightReasonCodes,
    [],
  );

  /*
   * Recorrido conectado real:
   * adapter.problem → planificador → validación.
   */
  const plan =
    planMainFlowAndFeeders(adapter.problem);

  const validation = validatePlan(
    adapter.problem,
    plan.scheduledTasks,
    plan.scheduledSetupPreparations,
    plan.scheduledSpaceMeals,
    plan.scheduledParticipantMeals,
    plan.scheduledResourceMeals,
    plan.scheduledItinerantUnitMeals,
  );

  const setupSpace =
    adapter.problem.spaces.find(
      (space) =>
        space.id === setupSpaceId,
    );

  assert.ok(setupSpace?.setupPolicy);

  const canonicalFamilyOrder =
    familyOrder.map(
      (family) =>
        `setup-family:304:${family}`,
    );

  const familySequence = [
    ...(
      plan.metrics
        .setupFamilySequenceBySpaceId[
          setupSpaceId
        ] ?? []
    ),
  ];

  const blockCounts =
    Object.fromEntries(
      canonicalFamilyOrder.map(
        (family) => [
          `${setupSpaceId}|${family}`,
          plan.metrics
            .setupBlockCountBySpaceAndFamily[
              `${setupSpaceId}|${family}`
            ] ?? 0,
        ],
      ),
    );

  const switchCount =
    plan.metrics
      .setupSwitchCountBySpaceId[
        setupSpaceId
      ] ?? 0;

  const preparations =
    plan.scheduledSetupPreparations
      .filter(
        (entry) =>
          entry.spaceId === setupSpaceId,
      )
      .sort(
        (left, right) =>
          compare(left.id, right.id),
      )
      .map((entry) => ({
        id: entry.id,
        spaceId: entry.spaceId,
        setupFamilyId:
          entry.setupFamilyId,
        start: entry.start,
        end: entry.end,
        duration: entry.duration,
      }));

  const adaptedTasks =
    projectAdaptedTasks(adapter.problem);

  const plannedTasks =
    projectPlannedTasks(
      plan.scheduledTasks,
    );

  const inputImmutable =
    canonicalJson(input)
    === canonicalJson(inputSnapshot);

  const result: Spec10018ProbeRun = {
    inputSnapshot,

    engineInputPreflightStatus:
      engineInputPreflight.status,

    engineInputPreflightReasonCodes: [
      ...engineInputPreflight.reasonCodes,
    ],

    adapterStatus:
      adapter.status,

    adapterReasonCodes: [
      ...adapter.reasonCodes,
    ],

    plannerNextPreflightReasonCodes,

    sourceFingerprint:
      adapter.sourceFingerprint,

    identityMapFingerprint:
      adapter.identityMapFingerprint,

    problemFingerprint:
      adapter.problemFingerprint,

    planFingerprint:
      plan.metrics.planFingerprint,

    projectedFamilyCount:
      setupSpace.setupPolicy
        .familyOrder.length,

    projectedPolicyCount:
      adapter.problem.spaces.filter(
        (space) =>
          space.setupPolicy !== undefined,
      ).length,

    familyOrder: [
      ...setupSpace.setupPolicy.familyOrder,
    ],

    familySequence,
    blockCounts,
    switchCount,
    preparations,
    adaptedTasks,
    plannedTasks,

    complete:
      plan.complete,

    hardValid:
      validation.hardValid,

    setupViolationCount:
      validation.setupViolationCount,

    setupPreparationViolationCount:
      validation
        .setupPreparationViolationCount,

    plannedTaskCount:
      plan.metrics.plannedTaskCount,

    unplannedTaskCount:
      plan.metrics.unplannedTaskCount,

    logicalMetrics:
      logicalMetrics(plan),

    inputImmutable,
  };

  if (flexibleOrder) {
    assert.deepEqual([...result.familyOrder].sort(compare), [...canonicalFamilyOrder].sort(compare));
    assert.deepEqual([...result.familySequence].sort(compare), [...canonicalFamilyOrder].sort(compare));
  } else {
    assert.deepEqual(result.familyOrder, canonicalFamilyOrder);
    assert.deepEqual(result.familySequence, canonicalFamilyOrder);
  }

  assert.equal(
    result.projectedFamilyCount,
    2,
  );

  assert.equal(
    result.projectedPolicyCount,
    1,
  );

  assert.equal(
    result.adaptedTasks.length,
    4,
  );

  assert.equal(
    result.plannedTasks.length,
    4,
  );

  assert.equal(
    result.complete,
    true,
  );

  assert.equal(
    result.hardValid,
    true,
  );

  assert.equal(
    result.unplannedTaskCount,
    0,
  );

  assert.equal(
    result.setupViolationCount,
    0,
  );

  assert.equal(
    result.setupPreparationViolationCount,
    0,
  );

  assert.equal(
    Object.keys(result.blockCounts).length,
    2,
  );

  assert.ok(
    Object.values(result.blockCounts)
      .every((count) => count === 1),
  );

  assert.equal(
    result.switchCount,
    1,
  );

  assert.equal(
    result.preparations.length,
    1,
  );

  assert.equal(
    result.preparations.reduce(
      (
        total,
        preparation,
      ) => total + preparation.duration,
      0,
    ),
    10,
  );

  assert.equal(
    result.preparations[0]
      ?.setupFamilyId,
    flexibleOrder ? result.familySequence[1] : canonicalFamilyOrder[1],
  );

  assert.equal(
    plan.metrics.setupPreparationCount,
    1,
  );

  assert.equal(
    plan.metrics
      .setupPreparationMinutesBySpaceId[
        setupSpaceId
      ],
    10,
  );

  assert.equal(
    result.inputImmutable,
    true,
  );

  return result;
}

function unsupported(
  mutate: (input: EngineInput) => void,
  expected: string,
): {
  caseId: string;
  passed: boolean;
  reasonCodes: readonly string[];
  problemIsNull: boolean;
  problemFingerprintIsNull: boolean;
} {
  const input =
    createSpec10018SetupPolicyEngineInputFixture();

  mutate(input);

  const adapter =
    adaptEngineInputToPlannerNextProblem(input);

  const reasonCodes =
    adapter.status === "UNSUPPORTED"
      ? adapter.reasonCodes
      : [];

  return {
    caseId: expected,
    passed:
      reasonCodes.includes(expected),
    reasonCodes,
    problemIsNull:
      adapter.problem === null,
    problemFingerprintIsNull:
      adapter.problemFingerprint === null,
  };
}

function buildEvidence() {
  const forward =
    runSpec10018Probe();

  const repeated =
    runSpec10018Probe();

  const reverse =
    runSpec10018Probe([
      "estrellas",
      "sillon",
    ]);

  const inverted =
    runSpec10018Probe(
      ["sillon", "estrellas"],
      () =>
        invertSetArrays(
          createSpec10018SetupPolicyEngineInputFixture(),
        ),
    );

  const deterministic =
    canonicalJson(
      spec10018LogicalProjection(forward),
    )
    === canonicalJson(
      spec10018LogicalProjection(repeated),
    );

  const orderInvariant =
    canonicalJson(
      spec10018LogicalProjection(forward),
    )
    === canonicalJson(
      spec10018LogicalProjection(inverted),
    );

  assert.equal(
    deterministic,
    true,
  );

  assert.equal(
    orderInvariant,
    true,
  );

  assert.notEqual(
    forward.problemFingerprint,
    reverse.problemFingerprint,
  );

  assert.notEqual(
    forward.planFingerprint,
    reverse.planFingerprint,
  );

  assert.notDeepEqual(
    forward.familySequence,
    reverse.familySequence,
  );

  const absentInput =
    createSupportedEngineInputAdapterFixture();

  const undefinedInput =
    structuredClone(absentInput);

  undefinedInput.tasks[0]!
    .setupFamilyId = undefined;

  const nullInput =
    structuredClone(absentInput);

  nullInput.tasks[0]!
    .setupFamilyId = null;

  const absentPoliciesInput =
    structuredClone(absentInput);

  const undefinedPoliciesInput =
    structuredClone(absentInput);

  undefinedPoliciesInput.setupPolicies =
    undefined;

  const emptyPoliciesInput =
    structuredClone(absentInput);

  emptyPoliciesInput.setupPolicies = [];

  const individualVariants = [
    absentInput,
    undefinedInput,
    nullInput,
  ];

  const individualAdapters =
    individualVariants.map(
      (variant) =>
        adaptEngineInputToPlannerNextProblem(
          variant,
        ),
    );

  assert.ok(
    individualAdapters.every(
      (result) =>
        result.status === "SUPPORTED",
    ),
  );

  const historicalSourceFingerprint =
    individualAdapters[0]!
      .sourceFingerprint;

  assert.ok(
    individualAdapters.every(
      (result) =>
        result.sourceFingerprint
        === historicalSourceFingerprint,
    ),
  );

  for (
    const variant
    of individualVariants
  ) {
    const preflight =
      preflightEngineInputForPlannerNext(
        variant,
      );

    assert.equal(
      preflight.identityMap.some(
        (entry) =>
          entry.namespace
          === "setup-family",
      ),
      false,
    );

    const adapted =
      adaptEngineInputToPlannerNextProblem(
        variant,
      );

    assert.equal(
      adapted.status,
      "SUPPORTED",
    );

    if (adapted.status === "SUPPORTED") {
      assert.equal(
        adapted.problem.tasks.some(
          (task) =>
            task.setupFamilyId
            !== undefined,
        ),
        false,
      );

      assert.equal(
        adapted.problem.spaces.some(
          (space) =>
            space.setupPolicy
            !== undefined,
        ),
        false,
      );
    }
  }

  const policyFingerprints = [
    absentPoliciesInput,
    undefinedPoliciesInput,
    emptyPoliciesInput,
  ].map(
    (variant) =>
      adaptEngineInputToPlannerNextProblem(
        variant,
      ).sourceFingerprint,
  );

  assert.ok(
    policyFingerprints.every(
      (fingerprint) =>
        fingerprint
        === policyFingerprints[0],
    ),
  );

  const negativeTests = [
    unsupported(
      (input) => {
        input.setupPolicies![0]!
          .orderConstraint =
          "UNSPECIFIED";
      },
      "UNSUPPORTED_SETUP_MAPPING",
    ),

    unsupported(
      (input) => {
        input.tasks.find(
          (task) =>
            task.id === 301,
        )!.setupFamilyId =
          "unknown";
      },
      "UNSUPPORTED_SETUP_MAPPING",
    ),

    unsupported(
      (input) => {
        input.setupPolicies = [];
      },
      "UNSUPPORTED_SETUP_MAPPING",
    ),

    unsupported(
      (input) => {
        input.tasks.find(
          (task) =>
            task.id === 301,
        )!.plannerNextKind =
          "main";
      },
      "UNSUPPORTED_SETUP_MAPPING",
    ),

    unsupported(
      (input) => {
        input.setupPolicies!.push(
          structuredClone(
            input.setupPolicies![0]!,
          ),
        );
      },
      "UNSUPPORTED_SETUP_MAPPING",
    ),

    unsupported(
      (input) => {
        input.setupPolicies![0]!
          .familyOrder = ["sillon"];
      },
      "UNSUPPORTED_SETUP_MAPPING",
    ),

    unsupported(
      (input) => {
        (
          input as unknown as
            Record<string, unknown>
        ).setupPolicies = {};
      },
      "UNSUPPORTED_SETUP_MAPPING",
    ),
  ];

  assert.ok(
    negativeTests.every(
      (test) =>
        test.passed
        && test.problemIsNull
        && test.problemFingerprintIsNull,
    ),
  );

  const evidenceRun = (
    run: Spec10018ProbeRun,
  ) => {
    const {
      inputSnapshot: _inputSnapshot,
      ...projection
    } = run;

    return projection;
  };

  const payloadWithoutHashes = {
    iterationId: "SPEC10-018",

    commitBase:
      baseCommit,

    contract: [
      "TaskInput.setupFamilyId?: string | null",
      "EngineInput.setupPolicies?: EngineInputSetupPolicyInput[]",
    ],

    namespace:
      "setup-family",

    sourceIds: [
      "304:sillon",
      "304:estrellas",
    ],

    canonicalIds: [
      "setup-family:304:sillon",
      "setup-family:304:estrellas",
    ],

    explicitOrders: {
      forward:
        evidenceRun(forward),

      reverse:
        evidenceRun(reverse),
    },

    determinism: {
      normalRunsIdenticalWithoutRuntimeMs:
        deterministic,
    },

    orderInvariance: {
      arraySetsInvertedMatches:
        orderInvariant,

      familiesInvertedDoesNotChangeFingerprints:
        forward.sourceFingerprint
          === inverted.sourceFingerprint
        && forward.identityMapFingerprint
          === inverted.identityMapFingerprint
        && forward.problemFingerprint
          === inverted.problemFingerprint,

      familyOrderInversionChangesProblem:
        forward.problemFingerprint
        !== reverse.problemFingerprint,

      familyOrderInversionChangesPlan:
        forward.planFingerprint
        !== reverse.planFingerprint,
    },

    historicalCompatibility: {
      absentUndefinedNullSetupFamilyIdPreserveFingerprint:
        true,

      absentUndefinedAndEmptySetupPoliciesPreserveFingerprint:
        true,

      legacySourceFingerprint:
        historicalSourceFingerprint,
    },

    inputImmutable:
      forward.inputImmutable
      && repeated.inputImmutable
      && reverse.inputImmutable
      && inverted.inputImmutable,

    negativeTests,

    modifiedFiles:
      modifiedFiles(),
  };

  return {
    ...payloadWithoutHashes,

    artifactHashes: {
      hashScope:
        "canonical evidence payload excluding artifactHashes",

      evidencePayloadSha256:
        sha256Text(
          canonicalJson(
            payloadWithoutHashes,
          ),
        ),

      coverageSha256:
        sha256File(coveragePath),
    },
  };
}

if (
  process.argv[1]
  && fileURLToPath(import.meta.url)
    === process.argv[1]
) {
  const evidence =
    buildEvidence();

  writeStable(
    evidencePath,
    evidence,
  );

  console.log(
    JSON.stringify(
      {
        evidencePath,

        evidenceSha256:
          sha256File(evidencePath),

        sourceFingerprint:
          evidence.explicitOrders
            .forward.sourceFingerprint,

        identityMapFingerprint:
          evidence.explicitOrders
            .forward.identityMapFingerprint,

        problemFingerprint:
          evidence.explicitOrders
            .forward.problemFingerprint,

        planFingerprint:
          evidence.explicitOrders
            .forward.planFingerprint,

        complete:
          evidence.explicitOrders
            .forward.complete,

        hardValid:
          evidence.explicitOrders
            .forward.hardValid,

        setupViolationCount:
          evidence.explicitOrders
            .forward.setupViolationCount,

        setupPreparationViolationCount:
          evidence.explicitOrders
            .forward
            .setupPreparationViolationCount,
      },
      null,
      2,
    ),
  );
}
