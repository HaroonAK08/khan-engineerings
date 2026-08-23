import { NextResponse } from "next/server";

export function middleware() {
  // Auth cookie lives on the API host when frontend/API are on different Vercel URLs.
  // Session is verified client-side via /auth/me + AuthGuard instead.
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
