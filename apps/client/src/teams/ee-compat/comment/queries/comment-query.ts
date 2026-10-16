import { useMutation } from "@tanstack/react-query";
import { rejectUnavailable } from "@/teams/edition/unsupported";

type ResolveCommentInput = {
  commentId: string;
  pageId: string;
  resolved: boolean;
};

// Only reachable when COMMENT_RESOLUTION is granted, which it never is in
// docmost-teams.
export function useResolveCommentMutation() {
  return useMutation<void, Error, ResolveCommentInput>({
    mutationFn: () => rejectUnavailable("Comment resolution"),
  });
}
