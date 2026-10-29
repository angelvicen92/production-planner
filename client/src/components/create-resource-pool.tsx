import { ResourceAvailabilityFields, fullResourceWorkday, type ResourceWindow } from "./resource-availability-editor";
import { resourceAvailabilityWindowSchema } from "@shared/routes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/api";

export type ResourceTypeLite = {
  id: number;
  code: string;
  name: string;
};

type CreationStatus = { busy: boolean; error: string | null };

export function CreateResourceType({ onCreated, onStatusChange }: { onCreated: () => void; onStatusChange?: (status: CreationStatus) => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { onStatusChange?.({ busy: loading, error }); }, [loading, error, onStatusChange]);

  async function submit() {
    try {
      setLoading(true);
      setError(null);

      await apiRequest("POST", "/api/resource-types", { name, code });

      setName("");
      setCode("");
      onCreated();
    } catch (e: any) {
      setError(e?.message || "Error creando tipo");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="font-medium">Añadir tipo (grupo)</div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Nombre</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cámara" />
        </div>

        <div className="space-y-1">
          <Label>Código</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="camera" />
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button onClick={submit} disabled={loading || !name || !code}>
        Crear tipo
      </Button>
    </Card>
  );
}

export function CreateResourceItem({
  types,
  onCreated,
  onStatusChange,
}: {
  types: ResourceTypeLite[];
  onCreated: () => void;
  onStatusChange?: (status: CreationStatus) => void;
}) {
  const [window, setWindow] = useState<ResourceWindow>(fullResourceWorkday);
  const [typeId, setTypeId] = useState<string>("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { onStatusChange?.({ busy: loading, error }); }, [loading, error, onStatusChange]);

  async function submit() {
    try {
      setLoading(true);
      setError(null);

      resourceAvailabilityWindowSchema.parse(window);
      const parsedTypeId = Number(typeId);
      await apiRequest("POST", "/api/resource-items", { typeId: parsedTypeId, name,
        defaultAvailabilityStart:window.availabilityStart, defaultAvailabilityEnd:window.availabilityEnd });

      setName("");
      setWindow(fullResourceWorkday);
      onCreated();
    } catch (e: any) {
      setError(e?.message || "Error creando unidad");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="font-medium">Añadir unidad (1 a 1)</div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Tipo</Label>
          <Select value={typeId} onValueChange={setTypeId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona tipo…" />
            </SelectTrigger>
            <SelectContent>
              {types.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {types.length === 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Primero crea un tipo (grupo).
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label>Nombre</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Cámara 1 / Eva / Lucía…"
          />
        </div>
      </div>

      <ResourceAvailabilityFields value={window} onChange={setWindow} disabled={loading} />
      <p className="text-xs text-muted-foreground">El catálogo inicializa futuras jornadas. Cada día conserva su snapshot.</p>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button onClick={submit} disabled={loading || !typeId || !name || types.length === 0}>
        Crear unidad
      </Button>
    </Card>
  );
}
