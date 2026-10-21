import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, validatePassword, PASSWORD_MIN_LENGTH } from '@/lib/password'

describe('password', () => {
  it('enforces minimum length', () => {
    expect(validatePassword('short').valid).toBe(false)
    expect(validatePassword('a'.repeat(PASSWORD_MIN_LENGTH)).valid).toBe(true)
    expect(validatePassword('').valid).toBe(false)
  })

  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('SecurePass1234')
    expect(typeof hash).toBe('string')
    expect(hash.length).toBeGreaterThan(0)
    expect(await verifyPassword('SecurePass1234', hash)).toBe(true)
    expect(await verifyPassword('WrongPass1234', hash)).toBe(false)
  })
})
