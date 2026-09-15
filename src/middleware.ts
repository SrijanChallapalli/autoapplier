import { NextResponse, type NextRequest } from "next/server";
import { authEnabled, verifySessionToken, COOKIE_NAME } from "@/lib/auth";

// Gate every request behind the password login when APP_PASSWORD is set.
// When it isn't (local dev, the default), this is a pass-through no-op.
export async function middleware(req: NextRequest) {
  if (!authEnabled()) return NextResponse.next();

  const { pathname } = req.nextUrl;

  // Always-open paths: the login screen itself, the auth endpoints it calls,
  // and the health check (used by uptime probes that can't log in).
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/health"
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (await verifySessionToken(token)) return NextResponse.next();

  // API calls get a clean 401; page navigations get redirected to the login
  // screen with a `next` param so we can bounce back after signing in.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

// Run on everything except Next's static assets and the favicon.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
