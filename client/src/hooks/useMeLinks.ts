import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { api } from "@shared/routes";

type MeLinksResponse = {
  staffPersonId?: number | null;
  resourceItemId?: number | null;
};

export function useMeLinks(enabled = true) {
  const [linksQ, staffQ, resourcesQ] = useQueries({
    queries: [
      {
        queryKey: ["/api/me/links"],
        enabled,
        retry: false,
        queryFn: () => apiRequest<MeLinksResponse>("GET", "/api/me/links"),
      },
      {
        queryKey: [api.staffPeople.list.path],
        enabled,
        retry: false,
        queryFn: () => apiRequest<any[]>("GET", api.staffPeople.list.path),
      },
      {
        queryKey: ["/api/resource-types-with-items"],
        enabled,
        retry: false,
        queryFn: () => apiRequest<any[]>("GET", "/api/resource-types-with-items"),
      },
    ],
  });

  const links = linksQ.data ?? { staffPersonId: null, resourceItemId: null };

  const staffPerson = useMemo(() => {
    if (!links?.staffPersonId) return null;
    return (staffQ.data ?? []).find((item: any) => Number(item?.id) === Number(links.staffPersonId)) ?? null;
  }, [links?.staffPersonId, staffQ.data]);

  const resourceItem = useMemo(() => {
    if (!links?.resourceItemId) return null;
    for (const type of resourcesQ.data ?? []) {
      for (const item of type?.items ?? []) {
        if (Number(item?.id) === Number(links.resourceItemId)) {
          return {
            id: Number(item.id),
            name: String(item?.name ?? ""),
            typeCode: String(type?.code ?? ""),
            typeName: String(type?.name ?? ""),
          };
        }
      }
    }
    return null;
  }, [links?.resourceItemId, resourcesQ.data]);

  return {
    links,
    staffPerson,
    resourceItem,
    isLoading: linksQ.isLoading,
    isError: linksQ.isError,
    error: linksQ.error,
  };
}
