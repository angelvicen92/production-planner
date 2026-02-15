import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

import LoginPage from "@/pages/login";
import PlansPage from "@/pages/plans";
import DashboardPage from "@/pages/dashboard";
import PlanDetailsPage from "@/pages/plan-details";
import TimelinePage from "@/pages/timeline";
import SettingsPage from "@/pages/settings";
import NotFound from "@/pages/not-found";

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <Component {...rest} />;
}

function Router() {
  const { user, isLoading } = useAuth();

  // Handle initial auth loading globally
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      
      {/* Protected Routes */}
      <Route path="/">
        {user ? <Redirect to="/dashboard" /> : <Redirect to="/login" />}
      </Route>

      <Route path="/dashboard">
        {() => <ProtectedRoute component={DashboardPage} />}
      </Route>
      
      <Route path="/plans">
        {() => <ProtectedRoute component={PlansPage} />}
      </Route>
      
      <Route path="/plans/:id">
        {() => <ProtectedRoute component={PlanDetailsPage} />}
      </Route>

      <Route path="/timeline">
        {() => <ProtectedRoute component={TimelinePage} />}
      </Route>

      <Route path="/settings">
        {() => <ProtectedRoute component={SettingsPage} />}
      </Route>

      {/* Fallback */}
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
