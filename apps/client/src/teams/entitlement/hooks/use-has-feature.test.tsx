import React from "react";
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { entitlementAtom } from "../entitlement-atom";
import { Feature } from "../features";
import { Entitlements } from "../entitlement.types";
import { hasFeature, useHasFeature } from "./use-has-feature";

const teams: Entitlements = {
  cloud: false,
  tier: "docmost-teams",
  features: [
    Feature.SECURITY_SETTINGS,
    Feature.SSO_CUSTOM,
    Feature.PERSONAL_SPACES,
  ],
};

function renderWithStore(
  feature: Parameters<typeof useHasFeature>[0],
  store = createStore(),
) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  return { store, ...renderHook(() => useHasFeature(feature), { wrapper }) };
}

describe("useHasFeature", () => {
  it("is false until the entitlements load", () => {
    const { result } = renderWithStore(Feature.SSO_CUSTOM);
    expect(result.current).toBe(false);
  });

  it("is true only for features the server lists", () => {
    const store = createStore();
    store.set(entitlementAtom, teams);

    expect(renderWithStore(Feature.SSO_CUSTOM, store).result.current).toBe(
      true,
    );
    expect(renderWithStore(Feature.PERSONAL_SPACES, store).result.current).toBe(
      true,
    );
    expect(renderWithStore(Feature.AI, store).result.current).toBe(false);
    expect(renderWithStore(Feature.TEMPLATES, store).result.current).toBe(
      false,
    );
  });

  it("follows entitlement updates", () => {
    const { store, result } = renderWithStore(Feature.SECURITY_SETTINGS);
    expect(result.current).toBe(false);

    act(() => store.set(entitlementAtom, teams));
    expect(result.current).toBe(true);

    act(() => store.set(entitlementAtom, { ...teams, features: [] }));
    expect(result.current).toBe(false);
  });
});

describe("hasFeature", () => {
  it("handles missing or malformed entitlements", () => {
    expect(hasFeature(null, Feature.SSO_CUSTOM)).toBe(false);
    expect(hasFeature(undefined, Feature.SSO_CUSTOM)).toBe(false);
    expect(
      hasFeature(
        { cloud: false, tier: "docmost-teams", features: null },
        Feature.SSO_CUSTOM,
      ),
    ).toBe(false);
  });
});
