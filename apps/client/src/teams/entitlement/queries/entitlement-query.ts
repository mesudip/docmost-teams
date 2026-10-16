import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { getEntitlements } from "../services/entitlement-service";
import { Entitlements } from "../entitlement.types";

export const ENTITLEMENTS_QUERY_KEY = ["entitlements"] as const;

export function useEntitlements(): UseQueryResult<Entitlements, Error> {
  return useQuery({
    queryKey: ENTITLEMENTS_QUERY_KEY,
    queryFn: () => getEntitlements(),
  });
}
