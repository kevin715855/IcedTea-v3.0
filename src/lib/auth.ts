import jwt from 'jsonwebtoken'

function getSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET environment variable is required')
  return secret
}

export interface SessionPayload {
  userId: string
  username: string
  role: 'admin' | 'staff'
}

export function signAccessToken(payload: SessionPayload, expiresInSeconds: number): string {
  return jwt.sign(payload, getSecret(), { expiresIn: expiresInSeconds, subject: payload.userId })
}

export function verifyAccessToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, getSecret()) as SessionPayload
  } catch {
    return null
  }
}

export function getTokenFromRequest(req: Request): string | null {
  const cookie = req.headers.get('cookie') ?? ''
  const match = cookie.match(/(?:^|;\s*)access_token=([^;]*)/)
  return match ? match[1] : null
}

// Secure flag is off in local development (HTTP) so login works on http://localhost:3000.
// On Vercel (HTTPS, NODE_ENV=production) it is enforced.
const isSecure = process.env.NODE_ENV === 'production'

export function buildSetCookie(token: string, maxAgeSeconds: number): string {
  return `access_token=${token}; HttpOnly; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Strict${isSecure ? '; Secure' : ''}`
}

export function buildClearCookie(): string {
  return `access_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict${isSecure ? '; Secure' : ''}`
}
