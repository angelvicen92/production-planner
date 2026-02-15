import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";

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

        // Get initial session
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        setUser(data.session?.user ?? null);
        setIsLoading(false);

        // Listen for auth changes
        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
          setUser(session?.user ?? null);
          setIsLoading(false);
          queryClient.invalidateQueries(); // Refresh all data on auth change
        });

        unsubscribe = () => sub.subscription.unsubscribe();
      } catch (e) {
        // If config missing or backend unreachable, keep app stable
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

  const signIn = useMutation({
    mutationFn: async ({ email, password }: any) => {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },
  });

  const signUp = useMutation({
    mutationFn: async ({ email, password }: any) => {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      return data;
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
    signIn: signIn.mutateAsync,
    isSigningIn: signIn.isPending,
    signUp: signUp.mutateAsync,
    isSigningUp: signUp.isPending,
    signOut: signOut.mutateAsync,
    isSigningOut: signOut.isPending,
  };
}
