import { describe, it, expect, beforeEach } from 'vitest'
import { signAccessToken, verifyAccessToken } from '@/lib/auth'

describe('auth', () => {
  const payload = { userId: 'u1', username: 'admin', role: 'admin' as const }

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-do-not-use-in-production'
  })

  it('signs and verifies a JWT', () => {
    const token = signAccessToken(payload, 900)
    expect(typeof token).toBe('string')

    const decoded = verifyAccessToken(token)
    expect(decoded).not.toBeNull()
    if (decoded) {
      expect(decoded.userId).toBe('u1')
      expect(decoded.username).toBe('admin')
      expect(decoded.role).toBe('admin')
    }
  })

  it('rejects a tampered token', () => {
    expect(verifyAccessToken('aaaa.bbbb.cccc')).toBeNull()
  })

  it('rejects an empty token', () => {
    expect(verifyAccessToken('')).toBeNull()
  })
})
