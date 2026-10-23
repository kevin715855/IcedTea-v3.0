import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/password'
import { POST as checkinPost } from '@/app/api/v1/checkins/route'
import { DELETE as checkinDelete } from '@/app/api/v1/checkins/[id]/route'
import { GET as checkinGet } from '@/app/api/v1/checkins/route'

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const created: { users: string[]; sessions: string[]; checkins: string[] } = {
  users: [],
  sessions: [],
  checkins: [],
}

function req(method: string, url: string, id: string | null, role: 'admin' | 'staff' | null, body: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (id) headers['x-user-id'] = id
  if (role) headers['x-user-role'] = role
  return new Request(`http://localhost:3000${url}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

async function createUser(username: string, role: 'admin' | 'staff', validUntil: Date | null = null) {
  const user = await prisma.users.create({
    data: {
      username,
      password_hash: await hashPassword('Password1234'),
      role,
      is_active: true,
      valid_until: validUntil,
    },
  })
  created.users.push(user.id)
  return user
}

async function createSessionRow(name: string, startsAt: Date, endsAt: Date, createdBy: string) {
  const session = await prisma.sessions.create({
    data: { name, starts_at: startsAt, ends_at: endsAt, created_by: createdBy },
  })
  created.sessions.push(session.id)
  return session
}

beforeEach(async () => {
  created.users = []
  created.sessions = []
  created.checkins = []
})

afterEach(async () => {
  await prisma.checkins.deleteMany({ where: { id: { in: created.checkins.filter(Boolean) } } })
  await prisma.sessions.deleteMany({ where: { id: { in: created.sessions.filter(Boolean) } } })
  await prisma.audit_logs.deleteMany({ where: { actor_id: { in: created.users.filter(Boolean) } } })
  await prisma.users.deleteMany({ where: { id: { in: created.users.filter(Boolean) } } })
})

describe('POST /api/v1/checkins', () => {
  it('staff checks in successfully', async () => {
    const staff = await createUser(`staff_ok_${suffix}`, 'staff')
    const admin = await createUser(`adm_ok_${suffix}`, 'admin')
    const session = await createSessionRow(
      `buoi_${suffix}`,
      new Date(Date.now() - 60 * 60 * 1000),
      new Date(Date.now() + 60 * 60 * 1000),
      admin.id,
    )

    const res = await checkinPost(
      req('POST', '/api/v1/checkins', staff.id, 'staff', {
        session_id: session.id,
        student_code: '20230001',
      }),
    )
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.checkin.student_code).toBe('20230001')
    created.checkins.push(json.checkin.id)
  })

  it('admin can also check in', async () => {
    const admin = await createUser(`adm_check_${suffix}`, 'admin')
    const session = await createSessionRow(
      `buoi2_${suffix}`,
      new Date(Date.now() - 60 * 60 * 1000),
      new Date(Date.now() + 60 * 60 * 1000),
      admin.id,
    )

    const res = await checkinPost(
      req('POST', '/api/v1/checkins', admin.id, 'admin', {
        session_id: session.id,
        student_code: '202400001',
      }),
    )
    expect(res.status).toBe(201)
    const json = await res.json()
    created.checkins.push(json.checkin.id)
  })

  it('duplicate check-in returns 409', async () => {
    const staff = await createUser(`staff_dup_${suffix}`, 'staff')
    const admin = await createUser(`adm_dup_${suffix}`, 'admin')
    const session = await createSessionRow(
      `buoi3_${suffix}`,
      new Date(Date.now() - 60 * 60 * 1000),
      new Date(Date.now() + 60 * 60 * 1000),
      admin.id,
    )

    const first = await checkinPost(
      req('POST', '/api/v1/checkins', staff.id, 'staff', {
        session_id: session.id,
        student_code: '20230001',
      }),
    )
    expect(first.status).toBe(201)
    const json = await first.json()
    created.checkins.push(json.checkin.id)

    const second = await checkinPost(
      req('POST', '/api/v1/checkins', staff.id, 'staff', {
        session_id: session.id,
        student_code: '20230001',
      }),
    )
    expect(second.status).toBe(409)
  })

  it('out-of-hours session returns 422', async () => {
    const staff = await createUser(`staff_oot_${suffix}`, 'staff')
    const admin = await createUser(`adm_oot_${suffix}`, 'admin')
    const session = await createSessionRow(
      `buoi4_${suffix}`,
      new Date(Date.now() - 2 * 60 * 60 * 1000),
      new Date(Date.now() - 60 * 60 * 1000),
      admin.id,
    )

    const res = await checkinPost(
      req('POST', '/api/v1/checkins', staff.id, 'staff', {
        session_id: session.id,
        student_code: '20230001',
      }),
    )
    expect(res.status).toBe(422)
  })

  it('invalid MSSV returns 422', async () => {
    const staff = await createUser(`staff_inv_${suffix}`, 'staff')
    const admin = await createUser(`adm_inv_${suffix}`, 'admin')
    const session = await createSessionRow(
      `buoi6_${suffix}`,
      new Date(Date.now() - 60 * 60 * 1000),
      new Date(Date.now() + 60 * 60 * 1000),
      admin.id,
    )

    const res = await checkinPost(
      req('POST', '/api/v1/checkins', staff.id, 'staff', {
        session_id: session.id,
        student_code: 'abc12345',
      }),
    )
    expect(res.status).toBe(422)
  })
})

describe('DELETE /api/v1/checkins/:id', () => {
  it('staff cannot cancel a check-in', async () => {
    const staff = await createUser(`staff_cancel_${suffix}`, 'staff')
    const admin = await createUser(`adm_cancel_${suffix}`, 'admin')
    const session = await createSessionRow(
      `buoi7_${suffix}`,
      new Date(Date.now() - 60 * 60 * 1000),
      new Date(Date.now() + 60 * 60 * 1000),
      admin.id,
    )

    const first = await checkinPost(
      req('POST', '/api/v1/checkins', staff.id, 'staff', {
        session_id: session.id,
        student_code: '20230001',
      }),
    )
    const json = await first.json()
    created.checkins.push(json.checkin.id)

    const res = await checkinDelete(
      req('DELETE', `/api/v1/checkins/${json.checkin.id}`, staff.id, 'staff', {
        cancel_reason: 'sai mssv',
      }),
      { params: Promise.resolve({ id: json.checkin.id }) },
    )
    expect(res.status).toBe(403)
  })

  it('admin cancels with reason and student can re-scan', async () => {
    const staff = await createUser(`staff_cancel2_${suffix}`, 'staff')
    const admin = await createUser(`adm_cancel2_${suffix}`, 'admin')
    const session = await createSessionRow(
      `buoi8_${suffix}`,
      new Date(Date.now() - 60 * 60 * 1000),
      new Date(Date.now() + 60 * 60 * 1000),
      admin.id,
    )

    const first = await checkinPost(
      req('POST', '/api/v1/checkins', staff.id, 'staff', {
        session_id: session.id,
        student_code: '20230001',
      }),
    )
    const json = await first.json()
    created.checkins.push(json.checkin.id)

    const res = await checkinDelete(
      req('DELETE', `/api/v1/checkins/${json.checkin.id}`, admin.id, 'admin', {
        cancel_reason: 'quét nhầm',
      }),
      { params: Promise.resolve({ id: json.checkin.id }) },
    )
    expect(res.status).toBe(200)
    const deleted = await res.json()
    expect(deleted.checkin.cancel_reason).toBe('quét nhầm')
    expect(deleted.checkin.cancelled_at).not.toBeNull()

    const again = await checkinPost(
      req('POST', '/api/v1/checkins', staff.id, 'staff', {
        session_id: session.id,
        student_code: '20230001',
      }),
    )
    expect(again.status).toBe(201)
    const againJson = await again.json()
    created.checkins.push(againJson.checkin.id)
  })

  it('missing cancel reason returns 422', async () => {
    const staff = await createUser(`staff_cancel3_${suffix}`, 'staff')
    const admin = await createUser(`adm_cancel3_${suffix}`, 'admin')
    const session = await createSessionRow(
      `buoi9_${suffix}`,
      new Date(Date.now() - 60 * 60 * 1000),
      new Date(Date.now() + 60 * 60 * 1000),
      admin.id,
    )

    const first = await checkinPost(
      req('POST', '/api/v1/checkins', staff.id, 'staff', {
        session_id: session.id,
        student_code: '20230001',
      }),
    )
    const json = await first.json()
    created.checkins.push(json.checkin.id)

    const res = await checkinDelete(
      req('DELETE', `/api/v1/checkins/${json.checkin.id}`, admin.id, 'admin', {
        cancel_reason: '',
      }),
      { params: Promise.resolve({ id: json.checkin.id }) },
    )
    expect(res.status).toBe(422)
  })
})

describe('GET /api/v1/checkins', () => {
  async function checkinList(url: string, id: string | null, role: 'admin' | 'staff' | null) {
    return checkinGet(req('GET', url, id, role, null))
  }

  it('staff sees only their own check-ins', async () => {
    const staff = await createUser(`staff_list_${suffix}`, 'staff')
    const admin = await createUser(`adm_list_${suffix}`, 'admin')
    const session = await createSessionRow(
      `buoi_list_${suffix}`,
      new Date(Date.now() - 60 * 60 * 1000),
      new Date(Date.now() + 60 * 60 * 1000),
      admin.id,
    )

    const mine1 = await checkinPost(req('POST', '/api/v1/checkins', staff.id, 'staff', { session_id: session.id, student_code: '20230001' }))
    const mine2 = await checkinPost(req('POST', '/api/v1/checkins', staff.id, 'staff', { session_id: session.id, student_code: '20230002' }))
    const json1 = await mine1.json()
    const json2 = await mine2.json()
    created.checkins.push(json1.checkin.id, json2.checkin.id)

    const other = await createUser(`staff_other_${suffix}`, 'staff')
    const otherRes = await checkinPost(req('POST', '/api/v1/checkins', other.id, 'staff', { session_id: session.id, student_code: '20230003' }))
    const otherJson = await otherRes.json()
    created.checkins.push(otherJson.checkin.id)

    const res = await checkinList('/api/v1/checkins', staff.id, 'staff')
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.checkins.map((c: any) => c.id).sort()).toEqual([json1.checkin.id, json2.checkin.id].sort())
    expect(json.total).toBe(2)
  })

  it('admin sees all check-ins', async () => {
    const staff = await createUser(`staff_admin_list_${suffix}`, 'staff')
    const admin = await createUser(`adm_admin_list_${suffix}`, 'admin')
    const session = await createSessionRow(
      `buoi_admin_list_${suffix}`,
      new Date(Date.now() - 60 * 60 * 1000),
      new Date(Date.now() + 60 * 60 * 1000),
      admin.id,
    )

    const mine = await checkinPost(req('POST', '/api/v1/checkins', staff.id, 'staff', { session_id: session.id, student_code: '20230001' }))
    const json = await mine.json()
    created.checkins.push(json.checkin.id)

    const res = await checkinList('/api/v1/checkins', admin.id, 'admin')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.checkins.some((c: any) => c.id === json.checkin.id)).toBe(true)
  })

  it('filtering by session works', async () => {
    const staff = await createUser(`staff_fs_${suffix}`, 'staff')
    const admin = await createUser(`adm_fs_${suffix}`, 'admin')
    const session = await createSessionRow(
      `buoi_fs_${suffix}`,
      new Date(Date.now() - 60 * 60 * 1000),
      new Date(Date.now() + 60 * 60 * 1000),
      admin.id,
    )
    const other = await createSessionRow(
      `buoi_fs2_${suffix}`,
      new Date(Date.now() - 60 * 60 * 1000),
      new Date(Date.now() + 60 * 60 * 1000),
      admin.id,
    )

    const res = await checkinPost(req('POST', '/api/v1/checkins', staff.id, 'staff', { session_id: session.id, student_code: '20230001' }))
    const json = await res.json()
    created.checkins.push(json.checkin.id)

    const list = await checkinList(`/api/v1/checkins?session_id=${other.id}`, staff.id, 'staff')
    const body = await list.json()
    expect(body.total).toBe(0)

    const list2 = await checkinList(`/api/v1/checkins?session_id=${session.id}`, staff.id, 'staff')
    const body2 = await list2.json()
    expect(body2.total).toBe(1)
  })

  it('filtering by student_code works', async () => {
    const staff = await createUser(`staff_sc_${suffix}`, 'staff')
    const admin = await createUser(`adm_sc_${suffix}`, 'admin')
    const session = await createSessionRow(
      `buoi_sc_${suffix}`,
      new Date(Date.now() - 60 * 60 * 1000),
      new Date(Date.now() + 60 * 60 * 1000),
      admin.id,
    )

    await checkinPost(req('POST', '/api/v1/checkins', staff.id, 'staff', { session_id: session.id, student_code: '20230001' }))
    await checkinPost(req('POST', '/api/v1/checkins', staff.id, 'staff', { session_id: session.id, student_code: '20230002' }))
    const other = await createUser(`staff_sc_other_${suffix}`, 'staff')
    const otherRes = await checkinPost(req('POST', '/api/v1/checkins', other.id, 'staff', { session_id: session.id, student_code: '20230003' }))
    const otherJson = await otherRes.json()
    created.checkins.push(otherJson.checkin.id)

    const res = await checkinList(`/api/v1/checkins?student_code=20230001`, staff.id, 'staff')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(1)
    expect(body.checkins.every((c: any) => c.student_code === '20230001')).toBe(true)

    // staff filtering another staff's code sees nothing (permission scoping applies)
    const res2 = await checkinList(`/api/v1/checkins?student_code=20230003`, staff.id, 'staff')
    const body2 = await res2.json()
    expect(body2.total).toBe(0)
  })

  it('pagination page and page_size works', async () => {
    const staff = await createUser(`staff_pg_${suffix}`, 'staff')
    const admin = await createUser(`adm_pg_${suffix}`, 'admin')
    const session = await createSessionRow(
      `buoi_pg_${suffix}`,
      new Date(Date.now() - 60 * 60 * 1000),
      new Date(Date.now() + 60 * 60 * 1000),
      admin.id,
    )

    for (const code of ['20230001', '20230002', '20230003', '20230004', '20230005']) {
      const res = await checkinPost(req('POST', '/api/v1/checkins', staff.id, 'staff', { session_id: session.id, student_code: code }))
      const json = await res.json()
      created.checkins.push(json.checkin.id)
    }

    const page1 = await checkinList(`/api/v1/checkins?page=1&page_size=2`, staff.id, 'staff')
    const b1 = await page1.json()
    expect(b1.checkins.length).toBe(2)
    expect(b1.total).toBe(5)
    expect(b1.page).toBe(1)
    expect(b1.page_size).toBe(2)
    expect(b1.total_pages).toBe(3)

    const page2 = await checkinList(`/api/v1/checkins?page=2&page_size=2`, staff.id, 'staff')
    const b2 = await page2.json()
    expect(b2.checkins.length).toBe(2)
    expect(b2.total_pages).toBe(3)

    const page3 = await checkinList(`/api/v1/checkins?page=3&page_size=2`, staff.id, 'staff')
    const b3 = await page3.json()
    expect(b3.checkins.length).toBe(1)
    expect(b3.total_pages).toBe(3)
  })

  it('partial unique index exists at database level', async () => {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename='checkins' AND indexdef LIKE '%cancelled_at IS NULL%'`
    )
    expect(rows.length).toBeGreaterThan(0)
    expect(String(rows[0].indexdef)).toContain('UNIQUE')
    expect(String(rows[0].indexdef)).toContain('WHERE (cancelled_at IS NULL)')
  })

  it('duplicate check-in 409 includes checked_in_at detail', async () => {
    const staff = await createUser(`staff_dup2_${suffix}`, 'staff')
    const admin = await createUser(`adm_dup2_${suffix}`, 'admin')
    const session = await createSessionRow(
      `buoi_dup2_${suffix}`,
      new Date(Date.now() - 60 * 60 * 1000),
      new Date(Date.now() + 60 * 60 * 1000),
      admin.id,
    )

    const first = await checkinPost(req('POST', '/api/v1/checkins', staff.id, 'staff', { session_id: session.id, student_code: '20230001' }))
    const json = await first.json()
    created.checkins.push(json.checkin.id)

    const second = await checkinPost(req('POST', '/api/v1/checkins', staff.id, 'staff', { session_id: session.id, student_code: '20230001' }))
    expect(second.status).toBe(409)
    const body = await second.json()
    expect(body.error).toBe('đã điểm danh')
    expect(body.detail.checked_in_at).toBe(json.checkin.checked_in_at)
  })
})
