import type { FastifyInstance } from "fastify";

type AuditInput = {
  teamId: string;
  userId: string;
  action: string;
  entity: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

export async function writeAudit(app: FastifyInstance, input: AuditInput) {
  await app.prisma.auditLog.create({
    data: {
      teamId: input.teamId,
      userId: input.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      metadata: (input.metadata ?? {}) as never
    }
  });
}
