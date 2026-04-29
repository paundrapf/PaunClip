import { NextRequest, NextResponse } from "next/server";

const LOCAL_TOKEN_COOKIE = "paunclip_local_token";

export function proxy(request: NextRequest) {
  const desktop = process.env.PAUNCLIP_DESKTOP === "1";
  const token = process.env.PAUNCLIP_LOCAL_TOKEN;
  if (!desktop || !token) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    const headerToken = request.headers.get("x-paunclip-token");
    const cookieToken = request.cookies.get(LOCAL_TOKEN_COOKIE)?.value;
    if (headerToken !== token && cookieToken !== token) {
      return NextResponse.json({ error: "Local desktop session token is missing." }, { status: 403 });
    }
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.cookies.set({
    name: LOCAL_TOKEN_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    path: "/"
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/).*)"]
};
