import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic redirect only: real authorisation happens in requireAdmin() on
 * every admin page and server action.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const open = ["/admin/login", "/admin/forgot", "/admin/reset"].some((p) => pathname.startsWith(p));
  if (!open && !req.cookies.has("admin_session")) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin", "/admin/:path*"] };
