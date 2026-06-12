import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireMembership, type AuthenticatedRequest } from "../services/permissions.js";
import { writeAudit } from "../services/audit.js";

const finishSchema = z.object({
  resultStatus: z.enum(["SUCCESS", "FAILED", "ABORTED"]),
  failureReason: z.string().optional().nullable(),
  failureStepId: z.string().optional().nullable(),
  failureNotes: z.string().optional().nullable()
});

const stepSchema = z.object({
  completed: z.boolean(),
  notes: z.string().optional().nullable()
});

export async function runRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  function canViewAllRuns(membership: { role: string; canViewAllRuns?: boolean }) {
    return membership.role === "OWNER" || membership.role === "ADMIN" || membership.canViewAllRuns === true;
  }

  app.get("/runs", async (request, reply) => {
    const query = z.object({
      teamId: z.string(),
      mine: z.coerce.boolean().optional()
    }).parse(request.query);

    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, query.teamId);
    if (!membership) return;

    const shouldShowOnlyMine = query.mine === true || !canViewAllRuns(membership);

    const runs = await app.prisma.experimentRun.findMany({
      where: {
        teamId: query.teamId,
        operatorUserId: shouldShowOnlyMine ? request.user.sub : undefined
      },
      include: {
        protocol: { select: { id: true, title: true } },
        operator: { select: { id: true, name: true, email: true } },
        steps: { orderBy: { orderIndex: "asc" } }
      },
      orderBy: { startedAt: "desc" }
    });

    return { runs };
  });

  app.get("/runs/:runId", async (request, reply) => {
    const params = z.object({ runId: z.string() }).parse(request.params);
    const run = await app.prisma.experimentRun.findUnique({
      where: { id: params.runId },
      include: {
        protocol: true,
        operator: { select: { id: true, name: true, email: true } },
        steps: { orderBy: { orderIndex: "asc" } },
        files: true
      }
    });

    if (!run) {
      await reply.code(404).send({ message: "实验记录不存在" });
      return;
    }

    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, run.teamId);
    if (!membership) return;

    if (run.operatorUserId !== request.user.sub && !canViewAllRuns(membership)) {
      await reply.code(403).send({ message: "无权查看其他成员的实验记录" });
      return;
    }

    return { run };
  });

  app.post("/runs", async (request, reply) => {
    const body = z.object({ protocolId: z.string() }).parse(request.body);
    const protocol = await app.prisma.protocol.findUnique({
      where: { id: body.protocolId },
      include: { steps: { orderBy: { orderIndex: "asc" } } }
    });

    if (!protocol || protocol.status !== "ACTIVE") {
      await reply.code(404).send({ message: "实验模板不存在或已归档" });
      return;
    }

    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, protocol.teamId);
    if (!membership) return;

    const run = await app.prisma.experimentRun.create({
      data: {
        teamId: protocol.teamId,
        protocolId: protocol.id,
        operatorUserId: request.user.sub,
        steps: {
          create: protocol.steps.map((step) => ({
            protocolStepId: step.id,
            orderIndex: step.orderIndex,
            title: step.title,
            description: step.description
          }))
        }
      },
      include: { steps: { orderBy: { orderIndex: "asc" } }, protocol: true }
    });

    await writeAudit(app, {
      teamId: protocol.teamId,
      userId: request.user.sub,
      action: "EXPERIMENT_RUN_STARTED",
      entity: "experiment_run",
      entityId: run.id
    });

    await reply.code(201).send({ run });
  });

  app.delete("/runs/:runId", async (request, reply) => {
    const params = z.object({ runId: z.string() }).parse(request.params);
    const run = await app.prisma.experimentRun.findUnique({ where: { id: params.runId } });

    if (!run) {
      await reply.code(404).send({ message: "实验记录不存在" });
      return;
    }

    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, run.teamId);
    if (!membership) return;

    if (run.operatorUserId !== request.user.sub) {
      await reply.code(403).send({ message: "只能删除自己开始的实验记录" });
      return;
    }

    await app.prisma.$transaction(async (tx) => {
      await tx.fileAsset.updateMany({
        where: { runId: run.id },
        data: { runId: null }
      });
      await tx.runStep.deleteMany({ where: { runId: run.id } });
      await tx.experimentRun.delete({ where: { id: run.id } });
    });

    await writeAudit(app, {
      teamId: run.teamId,
      userId: request.user.sub,
      action: "EXPERIMENT_RUN_DELETED",
      entity: "experiment_run",
      entityId: run.id
    });

    await reply.code(204).send();
  });

  app.patch("/runs/:runId/steps/:stepId", async (request, reply) => {
    const params = z.object({ runId: z.string(), stepId: z.string() }).parse(request.params);
    const body = stepSchema.parse(request.body);
    const run = await app.prisma.experimentRun.findUnique({ where: { id: params.runId } });

    if (!run) {
      await reply.code(404).send({ message: "实验记录不存在" });
      return;
    }

    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, run.teamId);
    if (!membership) return;

    if (run.operatorUserId !== request.user.sub) {
      await reply.code(403).send({ message: "成员只能修改自己的实验记录" });
      return;
    }

    const step = await app.prisma.runStep.findFirst({
      where: { id: params.stepId, runId: run.id }
    });

    if (!step) {
      await reply.code(404).send({ message: "实验步骤不存在" });
      return;
    }

    const updatedStep = await app.prisma.runStep.update({
      where: { id: step.id },
      data: {
        completedAt: body.completed ? new Date() : null,
        notes: body.notes
      }
    });

    return { step: updatedStep };
  });

  app.patch("/runs/:runId/finish", async (request, reply) => {
    const params = z.object({ runId: z.string() }).parse(request.params);
    const body = finishSchema.parse(request.body);
    const run = await app.prisma.experimentRun.findUnique({ where: { id: params.runId } });

    if (!run) {
      await reply.code(404).send({ message: "实验记录不存在" });
      return;
    }

    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, run.teamId);
    if (!membership) return;

    if (run.operatorUserId !== request.user.sub) {
      await reply.code(403).send({ message: "成员只能结束自己的实验记录" });
      return;
    }

    if (body.resultStatus === "FAILED" && !body.failureReason) {
      await reply.code(400).send({ message: "实验失败时需要填写失败原因" });
      return;
    }

    const updated = await app.prisma.experimentRun.update({
      where: { id: run.id },
      data: {
        status: body.resultStatus === "ABORTED" ? "ABORTED" : "COMPLETED",
        resultStatus: body.resultStatus,
        failureReason: body.failureReason,
        failureStepId: body.failureStepId,
        failureNotes: body.failureNotes,
        completedAt: new Date()
      },
      include: { steps: { orderBy: { orderIndex: "asc" } }, protocol: true }
    });

    await writeAudit(app, {
      teamId: run.teamId,
      userId: request.user.sub,
      action: "EXPERIMENT_RUN_FINISHED",
      entity: "experiment_run",
      entityId: run.id,
      metadata: { resultStatus: body.resultStatus }
    });

    return { run: updated };
  });
}
