import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
  UseQueryResult,
} from "@tanstack/react-query";
import { IPagination } from "@/lib/types";
import {
  createSsoProvider,
  deleteSsoProvider,
  getSsoProviders,
  testSsoProvider,
  updateSsoProvider,
} from "../services/sso-provider-service";
import {
  CreateSsoProviderPayload,
  ISsoProvider,
  SsoTestResult,
  TestSsoProviderPayload,
  UpdateSsoProviderPayload,
} from "../sso.types";

// Core settings navigation prefetches this key on hover.
export const SSO_PROVIDERS_QUERY_KEY = ["sso-providers"] as const;

// Admin only on the server, so callers pass `enabled: false` for others.
export function useSsoProvidersQuery(
  enabled = true,
): UseQueryResult<IPagination<ISsoProvider>, Error> {
  return useQuery({
    queryKey: SSO_PROVIDERS_QUERY_KEY,
    queryFn: () => getSsoProviders(),
    enabled,
  });
}

// The login page lists enabled providers from the public workspace data.
function refreshProviders(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: SSO_PROVIDERS_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: ["workspace-public"] }),
  ]);
}

export function useCreateSsoProviderMutation() {
  const queryClient = useQueryClient();
  return useMutation<ISsoProvider, Error, CreateSsoProviderPayload>({
    mutationFn: (data) => createSsoProvider(data),
    onSuccess: () => refreshProviders(queryClient),
  });
}

export function useUpdateSsoProviderMutation() {
  const queryClient = useQueryClient();
  return useMutation<ISsoProvider, Error, UpdateSsoProviderPayload>({
    mutationFn: (data) => updateSsoProvider(data),
    onSuccess: () => refreshProviders(queryClient),
  });
}

export function useDeleteSsoProviderMutation() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (providerId) => deleteSsoProvider(providerId),
    onSuccess: () => refreshProviders(queryClient),
  });
}

export function useTestSsoProviderMutation() {
  return useMutation<SsoTestResult, Error, TestSsoProviderPayload>({
    mutationFn: (data) => testSsoProvider(data),
  });
}
