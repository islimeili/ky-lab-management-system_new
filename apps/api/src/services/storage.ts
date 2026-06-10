import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { MultipartFile } from "@fastify/multipart";

export const CONTACT_EMAIL = "3119314861@qq.com";
export const ATTACHMENT_LIMIT_BYTES = 200 * 1024 * 1024;
export const IMAGE_LIMIT_BYTES = 10 * 1024 * 1024;

const uploadRoot = path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "./uploads");

function safeFileName(name: string) {
  return name.replace(/[^\w.-]+/g, "_").slice(0, 120);
}

export async function saveLocalFile(file: MultipartFile, teamId: string) {
  const dir = path.join(uploadRoot, teamId);
  await mkdir(dir, { recursive: true });

  const storageKey = `${Date.now()}-${crypto.randomUUID()}-${safeFileName(file.filename)}`;
  const destination = path.join(dir, storageKey);

  await pipeline(file.file, createWriteStream(destination));

  if (file.file.truncated) {
    await unlink(destination).catch(() => undefined);
    throw new Error("FILE_TOO_LARGE");
  }

  const info = await stat(destination);
  return {
    storageProvider: "local",
    storageKey: path.join(teamId, storageKey).replaceAll("\\", "/"),
    sizeBytes: info.size
  };
}

export function createLocalReadStream(storageKey: string) {
  const fullPath = path.join(uploadRoot, storageKey);
  return createReadStream(fullPath);
}
