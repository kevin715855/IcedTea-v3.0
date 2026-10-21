import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPassword } from '@/lib/password'
import { signAccessToken, buildSetCookie } from '@/lib/auth'
import { loginSchema } from '@/lib/validation'
import { writeAuditLog, getClientIp, getRequestId } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  // Origin check on write route (CSRF mitigation)
  const origin = req.headers.get('origin')
  const expectedOrigin = process.env.NEXT_PUBLIC_APP_URL
  if (expectedOrigin && origin && origin !== expectedOrigin) {
    return NextResponse.json({ error: 'invalid origin' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 422 })
  }

  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation error' }, { status: 422 })
  }

  const { username, password } = parsed.data

  // Generic 401 for any auth failure (avoid user enumeration)
  const user = await prisma.users.findUnique({ where: { username } })
  if (!user) {
    return NextResponse.json({ error: 'invalid credentials' }, { status: 401 })
  }

  const passwordOk = await verifyPassword(password, user.password_hash)
  if (!passwordOk) {
    return NextResponse.json({ error: 'invalid credentials' }, { status: 401 })
  }

  const now = new Date()
  if (!user.is_active) {
    return NextResponse.json({ error: 'account inactive' }, { status: 403 })
  }
  if (user.valid_until && now >= user.valid_until) {
    return NextResponse.json({ error: 'account expired' }, { status: 403 })
  }

  const defaultExpiresIn = Number(process.env.JWT_EXPIRES_IN) || 900
  let expiresIn = defaultExpiresIn
  if (user.valid_until) {
    const remainingSec = Math.floor((user.valid_until.getTime() - now.getTime()) / 1000)
    if (remainingSec <= 0) {
      return NextResponse.json({ error: 'account expired' }, { status: 403 })
    }
    expiresIn = Math.min(defaultExpiresIn, remainingSec)
  }

  const token = signAccessToken(
    { userId: user.id, username: user.username, role: user.role as 'admin' | 'staff' },
    expiresIn,
  )

  await writeAuditLog({
    actorId: user.id,
    action: 'login',
    targetId: user.id,
    ip: getClientIp(req),
    requestId: getRequestId(req),
    metadata: { username: user.username, role: user.role },
  })

  return NextResponse.json(
    { ok: true, user: { id: user.id, username: user.username, role: user.role } },
    { headers: { 'Set-Cookie': buildSetCookie(token, expiresIn) } },
  )
}
