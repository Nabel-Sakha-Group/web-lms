import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow access to login page and API routes
  if (pathname === '/login' || pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Check if user has session token (set client-side after login)
  const sessionToken = request.cookies.get('sb-access-token');
  
  // If no session and trying to access protected route, redirect to login
  if (!sessionToken && pathname !== '/login') {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
