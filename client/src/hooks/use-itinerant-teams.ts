import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { api } from "@shared/routes";

export function useItinerantTeams() {
  return useQuery({
    queryKey: [api.itinerantTeams.list.path],
    queryFn: () => apiRequest("GET", api.itinerantTeams.list.path),
  });
}
