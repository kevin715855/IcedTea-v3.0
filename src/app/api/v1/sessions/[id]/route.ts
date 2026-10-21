import { NextResponse } from 'next/server'
import { z } from 'zod'
import { updateSession } from '@/server/services/sessions'
import { AppError } from '@/lib/app-error'
import { writeAuditLog, getClientIp, getRequestId } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const updateSessionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  starts_at: z.string().datetime('starts_at không hợp lệ').optional(),
  ends_at: z.string().datetime('ends_at không hợp lệ').optional(),
  closed_at: z.union([z.string().datetime(), z.null()]).optional(),
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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = getOriginCheck(req)
  if (originError) return originError

  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 422 })
  }

  const parsed = updateSessionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation error' }, { status: 422 })
  }

  const account = getAccount(req)
  const input: {
    name?: string
    starts_at?: Date
    ends_at?: Date
    closed_at?: Date | null
  } = {}
  if (parsed.data.name !== undefined) input.name = parsed.data.name
  if (parsed.data.starts_at !== undefined) input.starts_at = new Date(parsed.data.starts_at)
  if (parsed.data.ends_at !== undefined) input.ends_at = new Date(parsed.data.ends_at)
  if (parsed.data.closed_at !== undefined) input.closed_at = parsed.data.closed_at ? new Date(parsed.data.closed_at) : null

  try {
    const session = await updateSession(id, input, account!)
    const closed = input.closed_at !== undefined ? input.closed_at : session.closed_at
    await writeAuditLog({
      actorId: account!.id,
      action: 'session_update',
      targetId: session.id,
      ip: getClientIp(req),
      requestId: getRequestId(req),
      metadata: {
        name: session.name,
        closed_at: closed,
        changed: Object.keys(input),
      },
    })
    return NextResponse.json({ ok: true, session })
  } catch (e: any) {
    if (e instanceof AppError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: 'lỗi server' }, { status: 500 })
  }
}
