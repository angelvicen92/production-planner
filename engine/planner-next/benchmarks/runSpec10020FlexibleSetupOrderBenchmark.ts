import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EngineInput } from "../../types";
import {
  createSpec10020FlexibleSetupOrderEngineInputFixture,
} from "../integration/engineInputAdapter.fixture";
import {
  executeSpec10020Fixture,
  runSpec10020AtomicBudgetProbe,
  runSpec10020Probe,
  spec10020LogicalProjection,
} from "./spec10020FlexibleSetupOrderProbe";
import {
  analyzeCanonicalFullA2Representability,
  createCanonicalFullA2Template,
  expandCanonicalFullA2Template,
} from "./focal-a2/full-day/canonicalFullA2Template";

const evidencePath =
  "docs/evidence/SPEC10-020-flexible-setup-order.json";
const coveragePath =
  "docs/coverage/SPEC10-020-FLEXIBLE-SETUP-ORDER.md";
const compare = (left: string, right: string): number =>
  left.localeCompare(right, "en");

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "runtimeMs")
        .sort(([left], [right]) => compare(left, right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

const canonicalJson = (value: unknown): string =>
  JSON.stringify(canonical(value));
const sha256 = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");

function invertedFlexibleFixture(): EngineInput {
  const input = createSpec10020FlexibleSetupOrderEngineInputFixture();
  input.tasks.reverse();
  input.locks.reverse();
  input.planResourceItems.reverse();
  input.planSpaceSettings?.reverse();
  input.planZoneSettings?.reverse();
  input.setupPolicies?.forEach((policy) => policy.families.reverse());
  input.setupPolicies?.reverse();
  return input;
}

function explicitReverseFixture(): EngineInput {
  const input = createSpec10020FlexibleSetupOrderEngineInputFixture();
  input.setupPolicies = input.setupPolicies?.map((policy) => ({
    ...policy,
    orderConstraint: "EXPLICIT" as const,
    familyOrder: ["estrellas", "sillon"],
  }));
  return input;
}

export function buildSpec10020Evidence() {
  const baseline = runSpec10020Probe();
  const repeated = runSpec10020Probe();
  const inverted = runSpec10020Probe(invertedFlexibleFixture);
  const baselineProjection = spec10020LogicalProjection(baseline);
  const deterministic =
    canonicalJson(baselineProjection)
    === canonicalJson(spec10020LogicalProjection(repeated));
  const orderInvariant =
    canonicalJson(baselineProjection)
    === canonicalJson(spec10020LogicalProjection(inverted));
  assert.equal(deterministic, true);
  assert.equal(orderInvariant, true);

  const explicit = executeSpec10020Fixture(explicitReverseFixture);
  assert.equal(explicit.complete, true);
  assert.equal(explicit.hardValid, true);
  assert.equal(explicit.selectedFamilySequence.length, 2);
  assert.ok(explicit.selectedFamilySequence[0]?.endsWith(":estrellas"));
  assert.ok(explicit.selectedFamilySequence[1]?.endsWith(":sillon"));
  assert.equal(explicit.observedFamilyOrders.length, 1);
  assert.equal(explicit.selectedPreparationCount, 1);
  assert.equal(explicit.selectedPreparationMinutes, 10);
  assert.equal(explicit.preparationTargetsSecondFamily, true);

  const atomicBudget = runSpec10020AtomicBudgetProbe();
  const representability = analyzeCanonicalFullA2Representability(
    expandCanonicalFullA2Template(createCanonicalFullA2Template()),
  );
  assert.equal(representability.flexibleSetupOrderCapabilityProven, true);
  assert.equal(
    representability.implementationBlockers.some(
      (blocker) =>
        blocker.code
        === "PLANNER_NEXT_FLEXIBLE_SETUP_ORDER_UNSUPPORTED",
    ),
    false,
  );
  assert.equal(
    representability.nextImplementationBlocker?.code,
    "PLANNER_NEXT_TOTALES_ROUND_SYNC_UNSUPPORTED",
  );

  const payload = {
    iterationId: "SPEC10-020",
    classification: "DB Safe Merge",
    operationalRule:
      "Las familias de setup pueden ejecutarse en cualquiera de los dos órdenes; cada familia forma un único bloque, no hay reentrada y la segunda familia exige 10 minutos de preparación.",
    authoritativeRoute: "EXACT_CONSTRUCTIVE",
    baseline: baselineProjection,
    deterministic,
    orderInvariant,
    inputImmutable: baseline.inputImmutable,
    explicitCompatibility: {
      complete: explicit.complete,
      hardValid: explicit.hardValid,
      selectedFamilySequence: explicit.selectedFamilySequence,
      observedFamilyOrders: explicit.observedFamilyOrders,
      selectedPreparationCount: explicit.selectedPreparationCount,
      selectedPreparationMinutes: explicit.selectedPreparationMinutes,
      preparationTargetsSecondFamily:
        explicit.preparationTargetsSecondFamily,
      fullFingerprint: explicit.fullFingerprint,
    },
    atomicBudget,
    representability: {
      status: representability.status,
      flexibleSetupOrderProbe:
        representability.flexibleSetupOrderProbe,
      flexibleSetupOrderCapabilityProven:
        representability.flexibleSetupOrderCapabilityProven,
      implementationBlockerCodes:
        representability.implementationBlockers.map(({ code }) => code),
      nextImplementationBlocker:
        representability.nextImplementationBlocker?.code ?? null,
    },
    limitations: [
      "La búsqueda exacta está acotada por maxBranchExpansions y no afirma optimalidad global cuando termina por presupuesto.",
      "La jornada A2 completa sigue bloqueada por la sincronización de rondas Totales y por inputs de creación no fijados en la fuente.",
      "No se añade DB, UI, publicación productiva ni fallback entre motores.",
    ],
  };

  return {
    ...payload,
    artifactHashes: {
      hashScope:
        "canonical evidence payload excluding artifactHashes",
      evidencePayloadSha256: sha256(canonicalJson(payload)),
      coverageSha256: sha256(readFileSync(coveragePath)),
    },
  };
}

if (
  process.argv[1]
  && fileURLToPath(import.meta.url) === process.argv[1]
) {
  const evidence = buildSpec10020Evidence();
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(
    evidencePath,
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  console.log(JSON.stringify({
    evidencePath,
    evidenceSha256: sha256(readFileSync(evidencePath)),
    sourceFingerprint: evidence.baseline.sourceFingerprint,
    problemFingerprint: evidence.baseline.problemFingerprint,
    fullFingerprint: evidence.baseline.fullFingerprint,
    selectedFamilySequence:
      evidence.baseline.selectedFamilySequence,
    observedFamilyOrders:
      evidence.baseline.observedFamilyOrders,
    selectedPreparationMinutes:
      evidence.baseline.selectedPreparationMinutes,
    branchesExplored: evidence.baseline.branchesExplored,
    setupBlockBranchesExplored:
      evidence.baseline.setupBlockBranchesExplored,
    deterministic: evidence.deterministic,
    orderInvariant: evidence.orderInvariant,
    nextImplementationBlocker:
      evidence.representability.nextImplementationBlocker,
  }, null, 2));
}
