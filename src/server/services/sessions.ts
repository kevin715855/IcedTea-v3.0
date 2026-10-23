import { prisma } from '@/lib/prisma'
import { AppError } from '@/lib/app-error'
import { requireAdmin, requireUser, type Account } from '@/lib/access'

export interface StaffReport {
  staff_id: string
  username: string | null
  checkin_count: number
  first_checkin: Date | null
  last_checkin: Date | null
  shortest_interval_minutes: number | null
}

export interface SessionReport {
  session: {
    id: string
    name: string
    starts_at: Date
    ends_at: Date
    closed_at: Date | null
  }
  total_checkins: number
  staff: StaffReport[]
}

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

export async function getSessionReport(
  sessionId: string,
  actor: Account,
): Promise<SessionReport> {
  const admin = requireAdmin({ ok: true, account: actor })
  if (!admin.ok) {
    throw new AppError(admin.status, admin.reason)
  }

  const session = await prisma.sessions.findUnique({ where: { id: sessionId } })
  if (!session) {
    throw new AppError(404, 'buổi không tồn tại')
  }

  const checkins = await prisma.checkins.findMany({
    where: { session_id: sessionId, cancelled_at: null },
    orderBy: { checked_in_at: 'asc' },
    select: { id: true, scanned_by: true, checked_in_at: true },
  })

  const scannerIds = [...new Set(checkins.map((c) => c.scanned_by))]
  const scanners = await prisma.users.findMany({
    where: { id: { in: scannerIds } },
    select: { id: true, username: true },
  })
  const scannerName = new Map(scanners.map((u) => [u.id, u.username]))

  const byStaff = new Map<string, Date[]>()
  for (const c of checkins) {
    if (!byStaff.has(c.scanned_by)) byStaff.set(c.scanned_by, [])
    byStaff.get(c.scanned_by)!.push(c.checked_in_at)
  }

  const staff: StaffReport[] = []
  for (const [staffId, times] of byStaff) {
    times.sort((a, b) => a.getTime() - b.getTime())
    let shortest: number | null = null
    for (let i = 1; i < times.length; i++) {
      const diff = (times[i].getTime() - times[i - 1].getTime()) / 60000
      if (shortest === null || diff < shortest) shortest = diff
    }
    staff.push({
      staff_id: staffId,
      username: scannerName.get(staffId) ?? null,
      checkin_count: times.length,
      first_checkin: times[0],
      last_checkin: times[times.length - 1],
      shortest_interval_minutes: shortest,
    })
  }

  staff.sort((a, b) => (a.username ?? '').localeCompare(b.username ?? ''))

  return {
    session: {
      id: session.id,
      name: session.name,
      starts_at: session.starts_at,
      ends_at: session.ends_at,
      closed_at: session.closed_at,
    },
    total_checkins: checkins.length,
    staff,
  }
}
