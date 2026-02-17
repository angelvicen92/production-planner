import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { Plan, InsertPlan, DailyTask } from "@shared/schema";
import { api, buildUrl } from "@shared/routes";
import { planQueryKey } from "@/lib/plan-query-keys";
import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export function usePlans() {
  return useQuery<Plan[]>({
    queryKey: [api.plans.list.path],
    queryFn: () => apiRequest("GET", api.plans.list.path)
  });
}

export function usePlan(id: number) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`plan-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_tasks',
          filter: `plan_id=eq.${id}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: planQueryKey(id) });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  return useQuery<Plan & { dailyTasks?: DailyTask[] }>({
    queryKey: planQueryKey(id),
    queryFn: () => apiRequest("GET", buildUrl(api.plans.get.path, { id })),
    enabled: !!id,
  });
}

import { useToast } from "@/hooks/use-toast";
// ...mantén el resto igual

export function useCreatePlan() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (plan: InsertPlan) =>
      apiRequest<Plan>("POST", api.plans.create.path, plan),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.plans.list.path] });
      toast({
        title: "Plan creado",
        description: "Ya puedes entrar al plan y añadir tareas.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "No se pudo crear el plan",
        description: err?.message || "Error desconocido",
        variant: "destructive",
      });
    },
  });
}

export function useGeneratePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => 
      apiRequest("POST", buildUrl(api.plans.generate.path, { id })),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: planQueryKey(id) });
    },
  });
}

export function useUpdatePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: any }) =>
      apiRequest("PATCH", buildUrl(api.plans.update.path, { id }), patch),
    onMutate: async ({ id, patch }) => {
      const key = planQueryKey(id);
      await queryClient.cancelQueries({ queryKey: key });
      const previousPlan = queryClient.getQueryData(key);

      queryClient.setQueryData(key, (old: any) => {
        if (!old) return old;
        return { ...old, ...patch };
      });

      return { previousPlan, id };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previousPlan) {
        queryClient.setQueryData(planQueryKey(ctx.id), ctx.previousPlan);
      }
    },
    onSettled: (_data, _error, vars) => {
      queryClient.invalidateQueries({ queryKey: [api.plans.list.path] });
      queryClient.invalidateQueries({ queryKey: planQueryKey(vars.id) });
    },
  });
}

export function useDeletePlan() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", buildUrl(api.plans.delete.path, { id }));
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.plans.list.path] });
      toast({
        title: "Plan borrado",
        description: "El plan se ha eliminado correctamente.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "No se pudo borrar el plan",
        description: err?.message || "Error desconocido",
        variant: "destructive",
      });
    },
  });
}
