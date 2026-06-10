import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireMembership, requireOwnerOrAdmin, type AuthenticatedRequest } from "../services/permissions.js";
import { writeAudit } from "../services/audit.js";
import { serializeInventoryEvent, serializeInventoryItem } from "../services/serialize.js";

const inventorySchema = z.object({
  teamId: z.string(),
  name: z.string().min(1).max(160),
  alias: z.string().max(160).optional().nullable(),
  casNumber: z.string().max(80).optional().nullable(),
  specification: z.string().max(160).optional().nullable(),
  supplier: z.string().max(160).optional().nullable(),
  catalogNumber: z.string().max(120).optional().nullable(),
  batchNumber: z.string().max(120).optional().nullable(),
  quantity: z.coerce.number().min(0),
  unit: z.string().min(1).max(40),
  location: z.string().min(1).max(160),
  expiresAt: z.coerce.date().optional().nullable(),
  status: z.enum(["ACTIVE", "LOW_STOCK", "EXPIRED", "DISPOSED", "ARCHIVED"]).optional(),
  hazardTags: z.array(z.string()).optional(),
  notes: z.string().optional().nullable(),
  imageFileId: z.string().optional().nullable()
});

const updateInventorySchema = inventorySchema.omit({ teamId: true, quantity: true }).partial();

const eventSchema = z.object({
  type: z.enum(["RESTOCK", "CONSUME", "DISPOSE", "ADJUST"]),
  quantityDelta: z.coerce.number(),
  reason: z.string().max(500).optional()
});

function normalizeDelta(type: string, delta: number) {
  if (type === "CONSUME" || type === "DISPOSE") {
    return -Math.abs(delta);
  }
  if (type === "RESTOCK") {
    return Math.abs(delta);
  }
  return delta;
}

