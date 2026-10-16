import api from "@/lib/api-client";
import { IPagination } from "@/lib/types";
import {
  CreateSsoProviderPayload,
  ISsoProvider,
  SsoTestResult,
  TestSsoProviderPayload,
  UpdateSsoProviderPayload,
} from "../sso.types";

export async function getSsoProviders(): Promise<IPagination<ISsoProvider>> {
  const req = await api.post<IPagination<ISsoProvider>>("/sso/providers");
  return req.data;
}

export async function getSsoProvider(
  providerId: string,
): Promise<ISsoProvider> {
  const req = await api.post<ISsoProvider>("/sso/info", { providerId });
  return req.data;
}

export async function createSsoProvider(
  data: CreateSsoProviderPayload,
): Promise<ISsoProvider> {
  const req = await api.post<ISsoProvider>("/sso/create", data);
  return req.data;
}

export async function updateSsoProvider(
  data: UpdateSsoProviderPayload,
): Promise<ISsoProvider> {
  const req = await api.post<ISsoProvider>("/sso/update", data);
  return req.data;
}

export async function testSsoProvider(
  data: TestSsoProviderPayload,
): Promise<SsoTestResult> {
  const req = await api.post<SsoTestResult>("/sso/test", data);
  return req.data;
}

export async function deleteSsoProvider(providerId: string): Promise<void> {
  await api.post("/sso/delete", { providerId });
}
