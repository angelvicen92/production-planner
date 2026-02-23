import { createContext, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Minus, Plus, Minimize2, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

type DensityMode = "normal" | "pdf";

interface FullscreenPlanningPanelProps {
  title?: string;
  viewKey: string;
  supportsZoom?: boolean;
  children: ReactNode;
  toolbarRight?: ReactNode;
}

const memoryState = new Map<string, { isFullscreen: boolean; density: DensityMode; zoom: number }>();
const ZOOM_MIN = 70;
const ZOOM_MAX = 160;
const ZOOM_STEP = 10;

const getStoredDensity = (): DensityMode => {
  if (typeof window === "undefined") return "normal";
  const raw = localStorage.getItem("planning-density");
  if (raw === "compact") {
    localStorage.setItem("planning-density", "normal");
    return "normal";
  }
  if (raw === "pdf") return "pdf";
  return "normal";
};

export const PlanningDensityContext = createContext<DensityMode>("normal");

export function usePlanningDensity(): DensityMode {
  return useContext(PlanningDensityContext);
}

const getStoredZoom = () => {
  if (typeof window === "undefined") return 100;
  const parsed = Number(localStorage.getItem("planning-zoom"));
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(parsed / ZOOM_STEP) * ZOOM_STEP));
};

export function FullscreenPlanningPanel({
  title,
  viewKey,
  supportsZoom = false,
  children,
  toolbarRight,
}: FullscreenPlanningPanelProps) {
  const initialState = useMemo(() => {
    const cached = memoryState.get(viewKey);
    if (cached) return cached;
    return {
      isFullscreen: false,
      density: getStoredDensity(),
      zoom: getStoredZoom(),
    };
  }, [viewKey]);

  const [isFullscreen, setIsFullscreen] = useState(initialState.isFullscreen);
  const [density, setDensity] = useState<DensityMode>(initialState.density);
  const [zoom, setZoom] = useState(initialState.zoom);

  useEffect(() => {
    memoryState.set(viewKey, { isFullscreen, density, zoom });
  }, [viewKey, isFullscreen, density, zoom]);

  useEffect(() => {
    localStorage.setItem("planning-density", density);
  }, [density]);

  useEffect(() => {
    localStorage.setItem("planning-zoom", String(zoom));
  }, [zoom]);

  useEffect(() => {
    if (!isFullscreen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const hasOpenDialog = Boolean(document.querySelector('[role="dialog"][data-state="open"]'));
      if (hasOpenDialog) return;
      event.preventDefault();
      setIsFullscreen(false);
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullscreen]);

  const zoomFactor = zoom / 100;

  return (
    <TooltipProvider>
      <PlanningDensityContext.Provider value={density}>
      <div
      className={cn(
        "planning-panel flex min-h-0 flex-col",
        isFullscreen && "fixed inset-0 z-[100] bg-background p-4",
      )}
      data-density={density}
      data-planning-zoom-enabled={supportsZoom ? "true" : "false"}
      style={{ ["--planning-zoom" as string]: zoomFactor } as CSSProperties}
    >
      <div className="sticky top-0 z-20 mb-3 flex items-center justify-between gap-3 rounded-lg border bg-card/95 px-3 py-2 backdrop-blur">
        <div className="min-w-0">
          {title ? <p className="truncate text-sm font-semibold">{title}</p> : null}
        </div>

        <div className="flex items-center gap-2">
          {toolbarRight}

          <div className="flex items-center gap-1 rounded-md border p-1">
            <Button variant={density === "normal" ? "default" : "ghost"} size="sm" onClick={() => setDensity("normal")}>Normal</Button>
            <Button variant={density === "pdf" ? "default" : "ghost"} size="sm" onClick={() => setDensity("pdf")}>PDF</Button>
          </div>

          <div className="flex items-center gap-1 rounded-md border px-1 py-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button size="icon" variant="ghost" disabled={!supportsZoom} onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))}>
                    <Minus className="h-4 w-4" />
                  </Button>
                </span>
              </TooltipTrigger>
              {!supportsZoom ? <TooltipContent>No disponible en esta vista</TooltipContent> : null}
            </Tooltip>
            <Button size="sm" variant="ghost" disabled={!supportsZoom} onClick={() => setZoom(100)}>{zoom}%</Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button size="icon" variant="ghost" disabled={!supportsZoom} onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </span>
              </TooltipTrigger>
              {!supportsZoom ? <TooltipContent>No disponible en esta vista</TooltipContent> : null}
            </Tooltip>
          </div>

          {isFullscreen ? (
            <Button variant="outline" size="sm" onClick={() => setIsFullscreen(false)}>
              <Minimize2 className="mr-2 h-4 w-4" /> Salir (Esc)
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setIsFullscreen(true)}>
              <Maximize2 className="mr-2 h-4 w-4" /> Maximizar
            </Button>
          )}
        </div>
      </div>

      <div className="planning-panel-content min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
      </PlanningDensityContext.Provider>
    </TooltipProvider>
  );
}
