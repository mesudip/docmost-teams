import { emptyPage } from "@/teams/edition/unsupported";
import { IAuthProvider } from "../types/security.types";

export async function getSsoProviders() {
  return emptyPage<IAuthProvider>();
}
