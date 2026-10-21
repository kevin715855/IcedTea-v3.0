import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/password'
import { GET as sessionsGet } from '@/app/api/v1/sessions/route'
import { POST as sessionsPost } from '@/app/api/v1/sessions/route'
import { PATCH as sessionPatch } from '@/app/api/v1/sessions/[id]/route'

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const created: { users: string[]; sessions: string[] } = { users: [], sessions: [] }

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

async function createUser(username: string, role: 'admin' | 'staff') {
  const user = await prisma.users.create({
    data: {
      username,
      password_hash: await hashPassword('Password1234'),
      role,
      is_active: true,
      valid_until: null,
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

async function patchSession(id: string, actorId: string, actorRole: 'admin' | 'staff', body: unknown) {
  return sessionPatch(
    req('PATCH', `/api/v1/sessions/${id}`, actorId, actorRole, body),
    { params: Promise.resolve({ id }) },
  )
}

beforeEach(async () => {
  created.users = []
  created.sessions = []
})

afterEach(async () => {
  await prisma.sessions.deleteMany({ where: { id: { in: created.sessions.filter(Boolean) } } })
  await prisma.audit_logs.deleteMany({ where: { actor_id: { in: created.users.filter(Boolean) } } })
  await prisma.users.deleteMany({ where: { id: { in: created.users.filter(Boolean) } } })
})

describe('GET /api/v1/sessions', () => {
  it('staff sees only open sessions', async () => {
    const staff = await createUser(`staff_list_${suffix}`, 'staff')
    const admin = await createUser(`adm_list_${suffix}`, 'admin')
    const now = new Date()
    const open = await createSessionRow(
      `mo_${suffix}`,
      new Date(now.getTime() - 60 * 60 * 1000),
      new Date(now.getTime() + 60 * 60 * 1000),
      admin.id,
    )
    const past = await createSessionRow(
      `qua_${suffix}`,
      new Date(now.getTime() - 2 * 60 * 60 * 1000),
      new Date(now.getTime() - 60 * 60 * 1000),
      admin.id,
    )
    const closed = await createSessionRow(
      `dong_${suffix}`,
      new Date(now.getTime() - 60 * 60 * 1000),
      new Date(now.getTime() + 60 * 60 * 1000),
      admin.id,
    )
    await prisma.sessions.update({
      where: { id: closed.id },
      data: { closed_at: new Date() },
    })

    const res = await sessionsGet(req('GET', '/api/v1/sessions', staff.id, 'staff', null))
    expect(res.status).toBe(200)
    const json = await res.json()
    const mine = json.sessions.filter((s: any) => s.name.includes(suffix))
    expect(mine.map((s: any) => s.id)).toEqual([open.id])
    expect(mine.map((s: any) => s.id)).not.toContain(past.id)
    expect(mine.map((s: any) => s.id)).not.toContain(closed.id)
  })

  it('admin sees all sessions', async () => {
    const admin = await createUser(`adm_list2_${suffix}`, 'admin')
    const now = new Date()
    const open = await createSessionRow(`mo2_${suffix}`, new Date(now.getTime() - 3600), new Date(now.getTime() + 3600), admin.id)
    const past = await createSessionRow(`qua2_${suffix}`, new Date(now.getTime() - 7200), new Date(now.getTime() - 3600), admin.id)

    const res = await sessionsGet(req('GET', '/api/v1/sessions', admin.id, 'admin', null))
    expect(res.status).toBe(200)
    const json = await res.json()
    const mine = json.sessions.filter((s: any) => s.name.includes(suffix))
    expect(mine.map((s: any) => s.id).sort()).toEqual([open.id, past.id].sort())
  })
})

describe('POST /api/v1/sessions', () => {
  it('staff cannot create a session', async () => {
    const staff = await createUser(`staff_create_${suffix}`, 'staff')
    const res = await sessionsPost(
      req('POST', '/api/v1/sessions', staff.id, 'staff', {
        name: 'buoi',
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 3600000).toISOString(),
      }),
    )
    expect(res.status).toBe(403)
  })

  it('admin creates a session', async () => {
    const admin = await createUser(`adm_create_${suffix}`, 'admin')
    const now = new Date()
    const res = await sessionsPost(
      req('POST', '/api/v1/sessions', admin.id, 'admin', {
        name: `buoi moi ${suffix}`,
        starts_at: new Date(now.getTime() - 3600).toISOString(),
        ends_at: new Date(now.getTime() + 3600).toISOString(),
      }),
    )
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.ok).toBe(true)
    created.sessions.push(json.session.id)
  })

  it('ends_at before starts_at returns 422', async () => {
    const admin = await createUser(`adm_create2_${suffix}`, 'admin')
    const now = new Date()
    const res = await sessionsPost(
      req('POST', '/api/v1/sessions', admin.id, 'admin', {
        name: 'buoi',
        starts_at: new Date(now.getTime() + 3600).toISOString(),
        ends_at: new Date(now.getTime() - 3600).toISOString(),
      }),
    )
    expect(res.status).toBe(422)
  })
})

describe('PATCH /api/v1/sessions/:id', () => {
  it('admin closes a session', async () => {
    const admin = await createUser(`adm_close_${suffix}`, 'admin')
    const now = new Date()
    const session = await createSessionRow(
      `dong_${suffix}`,
      new Date(now.getTime() - 3600),
      new Date(now.getTime() + 3600),
      admin.id,
    )

    const res = await patchSession(session.id, admin.id, 'admin', {
      closed_at: new Date().toISOString(),
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.session.closed_at).not.toBeNull()
  })

  it('staff cannot update a session', async () => {
    const staff = await createUser(`staff_close_${suffix}`, 'staff')
    const admin = await createUser(`adm_close2_${suffix}`, 'admin')
    const now = new Date()
    const session = await createSessionRow(
      `dong2_${suffix}`,
      new Date(now.getTime() - 3600),
      new Date(now.getTime() + 3600),
      admin.id,
    )

    const res = await patchSession(session.id, staff.id, 'staff', {
      closed_at: new Date().toISOString(),
    })
    expect(res.status).toBe(403)
  })

  it('closed session cannot be edited', async () => {
    const admin = await createUser(`adm_close3_${suffix}`, 'admin')
    const now = new Date()
    const session = await createSessionRow(
      `dong3_${suffix}`,
      new Date(now.getTime() - 3600),
      new Date(now.getTime() + 3600),
      admin.id,
    )
    await patchSession(session.id, admin.id, 'admin', { closed_at: new Date().toISOString() })

    const res = await patchSession(session.id, admin.id, 'admin', {
      name: 'ten moi',
    })
    expect(res.status).toBe(422)
  })
})
