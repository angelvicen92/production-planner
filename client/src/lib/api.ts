import { getSupabaseClient } from "./supabaseClient";

export type ApiPermissionError = Error & {
  type: "permission_denied";
  status: 401 | 403;
};

export async function apiRequest<T>(
  method: string,
  path: string,
  data?: unknown
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  const supabase = await getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const token = session?.access_token;

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      cache: "no-store",
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error("Tiempo de espera agotado");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  const contentType = res.headers.get("content-type") || "";

  if (!res.ok) {
    const warnPrefix = `[apiRequest] ${method.toUpperCase()} ${path} failed`;

    if (res.status === 401 || res.status === 403) {
      const permissionError = new Error(
        "No tienes permisos para esta acción.",
      ) as ApiPermissionError;
      permissionError.type = "permission_denied";
      permissionError.status = res.status;
      console.warn(warnPrefix, {
        url: path,
        status: res.status,
        message: permissionError.message,
      });
      throw permissionError;
    }

    const payload = contentType.includes("application/json")
      ? await res.json().catch(() => ({}))
      : { message: await res.text().catch(() => "") };

    const error = new Error(payload?.message || res.statusText);
    (error as any).status = res.status;
    (error as any).reasons = payload?.reasons;
    (error as any).contentType = contentType;
    console.warn(warnPrefix, {
      url: path,
      status: res.status,
      message: error.message,
    });
    throw error;
  }

  if (res.status === 204) return {} as T;

  if (!contentType.includes("application/json")) {
    const text = await res.text().catch(() => "");
    const preview = text.slice(0, 80).replace(/\s+/g, " ");
    const error = new Error(
      `La API devolvió ${contentType || "sin content-type"} en vez de JSON. ` +
        `Probablemente estás cayendo en index.html. Respuesta: "${preview}..."`,
    );
    (error as any).status = res.status;
    (error as any).contentType = contentType;
    throw error;
  }

  return res.json();
}
