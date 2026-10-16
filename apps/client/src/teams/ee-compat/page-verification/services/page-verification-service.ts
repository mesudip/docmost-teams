import { IPagination } from "@/lib/types";
import { emptyPage } from "@/teams/edition/unsupported";

// Page verification is not part of docmost-teams.

export interface IVerifiedPage {
  id: string;
}

export async function getVerificationList(params?: {
  limit?: number;
  cursor?: string;
}): Promise<IPagination<IVerifiedPage>> {
  return emptyPage<IVerifiedPage>(params?.limit);
}
