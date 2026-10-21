import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { AppError } from '@/lib/app-error'
import { hashPassword } from '@/lib/password'
import { requireAdmin, type Account } from '@/lib/access'
import { writeAuditLog, getClientIp, getRequestId } from '@/lib/audit'

export interface UserData {
  id: string
  username: string
  role: string
  is_active: boolean
  valid_from: Date | null
  valid_until: Date | null
  created_by: string | null
  created_at: Date
}

export interface CreateStaffInput {
  username: string
  valid_until?: Date | null
}

export interface CreateStaffResult extends UserData {
  password: string
}

function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let password = ''
  for (let i = 0; i < length; i++) {
    password += chars[crypto.randomInt(chars.length)]
  }
  return password
}

export async function listUsers(actor: Account): Promise<UserData[]> {
  const admin = requireAdmin({ ok: true, account: actor })
  if (!admin.ok) {
    throw new AppError(admin.status, admin.reason)
  }

  return prisma.users.findMany({
    orderBy: { created_at: 'desc' },
    select: { id: true, username: true, role: true, is_active: true, valid_from: true, valid_until: true, created_by: true, created_at: true },
  })
}

export async function createStaff(actor: Account, input: CreateStaffInput): Promise<CreateStaffResult> {
  const admin = requireAdmin({ ok: true, account: actor })
  if (!admin.ok) {
    throw new AppError(admin.status, admin.reason)
  }

  const existing = await prisma.users.findUnique({ where: { username: input.username } })
  if (existing) {
    throw new AppError(422, 'tên đăng nhập đã tồn tại')
  }

  const password = generatePassword()
  const passwordHash = await hashPassword(password)

  const user = await prisma.users.create({
    data: {
      username: input.username,
      password_hash: passwordHash,
      role: 'staff',
      is_active: true,
      valid_until: input.valid_until ?? null,
      created_by: actor.id,
    },
    select: { id: true, username: true, role: true, is_active: true, valid_from: true, valid_until: true, created_by: true, created_at: true },
  })

  await writeAuditLog({
    actorId: actor.id,
    action: 'user_create',
    targetId: user.id,
    ip: null,
    requestId: null,
    metadata: { username: user.username, role: user.role },
  })

  return { ...user, password }
}

export interface UpdateUserInput {
  valid_until?: Date | null
  is_active?: boolean
}

export async function updateUser(
  id: string,
  actor: Account,
  input: UpdateUserInput,
  ip: string | null = null,
  requestId: string | null = null,
): Promise<UserData> {
  const admin = requireAdmin({ ok: true, account: actor })
  if (!admin.ok) {
    throw new AppError(admin.status, admin.reason)
  }

  if (id === actor.id && input.is_active === false) {
    throw new AppError(422, 'không thể khoá chính mình')
  }

  const user = await prisma.users.findUnique({ where: { id } })
  if (!user) {
    throw new AppError(404, 'tài khoản không tồn tại')
  }

  const updated = await prisma.users.update({
    where: { id },
    data: input,
    select: { id: true, username: true, role: true, is_active: true, valid_from: true, valid_until: true, created_by: true, created_at: true },
  })

  await writeAuditLog({
    actorId: actor.id,
    action: 'user_update',
    targetId: user.id,
    ip,
    requestId,
    metadata: { changed: Object.keys(input), valid_until: input.valid_until, is_active: input.is_active },
  })

  return updated
}
