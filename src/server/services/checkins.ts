import { prisma } from '@/lib/prisma'
import { AppError } from '@/lib/app-error'
import { requireAdmin, requireUser, type Account } from '@/lib/access'
import { validateMssv } from '@/lib/validation'

export interface CheckinData {
  id: string
  session_id: string
  student_code: string
  scanned_by: string
  checked_in_at: Date
  cancelled_at: Date | null
  cancelled_by: string | null
  cancel_reason: string | null
}

export async function createCheckin(
  sessionId: string,
  studentCode: string,
  scanner: Account | null,
  now: Date = new Date(),
): Promise<CheckinData> {
  const access = requireUser(scanner, now)
  if (!access.ok) {
    throw new AppError(access.status, access.reason)
  }

  const mssv = validateMssv(studentCode)
  if (!mssv.valid) {
    throw new AppError(422, mssv.error ?? 'Mã không hợp lệ')
  }

  const session = await prisma.sessions.findUnique({ where: { id: sessionId } })
  if (!session) {
    throw new AppError(422, 'buổi không còn nhận check-in')
  }
  if (session.closed_at !== null) {
    throw new AppError(422, 'buổi không còn nhận check-in')
  }
  if (now < session.starts_at || now > session.ends_at) {
    throw new AppError(422, 'buổi không còn nhận check-in')
  }

  try {
    return await prisma.checkins.create({
      data: {
        session_id: sessionId,
        student_code: mssv.mssv!,
        scanned_by: scanner!.id,
      },
    })
  } catch (e: any) {
    if (e.code === 'P2002') {
      const existing = await prisma.checkins.findFirst({
        where: { session_id: sessionId, student_code: mssv.mssv!, cancelled_at: null },
        select: { checked_in_at: true },
      })
      throw new AppError(409, 'đã điểm danh', existing ? { checked_in_at: existing.checked_in_at } : undefined)
    }
    throw e
  }
}

export interface CheckinListItem {
  id: string
  session_id: string
  session_name: string | null
  student_code: string
  scanned_by: string
  scanned_by_username: string | null
  checked_in_at: Date
  cancelled_at: Date | null
  cancel_reason: string | null
}

export interface CheckinListResult {
  checkins: CheckinListItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export async function listCheckins(
  account: Account | null,
  filter: { session_id?: string; student_code?: string; page?: number; page_size?: number },
): Promise<CheckinListResult> {
  const access = requireUser(account)
  if (!access.ok) {
    throw new AppError(access.status, access.reason)
  }

  const { session_id, student_code, page = 1, page_size = 20 } = filter
  const take = Math.min(100, Math.max(1, page_size))
  const skip = (Math.max(1, page) - 1) * take

  const where: Record<string, unknown> = {}
  if (access.account.role !== 'admin') {
    where.scanned_by = access.account.id
  }
  if (session_id) {
    where.session_id = session_id
  }
  if (student_code) {
    where.student_code = { contains: student_code }
  }

  const [rows, total] = await prisma.$transaction([
    prisma.checkins.findMany({ where, orderBy: { checked_in_at: 'desc' }, skip, take }),
    prisma.checkins.count({ where }),
  ])

  const sessionIds = [...new Set(rows.map((r) => r.session_id))]
  const scannerIds = [...new Set(rows.map((r) => r.scanned_by))]

  const sessions = await prisma.sessions.findMany({ where: { id: { in: sessionIds } }, select: { id: true, name: true } })
  const scanners = await prisma.users.findMany({ where: { id: { in: scannerIds } }, select: { id: true, username: true } })

  const sessionName = new Map(sessions.map((s) => [s.id, s.name]))
  const scannerName = new Map(scanners.map((u) => [u.id, u.username]))

  const checkins: CheckinListItem[] = rows.map((r) => ({
    id: r.id,
    session_id: r.session_id,
    session_name: sessionName.get(r.session_id) ?? null,
    student_code: r.student_code,
    scanned_by: r.scanned_by,
    scanned_by_username: scannerName.get(r.scanned_by) ?? null,
    checked_in_at: r.checked_in_at,
    cancelled_at: r.cancelled_at,
    cancel_reason: r.cancel_reason,
  }))

  return {
    checkins,
    total,
    page: Math.max(1, page),
    page_size: take,
    total_pages: Math.ceil(total / take),
  }
}

export async function cancelCheckin(
  id: string,
  reason: string,
  actor: Account,
): Promise<CheckinData> {
  const admin = requireAdmin({ ok: true, account: actor })
  if (!admin.ok) {
    throw new AppError(admin.status, admin.reason)
  }
  if (!reason || !reason.trim()) {
    throw new AppError(422, 'ly do huỷ là bắt buộc')
  }

  const checkin = await prisma.checkins.findUnique({ where: { id } })
  if (!checkin) {
    throw new AppError(404, 'check-in không tồn tại')
  }
  if (checkin.cancelled_at !== null) {
    throw new AppError(422, 'check-in đã bị huỷ')
  }

  return prisma.checkins.update({
    where: { id },
    data: {
      cancelled_at: new Date(),
      cancelled_by: actor.id,
      cancel_reason: reason.trim(),
    },
  })
}
