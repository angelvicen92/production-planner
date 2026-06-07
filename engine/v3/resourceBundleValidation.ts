import type {
  EngineInput,
  ResourceBundleComponentInput,
  ResourceBundleInput,
  ResourceBundleSpaceAffinityInput,
} from "../types";

export type ResourceBundleValidationWarningCode =
  | "BUNDLE_WITHOUT_COMPONENTS"
  | "BUNDLE_COMPONENT_WITHOUT_RESOURCE_ITEM"
  | "BUNDLE_COMPONENT_UNKNOWN_RESOURCE_ITEM"
  | "DUPLICATE_BUNDLE_COMPONENT"
  | "INVALID_BUNDLE_COMPONENT_QUANTITY"
  | "BUNDLE_AFFINITY_UNKNOWN_SPACE"
  | "RESOURCE_BUNDLE_LOAD_FAILED";

export interface ResourceBundleValidationWarning {
  code: ResourceBundleValidationWarningCode;
  severity: "info" | "warning";
  message: string;
  bundleId?: string;
  componentId?: string;
  affinityId?: string;
  source?: string;
}

export interface ValidatedResourceBundleCatalog {
  usableBundles: ResourceBundleInput[];
  usableComponents: ResourceBundleComponentInput[];
  usableAffinities: ResourceBundleSpaceAffinityInput[];
  warnings: ResourceBundleValidationWarning[];
  usableBundleCount: number;
  invalidBundleCount: number;
  partiallyUsableBundleCount: number;
}

const warningSort = (left: ResourceBundleValidationWarning, right: ResourceBundleValidationWarning): number => (
  left.code.localeCompare(right.code)
  || String(left.bundleId ?? "").localeCompare(String(right.bundleId ?? ""))
  || left.message.localeCompare(right.message)
);

const knownSpaceIds = (input: EngineInput): Set<number> | null => {
  const ids = new Set<number>();
  let hasSpaceCatalog = input.spaceNameById !== undefined;
  for (const key of Object.keys(input.spaceNameById ?? {})) {
    const id = Number(key);
    if (Number.isFinite(id) && id > 0) ids.add(id);
  }
  for (const task of input.tasks ?? []) {
    const id = Number(task.spaceId);
    if (Number.isFinite(id) && id > 0) ids.add(id);
  }
  for (const key of Object.keys(input.spaceResourceAssignments ?? {})) {
    const id = Number(key);
    if (Number.isFinite(id) && id > 0) ids.add(id);
  }
  if (ids.size > 0) hasSpaceCatalog = true;
  return hasSpaceCatalog ? ids : null;
};

