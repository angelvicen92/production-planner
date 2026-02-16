import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { Session, User } from "@supabase/supabase-js";
import { apiRequest } from "@/lib/api";

async function bootstrapRole() {
  try {
    await apiRequest<{ role: string }>("POST", "/api/bootstrap-role", {});
  } catch (error) {
    console.error("[AUTH] bootstrap role failed", error);
  }
}

function getMagicLinkRedirectUrl() {
  return `${window.location.origin}/dashboard`;
}

function getRecoveryRedirectUrl() {
  return `${window.location.origin}/login`;
}

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  authLoading: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  signInWithMagicLink: ({ email }: { email: string }) => Promise<{ ok: true }>;
  isSendingMagicLink: boolean;
  signInWithPassword: ({ email, password }: { email: string; password: string }) => Promise<{ ok: true }>;
  isSigningInWithPassword: boolean;
  signUpWithPassword: ({ email, password }: { email: string; password: string }) => Promise<{ ok: true }>;
  isSigningUpWithPassword: boolean;
  sendPasswordResetEmail: ({ email }: { email: string }) => Promise<{ ok: true }>;
  isSendingPasswordResetEmail: boolean;
  updatePassword: ({ password }: { password: string }) => Promise<{ ok: true }>;
  isUpdatingPassword: boolean;
  signOut: () => Promise<void>;
  isSigningOut: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      try {
        const supabase = await getSupabaseClient();

        const { data } = await supabase.auth.getSession();
        if (cancelled) return;

        const nextSession = data.session ?? null;
        setSession(nextSession);
        setAuthLoading(false);

        if (nextSession?.user) {
          await bootstrapRole();
          queryClient.invalidateQueries();
        }

        const { data: sub } = supabase.auth.onAuthStateChange(async (_event, updatedSession) => {
          setSession(updatedSession ?? null);
          setAuthLoading(false);

          if (updatedSession?.user) {
            await bootstrapRole();
          }

          queryClient.invalidateQueries();
        });

        unsubscribe = () => sub.subscription.unsubscribe();
      } catch {
        if (!cancelled) {
          setSession(null);
          setAuthLoading(false);
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
          emailRedirectTo: getMagicLinkRedirectUrl(),
        },
      });
      if (error) throw error;
      return { ok: true as const };
    },
  });

  const signInWithPassword = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { ok: true as const };
    },
  });

  const signUpWithPassword = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getMagicLinkRedirectUrl(),
        },
      });
      if (error) throw error;
      return { ok: true as const };
    },
  });

  const sendPasswordResetEmail = useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getRecoveryRedirectUrl(),
      });
      if (error) throw error;
      return { ok: true as const };
    },
  });

  const updatePassword = useMutation({
    mutationFn: async ({ password }: { password: string }) => {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      return { ok: true as const };
    },
  });

  const signOut = useMutation({
    mutationFn: async () => {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      authLoading,
      isLoading: authLoading,
      isAuthenticated: Boolean(session?.user),
      signInWithMagicLink: signInWithMagicLink.mutateAsync,
      isSendingMagicLink: signInWithMagicLink.isPending,
      signInWithPassword: signInWithPassword.mutateAsync,
      isSigningInWithPassword: signInWithPassword.isPending,
      signUpWithPassword: signUpWithPassword.mutateAsync,
      isSigningUpWithPassword: signUpWithPassword.isPending,
      sendPasswordResetEmail: sendPasswordResetEmail.mutateAsync,
      isSendingPasswordResetEmail: sendPasswordResetEmail.isPending,
      updatePassword: updatePassword.mutateAsync,
      isUpdatingPassword: updatePassword.isPending,
      signOut: signOut.mutateAsync,
      isSigningOut: signOut.isPending,
    }),
    [
      session,
      authLoading,
      signInWithMagicLink.mutateAsync,
      signInWithMagicLink.isPending,
      signInWithPassword.mutateAsync,
      signInWithPassword.isPending,
      signUpWithPassword.mutateAsync,
      signUpWithPassword.isPending,
      sendPasswordResetEmail.mutateAsync,
      sendPasswordResetEmail.isPending,
      updatePassword.mutateAsync,
      updatePassword.isPending,
      signOut.mutateAsync,
      signOut.isPending,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
