import { NextResponse } from "next/server";
import {
  INTRANET_COOKIE,
  intranetCookieValue,
  intranetPasswordConfigured,
  verifyIntranetPassword,
} from "@/lib/intranet-auth";

export async function POST(request: Request) {
  const body = (await request.json()) as { password?: string };
  const password = body.password ?? "";

  if (intranetPasswordConfigured() && !verifyIntranetPassword(password)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(INTRANET_COOKIE, intranetCookieValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}
