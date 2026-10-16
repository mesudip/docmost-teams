import { describe, expect, it } from "vitest";
import { normalizeDomainEntries } from "./allowed-email-domains-setting";
import { isValidRetentionDays } from "./trash-retention-setting";

describe("normalizeDomainEntries", () => {
  it("lower-cases, trims, drops a leading @ and removes duplicates", () => {
    expect(
      normalizeDomainEntries([
        " Example.COM ",
        "@corp.example.org",
        "example.com",
        "",
        "  ",
      ]),
    ).toEqual(["example.com", "corp.example.org"]);
  });
});

describe("isValidRetentionDays", () => {
  it("accepts whole numbers of at least 1", () => {
    expect(isValidRetentionDays(1)).toBe(true);
    expect(isValidRetentionDays(30)).toBe(true);
    expect(isValidRetentionDays(0)).toBe(false);
    expect(isValidRetentionDays(-3)).toBe(false);
    expect(isValidRetentionDays(1.5)).toBe(false);
    expect(isValidRetentionDays("30")).toBe(false);
    expect(isValidRetentionDays("")).toBe(false);
  });
});
