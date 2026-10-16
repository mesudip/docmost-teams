import { IPagination, QueryParams } from "@/lib/types";
import { emptyPage } from "@/teams/edition/unsupported";

// API keys are not part of docmost-teams.

export interface IApiKey {
  id: string;
  name: string;
  createdAt: string;
}

export async function getApiKeys(
  params?: QueryParams,
): Promise<IPagination<IApiKey>> {
  return emptyPage<IApiKey>(params?.limit);
}
