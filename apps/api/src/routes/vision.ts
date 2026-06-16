import { arrayBuffer } from "node:stream/consumers";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { IMAGE_LIMIT_BYTES } from "../services/storage.js";
import { requireMembership, type AuthenticatedRequest } from "../services/permissions.js";

const visionQuerySchema = z.object({
  teamId: z.string()
});

function collectTextBlocks(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectTextBlocks);
  if (typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const directText = typeof record.text === "string" ? [record.text] : [];
  const nested = ["data", "result", "results", "blocks", "items"]
    .flatMap((key) => collectTextBlocks(record[key]));

  return [...directText, ...nested];
}

function javaVisionBaseUrl() {
  return process.env.JAVAVISION_BASE_URL?.replace(/\/+$/, "");
}

async function callJavaVision(baseUrl: string, endpoint: "/ocr/json" | "/word/json", file: { buffer: Buffer; filename: string; mimetype: string }) {
  const form = new FormData();
  form.set("file", new Blob([Uint8Array.from(file.buffer)], { type: file.mimetype }), file.filename);

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    body: form
  });

  if (!response.ok) {
    throw new Error(`JavaVision ${endpoint} returned ${response.status}`);
  }

  return response.json() as Promise<unknown>;
}

export async function visionRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.post("/vision/chemical-ocr", async (request, reply) => {
    const query = visionQuerySchema.parse(request.query);
    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, query.teamId);
    if (!membership) return;

    const baseUrl = javaVisionBaseUrl();
    if (!baseUrl) {
      await reply.code(503).send({ message: "JavaVision OCR is not configured; use browser fallback OCR", fallback: true });
      return;
    }

    const file = await request.file({ limits: { fileSize: IMAGE_LIMIT_BYTES } });
    if (!file) {
      await reply.code(400).send({ message: "Please select an image to recognize" });
      return;
    }

    if (!file.mimetype.startsWith("image/")) {
      await reply.code(400).send({ message: "Only image files can be recognized" });
      return;
    }

    const buffer = Buffer.from(await arrayBuffer(file.file));
    if (file.file.truncated) {
      await reply.code(413).send({ message: "Image exceeds recognition size limit" });
      return;
    }

    const payload = { buffer, filename: file.filename, mimetype: file.mimetype };
    const errors: string[] = [];

    for (const endpoint of ["/ocr/json", "/word/json"] as const) {
      try {
        const raw = await callJavaVision(baseUrl, endpoint, payload);
        const blocks = collectTextBlocks(raw)
          .map((text) => text.trim())
          .filter(Boolean);

        return {
          provider: "JavaVision",
          endpoint,
          rawText: blocks.join("\n"),
          blocks,
          raw
        };
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    await reply.code(502).send({
      message: "JavaVision OCR failed; use browser fallback OCR",
      fallback: true,
      errors
    });
  });
}
