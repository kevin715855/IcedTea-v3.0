import { NextResponse } from 'next/server'
import { getSessionReport } from '@/server/services/sessions'
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

function escapeCsv(field: string | null | undefined): string {
  if (field === null || field === undefined) return ''
  const s = String(field)
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = getOriginCheck(req)
  if (originError) return originError

  const { id } = await params
  const account = getAccount(req)
  if (!account) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const url = new URL(req.url)
  const format = url.searchParams.get('format')

  try {
    const report = await getSessionReport(id, account)
    if (format === 'csv') {
      const lines = [
        'staff_id,username,checkin_count,first_checkin,last_checkin,shortest_interval_minutes',
        ...report.staff.map((s) =>
          [
            escapeCsv(s.staff_id),
            escapeCsv(s.username),
            s.checkin_count,
            escapeCsv(s.first_checkin?.toISOString()),
            escapeCsv(s.last_checkin?.toISOString()),
            s.shortest_interval_minutes === null ? '' : String(s.shortest_interval_minutes),
          ].join(','),
        ),
      ]
      return new Response(lines.join('\n'), {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="report-${id}.csv"`,
        },
      })
    }
    return NextResponse.json(report)
  } catch (e: any) {
    if (e instanceof AppError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: 'lỗi server' }, { status: 500 })
  }
}
