import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/password'
import { signAccessToken } from '@/lib/auth'
import { middleware } from '@/middleware'
import { NextRequest } from 'next/server'

const created: string[] = []

async function createUser(username: string, role: 'admin' | 'staff', isActive: boolean, validUntil: Date | null) {
  const u = await prisma.users.create({
    data: { username, password_hash: await hashPassword('Password1234'), role, is_active: isActive, valid_until: validUntil },
  })
  created.push(u.id)
  return u
}

function requestWithToken(token: string) {
  return new NextRequest('http://localhost:3000/api/v1/checkins', {
    headers: { cookie: `access_token=${token}` },
  })
}

afterEach(async () => {
  await prisma.users.deleteMany({ where: { id: { in: created } } })
  created.length = 0
})

describe('middleware', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'middleware-test-secret'
  })

  it('returns 401 without a token', async () => {
    const res = await middleware(new NextRequest('http://localhost:3000/api/v1/checkins'))
    expect(res.status).toBe(401)
  })

  it('returns 403 for an expired account', async () => {
    const user = await createUser(`exp_mw_${Date.now()}`, 'staff', true, new Date('2020-01-01T00:00:00Z'))
    const token = signAccessToken({ userId: user.id, username: 'exp', role: 'staff' }, 900)
    const res = await middleware(requestWithToken(token))
    expect(res.status).toBe(403)
  })

  it('returns 403 for an inactive account', async () => {
    const user = await createUser(`inact_mw_${Date.now()}`, 'staff', false, null)
    const token = signAccessToken({ userId: user.id, username: 'inact', role: 'staff' }, 900)
    const res = await middleware(requestWithToken(token))
    expect(res.status).toBe(403)
  })

  it('lets an active account through', async () => {
    const user = await createUser(`act_mw_${Date.now()}`, 'staff', true, null)
    const token = signAccessToken({ userId: user.id, username: 'act', role: 'staff' }, 900)
    const res = await middleware(requestWithToken(token))
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })
})
