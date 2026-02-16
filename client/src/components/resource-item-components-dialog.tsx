import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/api";

type ItemOption = { id: number; name: string };

type ComponentRow = {
  componentId: number | null;
  quantity: number;
};

export function ResourceItemComponentsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentItem: ItemOption | null;
  allItems: ItemOption[];
  onSaved?: () => void;
}) {
  const { open, onOpenChange, parentItem, allItems, onSaved } = props;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ComponentRow[]>([]);

  const allOptions = useMemo(() => {
    const list = (allItems ?? []).filter((i) => Number.isFinite(i.id));
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [allItems]);

  const availableOptions = useMemo(() => {
    const pid = parentItem?.id ?? null;
    return pid ? allOptions.filter((o) => o.id !== pid) : allOptions;
  }, [allOptions, parentItem?.id]);

  useEffect(() => {
    async function load() {
      if (!open) return;
      if (!parentItem?.id) return;

      try {
        setLoading(true);
        setError(null);

        const json = await apiRequest<any[]>("GET", `/api/resource-items/${parentItem.id}/components`);

        const mapped: ComponentRow[] = (json ?? []).map((r: any) => ({
          componentId: Number(r.componentId),
          quantity: Number(r.quantity ?? 1),
        }));

        setRows(mapped.length > 0 ? mapped : []);
      } catch (e: any) {
        setError(e?.message || "Error cargando componentes");
        setRows([]);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [open, parentItem?.id]);

  const addRow = () => setRows((p) => [...p, { componentId: null, quantity: 1 }]);

  const removeRow = (idx: number) => {
    setRows((p) => p.filter((_r, i) => i !== idx));
  };

  const save = async () => {
    if (!parentItem?.id) return;

    const payload = {
      components: rows
        .filter((r) => Number.isFinite(r.componentId) && (r.quantity ?? 1) > 0)
        .map((r) => ({
          componentId: Number(r.componentId),
          quantity: Number(r.quantity ?? 1),
        })),
    };

    try {
      setSaving(true);
      setError(null);

      await apiRequest("PUT", `/api/resource-items/${parentItem.id}/components`, payload);

      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || "Error guardando componentes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Componentes de {parentItem?.name ?? "recurso"}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <div className="space-y-3">
            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="space-y-2">
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Este recurso no consume otros recursos.
                </p>
              ) : (
                rows.map((r, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="flex-1">
                      <Select
                        value={r.componentId ? String(r.componentId) : ""}
                        onValueChange={(v) =>
                          setRows((p) =>
                            p.map((row, i) =>
                              i === idx
                                ? { ...row, componentId: Number(v) }
                                : row
                            )
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona recurso…" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableOptions.map((o) => (
                            <SelectItem key={o.id} value={String(o.id)}>
                              {o.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="w-24">
                      <Input
                        type="number"
                        min={1}
                        max={99}
                        value={r.quantity}
                        onChange={(e) =>
                          setRows((p) =>
                            p.map((row, i) =>
                              i === idx
                                ? { ...row, quantity: Number(e.target.value || 1) }
                                : row
                            )
                          )
                        }
                      />
                    </div>

                    <Button
                      variant="ghost"
                      onClick={() => removeRow(idx)}
                      title="Eliminar fila"
                    >
                      Quitar
                    </Button>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" onClick={addRow}>
                Añadir componente
              </Button>

              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button onClick={save} disabled={saving}>
                  {saving ? "Guardando…" : "Guardar"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
