import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { api } from "@shared/routes";

export function useItinerantTeams() {
  return useQuery({
    queryKey: [api.itinerantTeams.list.path],
    queryFn: () => apiRequest("GET", api.itinerantTeams.list.path),
  });
}


export function useDeleteItinerantTeam() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", api.itinerantTeams.delete.path.replace(":id", String(id))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.itinerantTeams.list.path] });
    },
  });
}
