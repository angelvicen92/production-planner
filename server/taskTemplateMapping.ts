import type { UpdateTaskTemplateInput } from "@shared/routes";
import type { TaskTemplate } from "@shared/schema";

export function mapTaskTemplatePatch(patch: UpdateTaskTemplateInput): Record<string, unknown> {
    const safe: any = {};
    if (patch.participantMarginBeforeMinutes === null || typeof patch.participantMarginBeforeMinutes === "number")
      safe.participant_margin_before_minutes = patch.participantMarginBeforeMinutes;
    if (patch.participantMarginAfterMinutes === null || typeof patch.participantMarginAfterMinutes === "number")
      safe.participant_margin_after_minutes = patch.participantMarginAfterMinutes;
    if (typeof patch.name === "string") safe.name = patch.name;

    if (typeof patch.requiresAuxiliar === "boolean")
      safe.requires_auxiliar = patch.requiresAuxiliar;
    if (typeof patch.requiresCoach === "boolean")
      safe.requires_coach = patch.requiresCoach;
    if (typeof patch.requiresPresenter === "boolean")
      safe.requires_presenter = patch.requiresPresenter;
    if (typeof patch.exclusiveAuxiliar === "boolean")
      safe.exclusive_auxiliar = patch.exclusiveAuxiliar;

    if (patch.setupId === null || typeof patch.setupId === "number")
      safe.setup_id = patch.setupId;

    const hasRules = Object.prototype.hasOwnProperty.call(patch, "rulesJson");
    if (hasRules) safe.rules_json = patch.rulesJson;

    const hasRR = Object.prototype.hasOwnProperty.call(
      patch,
      "resourceRequirements",
    );
    if (hasRR) safe.resource_requirements = patch.resourceRequirements;
    if (typeof patch.defaultDuration === "number")
      safe.default_duration = patch.defaultDuration;
    if (typeof patch.defaultCameras === "number")
      safe.default_cameras = patch.defaultCameras;
    if (typeof patch.autoCreateOnContestantCreate === "boolean") {
      safe.auto_create_on_contestant_create =
        patch.autoCreateOnContestantCreate;
    }
    if (patch.abbrev === null || typeof patch.abbrev === "string") safe.abbrev = patch.abbrev;
    if (patch.defaultComment1Color === null || typeof patch.defaultComment1Color === "string") safe.default_comment1_color = patch.defaultComment1Color;
    if (patch.defaultComment2Color === null || typeof patch.defaultComment2Color === "string") safe.default_comment2_color = patch.defaultComment2Color;
    if (patch.uiColor === null || typeof patch.uiColor === "string") {
      safe.ui_color = patch.uiColor;
    }
    if (
      patch.uiColorSecondary === null ||
      typeof patch.uiColorSecondary === "string"
    ) {
      safe.ui_color_secondary = patch.uiColorSecondary;
    }
    // ✅ NUEVO: dependencias múltiples
    const hasDependsIds = Object.prototype.hasOwnProperty.call(
      patch,
      "dependsOnTemplateIds",
    );
    if (hasDependsIds) {
      const arr = Array.isArray(patch.dependsOnTemplateIds)
        ? patch.dependsOnTemplateIds
        : [];
      safe.depends_on_template_ids = arr;

      // sync legacy
      safe.has_dependency = arr.length > 0;
      safe.depends_on_template_id = arr.length > 0 ? arr[0] : null;
    }

    // legacy (compat) si NO llega el array
    if (!hasDependsIds) {
      if (typeof patch.hasDependency === "boolean")
        safe.has_dependency = patch.hasDependency;

      const hasDependsId = Object.prototype.hasOwnProperty.call(
        patch,
        "dependsOnTemplateId",
      );
      if (hasDependsId) {
        safe.depends_on_template_id = patch.dependsOnTemplateId;
      }

      // coherencia: si desactivan dependencia, limpiamos
      if (
        typeof patch.hasDependency === "boolean" &&
        patch.hasDependency === false
      ) {
        safe.depends_on_template_id = null;
        safe.depends_on_template_ids = [];
      }
    }

    // coherencia: si desactivan dependencia, limpiamos el id
    if (
      typeof patch.hasDependency === "boolean" &&
      patch.hasDependency === false
    ) {
      safe.depends_on_template_id = null;
    }

    // ✅ NUEVO: equipo itinerante requerido (none | any | specific)
    const hasTeamReq = Object.prototype.hasOwnProperty.call(
      patch,
      "itinerantTeamRequirement",
    );
    const hasTeamId = Object.prototype.hasOwnProperty.call(
      patch,
      "itinerantTeamId",
    );

    if (hasTeamReq) {
      const v =
        patch.itinerantTeamRequirement === "any"
          ? "any"
          : patch.itinerantTeamRequirement === "specific"
            ? "specific"
            : "none";
      safe.itinerant_team_requirement = v;

      // coherencia automática
      if (v !== "specific") safe.itinerant_team_id = null;
      if (v === "specific" && !hasTeamId) {
        // si pasan a specific pero no mandan id en este patch, lo dejamos como estaba (no tocamos)
      }
    }

    if (hasTeamId) {
      // si llega id, solo tiene sentido si el requirement es specific
      // si no han mandado requirement en este patch, asumimos que quieren specific
      if (!hasTeamReq) safe.itinerant_team_requirement = "specific";
      safe.itinerant_team_id = patch.itinerantTeamId ?? null;
    }

    if (patch.zoneId === null || typeof patch.zoneId === "number")
      safe.zone_id = patch.zoneId;
    if (patch.spaceId === null || typeof patch.spaceId === "number")
      safe.space_id = patch.spaceId;

    // Template location is zone_id/space_id. location_label belongs to daily_tasks.

    return safe;
}

