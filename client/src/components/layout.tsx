import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  CalendarDays, 
  GanttChartSquare,
  FileText,
  ShieldAlert,
  Monitor,
  Settings, 
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Pin,
  PinOff,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { HealthIndicator } from "@/components/health-indicator";
import { useAuth } from "@/hooks/use-auth";
import { useUserRole } from "@/hooks/use-user-role";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // ✅ Desktop: sidebar colapsable (se recuerda)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("opti_sidebar_collapsed") === "1";
    } catch {
      return false;
    }
  });

  const toggleSidebarCollapsed = () => {
    setIsSidebarCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem("opti_sidebar_collapsed", next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  const [isSidebarPinned, setIsSidebarPinned] = useState<boolean>(() => {
    try {
      return localStorage.getItem("opti_sidebar_pinned") === "1";
    } catch {
      return false;
    }
  });
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);

  const toggleSidebarPinned = () => {
    setIsSidebarPinned((v) => {
      const next = !v;
      try {
        localStorage.setItem("opti_sidebar_pinned", next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  const effectiveCollapsed =
    isSidebarCollapsed && (isSidebarPinned || !isSidebarHovered);

  const [location] = useLocation();
  const { signOut, user } = useAuth();
  const { role } = useUserRole(Boolean(user));

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Plans", href: "/plans", icon: CalendarDays },
    { name: "Timeline", href: "/timeline", icon: GanttChartSquare },
    { name: "Call Sheet", href: "/call-sheet", icon: FileText },
    { name: "War Room", href: "/war-room", icon: ShieldAlert },
    { name: "Control Room", href: "/control-room", icon: Monitor },
    ...(role === "admin" ? [{ name: "Settings", href: "/settings", icon: Settings }] : []),
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Menu Button */}
      <div className="lg:hidden p-4 flex items-center justify-between bg-card border-b">
        <div className="font-bold text-xl text-primary">OptiPlan</div>
        <div className="flex items-center gap-2">
          <HealthIndicator />
          <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            {isMobileMenuOpen ? <X /> : <Menu />}
          </Button>
        </div>
      </div>

      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <aside
          onMouseEnter={() => {
            if (isSidebarCollapsed && !isSidebarPinned) setIsSidebarHovered(true);
          }}
          onMouseLeave={() => {
            if (isSidebarCollapsed && !isSidebarPinned) setIsSidebarHovered(false);
          }}
          className={cn(
            "fixed inset-y-0 left-0 z-50 bg-card border-r border-border transform transition-all duration-200 ease-in-out lg:relative lg:translate-x-0 flex flex-col",
            // móvil: siempre ancho completo
            "w-64",
            // desktop: colapsable
            effectiveCollapsed ? "lg:w-16" : "lg:w-64",
            isMobileMenuOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {/* Header */}
          <div className={cn("p-6", effectiveCollapsed ? "lg:px-2 lg:py-4" : "")}>
            <div className={cn("flex items-start justify-between gap-2", effectiveCollapsed ? "lg:justify-center" : "")}>
              {!effectiveCollapsed ? (
                <div>
                  <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-600">
                    OptiPlan
                  </h1>
                  <p className="text-xs text-muted-foreground mt-1">
                    Production Planning Engine
                  </p>
                </div>
              ) : (
                <div className="hidden lg:flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">
                  O
                </div>
              )}

              {!effectiveCollapsed ? <HealthIndicator /> : null}

              {/* Toggle (solo desktop) */}
              <div className="hidden lg:flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-pressed={isSidebarPinned}
                  onClick={toggleSidebarPinned}
                  title={isSidebarPinned ? "Desfijar (activar hover)" : "Fijar (desactivar hover)"}
                >
                  {isSidebarPinned ? <PinOff /> : <Pin />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleSidebarCollapsed}
                  title={isSidebarCollapsed ? "Expandir menú" : "Colapsar menú"}
                >
                  {isSidebarCollapsed ? <ChevronRight /> : <ChevronLeft />}
                </Button>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className={cn("flex-1 px-4 space-y-1", effectiveCollapsed ? "lg:px-2" : "")}>
            {navigation.map((item) => {
              const isActive =
                location === item.href ||
                (item.href !== "/" && location.startsWith(item.href));

              return (
                <Link key={item.name} href={item.href}>
                  <div
                    className={cn(
                      "flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors cursor-pointer group",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      effectiveCollapsed ? "lg:justify-center lg:px-0" : "",
                    )}
                    title={effectiveCollapsed ? item.name : undefined}
                  >
                    <item.icon
                      className={cn(
                        "h-5 w-5 transition-colors",
                        effectiveCollapsed ? "lg:mr-0" : "mr-3",
                        isActive
                          ? "text-primary"
                          : "text-muted-foreground group-hover:text-foreground",
                      )}
                    />
                    {!effectiveCollapsed && item.name}
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* Footer / user */}
          <div className={cn("p-4 border-t border-border", effectiveCollapsed ? "lg:px-2" : "")}>
            <div className={cn("flex items-center mb-4 px-2", effectiveCollapsed ? "lg:justify-center lg:px-0" : "")}>
              <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                {user?.email?.[0].toUpperCase() || "U"}
              </div>

              {!effectiveCollapsed && (
                <div className="flex-1 min-w-0 ml-3">
                  <p className="text-sm font-medium truncate">
                    {user?.email?.split("@")[0]}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
              )}
            </div>

            {!effectiveCollapsed ? (
              <Button
                variant="outline"
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                onClick={() => signOut()}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </Button>
            ) : (
              <Button
                variant="outline"
                size="icon"
                className="w-full justify-center text-muted-foreground hover:text-foreground"
                onClick={() => signOut()}
                title="Sign Out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>
        </aside>


        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-background p-4 md:p-8">
          <div className="max-w-7xl mx-auto animate-in fade-in duration-500 slide-in-from-bottom-4">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
