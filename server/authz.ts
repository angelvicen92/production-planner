import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "./supabase";

export type AppRole = "admin" | "production" | "aux" | "viewer";

export async function getUserRole(userId: string): Promise<AppRole | null> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("roles(key)")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const roleKey = (data as any)?.roles?.key;
  if (roleKey === "admin" || roleKey === "production" || roleKey === "aux" || roleKey === "viewer") {
    return roleKey;
  }

  return null;
}

export function withPermissionDenied(res: Response) {
  return res.status(403).json({
    type: "permission_denied",
    message: "No tienes permisos para esta acción.",
  });
}

export async function requireAnyRole(
  req: Request,
  res: Response,
  next: NextFunction,
  allowed: AppRole[],
) {
  const userId = (req as any)?.user?.id as string | undefined;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const role = await getUserRole(userId);
    if (!role || !allowed.includes(role)) {
      return withPermissionDenied(res);
    }
    (req as any).userRole = role;
    return next();
  } catch (error) {
    console.error("[AUTHZ] role lookup failed", error);
    return res.status(500).json({ message: "Failed to check permissions" });
  }
}
