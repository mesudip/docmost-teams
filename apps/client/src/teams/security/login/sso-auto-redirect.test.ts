import { describe, expect, it } from "vitest";
import {
  AUTO_REDIRECT_COOLDOWN_MS,
  AUTO_REDIRECT_STORAGE_KEY,
  AutoRedirectState,
  readLastAutoRedirect,
  rememberAutoRedirect,
  shouldAutoRedirect,
} from "./sso-auto-redirect";

const now = Date.UTC(2026, 0, 15, 12, 0, 0);

const base: AutoRedirectState = {
  enforceSso: true,
  providerCount: 1,
  signedIn: false,
  pathname: "/login",
  search: "",
  lastRedirectAt: null,
  now,
};

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => (data.has(key) ? data.get(key)! : null),
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}

function throwingStorage(): Storage {
  const fail = () => {
    throw new DOMException("blocked", "SecurityError");
  };
  return {
    length: 0,
    clear: fail,
    getItem: fail,
    key: fail,
    removeItem: fail,
    setItem: fail,
  };
}

describe("shouldAutoRedirect", () => {
  it("redirects with enforced SSO, one provider and nobody signed in", () => {
    expect(shouldAutoRedirect(base)).toBe(true);
    expect(
      shouldAutoRedirect({ ...base, search: "?redirect=%2Fs%2Fdocs" }),
    ).toBe(true);
  });

  it("needs Enforce SSO", () => {
    expect(shouldAutoRedirect({ ...base, enforceSso: false })).toBe(false);
  });

  it("needs exactly one provider", () => {
    expect(shouldAutoRedirect({ ...base, providerCount: 0 })).toBe(false);
    expect(shouldAutoRedirect({ ...base, providerCount: 2 })).toBe(false);
  });

  it("never redirects a signed-in user", () => {
    expect(shouldAutoRedirect({ ...base, signedIn: true })).toBe(false);
  });

  it.each(["?logout=1", "?logout", "?sso_error=idp_error", "?sso_error="])(
    "skips when the URL has %s",
    (search) => {
      expect(shouldAutoRedirect({ ...base, search })).toBe(false);
    },
  );

  it("skips invitation pages", () => {
    expect(
      shouldAutoRedirect({ ...base, pathname: "/invites/0198c3a2-aaaa" }),
    ).toBe(false);
    expect(shouldAutoRedirect({ ...base, pathname: "/invites" })).toBe(false);
    expect(shouldAutoRedirect({ ...base, pathname: "/invitesx" })).toBe(true);
  });

  it("waits five minutes after an automatic redirect in this tab", () => {
    expect(shouldAutoRedirect({ ...base, lastRedirectAt: now - 1_000 })).toBe(
      false,
    );
    expect(
      shouldAutoRedirect({
        ...base,
        lastRedirectAt: now - AUTO_REDIRECT_COOLDOWN_MS + 1,
      }),
    ).toBe(false);
    expect(
      shouldAutoRedirect({
        ...base,
        lastRedirectAt: now - AUTO_REDIRECT_COOLDOWN_MS,
      }),
    ).toBe(true);
    expect(AUTO_REDIRECT_COOLDOWN_MS).toBe(5 * 60 * 1000);
  });

  it("treats a timestamp slightly in the future as recent", () => {
    expect(shouldAutoRedirect({ ...base, lastRedirectAt: now + 60_000 })).toBe(
      false,
    );
  });
});

describe("auto-redirect timestamp storage", () => {
  it("round-trips through session storage", () => {
    const storage = memoryStorage();
    expect(readLastAutoRedirect(storage)).toBeNull();
    rememberAutoRedirect(now, storage);
    expect(storage.getItem(AUTO_REDIRECT_STORAGE_KEY)).toBe(String(now));
    expect(readLastAutoRedirect(storage)).toBe(now);
  });

  it("ignores values that are not timestamps", () => {
    const storage = memoryStorage({ [AUTO_REDIRECT_STORAGE_KEY]: "soon" });
    expect(readLastAutoRedirect(storage)).toBeNull();
  });

  it("tolerates storage that is missing or throws", () => {
    expect(readLastAutoRedirect(null)).toBeNull();
    expect(readLastAutoRedirect(throwingStorage())).toBeNull();
    expect(() => rememberAutoRedirect(now, null)).not.toThrow();
    expect(() => rememberAutoRedirect(now, throwingStorage())).not.toThrow();
  });

  it("uses window.sessionStorage by default", () => {
    window.sessionStorage.removeItem(AUTO_REDIRECT_STORAGE_KEY);
    rememberAutoRedirect(now);
    expect(readLastAutoRedirect()).toBe(now);
    window.sessionStorage.removeItem(AUTO_REDIRECT_STORAGE_KEY);
  });
});
