import { existsSync, readFileSync } from "node:fs";
import type { ProbeObservation } from "./focalA2CapabilityProbes";

export type AssertionStatus = "PASS" | "FAIL" | "NOT_FOUND" | "NOT_EXECUTED";
export type EvidenceLayer = "SOURCE" | "PREFLIGHT" | "ADAPTER" | "SEARCH" | "VALIDATION" | "EVIDENCE";
export type EvidenceBoundary = "PLANNER_LAYER" | "ENGINE_INPUT" | "A2";

export interface AssertionResult {
  readonly id: string;
  readonly kind: "SOURCE" | "PROBE" | "TEST" | "BENCHMARK";
  readonly status: AssertionStatus;
  readonly layer: EvidenceLayer;
  readonly property: string;
  readonly file: string | null;
  readonly selector: string | null;
  readonly observed: unknown;
  readonly expected: unknown;
  readonly reason: string;
  readonly boundary: EvidenceBoundary | null;
}

export interface SourceAssertion {
  readonly id: string;
  readonly capabilityId: number;
  readonly document: string;
  readonly section: string;
  readonly claim: string;
}

export interface TestAssertion {
  readonly id: string;
  readonly file: string;
  readonly testName: string;
  readonly layer: EvidenceLayer;
  readonly property: string;
}

export interface BenchmarkAssertion {
  readonly id: string;
  readonly source: "JSON" | "PROBE";
  readonly file: string | null;
  readonly probeId: string | null;
  readonly selector: string;
  readonly operator: "EQUALS" | "INCLUDES";
  readonly expected: unknown;
  readonly layer: EvidenceLayer;
  readonly property: string;
  readonly boundary: EvidenceBoundary;
}

const result = (
  id: string,
  kind: AssertionResult["kind"],
  status: AssertionStatus,
  layer: EvidenceLayer,
  property: string,
  observed: unknown,
  expected: unknown,
  reason: string,
  file: string | null = null,
  selector: string | null = null,
  boundary: EvidenceBoundary | null = null,
): AssertionResult => Object.freeze({ id, kind, status, layer, property, file, selector, observed, expected, reason, boundary });

export function resolveEvidenceSelector(value: unknown, selector: string): { found: boolean; value: unknown } {
  let current = value;
  const tokens = selector.match(/\[[^\]]+]|[^.]+/g) ?? [];
  for (const token of tokens) {
    if (current === null || typeof current !== "object") return { found: false, value: undefined };
    if (Array.isArray(current)) {
      const match = token.match(/^\[(\w+)=(.+)]$/);
      if (!match) return { found: false, value: undefined };
      current = current.find((entry) => entry && typeof entry === "object" && String((entry as Record<string, unknown>)[match[1]!]) === match[2]);
      if (current === undefined) return { found: false, value: undefined };
      continue;
    }
    if (!(token in current)) return { found: false, value: undefined };
    current = (current as Record<string, unknown>)[token];
  }
  return { found: true, value: current };
}

export function evaluateSourceAssertion(id: string, capabilityId: number, assertions: ReadonlyMap<string, SourceAssertion>): AssertionResult {
  const assertion = assertions.get(id);
  if (!assertion) return result(id, "SOURCE", "NOT_FOUND", "SOURCE", "source assertion reference resolves", undefined, capabilityId, "Source assertion does not exist");
  const valid = assertion.capabilityId === capabilityId && assertion.document.trim() !== "" && assertion.section.trim() !== "" && assertion.claim.trim() !== "";
  return result(id, "SOURCE", valid ? "PASS" : "FAIL", "SOURCE", assertion.claim, assertion.capabilityId, capabilityId, valid ? "Explicit reviewed source assertion matches capability" : "Source assertion is incomplete or belongs to another capability");
}

export function evaluateProbeObservation(id: string, observations: ReadonlyMap<string, ProbeObservation>): AssertionResult {
  const observation = observations.get(id);
  if (!observation) return result(id, "PROBE", "NOT_FOUND", "EVIDENCE", "probe observation reference resolves", undefined, true, "Probe observation does not exist");
  return result(id, "PROBE", observation.pass ? "PASS" : "FAIL", observation.layer, observation.property, observation.observed, observation.expected, observation.pass ? "Executed observation matches expected value" : "Executed observation differs from expected value", null, id, "ENGINE_INPUT");
}

export function evaluateTestAssertion(assertion: TestAssertion): AssertionResult {
  if (!existsSync(assertion.file)) return result(assertion.id, "TEST", "NOT_FOUND", assertion.layer, assertion.property, undefined, assertion.testName, "Test file does not exist", assertion.file, assertion.testName);
  const source = readFileSync(assertion.file, "utf8");
  const escaped = assertion.testName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = new RegExp(`(?:test|it)\\(\\s*[\"']${escaped}[\"']`).test(source);
  return result(assertion.id, "TEST", found ? "PASS" : "NOT_FOUND", assertion.layer, assertion.property, found, true, found ? "Exact functional test name exists" : "Exact functional test name does not exist", assertion.file, assertion.testName);
}

function compare(operator: BenchmarkAssertion["operator"], observed: unknown, expected: unknown): boolean {
  if (operator === "EQUALS") return JSON.stringify(observed) === JSON.stringify(expected);
  return Array.isArray(observed) && observed.some((entry) => JSON.stringify(entry) === JSON.stringify(expected));
}

export function evaluateBenchmarkAssertion(assertion: BenchmarkAssertion, probes: readonly { id: string }[]): AssertionResult {
  let root: unknown;
  if (assertion.source === "JSON") {
    if (!assertion.file || !existsSync(assertion.file)) return result(assertion.id, "BENCHMARK", "NOT_FOUND", assertion.layer, assertion.property, undefined, assertion.expected, "Benchmark file does not exist", assertion.file, assertion.selector, assertion.boundary);
    try { root = JSON.parse(readFileSync(assertion.file, "utf8")); }
    catch { return result(assertion.id, "BENCHMARK", "FAIL", assertion.layer, assertion.property, undefined, assertion.expected, "Benchmark file is not valid JSON", assertion.file, assertion.selector, assertion.boundary); }
  } else {
    root = probes.find((probe) => probe.id === assertion.probeId);
    if (!root) return result(assertion.id, "BENCHMARK", "NOT_FOUND", assertion.layer, assertion.property, undefined, assertion.expected, "Executed probe does not exist", null, assertion.selector, assertion.boundary);
  }
  const selected = resolveEvidenceSelector(root, assertion.selector);
  if (!selected.found) return result(assertion.id, "BENCHMARK", "NOT_FOUND", assertion.layer, assertion.property, undefined, assertion.expected, "Benchmark selector does not exist", assertion.file, assertion.selector, assertion.boundary);
  const pass = compare(assertion.operator, selected.value, assertion.expected);
  return result(assertion.id, "BENCHMARK", pass ? "PASS" : "FAIL", assertion.layer, assertion.property, selected.value, assertion.expected, pass ? "Observed benchmark value matches" : "Observed benchmark value differs", assertion.file, assertion.selector, assertion.boundary);
}
