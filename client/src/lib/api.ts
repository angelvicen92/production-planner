import { getSupabaseClient } from "./supabaseClient";
import { publishApiHealth } from "./health-events";

export type ApiPermissionError = Error & {
  type: "permission_denied";
  status: 401 | 403;
};

export async function apiRequest<T>(
  method: string,
  path: string,
  data?: unknown,
  options?: { signal?: AbortSignal }
): Promise<T> {
  const startedAt = performance.now();
  const requestId = ++requestCounter;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  const externalSignal = options?.signal;
  const signal = combineSignals(controller.signal, externalSignal);

  logTrace("START", requestId, method, path);

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
      signal,
    });
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - startedAt);
    if (err?.name === "AbortError") {
      logTrace("ABORT", requestId, method, path, durationMs);
      publishApiHealth({ status: "aborted", durationMs, at: Date.now(), message: err?.message });
      throw err;
    }
    logTrace("ERROR", requestId, method, path, durationMs, err?.message);
    publishApiHealth({ status: "error", durationMs, at: Date.now(), message: err?.message });
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  const durationMs = Math.round(performance.now() - startedAt);

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
      logTrace("ERROR", requestId, method, path, durationMs, permissionError.message);
      publishApiHealth({ status: "error", durationMs, at: Date.now(), message: permissionError.message });
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
    logTrace("ERROR", requestId, method, path, durationMs, error.message);
    publishApiHealth({ status: "error", durationMs, at: Date.now(), message: error.message });
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
    logTrace("ERROR", requestId, method, path, durationMs, error.message);
    publishApiHealth({ status: "error", durationMs, at: Date.now(), message: error.message });
    throw error;
  }

  logTrace("END", requestId, method, path, durationMs, `status=${res.status}`);
  publishApiHealth({ status: "ok", durationMs, at: Date.now() });
  return res.json();
}

let requestCounter = 0;

function combineSignals(internal: AbortSignal, external?: AbortSignal) {
  if (!external) return internal;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([internal, external]);
  }

  if (external.aborted) {
    const fallback = new AbortController();
    fallback.abort((external as any).reason);
    return fallback.signal;
  }

  const bridge = new AbortController();
  const abortBridge = () => bridge.abort((external as any).reason);
  internal.addEventListener("abort", abortBridge, { once: true });
  external.addEventListener("abort", abortBridge, { once: true });

  return bridge.signal;
}

function logTrace(
  phase: "START" | "END" | "ERROR" | "ABORT",
  id: number,
  method: string,
  path: string,
  durationMs?: number,
  extra?: string,
) {
  if (!import.meta.env.DEV) return;

  const base = `[apiRequest #${id}] ${phase} ${method.toUpperCase()} ${path}`;
  const suffix = durationMs !== undefined ? ` (${durationMs}ms)` : "";
  if (phase === "ERROR") {
    console.error(`${base}${suffix}${extra ? ` · ${extra}` : ""}`);
    return;
  }
  if (phase === "ABORT") {
    console.warn(`${base}${suffix}${extra ? ` · ${extra}` : ""}`);
    return;
  }
  console.debug(`${base}${suffix}${extra ? ` · ${extra}` : ""}`);
}
