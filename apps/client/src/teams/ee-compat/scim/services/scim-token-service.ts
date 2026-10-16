import { IPagination } from "@/lib/types";
import { emptyPage } from "@/teams/edition/unsupported";

// SCIM is not part of docmost-teams.

export interface IScimToken {
  id: string;
}

export async function getScimTokens(params?: {
  limit?: number;
  cursor?: string;
}): Promise<IPagination<IScimToken>> {
  return emptyPage<IScimToken>(params?.limit);
}
