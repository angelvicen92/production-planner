import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest } from "@/lib/api";
import { headerNotesSchema, headerScopeKey, type HeaderNotes, type HeaderScope, type HeaderLine } from "@shared/planningHeaderNotes";

export function usePlanningHeaderNotes(planId?: number) {
  const client = useQueryClient();
  const path = `/api/plans/${planId}/header-notes`;
  const query = useQuery<HeaderNotes[]>({ queryKey: [path], enabled: !!planId, queryFn: async () => z.array(headerNotesSchema).parse(await apiRequest("GET", path)), refetchInterval: 15000, refetchOnWindowFocus: true });
  const save = useMutation({ mutationFn: async ({ scope, expectedVersion, lines }: { scope: HeaderScope; expectedVersion: number; lines: HeaderLine[] }) => headerNotesSchema.parse(await apiRequest("PUT", `${path}/${scope.scopeType}/${scope.scopeId}`, { expectedVersion, lines })),
    onSuccess: async saved => {
      client.setQueryData<HeaderNotes[]>([path], rows => [...(rows ?? []).filter(row => headerScopeKey(row) !== headerScopeKey(saved)), saved]);
      await client.invalidateQueries({ queryKey: [path] });
    },
    onError: () => { void client.invalidateQueries({ queryKey: [path] }); },
  });
  return { query, save };
}
