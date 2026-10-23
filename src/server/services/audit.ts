import { prisma } from '@/lib/prisma'
import { AppError } from '@/lib/app-error'
import { requireAdmin, type Account } from '@/lib/access'

export interface AuditLogItem {
  id: string
  actor_id: string | null
  actor_username: string | null
  action: string
  target_id: string | null
  ip: string | null
  request_id: string | null
  metadata: unknown
  created_at: Date
}

export interface AuditLogResult {
  logs: AuditLogItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export async function listAuditLogs(
  actor: Account,
  filter: { page?: number; page_size?: number } = {},
): Promise<AuditLogResult> {
  const admin = requireAdmin({ ok: true, account: actor })
  if (!admin.ok) {
    throw new AppError(admin.status, admin.reason)
  }

  const { page = 1, page_size = 20 } = filter
  const take = Math.min(100, Math.max(1, page_size))
  const skip = (Math.max(1, page) - 1) * take

  const [rows, total] = await prisma.$transaction([
    prisma.audit_logs.findMany({ orderBy: { created_at: 'desc' }, skip, take }),
    prisma.audit_logs.count(),
  ])

  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[]
  const actors = await prisma.users.findMany({ where: { id: { in: actorIds } }, select: { id: true, username: true } })
  const actorName = new Map(actors.map((u) => [u.id, u.username]))

  const logs: AuditLogItem[] = rows.map((r) => ({
    id: r.id,
    actor_id: r.actor_id,
    actor_username: actorName.get(r.actor_id!) ?? null,
    action: r.action,
    target_id: r.target_id,
    ip: r.ip,
    request_id: r.request_id,
    metadata: r.metadata,
    created_at: r.created_at,
  }))

  return {
    logs,
    total,
    page: Math.max(1, page),
    page_size: take,
    total_pages: Math.ceil(total / take),
  }
}
