import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireMembership, requireOwnerOrAdmin, type AuthenticatedRequest } from "../services/permissions.js";
import { writeAudit } from "../services/audit.js";

const protocolSchema = z.object({
  teamId: z.string(),
  title: z.string().min(1).max(180),
  description: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  externalVideoUrl: z.string().url().optional().nullable(),
  steps: z.array(z.object({
    title: z.string().min(1).max(220),
    description: z.string().optional().nullable()
  })).min(1)
});

const updateProtocolSchema = protocolSchema.omit({ teamId: true }).partial();

export async function protocolRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.get("/protocols", async (request, reply) => {
    const query = z.object({
      teamId: z.string(),
      q: z.string().optional(),
      includeArchived: z.coerce.boolean().optional()
    }).parse(request.query);

    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, query.teamId);
    if (!membership) return;

    const protocols = await app.prisma.protocol.findMany({
      where: {
        teamId: query.teamId,
        status: query.includeArchived ? undefined : "ACTIVE",
        OR: query.q
          ? [
              { title: { contains: query.q } },
              { description: { contains: query.q } }
            ]
          : undefined
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        steps: { orderBy: { orderIndex: "asc" } },
        files: true
      },
      orderBy: { updatedAt: "desc" }
    });

    return { protocols };
  });

  app.get("/protocols/:protocolId", async (request, reply) => {
    const params = z.object({ protocolId: z.string() }).parse(request.params);
    const protocol = await app.prisma.protocol.findUnique({
      where: { id: params.protocolId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        steps: { orderBy: { orderIndex: "asc" } },
        files: true
      }
    });

    if (!protocol) {
      await reply.code(404).send({ message: "实验模板不存在" });
      return;
    }

    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, protocol.teamId);
    if (!membership) return;

    return { protocol };
  });

  app.post("/protocols", async (request, reply) => {
    const body = protocolSchema.parse(request.body);
    const membership = await requireOwnerOrAdmin(app, request as AuthenticatedRequest, reply, body.teamId);
    if (!membership) return;

    const protocol = await app.prisma.protocol.create({
      data: {
        teamId: body.teamId,
        createdByUserId: request.user.sub,
        title: body.title,
        description: body.description,
        tags: body.tags ?? [],
        externalVideoUrl: body.externalVideoUrl,
        steps: {
          create: body.steps.map((step, index) => ({
            orderIndex: index + 1,
            title: step.title,
            description: step.description
          }))
        }
      },
      include: { steps: { orderBy: { orderIndex: "asc" } } }
    });

    await writeAudit(app, {
      teamId: body.teamId,
      userId: request.user.sub,
      action: "PROTOCOL_CREATED",
      entity: "protocol",
      entityId: protocol.id
    });

    await reply.code(201).send({ protocol });
  });

  app.patch("/protocols/:protocolId", async (request, reply) => {
    const params = z.object({ protocolId: z.string() }).parse(request.params);
    const body = updateProtocolSchema.parse(request.body);
    const existing = await app.prisma.protocol.findUnique({ where: { id: params.protocolId } });

    if (!existing) {
      await reply.code(404).send({ message: "实验模板不存在" });
      return;
    }

    const membership = await requireOwnerOrAdmin(app, request as AuthenticatedRequest, reply, existing.teamId);
    if (!membership) return;

    const protocol = await app.prisma.$transaction(async (tx) => {
      if (body.steps) {
        await tx.protocolStep.deleteMany({ where: { protocolId: existing.id } });
      }

      return tx.protocol.update({
        where: { id: existing.id },
        data: {
          title: body.title,
          description: body.description,
          tags: body.tags,
          externalVideoUrl: body.externalVideoUrl,
          steps: body.steps
            ? {
                create: body.steps.map((step, index) => ({
                  orderIndex: index + 1,
                  title: step.title,
                  description: step.description
                }))
              }
            : undefined
        },
        include: { steps: { orderBy: { orderIndex: "asc" } } }
      });
    });

    await writeAudit(app, {
      teamId: existing.teamId,
      userId: request.user.sub,
      action: "PROTOCOL_UPDATED",
      entity: "protocol",
      entityId: existing.id
    });

    return { protocol };
  });

  app.patch("/protocols/:protocolId/archive", async (request, reply) => {
    const params = z.object({ protocolId: z.string() }).parse(request.params);
    const existing = await app.prisma.protocol.findUnique({ where: { id: params.protocolId } });

    if (!existing) {
      await reply.code(404).send({ message: "实验模板不存在" });
      return;
    }

    const membership = await requireOwnerOrAdmin(app, request as AuthenticatedRequest, reply, existing.teamId);
    if (!membership) return;

    const protocol = await app.prisma.protocol.update({
      where: { id: existing.id },
      data: { status: "ARCHIVED" }
    });

    await writeAudit(app, {
      teamId: existing.teamId,
      userId: request.user.sub,
      action: "PROTOCOL_ARCHIVED",
      entity: "protocol",
      entityId: existing.id
    });

    return { protocol };
  });

  app.post("/protocols/:protocolId/duplicate", async (request, reply) => {
    const params = z.object({ protocolId: z.string() }).parse(request.params);
    const existing = await app.prisma.protocol.findUnique({
      where: { id: params.protocolId },
      include: { steps: { orderBy: { orderIndex: "asc" } } }
    });

    if (!existing) {
      await reply.code(404).send({ message: "实验模板不存在" });
      return;
    }

    const membership = await requireOwnerOrAdmin(app, request as AuthenticatedRequest, reply, existing.teamId);
    if (!membership) return;

    const protocol = await app.prisma.protocol.create({
      data: {
        teamId: existing.teamId,
        createdByUserId: request.user.sub,
        title: `${existing.title} 副本`,
        description: existing.description,
        tags: existing.tags ?? [],
        externalVideoUrl: existing.externalVideoUrl,
        steps: {
          create: existing.steps.map((step) => ({
            orderIndex: step.orderIndex,
            title: step.title,
            description: step.description
          }))
        }
      },
      include: { steps: { orderBy: { orderIndex: "asc" } } }
    });

    return { protocol };
  });
}
