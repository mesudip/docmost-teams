type ResolveCommentProps = {
  editor: unknown;
  commentId: string;
  pageId: string;
  resolvedAt?: Date | string | null;
};

// Comment resolution is not part of docmost-teams.
export default function ResolveComment(_props: ResolveCommentProps) {
  return null;
}
