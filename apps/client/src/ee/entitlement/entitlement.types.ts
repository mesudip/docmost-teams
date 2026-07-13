export type Tier =
  | "free"
  | "standard"
  | "business"
  | "enterprise"
  | "mesudip-fork";

export type Entitlements = {
  cloud: boolean;
  tier: Tier;
  features: string[];
};
