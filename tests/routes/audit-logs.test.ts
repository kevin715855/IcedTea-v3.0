import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/password'
import { GET as auditGet } from '@/app/api/v1/audit-logs/route'

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const created: { users: string[] } = { users: [] }

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

async function writeLog(actorId: string | null, action: string, metadata: unknown) {
  await prisma.audit_logs.create({
    data: { actor_id: actorId, action, target_id: null, ip: null, request_id: null, metadata },
  })
}

beforeEach(async () => {
  created.users = []
})

afterEach(async () => {
  await prisma.audit_logs.deleteMany({ where: { actor_id: { in: created.users.filter(Boolean) } } })
  await prisma.users.deleteMany({ where: { id: { in: created.users.filter(Boolean) } } })
})

async function getAuditLogs(id: string | null, role: 'admin' | 'staff' | null, page?: number, page_size?: number) {
  const url = `/api/v1/audit-logs` + (page || page_size ? `?page=${page ?? 1}&page_size=${page_size ?? 20}` : '')
  return auditGet(req('GET', url, id, role, null))
}

describe('GET /api/v1/audit-logs', () => {
  it('staff cannot access audit logs', async () => {
    const staff = await createUser(`staff_a_${suffix}`, 'staff')
    const res = await getAuditLogs(staff.id, 'staff')
    expect(res.status).toBe(403)
  })

  it('unauthenticated request returns 401', async () => {
    const res = await getAuditLogs(null, null)
    expect(res.status).toBe(401)
  })

  it('admin gets paginated audit logs', async () => {
    const admin = await createUser(`adm_a_${suffix}`, 'admin')
    await writeLog(admin.id, 'checkin', { session_id: 's1', student_code: '20230001' })
    await writeLog(admin.id, 'checkin_duplicate', { session_id: 's1', student_code: '20230001' })
    await writeLog(admin.id, 'user_create', { username: 'nv1', role: 'staff' })

    const res = await getAuditLogs(admin.id, 'admin', 1, 2)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.total).toBe(3)
    expect(json.page).toBe(1)
    expect(json.page_size).toBe(2)
    expect(json.total_pages).toBe(2)
    expect(json.logs.length).toBe(2)
    expect(json.logs[0].action).toBe('user_create')
  })

  it('audit logs do not contain token or QR url', async () => {
    const admin = await createUser(`adm_a2_${suffix}`, 'admin')
    await writeLog(admin.id, 'checkin', { session_id: 's1', student_code: '20230001' })

    const res = await getAuditLogs(admin.id, 'admin')
    expect(res.status).toBe(200)
    const json = await res.json()
    const text = JSON.stringify(json)
    expect(text).not.toContain('token')
    expect(text).not.toContain('ctsv.hust.edu.vn')
  })
})
