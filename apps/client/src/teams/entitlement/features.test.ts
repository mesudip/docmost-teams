import { describe, expect, it } from "vitest";
import { loadServerModule } from "@/teams/test-utils/server-modules";
import { Feature } from "./features";
import { TEAMS_TIER } from "./entitlement.types";
import { hasPaidLicenseTier, isForkTier } from "./tier.utils";

describe("Feature", () => {
  it("mirrors the server's feature keys and values", async () => {
    const server = await loadServerModule<{ Feature: Record<string, string> }>(
      "common/features.ts",
    );
    expect(Feature).toEqual(server.Feature);
  });

  it("covers what a docmost-teams server grants", async () => {
    const server = await loadServerModule<{
      TEAMS_TIER: string;
      TEAMS_FEATURES: string[];
    }>("teams/features.ts");
    expect(TEAMS_TIER).toBe(server.TEAMS_TIER);
    for (const feature of server.TEAMS_FEATURES) {
      expect(Object.values(Feature)).toContain(feature);
    }
  });
});

describe("tier helpers", () => {
  it("treat docmost-teams as the fork tier, not a paid license", () => {
    expect(isForkTier("docmost-teams")).toBe(true);
    expect(hasPaidLicenseTier("docmost-teams")).toBe(false);
    expect(hasPaidLicenseTier("free")).toBe(false);
    expect(hasPaidLicenseTier(null)).toBe(false);
    expect(hasPaidLicenseTier("business")).toBe(true);
  });
});
