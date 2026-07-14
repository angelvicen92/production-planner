import { createHash } from "node:crypto";
import { stableStringify } from "../structuralEquality";

export type InitialConstructionAnchorBlockerCode =
  | "BLOCKER_EVIDENCE_INCOMPLETE"
  | "NO_SEARCH_SPACE"
  | "NO_HARD_VALID_BRANCH"
  | "TASK_WINDOW_CONFLICT"
  | "PROTECTED_INTERVAL_CONFLICT"
  | "CONTESTANT_OVERLAP"
  | "SPACE_OVERLAP"
  | "RESOURCE_OVERLAP"
  | "DEPENDENCY_CONFLICT"
  | "COMBINED_INVALID"
  | "BUDGET_EXHAUSTED"
  | "UNSUPPORTED_REQUIREMENT"
  | "OTHER";

export interface InitialConstructionAnchorAttemptDiagnostics {
  anchorTaskId: number;
  searchSpaceFound: boolean;
  provisionalWindowCount: number;
  provisionalWindowsSample: readonly unknown[];
  branchCount: number;
  candidateBranchCount: number;
  closureIncompleteBranchCount: number;
  unsupportedBranchCount: number;
  hardValidBranchCount: number;
  branchStatusCounts: Record<string, number>;
  branchRejectionReasonCounts: Record<string, number>;
  deadEndReasonCounts: Record<string, number>;
  placementReasonCounts: Record<string, number>;
  taskWindowConflictCount: number;
  protectedIntervalConflictCount: number;
  contestantOverlapConflictCount: number;
  spaceOverlapConflictCount: number;
  resourceOverlapConflictCount: number;
  assignmentSearchBudgetExhaustedCount: number;
  unsupportedRequirementCodes: readonly string[];
  diagnosticsComplete: boolean;
  missingDiagnosticFields: readonly string[];
  fingerprint: string;
  readOnly: true;
}

export interface InitialConstructionAnchorBlockerClassification {
  blockerCodes: InitialConstructionAnchorBlockerCode[];
  primaryBlockerCode: InitialConstructionAnchorBlockerCode;
  evidenceComplete: boolean;
  classificationFingerprint: string;
}

const concreteConflictPrecedence: InitialConstructionAnchorBlockerCode[] = ["TASK_WINDOW_CONFLICT", "PROTECTED_INTERVAL_CONFLICT", "CONTESTANT_OVERLAP", "SPACE_OVERLAP", "RESOURCE_OVERLAP", "DEPENDENCY_CONFLICT"];
const primaryPrecedence: InitialConstructionAnchorBlockerCode[] = ["BLOCKER_EVIDENCE_INCOMPLETE", "UNSUPPORTED_REQUIREMENT", "BUDGET_EXHAUSTED", "NO_SEARCH_SPACE", ...concreteConflictPrecedence, "COMBINED_INVALID", "NO_HARD_VALID_BRANCH", "OTHER"];
const requiredDiagnosticFields = ["anchorTaskId", "searchSpaceFound", "provisionalWindowCount", "provisionalWindowsSample", "branchCount", "candidateBranchCount", "closureIncompleteBranchCount", "unsupportedBranchCount", "hardValidBranchCount", "branchStatusCounts", "branchRejectionReasonCounts", "deadEndReasonCounts", "placementReasonCounts", "taskWindowConflictCount", "protectedIntervalConflictCount", "contestantOverlapConflictCount", "spaceOverlapConflictCount", "resourceOverlapConflictCount", "assignmentSearchBudgetExhaustedCount", "unsupportedRequirementCodes", "diagnosticsComplete", "missingDiagnosticFields", "fingerprint", "readOnly"] as const;
const hash = (value: unknown): string => createHash("sha256").update(stableStringify(value)).digest("hex");
const validationCodes = (validation: any): string[] => [...(validation?.violatedConstraints ?? []), ...((validation?.violationDetails ?? []).map((detail: any) => detail?.code))].filter(Boolean).map(String);

