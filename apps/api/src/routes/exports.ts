import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireOwnerOrAdmin, type AuthenticatedRequest } from "../services/permissions.js";

const exportQuerySchema = z.object({
  teamId: z.string()
});

function makeExportJson(data: unknown) {
  return JSON.stringify(
    data,
    (_key, value) => {
      if (typeof value === "bigint") return value.toString();
      return value;
    },
    2
  );
}

function safeFilePart(value: string) {
  return value
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

export async function exportRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.get("/exports/team", async (request, reply) => {
    const query = exportQuerySchema.parse(request.query);
    const membership = await requireOwnerOrAdmin(app, request as AuthenticatedRequest, reply, query.teamId);
    if (!membership) return;

    const [
      team,
      members,
      inventoryItems,
      inventoryEvents,
      purchaseOrders,
      protocols,
      experimentRuns,
      mouseCages,
      mouseAnimals,
      mouseBreedingPairs,
      mouseExperimentRecords,
      messages,
      files
    ] = await Promise.all([
      app.prisma.team.findUniqueOrThrow({ where: { id: query.teamId } }),
      app.prisma.teamMember.findMany({
        where: { teamId: query.teamId },
        include: { user: { select: { id: true, name: true, email: true, createdAt: true } } },
        orderBy: { joinedAt: "asc" }
      }),
      app.prisma.inventoryItem.findMany({
        where: { teamId: query.teamId },
        include: { imageFile: true, imageFiles: true },
        orderBy: { updatedAt: "desc" }
      }),
      app.prisma.inventoryEvent.findMany({
        where: { teamId: query.teamId },
        include: {
          item: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, email: true } }
        },
        orderBy: { createdAt: "desc" }
      }),
      app.prisma.purchaseOrder.findMany({
        where: { teamId: query.teamId },
        include: { requestedBy: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" }
      }),
      app.prisma.protocol.findMany({
        where: { teamId: query.teamId },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          steps: { orderBy: { orderIndex: "asc" } },
          files: true
        },
        orderBy: { updatedAt: "desc" }
      }),
      app.prisma.experimentRun.findMany({
        where: { teamId: query.teamId },
        include: {
          protocol: { select: { id: true, title: true } },
          operator: { select: { id: true, name: true, email: true } },
          steps: { orderBy: { orderIndex: "asc" } },
          files: true
        },
        orderBy: { startedAt: "desc" }
      }),
      app.prisma.mouseCage.findMany({
        where: { teamId: query.teamId },
        include: { caretaker: { select: { id: true, name: true, email: true } } },
        orderBy: { updatedAt: "desc" }
      }),
      app.prisma.mouseAnimal.findMany({
        where: { teamId: query.teamId },
        include: { cage: { select: { id: true, cageCode: true, location: true } } },
        orderBy: { updatedAt: "desc" }
      }),
      app.prisma.mouseBreedingPair.findMany({
        where: { teamId: query.teamId },
        include: {
          cage: { select: { id: true, cageCode: true, location: true } },
          fatherMouse: { select: { id: true, animalCode: true } },
          motherMouse: { select: { id: true, animalCode: true } }
        },
        orderBy: { updatedAt: "desc" }
      }),
      app.prisma.mouseExperimentRecord.findMany({
        where: { teamId: query.teamId },
        include: {
          mouse: { select: { id: true, animalCode: true } },
          operator: { select: { id: true, name: true, email: true } }
        },
        orderBy: { performedAt: "desc" }
      }),
      app.prisma.teamMessage.findMany({
        where: { teamId: query.teamId },
        include: {
          sender: { select: { id: true, name: true, email: true } },
          recipient: { select: { id: true, name: true, email: true } }
        },
        orderBy: { createdAt: "desc" }
      }),
      app.prisma.fileAsset.findMany({
        where: { teamId: query.teamId },
        include: { uploadedBy: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" }
      })
    ]);

    const exportedAt = new Date();
    const payload = {
      exportInfo: {
        schemaVersion: 1,
        exportedAt,
        exportedByUserId: request.user.sub,
        note: "团队完整数据备份。文件二进制未内嵌，仅包含文件元数据和下载路径。"
      },
      team,
      members,
      inventory: {
        items: inventoryItems,
        events: inventoryEvents
      },
      purchaseOrders,
      protocols,
      experimentRuns,
      mouseManagement: {
        cages: mouseCages,
        animals: mouseAnimals,
        breedingPairs: mouseBreedingPairs,
        experimentRecords: mouseExperimentRecords
      },
      messages,
      files
    };

    const fileName = `lab-backup-${safeFilePart(team.name)}-${exportedAt.toISOString().slice(0, 10)}.json`;

    reply
      .header("content-type", "application/json; charset=utf-8")
      .header("content-disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);

    return reply.send(makeExportJson(payload));
  });
}
