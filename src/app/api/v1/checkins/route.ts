import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createCheckin, listCheckins } from '@/server/services/checkins'
import { AppError } from '@/lib/app-error'
import { writeAuditLog, getClientIp, getRequestId } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const checkinSchema = z.object({
  session_id: z.string().uuid('session_id không hợp lệ'),
  student_code: z.string().min(1, 'Mã sinh viên không được để trống'),
})

function getListFilter(req: Request) {
  const url = new URL(req.url)
  const session_id = url.searchParams.get('session_id') || undefined
  const student_code = url.searchParams.get('student_code') || undefined
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'))
  const page_size = Math.min(100, Math.max(1, Number(url.searchParams.get('page_size') || '20')))
  return { session_id, student_code, page, page_size }
}

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

function auditMeta(req: Request, sessionId: string, studentCode: string) {
  return {
    ip: getClientIp(req),
    requestId: getRequestId(req),
    metadata: { session_id: sessionId, student_code: studentCode },
  }
}

export async function GET(req: Request) {
  const account = getAccount(req)
  try {
    const result = await listCheckins(account, getListFilter(req))
    return NextResponse.json(result)
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

  const parsed = checkinSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation error' }, { status: 422 })
  }

  const account = getAccount(req)
  const { session_id, student_code } = parsed.data

  try {
    const checkin = await createCheckin(session_id, student_code, account ?? null)
    await writeAuditLog({
      actorId: account!.id,
      action: 'checkin',
      targetId: checkin.id,
      ...auditMeta(req, session_id, student_code),
    })
    return NextResponse.json({ ok: true, checkin }, { status: 201 })
  } catch (e: any) {
    if (e instanceof AppError) {
      const action = e.status === 409 ? 'checkin_duplicate' : 'checkin_rejected'
      await writeAuditLog({
        actorId: account?.id ?? null,
        action,
        targetId: null,
        ...auditMeta(req, session_id, student_code),
      })
      const body: { error: string; detail?: Record<string, unknown> } = { error: e.message }
      if (e.extras) {
        body.detail = e.extras
      }
      return NextResponse.json(body, { status: e.status })
    }
    return NextResponse.json({ error: 'lỗi server' }, { status: 500 })
  }
}
