import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Minimize2, Maximize2, Scan } from "lucide-react";
import { cn } from "@/lib/utils";
import { clampZoom, zoomAxes } from "@/lib/planning-workspace-geometry";

import { PlanningFullscreenContext, usePlanningFullscreen } from "./planning-fullscreen";

type DensityMode = "normal" | "pdf";
type Geometry = { zoomX: number; zoomY: number; frame: "day" | "tasks"; fitRequest: number; setZoom: (x: number, y: number) => void };
const PlanningGeometryContext = createContext<Geometry>({ zoomX: 100, zoomY: 100, frame: "day", fitRequest: 0, setZoom: () => {} });
export const usePlanningGeometry = () => useContext(PlanningGeometryContext);
export const PlanningDensityContext = createContext<DensityMode>("normal");
export const usePlanningDensity = () => useContext(PlanningDensityContext);

function readSettings(viewKey: string) {
  try {
    const saved = JSON.parse(localStorage.getItem(`${viewKey}:geometry`) ?? "null");
    const legacyZoom = Number(localStorage.getItem(`${viewKey}:zoom`) ?? 100);
    return { zoomX: clampZoom(saved?.zoomX ?? legacyZoom), zoomY: clampZoom(saved?.zoomY ?? legacyZoom), frame: saved?.frame === "tasks" ? "tasks" as const : "day" as const, axis: ["x", "y", "linked"].includes(saved?.axis) ? saved.axis as "x" | "y" | "linked" : "linked" as const };
  } catch { return { zoomX: 100, zoomY: 100, frame: "day" as const, axis: "linked" as const }; }
}