export function mapTaskTemplateRow(data: any): TaskTemplate {
    return {
      id: data.id,
      revision: data.revision,
      name: data.name,
      defaultDuration: data.default_duration ?? null,
      defaultCameras: data.default_cameras ?? 0,
      participantMarginBeforeMinutes: data.participant_margin_before_minutes ?? null,
      participantMarginAfterMinutes: data.participant_margin_after_minutes ?? null,
      autoCreateOnContestantCreate:
        (data as any).auto_create_on_contestant_create ?? false,
      abbrev: (data as any).abbrev ?? null,
      defaultComment1Color: (data as any).default_comment1_color ?? null,
      defaultComment2Color: (data as any).default_comment2_color ?? null,
      requiresAuxiliar: data.requires_auxiliar ?? false,
      requiresCoach: data.requires_coach ?? false,
      requiresPresenter: data.requires_presenter ?? false,
      exclusiveAuxiliar: data.exclusive_auxiliar ?? false,
      setupId: data.setup_id ?? null,
      rulesJson: data.rules_json ?? null,
      resourceRequirements: (data as any).resource_requirements ?? null,
      uiColor: (data as any).ui_color ?? null,
      uiColorSecondary: (data as any).ui_color_secondary ?? null,

      // ✅ NUEVO: equipo itinerante requerido
      itinerantTeamRequirement:
        (data as any).itinerant_team_requirement ?? "none",
      itinerantTeamId:
        (data as any).itinerant_team_id == null
          ? null
          : Number((data as any).itinerant_team_id),

      zoneId: data.zone_id ?? null,
      spaceId: data.space_id ?? null,
      // ✅ NUEVO: múltiples dependencias devueltas
      dependsOnTemplateIds: Array.isArray((data as any).depends_on_template_ids)
        ? ((data as any).depends_on_template_ids as any[])
            .map((x) => Number(x))
            .filter((n) => Number.isFinite(n))
        : [],

      hasDependency: (data as any).has_dependency ?? false,
      dependsOnTemplateId: (data as any).depends_on_template_id ?? null,
    } as any;
}
