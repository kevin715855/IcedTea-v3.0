import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/password'
import { POST as checkinPost } from '@/app/api/v1/checkins/route'
import { DELETE as checkinDelete } from '@/app/api/v1/checkins/[id]/route'

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