function addValidationConflicts(codes: Set<InitialConstructionAnchorBlockerCode>, validation: any): void {
  for (const code of validationCodes(validation)) {
    if (/DEPENDENCY|PREREQUISITE|CYCLE/.test(code)) codes.add("DEPENDENCY_CONFLICT");
    else if (/PROTECTED|BREAK|LOCK/.test(code)) codes.add("PROTECTED_INTERVAL_CONFLICT");
    else if (/CONTESTANT|TEAM|TALENT/.test(code)) codes.add("CONTESTANT_OVERLAP");
    else if (/RESOURCE/.test(code)) codes.add("RESOURCE_OVERLAP");
    else if (/SPACE|TRANSPORT/.test(code)) codes.add("SPACE_OVERLAP");
    else if (/WINDOW|TIME|PLANNING_ENTRY|START|END/.test(code)) codes.add("TASK_WINDOW_CONFLICT");
  }
}

function conflictFrequency(code: InitialConstructionAnchorBlockerCode, diagnostics: Partial<InitialConstructionAnchorAttemptDiagnostics>): number {
  const dead = diagnostics.deadEndReasonCounts ?? {};
  if (code === "TASK_WINDOW_CONFLICT") return Number(diagnostics.taskWindowConflictCount ?? dead.TASK_WINDOW_CONFLICT ?? 0);
  if (code === "PROTECTED_INTERVAL_CONFLICT") return Number(diagnostics.protectedIntervalConflictCount ?? dead.PROTECTED_INTERVAL_CONFLICT ?? 0);
  if (code === "CONTESTANT_OVERLAP") return Number(diagnostics.contestantOverlapConflictCount ?? dead.CONTESTANT_OVERLAP ?? 0);
  if (code === "SPACE_OVERLAP") return Number(diagnostics.spaceOverlapConflictCount ?? dead.SPACE_OVERLAP ?? 0);
  if (code === "RESOURCE_OVERLAP") return Number(diagnostics.resourceOverlapConflictCount ?? dead.RESOURCE_OVERLAP ?? 0);
  if (code === "DEPENDENCY_CONFLICT") return Number(dead.DEPENDENCY_CONFLICT ?? dead.DEPENDENCY_CYCLE_IN_CLOSURE ?? dead.MISSING_PREREQUISITE_TASK ?? 0);
  return 0;
}

function primary(codes: Set<InitialConstructionAnchorBlockerCode>, diagnostics: Partial<InitialConstructionAnchorAttemptDiagnostics>): InitialConstructionAnchorBlockerCode {
  if (codes.has("BLOCKER_EVIDENCE_INCOMPLETE")) return "BLOCKER_EVIDENCE_INCOMPLETE";
  for (const c of ["UNSUPPORTED_REQUIREMENT", "BUDGET_EXHAUSTED", "NO_SEARCH_SPACE"] as InitialConstructionAnchorBlockerCode[]) if (codes.has(c)) return c;
  const conflicts = concreteConflictPrecedence.filter((c) => codes.has(c));
  if (conflicts.length) return conflicts.sort((a, b) => conflictFrequency(b, diagnostics) - conflictFrequency(a, diagnostics) || concreteConflictPrecedence.indexOf(a) - concreteConflictPrecedence.indexOf(b))[0];
  for (const c of ["COMBINED_INVALID", "NO_HARD_VALID_BRANCH", "OTHER"] as InitialConstructionAnchorBlockerCode[]) if (codes.has(c)) return c;
  return "OTHER";
}

