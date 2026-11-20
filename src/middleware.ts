import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const host = (request.headers.get("host") || "").toLowerCase();
  const isLocalDev = host.startsWith("localhost") || host.startsWith("127.0.0.1");

  // Blokir akses browser langsung ke IP/port Next.js (:3000) agar trafik wajib via Nginx/Cloudflare
  if (!isLocalDev && (host.includes(":3000") || host.startsWith("172.16.10.131"))) {
    return new NextResponse(
      "Akses langsung ke port frontend (:3000) ditolak. Gunakan domain resmi melalui Nginx / Cloudflare.",
      { status: 403 },
    );
  }

  // Teruskan penanda proxy internal saat Next.js me-rewrite /api/* ke FastAPI Backend
  if (request.nextUrl.pathname.startsWith("/api")) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-forwarded-by-nginx", "true");
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
