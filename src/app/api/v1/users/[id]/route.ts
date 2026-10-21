import { NextResponse } from 'next/server'
import { z } from 'zod'
import { updateUser } from '@/server/services/users'
import { AppError } from '@/lib/app-error'
import { writeAuditLog, getClientIp, getRequestId } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const updateUserSchema = z.object({
  valid_until: z.union([z.string().datetime('valid_until không hợp lệ'), z.null()]).optional(),
  is_active: z.boolean().optional(),
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

  const parsed = updateUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation error' }, { status: 422 })
  }

  const account = getAccount(req)

  try {
    const user = await updateUser(id, account!, {
      valid_until: parsed.data.valid_until ? new Date(parsed.data.valid_until) : undefined,
      is_active: parsed.data.is_active,
    }, getClientIp(req), getRequestId(req))

    await writeAuditLog({
      actorId: account!.id,
      action: 'user_update',
      targetId: user.id,
      ip: getClientIp(req),
      requestId: getRequestId(req),
      metadata: { changed: Object.keys(parsed.data), username: user.username },
    })

    return NextResponse.json({ ok: true, user })
  } catch (e: any) {
    if (e instanceof AppError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: 'lỗi server' }, { status: 500 })
  }
}
