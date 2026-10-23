import { NextResponse } from 'next/server'
import { listAuditLogs } from '@/server/services/audit'
import { AppError } from '@/lib/app-error'

export const dynamic = 'force-dynamic'

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
  const originError = getOriginCheck(req)
  if (originError) return originError

  const account = getAccount(req)
  if (!account) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const url = new URL(req.url)
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'))
  const page_size = Math.min(100, Math.max(1, Number(url.searchParams.get('page_size') || '20')))

  try {
    const result = await listAuditLogs(account, { page, page_size })
    return NextResponse.json(result)
  } catch (e: any) {
    if (e instanceof AppError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: 'lỗi server' }, { status: 500 })
  }
}
