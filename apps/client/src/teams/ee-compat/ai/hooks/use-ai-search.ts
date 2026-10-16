import { noop } from "@/teams/edition/unsupported";

// docmost-teams has no AI search. The spotlight still destructures these
// fields, so they exist with inert values.
export interface AiSearchState {
  data: undefined;
  isPending: boolean;
  error: Error | null;
  mutate: (params?: unknown) => void;
  reset: () => void;
  streamingAnswer: string;
  streamingSources: unknown[];
  clearStreaming: () => void;
}

const INERT_AI_SEARCH: AiSearchState = {
  data: undefined,
  isPending: false,
  error: null,
  mutate: noop,
  reset: noop,
  streamingAnswer: "",
  streamingSources: [],
  clearStreaming: noop,
};

export function useAiSearch(): AiSearchState {
  return INERT_AI_SEARCH;
}
