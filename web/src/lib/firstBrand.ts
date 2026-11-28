import { api } from "./api";
import { newBrandId } from "./brands";
import { DEFAULT_PROFILES } from "./profiles";
import type { User } from "./session";
import type { Profile } from "./types";

/** The brand a person with none starts with: named after them, with nothing of anyone else's on it. */
export function firstBrand(user?: Pick<User, "fullName">, rand?: () => number): Profile {
  const name = (user?.fullName ?? "").replace(/\s+/g, " ").trim().slice(0, 60) || "My brand";
  return { ...structuredClone(DEFAULT_PROFILES[0]), id: newBrandId(name, [], rand), name, displayName: name, logoText: name.toUpperCase() };
}

/**
 * Save a person's first brand and open it. Every page does this before it shows anything, so no page ever works on a
 * brand the server does not have.
 */
export async function createFirstBrand(user?: Pick<User, "fullName">): Promise<void> {
  const brand = firstBrand(user);
  await api.createProfile(brand);
  await api.putPreference("activeProfile", brand.id).catch(() => undefined); // only means the choice is not remembered
}
