import { useMutation, useQuery, UseQueryResult } from "@tanstack/react-query";
import { rejectUnavailable } from "@/teams/edition/unsupported";

// Database pages ("bases") are not part of docmost-teams.

export interface IBaseSummary {
  id: string;
  pageId: string;
  permissions?: { canEdit?: boolean };
}

// Disabled: never fetches, never loading, never in error.
export function useBaseQuery(
  pageId: string,
): UseQueryResult<IBaseSummary | null, Error> {
  return useQuery({
    queryKey: ["base", pageId],
    queryFn: async () => null,
    enabled: false,
  });
}

export function useConvertPageToBaseMutation() {
  return useMutation<
    IBaseSummary,
    Error,
    { pageId: string; template?: string }
  >({
    mutationFn: () => rejectUnavailable("Bases"),
  });
}
