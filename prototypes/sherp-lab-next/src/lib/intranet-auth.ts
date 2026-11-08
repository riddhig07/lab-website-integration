import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const INTRANET_COOKIE = "sherp_intranet";

function tokenForPassword(password: string): string {
  return createHash("sha256").update(`sherp:${password}`).digest("hex");
}

export function intranetPasswordConfigured(): boolean {
  return Boolean(process.env.INTRANET_PASSWORD?.length);
}

export function verifyIntranetPassword(password: string): boolean {
  const expected = process.env.INTRANET_PASSWORD;
  if (!expected) return true;
  const a = Buffer.from(tokenForPassword(password));
  const b = Buffer.from(tokenForPassword(expected));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function intranetSessionToken(): string | null {
  const expected = process.env.INTRANET_PASSWORD;
  if (!expected) return "dev-open";
  return tokenForPassword(expected);
}

export async function hasIntranetSession(): Promise<boolean> {
  const token = intranetSessionToken();
  if (!token) return false;
  const jar = await cookies();
  return jar.get(INTRANET_COOKIE)?.value === token;
}

export function intranetCookieValue(): string {
  return intranetSessionToken() ?? "";
}
