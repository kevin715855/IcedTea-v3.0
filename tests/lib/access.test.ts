import { describe, it, expect } from 'vitest'
import { isAccountActive, requireUser, requireAdmin } from '@/lib/access'

const now = new Date('2026-10-21T00:00:00Z')

const activeAdmin = {
  id: '1',
  username: 'admin',
  role: 'admin' as const,
  is_active: true,
  valid_until: null,
}
const activeStaff = {
  id: '2',
  username: 'staff',
  role: 'staff' as const,
  is_active: true,
  valid_until: null,
}
const expiredStaff = {
  id: '3',
  username: 'staff',
  role: 'staff' as const,
  is_active: true,
  valid_until: new Date('2026-01-01'),
}
const inactiveStaff = {
  id: '4',
  username: 'staff',
  role: 'staff' as const,
  is_active: false,
  valid_until: null,
}

describe('access', () => {
  it('isAccountActive for active account', () => {
    expect(isAccountActive(activeAdmin, now)).toBe(true)
    expect(isAccountActive(activeStaff, now)).toBe(true)
  })

  it('isAccountActive false for expired account', () => {
    expect(isAccountActive(expiredStaff, now)).toBe(false)
  })

  it('isAccountActive false for inactive account', () => {
    expect(isAccountActive(inactiveStaff, now)).toBe(false)
  })

  it('requireUser allows active account', () => {
    const r = requireUser(activeAdmin, now)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.account.username).toBe('admin')
  })

  it('requireUser returns 401 for null account', () => {
    const r = requireUser(null, now)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(401)
      expect(r.reason).toBe('unauthenticated')
    }
  })

  it('requireUser returns 403 for expired account', () => {
    const r = requireUser(expiredStaff, now)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(403)
      expect(r.reason).toBe('inactive_or_expired')
    }
  })

  it('requireUser returns 403 for inactive account', () => {
    const r = requireUser(inactiveStaff, now)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(403)
  })

  it('requireAdmin allows admin', () => {
    const r = requireAdmin(requireUser(activeAdmin, now))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.account.role).toBe('admin')
  })

  it('requireAdmin rejects staff', () => {
    const r = requireAdmin(requireUser(activeStaff, now))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(403)
      expect(r.reason).toBe('admin_required')
    }
  })

  it('requireAdmin propagates unauthenticated', () => {
    const r = requireAdmin(requireUser(null, now))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(401)
  })
})
