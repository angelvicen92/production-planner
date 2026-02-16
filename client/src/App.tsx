import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useUserRole, type AppRole } from "@/hooks/use-user-role";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { AccessDenied } from "@/components/access-denied";

import LoginPage from "@/pages/login";
import PlansPage from "@/pages/plans";
import DashboardPage from "@/pages/dashboard";
import PlanDetailsPage from "@/pages/plan-details";
import TimelinePage from "@/pages/timeline";
import SettingsPage from "@/pages/settings";
import NotFound from "@/pages/not-found";

function FullScreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function ProtectedRoute({ component: Component, allowedRoles }: any) {
  const { user, isLoading } = useAuth();
  const { role, isLoading: roleLoading } = useUserRole(Boolean(user));
  const { toast } = useToast();

  const hasRoleRestriction = Array.isArray(allowedRoles) && allowedRoles.length > 0;
  const isAuthorized = !hasRoleRestriction || (!!role && allowedRoles.includes(role));

  useEffect(() => {
    if (!isLoading && !roleLoading && user && hasRoleRestriction && !isAuthorized) {
      toast({ title: "Acceso denegado", description: "No tienes permisos para esta acción." });
    }
  }, [isLoading, roleLoading, user, hasRoleRestriction, isAuthorized, toast]);

  if (isLoading) {
    return <FullScreenLoader />;
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (roleLoading) {
    return <FullScreenLoader />;
  }

  if (!isAuthorized) {
    return (
      <div className="space-y-4">
        <AccessDenied />
        <Redirect to="/dashboard" />
      </div>
    );
  }

  return <Component />;
}

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <FullScreenLoader />;
  }

  return (
    <Switch>
      <Route path="/login" component={LoginPage} />

      <Route path="/">
        {user ? <Redirect to="/dashboard" /> : <Redirect to="/login" />}
      </Route>

      <Route path="/dashboard">{() => <ProtectedRoute component={DashboardPage} />}</Route>

      <Route path="/plans">{() => <ProtectedRoute component={PlansPage} />}</Route>

      <Route path="/plans/:id">{() => <ProtectedRoute component={PlanDetailsPage} />}</Route>

      <Route path="/timeline">{() => <ProtectedRoute component={TimelinePage} />}</Route>

      <Route path="/settings">
        {() => <ProtectedRoute component={SettingsPage} allowedRoles={["admin"] as AppRole[]} />}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
