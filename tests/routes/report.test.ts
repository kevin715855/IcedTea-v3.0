import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/password'
import { GET as reportGet } from '@/app/api/v1/sessions/[id]/report/route'

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

async function createCheckin(sessionId: string, scannedBy: string, studentCode: string, checkedInAt: Date) {
  const checkin = await prisma.checkins.create({
    data: { session_id: sessionId, student_code: studentCode, scanned_by: scannedBy, checked_in_at: checkedInAt },
  })
  created.checkins.push(checkin.id)
  return checkin
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

async function getReport(sessionId: string, id: string | null, role: 'admin' | 'staff' | null, format?: string) {
  const url = `/api/v1/sessions/${sessionId}/report` + (format ? `?format=${format}` : '')
  return reportGet(req('GET', url, id, role, null), { params: Promise.resolve({ id: sessionId }) })
}

describe('GET /api/v1/sessions/:id/report', () => {
  it('staff cannot access a session report', async () => {
    const staff = await createUser(`staff_r_${suffix}`, 'staff')
    const admin = await createUser(`adm_r_${suffix}`, 'admin')
    const session = await createSessionRow(
      `buoi_r_${suffix}`,
      new Date(Date.now() - 60 * 60 * 1000),
      new Date(Date.now() + 60 * 60 * 1000),
      admin.id,
    )

    const res = await getReport(session.id, staff.id, 'staff')
    expect(res.status).toBe(403)
  })

  it('admin gets report for a session with no check-ins', async () => {
    const admin = await createUser(`adm_r2_${suffix}`, 'admin')
    const session = await createSessionRow(
      `buoi_r2_${suffix}`,
      new Date(Date.now() - 60 * 60 * 1000),
      new Date(Date.now() + 60 * 60 * 1000),
      admin.id,
    )

    const res = await getReport(session.id, admin.id, 'admin')
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.session.id).toBe(session.id)
    expect(json.total_checkins).toBe(0)
    expect(json.staff).toEqual([])
  })

  it('report matches per-staff metrics', async () => {
    const admin = await createUser(`adm_r3_${suffix}`, 'admin')
    const staff1 = await createUser(`staff_r3a_${suffix}`, 'staff')
    const staff2 = await createUser(`staff_r3b_${suffix}`, 'staff')
    const session = await createSessionRow(
      `buoi_r3_${suffix}`,
      new Date(Date.now() - 60 * 60 * 1000),
      new Date(Date.now() + 60 * 60 * 1000),
      admin.id,
    )

    const now = new Date()
    const t0 = new Date(now.getTime())
    const t1 = new Date(now.getTime() + 5 * 60 * 1000) // +5 min
    const t2 = new Date(now.getTime() + 9 * 60 * 1000) // +9 min (4 min after t1)
    const t3 = new Date(now.getTime() + 20 * 60 * 1000) // +20 min (11 min after t2)

    await createCheckin(session.id, staff1.id, '20230001', t0)
    await createCheckin(session.id, staff1.id, '20230002', t1)
    await createCheckin(session.id, staff1.id, '20230003', t2)
    await createCheckin(session.id, staff2.id, '202400001', t3)

    const res = await getReport(session.id, admin.id, 'admin')
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.total_checkins).toBe(4)

    const byStaff = new Map(json.staff.map((s: any) => [s.staff_id, s]))
    const s1 = byStaff.get(staff1.id)
    expect(s1.checkin_count).toBe(3)
    expect(s1.first_checkin).toBe(t0.toISOString())
    expect(s1.last_checkin).toBe(t2.toISOString())
    // shortest interval: min(5min, 4min) = 4 min
    expect(s1.shortest_interval_minutes).toBe(4)

    const s2 = byStaff.get(staff2.id)
    expect(s2.checkin_count).toBe(1)
    expect(s2.shortest_interval_minutes).toBeNull()
  })

  it('cancelled check-ins are excluded from the report', async () => {
    const admin = await createUser(`adm_r4_${suffix}`, 'admin')
    const staff = await createUser(`staff_r4_${suffix}`, 'staff')
    const session = await createSessionRow(
      `buoi_r4_${suffix}`,
      new Date(Date.now() - 60 * 60 * 1000),
      new Date(Date.now() + 60 * 60 * 1000),
      admin.id,
    )

    const now = new Date()
    const active = await createCheckin(session.id, staff.id, '20230001', now)
    const cancelled = await createCheckin(session.id, staff.id, '20230002', new Date(now.getTime() + 60000))
    await prisma.checkins.update({
      where: { id: cancelled.id },
      data: { cancelled_at: new Date(), cancelled_by: admin.id, cancel_reason: 'quét nhầm' },
    })

    const res = await getReport(session.id, admin.id, 'admin')
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.total_checkins).toBe(1)
    expect(json.staff[0].checkin_count).toBe(1)
  })

  it('unknown session returns 404', async () => {
    const admin = await createUser(`adm_r5_${suffix}`, 'admin')
    const res = await getReport('00000000-0000-0000-0000-000000000000', admin.id, 'admin')
    expect(res.status).toBe(404)
  })

  it('CSV export returns text/csv with staff rows', async () => {
    const admin = await createUser(`adm_r6_${suffix}`, 'admin')
    const staff = await createUser(`staff_r6_${suffix}`, 'staff')
    const session = await createSessionRow(
      `buoi_r6_${suffix}`,
      new Date(Date.now() - 60 * 60 * 1000),
      new Date(Date.now() + 60 * 60 * 1000),
      admin.id,
    )

    const now = new Date()
    await createCheckin(session.id, staff.id, '20230001', now)

    const res = await getReport(session.id, admin.id, 'admin', 'csv')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    const text = await res.text()
    expect(text).toContain('staff_id,username,checkin_count,first_checkin,last_checkin,shortest_interval_minutes')
    expect(text).toContain(staff.id)
    expect(text).toContain('1')
  })

  it('unauthenticated request returns 401', async () => {
    const admin = await createUser(`adm_r7_${suffix}`, 'admin')
    const session = await createSessionRow(
      `buoi_r7_${suffix}`,
      new Date(Date.now() - 60 * 60 * 1000),
      new Date(Date.now() + 60 * 60 * 1000),
      admin.id,
    )

    const res = await reportGet(req('GET', `/api/v1/sessions/${session.id}/report`, null, null, null), {
      params: Promise.resolve({ id: session.id }),
    })
    expect(res.status).toBe(401)
  })
})
