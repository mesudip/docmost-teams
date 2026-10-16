import { beforeEach, describe, expect, it, vi } from "vitest";

// Imported through the @/ee alias on purpose: this also checks that the
// alias resolves to the compat layer.
vi.mock("@/lib/api-client", () => ({
  default: {
    post: vi.fn(() => Promise.reject(new Error("unexpected request"))),
    get: vi.fn(() => Promise.reject(new Error("unexpected request"))),
  },
}));

import api from "@/lib/api-client";
import { getApiKeys } from "@/ee/api-key";
import { getAuditLogs } from "@/ee/audit/services/audit-service";
import {
  getBilling,
  getBillingPlans,
} from "@/ee/billing/services/billing-service.ts";
import { getLicenseInfo } from "@/ee/licence/services/license-service.ts";
import { getVerificationList } from "@/ee/page-verification/services/page-verification-service";
import { getScimTokens } from "@/ee/scim/services/scim-token-service";
import { hintVectorCache } from "@/ee/ai/services/ai-search-service.ts";
import { useAiSearch } from "@/ee/ai/hooks/use-ai-search.ts";
import useTrial from "@/ee/hooks/use-trial.tsx";
import { exchangeTokenRedirectUrl, getHostnameUrl } from "@/ee/utils.ts";
import { Feature } from "@/ee/features";
import { Feature as TeamsFeature } from "@/teams/entitlement/features";

const emptyMeta = {
  hasNextPage: false,
  hasPrevPage: false,
  nextCursor: null,
  prevCursor: null,
};

describe("compat stubs", () => {
  beforeEach(() => {
    vi.mocked(api.post).mockClear();
    vi.mocked(api.get).mockClear();
  });

  it("resolve @/ee/ imports to the teams modules", () => {
    expect(Feature).toBe(TeamsFeature);
  });

  it("return empty results without network requests", async () => {
    expect(await getApiKeys({})).toEqual({
      items: [],
      meta: { ...emptyMeta, limit: 0 },
    });
    expect(await getAuditLogs({ limit: 50 })).toEqual({
      items: [],
      meta: { ...emptyMeta, limit: 50 },
    });
    expect((await getVerificationList({ limit: 50 })).items).toEqual([]);
    expect((await getScimTokens({})).items).toEqual([]);
    expect(await getLicenseInfo()).toBeNull();
    expect(await getBilling()).toBeNull();
    expect(await getBillingPlans()).toEqual([]);
    hintVectorCache();

    expect(api.post).not.toHaveBeenCalled();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("keep cloud-only state off", () => {
    expect(useTrial()).toEqual({ isTrial: false, trialDaysLeft: null });
    expect(getHostnameUrl("acme")).toBe(window.location.origin);
    expect(exchangeTokenRedirectUrl("acme", "token")).toBe(
      window.location.origin,
    );
  });

  it("give the search spotlight an inert AI search", () => {
    const search = useAiSearch();
    expect(search).toMatchObject({
      data: undefined,
      isPending: false,
      error: null,
      streamingAnswer: "",
      streamingSources: [],
    });
    expect(() => {
      search.mutate({ query: "x" });
      search.reset();
      search.clearStreaming();
    }).not.toThrow();
    expect(useAiSearch().clearStreaming).toBe(search.clearStreaming);
    expect(api.post).not.toHaveBeenCalled();
  });
});
