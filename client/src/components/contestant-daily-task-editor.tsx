import React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type DraftTask = {
  id: number;
  startPlanned: string;
  endPlanned: string;
  durationOverride: string;
  comment1Text: string;
  comment1Color: string;
  comment2Text: string;
  comment2Color: string;
  zoneId: number | null;
  spaceId: number | null;
};

function parseHHMMToMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function minutesToHHMM(totalMinutes: number): string {
  const normalized = Math.max(0, Math.round(totalMinutes));
  const hh = Math.floor(normalized / 60) % 24;
  const mm = normalized % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export const ContestantDailyTaskEditor = React.memo(function ContestantDailyTaskEditor(props: {
  task: any;
  variant: "list" | "detail";
  draft: DraftTask;
  locked: boolean;
  zones: any;
  spaces: any;
  onChangeDraft: (updater: (prev: DraftTask) => DraftTask) => void;
  onDelete: () => Promise<void> | void;
  onChangeStatus: (next: string) => void;
}) {
  const {
    task,
    variant,
    draft,
    locked,
    zones,
    spaces,
    onChangeDraft,
    onDelete,
    onChangeStatus,
  } = props;

  const safeZones = Array.isArray(zones) ? zones : [];
  const safeSpaces = Array.isArray(spaces) ? spaces : [];
  const zoneId = Number.isFinite(Number(draft.zoneId)) ? Number(draft.zoneId) : null;
  const spacesForZone = safeSpaces.filter((s: any) => Number(s.zoneId ?? s.zone_id) === zoneId);

  const handleDurationChange = (value: string) => {
    onChangeDraft((prev) => {
      const next: DraftTask = { ...prev, durationOverride: value };
      const startMin = parseHHMMToMinutes(prev.startPlanned.trim());
      const duration = Number(value);
      if (startMin !== null && Number.isFinite(duration) && duration > 0) {
        next.endPlanned = minutesToHHMM(startMin + Math.round(duration));
      }
      return next;
    });
  };

  if (variant === "list") {
    return (
      <div className="grid grid-cols-11 gap-2 items-center rounded-md border px-2 py-2">
        <div className="font-medium text-sm truncate">{task.template?.name || `Template #${task.templateId}`}</div>
        <Input
          type="time"
          step={60}
          className="h-8"
          value={draft.startPlanned}
          onChange={(e) => onChangeDraft((prev) => ({ ...prev, startPlanned: e.target.value }))}
          disabled={locked}
        />
        <Input
          type="time"
          step={60}
          className="h-8"
          value={draft.endPlanned}
          onChange={(e) => onChangeDraft((prev) => ({ ...prev, endPlanned: e.target.value }))}
          disabled={locked}
        />
        <div>
          {locked ? <span className="text-xs text-muted-foreground">Locked</span> : (
            <Input
              type="number"
              className="h-8"
              value={draft.durationOverride}
              placeholder="min"
              onChange={(e) => handleDurationChange(e.target.value)}
            />
          )}
        </div>
        <Select
          value={draft.zoneId === null ? "none" : String(draft.zoneId)}
          onValueChange={(value) => {
            if (value === "none") {
              onChangeDraft((prev) => ({ ...prev, zoneId: null, spaceId: null }));
              return;
            }
            onChangeDraft((prev) => {
              const nextZoneId = Number(value);
              const keepsSpace = Number(prev.spaceId) > 0 && safeSpaces.some((s: any) => Number(s.id) === Number(prev.spaceId) && Number(s.zoneId ?? s.zone_id) === nextZoneId);
              return { ...prev, zoneId: nextZoneId, spaceId: keepsSpace ? prev.spaceId : null };
            });
          }}
          disabled={locked}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Plató" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">(sin plató)</SelectItem>
            {safeZones.map((z: any) => (
              <SelectItem key={z.id} value={String(z.id)}>{z.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={draft.spaceId === null ? "none" : String(draft.spaceId)}
          onValueChange={(value) => {
            if (value === "none") {
              onChangeDraft((prev) => ({ ...prev, spaceId: null }));
              return;
            }
            const nextSpaceId = Number(value);
            const selectedSpace = safeSpaces.find((s: any) => Number(s.id) === nextSpaceId);
            const nextZoneId = selectedSpace ? Number(selectedSpace.zoneId ?? selectedSpace.zone_id) : null;
            onChangeDraft((prev) => ({ ...prev, spaceId: nextSpaceId, zoneId: Number.isFinite(nextZoneId) ? nextZoneId : prev.zoneId }));
          }}
          disabled={locked || zoneId === null}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Espacio" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">(sin espacio)</SelectItem>
            {spacesForZone.map((sp: any) => (
              <SelectItem key={sp.id} value={String(sp.id)}>{sp.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="h-8 text-xs"
          value={draft.comment1Text}
          placeholder="Comentario 1"
          onChange={(e) => onChangeDraft((prev) => ({ ...prev, comment1Text: e.target.value }))}
          disabled={locked}
        />
        <Input
          className="h-8 text-xs"
          value={draft.comment1Color}
          placeholder="#RRGGBB"
          onChange={(e) => onChangeDraft((prev) => ({ ...prev, comment1Color: e.target.value }))}
          disabled={locked}
        />
        <Input
          className="h-8 text-xs"
          value={draft.comment2Text}
          placeholder="Comentario 2"
          onChange={(e) => onChangeDraft((prev) => ({ ...prev, comment2Text: e.target.value }))}
          disabled={locked}
        />
        <Input
          className="h-8 text-xs"
          value={draft.comment2Color}
          placeholder="#RRGGBB"
          onChange={(e) => onChangeDraft((prev) => ({ ...prev, comment2Color: e.target.value }))}
          disabled={locked}
        />
        <div className="flex items-center gap-2 justify-between">
          <Select value={task.status || "pending"} onValueChange={onChangeStatus}>
            <SelectTrigger className="h-8 w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">pending</SelectItem>
              <SelectItem value="in_progress">in_progress</SelectItem>
              <SelectItem value="done">done</SelectItem>
              <SelectItem value="interrupted">interrupted</SelectItem>
              <SelectItem value="cancelled">cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive"
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              await onDelete();
            }}
            aria-label="Eliminar tarea"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Inicio plan</Label><Input type="time" step={60} className="mt-1" value={draft.startPlanned} onChange={(e) => onChangeDraft((prev) => ({ ...prev, startPlanned: e.target.value }))} disabled={locked} /></div>
        <div><Label>Fin plan</Label><Input type="time" step={60} className="mt-1" value={draft.endPlanned} onChange={(e) => onChangeDraft((prev) => ({ ...prev, endPlanned: e.target.value }))} disabled={locked} /></div>
        <div>
          <Label>Plató</Label>
          <Select
            value={draft.zoneId === null ? "none" : String(draft.zoneId)}
            onValueChange={(value) => {
              if (value === "none") {
                onChangeDraft((prev) => ({ ...prev, zoneId: null, spaceId: null }));
                return;
              }
              onChangeDraft((prev) => {
                const nextZoneId = Number(value);
                const keepsSpace = Number(prev.spaceId) > 0 && safeSpaces.some((s: any) => Number(s.id) === Number(prev.spaceId) && Number(s.zoneId ?? s.zone_id) === nextZoneId);
                return { ...prev, zoneId: nextZoneId, spaceId: keepsSpace ? prev.spaceId : null };
              });
            }}
            disabled={locked}
          >
            <SelectTrigger className="mt-1"><SelectValue placeholder="Plató" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">(sin plató)</SelectItem>
              {safeZones.map((z: any) => (
                <SelectItem key={z.id} value={String(z.id)}>{z.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Espacio</Label>
          <Select
            value={draft.spaceId === null ? "none" : String(draft.spaceId)}
            onValueChange={(value) => {
              if (value === "none") {
                onChangeDraft((prev) => ({ ...prev, spaceId: null }));
                return;
              }
              const nextSpaceId = Number(value);
              const selectedSpace = safeSpaces.find((s: any) => Number(s.id) === nextSpaceId);
              const nextZoneId = selectedSpace ? Number(selectedSpace.zoneId ?? selectedSpace.zone_id) : null;
              onChangeDraft((prev) => ({ ...prev, spaceId: nextSpaceId, zoneId: Number.isFinite(nextZoneId) ? nextZoneId : prev.zoneId }));
            }}
            disabled={locked || zoneId === null}
          >
            <SelectTrigger className="mt-1"><SelectValue placeholder="Espacio" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">(sin espacio)</SelectItem>
              {spacesForZone.map((sp: any) => (
                <SelectItem key={sp.id} value={String(sp.id)}>{sp.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Estado</Label><div className="text-sm">{task.status || "pending"}</div></div>
        <div><Label>Recursos</Label><div className="text-sm">{Array.isArray(task.assignedResources) ? task.assignedResources.length : 0}</div></div>
      </div>
      <div>
        <Label>Duración (min)</Label>
        {locked ? <div className="text-xs text-muted-foreground pt-2">Locked</div> : (
          <Input type="number" value={draft.durationOverride} className="mt-2" onChange={(e) => handleDurationChange(e.target.value)} />
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Comentario 1</Label>
          <Input value={draft.comment1Text} onChange={(e) => onChangeDraft((prev) => ({ ...prev, comment1Text: e.target.value }))} disabled={locked} />
          <Input value={draft.comment1Color} placeholder="#RRGGBB" onChange={(e) => onChangeDraft((prev) => ({ ...prev, comment1Color: e.target.value }))} disabled={locked} />
        </div>
        <div className="space-y-2">
          <Label>Comentario 2</Label>
          <Input value={draft.comment2Text} onChange={(e) => onChangeDraft((prev) => ({ ...prev, comment2Text: e.target.value }))} disabled={locked} />
          <Input value={draft.comment2Color} placeholder="#RRGGBB" onChange={(e) => onChangeDraft((prev) => ({ ...prev, comment2Color: e.target.value }))} disabled={locked} />
        </div>
      </div>
    </div>
  );
});
