import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/api";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw } from "lucide-react";

type RoleKey = "admin" | "production" | "aux" | "viewer";

type AdminUser = {
  id: string;
  email: string;
  createdAt: string | null;
  lastSignInAt?: string | null;
  roleKey: RoleKey;
  links: {
    staffPersonId?: number | null;
    resourceItemId?: number | null;
  };
};

const roleOptions: RoleKey[] = ["admin", "production", "aux", "viewer"];

type RowDraft = {
  roleKey: RoleKey;
  staffPersonId: string;
  resourceItemId: string;
};

export function UsersAdminSettings({ currentUserId }: { currentUserId?: string | null }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const [page, setPage] = useState(1);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});

  const usersQ = useQuery<{ users: AdminUser[]; nextPage: number | null }>({
    queryKey: ["adminUsers", page],
    queryFn: () => apiRequest("GET", `/api/admin/users?page=${page}`),
    retry: false,
  });

  const staffQ = useQuery<any[]>({
    queryKey: [api.staffPeople.list.path],
    queryFn: () => apiRequest("GET", api.staffPeople.list.path),
  });

  const resourceQ = useQuery<any[]>({
    queryKey: ["/api/resource-types-with-items"],
    queryFn: () => apiRequest("GET", "/api/resource-types-with-items"),
  });

  const saveRow = useMutation({
    mutationFn: async ({ userId, next, current }: { userId: string; next: RowDraft; current: AdminUser }) => {
      let warning: string | null = null;
      if (next.roleKey !== current.roleKey) {
        const roleRes = await apiRequest<{ roleKey: RoleKey; warning?: string }>("PATCH", `/api/admin/users/${userId}/role`, { roleKey: next.roleKey });
        warning = roleRes.warning ?? null;
      }

      const toNumberOrNull = (value: string) => {
        if (value === "none") return null;
        const out = Number(value);
        return Number.isFinite(out) ? out : null;
      };

      const nextStaff = toNumberOrNull(next.staffPersonId);
      const nextResource = toNumberOrNull(next.resourceItemId);

      if (
        nextStaff !== Number(current.links?.staffPersonId ?? null)
        || nextResource !== Number(current.links?.resourceItemId ?? null)
      ) {
        await apiRequest("PATCH", `/api/admin/users/${userId}/links`, {
          staffPersonId: nextStaff,
          resourceItemId: nextResource,
        });
      }

      return { warning };
    },
    onSuccess: async (result) => {
      if (result?.warning) {
        toast({ title: "Cambio guardado", description: result.warning });
      } else {
        toast({ title: "Cambios guardados" });
      }
      await qc.invalidateQueries({ queryKey: ["adminUsers"] });
    },
    onError: (err: any) => {
      toast({
        title: err?.status === 403 ? "Solo admin" : "No se pudo guardar",
        description: err?.message || "Intenta de nuevo.",
        variant: "destructive",
      });
    },
  });

  const rows = usersQ.data?.users ?? [];

  const filteredRows = useMemo(() => rows.filter((user) => {
    const rolePass = roleFilter === "all" || user.roleKey === roleFilter;
    const searchPass = !search.trim() || user.email.toLowerCase().includes(search.trim().toLowerCase());
    const unlinked = !user.links?.staffPersonId && !user.links?.resourceItemId;
    const unlinkedPass = !onlyUnlinked || unlinked;
    return rolePass && searchPass && unlinkedPass;
  }), [onlyUnlinked, roleFilter, rows, search]);

  const resourceOptions = useMemo(() => {
    const options: Array<{ id: number; name: string }> = [];
    for (const type of resourceQ.data ?? []) {
      for (const item of type?.items ?? []) {
        options.push({ id: Number(item?.id), name: `${item?.name || "Sin nombre"} · ${type?.name || "Tipo"}` });
      }
    }
    return options;
  }, [resourceQ.data]);

  const getDraft = (user: AdminUser): RowDraft => drafts[user.id] ?? {
    roleKey: user.roleKey,
    staffPersonId: user.links?.staffPersonId ? String(user.links.staffPersonId) : "none",
    resourceItemId: user.links?.resourceItemId ? String(user.links.resourceItemId) : "none",
  };

  const setDraft = (user: AdminUser, patch: Partial<RowDraft>) => {
    const next = { ...getDraft(user), ...patch };
    setDrafts((prev) => ({ ...prev, [user.id]: next }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usuarios</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Buscar por email" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Rol" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los roles</SelectItem>
              {roleOptions.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant={onlyUnlinked ? "default" : "outline"} onClick={() => setOnlyUnlinked((v) => !v)}>Sin vínculo</Button>
          <Button variant="outline" onClick={() => usersQ.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Reintentar</Button>
        </div>

        {usersQ.isLoading ? <div className="text-sm text-muted-foreground">Cargando usuarios...</div> : null}
        {usersQ.isError ? <div className="rounded border border-destructive/50 bg-destructive/10 p-3 text-sm">{(usersQ.error as any)?.status === 403 ? "Solo admin" : "Error cargando usuarios"}</div> : null}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Vincular a Staff</TableHead>
              <TableHead>Vincular a Recurso</TableHead>
              <TableHead>Último login</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">Sin resultados</TableCell></TableRow>
            ) : filteredRows.map((user) => {
              const draft = getDraft(user);
              const dirty = draft.roleKey !== user.roleKey
                || draft.staffPersonId !== (user.links?.staffPersonId ? String(user.links.staffPersonId) : "none")
                || draft.resourceItemId !== (user.links?.resourceItemId ? String(user.links.resourceItemId) : "none");
              const isSaving = saveRow.isPending && saveRow.variables?.userId === user.id;

              return (
                <TableRow key={user.id}>
                  <TableCell>{user.email || "Sin email"}</TableCell>
                  <TableCell>
                    <Select value={draft.roleKey} onValueChange={(value: RoleKey) => setDraft(user, { roleKey: value })}>
                      <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{roleOptions.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select value={draft.staffPersonId} onValueChange={(value) => setDraft(user, { staffPersonId: value })}>
                      <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">(ninguno)</SelectItem>
                        {(staffQ.data ?? []).map((staff) => (
                          <SelectItem key={staff.id} value={String(staff.id)}>{staff.name} · {staff.roleType === "editorial" ? "Redacción" : "Producción"}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select value={draft.resourceItemId} onValueChange={(value) => setDraft(user, { resourceItemId: value })}>
                      <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">(ninguno)</SelectItem>
                        {resourceOptions.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>{user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : "-"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        disabled={!dirty || isSaving}
                        onClick={() => {
                          if (currentUserId && user.id === currentUserId && draft.roleKey !== "admin") {
                            const ok = window.confirm("Vas a quitarte rol admin. ¿Confirmas?");
                            if (!ok) return;
                          }
                          saveRow.mutate({ userId: user.id, next: draft, current: user });
                        }}
                      >Guardar</Button>
                      {isSaving ? <Badge variant="outline">guardando</Badge> : dirty ? <Badge variant="secondary">pendiente</Badge> : <Badge variant="outline">guardado</Badge>}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</Button>
          <span className="text-sm text-muted-foreground">Página {page}</span>
          <Button variant="outline" disabled={!usersQ.data?.nextPage} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
        </div>
      </CardContent>
    </Card>
  );
}
