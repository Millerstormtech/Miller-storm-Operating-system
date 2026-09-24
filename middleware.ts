import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { resolveSubdomain } from './src/lib/subdomain';

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  const url = request.nextUrl.clone();
  const { pathname } = url;
  
  // Handle CORS for API routes
  if (pathname.startsWith('/api')) {
    const response = NextResponse.next();
    
    // Add CORS headers
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Access-Control-Max-Age', '86400');
    
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, { status: 200, headers: response.headers });
    }
    
    return response;
  }
  
  // Skip middleware for Next.js internal routes and static files
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }
  
  // Extract subdomain (e.g., "jett" from "jett.millerstorm.tech"). Never
  // treats an IP host (IPv4 or bracketed IPv6), localhost, or "www" as a
  // subdomain, so hitting the app by IP address never 404s every page.
  const subdomain = resolveSubdomain(hostname);

  if (subdomain) {
    // Rewrite to /[username] route
    url.pathname = `/${subdomain}${pathname === '/' ? '' : pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // api/docs is excluded because whenever middleware runs on a request with
    // a body, Next copies that body for it and caps the copy at 10MB
    // (proxyClientMaxBodySize), and the route then reads the truncated copy —
    // so every Docs & SOPs upload over 10MB would fail. Only same-origin page
    // code calls /api/docs, and next.config.mjs still adds the CORS headers
    // for /api/*, so this middleware has nothing to do there.
    '/((?!_next/static|_next/image|favicon.ico|api/docs).*)',
  ],
};
