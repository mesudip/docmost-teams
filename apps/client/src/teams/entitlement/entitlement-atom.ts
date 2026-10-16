import { atom, PrimitiveAtom } from "jotai";
import { Entitlements } from "./entitlement.types";

// Filled by the core UserProvider once the entitlements query resolves.
// With strictNullChecks off, a bare `null` argument would match jotai's
// read-only overload, so the initial value is typed explicitly.
export const entitlementAtom: PrimitiveAtom<Entitlements | null> = atom(
  null as Entitlements | null,
);