export const validateResourceBundles = (input: EngineInput): ValidatedResourceBundleCatalog => {
  const activeBundles = (input.resourceBundles ?? []).filter((bundle) => bundle.isActive !== false);
  if (activeBundles.length === 0) {
    const loadWarnings = (input.resourceBundleLoadWarnings ?? []).map((warning): ResourceBundleValidationWarning => ({
      code: "RESOURCE_BUNDLE_LOAD_FAILED",
      severity: "warning",
      message: warning.message,
      source: warning.source,
    }));
    return {
      usableBundles: [],
      usableComponents: [],
      usableAffinities: [],
      warnings: loadWarnings.sort(warningSort),
      usableBundleCount: 0,
      invalidBundleCount: 0,
      partiallyUsableBundleCount: 0,
    };
  }

  const activeBundleIds = new Set(activeBundles.map((bundle) => bundle.id));
  const knownResourceItemIds = new Set((input.planResourceItems ?? []).map((item) => Number(item.resourceItemId)));
  const spaces = knownSpaceIds(input);
  const warnings: ResourceBundleValidationWarning[] = (input.resourceBundleLoadWarnings ?? []).map((warning) => ({
    code: "RESOURCE_BUNDLE_LOAD_FAILED",
    severity: "warning",
    message: warning.message,
    source: warning.source,
  }));
  const issueBundleIds = new Set<string>();
  const usableComponents: ResourceBundleComponentInput[] = [];
  const componentsByBundle = new Map<string, ResourceBundleComponentInput[]>();
  const declaredComponentCountByBundle = new Map<string, number>();
  const duplicateKeys = new Set<string>();

  for (const component of input.resourceBundleComponents ?? []) {
    if (!activeBundleIds.has(component.bundleId)) continue;
    declaredComponentCountByBundle.set(component.bundleId, (declaredComponentCountByBundle.get(component.bundleId) ?? 0) + 1);
    const componentId = component.id;
    if (component.resourceItemId == null || !Number.isFinite(Number(component.resourceItemId))) {
      issueBundleIds.add(component.bundleId);
      warnings.push({
        code: "BUNDLE_COMPONENT_WITHOUT_RESOURCE_ITEM",
        severity: "info",
        message: `El componente ${componentId ?? "sin id"} del bundle ${component.bundleId} no referencia resourceItem y no se usa en scoring.`,
        bundleId: component.bundleId,
        componentId,
      });
      continue;
    }
    const resourceItemId = Number(component.resourceItemId);
    if (!knownResourceItemIds.has(resourceItemId)) {
      issueBundleIds.add(component.bundleId);
      warnings.push({
        code: "BUNDLE_COMPONENT_UNKNOWN_RESOURCE_ITEM",
        severity: "warning",
        message: `El bundle ${component.bundleId} referencia resourceItem ${resourceItemId}, ausente del snapshot del plan.`,
        bundleId: component.bundleId,
        componentId,
      });
      continue;
    }
    const role = String(component.componentRole ?? "").trim().toLowerCase();
    const duplicateKey = `${component.bundleId}\u0000${resourceItemId}\u0000${role}`;
    if (duplicateKeys.has(duplicateKey)) {
      issueBundleIds.add(component.bundleId);
      warnings.push({
        code: "DUPLICATE_BUNDLE_COMPONENT",
        severity: "warning",
        message: `El bundle ${component.bundleId} repite resourceItem ${resourceItemId} con role ${component.componentRole}.`,
        bundleId: component.bundleId,
        componentId,
      });
      continue;
    }
    duplicateKeys.add(duplicateKey);

    const quantity = Number(component.quantity);
    const normalized = !Number.isFinite(quantity) || quantity <= 0;
    if (normalized) {
      issueBundleIds.add(component.bundleId);
      warnings.push({
        code: "INVALID_BUNDLE_COMPONENT_QUANTITY",
        severity: "warning",
        message: `El componente ${componentId ?? "sin id"} del bundle ${component.bundleId} tiene quantity inválida; se normaliza a 1 para scoring soft.`,
        bundleId: component.bundleId,
        componentId,
      });
    }
    const usable = { ...component, resourceItemId, quantity: normalized ? 1 : quantity };
    usableComponents.push(usable);
    const rows = componentsByBundle.get(component.bundleId) ?? [];
    rows.push(usable);
    componentsByBundle.set(component.bundleId, rows);
  }

  const usableBundles: ResourceBundleInput[] = [];
  let invalidBundleCount = 0;
  let partiallyUsableBundleCount = 0;
  for (const bundle of activeBundles) {
    const components = componentsByBundle.get(bundle.id) ?? [];
    if (components.length === 0) {
      invalidBundleCount += 1;
      issueBundleIds.add(bundle.id);
      if ((declaredComponentCountByBundle.get(bundle.id) ?? 0) === 0) {
        warnings.push({
          code: "BUNDLE_WITHOUT_COMPONENTS",
          severity: "warning",
          message: `El bundle activo ${bundle.name || bundle.id} no tiene componentes y no se usa en scoring.`,
          bundleId: bundle.id,
        });
      }
      continue;
    }
    usableBundles.push(bundle);
    if (issueBundleIds.has(bundle.id)) partiallyUsableBundleCount += 1;
  }

  const usableBundleIds = new Set(usableBundles.map((bundle) => bundle.id));
  const usableAffinities: ResourceBundleSpaceAffinityInput[] = [];
  for (const affinity of input.resourceBundleSpaceAffinities ?? []) {
    if (!usableBundleIds.has(affinity.bundleId)) continue;
    const spaceId = Number(affinity.spaceId);
    if (!Number.isFinite(spaceId) || spaceId <= 0 || (spaces !== null && !spaces.has(spaceId))) {
      if (!issueBundleIds.has(affinity.bundleId)) partiallyUsableBundleCount += 1;
      issueBundleIds.add(affinity.bundleId);
      warnings.push({
        code: "BUNDLE_AFFINITY_UNKNOWN_SPACE",
        severity: "warning",
        message: `El bundle ${affinity.bundleId} referencia el espacio ${String(affinity.spaceId)}, ausente del plan; la afinidad se ignora.`,
        bundleId: affinity.bundleId,
        affinityId: affinity.id,
      });
      continue;
    }
    usableAffinities.push({ ...affinity, spaceId });
  }

  return {
    usableBundles,
    usableComponents,
    usableAffinities,
    warnings: warnings.sort(warningSort),
    usableBundleCount: usableBundles.length,
    invalidBundleCount,
    partiallyUsableBundleCount,
  };
};

export const getUsableResourceBundleCatalog = validateResourceBundles;
