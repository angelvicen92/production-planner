import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
// Compatibilidad: partes del código antiguo esperan una función async.
// Devolvemos siempre el mismo cliente.
export async function getSupabaseClient(): Promise<SupabaseClient> {
  return supabase;
}

