import { NextResponse } from 'next/server'
import { z } from 'zod'
import { listSessions, createSession, type CreateSessionInput } from '@/server/services/sessions'
import { AppError } from '@/lib/app-error'
import { writeAuditLog, getClientIp, getRequestId } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const createSessionSchema = z.object({
  name: z.string().min(1, 'Tên buổi không được để trống').max(255),
  starts_at: z.string().datetime('starts_at không hợp lệ'),
  ends_at: z.string().datetime('ends_at không hợp lệ'),
})

function getOriginCheck(req: Request): Response | null {
  const expectedOrigin = process.env.NEXT_PUBLIC_APP_URL
  const origin = req.headers.get('origin')
  if (expectedOrigin && origin && origin !== expectedOrigin) {
    return NextResponse.json({ error: 'invalid origin' }, { status: 403 })
  }
  return null
}

function getAccount(req: Request) {
  const id = req.headers.get('x-user-id')
  const role = req.headers.get('x-user-role')
  if (!id || !role) return null
  return {
    id,
    username: req.headers.get('x-user-username') ?? '',
    role: role as 'admin' | 'staff',
    is_active: true,
    valid_until: null,
  }
}

export async function GET(req: Request) {
  const account = getAccount(req)
  try {
    const sessions = await listSessions(account)
    return NextResponse.json({ sessions })
  } catch (e: any) {
    if (e instanceof AppError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: 'lỗi server' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const originError = getOriginCheck(req)
  if (originError) return originError

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 422 })
  }

  const parsed = createSessionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation error' }, { status: 422 })
  }

  const account = getAccount(req)
  const input: CreateSessionInput = {
    name: parsed.data.name,
    starts_at: new Date(parsed.data.starts_at),
    ends_at: new Date(parsed.data.ends_at),
  }

  try {
    const session = await createSession(input, account!)
    await writeAuditLog({
      actorId: account!.id,
      action: 'session_create',
      targetId: session.id,
      ip: getClientIp(req),
      requestId: getRequestId(req),
      metadata: { name: session.name },
    })
    return NextResponse.json({ ok: true, session }, { status: 201 })
  } catch (e: any) {
    if (e instanceof AppError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: 'lỗi server' }, { status: 500 })
  }
}
