import { useMemo } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  UseQueryResult,
} from "@tanstack/react-query";
import { ISpace } from "@/features/space/types/space.types";
import {
  createPersonalSpace,
  getMyPersonalSpaces,
  IPersonalSpaceSummary,
} from "../services/private-space-service";

// Under the "spaces" prefix, so invalidating ["spaces"] refreshes it too.
export const MY_PERSONAL_SPACES_QUERY_KEY = ["spaces", "personal", "mine"];

export function useMyPersonalSpacesQuery(): UseQueryResult<
  IPersonalSpaceSummary[],
  Error
> {
  return useQuery({
    queryKey: MY_PERSONAL_SPACES_QUERY_KEY,
    queryFn: () => getMyPersonalSpaces(),
    staleTime: 60 * 1000,
  });
}

// Ids of the caller's private spaces, which the sidebar pins above the
// favorites and leaves out of them.
export function usePinnedPersonalSpaceIds(): Set<string> {
  const { data } = useMyPersonalSpacesQuery();
  return useMemo(() => new Set((data ?? []).map((space) => space.id)), [data]);
}

export function useCreatePersonalSpaceMutation() {
  const queryClient = useQueryClient();
  return useMutation<ISpace, Error, { name: string }>({
    mutationFn: (data) => createPersonalSpace(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["spaces"] }),
  });
}
