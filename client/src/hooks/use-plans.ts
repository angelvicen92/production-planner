import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { Plan, PlanSummary, InsertPlan, DailyTask } from "@shared/schema";
import { api, buildUrl } from "@shared/routes";
import { planQueryKey } from "@/lib/plan-query-keys";
import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

export function usePlans() {
  return useQuery<PlanSummary[]>({
    queryKey: [api.plans.list.path],
    queryFn: () => apiRequest("GET", api.plans.list.path)
  });
}

export function usePlan(id: number) {
  const queryClient = useQueryClient();

  const invalidateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!id) return;

    const invalidateDebounced = () => {
      if (invalidateTimeoutRef.current) {
        clearTimeout(invalidateTimeoutRef.current);
      }
      invalidateTimeoutRef.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: planQueryKey(id) });
        invalidateTimeoutRef.current = null;
      }, 300);
    };

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
        invalidateDebounced
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'locks',
          filter: `plan_id=eq.${id}`
        },
        invalidateDebounced
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'plan_breaks',
          filter: `plan_id=eq.${id}`
        },
        invalidateDebounced
      );

    const ensureSubscribed = () => {
      const state = (channel as any)?.state;
      if (state === 'joined' || state === 'joining') return;
      supabase.realtime.connect();
      channel.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          invalidateDebounced();
        }
      });
    };

    const onFocus = () => ensureSubscribed();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        ensureSubscribed();
      }
    };

    ensureSubscribed();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (invalidateTimeoutRef.current) {
        clearTimeout(invalidateTimeoutRef.current);
        invalidateTimeoutRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  return useQuery<Plan & { dailyTasks?: DailyTask[] }>({
    queryKey: planQueryKey(id),
    queryFn: () => apiRequest("GET", buildUrl(api.plans.get.path, { id })),
    select: (plan: any) => {
      if (!plan || typeof plan !== "object") return plan;
      const dailyTasks = Array.isArray(plan.dailyTasks)
        ? plan.dailyTasks.map((task: any) => ({
            ...task,
            isManualBlock: task?.isManualBlock ?? task?.is_manual_block ?? false,
            manualTitle: task?.manualTitle ?? task?.manual_title ?? null,
            manualColor: task?.manualColor ?? task?.manual_color ?? null,
            manualScopeType: task?.manualScopeType ?? task?.manual_scope_type ?? null,
            manualScopeId: task?.manualScopeId ?? task?.manual_scope_id ?? null,
          }))
        : plan.dailyTasks;
      return { ...plan, dailyTasks };
    },
    enabled: !!id,
  });
}


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
    mutationFn: ({ id, mode }: { id: number; mode?: "full" | "only_unplanned" | "replan_pending_respecting_locks" | "generate_planning" | "plan_pending" }) =>
      apiRequest("POST", buildUrl(api.plans.generate.path, { id }), mode ? { mode } : undefined),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: planQueryKey(variables.id) });
      await queryClient.refetchQueries({ queryKey: planQueryKey(variables.id) });
    },
  });
}


export function useGeneratePlanV2() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, mode }: { id: number; mode?: "full" | "only_unplanned" | "replan_pending_respecting_locks" | "generate_planning" | "plan_pending" }) =>
      apiRequest("POST", buildUrl(api.plans.generateV2.path, { id }), mode ? { mode } : undefined),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: planQueryKey(variables.id) });
      await queryClient.refetchQueries({ queryKey: planQueryKey(variables.id) });
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
