import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export interface AuditInput {
  actorId: string | null
  action: string
  targetId: string | null
  ip: string | null
  requestId: string | null
  metadata: Prisma.InputJsonValue
}

export async function writeAuditLog(input: AuditInput): Promise<void> {
  await prisma.audit_logs.create({
    data: {
      actor_id: input.actorId,
      action: input.action,
      target_id: input.targetId,
      ip: input.ip,
      request_id: input.requestId,
      metadata: input.metadata,
    },
  })
}

export function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim() || null
  }
  return req.headers.get('x-real-ip') ?? null
}

export function getRequestId(req: Request): string | null {
  return req.headers.get('x-request-id') ?? null
}
