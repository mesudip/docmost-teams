import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import type { TFunction } from "i18next";
import { IPublicWorkspace } from "@/features/workspace/types/workspace.types";
import SsoLoginBlock from "./sso-login-block";
import { getSsoLoginErrorMessage } from "./sso-login-errors";

vi.mock("@/lib/api-client", () => ({
  default: {
    post: vi.fn(() => Promise.reject(new Error("unexpected request"))),
  },
}));

const i18n = i18next.createInstance();
const identity = ((key: string) => key) as unknown as TFunction;

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: "en",
    resources: {},
    showSupportNotice: false,
    interpolation: { escapeValue: false },
  });
  // Mantine reads the preferred color scheme.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

const providers: IPublicWorkspace["authProviders"] = [
  {
    id: "0198c0de-0000-7000-8000-00000000000a",
    name: "Staff Keycloak",
    type: "oidc",
    preset: "keycloak",
  },
  {
    id: "0198c0de-0000-7000-8000-00000000000b",
    name: "Google",
    type: "oidc",
    preset: "google",
  },
  {
    id: "0198c0de-0000-7000-8000-00000000000c",
    name: "Old SAML",
    type: "saml",
    preset: null,
  },
];

function renderBlock(workspace: Partial<IPublicWorkspace>, path = "/login") {
  window.history.replaceState({}, "", path);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(["workspace-public"], {
    id: "ws",
    name: "Acme",
    logo: null,
    hostname: null,
    enforceSso: false,
    authProviders: [],
    ...workspace,
  });
  queryClient.setQueryData(["currentUser"], null);

  return render(
    <I18nextProvider i18n={i18n}>
      <MantineProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[path]}>
            <SsoLoginBlock />
          </MemoryRouter>
        </QueryClientProvider>
      </MantineProvider>
    </I18nextProvider>,
  );
}

describe("SsoLoginBlock", () => {
  it("shows one link per OIDC provider and hides other types", () => {
    renderBlock({ authProviders: providers }, "/login?redirect=%2Fs%2Fdocs");

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Staff Keycloak",
      "Google",
    ]);
    expect(screen.queryByText("Old SAML")).toBeNull();
    expect(links[0].getAttribute("href")).toBe(
      `${window.location.origin}/api/sso/oidc/${providers[0].id}/login?redirect=%2Fs%2Fdocs`,
    );
  });

  it("separates the buttons from the password form", () => {
    renderBlock({ authProviders: providers });
    expect(screen.getByText("or")).toBeTruthy();
  });

  it("drops the separator and redirect param when not needed", () => {
    renderBlock({ authProviders: providers, enforceSso: true });
    expect(screen.queryByText("or")).toBeNull();
    expect(screen.getAllByRole("link")[0].getAttribute("href")).toBe(
      `${window.location.origin}/api/sso/oidc/${providers[0].id}/login`,
    );
  });

  it("renders nothing without providers or errors", () => {
    renderBlock({ authProviders: [providers[2]] });
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("or")).toBeNull();
  });

  it("shows the fixed message for an sso_error code, even without providers", () => {
    renderBlock({ authProviders: [] }, "/login?sso_error=signup_disabled");
    expect(
      screen.getByText(getSsoLoginErrorMessage("signup_disabled", identity)),
    ).toBeTruthy();
  });

  it("shows the generic message for unknown codes", () => {
    renderBlock(
      { authProviders: providers },
      "/login?sso_error=Call%20555%200100",
    );
    expect(
      screen.getByText(getSsoLoginErrorMessage("sso_failed", identity)),
    ).toBeTruthy();
    expect(screen.queryByText(/555/)).toBeNull();
  });

  it("explains when SSO is enforced but no provider can be used", () => {
    renderBlock({ authProviders: [providers[2]], enforceSso: true });
    expect(screen.getByText(/No sign-in option is available/)).toBeTruthy();
  });
});
