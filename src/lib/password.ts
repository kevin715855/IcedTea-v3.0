import bcrypt from 'bcryptjs'

export const PASSWORD_MIN_LENGTH = 10

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, error: `Mật khẩu tối thiểu ${PASSWORD_MIN_LENGTH} ký tự` }
  }
  return { valid: true }
}
