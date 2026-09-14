export const RESOURCE_BUNDLE_SIGNAL_UNAVAILABLE = "RESOURCE_BUNDLE_SIGNAL_UNAVAILABLE" as const;

export type PlanResourceBundleSnapshotCandidateV1 = Readonly<{
  contract_version: 1;
  source: "INHERITED";
  bundles: readonly Record<string, unknown>[];
  components: readonly Record<string, unknown>[];
  space_affinities: readonly Record<string, unknown>[];
}>;

/**
 * `null` means the optional bundle signal was unavailable. A non-null candidate
 * with empty arrays means the source loaded successfully and the catalog was
 * genuinely empty. Keep these states distinct so EngineInput can warn/fallback
 * only for unavailable data.
 */
export function buildPlanResourceBundleSnapshotCandidateV1(input: Readonly<{
  bundles: readonly Record<string, unknown>[] | null;
  components: readonly Record<string, unknown>[] | null;
  spaceAffinities: readonly Record<string, unknown>[] | null;
  bundlesError: unknown;
  componentsError: unknown;
  spaceAffinitiesError: unknown;
}>): PlanResourceBundleSnapshotCandidateV1 | null {
  if (input.bundlesError || input.componentsError || input.spaceAffinitiesError) return null;

  const bundles = input.bundles ?? [];
  const activeBundleIds = new Set(bundles.map((row) => String(row.id)));
  return Object.freeze({
    contract_version: 1,
    source: "INHERITED",
    bundles,
    components: (input.components ?? []).filter((row) => activeBundleIds.has(String(row.bundle_id))),
    space_affinities: (input.spaceAffinities ?? []).filter((row) => activeBundleIds.has(String(row.bundle_id))),
  });
}
