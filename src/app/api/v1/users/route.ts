import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createStaff, listUsers } from '@/server/services/users'
import { AppError } from '@/lib/app-error'
import { writeAuditLog, getClientIp, getRequestId } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const createStaffSchema = z.object({
  username: z.string().min(1, 'Tên đăng nhập không được để trống').max(255),
  valid_until: z.union([z.string().datetime('valid_until không hợp lệ'), z.null()]).optional(),
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
  if (!account) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  try {
    const users = await listUsers(account)
    return NextResponse.json({ users })
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

  const parsed = createStaffSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation error' }, { status: 422 })
  }

  const account = getAccount(req)
  try {
    const result = await createStaff(account!, {
      username: parsed.data.username,
      valid_until: parsed.data.valid_until ? new Date(parsed.data.valid_until) : null,
    })

    await writeAuditLog({
      actorId: account!.id,
      action: 'user_create',
      targetId: result.id,
      ip: getClientIp(req),
      requestId: getRequestId(req),
      metadata: { username: result.username },
    })

    // Password is returned exactly once; it is not stored in plain text anywhere else.
    return NextResponse.json({ ok: true, user: result, password: result.password }, { status: 201 })
  } catch (e: any) {
    if (e instanceof AppError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: 'lỗi server' }, { status: 500 })
  }
}
