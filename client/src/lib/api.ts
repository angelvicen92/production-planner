import { z } from 'zod';
import { getSupabaseClient } from "./supabaseClient";

export async function apiRequest<T>(
  method: string,
  path: string,
  data?: unknown
): Promise<T> {
  const supabase = await getSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();

  const token = session?.access_token;

  const res = await fetch(path, {
    method,
    cache: "no-store",
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });

  const contentType = res.headers.get("content-type") || "";

  if (!res.ok) {
    // intenta leer JSON si es JSON; si no, lee texto
    const payload = contentType.includes("application/json")
      ? await res.json().catch(() => ({}))
      : { message: await res.text().catch(() => "") };

    const error = new Error(payload?.message || res.statusText);
    (error as any).status = res.status;
    (error as any).reasons = payload?.reasons;
    (error as any).contentType = contentType;
    throw error;
  }

  if (res.status === 204) return {} as T;

  // Si la respuesta no es JSON, devuelve un error MUY claro
  if (!contentType.includes("application/json")) {
    const text = await res.text().catch(() => "");
    const preview = text.slice(0, 80).replace(/\s+/g, " ");
    const error = new Error(
      `La API devolvió ${contentType || "sin content-type"} en vez de JSON. ` +
      `Probablemente estás cayendo en index.html. Respuesta: "${preview}..."`
    );
    (error as any).status = res.status;
    (error as any).contentType = contentType;
    throw error;
  }

  return res.json();
}

