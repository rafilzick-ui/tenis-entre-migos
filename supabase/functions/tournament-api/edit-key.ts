import { createHash, timingSafeEqual } from "node:crypto";

const PEPPER = Deno.env.get("TOURNAMENT_KEY_PEPPER") ?? "";

export function hashEditKey(editKey: string): string {
  return createHash("sha256")
    .update(`${PEPPER}:${editKey}`)
    .digest("hex");
}

export function editKeyMatches(editKey: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashEditKey(editKey), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
