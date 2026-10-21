import { prisma } from '@/lib/prisma'
import { AppError } from '@/lib/app-error'
import { requireAdmin, requireUser, type Account } from '@/lib/access'

export interface SessionData {
  id: string
  name: string
  starts_at: Date
  ends_at: Date
  closed_at: Date | null
  created_by: string | null
  created_at: Date
}

export interface CreateSessionInput {
  name: string
  starts_at: Date
  ends_at: Date
}

export async function listSessions(
  account: Account | null,
  now: Date = new Date(),
): Promise<SessionData[]> {
  const access = requireUser(account, now)
  if (!access.ok) {
    throw new AppError(access.status, access.reason)
  }

  const isAdmin = access.account.role === 'admin'
  const where = isAdmin
    ? {}
    : {
        closed_at: null,
        starts_at: { lte: now },
        ends_at: { gte: now },
      }

  return prisma.sessions.findMany({ where, orderBy: { starts_at: 'asc' } })
}

export async function createSession(
  input: CreateSessionInput,
  actor: Account,
): Promise<SessionData> {
  const admin = requireAdmin({ ok: true, account: actor })
  if (!admin.ok) {
    throw new AppError(admin.status, admin.reason)
  }
  if (input.ends_at <= input.starts_at) {
    throw new AppError(422, 'ends_at phải sau starts_at')
  }

  return prisma.sessions.create({
    data: {
      name: input.name,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      created_by: actor.id,
    },
  })
}

export async function updateSession(
  id: string,
  input: { name?: string; starts_at?: Date; ends_at?: Date; closed_at?: Date | null },
  actor: Account,
): Promise<SessionData> {
  const admin = requireAdmin({ ok: true, account: actor })
  if (!admin.ok) {
    throw new AppError(admin.status, admin.reason)
  }

  const session = await prisma.sessions.findUnique({ where: { id } })
  if (!session) {
    throw new AppError(404, 'buổi không tồn tại')
  }

  // Buổi đã đóng không thể mở lại hay sửa khung giờ
  if (session.closed_at !== null && (input.name !== undefined || input.starts_at !== undefined || input.ends_at !== undefined)) {
    throw new AppError(422, 'buổi đã đóng không thể sửa')
  }

  const starts_at = input.starts_at ?? session.starts_at
  const ends_at = input.ends_at ?? session.ends_at
  if (ends_at <= starts_at) {
    throw new AppError(422, 'ends_at phải sau starts_at')
  }

  return prisma.sessions.update({
    where: { id },
    data: {
      name: input.name,
      starts_at,
      ends_at,
      ...(input.closed_at !== undefined ? { closed_at: input.closed_at } : {}),
    },
  })
}
