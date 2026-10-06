export type Tier =
  | "free"
  | "standard"
  | "business"
  | "enterprise"
  | "docmost-teams";

export type Entitlements = {
  cloud: boolean;
  tier: Tier;
  features: string[];
};
