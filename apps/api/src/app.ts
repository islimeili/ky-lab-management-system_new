import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { ZodError } from "zod";
import { authPlugin } from "./plugins/auth.js";
import { prismaPlugin } from "./plugins/prisma.js";
import { authRoutes } from "./routes/auth.js";
import { fileRoutes } from "./routes/files.js";
import { inventoryRoutes } from "./routes/inventory.js";
import { orderRoutes } from "./routes/orders.js";
import { protocolRoutes } from "./routes/protocols.js";
import { runRoutes } from "./routes/runs.js";
import { teamRoutes } from "./routes/teams.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      transport: process.env.NODE_ENV === "production" ? undefined : { target: "pino-pretty" }
    },
    bodyLimit: 2 * 1024 * 1024
  });

  await app.register(cors, {
    origin: process.env.WEB_ORIGIN ?? true,
    credentials: true
  });

  await app.register(multipart, {
    limits: {
      fileSize: 200 * 1024 * 1024
    }
  });

  await app.register(prismaPlugin);
  await app.register(authPlugin);

  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof ZodError) {
      await reply.code(400).send({
        message: "请求参数不正确",
        issues: error.issues
      });
      return;
    }

    const knownError = error as { code?: string; meta?: { target?: unknown } };
    if (knownError.code === "P2002") {
      const target = Array.isArray(knownError.meta?.target) ? knownError.meta.target.join(",") : String(knownError.meta?.target ?? "");
      await reply.code(409).send({
        message: target.includes("email") ? "该邮箱已注册，请直接登录" : "记录已存在"
      });
      return;
    }

    if (knownError.code === "P2021" || knownError.code === "P2022") {
      await reply.code(503).send({ message: "数据库尚未初始化，请在服务器执行 bash deploy/update-server.sh" });
      return;
    }

    app.log.error(error);
    await reply.code(500).send({ message: "服务器内部错误" });
  });

  app.get("/health", async () => ({ ok: true }));

  await app.register(authRoutes);
  await app.register(teamRoutes);
  await app.register(inventoryRoutes);
  await app.register(orderRoutes);
  await app.register(protocolRoutes);
  await app.register(runRoutes);
  await app.register(fileRoutes);

  return app;
}
