import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function missing(name: string) {
  return `Falta la variable ${name} en Replit Secrets. 
Crea:
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY
y reinicia el Repl.`;
}

if (!supabaseUrl) throw new Error(missing("VITE_SUPABASE_URL"));
if (!supabaseAnonKey) throw new Error(missing("VITE_SUPABASE_ANON_KEY"));

// Cliente ÚNICO para el navegador (React)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

let currentSession: Session | null = null;
let currentToken: string | null = null;

type GetSessionSafeOptions = {
  timeoutMs?: number;
};

export type GetSessionSafeResult = {
  session: Session | null;
  timedOut: boolean;
};

export function getCachedAccessToken(): string | null {
  return currentToken;
}

export function getCachedSession(): Session | null {
  return currentSession;
}

export async function getSessionSafeWithMeta(
  options: GetSessionSafeOptions = {},
): Promise<GetSessionSafeResult> {
  const timeoutMs = options.timeoutMs ?? 1_500;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
    timeoutId = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
  });

  const sessionPromise = supabase.auth
    .getSession()
    .then(({ data: { session } }) => ({ timedOut: false as const, session }))
    .catch(() => ({ timedOut: false as const, session: null }));

  const result = await Promise.race([sessionPromise, timeoutPromise]);
  clearTimeout(timeoutId);

  if (result.timedOut) {
    return { session: currentSession, timedOut: true };
  }

  currentSession = result.session;
  currentToken = result.session?.access_token ?? null;
  return { session: result.session, timedOut: false };
}

export async function getSessionSafe(options: GetSessionSafeOptions = {}): Promise<Session | null> {
  const { session } = await getSessionSafeWithMeta(options);
  return session;
}

void getSessionSafeWithMeta({ timeoutMs: 2_000 });

supabase.auth.onAuthStateChange((_event, session) => {
  currentSession = session;
  currentToken = session?.access_token ?? null;
});

// Compatibilidad: partes del código antiguo esperan una función async.
// Devolvemos siempre el mismo cliente.
export async function getSupabaseClient(): Promise<SupabaseClient> {
  return supabase;
}
