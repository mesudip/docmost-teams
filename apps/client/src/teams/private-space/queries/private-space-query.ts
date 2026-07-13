import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ISpace } from "@/features/space/types/space.types";
import { createPersonalSpace } from "@/teams/private-space/services/private-space-service";

export function useCreatePersonalSpaceMutation() {
  const queryClient = useQueryClient();

  return useMutation<ISpace, Error, { name: string }>({
    mutationFn: (data) => createPersonalSpace(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
    },
  });
}
