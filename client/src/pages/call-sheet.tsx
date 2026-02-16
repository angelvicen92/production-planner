import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { usePlans } from "@/hooks/use-plans";
import { usePlanOpsData } from "@/hooks/usePlanOpsData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatRange, hhmmToMinutes, minutesToHHMM } from "@/lib/time";

const roles = ["Realización", "Producción", "Redacción", "Técnico", "Coach/Contenido"];

export default function CallSheetPage() {
  const { data: plans = [] } = usePlans();
  const [planId, setPlanId] = useState<string>("");
  const [role, setRole] = useState(roles[0]);
  const [compact, setCompact] = useState(false);
  const [printMode, setPrintMode] = useState(false);
  const [pdfHelpOpen, setPdfHelpOpen] = useState(false);
  const selected = useMemo(() => plans.find((p) => String(p.id) === planId) || plans[0] || null, [plans, planId]);
  const { data } = usePlanOpsData(selected?.id);

  const notesKey = `call-sheet-notes-${selected?.id || "none"}-${role}`;
  const [notes, setNotes] = useState("");
  useEffect(() => {
    try { setNotes(localStorage.getItem(notesKey) || ""); } catch { setNotes(""); }
  }, [notesKey]);
  useEffect(() => {
    try { localStorage.setItem(notesKey, notes); } catch {}
  }, [notesKey, notes]);

  const blocks = useMemo(() => {
    const items = [...(data.tasks || [])].sort((a: any, b: any) => (hhmmToMinutes(a?.startPlanned) ?? 9999) - (hhmmToMinutes(b?.startPlanned) ?? 9999));
    return {
      "Mañana": items.filter((t: any) => (hhmmToMinutes(t?.startPlanned) ?? 0) < 12 * 60),
      "Mediodía": items.filter((t: any) => {
        const m = hhmmToMinutes(t?.startPlanned) ?? 0;
        return m >= 12 * 60 && m < 16 * 60;
      }),
      "Tarde": items.filter((t: any) => (hhmmToMinutes(t?.startPlanned) ?? 0) >= 16 * 60),
    };
  }, [data.tasks]);

  const critical = useMemo(() => {
    const out: string[] = [];
    if ((data.tasks || []).some((t: any) => !t?.zoneId && !t?.spaceId)) out.push("Hay tareas sin ubicación");
    if ((data.tasks || []).some((t: any) => !t?.startPlanned || !t?.endPlanned)) out.push("Hay tareas sin horario completo");
    if ((data.locks || []).length > 8) out.push("Nivel alto de bloqueos");
    return out.slice(0, 3);
  }, [data]);

  const endMinute = Math.max(...(data.tasks || []).map((t: any) => hhmmToMinutes(t?.endPlanned) ?? 0), 0);

  return (
    <Layout>
      <div className={printMode ? "print-mode" : ""}>
        <div className="no-print sticky top-0 z-10 mb-4 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap gap-2 items-center">
            <h1 className="mr-auto text-2xl font-bold">Hoja del Día</h1>
            <Select value={selected ? String(selected.id) : undefined} onValueChange={setPlanId}>
              <SelectTrigger className="w-[260px]"><SelectValue placeholder="Seleccionar plan" /></SelectTrigger>
              <SelectContent>{plans.map((p) => <SelectItem key={p.id} value={String(p.id)}>{(p as any).name || `Plan ${p.id}`}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant={compact ? "default" : "outline"} onClick={() => setCompact((v) => !v)}>Compacto/Detallado</Button>
            <Button variant={printMode ? "default" : "outline"} onClick={() => setPrintMode((v) => !v)}>Modo impresión</Button>
            <Button onClick={() => window.print()}>Imprimir</Button>
            <Button variant="outline" onClick={() => {
              const dismissed = localStorage.getItem("callSheetPdfHelpDismissed") === "1";
              if (!dismissed) setPdfHelpOpen(true);
              else window.print();
            }}>Exportar PDF</Button>
          </div>
          <Tabs value={role} onValueChange={setRole} className="mt-3">
            <TabsList>{roles.map((r) => <TabsTrigger key={r} value={r}>{r}</TabsTrigger>)}</TabsList>
          </Tabs>
        </div>

        <div className="print-only print-footer">{(selected as any)?.name || "Sin plan"} · {String(selected?.date || "").slice(0, 10)} · Generado: {minutesToHHMM(new Date().getHours() * 60 + new Date().getMinutes())}</div>

        <section className="mb-4 rounded-lg border bg-card p-4 print-block">
          <h2 className="font-semibold">Cabecera de día</h2>
          <div className="text-sm text-muted-foreground">{String(selected?.date || "").slice(0, 10)} · {selected?.workStart || "--:--"}–{selected?.workEnd || "--:--"}</div>
          <div className="mt-2 text-sm">Hora prevista fin: <strong>{minutesToHHMM(endMinute)}</strong></div>
          <div className="mt-2 flex flex-wrap gap-1">{critical.length ? critical.map((c) => <Badge key={c} variant="destructive">{c}</Badge>) : <span className="text-sm text-muted-foreground">Sin alertas críticas</span>}</div>
        </section>

        {Object.entries(blocks).map(([label, items]) => (
          <section key={label} className={`mb-4 rounded-lg border bg-card p-4 print-block ${compact ? "text-sm" : ""}`}>
            <h3 className="mb-2 font-semibold">{label}</h3>
            {(items as any[]).length === 0 ? <div className="text-sm text-muted-foreground">Sin tareas</div> : (items as any[]).map((t: any) => (
              <div key={t.id} className="mb-2 rounded border p-2">
                <div className="font-medium">{t?.template?.name || "Tarea sin nombre"}</div>
                <div className="text-muted-foreground">{formatRange(t?.startPlanned, t?.endPlanned)} · {t?.locationLabel || "Ubicación por definir"}</div>
                <div className="mt-1 flex gap-1 flex-wrap">
                  <Badge variant="secondary">{Number(t?.camerasOverride ?? t?.template?.defaultCameras ?? 0)} cam</Badge>
                  {(!t?.zoneId && !t?.spaceId) && <Badge variant="outline">Sin ubicación</Badge>}
                </div>
              </div>
            ))}
          </section>
        ))}

        <section className="mb-4 rounded-lg border bg-card p-4 print-block">
          <h3 className="font-semibold mb-2">Personal y Asignaciones</h3>
          {(data.staffAssignments || []).length === 0 ? <div className="text-sm text-muted-foreground">No hay asignaciones</div> :
            (data.staffAssignments || []).map((a: any) => <div className="text-sm" key={a.id}>{a.staffPersonName || "Sin nombre"} · {a.staffRole} · {a.scopeType}</div>)}
        </section>

        <section className="rounded-lg border bg-card p-4 print-block">
          <h3 className="font-semibold mb-2">Riesgos y notas operativas</h3>
          <ul className="list-disc pl-5 text-sm mb-3">
            {critical.map((c) => <li key={c}>{c}</li>)}
          </ul>
          <Textarea className="no-print" placeholder="Notas por rol (autosave local)..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="print-only text-sm whitespace-pre-wrap">{notes}</div>
        </section>

        <Dialog open={pdfHelpOpen} onOpenChange={setPdfHelpOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Exportar a PDF</DialogTitle>
              <DialogDescription>
                En el diálogo de impresión selecciona “Guardar como PDF”. Activa gráficos de fondo si quieres mantener chips y colores. Tamaño A4 y escala ajustar.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPdfHelpOpen(false)}>Cerrar</Button>
              <Button onClick={() => { localStorage.setItem("callSheetPdfHelpDismissed", "1"); setPdfHelpOpen(false); window.print(); }}>No volver a mostrar e imprimir</Button>
              <Button onClick={() => { setPdfHelpOpen(false); window.print(); }}>Continuar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
