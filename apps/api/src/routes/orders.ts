import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { writeAudit } from "../services/audit.js";
import { requireMembership, requireOwnerOrAdmin, type AuthenticatedRequest } from "../services/permissions.js";

const orderSchema = z.object({
  teamId: z.string(),
  chemicalName: z.string().min(1).max(180),
  specification: z.string().max(180).optional().nullable(),
  supplier: z.string().max(180).optional().nullable(),
  catalogNumber: z.string().max(120).optional().nullable(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1).max(40),
  note: z.string().max(1000).optional().nullable()
});

const statusSchema = z.object({
  status: z.enum(["PENDING", "ORDERED", "ARRIVED", "CANCELED"])
});

function serializeOrder<T extends { quantity: { toString(): string } | number }>(order: T) {
  return {
    ...order,
    quantity: Number(order.quantity)
  };
}

export async function orderRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.get("/orders", async (request, reply) => {
    const query = z.object({
      teamId: z.string(),
      status: z.enum(["PENDING", "ORDERED", "ARRIVED", "CANCELED"]).optional()
    }).parse(request.query);

    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, query.teamId);
    if (!membership) return;

    const orders = await app.prisma.purchaseOrder.findMany({
      where: {
        teamId: query.teamId,
        status: query.status
      },
      include: {
        requestedBy: { select: { id: true, name: true, email: true } }
      },
      orderBy: { createdAt: "desc" }
    });

    return { orders: orders.map(serializeOrder) };
  });

  app.post("/orders", async (request, reply) => {
    const body = orderSchema.parse(request.body);
    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, body.teamId);
    if (!membership) return;

    const order = await app.prisma.purchaseOrder.create({
      data: {
        teamId: body.teamId,
        requestedByUserId: request.user.sub,
        chemicalName: body.chemicalName,
        specification: body.specification,
        supplier: body.supplier,
        catalogNumber: body.catalogNumber,
        quantity: body.quantity,
        unit: body.unit,
        note: body.note
      },
      include: {
        requestedBy: { select: { id: true, name: true, email: true } }
      }
    });

    await writeAudit(app, {
      teamId: body.teamId,
      userId: request.user.sub,
      action: "PURCHASE_ORDER_CREATED",
      entity: "purchase_order",
      entityId: order.id
    });

    await reply.code(201).send({ order: serializeOrder(order) });
  });

  app.patch("/orders/:orderId/status", async (request, reply) => {
    const params = z.object({ orderId: z.string() }).parse(request.params);
    const body = statusSchema.parse(request.body);
    const existing = await app.prisma.purchaseOrder.findUnique({ where: { id: params.orderId } });

    if (!existing) {
      await reply.code(404).send({ message: "订购记录不存在" });
      return;
    }

    const membership = await requireOwnerOrAdmin(app, request as AuthenticatedRequest, reply, existing.teamId);
    if (!membership) return;

    const order = await app.prisma.purchaseOrder.update({
      where: { id: existing.id },
      data: { status: body.status },
      include: {
        requestedBy: { select: { id: true, name: true, email: true } }
      }
    });

    await writeAudit(app, {
      teamId: existing.teamId,
      userId: request.user.sub,
      action: "PURCHASE_ORDER_STATUS_UPDATED",
      entity: "purchase_order",
      entityId: order.id,
      metadata: { status: body.status }
    });

    return { order: serializeOrder(order) };
  });
}
