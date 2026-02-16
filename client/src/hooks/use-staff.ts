import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export type StaffRoleType = "production" | "editorial";

export type StaffPerson = {
  id: number;
  name: string;
  roleType: StaffRoleType;
  isActive: boolean;
};

export function useStaffPeople() {
  return useQuery<StaffPerson[]>({
    queryKey: [api.staffPeople.list.path],
    queryFn: () => apiRequest("GET", api.staffPeople.list.path),
  });
}

export function useCreateStaffPerson() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (payload: {
      name: string;
      roleType: StaffRoleType;
      isActive?: boolean;
    }) => apiRequest("POST", api.staffPeople.create.path, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.staffPeople.list.path] });
      toast({ title: "Persona creada" });
    },
    onError: (err: any) => {
      toast({
        title: "No se pudo crear",
        description: err?.message || "Error desconocido",
        variant: "destructive",
      });
    },
  });
}

export function useUpdateStaffPerson() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (args: {
      id: number;
      patch: Partial<{ name: string; roleType: StaffRoleType; isActive: boolean }>;
    }) =>
      apiRequest(
        "PATCH",
        api.staffPeople.update.path.replace(":id", String(args.id)),
        args.patch,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.staffPeople.list.path] });
      toast({ title: "Cambios guardados" });
    },
    onError: (err: any) => {
      toast({
        title: "No se pudo guardar",
        description: err?.message || "Error desconocido",
        variant: "destructive",
      });
    },
  });
}


export function useDeleteStaffPerson() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", api.staffPeople.delete.path.replace(":id", String(id))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.staffPeople.list.path] });
      toast({ title: "Eliminado" });
    },
    onError: (err: any) => {
      toast({
        title: "No se pudo eliminar",
        description: err?.message || "Error desconocido",
        variant: "destructive",
      });
    },
  });
}
