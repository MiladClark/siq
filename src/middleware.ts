import { NextResponse, type NextRequest } from "next/server";
import { DESKTOP_CLIENT_HEADER, DESKTOP_ORIGIN } from "@/lib/desktop-origin";

export function middleware(request: NextRequest) {
  const allowedOrigin = request.headers.get("origin") === DESKTOP_ORIGIN;
  const preflight = request.method === "OPTIONS" &&
    request.headers.has("access-control-request-method");

  if (preflight && !allowedOrigin) {
    return new NextResponse(null, { status: 403, headers: { Vary: "Origin" } });
  }

  const response = preflight ? new NextResponse(null, { status: 204 }) : NextResponse.next();
  response.headers.append("Vary", "Origin");
  if (allowedOrigin) {
    response.headers.set("Access-Control-Allow-Origin", DESKTOP_ORIGIN);
  }
  if (preflight) {
    response.headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", `Authorization, Content-Type, Range, ${DESKTOP_CLIENT_HEADER}`);
    response.headers.set("Access-Control-Max-Age", "600");
  }
  return response;
}

export const config = { matcher: "/api/:path*" };
