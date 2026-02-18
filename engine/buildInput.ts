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
  const camerasFromResources = await storage.getCamerasAvailableForPlan(planId);
  const camerasAvailable =
    camerasFromResources !== null
      ? camerasFromResources
      : (p.cameras_available ?? p.camerasAvailable ?? 0);

  // Recursos anclados a ZONAS (snapshot/override por plan)
  const zoneResourceAssignments =
    (await storage.getZoneResourceAssignmentsForPlan(planId)) ?? {};

  const spaceResourceAssignments =
    (await storage.getSpaceResourceAssignmentsForPlan(planId)) ?? {};

  // ✅ Optimización global (Settings)
  const optimizer = await storage.getOptimizerSettings();

  // ✅ Jerarquía de espacios (para herencia de pools)
      const allSpaces = await storage.getSpaces();
      const spaceParentById: Record<number, number | null> = {};
      const spaceNameById: Record<number, string> = {};
      for (const s of (allSpaces as any[]) ?? []) {
        const id = Number((s as any)?.id);
        if (!Number.isFinite(id) || id <= 0) continue;

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
  for (const s of (allSpaces as any[]) ?? []) {
    const sid = Number((s as any)?.id);
    const zid = Number((s as any)?.zone_id ?? (s as any)?.zoneId ?? NaN);
    if (Number.isFinite(sid) && sid > 0 && Number.isFinite(zid) && zid > 0) {
      zoneIdBySpaceId[sid] = zid;
    }
  }

  const zoneResourceTypeRequirements =
    (await storage.getZoneResourceTypeRequirementsForPlan(planId)) ?? {};

  const spaceResourceTypeRequirements =
    (await storage.getSpaceResourceTypeRequirementsForPlan(planId)) ?? {};

  const planResourceItems = (await storage.getPlanResourceItemsForPlan(planId)) ?? [];

  const resourceItemIds = Array.from(
    new Set(
      planResourceItems
        .map((x) => Number((x as any)?.resourceItemId))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  );

  const resourceItemComponents =
    (await storage.getResourceItemComponentsMap(resourceItemIds)) ?? {};

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
    zoneResourceTypeRequirements,
    spaceResourceTypeRequirements,
        planResourceItems,
        resourceItemComponents,

        contestantAvailabilityById,

    optimizerMainZoneId: optimizer?.mainZoneId ?? null,
    optimizerPrioritizeMainZone: optimizer?.prioritizeMainZone === true,
    optimizerGroupBySpaceAndTemplate: optimizer?.groupBySpaceAndTemplate !== false,

    optimizerMainZonePriorityLevel: optimizer?.mainZonePriorityLevel ?? (optimizer?.prioritizeMainZone ? 2 : 0),
    optimizerGroupingLevel: optimizer?.groupingLevel ?? (optimizer?.groupBySpaceAndTemplate !== false ? 2 : 0),
    optimizerMainZoneOptFinishEarly: optimizer?.mainZoneOptFinishEarly !== false,
    optimizerMainZoneOptKeepBusy: optimizer?.mainZoneOptKeepBusy !== false,
    optimizerContestantCompactLevel: optimizer?.contestantCompactLevel ?? 0,
    optimizerContestantStayInZoneLevel: optimizer?.contestantStayInZoneLevel ?? 0,

    optimizerWeights: {
      mainZoneFinishEarly: resolveWeight(
        optimizer?.optimizationMode,
        optimizer?.heuristics?.mainZoneFinishEarly,
        optimizer?.mainZonePriorityLevel,
      ),
      mainZoneKeepBusy: resolveWeight(
        optimizer?.optimizationMode,
        optimizer?.heuristics?.mainZoneKeepBusy,
        optimizer?.mainZonePriorityLevel,
      ),
      contestantCompact: resolveWeight(
        optimizer?.optimizationMode,
        optimizer?.heuristics?.contestantCompact,
        optimizer?.contestantCompactLevel,
      ),
      groupBySpaceTemplateMatch: resolveWeight(
        optimizer?.optimizationMode,
        optimizer?.heuristics?.groupBySpaceTemplateMatch,
        optimizer?.groupingLevel,
      ),
      groupBySpaceActive: resolveWeight(
        optimizer?.optimizationMode,
        optimizer?.heuristics?.groupBySpaceActive,
        optimizer?.groupingLevel,
      ),
      contestantStayInZone: resolveWeight(
        optimizer?.optimizationMode,
        optimizer?.heuristics?.contestantStayInZone,
        optimizer?.contestantStayInZoneLevel,
      ),
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
        const effectiveContestantId =
          isManualBlock && manualScopeType === "contestant" && Number.isFinite(manualScopeId as any)
            ? Number(manualScopeId)
            : contestantId;

        return {
          id: t.id,
          planId: t.plan_id ?? t.planId,
          templateId,
          templateName: (isManualBlock
            ? (t.manual_title ?? t.manualTitle ?? tpl?.name ?? t.template?.name ?? "BLOQUEO")
            : (tpl?.name ?? t.template?.name ?? null)) as string | null,
          
          resourceRequirements: normalizeResourceRequirements(
            (tpl as any)?.resourceRequirements ??
              (tpl as any)?.resource_requirements ??
              null,
          ),

          zoneId: (t.zone_id ?? t.zoneId ?? null) as number | null,
          spaceId: isManualBlock && manualScopeType === "space" && Number.isFinite(manualScopeId as any)
            ? Number(manualScopeId)
            : ((t.space_id ?? t.spaceId ?? null) as number | null),

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

          // ✅ Dependencias (ya resueltas a taskIds)
          hasDependency,
          dependsOnTemplateIds,
          dependsOnTaskIds,
          // legacy (compat)
          dependsOnTemplateId,
          dependsOnTaskId,

        durationOverrideMin: t.duration_override ?? t.durationOverride ?? null,
        camerasOverride: (t.cameras_override ?? t.camerasOverride ?? null) as
          | 0
          | 1
          | 2
          | null,

        startPlanned: t.start_planned ?? t.startPlanned ?? null,
        endPlanned: t.end_planned ?? t.endPlanned ?? null,
        lockedStart: t.start_planned ?? t.startPlanned ?? null,
        lockedEnd: t.end_planned ?? t.endPlanned ?? null,
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
              fixedWindowStart: String(b.earliest_start ?? p.meal_start ?? p.mealStart),
              fixedWindowEnd: String(b.latest_end ?? p.meal_end ?? p.mealEnd),
              durationOverrideMin: Number(b.duration_minutes ?? 45),
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
