import { IPagination } from "@/lib/types";

// Helpers for the compat stubs of features docmost-teams does not ship.
// None of them touch the network.

export class FeatureUnavailableError extends Error {
  constructor(feature: string) {
    super(`${feature} is not available in docmost-teams.`);
    this.name = "FeatureUnavailableError";
  }
}

export function rejectUnavailable(feature: string): Promise<never> {
  return Promise.reject(new FeatureUnavailableError(feature));
}

export function emptyPage<T>(limit = 0): IPagination<T> {
  return {
    items: [],
    meta: {
      limit,
      hasNextPage: false,
      hasPrevPage: false,
      nextCursor: null,
      prevCursor: null,
    },
  };
}

export function noop(): void {}