export function classifyInitialConstructionAnchorBlockers(args: { diagnostics: Partial<InitialConstructionAnchorAttemptDiagnostics> | null | undefined; combinedValidation?: any | null; terminalReason?: string | null }): InitialConstructionAnchorBlockerClassification {
  const diagnostics = args.diagnostics ?? {};
  const missing = new Set<string>([...(Array.isArray(diagnostics.missingDiagnosticFields) ? diagnostics.missingDiagnosticFields : [])]);
  for (const field of requiredDiagnosticFields) if (!(field in diagnostics)) missing.add(field);
  const codes = new Set<InitialConstructionAnchorBlockerCode>();
  if (missing.size > 0 || diagnostics.diagnosticsComplete !== true) codes.add("BLOCKER_EVIDENCE_INCOMPLETE");
  const searchSpaceEvidenceAvailable = !missing.has("searchSpaceFound") && !missing.has("provisionalWindowCount") && !missing.has("stage.searchSpaces") && !missing.has("searchSpace.provisionalWindows");
  if (searchSpaceEvidenceAvailable && (diagnostics.searchSpaceFound === false || (diagnostics.searchSpaceFound === true && diagnostics.provisionalWindowCount === 0))) codes.add("NO_SEARCH_SPACE");
  if ((diagnostics.unsupportedBranchCount ?? 0) > 0 || (diagnostics.unsupportedRequirementCodes?.length ?? 0) > 0 || /unsupported/i.test(String(args.terminalReason ?? ""))) codes.add("UNSUPPORTED_REQUIREMENT");
  if ((diagnostics.assignmentSearchBudgetExhaustedCount ?? 0) > 0 || /budget/i.test(String(args.terminalReason ?? ""))) codes.add("BUDGET_EXHAUSTED");
  if ((diagnostics.taskWindowConflictCount ?? 0) > 0 || (diagnostics.deadEndReasonCounts?.TASK_WINDOW_CONFLICT ?? 0) > 0) codes.add("TASK_WINDOW_CONFLICT");
  if ((diagnostics.protectedIntervalConflictCount ?? 0) > 0 || (diagnostics.deadEndReasonCounts?.PROTECTED_INTERVAL_CONFLICT ?? 0) > 0) codes.add("PROTECTED_INTERVAL_CONFLICT");
  if ((diagnostics.contestantOverlapConflictCount ?? 0) > 0 || (diagnostics.deadEndReasonCounts?.CONTESTANT_OVERLAP ?? 0) > 0) codes.add("CONTESTANT_OVERLAP");
  if ((diagnostics.spaceOverlapConflictCount ?? 0) > 0 || (diagnostics.deadEndReasonCounts?.SPACE_OVERLAP ?? 0) > 0) codes.add("SPACE_OVERLAP");
  if ((diagnostics.resourceOverlapConflictCount ?? 0) > 0 || (diagnostics.deadEndReasonCounts?.RESOURCE_OVERLAP ?? 0) > 0) codes.add("RESOURCE_OVERLAP");
  if ((diagnostics.deadEndReasonCounts?.DEPENDENCY_CONFLICT ?? 0) > 0 || (diagnostics.deadEndReasonCounts?.DEPENDENCY_CYCLE_IN_CLOSURE ?? 0) > 0 || (diagnostics.deadEndReasonCounts?.MISSING_PREREQUISITE_TASK ?? 0) > 0) codes.add("DEPENDENCY_CONFLICT");
  if (String(args.terminalReason ?? "").startsWith("combined_INVALID") || args.combinedValidation?.result === "INVALID") { codes.add("COMBINED_INVALID"); addValidationConflicts(codes, args.combinedValidation); }
  if (diagnostics.searchSpaceFound === true && (diagnostics.provisionalWindowCount ?? 0) > 0 && (diagnostics.branchCount ?? 0) > 0 && (diagnostics.hardValidBranchCount ?? 0) === 0) codes.add("NO_HARD_VALID_BRANCH");
  if (codes.size === 0) codes.add("OTHER");
  const primaryBlockerCode = primary(codes, diagnostics);
  const blockerCodes = [...codes].sort((a, b) => primaryPrecedence.indexOf(a) - primaryPrecedence.indexOf(b));
  return { blockerCodes, primaryBlockerCode, evidenceComplete: !codes.has("BLOCKER_EVIDENCE_INCOMPLETE"), classificationFingerprint: hash({ diagnosticsFingerprint: diagnostics.fingerprint ?? null, missingDiagnosticFields: [...missing].sort(), blockerCodes, primaryBlockerCode, combinedValidation: { result: args.combinedValidation?.result ?? null, codes: validationCodes(args.combinedValidation).sort() }, terminalReason: args.terminalReason ?? null }) };
}
