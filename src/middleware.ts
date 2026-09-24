import { NextResponse, type NextRequest } from "next/server";
import { REQUEST_WORKSPACE_HEADER } from "@/domain/workspace-context";

export function middleware(request: NextRequest) {
  const segments = request.nextUrl.pathname.split("/").filter(Boolean);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(REQUEST_WORKSPACE_HEADER);
  if (segments[0] === "workspaces" && segments[1]) {
    requestHeaders.set(REQUEST_WORKSPACE_HEADER, segments[1]);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (segments[0] === "api") {
    if (segments[1] !== "workspaces" || !segments[2] || !segments.slice(3).length) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    requestHeaders.set(REQUEST_WORKSPACE_HEADER, segments[2]);
    const destination = request.nextUrl.clone();
    destination.pathname = `/api/${segments.slice(3).join("/")}`;
    return NextResponse.rewrite(destination, { request: { headers: requestHeaders } });
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/api/:path*", "/workspaces/:workspaceId/:path*", "/workspaces/:workspaceId"],
};
