import { useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { usePlans } from "@/hooks/use-plans";
import { usePlanOpsData } from "@/hooks/usePlanOpsData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type Incident = {
  id: string;
  timestamp: string;
  type: "Interrupción" | "Decisión" | "Cambio" | "Riesgo" | "Nota";
  severity: "info" | "warn" | "critical";
  text: string;
  zoneId: number | null;
  spaceId: number | null;
  taskId: number | null;
  resolved: boolean;
};

export default function WarRoomPage() {
  const { data: plans = [] } = usePlans();
  const [planId, setPlanId] = useState<string>("");
  const selected = useMemo(() => plans.find((p) => String(p.id) === planId) || plans[0] || null, [plans, planId]);
  const { data } = usePlanOpsData(selected?.id);
  const [mode, setMode] = useState<"live" | "summary">("live");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<Incident>>({ type: "Nota", severity: "info", text: "" });

  const key = `war-room-${selected?.id || "none"}`;
  const incidents = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]") as Incident[];
    } catch {
      return [];
    }
  }, [key, open, mode]);

  const save = (next: Incident[]) => localStorage.setItem(key, JSON.stringify(next));
  const add = () => {
    if (!draft.text?.trim()) return;
    save([{ id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: (draft.type as any) || "Nota", severity: (draft.severity as any) || "info", text: draft.text!, zoneId: Number(draft.zoneId) || null, spaceId: Number(draft.spaceId) || null, taskId: Number(draft.taskId) || null, resolved: false }, ...incidents]);
    setDraft({ type: "Nota", severity: "info", text: "" });
    setOpen(false);
  };

  const counters = {
    open: incidents.filter((i) => !i.resolved).length,
    critical: incidents.filter((i) => i.severity === "critical" && !i.resolved).length,
    resolved: incidents.filter((i) => i.resolved).length,
  };

  const summary = incidents.map((i) => `[${new Date(i.timestamp).toLocaleTimeString()}] ${i.type} (${i.severity}) ${i.resolved ? "[RESUELTA]" : "[ABIERTA]"}: ${i.text}`).join("\n");

  return (
    <Layout>
      <div className="space-y-4">
        <div className="no-print rounded-lg border bg-card p-4">
          <div className="flex flex-wrap gap-2 items-center">
            <h1 className="mr-auto text-2xl font-bold">War Room</h1>
            <Select value={selected ? String(selected.id) : undefined} onValueChange={setPlanId}>
              <SelectTrigger className="w-[260px]"><SelectValue placeholder="Seleccionar plan" /></SelectTrigger>
              <SelectContent>{plans.map((p) => <SelectItem key={p.id} value={String(p.id)}>{(p as any).name || `Plan ${p.id}`}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant={mode === "live" ? "default" : "outline"} onClick={() => setMode("live")}>En vivo</Button>
            <Button variant={mode === "summary" ? "default" : "outline"} onClick={() => setMode("summary")}>Resumen</Button>
            <Button onClick={() => setOpen(true)}>Añadir incidencia</Button>
            <Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(summary); } catch {} }}>Copiar resumen</Button>
            <Button variant="outline" onClick={() => window.print()}>Imprimir parte</Button>
            <Button onClick={() => window.print()}>Exportar PDF</Button>
          </div>
        </div>

        <div className="print-only print-footer">{(selected as any)?.name || "Sin plan"} · {String(selected?.date || "").slice(0, 10)}</div>

        <div className="grid gap-3 md:grid-cols-3 print-block">
          <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">Abiertas</div><div className="text-xl font-bold">{counters.open}</div></div>
          <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">Críticas</div><div className="text-xl font-bold">{counters.critical}</div></div>
          <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">Resueltas</div><div className="text-xl font-bold">{counters.resolved}</div></div>
        </div>

        <section className="rounded-lg border bg-card p-4 print-block">
          <h2 className="mb-2 font-semibold">Timeline</h2>
          {incidents.length === 0 ? <div className="text-sm text-muted-foreground">Sin incidencias registradas.</div> : incidents.map((i) => (
            <div key={i.id} className="mb-2 rounded border p-2 text-sm">
              <div className="flex items-center gap-2"><Badge variant={i.severity === "critical" ? "destructive" : "secondary"}>{i.type}</Badge><Badge variant="outline">{i.severity}</Badge><span className="text-muted-foreground">{new Date(i.timestamp).toLocaleTimeString()}</span></div>
              <div className="my-1">{i.text}</div>
              <div className="text-xs text-muted-foreground">{i.resolved ? "Resuelta" : "Abierta"}</div>
              <Button className="no-print mt-1" size="sm" variant="outline" onClick={() => save(incidents.map((it) => it.id === i.id ? { ...it, resolved: !it.resolved } : it))}>Marcar resuelto</Button>
            </div>
          ))}
        </section>

        <section className="rounded-lg border bg-card p-4 print-block">
          <h2 className="mb-2 font-semibold">Señales del sistema</h2>
          <div className="text-sm">Locks totales: {data.locks.length}</div>
          <div className="text-sm">Tareas próximas sin ubicación: {(data.tasks || []).filter((t: any) => !t?.zoneId && !t?.spaceId).length}</div>
        </section>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Añadir incidencia</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <Select value={draft.type} onValueChange={(v) => setDraft((d) => ({ ...d, type: v as Incident["type"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["Interrupción", "Decisión", "Cambio", "Riesgo", "Nota"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={draft.severity} onValueChange={(v) => setDraft((d) => ({ ...d, severity: v as Incident["severity"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["info", "warn", "critical"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
              <Textarea placeholder="Detalle de incidencia" value={draft.text || ""} onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={add}>Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
