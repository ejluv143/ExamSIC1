import { NextResponse, type NextRequest } from "next/server";
import { Result } from "effect";
import { clientOf } from "@examinus/domain/client";
import { homeFor, roleNames, roleOf } from "@examinus/domain/roles";
import { applyCookies, callApi, forwardedHeaders } from "@/lib/api/client";
import { pageSecurityHeaders } from "@/lib/security-headers";

// The system administrator's back office: its own address, "admin." in front of whatever host the rest of the
// app answers to (admin.examinus.app in production, admin.localhost:3000 in dev — browsers resolve *.localhost
// to the loopback address on their own, no /etc/hosts entry needed). Same app, same database: Better Auth's
// cookie is host-only, so a session open on the main site does not carry over here, and signing in here does not
// carry over there either — each is its own sign-in, the way a separate site would be. Any path other than its
// own ("/admin" and under) or its login page lands on the dashboard; anyone signed in who isn't the platform
// admin is sent back to their own area on the main address instead.
const backOfficePrefix = "admin.";
const isBackOffice = (host: string) => host.toLowerCase().startsWith(backOfficePrefix);
const mainOrigin = (protocol: string, host: string) => `${protocol}//${host.slice(backOfficePrefix.length)}`;

// Gives every page its security headers, and sends people to the right page. The data layer still verifies
// every request and every permission.
export default async function proxy(req: NextRequest) {
  // A fresh nonce per page. The renderer reads it from the request's CSP header and puts it on its inline scripts.
  const headers = pageSecurityHeaders(btoa(crypto.randomUUID()));
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("content-security-policy", headers["Content-Security-Policy"]);

  const response = await route(req, requestHeaders);
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
}

async function route(req: NextRequest, requestHeaders: Headers) {
  const { pathname, search } = req.nextUrl;
  // The Host header, not `req.nextUrl.host`: the dev server's own origin can differ from what the browser asked
  // for (that's the whole point of the admin subdomain), and `nextUrl` does not always reflect it.
  const host = req.headers.get("host") ?? req.nextUrl.host;
  const backOffice = isBackOffice(host);

  // The desktop app never shows the landing page: its start page signs in or joins with a key.
  if (pathname === "/" && !backOffice && clientOf(req.headers.get("user-agent") ?? undefined).kind === "desktop")
    return NextResponse.redirect(new URL("/desktop", req.nextUrl));

  // The back office's address only ever shows its own pages or its login: no landing page, no sign-up, nothing
  // of the other roles'. Anything else lands on its dashboard.
  if (backOffice && pathname !== "/login" && !pathname.startsWith("/admin")) {
    return NextResponse.redirect(new URL("/admin", req.nextUrl));
  }

  // Each role has its own area: /admin, /teacher, /student. /organizations is open to every signed-in account.
  const area = roleNames.find((r) => pathname === `/${r}` || pathname.startsWith(`/${r}/`)) ?? null;
  const picker = pathname === "/organizations" || pathname.startsWith("/organizations/");
  // Only these pages depend on who is signed in; the rest skip the session lookup.
  if (!area && !picker && pathname !== "/login" && pathname !== "/register") {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const session = await callApi((api) => api["auth.session"](), forwardedHeaders(req.headers));
  const user = Result.isSuccess(session) ? session.success.user : null;
  const role = user ? roleOf(user) : null;

  let response: NextResponse;
  if (backOffice && role && role !== "admin") {
    response = NextResponse.redirect(new URL(homeFor(role), mainOrigin(req.nextUrl.protocol, host)));
  } else if ((area || picker) && !user) {
    const login = new URL("/login", req.nextUrl);
    login.searchParams.set("next", pathname + search);
    response = NextResponse.redirect(login);
  } else if (area && role && role !== area) {
    response = NextResponse.redirect(new URL(homeFor(role), req.nextUrl));
  } else if (pathname === "/login" && role) {
    // Already signed in. /register stays open on the main site, so "Start free" always reaches it; signing up
    // switches accounts. The back office has no /register, so a signed-in admin just goes to its dashboard.
    response = NextResponse.redirect(new URL(backOffice ? "/admin" : homeFor(role), req.nextUrl));
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }
  // Better Auth extends active sessions; pass the refreshed cookie on to the browser.
  if (Result.isSuccess(session)) applyCookies(response.cookies, session.success.cookies);
  return response;
}

export const config = {
  // Every page. Not the API forwards, built assets, or files from public/ (anything with an extension).
  matcher: ["/((?!api/|_next/|assets/|__vinext/|.*\\.[^/]+$).*)"],
};
