import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { Entitlements } from "@/teams/entitlement/entitlement.types";

// Nothing is entitled until the client loads docmost-teams entitlements.
export function useEntitlements(): UseQueryResult<Entitlements, Error> {
  return useQuery({
    queryKey: ["entitlements"],
    queryFn: (): Promise<Entitlements> => Promise.resolve(null),
    enabled: false,
  });
}
