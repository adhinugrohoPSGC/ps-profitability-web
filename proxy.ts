import { NextResponse, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  // Auth removed — redirect /login straight to the app
  if (request.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
