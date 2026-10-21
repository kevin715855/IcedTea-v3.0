import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildClearCookie } from '@/lib/auth'
import { requireUser, type Account } from '@/lib/access'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const userId = req.headers.get('x-user-id')
  const user = userId ? await prisma.users.findUnique({ where: { id: userId } }) : null
  const result = requireUser(user as Account | null)
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status })
  }

  return NextResponse.json({ ok: true }, { headers: { 'Set-Cookie': buildClearCookie() } })
}
