import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";

type AuthMw = (request: NextRequest, event: NextFetchEvent) => ReturnType<
  typeof NextResponse.next
>;

const PROTECTED = [/^\/dashboard/, /^\/battle\/new/, /^\/battle\/[^/]+\/join/];

const authProtected = auth((req) => {
  const { pathname } = req.nextUrl;
  const needsAuth = PROTECTED.some((re) => re.test(pathname));
  if (!needsAuth) return NextResponse.next();
  if (!req.auth) {
    const url = new URL("/api/auth/signin", req.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}) as unknown as AuthMw;

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  const pathname = req.nextUrl.pathname;
  const needsAuth = PROTECTED.some((re) => re.test(pathname));
  if (!needsAuth) return NextResponse.next();

  return authProtected(req, event);
}

/** Auth + `_next` excluded: no host-swap here (see DevHostRedirect + `next dev -H 127.0.0.1`). */
export const config = {
  matcher: ["/dashboard/:path*", "/battle/new", "/battle/:id/join"]
};
