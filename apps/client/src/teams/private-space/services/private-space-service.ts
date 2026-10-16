import api from "@/lib/api-client";
import { ISpace } from "@/features/space/types/space.types";

// One of the caller's own private spaces, as listed by /spaces/private/mine.
export interface IPersonalSpaceSummary {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
}

export async function createPersonalSpace(data: {
  name: string;
}): Promise<ISpace> {
  const req = await api.post<ISpace>("/spaces/private/create", data);
  return req.data;
}

export async function getMyPersonalSpaces(): Promise<IPersonalSpaceSummary[]> {
  const req = await api.post<IPersonalSpaceSummary[]>("/spaces/private/mine");
  return req.data;
}

// Returns the bare space row, without `membership`.
export async function convertPersonalSpace(data: {
  spaceId: string;
  isPersonal: boolean;
}): Promise<ISpace> {
  const req = await api.post<ISpace>("/spaces/private/convert", data);
  return req.data;
}
