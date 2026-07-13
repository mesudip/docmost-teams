import api from "@/lib/api-client";
import { ISpace } from "@/features/space/types/space.types";

export async function createPersonalSpace(data: {
  name: string;
}): Promise<ISpace> {
  const req = await api.post<ISpace>("/spaces/private/create", data);
  return req.data;
}

export async function convertPersonalSpace(data: {
  spaceId: string;
  isPersonal: boolean;
}): Promise<ISpace> {
  const req = await api.post<ISpace>("/spaces/private/convert", data);
  return req.data;
}
