import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ISpace } from "@/features/space/types/space.types";
import { createPersonalSpace } from "@/ee/personal-space/services/personal-space-service";

export function useCreatePersonalSpaceMutation() {
  const queryClient = useQueryClient();

  return useMutation<ISpace, Error, { name: string }>({
    mutationFn: (data) => createPersonalSpace(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
    },
  });
}
