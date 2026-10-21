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
      throw new AppError(409, 'đã điểm danh')
    }
    throw e
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
