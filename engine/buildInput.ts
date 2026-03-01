import { IStorage } from "../server/storage";
import { EngineInput } from "./types";
import { resolveWeight } from "@shared/optimizer";

export async function buildEngineInput(
  planId: number,
  storage: IStorage,
): Promise<EngineInput> {
  const details = await storage.getPlanFullDetails(planId);
  if (!details) {
    throw new Error(`Plan ${planId} not found`);
  }

  // TODO: Map DB entities to EngineInput types
  // This is where we isolate the domain from the engine

  const p: any = details.plan;

  const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (_e) {
      return fallback;
    }
  };

  const contestants = await storage.getContestantsByPlan(planId);
  const contestantNameById = new Map<number, string>();
  const contestantAvailabilityById: Record<number, { start: string; end: string }> = {};

  for (const c of contestants as any[]) {
    contestantNameById.set(Number(c.id), String(c.name ?? ""));

    const cid = Number(c.id);
    if (!Number.isFinite(cid) || cid <= 0) continue;

    const aStart = (c.availabilityStart ?? c.availability_start ?? null) as string | null;
    const aEnd = (c.availabilityEnd ?? c.availability_end ?? null) as string | null;

    const start = String(aStart ?? "").trim();
    const end = String(aEnd ?? "").trim();

    if (start && end) {
      contestantAvailabilityById[cid] = { start, end };
    }
  }

  // Cameras now come from per-plan resource items (type code "cameras")
  // Fallback to legacy plan.camerasAvailable if the plan has no snapshot.
  const camerasFromResources = await safe(() => storage.getCamerasAvailableForPlan(planId), null);
  const camerasAvailable =
    camerasFromResources !== null
      ? camerasFromResources
      : (p.cameras_available ?? p.camerasAvailable ?? 0);

  // Recursos anclados a ZONAS (snapshot/override por plan)
  const zoneResourceAssignments =
    (await safe(() => storage.getZoneResourceAssignmentsForPlan(planId), {})) ?? {};

  const spaceResourceAssignments =
    (await safe(() => storage.getSpaceResourceAssignmentsForPlan(planId), {})) ?? {};

  // ✅ Optimización global (Settings)
  const optimizer = await storage.getOptimizerSettings();
  const optimizationMode = optimizer?.optimizationMode === "advanced" ? "advanced" : "basic";
  const clampWeight = (value: unknown) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(10, Math.round(n)));
  };

  const mainZoneKeepBusyWeight = clampWeight(optimizer?.heuristics?.mainZoneKeepBusy?.advancedValue);
  const mainZoneFinishEarlyWeight = clampWeight(optimizer?.heuristics?.mainZoneFinishEarly?.advancedValue);
  const groupingWeight = clampWeight(
    Math.max(
      Number(optimizer?.heuristics?.groupBySpaceTemplateMatch?.advancedValue ?? 0),
      Number(optimizer?.heuristics?.groupBySpaceActive?.advancedValue ?? 0),
    ),
  );

  const optimizerMainZoneOptKeepBusy =
    optimizationMode === "advanced"
      ? mainZoneKeepBusyWeight > 0
      : optimizer?.mainZoneOptKeepBusy !== false;

  const optimizerMainZoneOptFinishEarly =
    optimizationMode === "advanced"
      ? mainZoneFinishEarlyWeight > 0
      : optimizer?.mainZoneOptFinishEarly !== false;

  const optimizerGroupBySpaceAndTemplate =
    optimizationMode === "advanced"
      ? groupingWeight > 0
      : optimizer?.groupBySpaceAndTemplate !== false;

  // ✅ Jerarquía de espacios (para herencia de pools)
      const allSpaces = await storage.getSpaces();
      const existingSpaceIds = new Set<number>();
      const spaceParentById: Record<number, number | null> = {};
      const spaceNameById: Record<number, string> = {};
      for (const s of (allSpaces as any[]) ?? []) {
        const id = Number((s as any)?.id);
        if (!Number.isFinite(id) || id <= 0) continue;
        existingSpaceIds.add(id);

    const parentRaw =
      (s as any)?.parent_space_id ?? (s as any)?.parentSpaceId ?? null;

    if (parentRaw === null || parentRaw === undefined) {
      spaceParentById[id] = null;
    } else {
      const parentId = Number(parentRaw);
      spaceParentById[id] =
        Number.isFinite(parentId) && parentId > 0 ? parentId : null;
    }

    const spaceName = String((s as any)?.name ?? "").trim();
    if (spaceName) spaceNameById[id] = spaceName;
  }


  const zoneIdBySpaceId: Record<number, number> = {};
  const zonePreferredMealWindow = new Map<number, { start: string | null; end: string | null }>();
  const groupingBySpaceId: Record<number, { key: string; level: number; minChain: number }> = {};
  const clamp = (v: unknown, min: number, max: number, fallback: number) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(n)));
  };
  const zoneGroupingMap = new Map<number, { level: number; minChain: number }>();
  const maxTemplateChangesByZoneId: Record<number, number> = {};
  const groupingZoneIds: number[] = Array.from(
    new Set<number>(
      (Array.isArray((optimizer as any)?.groupingZoneIds)
        ? (optimizer as any).groupingZoneIds
        : Array.isArray((optimizer as any)?.grouping_zone_ids)
          ? (optimizer as any).grouping_zone_ids
          : []
      )
        .map((v: any) => Number(v))
        .filter((n: number) => Number.isFinite(n) && n > 0),
    ),
  );

  const spaceMeta = new Map<number, { zoneId: number | null; parentSpaceId: number | null; groupingLevel: number; groupingMinChain: number; groupingApplyToDescendants: boolean }>();

  const zones = await storage.getZones();
  for (const z of (zones as any[]) ?? []) {
    const zid = Number((z as any)?.id);
    if (!Number.isFinite(zid) || zid <= 0) continue;
    const start = ((z as any)?.meal_start_preferred ?? (z as any)?.mealStartPreferred ?? null) as string | null;
    const end = ((z as any)?.meal_end_preferred ?? (z as any)?.mealEndPreferred ?? null) as string | null;
    zonePreferredMealWindow.set(zid, { start, end });

    const zoneLevel = clamp((z as any)?.grouping_level ?? (z as any)?.groupingLevel ?? (z as any)?.minimize_changes_level ?? (z as any)?.minimizeChangesLevel, 0, 10, 0);
    const zoneMinChain = clamp((z as any)?.grouping_min_chain ?? (z as any)?.groupingMinChain ?? (z as any)?.minimize_changes_min_chain ?? (z as any)?.minimizeChangesMinChain, 1, 50, 4);
    zoneGroupingMap.set(zid, { level: zoneLevel, minChain: zoneMinChain });
    maxTemplateChangesByZoneId[zid] = clamp((z as any)?.max_template_changes ?? (z as any)?.maxTemplateChanges, 0, 50, 4);
  }

  for (const s of (allSpaces as any[]) ?? []) {
    const sid = Number((s as any)?.id);
    if (!Number.isFinite(sid) || sid <= 0) continue;

    const zid = Number((s as any)?.zone_id ?? (s as any)?.zoneId ?? NaN);
    const parentRaw = (s as any)?.parent_space_id ?? (s as any)?.parentSpaceId ?? null;
    const parentIdNum = Number(parentRaw);

    const zoneId = Number.isFinite(zid) && zid > 0 ? zid : null;
    if (zoneId) zoneIdBySpaceId[sid] = zoneId;

    spaceMeta.set(sid, {
      zoneId,
      parentSpaceId: Number.isFinite(parentIdNum) && parentIdNum > 0 ? parentIdNum : null,
      groupingLevel: clamp((s as any)?.grouping_level ?? (s as any)?.groupingLevel ?? (s as any)?.minimize_changes_level ?? (s as any)?.minimizeChangesLevel, 0, 10, 0),
      groupingMinChain: clamp((s as any)?.grouping_min_chain ?? (s as any)?.groupingMinChain ?? (s as any)?.minimize_changes_min_chain ?? (s as any)?.minimizeChangesMinChain, 1, 50, 4),
      groupingApplyToDescendants: Boolean((s as any)?.grouping_apply_to_descendants ?? (s as any)?.groupingApplyToDescendants ?? false),
    });
  }

  const zonesByName = new Map<string, number>();
  for (const z of (zones as any[]) ?? []) {
    const zid = Number((z as any)?.id);
    if (!Number.isFinite(zid) || zid <= 0) continue;
    const name = String((z as any)?.name ?? "").trim().toLowerCase();
    if (!name || zonesByName.has(name)) continue;
    zonesByName.set(name, zid);
  }

  const spacesByName = new Map<string, number>();
  for (const s of (allSpaces as any[]) ?? []) {
    const sid = Number((s as any)?.id);
    if (!Number.isFinite(sid) || sid <= 0) continue;
    const name = String((s as any)?.name ?? "").trim().toLowerCase();
    if (!name || spacesByName.has(name)) continue;
    spacesByName.set(name, sid);
  }

  const fallbackTransportSpaceId = spacesByName.get("transporte") ?? null;
  const firstAvailableZoneId = (() => {
    for (const z of (zones as any[]) ?? []) {
      const zid = Number((z as any)?.id);
      if (Number.isFinite(zid) && zid > 0) return zid;
    }
    return null;
  })();
  const fallbackOthersZoneId = zonesByName.get("otros") ?? firstAvailableZoneId;

  const resolveGroupingForSpace = (spaceId: number): { key: string; level: number; minChain: number } | null => {
    const self = spaceMeta.get(spaceId);
    if (!self) return null;

    if (self.groupingLevel > 0) {
      return { key: `S:${spaceId}`, level: self.groupingLevel, minChain: self.groupingMinChain };
    }

    let cursor = self.parentSpaceId;
    let hops = 0;
    while (cursor && hops < 30) {
      hops += 1;
      const anc = spaceMeta.get(cursor);
      if (!anc) break;
      if (anc.groupingLevel > 0 && anc.groupingApplyToDescendants) {
        return { key: `S:${cursor}`, level: anc.groupingLevel, minChain: anc.groupingMinChain };
      }
      cursor = anc.parentSpaceId;
    }

    if (self.zoneId) {
      const zcfg = zoneGroupingMap.get(self.zoneId);
      if (zcfg && zcfg.level > 0) {
        return { key: `Z:${self.zoneId}`, level: zcfg.level, minChain: zcfg.minChain };
      }
    }

    return null;
  };

  for (const sid of spaceMeta.keys()) {
    const cfg = resolveGroupingForSpace(sid);
    if (cfg) groupingBySpaceId[sid] = cfg;
  }


  const zoneResourceTypeRequirements =
    (await safe(() => storage.getZoneResourceTypeRequirementsForPlan(planId), {})) ?? {};

  const spaceResourceTypeRequirements =
    (await safe(() => storage.getSpaceResourceTypeRequirementsForPlan(planId), {})) ?? {};

  const planResourceItems = (await safe(() => storage.getPlanResourceItemsForPlan(planId), [])) ?? [];

  const resourceItemIds = Array.from(
    new Set(
      planResourceItems
        .map((x) => Number((x as any)?.resourceItemId))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  );

  const resourceItemComponents =
    (await safe(() => storage.getResourceItemComponentsMap(resourceItemIds), {})) ?? {};

  // ✅ Dependencias: leemos task_templates y resolvemos por concursante
  const templates = await storage.getTaskTemplates();
  const templateById = new Map<number, any>();
  for (const tt of templates as any[]) templateById.set(Number(tt.id), tt);

  // ✅ Mapa id -> nombre (para mensajes de dependencias)
  const taskTemplateNameById: Record<number, string> = {};
  for (const tt of templates as any[]) {
    const id = Number(tt?.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    const name = String(tt?.name ?? "").trim();
    if (name) taskTemplateNameById[id] = name;
  }

  // helper para leer camelCase o snake_case (defensivo con ZIPs viejos)
  const getHasDep = (tt: any) =>
    Boolean(tt?.hasDependency ?? tt?.has_dependency ?? false);

  const getDepTemplateId = (tt: any) => {
    const v = tt?.dependsOnTemplateId ?? tt?.depends_on_template_id ?? null;
    return v === null || v === undefined ? null : Number(v);
  };

  const getDepTemplateIds = (tt: any): number[] => {
    const raw =
      tt?.dependsOnTemplateIds ??
      tt?.depends_on_template_ids ??
      tt?.dependsOnTemplateIDs ??
      null;

    let arr: any[] = [];
    if (Array.isArray(raw)) arr = raw;
    else if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) arr = parsed;
      } catch {
        arr = [];
      }
    }

    return Array.from(
      new Set(
        arr
          .map((x) => Number(x))
          .filter((n) => Number.isFinite(n) && n > 0),
      ),
    );
  };

  const normalizeResourceRequirements = (raw: any) => {
    let rr: any = null;

    // ✅ soportar JSON guardado como string (legacy / UI antigua)
    if (typeof raw === "string") {
      try {
        rr = JSON.parse(raw);
      } catch {
        rr = null;
      }
    } else if (raw && typeof raw === "object") {
      rr = raw;
    }

    // ✅ soportar claves legacy snake_case dentro del JSON
    if (rr && typeof rr === "object") {
      if (rr.byType == null && rr.by_type != null) rr.byType = rr.by_type;
      if (rr.byItem == null && rr.by_item != null) rr.byItem = rr.by_item;
      if (rr.anyOf == null && rr.any_of != null) rr.anyOf = rr.any_of;
    }

    const byType: Record<number, number> = {};
    const byItem: Record<number, number> = {};

    const btRaw = (rr as any)?.byType ?? null;

    // Formato A: array [{resourceTypeId, quantity}]
      if (Array.isArray(btRaw)) {
        for (const r of btRaw) {
          const tid = Number((r as any)?.resourceTypeId ?? (r as any)?.resource_type_id);
          const qty = Number((r as any)?.quantity ?? (r as any)?.qty ?? 0);
          if (!Number.isFinite(tid) || tid <= 0) continue;
          if (!Number.isFinite(qty) || qty <= 0) continue;
          byType[tid] = Math.min(99, Math.max(0, Math.floor(qty)));
        }
      }
    // Formato B: map { "<typeId>": quantity }
    else if (btRaw && typeof btRaw === "object") {
      for (const [k, v] of Object.entries(btRaw)) {
        const tid = Number(k);
        const qty = Number(v ?? 0);
        if (!Number.isFinite(tid) || tid <= 0) continue;
        if (!Number.isFinite(qty) || qty <= 0) continue;
        byType[tid] = Math.min(99, Math.max(0, Math.floor(qty)));
      }
    }

    const biRaw = (rr as any)?.byItem ?? null;

    // Formato A: array [{resourceItemId, quantity}]
      if (Array.isArray(biRaw)) {
        for (const r of biRaw) {
          const iid = Number((r as any)?.resourceItemId ?? (r as any)?.resource_item_id);
          const qty = Number((r as any)?.quantity ?? (r as any)?.qty ?? 0);
          if (!Number.isFinite(iid) || iid <= 0) continue;
          if (!Number.isFinite(qty) || qty <= 0) continue;
          byItem[iid] = Math.min(99, Math.max(0, Math.floor(qty)));
        }
      }
    // Formato B: map { "<resourceItemId>": quantity }
    else if (biRaw && typeof biRaw === "object") {
      for (const [k, v] of Object.entries(biRaw)) {
        const iid = Number(k);
        const qty = Number(v ?? 0);
        if (!Number.isFinite(iid) || iid <= 0) continue;
        if (!Number.isFinite(qty) || qty <= 0) continue;
        byItem[iid] = Math.min(99, Math.max(0, Math.floor(qty)));
      }
    }

        const anyOfRaw = Array.isArray((rr as any)?.anyOf) ? (rr as any).anyOf : [];
        const anyOf = anyOfRaw
          .map((g: any) => {
            const q = Number(g?.quantity ?? 1);
            const ids = Array.isArray(g?.resourceItemIds)
              ? g.resourceItemIds
              : Array.isArray(g?.resource_item_ids)
                ? g.resource_item_ids
                : [];
        const quantity = Number.isFinite(q) && q > 0 ? Math.min(99, Math.floor(q)) : 1;
        const resourceItemIds = Array.from(
          new Set(
            ids
              .map((n: any) => Number(n))
              .filter((n: number) => Number.isFinite(n) && n > 0),
          ),
        );
        return resourceItemIds.length > 0 ? { quantity, resourceItemIds } : null;
      })
      .filter(Boolean) as Array<{ quantity: number; resourceItemIds: number[] }>;

    const out: any = {};
    if (Object.keys(byType).length > 0) out.byType = byType;
    if (Object.keys(byItem).length > 0) out.byItem = byItem;
    if (anyOf.length > 0) out.anyOf = anyOf;

    return Object.keys(out).length > 0 ? out : null;
  };

  // Mapa rápido: (contestantId + templateId) -> taskId
  const taskIdByContestantAndTemplate = new Map<string, number>();
  for (const t of details.tasks as any[]) {
    const contestantId = t.contestant_id ?? t.contestantId ?? null;
    if (!contestantId) continue;
    const templateId = Number(t.template_id ?? t.templateId);
    taskIdByContestantAndTemplate.set(
      `${Number(contestantId)}:${templateId}`,
      Number(t.id),
    );
  }

  const locksArr = Array.isArray(details.locks) ? details.locks : [];
  const lockByTaskId = new Map<
    number,
    { lockType: string; lockedStart: string | null; lockedEnd: string | null }
  >();
  for (const lock of locksArr as any[]) {
    const taskId = Number(lock?.task_id ?? lock?.taskId ?? NaN);
    if (!Number.isFinite(taskId) || taskId <= 0) continue;

    const lockType = String(lock?.lock_type ?? lock?.lockType ?? "").trim();
    if (lockType !== "time" && lockType !== "full") continue;

    const lockedStart = (lock?.locked_start ?? lock?.lockedStart ?? null) as string | null;
    const lockedEnd = (lock?.locked_end ?? lock?.lockedEnd ?? null) as string | null;
    if (!lockedStart || !lockedEnd) continue;

    lockByTaskId.set(taskId, { lockType, lockedStart, lockedEnd });
  }

  const minutesFromHHMM = (value: string | null | undefined) => {
    if (!value) return null;
    const parts = String(value).split(":");
    if (parts.length < 2) return null;
    const hh = Number(parts[0]);
    const mm = Number(parts[1]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return hh * 60 + mm;
  };

  return {
    planId: p.id,

    workDay: {
      start: p.work_start ?? p.workStart,
      end: p.work_end ?? p.workEnd,
    },

    meal: {
      start: p.meal_start ?? p.mealStart,
      end: p.meal_end ?? p.mealEnd,
    },
    mealTaskTemplateName: String(
      p.meal_task_template_name ?? p.mealTaskTemplateName ?? "Comer",
    ),
    mealTaskTemplateId: (() => {
      const explicit = Number(p.meal_task_template_id ?? p.mealTaskTemplateId ?? NaN);
      if (Number.isFinite(explicit) && explicit > 0) return explicit;

      const mealName = String(
        p.meal_task_template_name ?? p.mealTaskTemplateName ?? "",
      )
        .trim()
        .toLowerCase();
      if (!mealName) return null;

      const found = (templates as any[]).find(
        (tpl: any) => String(tpl?.name ?? "").trim().toLowerCase() === mealName,
      );
      const inferred = Number(found?.id ?? NaN);
      return Number.isFinite(inferred) && inferred > 0 ? inferred : null;
    })(),

    // ✅ Comida concursantes (por plan)
    contestantMealDurationMinutes: Number(
      p.contestant_meal_duration_minutes ?? p.contestantMealDurationMinutes ?? 75,
    ),
    contestantMealMaxSimultaneous: Number(
      p.contestant_meal_max_simultaneous ?? p.contestantMealMaxSimultaneous ?? 10,
    ),

    camerasAvailable,

    taskTemplateNameById,

    zoneResourceAssignments,
    spaceResourceAssignments,
    spaceParentById,
    spaceNameById,
    groupingBySpaceId,
    minimizeChangesBySpace: Object.fromEntries(Object.entries(groupingBySpaceId).map(([k, v]) => [Number(k), { level: v.level, minChain: v.minChain }])),
    zoneResourceTypeRequirements,
    spaceResourceTypeRequirements,
        planResourceItems,
        resourceItemComponents,

        contestantAvailabilityById,

    optimizerMainZoneId: optimizer?.mainZoneId ?? null,
    optimizerPrioritizeMainZone: optimizer?.prioritizeMainZone === true,
    optimizerGroupBySpaceAndTemplate,

    groupingZoneIds,
    maxTemplateChangesByZoneId,

    optimizerMainZonePriorityLevel: optimizer?.mainZonePriorityLevel ?? (optimizer?.prioritizeMainZone ? 2 : 0),
    optimizerGroupingLevel: optimizer?.groupingLevel ?? (optimizerGroupBySpaceAndTemplate ? 2 : 0),
    optimizerMainZoneOptFinishEarly,
    optimizerMainZoneOptKeepBusy,
    optimizerContestantCompactLevel: optimizer?.contestantCompactLevel ?? 0,
    optimizerContestantStayInZoneLevel: optimizer?.contestantStayInZoneLevel ?? 0,
    optimizerNearHardBreaksMax: Math.max(0, Math.min(10, Number((optimizer as any)?.nearHardBreaksMax ?? 0) || 0)),
    arrivalTaskTemplateName: String((optimizer as any)?.arrivalTaskTemplateName ?? ""),
    departureTaskTemplateName: String((optimizer as any)?.departureTaskTemplateName ?? ""),
    arrivalGroupingTarget: Number((optimizer as any)?.arrivalGroupingTarget ?? 0),
    departureGroupingTarget: Number((optimizer as any)?.departureGroupingTarget ?? 0),
    arrivalMinGapMinutes: Number((optimizer as any)?.arrivalMinGapMinutes ?? 0),
    departureMinGapMinutes: Number((optimizer as any)?.departureMinGapMinutes ?? 0),
    vanCapacity: Number((optimizer as any)?.vanCapacity ?? 0),

    optimizerWeights: {
      mainZoneFinishEarly: resolveWeight(
        optimizationMode,
        optimizer?.heuristics?.mainZoneFinishEarly,
        optimizer?.mainZonePriorityLevel,
      ),
      mainZoneKeepBusy: resolveWeight(
        optimizationMode,
        optimizer?.heuristics?.mainZoneKeepBusy,
        optimizer?.mainZonePriorityLevel,
      ),
      contestantCompact: resolveWeight(
        optimizationMode,
        optimizer?.heuristics?.contestantCompact,
        optimizer?.contestantCompactLevel,
      ),
      groupBySpaceTemplateMatch: resolveWeight(
        optimizationMode,
        optimizer?.heuristics?.groupBySpaceTemplateMatch,
        optimizer?.groupingLevel,
      ),
      groupBySpaceActive: resolveWeight(
        optimizationMode,
        optimizer?.heuristics?.groupBySpaceActive,
        optimizer?.groupingLevel,
      ),
      contestantStayInZone: resolveWeight(
        optimizationMode,
        optimizer?.heuristics?.contestantStayInZone,
        optimizer?.contestantStayInZoneLevel,
      ),
      arrivalDepartureGrouping: resolveWeight(
        optimizationMode,
        (optimizer as any)?.heuristics?.arrivalDepartureGrouping,
        (optimizer as any)?.weightArrivalDepartureGrouping,
      ),
      contestantTotalSpan: 0,
    },

          tasks: [
            ...details.tasks.map((t: any) => {
      const contestantId = (t.contestant_id ?? t.contestantId ?? null) as
        | number
        | null;

        const templateId = Number(t.template_id ?? t.templateId);

        // ✅ Fallback: si no está en el map global, usar la plantilla ya join-eada en la tarea
        const tpl =
          templateById.get(templateId) ??
          (t.template ?? null);

        const depTemplateIdsFromArray = getDepTemplateIds(tpl);
        const legacyDepTemplateId = getDepTemplateId(tpl);

        // hasDependency: true si hay array con elementos o si legacy venía activo
        const hasDependency =
          depTemplateIdsFromArray.length > 0 || getHasDep(tpl);

        // Normalizamos: lista final de templateIds prereq
        const dependsOnTemplateIds = Array.from(
          new Set(
            [
              ...depTemplateIdsFromArray,
              ...(legacyDepTemplateId ? [legacyDepTemplateId] : []),
            ].filter(Boolean) as number[],
          ),
        );

        // Resolución: si hay concursante, buscamos prereqs del mismo concursante
        const dependsOnTaskIds =
          hasDependency && contestantId && dependsOnTemplateIds.length
            ? dependsOnTemplateIds
                .map((depTplId) => {
                  return (
                    taskIdByContestantAndTemplate.get(
                      `${Number(contestantId)}:${Number(depTplId)}`,
                    ) ?? null
                  );
                })
                .filter((x) => x !== null)
                .map((x) => Number(x))
            : [];

        // Legacy (compat): primer elemento, si existe
        const dependsOnTemplateId =
          dependsOnTemplateIds.length > 0 ? dependsOnTemplateIds[0] : null;

        const dependsOnTaskId =
          dependsOnTaskIds.length > 0 ? dependsOnTaskIds[0] : null;

        const isManualBlock = (t.is_manual_block ?? t.isManualBlock ?? false) === true;
        const manualScopeType = (t.manual_scope_type ?? t.manualScopeType ?? null) as string | null;
        const manualScopeIdRaw = t.manual_scope_id ?? t.manualScopeId ?? null;
        const manualScopeId = manualScopeIdRaw == null ? null : Number(manualScopeIdRaw);
        const startPlanned = (t.start_planned ?? t.startPlanned ?? null) as string | null;
        const endPlanned = (t.end_planned ?? t.endPlanned ?? null) as string | null;
        const explicitDurationRaw = t.duration_override ?? t.durationOverride ?? null;
        const templateDurationRaw =
          (tpl as any)?.default_duration ??
          (tpl as any)?.defaultDuration ??
          (tpl as any)?.default_duration_min ??
          (tpl as any)?.defaultDurationMin ??
          null;
        const toNormalizedDuration = (value: unknown): number | null => {
          const parsed = Number(value);
          if (!Number.isFinite(parsed) || parsed <= 0) return null;
          return Math.max(1, Math.floor(parsed));
        };
        const effectiveDurationMin =
          toNormalizedDuration(explicitDurationRaw) ??
          toNormalizedDuration(templateDurationRaw) ??
          30;
        const lockForTask = lockByTaskId.get(Number(t.id));
        const manualDuration = (() => {
          const startMin = minutesFromHHMM(startPlanned);
          const endMin = minutesFromHHMM(endPlanned);
          if (startMin === null || endMin === null) return 15;
          const delta = endMin - startMin;
          if (!Number.isFinite(delta) || delta <= 0) return 15;
          return delta;
        })();
        const effectiveContestantId =
          isManualBlock && manualScopeType === "contestant" && Number.isFinite(manualScopeId as any)
            ? Number(manualScopeId)
            : contestantId;
        const rawSpaceId = isManualBlock && manualScopeType === "space" && Number.isFinite(manualScopeId as any)
          ? Number(manualScopeId)
          : ((t.space_id ?? t.spaceId ?? null) as number | null);
        const normalizedSpaceId = Number(rawSpaceId);
        const hasInvalidSpace = Number.isFinite(normalizedSpaceId) && normalizedSpaceId > 0 && !existingSpaceIds.has(normalizedSpaceId);

        return {
          id: t.id,
          planId: t.plan_id ?? t.planId,
          templateId,
          templateName: (isManualBlock
            ? (t.manual_title ?? t.manualTitle ?? tpl?.name ?? t.template?.name ?? "BLOQUEO")
            : (tpl?.name ?? t.template?.name ?? null)) as string | null,
          
          resourceRequirements: isManualBlock
            ? []
            : normalizeResourceRequirements(
                (tpl as any)?.resourceRequirements ??
                  (tpl as any)?.resource_requirements ??
                  null,
              ),

          zoneId: (() => {
            const rawZoneId = t.zone_id ?? t.zoneId ?? null;
            const normalizedZoneId = Number(rawZoneId);
            const explicitZoneId =
              Number.isFinite(normalizedZoneId) && normalizedZoneId > 0
                ? normalizedZoneId
                : null;

            const resolvedSpaceId = hasInvalidSpace ? null : normalizedSpaceId;
            const zoneFromSpace =
              resolvedSpaceId !== null
                ? zoneIdBySpaceId[resolvedSpaceId] ?? null
                : null;

            const templateName = String(
              (isManualBlock
                ? (t.manual_title ?? t.manualTitle ?? tpl?.name ?? t.template?.name ?? "")
                : (tpl?.name ?? t.template?.name ?? "")) ?? "",
            )
              .trim()
              .toLowerCase();

            const arrivalTemplateName = String((optimizer as any)?.arrivalTaskTemplateName ?? "")
              .trim()
              .toLowerCase();
            const departureTemplateName = String((optimizer as any)?.departureTaskTemplateName ?? "")
              .trim()
              .toLowerCase();

            const isArrivalOrDeparture = Boolean(
              templateName && (templateName === arrivalTemplateName || templateName === departureTemplateName),
            );

            if (explicitZoneId) return explicitZoneId;
            if (zoneFromSpace) return zoneFromSpace;
            if (isArrivalOrDeparture) return fallbackOthersZoneId;
            return null;
          })(),
          spaceId: (() => {
            const resolvedSpaceId = hasInvalidSpace ? null : normalizedSpaceId;
            if (resolvedSpaceId !== null) return resolvedSpaceId;

            const templateName = String(
              (isManualBlock
                ? (t.manual_title ?? t.manualTitle ?? tpl?.name ?? t.template?.name ?? "")
                : (tpl?.name ?? t.template?.name ?? "")) ?? "",
            )
              .trim()
              .toLowerCase();
            const arrivalTemplateName = String((optimizer as any)?.arrivalTaskTemplateName ?? "")
              .trim()
              .toLowerCase();
            const departureTemplateName = String((optimizer as any)?.departureTaskTemplateName ?? "")
              .trim()
              .toLowerCase();
            const isArrivalOrDeparture = Boolean(
              templateName && (templateName === arrivalTemplateName || templateName === departureTemplateName),
            );

            if (isArrivalOrDeparture && fallbackTransportSpaceId) return fallbackTransportSpaceId;
            return null;
          })(),
          _invalidSpaceId: hasInvalidSpace ? normalizedSpaceId : null,
          _unplannedHint: hasInvalidSpace
            ? {
                code: "MISSING_SPACE",
                message: "El espacio asignado fue eliminado o no existe.",
              }
            : null,

          contestantId: effectiveContestantId,
          contestantName: effectiveContestantId
            ? (contestantNameById.get(effectiveContestantId) ?? null)
            : null,
          status: t.status,
          itinerantTeamId:
            (tpl as any)?.itinerantTeamRequirement === "specific" &&
            Number.isFinite(Number((tpl as any)?.itinerantTeamId))
              ? Number((tpl as any).itinerantTeamId)
              : null,
          allowedItinerantTeamIds: (() => {
            const rulesJson =
              (tpl as any)?.rulesJson ??
              (tpl as any)?.rules_json ??
              null;
            const fromRules: unknown[] = Array.isArray((rulesJson as any)?.itinerantTeamAllowedIds)
              ? (rulesJson as any).itinerantTeamAllowedIds
              : Array.isArray((rulesJson as any)?.itinerant_team_allowed_ids)
                ? (rulesJson as any).itinerant_team_allowed_ids
                : [];

            const normalized: number[] = Array.from(
              new Set(
                fromRules
                  .map((id: any) => Number(id))
                  .filter((id: number) => Number.isFinite(id) && id > 0),
              ),
            );

            if (normalized.length > 0) return normalized;

            const requirement = String(
              (tpl as any)?.itinerantTeamRequirement ??
                (tpl as any)?.itinerant_team_requirement ??
                "none",
            )
              .trim()
              .toLowerCase();
            const specificId = Number(
              (tpl as any)?.itinerantTeamId ?? (tpl as any)?.itinerant_team_id ?? NaN,
            );
            if (requirement === "specific" && Number.isFinite(specificId) && specificId > 0) {
              return [specificId];
            }

            return [];
          })(),
          itinerantTeamRequirement:
            (tpl as any)?.itinerantTeamRequirement ??
            (tpl as any)?.itinerant_team_requirement ??
            "none",

          // ✅ Dependencias (ya resueltas a taskIds)
          hasDependency: isManualBlock ? false : hasDependency,
          dependsOnTemplateIds: isManualBlock ? [] : dependsOnTemplateIds,
          dependsOnTaskIds: isManualBlock ? [] : dependsOnTaskIds,
          // legacy (compat)
          dependsOnTemplateId: isManualBlock ? null : dependsOnTemplateId,
          dependsOnTaskId: isManualBlock ? null : dependsOnTaskId,

        durationOverrideMin: isManualBlock ? manualDuration : effectiveDurationMin,
        camerasOverride: (t.cameras_override ?? t.camerasOverride ?? null) as
          | 0
          | 1
          | 2
          | null,

        startPlanned,
        endPlanned,
        lockedStart: isManualBlock
          ? startPlanned
          : (lockForTask?.lockedStart ?? null),
        lockedEnd: isManualBlock
          ? endPlanned
          : (lockForTask?.lockedEnd ?? null),
        lockType: isManualBlock ? "time" : (lockForTask?.lockType ?? null),
        startReal: t.start_real ?? t.startReal ?? null,
        endReal: t.end_real ?? t.endReal ?? null,

        // ✅ Recursos ya asignados en BD (plan_resource_items.id)
        // Soporta camelCase/snake_case
        assignedResourceIds:
          (t.assignedResources ?? t.assigned_resource_ids ?? null) as any,
        };
    }),
            ...(((details as any).breaks ?? []) as any[]).map((b: any) => ({
              id: -Number(b.id),
              planId,
              templateId: -1,
              templateName: "COMIDA",
              status: "pending" as const,
              spaceId: b.space_id == null ? null : Number(b.space_id),
              zoneId:
                b.space_id == null
                  ? null
                  : zoneIdBySpaceId[Number(b.space_id)] ?? null,
              contestantId: null,
              contestantName: null,
              breakId: Number(b.id),
              breakKind: String(b.kind),
              itinerantTeamId:
                b.itinerant_team_id == null ? null : Number(b.itinerant_team_id),
              itinerantTeamRequirement: "none",
              fixedWindowStart: (() => {
                const spaceId = b.space_id == null ? null : Number(b.space_id);
                const zid = spaceId == null ? null : (zoneIdBySpaceId[spaceId] ?? null);
                const pref = zid == null ? null : zonePreferredMealWindow.get(zid) ?? null;
                const globalStart = String(b.earliest_start ?? p.meal_start ?? p.mealStart);
                const preferredStart = pref?.start ? String(pref.start) : null;
                if (!preferredStart) return globalStart;
                return preferredStart > globalStart ? preferredStart : globalStart;
              })(),
              fixedWindowEnd: (() => {
                const spaceId = b.space_id == null ? null : Number(b.space_id);
                const zid = spaceId == null ? null : (zoneIdBySpaceId[spaceId] ?? null);
                const pref = zid == null ? null : zonePreferredMealWindow.get(zid) ?? null;
                const globalEnd = String(b.latest_end ?? p.meal_end ?? p.mealEnd);
                const preferredEnd = pref?.end ? String(pref.end) : null;
                if (!preferredEnd) return globalEnd;
                return preferredEnd < globalEnd ? preferredEnd : globalEnd;
              })(),
              durationOverrideMin: Number(b.duration_minutes ?? 45),
              startPlanned: b.planned_start ?? null,
              endPlanned: b.planned_end ?? null,
              lockedStart: b.locked_start ?? null,
              lockedEnd: b.locked_end ?? null,
              assignedResourceIds: [],
            })),
          ],

    locks: details.locks.map((l: any) => ({
      id: l.id,
      planId: l.plan_id ?? l.planId,
      taskId: l.task_id ?? l.taskId,
      lockType: l.lock_type ?? l.lockType,
      lockedStart: l.locked_start ?? l.lockedStart ?? null,
      lockedEnd: l.locked_end ?? l.lockedEnd ?? null,
      lockedResourceId: l.locked_resource_id ?? l.lockedResourceId ?? null,
    })),
  };
}
