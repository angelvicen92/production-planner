import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { apiRequest } from "@/lib/api";

async function bootstrapRole() {
  try {
    await apiRequest<{ role: string }>("POST", "/api/bootstrap-role", {});
  } catch (error) {
    console.error("[AUTH] bootstrap role failed", error);
  }
}

export function useAuth() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const supabase = await getSupabaseClient();

        const { data } = await supabase.auth.getSession();
        if (cancelled) return;

        const currentUser = data.session?.user ?? null;
        setUser(currentUser);
        setIsLoading(false);

        if (currentUser) {
          await bootstrapRole();
          queryClient.invalidateQueries();
        }

        const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
          const nextUser = session?.user ?? null;
          setUser(nextUser);
          setIsLoading(false);

          if (nextUser) {
            await bootstrapRole();
          }

          queryClient.invalidateQueries();
        });

        unsubscribe = () => sub.subscription.unsubscribe();
      } catch {
        if (!cancelled) {
          setUser(null);
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [queryClient]);

  const signInWithMagicLink = useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (error) throw error;
      return { ok: true };
    },
  });

  const signOut = useMutation({
    mutationFn: async () => {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    signInWithMagicLink: signInWithMagicLink.mutateAsync,
    isSendingMagicLink: signInWithMagicLink.isPending,
    signOut: signOut.mutateAsync,
    isSigningOut: signOut.isPending,
  };
}