export function FullscreenPlanningPanel({ title, viewKey, supportsZoom = false, children, toolbarRight, hydrationBlocked = false, fitOnceRequest = 0 }: {
  title?: string; viewKey: string; supportsZoom?: boolean; children: ReactNode; toolbarRight?: ReactNode; hydrationBlocked?: boolean; fitOnceRequest?: number;
}) {
  const [localFullscreen, setLocalFullscreen] = useState(false);
  const fullscreen = useContext(PlanningFullscreenContext);
  const isFullscreen = fullscreen ? fullscreen.activePanel === viewKey : localFullscreen;
  const exitFullscreen = useCallback(() => setLocalFullscreen(false), []);
  usePlanningFullscreen(!fullscreen && localFullscreen, exitFullscreen);
  const [density, setDensity] = useState<DensityMode>(() => {
    try { return localStorage.getItem(`${viewKey}:density`) === "pdf" ? "pdf" : "normal"; } catch { return "normal"; }
  });
  const [settings, setSettings] = useState(() => readSettings(viewKey));
  const [fitRequest, setFitRequest] = useState(0);
  const [presentationFit, setPresentationFit] = useState<{zoomX:number;zoomY:number}|null>(null);
  const [awaitingAutoFit, setAwaitingAutoFit] = useState(false);
  const visibleSettings = presentationFit ? {...settings,...presentationFit}:settings;
  useEffect(() => {
    if (fitOnceRequest) { setPresentationFit(null); setAwaitingAutoFit(true); setFitRequest(old => old + 1); }
    else { setPresentationFit(null); setAwaitingAutoFit(false); setFitRequest(0); }
  }, [fitOnceRequest]);
  useEffect(() => {
    try {
      localStorage.setItem(`${viewKey}:density`, density);
      localStorage.setItem(`${viewKey}:geometry`, JSON.stringify(settings));
    } catch { /* Local preferences must not block planning. */ }
  }, [viewKey, density, settings]);
  const changeZoom = (factor: number) => { setFitRequest(0); setAwaitingAutoFit(false); setPresentationFit(null); setSettings(old => ({ ...old, ...zoomAxes(visibleSettings.zoomX, visibleSettings.zoomY, old.axis, factor) })); };
  return (
    <PlanningDensityContext.Provider value={density}>
      <PlanningGeometryContext.Provider value={{ ...visibleSettings, fitRequest, setZoom: (x, y) => {
        if (awaitingAutoFit) { setPresentationFit({zoomX:clampZoom(x),zoomY:clampZoom(y)}); setAwaitingAutoFit(false); setFitRequest(0); }
        else { setPresentationFit(null); setSettings(old => Math.abs(old.zoomX - clampZoom(x)) < .01 && Math.abs(old.zoomY - clampZoom(y)) < .01 ? old : ({ ...old, zoomX: clampZoom(x), zoomY: clampZoom(y) })); }
      } }}>
        <div className={cn("planning-panel flex min-h-0 min-w-0 flex-col", isFullscreen && "fixed inset-0 z-[100] bg-background p-2 sm:p-4")}
          data-density={density} data-fullscreen={isFullscreen} data-zoom-x={visibleSettings.zoomX} data-zoom-y={visibleSettings.zoomY}>
          <div className="planning-panel-toolbar mb-2 flex shrink-0 flex-col gap-2 rounded-lg border bg-card px-2 py-2">
            <div className="flex flex-wrap items-center justify-between gap-1">
              {title ? <p className="text-sm font-semibold">{title}</p> : null}
              <div className="flex flex-wrap items-center gap-1">{toolbarRight}
                <Button variant="ghost" size="sm" onClick={() => fullscreen ? fullscreen.setActivePanel(isFullscreen ? null : viewKey) : setLocalFullscreen(old => !old)}>
                  {isFullscreen ? <Minimize2 className="mr-1 h-4 w-4" /> : <Maximize2 className="mr-1 h-4 w-4" />}
                  {isFullscreen ? "Salir (Esc)" : "Maximizar"}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <select aria-label="Densidad" className="h-8 rounded border bg-background px-1" value={density} disabled={hydrationBlocked} onChange={event => setDensity(event.target.value as DensityMode)}>
                <option value="normal">Normal</option><option value="pdf">PDF</option>
              </select>
              {supportsZoom ? <>
                <select aria-label="Encuadre" className="h-8 min-w-0 rounded border bg-background px-1" value={settings.frame} onChange={event => setSettings(old => ({ ...old, frame: event.target.value as "day" | "tasks" }))}>
                  <option value="day">Jornada completa</option><option value="tasks">Tareas representadas</option>
                </select>
                <select aria-label="Eje del zoom" className="h-8 rounded border bg-background px-1" value={settings.axis} onChange={event => setSettings(old => ({ ...old, axis: event.target.value as "x" | "y" | "linked" }))}>
                  <option value="linked">Vinculado</option><option value="x">Zoom X</option><option value="y">Zoom Y</option>
                </select>
                <Button size="icon" className="h-8 w-8" variant="ghost" aria-label="Reducir zoom" onClick={() => changeZoom(1 / 1.1)}><Minus className="h-3 w-3" /></Button>
                <Button size="sm" className="h-8 px-1 text-xs tabular-nums" variant="ghost" aria-label="Restaurar zoom al 100%" onClick={() => { setFitRequest(0); setAwaitingAutoFit(false); setPresentationFit(null); setSettings(old => ({ ...old, zoomX: 100, zoomY: 100 })); }}>
                  {Math.round(visibleSettings.zoomX)}% × {Math.round(visibleSettings.zoomY)}%
                </Button>
                <Button size="icon" className="h-8 w-8" variant="ghost" aria-label="Ampliar zoom" onClick={() => changeZoom(1.1)}><Plus className="h-3 w-3" /></Button>
                <Button size="sm" className="h-8 px-2" variant="outline" onClick={() => setFitRequest(old => old + 1)}><Scan className="mr-1 h-3 w-3" />Ajustar</Button>
              </> : null}
            </div>
          </div>
          <div className="planning-panel-content relative flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
      </PlanningGeometryContext.Provider>
    </PlanningDensityContext.Provider>
  );
}
