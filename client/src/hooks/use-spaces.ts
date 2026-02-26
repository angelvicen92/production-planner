import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useZones() {
  return useQuery({
    queryKey: [api.zones.list.path],
    queryFn: () => apiRequest("GET", api.zones.list.path),

    // 🔒 con staleTime: Infinity global, forzamos refetch al montar
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function useSpaces() {
  return useQuery({
    queryKey: [api.spaces.list.path],
    queryFn: () => apiRequest("GET", api.spaces.list.path),

    // 🔒 con staleTime: Infinity global, forzamos refetch al montar
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function useCreateZone() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: { name: string }) => apiRequest("POST", api.zones.create.path, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.zones.list.path] });
      toast({ title: "Plató creado" });
    },
  });
}

export function useUpdateZone() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: {
      id: number;
      name: string;
      uiColor?: string | null;
      minimizeChangesLevel?: number;
      minimizeChangesMinChain?: number;
      uiOrderIndex?: number | null;
      maxTemplateChanges?: number;
    }) =>
      apiRequest("PATCH", buildUrl(api.zones.update.path, { id: args.id }), {
        name: args.name,
        uiColor: args.uiColor ?? null,
        minimizeChangesLevel: args.minimizeChangesLevel,
        minimizeChangesMinChain: args.minimizeChangesMinChain,
        uiOrderIndex: args.uiOrderIndex,
        maxTemplateChanges: args.maxTemplateChanges,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.zones.list.path] });
      toast({ title: "Plató actualizado" });
    },
  });
}

export function useCreateSpace() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: { name: string; zoneId: number; priorityLevel?: number; parentSpaceId?: number | null }) =>
      apiRequest("POST", api.spaces.create.path, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.spaces.list.path] });
      toast({ title: "Espacio creado" });
    },
  });
}

export function useUpdateSpace() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: { id: number; patch: any }) =>
      apiRequest("PATCH", buildUrl(api.spaces.update.path, { id: args.id }), args.patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.spaces.list.path] });
      toast({ title: "Espacio actualizado" });
    },
  });
}
