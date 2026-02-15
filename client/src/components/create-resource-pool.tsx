import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type ResourceTypeLite = {
  id: number;
  code: string;
  name: string;
};

export function CreateResourceType({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/resource-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.message || "Error creando tipo");
      }

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
}: {
  types: ResourceTypeLite[];
  onCreated: () => void;
}) {
  const [typeId, setTypeId] = useState<string>("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    try {
      setLoading(true);
      setError(null);

      const parsedTypeId = Number(typeId);
      const res = await fetch("/api/resource-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typeId: parsedTypeId, name }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.message || "Error creando unidad");
      }

      setName("");
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

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button onClick={submit} disabled={loading || !typeId || !name || types.length === 0}>
        Crear unidad
      </Button>
    </Card>
  );
}
