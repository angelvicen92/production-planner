import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { supabaseAdmin } from "./supabase";
import { api } from "@shared/routes";
import { z } from "zod";
import { requireAuth } from "./middleware/requireAuth";
import { buildEngineInput } from "../engine/buildInput";
import { generatePlan } from "../engine/solve";
import { getUserRole, withPermissionDenied } from "./authz";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  const ensureAdmin = async (req: any, res: any): Promise<{ ok: true; userId: string } | { ok: false }> => {
    const userId = req?.user?.id as string | undefined;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return { ok: false };
    }

    const role = await getUserRole(userId);
    if (role !== "admin") {
      withPermissionDenied(res);
      return { ok: false };
    }

    return { ok: true, userId };
  };



function mapDeleteError(err: any, fallback: string) {
  const code = String(err?.code ?? "");
  if (code === "PGRST116") {
    return { status: 404, body: { message: "No encontrado" } };
  }
  if (code === "42501") {
    return {
      status: 403,
      body: { type: "permission_denied", message: "No tienes permisos para esta acción." },
    };
  }
  if (code === "23503" || code === "23514") {
    return {
      status: 409,
      body: { message: "No se puede eliminar porque está en uso por otros registros." },
    };
  }
  return { status: 400, body: { message: err?.message || fallback } };
}

  // Authentication + coarse-grained authorization for all API endpoints
  app.use("/api", async (req, res, next) => {
    if (req.path === "/health") return next();

    if (
      req.path.startsWith("/debug/engine-input") ||
      req.path.startsWith("/debug/generate") ||
      req.path.startsWith("/debug/daily-task")
    ) {
      return next();
    }

    return requireAuth(req, res, async () => {
      const method = req.method.toUpperCase();
      const path = req.path;

      const adminOnlyPrefixes = [
        "/settings",
        "/program-settings",
        "/optimizer-settings",
        "/task-templates",
        "/zones",
        "/spaces",
        "/resource-types",
        "/resource-items",
        "/resource-pools",
        "/staff-people",
        "/staff-defaults",
        "/itinerant-teams",
      ];

      const writePlansPrefixes = ["/plans", "/locks"];

      const isAdminOnly = adminOnlyPrefixes.some((prefix) =>
        path === prefix || path.startsWith(`${prefix}/`),
      );

      const isAdminOnlyWrite = isAdminOnly && method !== "GET";
      const isAdminOnlyRead = isAdminOnly && method === "GET";

      const isPlansWrite =
        method !== "GET" &&
        writePlansPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

      if (!isAdminOnly && !isPlansWrite) {
        return next();
      }

      const userId = (req as any)?.user?.id as string | undefined;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      try {
        const role = await getUserRole(userId);
        (req as any).userRole = role;

        if (isAdminOnlyRead && !role) {
          return withPermissionDenied(res);
        }

        if (isAdminOnlyWrite && role !== "admin") {
          return withPermissionDenied(res);
        }

        if (isPlansWrite && role !== "admin" && role !== "production") {
          return withPermissionDenied(res);
        }

        return next();
      } catch (error) {
        console.error("[AUTHZ] coarse permission check failed", error);
        return res.status(500).json({ message: "Failed to validate permissions" });
      }
    });
  });

  app.post("/api/bootstrap-role", async (req, res) => {
    try {
      const user = (req as any)?.user as { id: string; email?: string | null } | undefined;
      const userId = user?.id;
      const email = (user?.email || "").trim().toLowerCase();
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
      const targetRoleKey = adminEmail && email === adminEmail ? "admin" : "viewer";

      const { data: roleRow, error: roleError } = await supabaseAdmin
        .from("roles")
        .select("id, key")
        .eq("key", targetRoleKey)
        .single();

      if (roleError || !roleRow?.id) {
        throw roleError || new Error(`Role not found: ${targetRoleKey}`);
      }

      const { data: existingRole, error: existingRoleError } = await supabaseAdmin
        .from("user_roles")
        .select("role_id, roles(key)")
        .eq("user_id", userId)
        .maybeSingle();

      if (existingRoleError) throw existingRoleError;

      const existingRoleKey = (existingRole as any)?.roles?.key as string | undefined;

      if (targetRoleKey === "admin") {
        if (existingRole?.role_id !== roleRow.id) {
          const { error: upsertError } = await supabaseAdmin
            .from("user_roles")
            .upsert({ user_id: userId, role_id: roleRow.id }, { onConflict: "user_id" });
          if (upsertError) throw upsertError;
        }
      } else if (!existingRoleKey) {
        const { error: insertError } = await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: userId, role_id: roleRow.id });
        if (insertError && insertError.code !== "23505") throw insertError;
      }

      const role = await getUserRole(userId);
      return res.json({ role: role ?? "viewer" });
    } catch (err: any) {
      console.error("[BOOTSTRAP ROLE]", err);
      return res.status(500).json({ message: err?.message || "Failed to bootstrap role" });
    }
  });

  app.get("/api/me/role", async (req, res) => {
    try {
      const userId = (req as any)?.user?.id as string | undefined;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const role = await getUserRole(userId);
      if (!role) {
        return res.status(404).json({ message: "Role not assigned" });
      }

      return res.json({ role });
    } catch (err: any) {
      return res.status(500).json({ message: err?.message || "Failed to fetch user role" });
    }
  });

  app.get("/api/me/links", async (req, res) => {
    try {
      const userId = (req as any)?.user?.id as string | undefined;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { data, error } = await supabaseAdmin
        .from("user_entity_links")
        .select("entity_type, entity_id")
        .eq("user_id", userId)
        .eq("is_primary", true);

      if (error) throw error;

      let staffPersonId: number | null = null;
      let resourceItemId: number | null = null;
      for (const row of data ?? []) {
        if (row.entity_type === "staff_person") staffPersonId = Number(row.entity_id);
        if (row.entity_type === "resource_item") resourceItemId = Number(row.entity_id);
      }

      return res.json({ staffPersonId, resourceItemId });
    } catch (err: any) {
      return res.status(500).json({ message: err?.message || "Failed to fetch user links" });
    }
  });

  app.get("/api/admin/users", async (req, res) => {
    try {
      const auth = await ensureAdmin(req, res);
      if (!auth.ok) return;

      const page = Math.max(1, Number(req.query.page ?? 1));
      const perPage = 50;
      const userList = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (userList.error) {
        return res.status(500).json({ message: `Supabase admin listUsers falló: ${userList.error.message}` });
      }

      const users = userList.data?.users ?? [];
      const userIds = users.map((u) => u.id);

      const rolesMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: roleRows, error: roleErr } = await supabaseAdmin
          .from("user_roles")
          .select("user_id, roles(key)")
          .in("user_id", userIds);
        if (roleErr) throw roleErr;
        for (const row of roleRows ?? []) {
          rolesMap.set(String((row as any).user_id), String((row as any).roles?.key ?? "viewer"));
        }
      }

      const linksMap = new Map<string, { staffPersonId: number | null; resourceItemId: number | null }>();
      if (userIds.length > 0) {
        const { data: linkRows, error: linkErr } = await supabaseAdmin
          .from("user_entity_links")
          .select("user_id, entity_type, entity_id")
          .in("user_id", userIds)
          .eq("is_primary", true);
        if (linkErr) throw linkErr;

        for (const userId of userIds) {
          linksMap.set(userId, { staffPersonId: null, resourceItemId: null });
        }
        for (const row of linkRows ?? []) {
          const userId = String((row as any).user_id);
          const current = linksMap.get(userId) ?? { staffPersonId: null, resourceItemId: null };
          if ((row as any).entity_type === "staff_person") current.staffPersonId = Number((row as any).entity_id);
          if ((row as any).entity_type === "resource_item") current.resourceItemId = Number((row as any).entity_id);
          linksMap.set(userId, current);
        }
      }

      const payload = users.map((user) => ({
        id: user.id,
        email: user.email ?? "",
        createdAt: user.created_at ?? null,
        lastSignInAt: user.last_sign_in_at ?? null,
        roleKey: (rolesMap.get(user.id) as any) || "viewer",
        links: linksMap.get(user.id) ?? { staffPersonId: null, resourceItemId: null },
      }));

      return res.json({
        users: payload,
        nextPage: users.length >= perPage ? page + 1 : null,
      });
    } catch (err: any) {
      return res.status(500).json({ message: err?.message || "Failed to fetch admin users" });
    }
  });

  app.patch("/api/admin/users/:userId/role", async (req, res) => {
    try {
      const auth = await ensureAdmin(req, res);
      if (!auth.ok) return;

      const userId = String(req.params.userId || "").trim();
      const parsed = z.object({ roleKey: z.enum(["admin", "production", "aux", "viewer"]) }).parse(req.body);

      const { data: roleRow, error: roleErr } = await supabaseAdmin
        .from("roles")
        .select("id, key")
        .eq("key", parsed.roleKey)
        .single();
      if (roleErr || !roleRow?.id) throw roleErr || new Error("Role not found");

      const { error: upsertErr } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: userId, role_id: roleRow.id }, { onConflict: "user_id" });
      if (upsertErr) throw upsertErr;

      const warning = userId === auth.userId && parsed.roleKey !== "admin"
        ? "Te estás quitando rol admin a ti mismo."
        : undefined;

      return res.json({ roleKey: parsed.roleKey, warning });
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || "Cannot update user role" });
    }
  });

  app.patch("/api/admin/users/:userId/links", async (req, res) => {
    try {
      const auth = await ensureAdmin(req, res);
      if (!auth.ok) return;

      const userId = String(req.params.userId || "").trim();
      const parsed = z.object({
        staffPersonId: z.number().int().positive().nullable().optional(),
        resourceItemId: z.number().int().positive().nullable().optional(),
      }).parse(req.body ?? {});

      if (parsed.staffPersonId != null) {
        const { data, error } = await supabaseAdmin.from("staff_people").select("id").eq("id", parsed.staffPersonId).maybeSingle();
        if (error) throw error;
        if (!data) return res.status(400).json({ message: "Staff person no existe" });
      }

      if (parsed.resourceItemId != null) {
        const { data, error } = await supabaseAdmin.from("resource_items").select("id").eq("id", parsed.resourceItemId).maybeSingle();
        if (error) throw error;
        if (!data) return res.status(400).json({ message: "Resource item no existe" });
      }

      const syncLink = async (entityType: "staff_person" | "resource_item", entityId?: number | null) => {
        if (entityId == null) {
          const { error } = await supabaseAdmin
            .from("user_entity_links")
            .delete()
            .eq("user_id", userId)
            .eq("entity_type", entityType)
            .eq("is_primary", true);
          if (error) throw error;
          return;
        }

        const { error } = await supabaseAdmin
          .from("user_entity_links")
          .upsert(
            { user_id: userId, entity_type: entityType, entity_id: entityId, is_primary: true },
            { onConflict: "user_id,entity_type,is_primary" },
          );
        if (error) throw error;
      };

      await syncLink("staff_person", parsed.staffPersonId ?? null);
      await syncLink("resource_item", parsed.resourceItemId ?? null);

      return res.json({
        links: {
          staffPersonId: parsed.staffPersonId ?? null,
          resourceItemId: parsed.resourceItemId ?? null,
        },
      });
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || "Cannot update user links" });
    }
  });

  // Zones (Platós)
  app.get(api.zones.list.path, async (_req, res) => {
    const data = await storage.getZones();
    res.json(data);
  });

  app.post(api.zones.create.path, async (req, res) => {
    try {
      const input = api.zones.create.input.parse(req.body);
      const created = await storage.createZone(input);
      res.json(created);
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || "Invalid input" });
    }
  });

  app.patch(api.zones.update.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = api.zones.update.input.parse(req.body);
      const updated = await storage.updateZone(id, input);
      res.json(updated);
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || "Cannot update zone" });
    }
  });

  // Spaces
  app.get(api.spaces.list.path, async (_req, res) => {
    try {
      const data = await storage.getSpaces();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch spaces" });
    }
  });

  app.post(api.spaces.create.path, async (req, res) => {
    try {
      const input = api.spaces.create.input.parse(req.body);
      const created = await storage.createSpace(input);
      res.json(created);
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || "Invalid input" });
    }
  });

  app.patch(api.spaces.update.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const patch = api.spaces.update.input.parse(req.body);
      const updated = await storage.updateSpace(id, patch);
      res.json(updated);
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || "Cannot update space" });
    }
  });
  
  // Staff People (Producción / Redacción)
  app.get(api.staffPeople.list.path, async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("staff_people")
        .select("id, name, role_type, is_active")
        .order("role_type", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;

      const rows = (data ?? []).map((r: any) => ({
        id: Number(r.id),
        name: String(r.name ?? ""),
        roleType: r.role_type === "editorial" ? "editorial" : "production",
        isActive: Boolean(r.is_active),
      }));

      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch staff" });
    }
  });

  app.post(api.staffPeople.create.path, async (req, res) => {
    try {
      const input = api.staffPeople.create.input.parse(req.body);

      const { data, error } = await supabaseAdmin
        .from("staff_people")
        .insert({
          name: input.name.trim(),
          role_type: input.roleType,
          is_active: input.isActive ?? true,
        })
        .select("id, name, role_type, is_active")
        .single();

      if (error) throw error;

      return res.status(201).json({
        id: Number(data.id),
        name: String(data.name ?? ""),
        roleType: data.role_type === "editorial" ? "editorial" : "production",
        isActive: Boolean(data.is_active),
      });
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || "Invalid input" });
    }
  });

  app.patch(api.staffPeople.update.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

      const patch = api.staffPeople.update.input.parse(req.body);
      const updateRow: any = {};

      if (typeof patch.name === "string") updateRow.name = patch.name.trim();
      if (typeof patch.roleType === "string") updateRow.role_type = patch.roleType;
      if (typeof patch.isActive === "boolean") updateRow.is_active = patch.isActive;

      const { data, error } = await supabaseAdmin
        .from("staff_people")
        .update(updateRow)
        .eq("id", id)
        .select("id, name, role_type, is_active")
        .single();

      if (error) throw error;

      return res.json({
        id: Number(data.id),
        name: String(data.name ?? ""),
        roleType: data.role_type === "editorial" ? "editorial" : "production",
        isActive: Boolean(data.is_active),
      });
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || "Cannot update staff person" });
    }
  });


  app.delete(api.staffPeople.delete.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

      const { error } = await supabaseAdmin
        .from("staff_people")
        .delete()
        .eq("id", id);

      if (error) throw error;

      return res.json({ success: true });
    } catch (err: any) {
      const mapped = mapDeleteError(err, "Cannot delete staff person");
      return res.status(mapped.status).json(mapped.body);
    }
  });

  // Itinerant Teams (Reality 1/2/3, Reality Duo, etc.)
  app.get(api.itinerantTeams.list.path, async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("itinerant_teams")
        .select("id, code, name, is_active, order_index")
        .order("order_index", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;

      return res.json(
        (data ?? []).map((r: any) => ({
          id: Number(r.id),
          code: String(r.code ?? ""),
          name: String(r.name ?? ""),
          isActive: Boolean(r.is_active),
          orderIndex: Number(r.order_index ?? 0),
        })),
      );
    } catch (err: any) {
      return res
        .status(500)
        .json({ message: err?.message || "Failed to fetch itinerant teams" });
    }
  });

  app.post(api.itinerantTeams.create.path, async (req, res) => {
    try {
      const input = api.itinerantTeams.create.input.parse(req.body);

      const { data, error } = await supabaseAdmin
        .from("itinerant_teams")
        .insert({
          code: input.code.trim(),
          name: input.name.trim(),
          order_index: input.orderIndex ?? 0,
          is_active: true,
        })
        .select("id, code, name, is_active, order_index")
        .single();

      if (error) throw error;

      return res.status(201).json({
        id: Number(data.id),
        code: String(data.code ?? ""),
        name: String(data.name ?? ""),
        isActive: Boolean(data.is_active),
        orderIndex: Number(data.order_index ?? 0),
      });
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || "Cannot create itinerant team" });
    }
  });


  app.delete(api.itinerantTeams.delete.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

      const { error } = await supabaseAdmin
        .from("itinerant_teams")
        .delete()
        .eq("id", id);

      if (error) throw error;

      return res.json({ success: true });
    } catch (err: any) {
      const mapped = mapDeleteError(err, "Cannot delete itinerant team");
      return res.status(mapped.status).json(mapped.body);
    }
  });

  // Staff Defaults (Settings) -> se clonan al crear un plan
  app.get(api.staffDefaults.zoneModes.list.path, async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("staff_zone_mode_defaults")
        .select("zone_id, mode")
        .order("zone_id", { ascending: true });

      if (error) throw error;

      const rows = (data ?? []).map((r: any) => ({
        zoneId: Number(r.zone_id),
        mode: r.mode === "space" ? "space" : "zone",
      }));

      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err?.message || "Cannot fetch staff defaults zone modes" });
    }
  });

  app.put(api.staffDefaults.zoneModes.saveAll.path, async (req, res) => {
    try {
      const input = api.staffDefaults.zoneModes.saveAll.input.parse(req.body);

      const rows = (input.modes ?? []).map((m) => ({
        zone_id: Number(m.zoneId),
        mode: m.mode,
      }));

      const { error: delErr } = await supabaseAdmin
        .from("staff_zone_mode_defaults")
        .delete()
        .neq("zone_id", -1);

      if (delErr) throw delErr;

      if (rows.length > 0) {
        const { error: insErr } = await supabaseAdmin
          .from("staff_zone_mode_defaults")
          .insert(rows);

        if (insErr) throw insErr;
      }

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || "Cannot save staff defaults zone modes" });
    }
  });

  app.get(api.staffDefaults.assignments.list.path, async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("staff_assignment_defaults")
        .select(
          "id, staff_role, staff_person_id, scope_type, zone_id, space_id, reality_team_code, itinerant_team_id, staff_people(name)",
        )
        .order("id", { ascending: true });

      if (error) throw error;

      const rows = (data ?? []).map((r: any) => ({
        id: Number(r.id),
        staffRole: r.staff_role === "editorial" ? "editorial" : "production",
        staffPersonId: Number(r.staff_person_id),
        staffPersonName: String(r.staff_people?.name ?? ""),
        scopeType:
        r.scope_type === "space"
          ? "space"
          : r.scope_type === "reality_team"
            ? "reality_team"
            : r.scope_type === "itinerant_team"
              ? "itinerant_team"
              : "zone",
        zoneId: r.zone_id == null ? null : Number(r.zone_id),
        spaceId: r.space_id == null ? null : Number(r.space_id),
        realityTeamCode: r.reality_team_code == null ? null : String(r.reality_team_code),
        itinerantTeamId: r.itinerant_team_id == null ? null : Number(r.itinerant_team_id),
      }));

      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err?.message || "Cannot fetch staff defaults assignments" });
    }
  });

  app.put(api.staffDefaults.assignments.saveAll.path, async (req, res) => {
    try {
      const input = api.staffDefaults.assignments.saveAll.input.parse(req.body);

      const rows = (input.assignments ?? []).map((a) => ({
        staff_role: a.staffRole,
        staff_person_id: Number(a.staffPersonId),
        scope_type: a.scopeType,
        zone_id: a.scopeType === "zone" ? Number(a.zoneId) : null,
        space_id: a.scopeType === "space" ? Number(a.spaceId) : null,
        reality_team_code: a.scopeType === "reality_team" ? (a.realityTeamCode ?? null) : null,
        itinerant_team_id: a.scopeType === "itinerant_team" ? Number(a.itinerantTeamId) : null,
      }));

      const { error: delErr } = await supabaseAdmin
        .from("staff_assignment_defaults")
        .delete()
        .neq("id", -1);

      if (delErr) throw delErr;

      if (rows.length > 0) {
        const { error: insErr } = await supabaseAdmin
          .from("staff_assignment_defaults")
          .insert(rows);

        if (insErr) throw insErr;
      }

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || "Cannot save staff defaults assignments" });
    }
  });

  // Plan: Zone Staff Modes (por plató: asignar por plató vs por espacios)
  app.get(api.plans.zoneStaffModes.list.path, async (req, res) => {
    try {
      const planId = Number(req.params.id);
      if (!Number.isFinite(planId)) return res.status(400).json({ message: "Invalid plan id" });

      const { data, error } = await supabaseAdmin
        .from("plan_zone_staff_mode")
        .select("zone_id, mode")
        .eq("plan_id", planId)
        .order("zone_id", { ascending: true });

      if (error) throw error;

      const rows = (data ?? []).map((r: any) => ({
        zoneId: Number(r.zone_id),
        mode: r.mode === "space" ? "space" : "zone",
      }));

      res.json(rows);
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || "Cannot fetch zone staff modes" });
    }
  });

  app.put(api.plans.zoneStaffModes.saveAll.path, async (req, res) => {
    try {
      const planId = Number(req.params.id);
      if (!Number.isFinite(planId)) return res.status(400).json({ message: "Invalid plan id" });

      const input = api.plans.zoneStaffModes.saveAll.input.parse(req.body);
      const modes = (input.modes ?? []).map((m) => ({
        plan_id: planId,
        zone_id: Number(m.zoneId),
        mode: m.mode,
      }));

      const { error: delErr } = await supabaseAdmin
        .from("plan_zone_staff_mode")
        .delete()
        .eq("plan_id", planId);

      if (delErr) throw delErr;

      if (modes.length > 0) {
        const { error: insErr } = await supabaseAdmin
          .from("plan_zone_staff_mode")
          .insert(modes);
        if (insErr) throw insErr;
      }

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || "Cannot save zone staff modes" });
    }
  });

  // Plan: Staff Assignments (multi-person, por scope)
  app.get(api.plans.staffAssignments.list.path, async (req, res) => {
    try {
      const planId = Number(req.params.id);
      if (!Number.isFinite(planId)) return res.status(400).json({ message: "Invalid plan id" });

      // Join via foreign table select
      const { data, error } = await supabaseAdmin
        .from("plan_staff_assignments")
        .select(
          "id, plan_id, staff_role, staff_person_id, scope_type, zone_id, space_id, reality_team_code, itinerant_team_id, staff_people(name)",
        )
        .eq("plan_id", planId)
        .order("id", { ascending: true });

      if (error) throw error;

      const rows = (data ?? []).map((r: any) => ({
        id: Number(r.id),
        planId: Number(r.plan_id),
        staffRole: r.staff_role === "editorial" ? "editorial" : "production",
        staffPersonId: Number(r.staff_person_id),
        staffPersonName: String(r.staff_people?.name ?? ""),
        scopeType:
          r.scope_type === "space"
            ? "space"
            : r.scope_type === "reality_team"
              ? "reality_team"
              : r.scope_type === "itinerant_team"
                ? "itinerant_team"
                : "zone",
        zoneId: r.zone_id == null ? null : Number(r.zone_id),
        spaceId: r.space_id == null ? null : Number(r.space_id),
        realityTeamCode: r.reality_team_code == null ? null : String(r.reality_team_code),
        itinerantTeamId: r.itinerant_team_id == null ? null : Number(r.itinerant_team_id),
      }));

      res.json(rows);
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || "Cannot fetch staff assignments" });
    }
  });

  app.put(api.plans.staffAssignments.saveAll.path, async (req, res) => {
    try {
      const planId = Number(req.params.id);
      if (!Number.isFinite(planId)) return res.status(400).json({ message: "Invalid plan id" });

      const input = api.plans.staffAssignments.saveAll.input.parse(req.body);

      const rows = (input.assignments ?? []).map((a) => ({
        plan_id: planId,
        staff_role: a.staffRole,
        staff_person_id: Number(a.staffPersonId),
        scope_type: a.scopeType,
        zone_id: a.scopeType === "zone" ? Number(a.zoneId) : null,
        space_id: a.scopeType === "space" ? Number(a.spaceId) : null,
        reality_team_code:
          a.scopeType === "reality_team" ? (a.realityTeamCode ?? null) : null,
        itinerant_team_id:
          a.scopeType === "itinerant_team" ? (a.itinerantTeamId ?? null) : null,
      }));

      const { error: delErr } = await supabaseAdmin
        .from("plan_staff_assignments")
        .delete()
        .eq("plan_id", planId);

      if (delErr) throw delErr;

      if (rows.length > 0) {
        const { error: insErr } = await supabaseAdmin
          .from("plan_staff_assignments")
          .insert(rows);
        if (insErr) throw insErr;
      }

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || "Cannot save staff assignments" });
    }
  });

  // Zone Resource Defaults (Settings -> Platós)
  app.get(api.zones.resourceDefaults.get.path, async (req, res) => {
    try {
      const zoneId = Number(req.params.id);
      if (!Number.isFinite(zoneId)) {
        return res.status(400).json({ message: "Invalid id" });
      }

      const { data, error } = await supabaseAdmin
        .from("zone_resource_defaults")
        .select("resource_item_id")
        .eq("zone_id", zoneId);

      if (error) throw error;

      const resourceItemIds = (data ?? []).map((r: any) =>
        Number(r.resource_item_id),
      );

      res.json({ zoneId, resourceItemIds });
    } catch (err: any) {
      return res.status(400).json({
        message: err?.message || "Cannot fetch zone resource defaults",
      });
    }
  });

  app.patch(api.zones.resourceDefaults.update.path, async (req, res) => {
    try {
      const zoneId = Number(req.params.id);
      if (!Number.isFinite(zoneId)) {
        return res.status(400).json({ message: "Invalid id" });
      }

      const input = api.zones.resourceDefaults.update.input.parse(req.body);
      const uniqueIds = Array.from(
        new Set((input.resourceItemIds ?? []).map((n) => Number(n))),
      ).filter((n) => Number.isFinite(n) && n > 0);

      const { error: delErr } = await supabaseAdmin
        .from("zone_resource_defaults")
        .delete()
        .eq("zone_id", zoneId);

      if (delErr) throw delErr;

      if (uniqueIds.length > 0) {
        const rows = uniqueIds.map((rid) => ({
          zone_id: zoneId,
          resource_item_id: rid,
        }));

        const { error: insErr } = await supabaseAdmin
          .from("zone_resource_defaults")
          .insert(rows);

        if (insErr) throw insErr;
      }

      res.json({ zoneId, resourceItemIds: uniqueIds });
    } catch (err: any) {
      return res.status(400).json({
        message: err?.message || "Cannot update zone resource defaults",
      });
    }
  });

  // Space Resource Defaults (Settings -> Platós y espacios)
  app.get(api.spaces.resourceDefaults.get.path, async (req, res) => {
    try {
      const spaceId = Number(req.params.id);
      if (!Number.isFinite(spaceId)) {
        return res.status(400).json({ message: "Invalid id" });
      }

      const { data, error } = await supabaseAdmin
        .from("space_resource_defaults")
        .select("resource_item_id")
        .eq("space_id", spaceId);

      if (error) throw error;

      const resourceItemIds = (data ?? []).map((r: any) => Number(r.resource_item_id));

      res.json({ spaceId, resourceItemIds });
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || "Cannot fetch space resource defaults" });
    }
  });

  app.patch(api.spaces.resourceDefaults.update.path, async (req, res) => {
    try {
      const spaceId = Number(req.params.id);
      if (!Number.isFinite(spaceId)) {
        return res.status(400).json({ message: "Invalid id" });
      }

      const input = api.spaces.resourceDefaults.update.input.parse(req.body);
      const uniqueIds = Array.from(new Set((input.resourceItemIds ?? []).map((n) => Number(n)))).filter(
        (n) => Number.isFinite(n) && n > 0
      );

      // Replace-all (simple y robusto)
      const { error: delErr } = await supabaseAdmin
        .from("space_resource_defaults")
        .delete()
        .eq("space_id", spaceId);

      if (delErr) throw delErr;

      if (uniqueIds.length > 0) {
        const rows = uniqueIds.map((rid) => ({
          space_id: spaceId,
          resource_item_id: rid,
        }));

        const { error: insErr } = await supabaseAdmin
          .from("space_resource_defaults")
          .insert(rows);

        if (insErr) throw insErr;
      }

      res.json({ spaceId, resourceItemIds: uniqueIds });
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || "Cannot update space resource defaults" });
    }
  });

  // Zone Resource Type Defaults (Settings)
  app.get(api.zones.resourceTypeDefaults.get.path, async (req, res) => {
    try {
      const zoneId = Number(req.params.id);
      if (!Number.isFinite(zoneId)) return res.status(400).json({ message: "Invalid id" });

      const { data, error } = await supabaseAdmin
        .from("zone_resource_type_defaults")
        .select("resource_type_id, quantity")
        .eq("zone_id", zoneId)
        .order("resource_type_id", { ascending: true });

      if (error) throw error;

      const requirements = (data ?? []).map((r: any) => ({
        resourceTypeId: Number(r.resource_type_id),
        quantity: Number(r.quantity ?? 0),
      }));

      res.json({ zoneId, requirements });
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Cannot fetch zone resource type defaults" });
    }
  });

  app.patch(api.zones.resourceTypeDefaults.update.path, async (req, res) => {
    try {
      const zoneId = Number(req.params.id);
      if (!Number.isFinite(zoneId)) return res.status(400).json({ message: "Invalid id" });

      const input = api.zones.resourceTypeDefaults.update.input.parse(req.body);

      const cleaned = (input.requirements ?? [])
        .map((x: any) => ({
          resourceTypeId: Number(x.resourceTypeId),
          quantity: Number(x.quantity ?? 0),
        }))
        .filter((x: any) => Number.isFinite(x.resourceTypeId) && x.resourceTypeId > 0);

      // Replace-all
      const { error: delErr } = await supabaseAdmin
        .from("zone_resource_type_defaults")
        .delete()
        .eq("zone_id", zoneId);

      if (delErr) throw delErr;

      if (cleaned.length > 0) {
        const rows = cleaned.map((x: any) => ({
          zone_id: zoneId,
          resource_type_id: x.resourceTypeId,
          quantity: x.quantity,
        }));

        const { error: insErr } = await supabaseAdmin
          .from("zone_resource_type_defaults")
          .insert(rows);

        if (insErr) throw insErr;
      }

      res.json({ zoneId, requirements: cleaned });
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Cannot update zone resource type defaults" });
    }
  });

  // Space Resource Type Defaults (Settings)
  app.get(api.spaces.resourceTypeDefaults.get.path, async (req, res) => {
    try {
      const spaceId = Number(req.params.id);
      if (!Number.isFinite(spaceId)) return res.status(400).json({ message: "Invalid id" });

      const { data, error } = await supabaseAdmin
        .from("space_resource_type_defaults")
        .select("resource_type_id, quantity")
        .eq("space_id", spaceId)
        .order("resource_type_id", { ascending: true });

      if (error) throw error;

      const requirements = (data ?? []).map((r: any) => ({
        resourceTypeId: Number(r.resource_type_id),
        quantity: Number(r.quantity ?? 0),
      }));

      res.json({ spaceId, requirements });
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Cannot fetch space resource type defaults" });
    }
  });

  app.patch(api.spaces.resourceTypeDefaults.update.path, async (req, res) => {
    try {
      const spaceId = Number(req.params.id);
      if (!Number.isFinite(spaceId)) return res.status(400).json({ message: "Invalid id" });

      const input = api.spaces.resourceTypeDefaults.update.input.parse(req.body);

      const cleaned = (input.requirements ?? [])
        .map((x: any) => ({
          resourceTypeId: Number(x.resourceTypeId),
          quantity: Number(x.quantity ?? 0),
        }))
        .filter((x: any) => Number.isFinite(x.resourceTypeId) && x.resourceTypeId > 0);

      // Replace-all
      const { error: delErr } = await supabaseAdmin
        .from("space_resource_type_defaults")
        .delete()
        .eq("space_id", spaceId);

      if (delErr) throw delErr;

      if (cleaned.length > 0) {
        const rows = cleaned.map((x: any) => ({
          space_id: spaceId,
          resource_type_id: x.resourceTypeId,
          quantity: x.quantity,
        }));

        const { error: insErr } = await supabaseAdmin
          .from("space_resource_type_defaults")
          .insert(rows);

        if (insErr) throw insErr;
      }

      res.json({ spaceId, requirements: cleaned });
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Cannot update space resource type defaults" });
    }
  });

  // Resource Types & Items (1 a 1)
  app.get("/api/resource-types-with-items", async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("resource_types")
        .select("id, code, name, resource_items(id, name, is_active)")
        .order("name", { ascending: true });

      if (error) throw error;

      const normalized = (data ?? []).map((t: any) => {
        const items = (t.resource_items ?? [])
          .filter((i: any) => i.is_active !== false)
          .map((i: any) => ({
            id: Number(i.id),
            name: String(i.name ?? ""),
            isActive: i.is_active !== false,
          }))
          .sort((a: any, b: any) => a.name.localeCompare(b.name));

        return {
          id: Number(t.id),
          code: String(t.code ?? ""),
          name: String(t.name ?? ""),
          items,
        };
      });

      res.json(normalized);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch resource types" });
    }
  });

  app.post("/api/resource-types", async (req, res) => {
    try {
      const input = z
        .object({
          code: z.string().min(1),
          name: z.string().min(1),
        })
        .strict()
        .parse(req.body);

      const { data, error } = await supabaseAdmin
        .from("resource_types")
        .insert({ code: input.code, name: input.name })
        .select("*")
        .single();

      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Invalid input" });
    }
  });


  app.delete("/api/resource-types/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

      const { error } = await supabaseAdmin
        .from("resource_types")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return res.json({ success: true });
    } catch (err: any) {
      const mapped = mapDeleteError(err, "Cannot delete resource type");
      return res.status(mapped.status).json(mapped.body);
    }
  });

  app.post("/api/resource-items", async (req, res) => {
    try {
      const input = z
        .object({
          typeId: z.number().int().positive(),
          name: z.string().min(1),
        })
        .strict()
        .parse(req.body);

      const { data, error } = await supabaseAdmin
        .from("resource_items")
        .insert({ type_id: input.typeId, name: input.name, is_active: true })
        .select("*")
        .single();

      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Invalid input" });
    }
  });

  app.patch("/api/resource-items/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

      const input = z
        .object({
          name: z.string().min(1).optional(),
          isActive: z.boolean().optional(),
        })
        .strict()
        .parse(req.body);

      const patch: any = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.isActive !== undefined) patch.is_active = input.isActive;

      const { data, error } = await supabaseAdmin
        .from("resource_items")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();

      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Cannot update resource item" });
    }
  });

  app.delete("/api/resource-items/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

      const { error } = await supabaseAdmin
        .from("resource_items")
        .delete()
        .eq("id", id);

      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      const mapped = mapDeleteError(err, "Cannot delete resource item");
      return res.status(mapped.status).json(mapped.body);
    }
  });

  // Resource Item Components (composite resources)
  // - GET: lista componentes de un resource_item
  // - PUT: reemplaza la lista completa (idempotente)
  app.get("/api/resource-items/:id/components", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

      const { data: rows, error } = await supabaseAdmin
        .from("resource_item_components")
        .select("component_resource_item_id, quantity")
        .eq("parent_resource_item_id", id);

      if (error) throw error;

      const componentIds = (rows ?? [])
        .map((r: any) => Number(r.component_resource_item_id))
        .filter((n: any) => Number.isFinite(n));

      let nameById = new Map<number, string>();
      if (componentIds.length > 0) {
        const { data: items, error: iErr } = await supabaseAdmin
          .from("resource_items")
          .select("id, name")
          .in("id", componentIds);
        if (iErr) throw iErr;
        for (const it of items ?? []) {
          nameById.set(Number((it as any).id), String((it as any).name ?? ""));
        }
      }

      const normalized = (rows ?? [])
        .map((r: any) => ({
          componentId: Number(r.component_resource_item_id),
          componentName: nameById.get(Number(r.component_resource_item_id)) ?? "",
          quantity: Number(r.quantity ?? 1),
        }))
        .filter((r: any) => Number.isFinite(r.componentId))
        .sort((a: any, b: any) => a.componentName.localeCompare(b.componentName));

      res.json(normalized);
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Cannot fetch components" });
    }
  });

  app.put("/api/resource-items/:id/components", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

      const input = z
        .object({
          components: z
            .array(
              z
                .object({
                  componentId: z.number().int().positive(),
                  quantity: z.number().int().min(1).max(99),
                })
                .strict()
            )
            .default([]),
        })
        .strict()
        .parse(req.body);

      // remove duplicates (componentId)
      const seen = new Set<number>();
      const unique = (input.components ?? []).filter((c) => {
        if (!Number.isFinite(c.componentId)) return false;
        if (c.componentId === id) return false;
        if (seen.has(c.componentId)) return false;
        seen.add(c.componentId);
        return true;
      });

      // Replace all rows atomically-ish (best effort).
      const { error: delErr } = await supabaseAdmin
        .from("resource_item_components")
        .delete()
        .eq("parent_resource_item_id", id);
      if (delErr) throw delErr;

      if (unique.length > 0) {
        const rows = unique.map((c) => ({
          parent_resource_item_id: id,
          component_resource_item_id: c.componentId,
          quantity: c.quantity,
        }));

        const { error: insErr } = await supabaseAdmin
          .from("resource_item_components")
          .insert(rows);
        if (insErr) throw insErr;
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Cannot update components" });
    }
  });

  // Resource Pools (Settings defaults)
  app.get("/api/resource-pools", async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("resource_pools")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      res.json(data ?? []);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch resource pools" });
    }
  });

  app.post("/api/resource-pools", async (req, res) => {
    try {
      const input = z.object({
        code: z.string().min(1),
        name: z.string().min(1),
        defaultQuantity: z.number().int().min(0).max(99).optional(),
        defaultNames: z.array(z.string().min(1)).optional(),
      }).strict().parse(req.body);

      const payload: any = {
        code: input.code,
        name: input.name,
        default_quantity: input.defaultQuantity ?? 0,
        default_names: input.defaultNames ?? null,
      };

      const { data, error } = await supabaseAdmin
        .from("resource_pools")
        .insert(payload)
        .select("*")
        .single();

      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Invalid input" });
    }
  });

  app.patch("/api/resource-pools/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

      const input = z.object({
        code: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        defaultQuantity: z.number().int().min(0).max(99).optional(),
        defaultNames: z.array(z.string().min(1)).nullable().optional(),
      }).strict().parse(req.body);

      const patch: any = {};
      if (input.code !== undefined) patch.code = input.code;
      if (input.name !== undefined) patch.name = input.name;
      if (input.defaultQuantity !== undefined) patch.default_quantity = input.defaultQuantity;
      if (input.defaultNames !== undefined) patch.default_names = input.defaultNames;

      const { data, error } = await supabaseAdmin
        .from("resource_pools")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();

      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Cannot update resource pool" });
    }
  });

  app.delete("/api/resource-pools/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

      const { error } = await supabaseAdmin
        .from("resource_pools")
        .delete()
        .eq("id", id);

      if (error) throw error;

      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Cannot delete resource pool" });
    }
  });

  // Program Settings (defaults globales)
  app.get(api.programSettings.get.path, async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("program_settings")
        .select("*")
        .eq("id", 1)
        .single();

      if (error) throw error;

      res.json({
        id: Number(data.id),
        mealStart: String(data.meal_start),
        mealEnd: String(data.meal_end),
        contestantMealDurationMinutes: Number(data.contestant_meal_duration_minutes),
        contestantMealMaxSimultaneous: Number(data.contestant_meal_max_simultaneous),
        mealTaskTemplateName: String(data.meal_task_template_name ?? "Comer"),
        clockMode: data.clock_mode === "manual" ? "manual" : "auto",
        simulatedTime:
          typeof data.simulated_time === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(data.simulated_time)
            ? data.simulated_time
            : null,
      });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch program settings" });
    }
  });

  app.patch(api.programSettings.update.path, async (req, res) => {
    try {
      const input = api.programSettings.update.input.parse(req.body);

      const patch: any = {};
      if (input.mealStart !== undefined) patch.meal_start = input.mealStart;
      if (input.mealEnd !== undefined) patch.meal_end = input.mealEnd;
      if (input.contestantMealDurationMinutes !== undefined)
        patch.contestant_meal_duration_minutes = input.contestantMealDurationMinutes;
      if (input.contestantMealMaxSimultaneous !== undefined)
        patch.contestant_meal_max_simultaneous = input.contestantMealMaxSimultaneous;

      if (input.mealTaskTemplateName !== undefined)
        patch.meal_task_template_name = String(input.mealTaskTemplateName).trim();

      if (input.clockMode !== undefined) patch.clock_mode = input.clockMode;
      if (input.simulatedTime !== undefined) patch.simulated_time = input.simulatedTime;

      const { error } = await supabaseAdmin
        .from("program_settings")
        .update(patch)
        .eq("id", 1);

      if (error) throw error;

      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Invalid input" });
    }
  });

  // Optimizer Settings (defaults globales)
  app.get(api.optimizerSettings.get.path, async (_req, res) => {
    try {
      const settings = await storage.getOptimizerSettings();

      res.json({
        id: 1,
        mainZoneId: settings.mainZoneId,
        optimizationMode: settings.optimizationMode,
        heuristics: settings.heuristics,

        // booleans legacy (siguen existiendo)
        prioritizeMainZone: settings.prioritizeMainZone,
        groupBySpaceAndTemplate: settings.groupBySpaceAndTemplate,

        // ✅ niveles amigables
        mainZonePriorityLevel: settings.mainZonePriorityLevel,
        groupingLevel: settings.groupingLevel,
        contestantStayInZoneLevel: settings.contestantStayInZoneLevel,

        // ✅ modos del plató principal
        mainZoneOptFinishEarly: settings.mainZoneOptFinishEarly,
        mainZoneOptKeepBusy: settings.mainZoneOptKeepBusy,

        // ✅ compactar concursantes
        contestantCompactLevel: settings.contestantCompactLevel,
      });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch optimizer settings" });
    }
  });

  app.patch(api.optimizerSettings.update.path, async (req, res) => {
    try {
      const input = api.optimizerSettings.update.input.parse(req.body);
      const current = await storage.getOptimizerSettings();

      const patch: any = {};
      if (input.mainZoneId !== undefined) patch.main_zone_id = input.mainZoneId;
      if (input.optimizationMode !== undefined) patch.optimization_mode = input.optimizationMode;

      const normalizeHeuristicPatch = (key: keyof typeof current.heuristics) => {
        const incoming = input.heuristics?.[key];
        if (!incoming) return current.heuristics[key];
        return {
          basicLevel: Math.max(0, Math.min(3, Number(incoming.basicLevel ?? current.heuristics[key].basicLevel))),
          advancedValue: Math.max(0, Math.min(10, Number(incoming.advancedValue ?? current.heuristics[key].advancedValue))),
        };
      };

      const hzMainFinishEarly = normalizeHeuristicPatch("mainZoneFinishEarly");
      const hzMainKeepBusy = normalizeHeuristicPatch("mainZoneKeepBusy");
      const hzGroupingMatch = normalizeHeuristicPatch("groupBySpaceTemplateMatch");
      const hzGroupingActive = normalizeHeuristicPatch("groupBySpaceActive");
      const hzCompact = normalizeHeuristicPatch("contestantCompact");
      const hzStayInZone = normalizeHeuristicPatch("contestantStayInZone");

      // niveles nuevos
      if (input.mainZonePriorityLevel !== undefined) {
        const lvl = Math.max(0, Math.min(3, Number(input.mainZonePriorityLevel)));
        patch.main_zone_priority_level = lvl;
        patch.prioritize_main_zone = lvl > 0;
      }

      if (input.groupingLevel !== undefined) {
        const lvl = Math.max(0, Math.min(3, Number(input.groupingLevel)));
        patch.grouping_level = lvl;
        patch.group_by_space_and_template = lvl > 0;
      }

      if (input.contestantStayInZoneLevel !== undefined) {
        patch.contestant_stay_in_zone_level = Math.max(0, Math.min(3, Number(input.contestantStayInZoneLevel)));
      }

      // ✅ modos del plató principal
      if (input.mainZoneOptFinishEarly !== undefined) {
        patch.main_zone_opt_finish_early = input.mainZoneOptFinishEarly;
      }
      if (input.mainZoneOptKeepBusy !== undefined) {
        patch.main_zone_opt_keep_busy = input.mainZoneOptKeepBusy;
      }

      if (input.contestantCompactLevel !== undefined) {
        const lvl = Math.max(0, Math.min(3, Number(input.contestantCompactLevel)));
        patch.contestant_compact_level = lvl;
      }

      // legacy booleans (si llegan, también actualizan niveles por defecto)
      if (input.prioritizeMainZone !== undefined) {
        patch.prioritize_main_zone = input.prioritizeMainZone;
        if (input.mainZonePriorityLevel === undefined) {
          patch.main_zone_priority_level = input.prioritizeMainZone ? 2 : 0;
        }
      }

      if (input.groupBySpaceAndTemplate !== undefined) {
        patch.group_by_space_and_template = input.groupBySpaceAndTemplate;
        if (input.groupingLevel === undefined) {
          patch.grouping_level = input.groupBySpaceAndTemplate ? 2 : 0;
        }
      }

      // new schema heuristic values (without breaking legacy payloads)
      if (input.heuristics?.mainZoneFinishEarly || input.heuristics?.mainZoneKeepBusy) {
        const best = hzMainFinishEarly.basicLevel >= hzMainKeepBusy.basicLevel ? hzMainFinishEarly : hzMainKeepBusy;
        patch.main_zone_priority_level = best.basicLevel;
        patch.main_zone_priority_advanced_value = Math.max(hzMainFinishEarly.advancedValue, hzMainKeepBusy.advancedValue);
        patch.prioritize_main_zone = best.basicLevel > 0;
      } else if (input.mainZonePriorityLevel !== undefined) {
        patch.main_zone_priority_advanced_value = [0, 3, 6, 9][Math.max(0, Math.min(3, Number(input.mainZonePriorityLevel)))] ?? 0;
      }

      if (input.heuristics?.groupBySpaceTemplateMatch || input.heuristics?.groupBySpaceActive) {
        const best = hzGroupingMatch.basicLevel >= hzGroupingActive.basicLevel ? hzGroupingMatch : hzGroupingActive;
        patch.grouping_level = best.basicLevel;
        patch.grouping_advanced_value = Math.max(hzGroupingMatch.advancedValue, hzGroupingActive.advancedValue);
        patch.group_by_space_and_template = best.basicLevel > 0;
      } else if (input.groupingLevel !== undefined) {
        patch.grouping_advanced_value = [0, 3, 6, 9][Math.max(0, Math.min(3, Number(input.groupingLevel)))] ?? 0;
      }

      if (input.heuristics?.contestantCompact) {
        patch.contestant_compact_level = hzCompact.basicLevel;
        patch.contestant_compact_advanced_value = hzCompact.advancedValue;
      } else if (input.contestantCompactLevel !== undefined) {
        patch.contestant_compact_advanced_value = [0, 3, 6, 9][Math.max(0, Math.min(3, Number(input.contestantCompactLevel)))] ?? 0;
      }

      if (input.heuristics?.contestantStayInZone) {
        patch.contestant_stay_in_zone_level = hzStayInZone.basicLevel;
        patch.contestant_stay_in_zone_advanced_value = hzStayInZone.advancedValue;
      } else if (input.contestantStayInZoneLevel !== undefined) {
        patch.contestant_stay_in_zone_advanced_value = [0, 3, 6, 9][Math.max(0, Math.min(3, Number(input.contestantStayInZoneLevel)))] ?? 0;
      }

      const { error } = await supabaseAdmin
        .from("optimizer_settings")
        .update(patch)
        .eq("id", 1);

      if (error) throw error;

      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Invalid input" });
    }
  });

  // Vocal Coach Rules (globales)
  app.get(api.vocalCoachRules.list.path, async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("vocal_coach_rules")
        .select("id, vocal_coach_resource_item_id, task_template_id, default_space_id, sort_order, is_required")
        .order("vocal_coach_resource_item_id", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });

      if (error) throw error;

      const normalized = (data ?? []).map((r: any) => ({
        id: Number(r.id),
        vocalCoachResourceItemId: Number(r.vocal_coach_resource_item_id),
        taskTemplateId: Number(r.task_template_id),
        defaultSpaceId:
          r.default_space_id === null || r.default_space_id === undefined ? null : Number(r.default_space_id),
        sortOrder: Number(r.sort_order ?? 0),
        isRequired: r.is_required !== false,
      }));

      res.json(normalized);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch vocal coach rules" });
    }
  });

  app.put(api.vocalCoachRules.saveAll.path, async (req, res) => {
    try {
      const input = api.vocalCoachRules.saveAll.input.parse(req.body);

      // Borrado total y reinsert (simple y seguro para Settings)
      const { error: delErr } = await supabaseAdmin.from("vocal_coach_rules").delete().neq("id", -1);
      if (delErr) throw delErr;

      const rows = (input.rules ?? []).map((r) => ({
        vocal_coach_resource_item_id: r.vocalCoachResourceItemId,
        task_template_id: r.taskTemplateId,
        default_space_id: r.defaultSpaceId,
        sort_order: r.sortOrder ?? 0,
        is_required: r.isRequired !== false,
      }));

      if (rows.length > 0) {
        const { error: insErr } = await supabaseAdmin.from("vocal_coach_rules").insert(rows);
        if (insErr) throw insErr;
      }

      res.json({ success: true as const });
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Invalid input" });
    }
  });

  // Plan Resource Items (snapshot per plan, 1 a 1)
  app.get(api.plans.resourceItems.list.path, async (req, res) => {
    try {
      const planId = Number(req.params.id);
      if (!Number.isFinite(planId)) return res.status(400).json({ message: "Invalid plan id" });

      const { data, error } = await supabaseAdmin
        .from("plan_resource_items")
        .select("id, plan_id, type_id, resource_item_id, name, is_available, source, resource_types ( id, code, name )")
        .eq("plan_id", planId)
        .order("id", { ascending: true });

      if (error) throw error;

      const normalized = (data ?? []).map((r: any) => ({
        id: Number(r.id),
        planId: Number(r.plan_id),
        typeId: Number(r.type_id),
        resourceItemId: r.resource_item_id === null || r.resource_item_id === undefined ? null : Number(r.resource_item_id),
        name: String(r.name ?? ""),
        isAvailable: r.is_available !== false,
        source: String(r.source ?? "default"),
        type: {
          id: Number(r.resource_types?.id),
          code: String(r.resource_types?.code ?? ""),
          name: String(r.resource_types?.name ?? ""),
        },
      }));

      res.json(normalized);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch plan resource items" });
    }
  });

  app.post(api.plans.resourceItems.create.path, async (req, res) => {
    try {
      const planId = Number(req.params.id);
      if (!Number.isFinite(planId)) return res.status(400).json({ message: "Invalid plan id" });

      const input = api.plans.resourceItems.create.input.parse(req.body);

      const { data, error } = await supabaseAdmin
        .from("plan_resource_items")
        .insert({
          plan_id: planId,
          type_id: input.typeId,
          resource_item_id: null,
          name: input.name,
          is_available: true,
          source: "adhoc",
        })
        .select("id")
        .single();

      if (error) throw error;

      res.json({ success: true, id: Number(data.id) });
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Cannot create plan resource item" });
    }
  });

  app.patch(api.plans.resourceItems.update.path, async (req, res) => {
    try {
      const planId = Number(req.params.id);
      const itemId = Number(req.params.itemId);
      if (!Number.isFinite(planId) || !Number.isFinite(itemId)) return res.status(400).json({ message: "Invalid id" });

      const input = api.plans.resourceItems.update.input.parse(req.body);

      // Si quieren renombrar, solo permitimos en adhoc
      if (input.name !== undefined) {
        const { data: row, error: rowErr } = await supabaseAdmin
          .from("plan_resource_items")
          .select("id, source")
          .eq("id", itemId)
          .eq("plan_id", planId)
          .single();

        if (rowErr) return res.status(404).json({ message: "Not found" });
        if (String(row.source) !== "adhoc") {
          return res.status(400).json({ message: "Only adhoc items can be renamed" });
        }
      }

      const patch: any = {};
      if (input.isAvailable !== undefined) patch.is_available = input.isAvailable;
      if (input.name !== undefined) patch.name = input.name;

      const { error } = await supabaseAdmin
        .from("plan_resource_items")
        .update(patch)
        .eq("id", itemId)
        .eq("plan_id", planId);

      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Cannot update plan resource item" });
    }
  });

  app.delete(api.plans.resourceItems.delete.path, async (req, res) => {
    try {
      const planId = Number(req.params.id);
      const itemId = Number(req.params.itemId);
      if (!Number.isFinite(planId) || !Number.isFinite(itemId)) return res.status(400).json({ message: "Invalid id" });

      // Solo permitimos borrar filas adhoc (las default se deshabilitan)
      const { data: row, error: rowErr } = await supabaseAdmin
        .from("plan_resource_items")
        .select("id, source")
        .eq("id", itemId)
        .eq("plan_id", planId)
        .single();

      if (rowErr) return res.status(404).json({ message: "Not found" });
      if (String(row.source) !== "adhoc") {
        return res.status(400).json({ message: "Only adhoc items can be deleted" });
      }

      const { error } = await supabaseAdmin
        .from("plan_resource_items")
        .delete()
        .eq("id", itemId)
        .eq("plan_id", planId);

      if (error) throw error;

      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Cannot delete plan resource item" });
    }
  });

  app.post(api.plans.resourceItems.init.path, async (req, res) => {
    try {
      const planId = Number(req.params.id);
      if (!Number.isFinite(planId)) return res.status(400).json({ message: "Invalid plan id" });

      const { count, error: countErr } = await supabaseAdmin
        .from("plan_resource_items")
        .select("*", { count: "exact", head: true })
        .eq("plan_id", planId);

      if (countErr) throw countErr;

      if ((count ?? 0) > 0) {
        return res.json({ success: true, created: 0 });
      }

      const { data: items, error: itemsErr } = await supabaseAdmin
        .from("resource_items")
        .select("id, type_id, name")
        .eq("is_active", true);

      if (itemsErr) throw itemsErr;

      const rows = (items ?? []).map((i: any) => ({
        plan_id: planId,
        type_id: i.type_id,
        resource_item_id: i.id,
        name: i.name,
        is_available: true,
        source: "default",
      }));

      if (rows.length > 0) {
        const { error: insErr } = await supabaseAdmin.from("plan_resource_items").insert(rows);
        if (insErr) throw insErr;
      }

      res.json({ success: true, created: rows.length });
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Cannot init plan resource items" });
    }
  });

  // Vocal Coach Rules (por plan)
  app.get(api.plans.vocalCoachRules.list.path, async (req, res) => {
    try {
      const planId = Number(req.params.id);
      if (!Number.isFinite(planId)) return res.status(400).json({ message: "Invalid plan id" });

      // Validar plan existe
      const { data: planRow, error: planErr } = await supabaseAdmin
        .from("plans")
        .select("id")
        .eq("id", planId)
        .maybeSingle();

      if (planErr) throw planErr;
      if (!planRow) return res.status(404).json({ message: "Plan not found" });

      const { data, error } = await supabaseAdmin
        .from("plan_vocal_coach_rules")
        .select("id, plan_id, vocal_coach_plan_resource_item_id, task_template_id, default_space_id, sort_order, is_required")
        .eq("plan_id", planId)
        .order("vocal_coach_plan_resource_item_id", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });

      if (error) throw error;

      const normalized = (data ?? []).map((r: any) => ({
        id: Number(r.id),
        planId: Number(r.plan_id),
        vocalCoachPlanResourceItemId: Number(r.vocal_coach_plan_resource_item_id),
        taskTemplateId: Number(r.task_template_id),
        defaultSpaceId:
          r.default_space_id === null || r.default_space_id === undefined ? null : Number(r.default_space_id),
        sortOrder: Number(r.sort_order ?? 0),
        isRequired: r.is_required !== false,
      }));

      res.json(normalized);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch vocal coach rules" });
    }
  });

  app.put(api.plans.vocalCoachRules.saveAll.path, async (req, res) => {
    try {
      const planId = Number(req.params.id);
      if (!Number.isFinite(planId)) return res.status(400).json({ message: "Invalid plan id" });

      // Validar plan existe
      const { data: planRow, error: planErr } = await supabaseAdmin
        .from("plans")
        .select("id")
        .eq("id", planId)
        .maybeSingle();

      if (planErr) throw planErr;
      if (!planRow) return res.status(404).json({ message: "Plan not found" });

      const input = api.plans.vocalCoachRules.saveAll.input.parse(req.body);

      // borrar actuales
      const { error: delErr } = await supabaseAdmin
        .from("plan_vocal_coach_rules")
        .delete()
        .eq("plan_id", planId);
      if (delErr) throw delErr;

      const rows = (input.rules ?? []).map((r) => ({
        plan_id: planId,
        vocal_coach_plan_resource_item_id: r.vocalCoachPlanResourceItemId,
        task_template_id: r.taskTemplateId,
        default_space_id: r.defaultSpaceId,
        sort_order: r.sortOrder ?? 0,
        is_required: r.isRequired !== false,
      }));

      if (rows.length > 0) {
        const { error: insErr } = await supabaseAdmin.from("plan_vocal_coach_rules").insert(rows);
        if (insErr) throw insErr;
      }

      res.json({ success: true as const });
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Invalid input" });
    }
  });

  // Plan Space Resource Assignments (override por plan)
  app.get(api.plans.spaceResourceAssignments.list.path, async (req, res) => {
    try {
      const planId = Number(req.params.id);
      if (!Number.isFinite(planId)) {
        return res.status(400).json({ message: "Invalid plan id" });
      }

      // Validar plan existe
      const { data: planRow, error: planErr } = await supabaseAdmin
        .from("plans")
        .select("id")
        .eq("id", planId)
        .maybeSingle();

      if (planErr) throw planErr;
      if (!planRow) return res.status(404).json({ message: "Plan not found" });

      const { data, error } = await supabaseAdmin
        .from("plan_space_resource_assignments")
        .select("space_id, plan_resource_item_id")
        .eq("plan_id", planId)
        .order("space_id", { ascending: true });

      if (error) throw error;

      const bySpace = new Map<number, number[]>();
      for (const r of data ?? []) {
        const spaceId = Number((r as any).space_id);
        const priId = Number((r as any).plan_resource_item_id);
        if (!Number.isFinite(spaceId) || !Number.isFinite(priId)) continue;

        const list = bySpace.get(spaceId) ?? [];
        list.push(priId);
        bySpace.set(spaceId, list);
      }

      const out = Array.from(bySpace.entries()).map(([spaceId, planResourceItemIds]) => ({
        spaceId,
        planResourceItemIds,
      }));

      res.json(out);
    } catch (err: any) {
      res.status(500).json({
        message: err?.message || "Failed to fetch plan space resource assignments",
      });
    }
  });

  app.patch(api.plans.spaceResourceAssignments.update.path, async (req, res) => {
    try {
      const planId = Number(req.params.id);
      const spaceId = Number(req.params.spaceId);
      if (!Number.isFinite(planId) || !Number.isFinite(spaceId)) {
        return res.status(400).json({ message: "Invalid ids" });
      }

      // Validar plan existe
      const { data: planRow, error: planErr } = await supabaseAdmin
        .from("plans")
        .select("id")
        .eq("id", planId)
        .maybeSingle();

      if (planErr) throw planErr;
      if (!planRow) return res.status(404).json({ message: "Plan not found" });

      const input = api.plans.spaceResourceAssignments.update.input.parse(req.body);

      const unique = Array.from(
        new Set((input.planResourceItemIds ?? []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)),
      );

      // Validar que esos plan_resource_item_id pertenecen a este plan
      if (unique.length > 0) {
        const { data: priRows, error: priErr } = await supabaseAdmin
          .from("plan_resource_items")
          .select("id")
          .eq("plan_id", planId)
          .in("id", unique);

        if (priErr) throw priErr;

        const okIds = new Set((priRows ?? []).map((x: any) => Number(x.id)));
        const missing = unique.filter((id) => !okIds.has(id));
        if (missing.length > 0) {
          return res.status(400).json({
            message: `Some planResourceItemIds do not belong to this plan: ${missing.join(", ")}`,
          });
        }
      }

      // Reemplazo total (simple y robusto)
      const { error: delErr } = await supabaseAdmin
        .from("plan_space_resource_assignments")
        .delete()
        .eq("plan_id", planId)
        .eq("space_id", spaceId);

      if (delErr) throw delErr;

      if (unique.length > 0) {
        const rows = unique.map((priId) => ({
          plan_id: planId,
          space_id: spaceId,
          plan_resource_item_id: priId,
        }));

        const { error: insErr } = await supabaseAdmin
          .from("plan_space_resource_assignments")
          .insert(rows);

        if (insErr) throw insErr;
      }

      res.json({ spaceId, planResourceItemIds: unique });
    } catch (err: any) {
      res.status(400).json({
        message: err?.message || "Cannot update plan space resource assignments",
      });
    }
  });

  // Plan Zone Resource Assignments (override por plan)
  app.get(api.plans.zoneResourceAssignments.list.path, async (req, res) => {
    try {
      const planId = Number(req.params.id);
      if (!Number.isFinite(planId)) {
        return res.status(400).json({ message: "Invalid plan id" });
      }

      const { data: planRow, error: planErr } = await supabaseAdmin
        .from("plans")
        .select("id")
        .eq("id", planId)
        .maybeSingle();

      if (planErr) throw planErr;
      if (!planRow) return res.status(404).json({ message: "Plan not found" });

      const { data, error } = await supabaseAdmin
        .from("plan_zone_resource_assignments")
        .select("zone_id, plan_resource_item_id")
        .eq("plan_id", planId)
        .order("zone_id", { ascending: true });

      if (error) throw error;

      const byZone = new Map<number, number[]>();
      for (const r of data ?? []) {
        const zoneId = Number((r as any).zone_id);
        const priId = Number((r as any).plan_resource_item_id);
        if (!Number.isFinite(zoneId) || !Number.isFinite(priId)) continue;

        const list = byZone.get(zoneId) ?? [];
        list.push(priId);
        byZone.set(zoneId, list);
      }

      const out = Array.from(byZone.entries()).map(([zoneId, planResourceItemIds]) => ({
        zoneId,
        planResourceItemIds,
      }));

      res.json(out);
    } catch (err: any) {
      res.status(500).json({
        message: err?.message || "Failed to fetch plan zone resource assignments",
      });
    }
  });

  app.patch(api.plans.zoneResourceAssignments.update.path, async (req, res) => {
    try {
      const planId = Number(req.params.id);
      const zoneId = Number(req.params.zoneId);
      if (!Number.isFinite(planId) || !Number.isFinite(zoneId)) {
        return res.status(400).json({ message: "Invalid ids" });
      }

      const { data: planRow, error: planErr } = await supabaseAdmin
        .from("plans")
        .select("id")
        .eq("id", planId)
        .maybeSingle();

      if (planErr) throw planErr;
      if (!planRow) return res.status(404).json({ message: "Plan not found" });

      const input = api.plans.zoneResourceAssignments.update.input.parse(req.body);

      const unique = Array.from(
        new Set(
          (input.planResourceItemIds ?? [])
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n) && n > 0),
        ),
      );

      if (unique.length > 0) {
        const { data: priRows, error: priErr } = await supabaseAdmin
          .from("plan_resource_items")
          .select("id")
          .eq("plan_id", planId)
          .in("id", unique);

        if (priErr) throw priErr;

        const okIds = new Set((priRows ?? []).map((x: any) => Number(x.id)));
        const missing = unique.filter((id) => !okIds.has(id));
        if (missing.length > 0) {
          return res.status(400).json({
            message: `Some planResourceItemIds do not belong to this plan: ${missing.join(", ")}`,
          });
        }
      }

      const { error: delErr } = await supabaseAdmin
        .from("plan_zone_resource_assignments")
        .delete()
        .eq("plan_id", planId)
        .eq("zone_id", zoneId);

      if (delErr) throw delErr;

      if (unique.length > 0) {
        const rows = unique.map((priId) => ({
          plan_id: planId,
          zone_id: zoneId,
          plan_resource_item_id: priId,
        }));

        const { error: insErr } = await supabaseAdmin
          .from("plan_zone_resource_assignments")
          .insert(rows);

        if (insErr) throw insErr;
      }

      res.json({ zoneId, planResourceItemIds: unique });
    } catch (err: any) {
      res.status(400).json({
        message: err?.message || "Cannot update plan zone resource assignments",
      });
    }
  });

  // Plan Zone Resource Type Requirements (override por plan)
  app.get(api.plans.zoneResourceTypeRequirements.list.path, async (req, res) => {
    try {
      const planId = Number(req.params.id);
      if (!Number.isFinite(planId)) return res.status(400).json({ message: "Invalid plan id" });

      const { data: planRow, error: planErr } = await supabaseAdmin
        .from("plans")
        .select("id")
        .eq("id", planId)
        .maybeSingle();

      if (planErr) throw planErr;
      if (!planRow) return res.status(404).json({ message: "Plan not found" });

      const { data, error } = await supabaseAdmin
        .from("plan_zone_resource_type_requirements")
        .select("zone_id, resource_type_id, quantity")
        .eq("plan_id", planId)
        .order("zone_id", { ascending: true });

      if (error) throw error;

      const byZone = new Map<number, any[]>();
      for (const r of data ?? []) {
        const zoneId = Number((r as any).zone_id);
        if (!Number.isFinite(zoneId)) continue;

        const list = byZone.get(zoneId) ?? [];
        list.push({
          resourceTypeId: Number((r as any).resource_type_id),
          quantity: Number((r as any).quantity ?? 0),
        });
        byZone.set(zoneId, list);
      }

      const out = Array.from(byZone.entries()).map(([zoneId, requirements]) => ({
        zoneId,
        requirements,
      }));

      res.json(out);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch plan zone resource type requirements" });
    }
  });

  app.patch(api.plans.zoneResourceTypeRequirements.update.path, async (req, res) => {
    try {
      const planId = Number(req.params.id);
      const zoneId = Number(req.params.zoneId);
      if (!Number.isFinite(planId) || !Number.isFinite(zoneId)) {
        return res.status(400).json({ message: "Invalid ids" });
      }

      const { data: planRow, error: planErr } = await supabaseAdmin
        .from("plans")
        .select("id")
        .eq("id", planId)
        .maybeSingle();

      if (planErr) throw planErr;
      if (!planRow) return res.status(404).json({ message: "Plan not found" });

      const input = api.plans.zoneResourceTypeRequirements.update.input.parse(req.body);

      const cleaned = (input.requirements ?? [])
        .map((x: any) => ({
          resourceTypeId: Number(x.resourceTypeId),
          quantity: Number(x.quantity ?? 0),
        }))
        .filter((x: any) => Number.isFinite(x.resourceTypeId) && x.resourceTypeId > 0);

      const { error: delErr } = await supabaseAdmin
        .from("plan_zone_resource_type_requirements")
        .delete()
        .eq("plan_id", planId)
        .eq("zone_id", zoneId);

      if (delErr) throw delErr;

      if (cleaned.length > 0) {
        const rows = cleaned.map((x: any) => ({
          plan_id: planId,
          zone_id: zoneId,
          resource_type_id: x.resourceTypeId,
          quantity: x.quantity,
        }));

        const { error: insErr } = await supabaseAdmin
          .from("plan_zone_resource_type_requirements")
          .insert(rows);

        if (insErr) throw insErr;
      }

      res.json({ zoneId, requirements: cleaned });
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Cannot update plan zone resource type requirements" });
    }
  });

  // Plan Space Resource Type Requirements (override por plan)
  app.get(api.plans.spaceResourceTypeRequirements.list.path, async (req, res) => {
    try {
      const planId = Number(req.params.id);
      if (!Number.isFinite(planId)) return res.status(400).json({ message: "Invalid plan id" });

      const { data: planRow, error: planErr } = await supabaseAdmin
        .from("plans")
        .select("id")
        .eq("id", planId)
        .maybeSingle();

      if (planErr) throw planErr;
      if (!planRow) return res.status(404).json({ message: "Plan not found" });

      const { data, error } = await supabaseAdmin
        .from("plan_space_resource_type_requirements")
        .select("space_id, resource_type_id, quantity")
        .eq("plan_id", planId)
        .order("space_id", { ascending: true });

      if (error) throw error;

      const bySpace = new Map<number, any[]>();
      for (const r of data ?? []) {
        const spaceId = Number((r as any).space_id);
        if (!Number.isFinite(spaceId)) continue;

        const list = bySpace.get(spaceId) ?? [];
        list.push({
          resourceTypeId: Number((r as any).resource_type_id),
          quantity: Number((r as any).quantity ?? 0),
        });
        bySpace.set(spaceId, list);
      }

      const out = Array.from(bySpace.entries()).map(([spaceId, requirements]) => ({
        spaceId,
        requirements,
      }));

      res.json(out);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch plan space resource type requirements" });
    }
  });

  app.patch(api.plans.spaceResourceTypeRequirements.update.path, async (req, res) => {
    try {
      const planId = Number(req.params.id);
      const spaceId = Number(req.params.spaceId);
      if (!Number.isFinite(planId) || !Number.isFinite(spaceId)) {
        return res.status(400).json({ message: "Invalid ids" });
      }

      const { data: planRow, error: planErr } = await supabaseAdmin
        .from("plans")
        .select("id")
        .eq("id", planId)
        .maybeSingle();

      if (planErr) throw planErr;
      if (!planRow) return res.status(404).json({ message: "Plan not found" });

      const input = api.plans.spaceResourceTypeRequirements.update.input.parse(req.body);

      const cleaned = (input.requirements ?? [])
        .map((x: any) => ({
          resourceTypeId: Number(x.resourceTypeId),
          quantity: Number(x.quantity ?? 0),
        }))
        .filter((x: any) => Number.isFinite(x.resourceTypeId) && x.resourceTypeId > 0);

      const { error: delErr } = await supabaseAdmin
        .from("plan_space_resource_type_requirements")
        .delete()
        .eq("plan_id", planId)
        .eq("space_id", spaceId);

      if (delErr) throw delErr;

      if (cleaned.length > 0) {
        const rows = cleaned.map((x: any) => ({
          plan_id: planId,
          space_id: spaceId,
          resource_type_id: x.resourceTypeId,
          quantity: x.quantity,
        }));

        const { error: insErr } = await supabaseAdmin
          .from("plan_space_resource_type_requirements")
          .insert(rows);

        if (insErr) throw insErr;
      }

      res.json({ spaceId, requirements: cleaned });
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Cannot update plan space resource type requirements" });
    }
  });

  // Plan Resource Pools (snapshot per plan)
  app.get(api.plans.resourcePools.list.path, async (req, res) => {
    try {
      const planId = Number(req.params.id);
      if (!Number.isFinite(planId)) return res.status(400).json({ message: "Invalid plan id" });

      const { data, error } = await supabaseAdmin
        .from("plan_resource_pools")
        .select("id, plan_id, pool_id, quantity, names, resource_pools ( id, code, name )")
        .eq("plan_id", planId)
        .order("id", { ascending: true });

      if (error) throw error;

      const normalized = (data ?? []).map((r: any) => ({
        id: Number(r.id),
        planId: Number(r.plan_id),
        poolId: Number(r.pool_id),
        quantity: Number(r.quantity ?? 0),
        names: (r.names ?? null) as string[] | null,
        pool: {
          id: Number(r.resource_pools?.id),
          code: String(r.resource_pools?.code ?? ""),
          name: String(r.resource_pools?.name ?? ""),
        },
      }));

      res.json(normalized);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to fetch plan resource pools" });
    }
  });

  app.patch(api.plans.resourcePools.update.path, async (req, res) => {
    try {
      const planId = Number(req.params.id);
      const poolId = Number(req.params.poolId);
      if (!Number.isFinite(planId) || !Number.isFinite(poolId)) {
        return res.status(400).json({ message: "Invalid ids" });
      }

      const patch = api.plans.resourcePools.update.input.parse(req.body);

      const update: any = {};
      if (patch.quantity !== undefined) update.quantity = patch.quantity;
      if (patch.names !== undefined) update.names = patch.names;

      const { data: updated, error } = await supabaseAdmin
        .from("plan_resource_pools")
        .update(update)
        .eq("plan_id", planId)
        .eq("pool_id", poolId)
        .select("id")
        .single();

      if (error) throw error;
      if (!updated) return res.status(404).json({ message: "Plan resource not found" });

      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Cannot update plan resource pool" });
    }
  });

  // Init snapshot for older plans (if plan_resource_pools is empty)
  app.post(api.plans.resourcePools.init.path, async (req, res) => {
    try {
      const planId = Number(req.params.id);
      if (!Number.isFinite(planId)) return res.status(400).json({ message: "Invalid plan id" });

      const { data: plan, error: planErr } = await supabaseAdmin
        .from("plans")
        .select("id")
        .eq("id", planId)
        .single();

      if (planErr) throw planErr;
      if (!plan) return res.status(404).json({ message: "Plan not found" });

      const { data: existing, error: exErr } = await supabaseAdmin
        .from("plan_resource_pools")
        .select("id")
        .eq("plan_id", planId)
        .limit(1);

      if (exErr) throw exErr;
      if (existing && existing.length > 0) {
        return res.json({ success: true, created: 0 });
      }

      const { data: pools, error: poolsErr } = await supabaseAdmin
        .from("resource_pools")
        .select("id, default_quantity, default_names");

      if (poolsErr) throw poolsErr;

      const rows = (pools ?? []).map((p: any) => ({
        plan_id: planId,
        pool_id: p.id,
        quantity: p.default_quantity ?? 0,
        names: p.default_names ?? null,
      }));

      if (rows.length === 0) return res.json({ success: true, created: 0 });

      const { error: insErr } = await supabaseAdmin
        .from("plan_resource_pools")
        .insert(rows);

      if (insErr) throw insErr;

      res.json({ success: true, created: rows.length });
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Cannot init plan resource pools" });
    }
  });

  // Delete Zone (Plató) - only if it has no spaces
  app.delete(api.zones.delete.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

      const { data: anySpace, error: spaceErr } = await supabaseAdmin
        .from("spaces")
        .select("id")
        .eq("zone_id", id)
        .limit(1);

      if (spaceErr) throw spaceErr;
      if (anySpace && anySpace.length > 0) {
        return res.status(400).json({ message: "No se puede borrar el Plató: aún tiene espacios. Borra primero los espacios." });
      }

      // 1) Desenganchar referencias para evitar fallo por FK (templates + tareas del día)

      // Task templates: si apuntan a este plató, se limpian (NO existe location_label en task_templates)
      {
        const { error: tplErr } = await supabaseAdmin
          .from("task_templates")
          .update({ zone_id: null, space_id: null })
          .eq("zone_id", id);

        if (tplErr) throw tplErr;
      }

      // Daily tasks: al borrar PLATÓ
      // Regla de dominio: zone_id = null, space_id = null, location_label = "Espacio borrado"
      {
        const { error: taskErr } = await supabaseAdmin
          .from("daily_tasks")
          .update({
            zone_id: null,
            space_id: null,
            location_label: "Espacio borrado",
          })
          .eq("zone_id", id);

        if (taskErr) throw taskErr;
      }

      // 2) Borrar plató
      const { error } = await supabaseAdmin.from("zones").delete().eq("id", id);
      if (error) throw error;

      res.json({ success: true });
    } catch (err: any) {
      const mapped = mapDeleteError(err, "Cannot delete zone");
      return res.status(mapped.status).json(mapped.body);
    }
  });

  // Delete Space - only if it has no children
  app.delete(api.spaces.delete.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

      const { data: children, error: childErr } = await supabaseAdmin
        .from("spaces")
        .select("id")
        .eq("parent_space_id", id)
        .limit(1);

      if (childErr) throw childErr;
      if (children && children.length > 0) {
        return res.status(400).json({ message: "No se puede borrar el espacio: tiene subespacios. Borra primero los hijos." });
      }

      // 1) Desenganchar referencias para evitar fallo por FK (templates + tareas del día)
      // Task templates: si apuntan a este espacio, se limpia el space_id (y opcionalmente zone_id si venía solo por este espacio)
      {
        const { error: tplErr } = await supabaseAdmin
          .from("task_templates")
          // ✅ mantenemos el plató; solo se pierde el espacio (NO existe location_label en task_templates)
          .update({ space_id: null })
          .eq("space_id", id);

        if (tplErr) throw tplErr;
      }

      // Daily tasks: al borrar SOLO el espacio
      // ✅ NO tocamos zone_id (la tarea ya lo tiene bien)
      // Solo quitamos space_id y marcamos etiqueta
      {
        const { error: taskErr } = await supabaseAdmin
          .from("daily_tasks")
          .update({
            space_id: null,
            location_label: "Espacio borrado",
          })
          .eq("space_id", id);

        if (taskErr) throw taskErr;
      }

      // 2) Borrar espacio
      const { error } = await supabaseAdmin.from("spaces").delete().eq("id", id);
      if (error) throw error;

      res.json({ success: true });
    } catch (err: any) {
      const mapped = mapDeleteError(err, "Cannot delete space");
      return res.status(mapped.status).json(mapped.body);
    }
  });

  // Health check
  app.get("/api/health", (req, res) => res.json({ status: "ok" }));
  
  // Plans
  app.get(api.plans.list.path, async (req, res) => {
    const plans = await storage.getPlans();
    res.json(plans);
  });


    app.get(api.plans.get.path, async (req, res) => {
      try {
        const planId = Number(req.params.id);
        const full = await storage.getPlanFullDetails(planId);
        if (!full) return res.status(404).json({ message: "Plan not found" });

        const p: any = full.plan;

        res.json({
          id: p.id,
          date: p.date,
          status: p.status,

          workStart: p.work_start ?? p.workStart ?? null,
          workEnd: p.work_end ?? p.workEnd ?? null,
          mealStart: p.meal_start ?? p.mealStart ?? null,
          mealEnd: p.meal_end ?? p.mealEnd ?? null,

          mealTaskTemplateName: String(p.mealTaskTemplateName ?? "Comer"),

          contestantMealDurationMinutes:
            p.contestant_meal_duration_minutes ?? p.contestantMealDurationMinutes ?? 75,
          contestantMealMaxSimultaneous:
            p.contestant_meal_max_simultaneous ?? p.contestantMealMaxSimultaneous ?? 10,

          camerasAvailable: p.cameras_available ?? p.camerasAvailable ?? 0,

          dailyTasks: (full.tasks || []).map((t: any) => ({
            id: t.id,
            planId: t.plan_id ?? t.planId,
            templateId: t.template_id ?? t.templateId,
            contestantId: t.contestant_id ?? t.contestantId ?? null,
            status: t.status,

            startPlanned: t.start_planned ?? t.startPlanned ?? null,
            endPlanned: t.end_planned ?? t.endPlanned ?? null,
            startReal: t.start_real ?? t.startReal ?? null,
            endReal: t.end_real ?? t.endReal ?? null,

            durationOverride: t.duration_override ?? t.durationOverride ?? null,
            camerasOverride: t.cameras_override ?? t.camerasOverride ?? null,
            zoneId: t.zone_id ?? t.zoneId ?? null,
            spaceId: t.space_id ?? t.spaceId ?? null,
            locationLabel: t.location_label ?? t.locationLabel ?? null,
            assignedResources: t.assignedResources ?? t.assigned_resource_ids ?? null,

            template: t.template,
          })),
        });
      } catch (e: any) {
        console.error("[GET PLAN] error", e);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });




  app.post(api.plans.create.path, async (req, res) => {
    try {
      const input = api.plans.create.input.parse(req.body);
      const plan = await storage.createPlan(input);
      res.status(201).json(plan);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: err?.message || "Internal Server Error" });
    }
  });

  // Update Plan (Work hours / Meal break / Cameras)
  app.patch(api.plans.update.path, async (req, res) => {
    const planId = Number(req.params.id);

    try {
      const patch = api.plans.update.input.parse(req.body);
      const updated = await storage.updatePlan(planId, patch);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      return res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Delete Plan (blocked if any task is in_progress/done)
  app.delete("/api/plans/:id", async (req, res) => {
    try {
      const planId = Number(req.params.id);
      if (!Number.isFinite(planId)) {
        return res.status(400).json({ message: "Invalid plan id" });
      }

      const ok = await storage.deletePlan(planId);
      if (!ok) return res.status(404).json({ message: "Plan not found" });

      return res.status(204).end();
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || "Cannot delete plan" });
    }
  });

  app.get("/api/plans/:id/tasks", async (req, res) => {
    const tasks = await storage.getTasksForPlan(Number(req.params.id));
    res.json(tasks);
  });


  app.get("/api/plans/:id/locks", async (req, res) => {
    const locks = await storage.getLocksForPlan(Number(req.params.id));
    res.json(locks);
  });

  // Contestants (per plan)
  app.get(api.plans.contestants.list.path, async (req, res) => {
    try {
      const planId = Number(req.params.id);
      const contestants = await storage.getContestantsByPlan(planId);
      res.json(contestants);
    } catch (e) {
      console.error("[GET PLAN CONTESTANTS] error", e);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.post(api.plans.contestants.create.path, async (req, res) => {
    try {
      const planId = Number(req.params.id);
      const input = api.plans.contestants.create.input.parse(req.body);
      const created = await storage.createContestantForPlan(planId, input);
      res.status(201).json(created);
    } catch (err: any) {
      if (err?.name === "ZodError") {
        return res.status(400).json({ message: err.errors?.[0]?.message || "Invalid input" });
      }
      console.error("[CREATE PLAN CONTESTANT] error", err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.patch(api.plans.contestants.update.path, async (req, res) => {
    try {
      const planId = Number(req.params.id);
      const contestantId = Number(req.params.contestantId);

      if (!Number.isFinite(planId) || !Number.isFinite(contestantId)) {
        return res.status(400).json({ message: "Invalid id" });
      }

      const patch = api.plans.contestants.update.input.parse(req.body);
      await storage.updateContestantForPlan(planId, contestantId, patch);
      return res.status(204).end();
    } catch (err: any) {
      if (err?.name === "ZodError") {
        return res.status(400).json({ message: err.errors?.[0]?.message || "Invalid input" });
      }
      if (String(err?.message || "").toLowerCase().includes("not found")) {
        return res.status(404).json({ message: "Not found" });
      }
      console.error("[UPDATE PLAN CONTESTANT] error", err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Task Templates
  app.get(api.taskTemplates.list.path, async (req, res) => {
    const templates = await storage.getTaskTemplates();
    res.json(templates);
  });

  app.post(api.taskTemplates.create.path, async (req, res) => {
    try {
      const input = api.taskTemplates.create.input.parse(req.body);
      const created = await storage.createTaskTemplate(input);
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      return res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Update Task Template
  app.patch(api.taskTemplates.update.path, async (req, res) => {
    try {
      const templateId = Number(req.params.id);
      const patch = api.taskTemplates.update.input.parse(req.body);
      const updated = await storage.updateTaskTemplate(templateId, patch);
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      return res.status(400).json({ message: err?.message || "Cannot update template" });
    }
  });

  // Delete Task Template
  app.delete(api.taskTemplates.delete.path, async (req, res) => {
    try {
      const templateId = Number(req.params.id);
      await storage.deleteTaskTemplate(templateId);
      res.json({ success: true });
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || "Cannot delete template" });
    }
  });

  // Daily Tasks
  app.post(api.dailyTasks.create.path, async (req, res) => {
    try {
      const input = api.dailyTasks.create.input.parse(req.body);
      const created = await storage.createDailyTask(input);
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      return res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Task Status Update (Execution)
  app.patch(api.dailyTasks.updateStatus.path, async (req, res) => {
    const user = (req as any).user;

    try {
      const taskId = Number(req.params.id);
      const input = api.dailyTasks.updateStatus.input.parse(req.body);

      const updated: any = await storage.updateTaskStatus(taskId, input, user.id);

      // Normalizar respuesta (camelCase) para mantener coherencia con el resto del API
      res.json({
        id: updated.id,
        planId: updated.plan_id ?? updated.planId ?? null,
        templateId: updated.template_id ?? updated.templateId ?? null,
        contestantId: updated.contestant_id ?? updated.contestantId ?? null,
        status: updated.status,

        startPlanned: updated.start_planned ?? updated.startPlanned ?? null,
        endPlanned: updated.end_planned ?? updated.endPlanned ?? null,
        startReal: updated.start_real ?? updated.startReal ?? null,
        endReal: updated.end_real ?? updated.endReal ?? null,

        durationOverride: updated.duration_override ?? updated.durationOverride ?? null,
        camerasOverride: updated.cameras_override ?? updated.camerasOverride ?? null,
      });
    } catch (err: any) {
      if (err?.name === "ZodError") {
        return res.status(400).json({ message: err.errors?.[0]?.message || "Invalid input" });
      }
      if ((String(err?.message || "")).toLowerCase().includes("not found")) {
        return res.status(404).json({ message: "Task not found" });
      }
      return res.status(400).json({ message: err?.message || "Bad Request" });
    }
  });

  // Delete Daily Task (only if not in progress / done)
  app.delete(api.dailyTasks.delete.path, async (req, res) => {
    const taskId = Number(req.params.id);

    try {
      // 1) Leer tarea para validar estado
      const { data: task, error: readErr } = await supabaseAdmin
        .from("daily_tasks")
        .select("id,status,plan_id")
        .eq("id", taskId)
        .maybeSingle();

      if (readErr) throw readErr;

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      if (task.status === "in_progress" || task.status === "done") {
        return res.status(400).json({
          message: "Cannot delete a task that is in progress or done",
        });
      }

      // 2) Borrar
      const { error: delErr } = await supabaseAdmin
        .from("daily_tasks")
        .delete()
        .eq("id", taskId);

      if (delErr) throw delErr;

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || "Cannot delete task" });
    }
  });

  // Update Daily Task (editable only if not in progress / done)
  app.patch(api.dailyTasks.update.path, async (req, res) => {
    const taskId = Number(req.params.id);

    try {
      const input = api.dailyTasks.update.input.parse(req.body);

      // 1) Leer para validar estado
      const { data: task, error: readErr } = await supabaseAdmin
        .from("daily_tasks")
        .select("id,status,plan_id")
        .eq("id", taskId)
        .maybeSingle();

      if (readErr) throw readErr;
      if (!task) return res.status(404).json({ message: "Task not found" });

      if (task.status === "in_progress" || task.status === "done") {
        return res.status(400).json({
          message: "Cannot edit a task that is in progress or done",
        });
      }

      // 2) Update (solo overrides permitidos)
      const patchDb: any = {};

      if (input.contestantId !== undefined) patchDb.contestant_id = input.contestantId;
      if (input.durationOverride !== undefined) patchDb.duration_override = input.durationOverride;
      if (input.camerasOverride !== undefined) patchDb.cameras_override = input.camerasOverride;

      // ✅ ubicación
      if (input.zoneId !== undefined) patchDb.zone_id = input.zoneId;
      if (input.spaceId !== undefined) patchDb.space_id = input.spaceId;
      if (input.comment1Text !== undefined) patchDb.comment1_text = input.comment1Text;
      if (input.comment1Color !== undefined) patchDb.comment1_color = input.comment1Color;
      if (input.comment2Text !== undefined) patchDb.comment2_text = input.comment2Text;
      if (input.comment2Color !== undefined) patchDb.comment2_color = input.comment2Color;

      // si el usuario toca ubicación, limpiamos location_label (deja de ser "espacio borrado")
      if (input.zoneId !== undefined || input.spaceId !== undefined) {
        patchDb.location_label = null;
      }

      // defensivo: si no hay nada que actualizar, no llamamos a supabase .single()
      if (Object.keys(patchDb).length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }

      const { data: updated, error: updErr } = await supabaseAdmin
        .from("daily_tasks")
        .update(patchDb)
        .eq("id", taskId)
        .select("*")
        .single();

      if (updErr) throw updErr;


      if (updErr) throw updErr;

      // 3) Respuesta camelCase mínima (coherente)
      return res.json({
        ...updated,
        planId: updated.plan_id ?? null,
        templateId: updated.template_id ?? null,
        contestantId: updated.contestant_id ?? null,
        startPlanned: updated.start_planned ?? null,
        endPlanned: updated.end_planned ?? null,
        startReal: updated.start_real ?? null,
        endReal: updated.end_real ?? null,
        durationOverride: updated.duration_override ?? null,
        camerasOverride: updated.cameras_override ?? null,
        zoneId: updated.zone_id ?? null,
        spaceId: updated.space_id ?? null,
        locationLabel: updated.location_label ?? null,
        comment1Text: updated.comment1_text ?? null,
        comment1Color: updated.comment1_color ?? null,
        comment2Text: updated.comment2_text ?? null,
        comment2Color: updated.comment2_color ?? null,
      });
    } catch (err: any) {
      if (err?.name === "ZodError") {
        return res.status(400).json({ message: err.errors?.[0]?.message || "Invalid input" });
      }
      return res.status(400).json({ message: err?.message || "Cannot update task" });
    }
  });

  // Engine Integration
  // ✅ DEBUG: ver exactamente qué recibe el motor (EngineInput)
  app.get("/api/debug/engine-input/:planId", async (req, res) => {
    try {
      const planId = Number(req.params.planId);
      if (!Number.isFinite(planId) || planId <= 0) {
        return res.status(400).json({ message: "Invalid planId" });
      }

      const engineInput = await buildEngineInput(planId, storage);

      const tasks = Array.isArray((engineInput as any)?.tasks) ? (engineInput as any).tasks : [];
      const sample = tasks.slice(0, 25).map((t: any) => ({
        id: t.id,
        templateId: t.templateId,
        templateName: t.templateName ?? null,
        zoneId: t.zoneId ?? null,
        spaceId: t.spaceId ?? null,
        resourceRequirements: t.resourceRequirements ?? null,
      }));

      return res.json({
        planId,
        tasksCount: tasks.length,
        sample,
      });
    } catch (err: any) {
      return res.status(500).json({ message: err?.message || "Debug failed" });
    }
  });

  // ✅ DEBUG: ver exactamente qué PRODUCE el motor (EngineOutput)
  app.get("/api/debug/generate/:planId", async (req, res) => {
    try {
      const planId = Number(req.params.planId);
      if (!Number.isFinite(planId) || planId <= 0) {
        return res.status(400).json({ message: "Invalid planId" });
      }

      const engineInput = await buildEngineInput(planId, storage);
      const result = generatePlan(engineInput);

      return res.json({
        planId,
        feasible: !!(result as any)?.feasible,
        reasons: (result as any)?.reasons ?? [],
        warnings: (result as any)?.warnings ?? [],
        plannedTasks: (result as any)?.plannedTasks ?? [],
        // útil para saber si el inventario llega
        planResourceItemsCount: Array.isArray((engineInput as any)?.planResourceItems)
          ? (engineInput as any).planResourceItems.length
          : null,
      });
    } catch (err: any) {
      return res.status(500).json({ message: err?.message || "Debug failed" });
    }
  });

  // ✅ DEBUG: ver qué hay realmente guardado en daily_tasks
  app.get("/api/debug/daily-task/:taskId", async (req, res) => {
    try {
      const taskId = Number(req.params.taskId);
      if (!Number.isFinite(taskId) || taskId <= 0) {
        return res.status(400).json({ message: "Invalid taskId" });
      }

      const { data, error } = await (supabaseAdmin as any)
        .from("daily_tasks")
        .select("id, template_id, assigned_resource_ids, start_planned, end_planned")
        .eq("id", taskId)
        .single();

      if (error) throw error;
      return res.json(data);
    } catch (err: any) {
      return res.status(500).json({ message: err?.message || "Debug failed" });
    }
  });

  
  app.post(api.plans.generate.path, async (req, res) => {
    const planId = Number(req.params.id);
    try {
      const engineInput = await buildEngineInput(planId, storage);
      const result = generatePlan(engineInput);

      if (!result.feasible) {
        // ✅ Importante: NO convertir reasons a string.
        // La UI necesita `code`, `contestantId`, `missingTemplateId`, etc. para acciones (crear prerequisitos).
        const reasons = (result.reasons || []).map((r: any) => {
          if (typeof r === "string") return { message: r };
          if (r && typeof r === "object") return r;
          return { message: String(r) };
        });

        return res.status(422).json({
          message: "INFEASIBLE",
          reasons,
        });
      }


      // Aplicar cambios del motor (guardar horas planificadas)
      const planned = (result as any).plannedTasks || [];
      let updated = 0;

      for (const p of planned) {
        await storage.updatePlannedTimes(
          p.taskId,
          p.startPlanned,
          p.endPlanned,
          Array.isArray((p as any).assignedResources) ? (p as any).assignedResources : [],
        );

        updated++;
      }

      const warnings = (result as any)?.warnings ?? [];
      res.json({ success: true, planId, tasksUpdated: updated, warnings });

    } catch (e: any) {
      const msg = typeof e?.message === "string" ? e.message : "Unknown error";
      // 404 solo si realmente no existe el plan
      if (msg.toLowerCase().includes("not found")) {
        return res.status(404).json({ message: msg });
      }
      // el resto, 500
      return res.status(500).json({ message: "ENGINE_ERROR", detail: msg });
    }

  });

  return httpServer;
}
