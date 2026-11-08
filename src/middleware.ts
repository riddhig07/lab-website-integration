import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE = "sherp_intranet";
const PROTECTED_PREFIXES = ["/intranet", "/meetings", "/ai-note-taker", "/lab-drive"];

async function sessionToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`sherp:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(request: NextRequest) {
  const password = process.env.INTRANET_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = request.nextUrl;
  const protectedPath = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!protectedPath) return NextResponse.next();

  if (pathname.startsWith("/intranet/login") || pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const expected = await sessionToken(password);
  if (request.cookies.get(COOKIE)?.value === expected) {
    return NextResponse.next();
  }

  const login = new URL("/intranet/login", request.url);
  login.searchParams.set("from", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/intranet/:path*", "/meetings/:path*", "/meetings", "/ai-note-taker", "/lab-drive"],
};
