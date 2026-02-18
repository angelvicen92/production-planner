import { useEffect, useState } from "react";
import { Redirect, Route, Switch } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AccessDenied } from "@/components/access-denied";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { useVisibilityRecovery } from "@/hooks/use-visibility-recovery";
import { useToast } from "@/hooks/use-toast";
import { useUserRole, type AppRole } from "@/hooks/use-user-role";

import LoginPage from "@/pages/login";
import PlansPage from "@/pages/plans";
import DashboardPage from "@/pages/dashboard";
import PlanDetailsPage from "@/pages/plan-details";
import TimelinePage from "@/pages/timeline";
import SettingsPage from "@/pages/settings";
import CallSheetPage from "@/pages/call-sheet";
import WarRoomPage from "@/pages/war-room";
import NotFound from "@/pages/not-found";

function FullScreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function AuthLoadingFallback({ seconds = 8 }: { seconds?: number }) {
  const [showTimeoutMessage, setShowTimeoutMessage] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setShowTimeoutMessage(true), seconds * 1000);
    return () => window.clearTimeout(timeout);
  }, [seconds]);

  if (!showTimeoutMessage) {
    return <FullScreenLoader />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-sm rounded-lg border bg-card p-6 text-center space-y-4">
        <p className="text-sm text-muted-foreground">Estamos tardando más de lo normal en validar tu sesión.</p>
        <a href="/login" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
          Ir a login
        </a>
      </div>
    </div>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, authLoading } = useAuth();

  if (authLoading) {
    return <AuthLoadingFallback />;
  }

  if (!session) {
    return <Redirect to="/login" />;
  }

  return <>{children}</>;
}

function RoleGuard({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: AppRole[] }) {
  const { session } = useAuth();
  const { role, isLoading: roleLoading } = useUserRole(Boolean(session));
  const { toast } = useToast();

  const hasRoleRestriction = Array.isArray(allowedRoles) && allowedRoles.length > 0;
  const isAuthorized = !hasRoleRestriction || (!!role && allowedRoles.includes(role));

  useEffect(() => {
    if (!roleLoading && session && hasRoleRestriction && !isAuthorized) {
      toast({ title: "Acceso denegado", description: "No tienes permisos para esta acción." });
    }
  }, [roleLoading, session, hasRoleRestriction, isAuthorized, toast]);

  if (!session) {
    return <Redirect to="/login" />;
  }

  if (roleLoading && hasRoleRestriction) {
    return <FullScreenLoader />;
  }

  if (hasRoleRestriction && !isAuthorized) {
    return (
      <div className="space-y-4">
        <AccessDenied />
        <Redirect to="/dashboard" />
      </div>
    );
  }

  return <>{children}</>;
}

function ProtectedRoute({ component: Component, allowedRoles }: { component: React.ComponentType; allowedRoles?: AppRole[] }) {
  return (
    <AuthGuard>
      <RoleGuard allowedRoles={allowedRoles}>
        <Component />
      </RoleGuard>
    </AuthGuard>
  );
}

function AppLifecycleEffects() {
  useVisibilityRecovery();
  return null;
}

function Router() {
  const { session, authLoading } = useAuth();

  if (authLoading) {
    return <AuthLoadingFallback />;
  }

  return (
    <Switch>
      <Route path="/login" component={LoginPage} />

      <Route path="/">{session ? <Redirect to="/dashboard" /> : <Redirect to="/login" />}</Route>

      <Route path="/dashboard">{() => <ProtectedRoute component={DashboardPage} />}</Route>

      <Route path="/plans">{() => <ProtectedRoute component={PlansPage} />}</Route>

      <Route path="/plans/:id">{() => <ProtectedRoute component={PlanDetailsPage} />}</Route>

      <Route path="/timeline">{() => <ProtectedRoute component={TimelinePage} />}</Route>
      <Route path="/call-sheet">{() => <ProtectedRoute component={CallSheetPage} />}</Route>

      <Route path="/war-room">{() => <ProtectedRoute component={WarRoomPage} />}</Route>

      <Route path="/settings">{() => <ProtectedRoute component={SettingsPage} allowedRoles={["admin"]} />}</Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppLifecycleEffects />
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
