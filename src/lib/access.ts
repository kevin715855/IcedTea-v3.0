export type Role = 'admin' | 'staff'

export interface Account {
  id: string
  username: string
  role: Role
  is_active: boolean
  valid_until: Date | null
}

export type AccessResult =
  | { ok: true; account: Account }
  | { ok: false; status: number; reason: string }

export function isAccountActive(account: Account, now: Date = new Date()): boolean {
  return account.is_active && (!account.valid_until || now < account.valid_until)
}

export function requireUser(account: Account | null, now: Date = new Date()): AccessResult {
  if (!account) {
    return { ok: false, status: 401, reason: 'unauthenticated' }
  }
  if (!isAccountActive(account, now)) {
    return { ok: false, status: 403, reason: 'inactive_or_expired' }
  }
  return { ok: true, account }
}

export function requireAdmin(result: AccessResult): AccessResult {
  if (!result.ok) {
    return result
  }
  const account = result.account
  if (account.role !== 'admin') {
    return { ok: false, status: 403, reason: 'admin_required' }
  }
  return result
}
