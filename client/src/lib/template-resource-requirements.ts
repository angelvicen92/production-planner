type QuantityMap = Record<string, unknown>;
type Requirements = Record<string, unknown>;
export type TemplateResourceType = {
  id: number; name: string; code?: string; isActive?: boolean;
  items?: { id: number; name: string; isActive?: boolean; isAvailable?: boolean;
    defaultAvailabilityStart?: string | null; defaultAvailabilityEnd?: string | null }[];
};
export type TemplateResourceOption = { id: number; label: string; available: boolean; reason?: string };
const record = (value: unknown): value is Requirements => value !== null && typeof value === "object" && !Array.isArray(value);

export function templateResourceOptions(types: TemplateResourceType[], coachIds: ReadonlySet<number>): TemplateResourceOption[] {
  const options = new Map<number, TemplateResourceOption>();
  for (const type of types) for (const item of type.items ?? []) {
    if (!Number.isSafeInteger(item.id) || item.id <= 0 || coachIds.has(item.id)) continue;
    const unsupported = type.code === "auxiliar";
    const available = type.isActive !== false && item.isActive !== false && item.isAvailable !== false && !unsupported;
    const window = item.defaultAvailabilityStart && item.defaultAvailabilityEnd
      ? ` · ${item.defaultAvailabilityStart}–${item.defaultAvailabilityEnd}` : "";
    const previous = options.get(item.id);
    options.set(item.id, {
      id: item.id, label: `${type.name} (#${type.id}) · ${item.name} (#${item.id})${window}`,
      available: available && !previous,
      reason: previous ? "Identidad ambigua" : unsupported ? "Usa la configuración de auxiliares" : !available ? "No disponible" : undefined,
    });
  }
  return [...options.values()];
}

export function templateByItem(requirements: unknown): QuantityMap {
  if (!record(requirements)) return {};
  const items = requirements.byItem ?? requirements.by_item;
  return record(items) ? items : {};
}

export function canEditTemplateByItem(requirements: unknown): boolean {
  if (requirements == null) return true;
  if (!record(requirements)) return false;
  const items = requirements.byItem ?? requirements.by_item;
  return items == null || record(items);
}

/** Change only the named item. Hidden dimensions and unrepresentable legacy values survive literally. */
export function setTemplateResourceItem(requirements: unknown, id: number, selected: boolean,
  options: readonly TemplateResourceOption[]): Requirements {
  if (!canEditTemplateByItem(requirements)) throw new Error("La configuración existente no admite este editor. No se ha modificado.");
  if (!Number.isSafeInteger(id) || id <= 0 || (selected && !options.some(option => option.id === id && option.available)))
    throw new Error("Selecciona un recurso disponible del catálogo.");
  const previous = requirements == null ? {} : requirements as Requirements;
  const key = previous.byItem == null && previous.by_item != null ? "by_item" : "byItem";
  const items = { ...templateByItem(previous) };
  if (selected) {
    if (Object.hasOwn(items, String(id))) throw new Error("El recurso ya está seleccionado.");
    items[id] = 1;
  } else delete items[id];
  return { ...previous, [key]: items };
}

/** Recheck additions at save time after catalog refetches, without rewriting existing requirements. */
export function validateTemplateResourceChanges(before: unknown, after: unknown, options: readonly TemplateResourceOption[]): string | null {
  const previous = templateByItem(before);
  for (const [key, quantity] of Object.entries(templateByItem(after))) {
    if (Object.hasOwn(previous, key) && previous[key] === quantity) continue;
    if (quantity !== 1 || !options.some(option => String(option.id) === key && option.available))
      return "Los nuevos recursos deben estar disponibles en el catálogo y tener cantidad 1. Recarga los recursos y revisa la selección.";
  }
  return null;
}

/** The existing coach control owns only coach entries; all other dimensions stay untouched. */
export function setTemplateCoach(requirements: unknown, typeId: number, coachIds: ReadonlySet<number>,
  enabled: boolean, mode: string, selectedId: number): Requirements {
  if (!canEditTemplateByItem(requirements)) throw new Error("No se puede modificar el coach de esta configuración.");
  if (!Number.isSafeInteger(typeId) || typeId <= 0) throw new Error("No existe el tipo de recurso Vocal Coach.");
  if (enabled && mode === "specific" && !coachIds.has(selectedId)) throw new Error("Selecciona un vocal coach válido.");
  const previous = requirements == null ? {} : requirements as Requirements;
  const typeKey = previous.byType == null && previous.by_type != null ? "by_type" : "byType";
  const itemKey = previous.byItem == null && previous.by_item != null ? "by_item" : "byItem";
  const rawTypes = previous[typeKey];
  if (rawTypes != null && !record(rawTypes)) throw new Error("No se puede modificar el coach de esta configuración.");
  const byType = { ...(rawTypes as QuantityMap ?? {}) }, byItem = { ...templateByItem(previous) };
  delete byType[typeId];
  for (const id of coachIds) delete byItem[id];
  if (enabled) {
    if (mode === "specific") byItem[selectedId] = 1;
    else byType[typeId] = 1;
  }
  return { ...previous, [typeKey]: byType, [itemKey]: byItem };
}
