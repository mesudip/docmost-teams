type AiSearchResultProps = {
  result?: unknown;
  isLoading?: boolean;
  streamingAnswer?: string;
  streamingSources?: unknown[];
};

// docmost-teams has no AI search.
export function AiSearchResult(_props: AiSearchResultProps) {
  return null;
}
