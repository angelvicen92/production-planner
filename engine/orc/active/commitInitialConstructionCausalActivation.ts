import { createHash } from "node:crypto";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";
import type { InitialConstructionCausalActivationTransactionResult } from "./initialConstructionCausalActivationTransaction";
import type { InitialConstructionCausalAlternativeActivationSource } from "./initialConstructionCausalAlternativeActivation";

const hash = (value: unknown) => createHash("sha256").update(stableStringify(value)).digest("hex");

type PartialPlanLike = Readonly<Record<string, unknown>>;
type FrontierEntryLike = Readonly<Record<string, unknown>>;

type SuspendedFrontierLike = Readonly<{
  entries: readonly FrontierEntryLike[];
}>;

export interface InitialConstructionCausalActivationCommitEvidence {
  readonly transactionId: string | null;
  readonly source: InitialConstructionCausalAlternativeActivationSource | null;
  readonly selectedPartialPlanId: string | null;
  readonly selectedAssignmentsFingerprint: string | null;
  readonly sourceEntryId: string | null;
  readonly sourceEntryFingerprint: string | null;
  readonly openedAttemptId: string | null;
  readonly committed: boolean;
  readonly reason: string | null;
  readonly fingerprint: string;
  readonly readOnly: true;
}

export interface CommitInitialConstructionCausalActivationInput {
  readonly transaction: InitialConstructionCausalActivationTransactionResult;
  readonly currentActive: PartialPlanLike;
  readonly suspendedFrontier: SuspendedFrontierLike;
  readonly causalArchive: readonly PartialPlanLike[];
  readonly readOnly: true;
}

export interface CommitInitialConstructionCausalActivationResult {
  readonly committed: boolean;
  readonly active: PartialPlanLike | null;
  readonly suspendedFrontier: SuspendedFrontierLike;
  readonly causalArchive: readonly PartialPlanLike[];
  readonly activeCausalBranchAttemptId: string | null;
  readonly source: InitialConstructionCausalAlternativeActivationSource | null;
  readonly backtrackConsumed: boolean;
  readonly transitionConsumed: boolean;
  readonly evidence: InitialConstructionCausalActivationCommitEvidence;
  readonly readOnly: true;
}

const entryPartialPlan = (entry: FrontierEntryLike): PartialPlanLike =>
  entry.partialPlan && typeof entry.partialPlan === "object"
    ? (entry.partialPlan as PartialPlanLike)
    : entry;

const entryId = (entry: FrontierEntryLike): string =>
  String(entry.partialPlanId ?? entryPartialPlan(entry).partialPlanId ?? "");

const entryFingerprint = (entry: FrontierEntryLike): string =>
  String(entry.assignmentsFingerprint ?? entryPartialPlan(entry).assignmentsFingerprint ?? "");

const finish = (
  payload: Omit<CommitInitialConstructionCausalActivationResult, "evidence" | "readOnly"> & {
    readonly evidence: Omit<InitialConstructionCausalActivationCommitEvidence, "fingerprint" | "readOnly">;
  },
): CommitInitialConstructionCausalActivationResult => {
  const evidence = { ...payload.evidence, fingerprint: hash(payload.evidence), readOnly: true } as const;
  return deepFreeze({ ...payload, evidence, readOnly: true }) as CommitInitialConstructionCausalActivationResult;
};

export function commitInitialConstructionCausalActivation(
  args: CommitInitialConstructionCausalActivationInput,
): CommitInitialConstructionCausalActivationResult {
  const selected = args.transaction.selectedCandidate;
  const sourceCommit = args.transaction.sourceCommit;
  const openedAttemptId = args.transaction.preparedActivation?.openedAttemptId ?? null;
  const transactionId = String((args.transaction.transactionEvidence as Record<string, unknown>).transactionId ?? "") || null;
  const reject = (reason: string): CommitInitialConstructionCausalActivationResult =>
    finish({
      committed: false,
      active: null,
      suspendedFrontier: args.suspendedFrontier,
      causalArchive: args.causalArchive,
      activeCausalBranchAttemptId: null,
      source: sourceCommit?.source ?? selected?.source ?? null,
      backtrackConsumed: false,
      transitionConsumed: false,
      evidence: {
        transactionId,
        source: sourceCommit?.source ?? selected?.source ?? null,
        selectedPartialPlanId: selected?.partialPlan.partialPlanId ?? null,
        selectedAssignmentsFingerprint: selected?.partialPlan.assignmentsFingerprint ?? null,
        sourceEntryId: sourceCommit?.sourceEntryId ?? selected?.sourceEntryId ?? null,
        sourceEntryFingerprint: sourceCommit?.sourceEntryFingerprint ?? selected?.sourceEntryFingerprint ?? null,
        openedAttemptId,
        committed: false,
        reason,
      },
    });

  if (args.transaction.status !== "ACTIVATION_PREPARED") return reject("TRANSACTION_NOT_PREPARED");
  if (!selected) return reject("MISSING_SELECTED_CANDIDATE");
  if (!openedAttemptId) return reject("MISSING_OPENED_ATTEMPT");
  if (!sourceCommit) return reject("MISSING_SOURCE_COMMIT");
  if (sourceCommit.source !== selected.source) return reject("SOURCE_MISMATCH");

  let suspendedEntries = [...args.suspendedFrontier.entries];
  let causalArchive = [...args.causalArchive];
  if (sourceCommit.source === "SUSPENDED_FRONTIER") {
    const index = suspendedEntries.findIndex(
      (entry) => entryId(entry) === String(sourceCommit.sourceEntryId ?? "") && entryFingerprint(entry) === sourceCommit.sourceEntryFingerprint,
    );
    if (index < 0) return reject("SUSPENDED_FRONTIER_ENTRY_NOT_FOUND");
    suspendedEntries = suspendedEntries.filter((_, entryIndex) => entryIndex !== index);
  } else if (sourceCommit.source === "CAUSAL_ARCHIVE") {
    const index = causalArchive.findIndex(
      (entry) => String(entry.partialPlanId ?? "") === String(sourceCommit.sourceEntryId ?? "") && String(entry.assignmentsFingerprint ?? "") === sourceCommit.sourceEntryFingerprint,
    );
    if (index < 0) return reject("CAUSAL_ARCHIVE_ENTRY_NOT_FOUND");
    causalArchive = causalArchive.filter((_, entryIndex) => entryIndex !== index);
  }

  const active = deepFreeze({ ...selected.partialPlan, status: "ACTIVE" }) as PartialPlanLike;
  return finish({
    committed: true,
    active,
    suspendedFrontier: deepFreeze({ ...args.suspendedFrontier, entries: suspendedEntries }) as SuspendedFrontierLike,
    causalArchive: deepFreeze(causalArchive) as readonly PartialPlanLike[],
    activeCausalBranchAttemptId: openedAttemptId,
    source: sourceCommit.source,
    backtrackConsumed: true,
    transitionConsumed: true,
    evidence: {
      transactionId,
      source: sourceCommit.source,
      selectedPartialPlanId: selected.partialPlan.partialPlanId,
      selectedAssignmentsFingerprint: selected.partialPlan.assignmentsFingerprint,
      sourceEntryId: sourceCommit.sourceEntryId,
      sourceEntryFingerprint: sourceCommit.sourceEntryFingerprint,
      openedAttemptId,
      committed: true,
      reason: null,
    },
  });
}
