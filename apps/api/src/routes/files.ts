import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireMembership, type AuthenticatedRequest } from "../services/permissions.js";
import {
  ATTACHMENT_LIMIT_BYTES,
  CONTACT_EMAIL,
  IMAGE_LIMIT_BYTES,
  createLocalReadStream,
  saveLocalFile
} from "../services/storage.js";
import { serializeFile } from "../services/serialize.js";
import { writeAudit } from "../services/audit.js";

const fileKindSchema = z.enum(["CHEMICAL_IMAGE", "PROTOCOL_VIDEO", "PROTOCOL_ATTACHMENT", "RUN_ATTACHMENT"]);

function isChemicalImage(kind: string) {
  return kind === "CHEMICAL_IMAGE";
}

export async function fileRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.get("/files/policy", async (request, reply) => {
    const query = z.object({
      teamId: z.string(),
      kind: fileKindSchema
    }).parse(request.query);

    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, query.teamId);
    if (!membership) return;

    const team = await app.prisma.team.findUniqueOrThrow({ where: { id: query.teamId } });
    const enabled = isChemicalImage(query.kind) || team.fileUploadEnabled;

    return {
      enabled,
      maxBytes: isChemicalImage(query.kind) ? IMAGE_LIMIT_BYTES : ATTACHMENT_LIMIT_BYTES,
      contactEmail: CONTACT_EMAIL,
      message: enabled ? null : `若想使用本功能，请联系系统负责人 ${CONTACT_EMAIL}`
    };
  });

  app.post("/files", async (request, reply) => {
    const query = z.object({
      teamId: z.string(),
      kind: fileKindSchema,
      protocolId: z.string().optional(),
      runId: z.string().optional()
    }).parse(request.query);

    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, query.teamId);
    if (!membership) return;

    const team = await app.prisma.team.findUniqueOrThrow({ where: { id: query.teamId } });
    const maxBytes = isChemicalImage(query.kind) ? IMAGE_LIMIT_BYTES : ATTACHMENT_LIMIT_BYTES;

    if (!isChemicalImage(query.kind) && !team.fileUploadEnabled) {
      await reply.code(403).send({
        message: `若想使用本功能，请联系系统负责人 ${CONTACT_EMAIL}`,
        contactEmail: CONTACT_EMAIL
      });
      return;
    }

    const file = await request.file({ limits: { fileSize: maxBytes } });
    if (!file) {
      await reply.code(400).send({ message: "请选择要上传的文件" });
      return;
    }

    if (isChemicalImage(query.kind) && !file.mimetype.startsWith("image/")) {
      await reply.code(400).send({ message: "药品图片必须是图片文件" });
      return;
    }

    try {
      const saved = await saveLocalFile(file, query.teamId);
      const fileId = randomUUID();

      const asset = await app.prisma.fileAsset.create({
        data: {
          id: fileId,
          teamId: query.teamId,
          uploadedByUserId: request.user.sub,
          kind: query.kind,
          originalName: file.filename,
          mimeType: file.mimetype,
          sizeBytes: saved.sizeBytes,
          storageProvider: saved.storageProvider,
          storageKey: saved.storageKey,
          publicUrl: `/files/${fileId}/download`,
          protocolId: query.protocolId,
          runId: query.runId
        }
      });

      await writeAudit(app, {
        teamId: query.teamId,
        userId: request.user.sub,
        action: "FILE_UPLOADED",
        entity: "file",
        entityId: asset.id,
        metadata: { kind: query.kind, sizeBytes: saved.sizeBytes }
      });

      await reply.code(201).send({ file: serializeFile(asset) });
    } catch (error) {
      if (error instanceof Error && error.message === "FILE_TOO_LARGE") {
        await reply.code(413).send({ message: "文件超过上传限制" });
        return;
      }
      throw error;
    }
  });

  app.get("/files/:fileId/download", async (request, reply) => {
    const params = z.object({ fileId: z.string() }).parse(request.params);
    const file = await app.prisma.fileAsset.findUnique({ where: { id: params.fileId } });

    if (!file) {
      await reply.code(404).send({ message: "文件不存在" });
      return;
    }

    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, file.teamId);
    if (!membership) return;

    reply.header("content-type", file.mimeType);
    reply.header("content-disposition", `inline; filename="${encodeURIComponent(file.originalName)}"`);
    return reply.send(createLocalReadStream(file.storageKey));
  });
}
