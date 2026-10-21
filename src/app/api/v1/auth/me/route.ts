import { NextResponse } from 'next/server'
import type { Account } from '@/lib/access'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const id = req.headers.get('x-user-id')
  const role = req.headers.get('x-user-role')
  if (!id || !role) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  return NextResponse.json({
    account: {
      id,
      username: req.headers.get('x-user-username') ?? '',
      role: role as 'admin' | 'staff',
      is_active: true,
      valid_until: null,
    },
  })
}
