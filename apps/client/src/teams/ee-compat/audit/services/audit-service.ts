import { IPagination } from "@/lib/types";
import { emptyPage } from "@/teams/edition/unsupported";

// Audit logs are not part of docmost-teams.

export interface IAuditLogEntry {
  id: string;
}

export async function getAuditLogs(params?: {
  limit?: number;
  cursor?: string;
}): Promise<IPagination<IAuditLogEntry>> {
  return emptyPage<IAuditLogEntry>(params?.limit);
}
