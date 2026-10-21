import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyAccessToken, getTokenFromRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

const PUBLIC_PATHS = ['/api/v1/auth/login', '/api/v1/health']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (!pathname.startsWith('/api/v1/')) {
    return NextResponse.next()
  }
  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next()
  }

  const token = getTokenFromRequest(req)
  if (!token) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const payload = verifyAccessToken(token)
  if (!payload) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const user = await prisma.users.findUnique({ where: { id: payload.userId } })
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const now = new Date()
  if (!user.is_active || (user.valid_until && now >= user.valid_until)) {
    return NextResponse.json({ error: 'inactive_or_expired' }, { status: 403 })
  }

  const headers = new Headers(req.headers)
  headers.set('x-user-id', user.id)
  headers.set('x-user-role', user.role)
  headers.set('x-user-username', user.username)

  return NextResponse.next({
    request: { headers },
  })
}

export const config = {
  matcher: '/api/v1/:path*',
}
