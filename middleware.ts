import NextAuth from "next-auth";
import authConfig from "@/lib/auth.config";

// Edge-safe auth instance (no MongoDB adapter) — middleware runs on the Edge runtime.
const { auth } = NextAuth(authConfig);

// apple-app-site-association must be reachable with no session — Apple's
// CDN fetches it directly to validate Universal Links (see
// docs/features/nfc.md's "Native setup"), never carrying a login cookie.
const PUBLIC_PAGE_PATHS = new Set(["/login", "/.well-known/apple-app-site-association"]);

export default auth((req) => {
  // Local dev escape hatch — lets you work without Google OAuth creds configured.
  // Never set SKIP_AUTH in the Vercel production environment.
  if (process.env.SKIP_AUTH === "true") return;

  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const isApiRoute = pathname.startsWith("/api");
  const isPublicPage = PUBLIC_PAGE_PATHS.has(pathname);

  console.log(`[middleware] ${pathname} — isLoggedIn:${isLoggedIn} isPublicPage:${isPublicPage} isApiRoute:${isApiRoute} token:`, JSON.stringify(req.auth));

  if (isLoggedIn && isPublicPage) {
    return Response.redirect(new URL("/tasks", req.nextUrl.origin));
  }

  if (!isLoggedIn && !isPublicPage) {
    if (isApiRoute) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return Response.redirect(loginUrl);
  }
});

export const config = {
  // Run on everything except static assets, images, PWA files, NextAuth's own
  // callback/session endpoints, and the external API (those must stay
  // reachable without a session — api/auth to establish one, api/external
  // because it's authenticated by its own API key instead and is called by
  // things like a Shortcuts App Intent that never has a session cookie to
  // send — see docs/features/app-intents.md).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth|api/external|manifest\\.json|sw\\.js|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)",
  ],
};
