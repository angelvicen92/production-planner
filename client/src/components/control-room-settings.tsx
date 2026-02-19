import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useControlRoomSettings, useUpdateControlRoomSettings, type ControlRoomSettings } from "@/hooks/use-control-room-settings";

export function ControlRoomSettingsCard() {
  const { data, isLoading } = useControlRoomSettings();
  const update = useUpdateControlRoomSettings();
  const [draft, setDraft] = useState<ControlRoomSettings | null>(null);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  if (isLoading || !draft) {
    return <Card><CardHeader><CardTitle>Control Room</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Cargando…</CardContent></Card>;
  }

  const clamp = (value: number, max: number) => Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0));

  return (
    <Card>
      <CardHeader><CardTitle>Control Room</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-3 gap-3">
          <div><Label>Idle inesperado (min)</Label><Input type="number" min={0} max={180} value={draft.idleUnexpectedThresholdMin} onChange={(e) => setDraft((p) => p ? { ...p, idleUnexpectedThresholdMin: clamp(Number(e.target.value), 180) } : p)} /></div>
          <div><Label>Retraso (min)</Label><Input type="number" min={0} max={240} value={draft.delayThresholdMin} onChange={(e) => setDraft((p) => p ? { ...p, delayThresholdMin: clamp(Number(e.target.value), 240) } : p)} /></div>
          <div><Label>Próxima en breve (min)</Label><Input type="number" min={0} max={240} value={draft.nextSoonThresholdMin} onChange={(e) => setDraft((p) => p ? { ...p, nextSoonThresholdMin: clamp(Number(e.target.value), 240) } : p)} /></div>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <div className="flex items-center justify-between border rounded p-2"><Label>Activar idle</Label><Switch checked={draft.enableIdleAlert} onCheckedChange={(v) => setDraft((p) => p ? { ...p, enableIdleAlert: v } : p)} /></div>
          <div className="flex items-center justify-between border rounded p-2"><Label>Activar retraso</Label><Switch checked={draft.enableDelayAlert} onCheckedChange={(v) => setDraft((p) => p ? { ...p, enableDelayAlert: v } : p)} /></div>
          <div className="flex items-center justify-between border rounded p-2"><Label>Activar próxima</Label><Switch checked={draft.enableNextSoonAlert} onCheckedChange={(v) => setDraft((p) => p ? { ...p, enableNextSoonAlert: v } : p)} /></div>
        </div>
        <Button onClick={() => update.mutate(draft)} disabled={update.isPending}>Guardar Control Room</Button>
      </CardContent>
    </Card>
  );
}
