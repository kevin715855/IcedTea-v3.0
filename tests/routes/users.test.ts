import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/password'
import { POST as usersPost } from '@/app/api/v1/users/route'
import { GET as usersGet } from '@/app/api/v1/users/route'
import { PATCH as usersPatch } from '@/app/api/v1/users/[id]/route'
import { POST as loginPost } from '@/app/api/v1/auth/login/route'

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

beforeEach(async () => {
  created.users = []
})

afterEach(async () => {
  await prisma.audit_logs.deleteMany({ where: { actor_id: { in: created.users.filter(Boolean) } } })
  await prisma.users.deleteMany({ where: { id: { in: created.users.filter(Boolean) } } })
})

describe('GET /api/v1/users', () => {
  it('staff cannot list users', async () => {
    const staff = await createUser(`staff_u_${suffix}`, 'staff')
    const res = await usersGet(req('GET', '/api/v1/users', staff.id, 'staff', null))
    expect(res.status).toBe(403)
  })

  it('admin lists users', async () => {
    const admin = await createUser(`adm_u_${suffix}`, 'admin')
    await createUser(`staff_a_${suffix}`, 'staff')

    const res = await usersGet(req('GET', '/api/v1/users', admin.id, 'admin', null))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.users.map((u: any) => u.username).sort()).toContain(`staff_a_${suffix}`)
    expect(json.users.every((u: any) => u.role === 'staff' || u.role === 'admin')).toBe(true)
  })
})

describe('POST /api/v1/users', () => {
  it('staff cannot create a staff account', async () => {
    const staff = await createUser(`staff_c_${suffix}`, 'staff')
    const res = await usersPost(req('POST', '/api/v1/users', staff.id, 'staff', { username: `nv_${suffix}` }))
    expect(res.status).toBe(403)
  })

  it('admin creates a staff account and receives a one-time password', async () => {
    const admin = await createUser(`adm_c_${suffix}`, 'admin')
    const res = await usersPost(req('POST', '/api/v1/users', admin.id, 'admin', { username: `nv_${suffix}` }))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.user.username).toBe(`nv_${suffix}`)
    expect(json.user.role).toBe('staff')
    expect(json.user.is_active).toBe(true)
    expect(typeof json.password).toBe('string')
    expect(json.password.length).toBeGreaterThanOrEqual(10)
    created.users.push(json.user.id)

    // The returned password can log in
    const login = await loginPost(req('POST', '/auth/login', null, null, { username: `nv_${suffix}`, password: json.password }))
    expect(login.status).toBe(200)
  })

  it('duplicate username returns 422', async () => {
    const admin = await createUser(`adm_c2_${suffix}`, 'admin')
    await createUser(`nv_${suffix}`, 'staff')

    const res = await usersPost(req('POST', '/api/v1/users', admin.id, 'admin', { username: `nv_${suffix}` }))
    expect(res.status).toBe(422)
  })
})

describe('PATCH /api/v1/users/:id', () => {
  it('staff cannot update accounts', async () => {
    const staff = await createUser(`staff_u2_${suffix}`, 'staff')
    const target = await createUser(`nv_t_${suffix}`, 'staff')
    const res = await usersPatch(
      req('PATCH', `/api/v1/users/${target.id}`, staff.id, 'staff', { is_active: false }),
      { params: Promise.resolve({ id: target.id }) },
    )
    expect(res.status).toBe(403)
  })

  it('admin extends valid_until', async () => {
    const admin = await createUser(`adm_u2_${suffix}`, 'admin')
    const target = await createUser(`nv_u2_${suffix}`, 'staff')
    const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const res = await usersPatch(
      req('PATCH', `/api/v1/users/${target.id}`, admin.id, 'admin', { valid_until: until }),
      { params: Promise.resolve({ id: target.id }) },
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.user.valid_until).not.toBeNull()
    created.users.push(target.id)
  })

  it('admin locks and unlocks an account', async () => {
    const admin = await createUser(`adm_u3_${suffix}`, 'admin')
    const target = await createUser(`nv_u3_${suffix}`, 'staff')

    const locked = await usersPatch(
      req('PATCH', `/api/v1/users/${target.id}`, admin.id, 'admin', { is_active: false }),
      { params: Promise.resolve({ id: target.id }) },
    )
    expect(locked.status).toBe(200)
    const lockedJson = await locked.json()
    expect(lockedJson.user.is_active).toBe(false)

    const unlocked = await usersPatch(
      req('PATCH', `/api/v1/users/${target.id}`, admin.id, 'admin', { is_active: true }),
      { params: Promise.resolve({ id: target.id }) },
    )
    expect(unlocked.status).toBe(200)
    const unlockedJson = await unlocked.json()
    expect(unlockedJson.user.is_active).toBe(true)
    created.users.push(target.id)
  })

  it('admin cannot lock themselves', async () => {
    const admin = await createUser(`adm_u4_${suffix}`, 'admin')

    const res = await usersPatch(
      req('PATCH', `/api/v1/users/${admin.id}`, admin.id, 'admin', { is_active: false }),
      { params: Promise.resolve({ id: admin.id }) },
    )
    expect(res.status).toBe(422)
  })

  it('unknown account returns 404', async () => {
    const admin = await createUser(`adm_u5_${suffix}`, 'admin')
    const res = await usersPatch(
      req('PATCH', '/api/v1/users/00000000-0000-0000-0000-000000000000', admin.id, 'admin', { is_active: false }),
      { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) },
    )
    expect(res.status).toBe(404)
  })
})
