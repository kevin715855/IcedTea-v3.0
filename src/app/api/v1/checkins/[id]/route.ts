import { NextResponse } from 'next/server'
import { z } from 'zod'
import { cancelCheckin } from '@/server/services/checkins'
import { AppError } from '@/lib/app-error'
import { writeAuditLog, getClientIp, getRequestId } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const cancelSchema = z.object({
  cancel_reason: z.string().min(1, 'Ly do huỷ là bắt buộc'),
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

export async function DELETE(
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

  const parsed = cancelSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation error' }, { status: 422 })
  }

  const account = getAccount(req)

  try {
    const checkin = await cancelCheckin(id, parsed.data.cancel_reason, account!)
    await writeAuditLog({
      actorId: account!.id,
      action: 'checkin_cancel',
      targetId: checkin.id,
      ip: getClientIp(req),
      requestId: getRequestId(req),
      metadata: { cancel_reason: checkin.cancel_reason, student_code: checkin.student_code },
    })
    return NextResponse.json({ ok: true, checkin })
  } catch (e: any) {
    if (e instanceof AppError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: 'lỗi server' }, { status: 500 })
  }
}
