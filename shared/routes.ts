import { z } from "zod";
import { optimizerHeuristicKeys } from "./optimizer";
import {
  insertPlanSchema,
  plans,
  dailyTasks,
  insertDailyTaskSchema,
  taskTemplates,
  insertTaskTemplateSchema,
  contestants,
  insertContestantSchema,
  updateContestantSchema,
  zones,
  spaces,
} from "./schema";

export const updatePlanSchema = z
  .object({
    workStart: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    workEnd: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    mealStart: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    mealEnd: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),

    contestantMealDurationMinutes: z.number().int().min(1).max(240).optional(),
    contestantMealMaxSimultaneous: z.number().int().min(1).max(50).optional(),

    camerasAvailable: z.number().int().min(0).max(20).optional(),
  })
  .strict();

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  infeasible: z.object({
    message: z.string(),
    reasons: z.array(z.string()),
  }),
};

export const api = {
  // Staff catalog (Producción / Redacción)
  staffPeople: {
    list: {
      method: "GET" as const,
      path: "/api/staff-people",
      responses: {
        200: z.array(
          z.object({
            id: z.number(),
            name: z.string(),
            roleType: z.enum(["production", "editorial"]),
            isActive: z.boolean(),
          }),
        ),
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/staff-people",
      input: z
        .object({
          name: z.string().min(1),
          roleType: z.enum(["production", "editorial"]),
          isActive: z.boolean().optional(),
        })
        .strict(),
      responses: {
        201: z.object({
          id: z.number(),
          name: z.string(),
          roleType: z.enum(["production", "editorial"]),
          isActive: z.boolean(),
        }),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: "PATCH" as const,
      path: "/api/staff-people/:id",
      input: z
        .object({
          name: z.string().min(1).optional(),
          roleType: z.enum(["production", "editorial"]).optional(),
          isActive: z.boolean().optional(),
        })
        .strict(),
      responses: {
        200: z.object({
          id: z.number(),
          name: z.string(),
          roleType: z.enum(["production", "editorial"]),
          isActive: z.boolean(),
        }),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/staff-people/:id",
      responses: {
        200: z.object({ success: z.literal(true) }),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
  },

  // Defaults globales (Settings) -> se clonan al crear un plan
  staffDefaults: {
    zoneModes: {
      list: {
        method: "GET" as const,
        path: "/api/staff-defaults/zone-modes",
        responses: {
          200: z.array(
            z.object({
              zoneId: z.number(),
              mode: z.enum(["zone", "space"]),
            }),
          ),
        },
      },
      saveAll: {
        method: "PUT" as const,
        path: "/api/staff-defaults/zone-modes",
        input: z
          .object({
            modes: z.array(
              z.object({
                zoneId: z.number().int().positive(),
                mode: z.enum(["zone", "space"]),
              }),
            ),
          })
          .strict(),
        responses: {
          200: z.object({ success: z.literal(true) }),
          400: errorSchemas.validation,
        },
      },
    },

    assignments: {
      list: {
        method: "GET" as const,
        path: "/api/staff-defaults/assignments",
        responses: {
          200: z.array(
            z.object({
              id: z.number(),
              staffRole: z.enum(["production", "editorial"]),
              staffPersonId: z.number(),
              staffPersonName: z.string(),
              scopeType: z.enum(["zone", "space", "reality_team", "itinerant_team"]),
              zoneId: z.number().int().positive().nullable().optional(),
              spaceId: z.number().int().positive().nullable().optional(),
              realityTeamCode: z.string().min(1).nullable().optional(),
              itinerantTeamId: z.number().int().positive().nullable().optional(),
            }),
          ),
        },
      },
      saveAll: {
        method: "PUT" as const,
        path: "/api/staff-defaults/assignments",
        input: z
          .object({
            assignments: z.array(
              z.object({
                staffRole: z.enum(["production", "editorial"]),
                staffPersonId: z.number().int().positive(),
                scopeType: z.enum(["zone", "space", "reality_team", "itinerant_team"]),
                zoneId: z.number().int().positive().nullable().optional(),
                spaceId: z.number().int().positive().nullable().optional(),
                realityTeamCode: z.string().min(1).nullable().optional(),
                itinerantTeamId: z.number().int().positive().nullable().optional(),
              }),
            ),
          })
          .strict(),
        responses: {
          200: z.object({ success: z.literal(true) }),
          400: errorSchemas.validation,
        },
      },
    },
  },

  itinerantTeams: {
    list: {
      method: "GET" as const,
      path: "/api/itinerant-teams",
      responses: {
        200: z.array(
          z.object({
            id: z.number(),
            code: z.string(),
            name: z.string(),
            isActive: z.boolean(),
            orderIndex: z.number(),
          }),
        ),
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/itinerant-teams",
      input: z.object({
        code: z.string().min(1),
        name: z.string().min(1),
        orderIndex: z.number().optional(),
      }).strict(),
      responses: {
        201: z.object({
          id: z.number(),
          code: z.string(),
          name: z.string(),
          isActive: z.boolean(),
          orderIndex: z.number(),
        }),
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/itinerant-teams/:id",
      responses: {
        200: z.object({ success: z.literal(true) }),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
  },

  plans: {
    list: {
      method: "GET" as const,
      path: "/api/plans",
      responses: {
        200: z.array(z.custom<typeof plans.$inferSelect>()),
      },
    },
    get: {
      method: "GET" as const,
      path: "/api/plans/:id",
      responses: {
        200: z.custom<typeof plans.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/plans",
      input: insertPlanSchema,
      responses: {
        201: z.custom<typeof plans.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: "PATCH" as const,
      path: "/api/plans/:id",
      input: updatePlanSchema,
      responses: {
        200: z.custom<typeof plans.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/plans/:id",
      responses: {
        204: z.any(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    generate: {
      method: "POST" as const,
      path: "/api/plans/:id/generate",
      responses: {
        200: z.object({
          success: z.boolean(),
          planId: z.number(),
          tasksUpdated: z.number(),
        }),
        422: errorSchemas.infeasible,
        404: errorSchemas.notFound,
      },
    },

    vocalCoachRules: {
      list: {
        method: "GET" as const,
        path: "/api/plans/:id/vocal-coach-rules",
        responses: {
          200: z.array(
            z.object({
              id: z.number(),
              planId: z.number(),
              vocalCoachPlanResourceItemId: z.number(),
              taskTemplateId: z.number(),
              defaultSpaceId: z.number().nullable(),
              sortOrder: z.number(),
              isRequired: z.boolean(),
            }),
          ),
          400: errorSchemas.validation,
          404: errorSchemas.notFound,
        },
      },

      saveAll: {
        method: "PUT" as const,
        path: "/api/plans/:id/vocal-coach-rules",
        input: z.object({
          rules: z.array(
            z.object({
              vocalCoachPlanResourceItemId: z.number().int().positive(),
              taskTemplateId: z.number().int().positive(),
              defaultSpaceId: z.number().int().positive().nullable(),
              sortOrder: z.number().int(),
              isRequired: z.boolean(),
            }),
          ),
        }),
        responses: {
          200: z.object({ success: z.literal(true) }),
          400: errorSchemas.validation,
          404: errorSchemas.notFound,
        },
      },
    },

    contestants: {
      list: {
        method: "GET" as const,
        path: "/api/plans/:id/contestants",
        responses: {
          200: z.array(z.custom<typeof contestants.$inferSelect>()),
        },
      },
      create: {
        method: "POST" as const,
        path: "/api/plans/:id/contestants",
        input: insertContestantSchema,
        responses: {
          201: z.custom<typeof contestants.$inferSelect>(),
          400: errorSchemas.validation,
        },
      },
      update: {
        method: "PATCH" as const,
        path: "/api/plans/:id/contestants/:contestantId",
        input: updateContestantSchema,
        responses: {
          200: z.custom<typeof contestants.$inferSelect>(),
          400: errorSchemas.validation,
          404: errorSchemas.notFound,
        },
      },
    },

    // ✅ Staff roles (Producción / Redacción) asignados al plan y por scope (plato/espacio/reality)
    staffAssignments: {
      list: {
        method: "GET" as const,
        path: "/api/plans/:id/staff-assignments",
        responses: {
          200: z.array(
            z.object({
              id: z.number(),
              planId: z.number(),
              staffRole: z.enum(["production", "editorial"]),
              staffPersonId: z.number(),
              staffPersonName: z.string(),
              scopeType: z.enum(["zone", "space", "reality_team", "itinerant_team"]),
              zoneId: z.number().nullable(),
              spaceId: z.number().nullable(),
              realityTeamCode: z.string().nullable(),
              itinerantTeamId: z.number().nullable(),
            }),
          ),
          400: errorSchemas.validation,
          404: errorSchemas.notFound,
        },
      },
      saveAll: {
        method: "PUT" as const,
        path: "/api/plans/:id/staff-assignments",
        input: z
          .object({
            assignments: z.array(
              z.object({
                staffRole: z.enum(["production", "editorial"]),
                staffPersonId: z.number().int().positive(),
                scopeType: z.enum(["zone", "space", "reality_team", "itinerant_team"]),
                zoneId: z.number().int().positive().nullable().optional(),
                spaceId: z.number().int().positive().nullable().optional(),
                realityTeamCode: z.string().min(1).nullable().optional(),
                itinerantTeamId: z.number().int().positive().nullable().optional(),
              }),
            ),
          })
          .strict(),
        responses: {
          200: z.object({ success: z.literal(true) }),
          400: errorSchemas.validation,
          404: errorSchemas.notFound,
        },
      },
    },

    zoneStaffModes: {
      list: {
        method: "GET" as const,
        path: "/api/plans/:id/zone-staff-modes",
        responses: {
          200: z.array(
            z.object({
              zoneId: z.number(),
              mode: z.enum(["zone", "space"]),
            }),
          ),
          400: errorSchemas.validation,
          404: errorSchemas.notFound,
        },
      },
      saveAll: {
        method: "PUT" as const,
        path: "/api/plans/:id/zone-staff-modes",
        input: z
          .object({
            modes: z.array(
              z.object({
                zoneId: z.number().int().positive(),
                mode: z.enum(["zone", "space"]),
              }),
            ),
          })
          .strict(),
        responses: {
          200: z.object({ success: z.literal(true) }),
          400: errorSchemas.validation,
          404: errorSchemas.notFound,
        },
      },
    },

    resourcePools: {
      list: {
        method: "GET" as const,
        path: "/api/plans/:id/resource-pools",
        responses: {
          200: z.array(
            z.object({
              id: z.number(),
              planId: z.number(),
              poolId: z.number(),
              quantity: z.number(),
              names: z.array(z.string()).nullable(),
              pool: z.object({
                id: z.number(),
                code: z.string(),
                name: z.string(),
              }),
            }),
          ),
        },
      },
      update: {
        method: "PATCH" as const,
        path: "/api/plans/:id/resource-pools/:poolId",
        input: z
          .object({
            quantity: z.number().int().min(0).max(99).optional(),
            names: z.array(z.string().min(1)).nullable().optional(),
          })
          .strict(),
        responses: {
          200: z.object({ success: z.boolean() }),
          400: errorSchemas.validation,
          404: errorSchemas.notFound,
        },
      },
      init: {
        method: "POST" as const,
        path: "/api/plans/:id/resource-pools/init",
        responses: {
          200: z.object({ success: z.boolean(), created: z.number() }),
          400: errorSchemas.validation,
          404: errorSchemas.notFound,
        },
      },
    },
    spaceResourceAssignments: {
      list: {
        method: "GET" as const,
        path: "/api/plans/:id/space-resource-assignments",
        responses: {
          200: z.array(
            z.object({
              spaceId: z.number(),
              planResourceItemIds: z.array(z.number()),
            }),
          ),
          400: errorSchemas.validation,
          404: errorSchemas.notFound,
        },
      },
      update: {
        method: "PATCH" as const,
        path: "/api/plans/:id/spaces/:spaceId/space-resource-assignments",
        input: z
          .object({
            planResourceItemIds: z.array(z.number().int().positive()),
          })
          .strict(),
        responses: {
          200: z.object({
            spaceId: z.number(),
            planResourceItemIds: z.array(z.number()),
          }),
          400: errorSchemas.validation,
          404: errorSchemas.notFound,
        },
      },
    },

    zoneResourceAssignments: {
      list: {
        method: "GET" as const,
        path: "/api/plans/:id/zone-resource-assignments",
        responses: {
          200: z.array(
            z.object({
              zoneId: z.number(),
              planResourceItemIds: z.array(z.number()),
            }),
          ),
          400: errorSchemas.validation,
          404: errorSchemas.notFound,
        },
      },
      update: {
        method: "PATCH" as const,
        path: "/api/plans/:id/zones/:zoneId/zone-resource-assignments",
        input: z
          .object({
            planResourceItemIds: z.array(z.number().int().positive()),
          })
          .strict(),
        responses: {
          200: z.object({
            zoneId: z.number(),
            planResourceItemIds: z.array(z.number()),
          }),
          400: errorSchemas.validation,
          404: errorSchemas.notFound,
        },
      },
    },

    // ✅ Requisitos genéricos por TIPO (override por plan)
    zoneResourceTypeRequirements: {
      list: {
        method: "GET" as const,
        path: "/api/plans/:id/zone-resource-type-requirements",
        responses: {
          200: z.array(
            z.object({
              zoneId: z.number(),
              requirements: z.array(
                z.object({
                  resourceTypeId: z.number(),
                  quantity: z.number(),
                }),
              ),
            }),
          ),
          400: errorSchemas.validation,
          404: errorSchemas.notFound,
        },
      },
      update: {
        method: "PATCH" as const,
        path: "/api/plans/:id/zones/:zoneId/zone-resource-type-requirements",
        input: z
          .object({
            requirements: z.array(
              z.object({
                resourceTypeId: z.number().int().positive(),
                quantity: z.number().int().min(0).max(99),
              }),
            ),
          })
          .strict(),
        responses: {
          200: z.object({
            zoneId: z.number(),
            requirements: z.array(
              z.object({
                resourceTypeId: z.number(),
                quantity: z.number(),
              }),
            ),
          }),
          400: errorSchemas.validation,
          404: errorSchemas.notFound,
        },
      },
    },

    spaceResourceTypeRequirements: {
      list: {
        method: "GET" as const,
        path: "/api/plans/:id/space-resource-type-requirements",
        responses: {
          200: z.array(
            z.object({
              spaceId: z.number(),
              requirements: z.array(
                z.object({
                  resourceTypeId: z.number(),
                  quantity: z.number(),
                }),
              ),
            }),
          ),
          400: errorSchemas.validation,
          404: errorSchemas.notFound,
        },
      },
      update: {
        method: "PATCH" as const,
        path: "/api/plans/:id/spaces/:spaceId/space-resource-type-requirements",
        input: z
          .object({
            requirements: z.array(
              z.object({
                resourceTypeId: z.number().int().positive(),
                quantity: z.number().int().min(0).max(99),
              }),
            ),
          })
          .strict(),
        responses: {
          200: z.object({
            spaceId: z.number(),
            requirements: z.array(
              z.object({
                resourceTypeId: z.number(),
                quantity: z.number(),
              }),
            ),
          }),
          400: errorSchemas.validation,
          404: errorSchemas.notFound,
        },
      },
    },

    resourceItems: {
      list: {
        method: "GET" as const,
        path: "/api/plans/:id/resource-items",
        responses: {
          200: z.array(
            z.object({
              id: z.number(),
              planId: z.number(),
              typeId: z.number(),
              resourceItemId: z.number().nullable(),
              name: z.string(),
              isAvailable: z.boolean(),
              source: z.string(), // "default" | "adhoc"
              type: z.object({
                id: z.number(),
                code: z.string(),
                name: z.string(),
              }),
            }),
          ),
        },
      },
      create: {
        method: "POST" as const,
        path: "/api/plans/:id/resource-items",
        input: z
          .object({
            typeId: z.number().int().positive(),
            name: z.string().min(1),
          })
          .strict(),
        responses: {
          200: z.object({ success: z.boolean(), id: z.number() }),
          400: errorSchemas.validation,
          404: errorSchemas.notFound,
        },
      },
      update: {
        method: "PATCH" as const,
        path: "/api/plans/:id/resource-items/:itemId",
        input: z
          .object({
            isAvailable: z.boolean().optional(),
            name: z.string().min(1).optional(),
          })
          .strict(),
        responses: {
          200: z.object({ success: z.boolean() }),
          400: errorSchemas.validation,
          404: errorSchemas.notFound,
        },
      },
      delete: {
        method: "DELETE" as const,
        path: "/api/plans/:id/resource-items/:itemId",
        responses: {
          200: z.object({ success: z.boolean() }),
          400: errorSchemas.validation,
          404: errorSchemas.notFound,
        },
      },
      init: {
        method: "POST" as const,
        path: "/api/plans/:id/resource-items/init",
        responses: {
          200: z.object({ success: z.boolean(), created: z.number() }),
          400: errorSchemas.validation,
          404: errorSchemas.notFound,
        },
      },
    },
  },

  programSettings: {
    get: {
      method: "GET" as const,
      path: "/api/program-settings",
      responses: {
        200: z.object({
          id: z.number(),
          mealStart: z.string(),
          mealEnd: z.string(),
          contestantMealDurationMinutes: z.number(),
          contestantMealMaxSimultaneous: z.number(),
          mealTaskTemplateName: z.string(),
          clockMode: z.enum(["auto", "manual"]),
          simulatedTime: z
            .string()
            .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
            .nullable(),
        }),
      },
    },
    update: {
      method: "PATCH" as const,
      path: "/api/program-settings",
      input: z
        .object({
          mealStart: z
            .string()
            .regex(/^\d{2}:\d{2}$/)
            .optional(),
          mealEnd: z
            .string()
            .regex(/^\d{2}:\d{2}$/)
            .optional(),
          contestantMealDurationMinutes: z
            .number()
            .int()
            .min(1)
            .max(240)
            .optional(),
          contestantMealMaxSimultaneous: z
            .number()
            .int()
            .min(1)
            .max(50)
            .optional(),
          mealTaskTemplateName: z.string().min(1).max(80).optional(),
          clockMode: z.enum(["auto", "manual"]).optional(),
          simulatedTime: z
            .string()
            .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
            .nullable()
            .optional(),
        })
        .strict(),
      responses: {
        200: z.object({ success: z.boolean() }),
        400: errorSchemas.validation,
      },
    },
  },

  optimizerSettings: {
    get: {
      method: "GET" as const,
      path: "/api/optimizer-settings",
      responses: {
        200: z.object({
          id: z.number(),
          mainZoneId: z.number().nullable(),
          optimizationMode: z.enum(["basic", "advanced"]),

          heuristics: z.object(
            Object.fromEntries(
              optimizerHeuristicKeys.map((key) => [
                key,
                z.object({
                  basicLevel: z.number().int().min(0).max(3),
                  advancedValue: z.number().int().min(0).max(10),
                }),
              ]),
            ) as Record<
              string,
              z.ZodObject<{
                basicLevel: z.ZodNumber;
                advancedValue: z.ZodNumber;
              }>
            >,
          ),

          prioritizeMainZone: z.boolean(),
          groupBySpaceAndTemplate: z.boolean(),

          // ✅ niveles amigables
          mainZonePriorityLevel: z.number().int().min(0).max(3),
          groupingLevel: z.number().int().min(0).max(3),

          // ✅ modos del plató principal
          mainZoneOptFinishEarly: z.boolean(),
          mainZoneOptKeepBusy: z.boolean(),

          // ✅ compactar concursantes
          contestantCompactLevel: z.number().int().min(0).max(3),

          // ✅ nuevo: mantener concursante en el mismo plató
          contestantStayInZoneLevel: z.number().int().min(0).max(3),
        }),
      },
    },
    update: {
      method: "PATCH" as const,
      path: "/api/optimizer-settings",
      input: z
        .object({
          mainZoneId: z.number().int().positive().nullable().optional(),
          optimizationMode: z.enum(["basic", "advanced"]).optional(),

          heuristics: z
            .object(
              Object.fromEntries(
                optimizerHeuristicKeys.map((key) => [
                  key,
                  z
                    .object({
                      basicLevel: z.number().int().min(0).max(3).optional(),
                      advancedValue: z.number().int().min(0).max(10).optional(),
                    })
                    .strict()
                    .optional(),
                ]),
              ) as Record<string, z.ZodOptional<z.ZodObject<any>>>,
            )
            .strict()
            .optional(),

          prioritizeMainZone: z.boolean().optional(),
          groupBySpaceAndTemplate: z.boolean().optional(),

          // ✅ niveles amigables
          mainZonePriorityLevel: z.number().int().min(0).max(3).optional(),
          groupingLevel: z.number().int().min(0).max(3).optional(),

          // ✅ modos del plató principal
          mainZoneOptFinishEarly: z.boolean().optional(),
          mainZoneOptKeepBusy: z.boolean().optional(),

          // ✅ compactar concursantes
          contestantCompactLevel: z.number().int().min(0).max(3).optional(),

          // ✅ nuevo: mantener concursante en el mismo plató
          contestantStayInZoneLevel: z.number().int().min(0).max(3).optional(),
        })
        .strict(),
      responses: {
        200: z.object({ success: z.boolean() }),
        400: errorSchemas.validation,
      },
    },
  },

  vocalCoachRules: {
    list: {
      method: "GET" as const,
      path: "/api/vocal-coach-rules",
      responses: {
        200: z.array(
          z.object({
            id: z.number(),
            vocalCoachResourceItemId: z.number(),
            taskTemplateId: z.number(),
            defaultSpaceId: z.number().nullable(),
            sortOrder: z.number(),
            isRequired: z.boolean(),
          }),
        ),
        400: errorSchemas.validation,
      },
    },

    saveAll: {
      method: "PUT" as const,
      path: "/api/vocal-coach-rules",
      input: z.object({
        rules: z.array(
          z.object({
            vocalCoachResourceItemId: z.number().int().positive(),
            taskTemplateId: z.number().int().positive(),
            defaultSpaceId: z.number().int().positive().nullable(),
            sortOrder: z.number().int(),
            isRequired: z.boolean(),
          }),
        ),
      }),
      responses: {
        200: z.object({ success: z.literal(true) }),
        400: errorSchemas.validation,
      },
    },
  },

  zones: {
    list: {
      method: "GET" as const,
      path: "/api/zones",
      responses: {
        200: z.array(z.custom<typeof zones.$inferSelect>()),
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/zones",
      input: z.object({ name: z.string().min(1) }).strict(),
      responses: {
        200: z.custom<typeof zones.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: "PATCH" as const,
      path: "/api/zones/:id",
      input: z
        .object({
          name: z.string().min(1),
          uiColor: z
            .string()
            .regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/)
            .nullable()
            .optional(),
        })
        .strict(),
      responses: {
        200: z.custom<typeof zones.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/zones/:id",
      responses: {
        200: z.object({ success: z.boolean() }),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },

    // ✅ Recursos por ZONA (defaults globales)
    resourceDefaults: {
      get: {
        method: "GET" as const,
        path: "/api/zones/:id/resource-defaults",
        responses: {
          200: z.object({
            zoneId: z.number(),
            resourceItemIds: z.array(z.number()),
          }),
          400: errorSchemas.validation,
        },
      },
      update: {
        method: "PATCH" as const,
        path: "/api/zones/:id/resource-defaults",
        input: z
          .object({
            resourceItemIds: z.array(z.number().int().positive()),
          })
          .strict(),
        responses: {
          200: z.object({
            zoneId: z.number(),
            resourceItemIds: z.array(z.number()),
          }),
          400: errorSchemas.validation,
        },
      },
    },
    // ✅ Requisitos genéricos por TIPO (defaults globales)
    resourceTypeDefaults: {
      get: {
        method: "GET" as const,
        path: "/api/zones/:id/resource-type-defaults",
        responses: {
          200: z.object({
            zoneId: z.number(),
            requirements: z.array(
              z.object({
                resourceTypeId: z.number(),
                quantity: z.number(),
              }),
            ),
          }),
          400: errorSchemas.validation,
        },
      },
      update: {
        method: "PATCH" as const,
        path: "/api/zones/:id/resource-type-defaults",
        input: z
          .object({
            requirements: z.array(
              z.object({
                resourceTypeId: z.number().int().positive(),
                quantity: z.number().int().min(0).max(99),
              }),
            ),
          })
          .strict(),
        responses: {
          200: z.object({
            zoneId: z.number(),
            requirements: z.array(
              z.object({
                resourceTypeId: z.number(),
                quantity: z.number(),
              }),
            ),
          }),
          400: errorSchemas.validation,
        },
      },
    },
  },

  spaces: {
    list: {
      method: "GET" as const,
      path: "/api/spaces",
      responses: {
        200: z.array(z.custom<typeof spaces.$inferSelect>()),
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/spaces",
      input: z
        .object({
          name: z.string().min(1),
          zoneId: z.number().int().positive(),
          priorityLevel: z.number().int().min(1).max(5).optional(),
          parentSpaceId: z.number().int().positive().nullable().optional(),
        })
        .strict(),
      responses: {
        200: z.custom<typeof spaces.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: "PATCH" as const,
      path: "/api/spaces/:id",
      input: z
        .object({
          name: z.string().min(1).optional(),
          zoneId: z.number().int().positive().optional(),
          priorityLevel: z.number().int().min(1).max(5).optional(),
          parentSpaceId: z.number().int().positive().nullable().optional(),
        })
        .strict(),
      responses: {
        200: z.custom<typeof spaces.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },

    delete: {
      method: "DELETE" as const,
      path: "/api/spaces/:id",
      responses: {
        200: z.object({ success: z.boolean() }),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },

    resourceDefaults: {
      get: {
        method: "GET" as const,
        path: "/api/spaces/:id/resource-defaults",
        responses: {
          200: z.object({
            spaceId: z.number(),
            resourceItemIds: z.array(z.number()),
          }),
          400: errorSchemas.validation,
        },
      },
      update: {
        method: "PATCH" as const,
        path: "/api/spaces/:id/resource-defaults",
        input: z
          .object({
            resourceItemIds: z.array(z.number().int().positive()),
          })
          .strict(),
        responses: {
          200: z.object({
            spaceId: z.number(),
            resourceItemIds: z.array(z.number()),
          }),
          400: errorSchemas.validation,
        },
      },
    },
    // ✅ Requisitos genéricos por TIPO (defaults globales)
    resourceTypeDefaults: {
      get: {
        method: "GET" as const,
        path: "/api/spaces/:id/resource-type-defaults",
        responses: {
          200: z.object({
            spaceId: z.number(),
            requirements: z.array(
              z.object({
                resourceTypeId: z.number(),
                quantity: z.number(),
              }),
            ),
          }),
          400: errorSchemas.validation,
        },
      },
      update: {
        method: "PATCH" as const,
        path: "/api/spaces/:id/resource-type-defaults",
        input: z
          .object({
            requirements: z.array(
              z.object({
                resourceTypeId: z.number().int().positive(),
                quantity: z.number().int().min(0).max(99),
              }),
            ),
          })
          .strict(),
        responses: {
          200: z.object({
            spaceId: z.number(),
            requirements: z.array(
              z.object({
                resourceTypeId: z.number(),
                quantity: z.number(),
              }),
            ),
          }),
          400: errorSchemas.validation,
        },
      },
    },
  },

  taskTemplates: {
    list: {
      method: "GET" as const,
      path: "/api/task-templates",
      responses: {
        200: z.array(z.custom<typeof taskTemplates.$inferSelect>()),
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/task-templates",
      input: z
        .object({
          name: z.string().min(1),
          defaultDuration: z.number().int().positive(),
          defaultCameras: z.number().int().min(0).optional().default(0),

          requiresAuxiliar: z.boolean().optional(),
          requiresCoach: z.boolean().optional(),
          requiresPresenter: z.boolean().optional(),
          exclusiveAuxiliar: z.boolean().optional(),
          setupId: z.number().int().positive().nullable().optional(),
          rulesJson: z.any().optional(),
          resourceRequirements: z.any().nullable().optional(),

          uiColor: z
            .string()
            .regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/)
            .nullable()
            .optional(),
          uiColorSecondary: z
            .string()
            .regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/)
            .nullable()
            .optional(),

          // ✅ Dependencias (multi)
          dependsOnTemplateIds: z.array(z.number().int().positive()).optional(),

          // legacy (optional)
          hasDependency: z.boolean().optional(),
          dependsOnTemplateId: z
            .number()
            .int()
            .positive()
            .nullable()
            .optional(),

      // ✅ NUEVO: equipo itinerante requerido
      itinerantTeamRequirement: z.enum(["none", "any", "specific"]).optional(),
      itinerantTeamId: z.number().int().positive().nullable().optional(),

      zoneId: z.number().int().positive().nullable().optional(),
      spaceId: z.number().int().positive().nullable().optional(),
      })
      .strict(),
      responses: {
        201: z.custom<typeof taskTemplates.$inferSelect>(),
      },
    },
    update: {
      method: "PATCH" as const,
      path: "/api/ta/:id",
      input: z
        .object({
          name: z.string().min(1).optional(),
          defaultDuration: z.number().int().positive().optional(),
          defaultCameras: z.number().int().min(0).optional(),

          requiresAuxiliar: z.boolean().optional(),
          requiresCoach: z.boolean().optional(),
          requiresPresenter: z.boolean().optional(),
          exclusiveAuxiliar: z.boolean().optional(),
          setupId: z.number().int().positive().nullable().optional(),
          rulesJson: z.any().optional(),
          resourceRequirements: z.any().nullable().optional(),
          // ✅ NUEVO: color hex (o null)
          uiColor: z
            .string()
            .regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/)
            .nullable()
            .optional(),
          uiColorSecondary: z
            .string()
            .regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/)
            .nullable()
            .optional(),

          // ✅ Dependencias (multi)
          dependsOnTemplateIds: z.array(z.number().int().positive()).optional(),

          // legacy (optional)
          hasDependency: z.boolean().optional(),
          dependsOnTemplateId: z
            .number()
            .int()
            .positive()
            .nullable()
            .optional(),

      // ✅ NUEVO: equipo itinerante requerido
      itinerantTeamRequirement: z.enum(["none", "any", "specific"]).optional(),
      itinerantTeamId: z.number().int().positive().nullable().optional(),

      zoneId: z.number().int().positive().nullable().optional(),
      spaceId: z.number().int().positive().nullable().optional(),
      })
      .strict(),
      responses: {
        200: z.custom<typeof taskTemplates.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },

    delete: {
      method: "DELETE" as const,
      path: "/api/task-templates/:id",
      responses: {
        200: z.object({ success: z.literal(true) }),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
  },

  dailyTasks: {
    create: {
      method: "POST" as const,
      path: "/api/daily-tasks",
      input: insertDailyTaskSchema,
      responses: {
        201: z.custom<typeof dailyTasks.$inferSelect>(),
      },
    },

    updateStatus: {
      method: "PATCH" as const,
      path: "/api/tasks/:id/status",
      input: z
        .object({
          status: z.enum([
            "pending",
            "in_progress",
            "done",
            "interrupted",
            "cancelled",
          ]),
        })
        .strict(),
      responses: {
        200: z.custom<typeof dailyTasks.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },

    update: {
      method: "PATCH" as const,
      path: "/api/daily-tasks/:id",
      input: z
        .object({
          name: z.string().min(1).optional(),
          defaultDuration: z.number().int().positive().optional(),
          defaultCameras: z.number().int().min(0).optional(),

          // ✅ color hex configurable
          uiColor: z
            .string()
            .regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/)
            .nullable()
            .optional(),

          // ✅ asignación / overrides por instancia (daily_task)
          contestantId: z.number().int().positive().nullable().optional(),
          durationOverride: z.number().int().positive().nullable().optional(),
          camerasOverride: z.number().int().min(0).max(2).nullable().optional(),

          zoneId: z.number().int().positive().nullable().optional(),
          spaceId: z.number().int().positive().nullable().optional(),
        })
        .strict(),
      responses: {
        200: z.custom<typeof dailyTasks.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },

    delete: {
      method: "DELETE" as const,
      path: "/api/daily-tasks/:id",
      responses: {
        200: z.object({ success: z.literal(true) }),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
  },
};

export function buildUrl(
  path: string,
  params?: Record<string, string | number>,
): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