export async function inventoryRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.get("/inventory", async (request, reply) => {
    const query = z.object({
      teamId: z.string(),
      q: z.string().optional(),
      status: z.string().optional()
    }).parse(request.query);

    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, query.teamId);
    if (!membership) return;

    const items = await app.prisma.inventoryItem.findMany({
      where: {
        teamId: query.teamId,
        deletedAt: null,
        status: query.status ? query.status as never : undefined,
        OR: query.q
          ? [
              { name: { contains: query.q } },
              { alias: { contains: query.q } },
              { casNumber: { contains: query.q } },
              { location: { contains: query.q } }
            ]
          : undefined
      },
      include: { imageFile: true },
      orderBy: { updatedAt: "desc" }
    });

    return { items: items.map(serializeInventoryItem) };
  });

  app.get("/inventory/:itemId", async (request, reply) => {
    const params = z.object({ itemId: z.string() }).parse(request.params);
    const item = await app.prisma.inventoryItem.findUnique({
      where: { id: params.itemId },
      include: {
        imageFile: true,
        events: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!item || item.deletedAt) {
      await reply.code(404).send({ message: "药品不存在" });
      return;
    }

    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, item.teamId);
    if (!membership) return;

    return {
      item: serializeInventoryItem(item),
      events: item.events.map(serializeInventoryEvent)
    };
  });

  app.post("/inventory", async (request, reply) => {
    const body = inventorySchema.parse(request.body);
    const membership = await requireOwnerOrAdmin(app, request as AuthenticatedRequest, reply, body.teamId);
    if (!membership) return;

    const item = await app.prisma.$transaction(async (tx) => {
      const created = await tx.inventoryItem.create({
        data: {
          ...body,
          expiresAt: body.expiresAt ?? undefined,
          hazardTags: body.hazardTags ?? [],
          quantity: body.quantity
        }
      });

      await tx.inventoryEvent.create({
        data: {
          teamId: body.teamId,
          itemId: created.id,
          userId: request.user.sub,
          type: "INITIAL",
          quantityBefore: 0,
          quantityDelta: body.quantity,
          quantityAfter: body.quantity,
          reason: "初始录入"
        }
      });

      return created;
    });

    await writeAudit(app, {
      teamId: body.teamId,
      userId: request.user.sub,
      action: "INVENTORY_CREATED",
      entity: "inventory_item",
      entityId: item.id
    });

    await reply.code(201).send({ item: serializeInventoryItem(item) });
  });

  app.patch("/inventory/:itemId", async (request, reply) => {
    const params = z.object({ itemId: z.string() }).parse(request.params);
    const body = updateInventorySchema.parse(request.body);
    const item = await app.prisma.inventoryItem.findUnique({ where: { id: params.itemId } });

    if (!item || item.deletedAt) {
      await reply.code(404).send({ message: "药品不存在" });
      return;
    }

    const membership = await requireOwnerOrAdmin(app, request as AuthenticatedRequest, reply, item.teamId);
    if (!membership) return;

    const updated = await app.prisma.inventoryItem.update({
      where: { id: params.itemId },
      data: {
        ...body,
        expiresAt: body.expiresAt ?? undefined,
        hazardTags: body.hazardTags ?? undefined
      }
    });

    await writeAudit(app, {
      teamId: item.teamId,
      userId: request.user.sub,
      action: "INVENTORY_UPDATED",
      entity: "inventory_item",
      entityId: item.id
    });

    return { item: serializeInventoryItem(updated) };
  });

  app.post("/inventory/:itemId/events", async (request, reply) => {
    const params = z.object({ itemId: z.string() }).parse(request.params);
    const body = eventSchema.parse(request.body);

    const result = await app.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findUnique({ where: { id: params.itemId } });

      if (!item || item.deletedAt) {
        throw new Error("NOT_FOUND");
      }

      const membership = await tx.teamMember.findUnique({
        where: { teamId_userId: { teamId: item.teamId, userId: request.user.sub } }
      });

      if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
        throw new Error("FORBIDDEN");
      }

      const before = Number(item.quantity);
      const delta = normalizeDelta(body.type, body.quantityDelta);
      const after = before + delta;

      if (after < 0) {
        throw new Error("NEGATIVE_STOCK");
      }

      const updated = await tx.inventoryItem.update({
        where: { id: item.id },
        data: {
          quantity: after,
          status: body.type === "DISPOSE" && after === 0 ? "DISPOSED" : item.status
        }
      });

      const event = await tx.inventoryEvent.create({
        data: {
          teamId: item.teamId,
          itemId: item.id,
          userId: request.user.sub,
          type: body.type,
          quantityBefore: before,
          quantityDelta: delta,
          quantityAfter: after,
          reason: body.reason
        }
      });

      return { item: updated, event };
    }).catch(async (error: Error) => {
      if (error.message === "NOT_FOUND") {
        await reply.code(404).send({ message: "药品不存在" });
        return null;
      }
      if (error.message === "FORBIDDEN") {
        await reply.code(403).send({ message: "仅群主和管理员可以修改库存" });
        return null;
      }
      if (error.message === "NEGATIVE_STOCK") {
        await reply.code(400).send({ message: "库存不能小于 0" });
        return null;
      }
      throw error;
    });

    if (!result) return;

    await writeAudit(app, {
      teamId: result.event.teamId,
      userId: request.user.sub,
      action: "INVENTORY_EVENT_CREATED",
      entity: "inventory_event",
      entityId: result.event.id,
      metadata: { type: body.type }
    });

    return {
      item: serializeInventoryItem(result.item),
      event: serializeInventoryEvent(result.event)
    };
  });

  app.delete("/inventory/:itemId", async (request, reply) => {
    const params = z.object({ itemId: z.string() }).parse(request.params);
    const item = await app.prisma.inventoryItem.findUnique({ where: { id: params.itemId } });

    if (!item || item.deletedAt) {
      await reply.code(404).send({ message: "药品不存在" });
      return;
    }

    const membership = await requireOwnerOrAdmin(app, request as AuthenticatedRequest, reply, item.teamId);
    if (!membership) return;

    await app.prisma.inventoryItem.update({
      where: { id: item.id },
      data: { deletedAt: new Date(), status: "ARCHIVED" }
    });

    await writeAudit(app, {
      teamId: item.teamId,
      userId: request.user.sub,
      action: "INVENTORY_ARCHIVED",
      entity: "inventory_item",
      entityId: item.id
    });

    await reply.code(204).send();
  });
}
