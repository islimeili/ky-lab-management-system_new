import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireMembership, requireOwnerOrAdmin, type AuthenticatedRequest } from "../services/permissions.js";
import { writeAudit } from "../services/audit.js";

const teamQuerySchema = z.object({
  teamId: z.string()
});

const directMessageSchema = z.object({
  teamId: z.string(),
  recipientUserId: z.string(),
  body: z.string().min(1).max(4000)
});

const announcementSchema = z.object({
  teamId: z.string(),
  title: z.string().max(160).optional().nullable(),
  body: z.string().min(1).max(6000)
});

const messageParamSchema = z.object({
  messageId: z.string()
});

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function daysUntil(target: Date) {
  const oneDayMs = 1000 * 60 * 60 * 24;
  return Math.ceil((target.getTime() - startOfToday().getTime()) / oneDayMs);
}

export async function messageRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.get("/messages", async (request, reply) => {
    const query = teamQuerySchema.parse(request.query);
    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, query.teamId);
    if (!membership) return;

    const now = new Date();
    const warningUntil = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const [expiringItems, directMessages, announcements] = await Promise.all([
      app.prisma.inventoryItem.findMany({
        where: {
          teamId: query.teamId,
          deletedAt: null,
          status: { notIn: ["DISPOSED", "ARCHIVED"] },
          expiresAt: {
            gte: now,
            lte: warningUntil
          }
        },
        orderBy: { expiresAt: "asc" },
        take: 50
      }),
      app.prisma.teamMessage.findMany({
        where: {
          teamId: query.teamId,
          kind: "DIRECT",
          deletedAt: null,
          OR: [
            { senderUserId: request.user.sub, senderDeletedAt: null },
            { recipientUserId: request.user.sub, recipientDeletedAt: null }
          ]
        },
        include: {
          sender: { select: { id: true, name: true, email: true } },
          recipient: { select: { id: true, name: true, email: true } }
        },
        orderBy: { createdAt: "desc" },
        take: 80
      }),
      app.prisma.teamMessage.findMany({
        where: {
          teamId: query.teamId,
          kind: "ANNOUNCEMENT",
          deletedAt: null
        },
        include: {
          sender: { select: { id: true, name: true, email: true } },
          recipient: { select: { id: true, name: true, email: true } }
        },
        orderBy: { createdAt: "desc" },
        take: 50
      })
    ]);

    return {
      systemReminders: expiringItems.map((item) => ({
        id: `expiry-${item.id}`,
        inventoryItemId: item.id,
        title: "药品即将过期",
        body: `${item.name} 将在 ${item.expiresAt?.toISOString().slice(0, 10)} 过期，请及时确认库存或处理。`,
        itemName: item.name,
        location: item.location,
        expiresAt: item.expiresAt,
        daysLeft: item.expiresAt ? daysUntil(item.expiresAt) : null
      })),
      directMessages,
      announcements
    };
  });

  app.post("/messages/direct", async (request, reply) => {
    const body = directMessageSchema.parse(request.body);
    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, body.teamId);
    if (!membership) return;

    if (body.recipientUserId === request.user.sub) {
      await reply.code(400).send({ message: "不能给自己发送消息" });
      return;
    }

    const recipient = await app.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: body.teamId, userId: body.recipientUserId } }
    });

    if (!recipient) {
      await reply.code(404).send({ message: "接收人不在当前团队中" });
      return;
    }

    const message = await app.prisma.teamMessage.create({
      data: {
        teamId: body.teamId,
        senderUserId: request.user.sub,
        recipientUserId: body.recipientUserId,
        kind: "DIRECT",
        body: body.body
      },
      include: {
        sender: { select: { id: true, name: true, email: true } },
        recipient: { select: { id: true, name: true, email: true } }
      }
    });

    await writeAudit(app, {
      teamId: body.teamId,
      userId: request.user.sub,
      action: "TEAM_DIRECT_MESSAGE_SENT",
      entity: "team_message",
      entityId: message.id,
      metadata: { recipientUserId: body.recipientUserId }
    });

    await reply.code(201).send({ message });
  });

  app.post("/messages/announcements", async (request, reply) => {
    const body = announcementSchema.parse(request.body);
    const membership = await requireOwnerOrAdmin(app, request as AuthenticatedRequest, reply, body.teamId);
    if (!membership) return;

    const announcement = await app.prisma.teamMessage.create({
      data: {
        teamId: body.teamId,
        senderUserId: request.user.sub,
        kind: "ANNOUNCEMENT",
        title: body.title,
        body: body.body
      },
      include: {
        sender: { select: { id: true, name: true, email: true } },
        recipient: { select: { id: true, name: true, email: true } }
      }
    });

    await writeAudit(app, {
      teamId: body.teamId,
      userId: request.user.sub,
      action: "TEAM_ANNOUNCEMENT_CREATED",
      entity: "team_message",
      entityId: announcement.id
    });

    await reply.code(201).send({ announcement });
  });

  app.delete("/messages/:messageId", async (request, reply) => {
    const params = messageParamSchema.parse(request.params);
    const message = await app.prisma.teamMessage.findUnique({ where: { id: params.messageId } });

    if (!message || message.deletedAt) {
      await reply.code(404).send({ message: "消息不存在" });
      return;
    }

    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, message.teamId);
    if (!membership) return;

    if (message.kind === "ANNOUNCEMENT") {
      if (membership.role !== "OWNER" && membership.role !== "ADMIN" && message.senderUserId !== request.user.sub) {
        await reply.code(403).send({ message: "仅公告发布人、群主或管理员可以删除公告" });
        return;
      }

      const deleted = await app.prisma.teamMessage.update({
        where: { id: message.id },
        data: { deletedAt: new Date() }
      });

      await writeAudit(app, {
        teamId: message.teamId,
        userId: request.user.sub,
        action: "TEAM_ANNOUNCEMENT_DELETED",
        entity: "team_message",
        entityId: deleted.id
      });

      await reply.code(204).send();
      return;
    }

    if (message.senderUserId === request.user.sub) {
      const recalled = await app.prisma.teamMessage.update({
        where: { id: message.id },
        data: {
          deletedAt: new Date(),
          senderDeletedAt: new Date()
        }
      });

      await writeAudit(app, {
        teamId: message.teamId,
        userId: request.user.sub,
        action: "TEAM_DIRECT_MESSAGE_RECALLED",
        entity: "team_message",
        entityId: recalled.id,
        metadata: { recipientUserId: message.recipientUserId }
      });

      await reply.code(204).send();
      return;
    }

    if (message.recipientUserId === request.user.sub) {
      const deleted = await app.prisma.teamMessage.update({
        where: { id: message.id },
        data: { recipientDeletedAt: new Date() }
      });

      await writeAudit(app, {
        teamId: message.teamId,
        userId: request.user.sub,
        action: "TEAM_DIRECT_MESSAGE_DELETED",
        entity: "team_message",
        entityId: deleted.id
      });

      await reply.code(204).send();
      return;
    }

    await reply.code(403).send({ message: "只能删除或撤回与自己有关的消息" });
  });
}
