import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireMembership, requireOwner, requireOwnerOrAdmin, type AuthenticatedRequest } from "../services/permissions.js";
import { writeAudit } from "../services/audit.js";

const createTeamSchema = z.object({
  name: z.string().min(1).max(120)
});

const roleSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER"])
});

const runVisibilitySchema = z.object({
  canViewAllRuns: z.boolean()
});

export async function teamRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.get("/teams", async (request) => {
    const userId = request.user.sub;
    const memberships = await app.prisma.teamMember.findMany({
      where: { userId },
      include: { team: true },
      orderBy: { joinedAt: "asc" }
    });

    return {
      teams: memberships.map((membership) => ({
        id: membership.team.id,
        name: membership.team.name,
        role: membership.role,
        canViewAllRuns: membership.role === "OWNER" || membership.canViewAllRuns,
        fileUploadEnabled: membership.team.fileUploadEnabled,
        joinedAt: membership.joinedAt
      }))
    };
  });

  app.post("/teams", async (request, reply) => {
    const body = createTeamSchema.parse(request.body);
    const userId = request.user.sub;

    const team = await app.prisma.team.create({
      data: {
        name: body.name,
        ownerUserId: userId,
        members: {
          create: {
            userId,
            role: "OWNER"
          }
        }
      }
    });

    await writeAudit(app, {
      teamId: team.id,
      userId,
      action: "TEAM_CREATED",
      entity: "team",
      entityId: team.id
    });

    await reply.code(201).send({ team });
  });

  app.get("/teams/:teamId/members", async (request, reply) => {
    const params = z.object({ teamId: z.string() }).parse(request.params);
    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, params.teamId);
    if (!membership) return;

    const members = await app.prisma.teamMember.findMany({
      where: { teamId: params.teamId },
      include: { user: { select: { id: true, email: true, name: true, createdAt: true } } },
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }]
    });

    return { members };
  });

  app.post("/teams/:teamId/invites", async (request, reply) => {
    const params = z.object({ teamId: z.string() }).parse(request.params);
    const membership = await requireOwnerOrAdmin(app, request as AuthenticatedRequest, reply, params.teamId);
    if (!membership) return;

    const invite = await app.prisma.teamInvite.create({
      data: {
        teamId: params.teamId,
        createdByUserId: request.user.sub,
        token: crypto.randomUUID().replaceAll("-", ""),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
      }
    });

    await writeAudit(app, {
      teamId: params.teamId,
      userId: request.user.sub,
      action: "TEAM_INVITE_CREATED",
      entity: "team_invite",
      entityId: invite.id
    });

    await reply.code(201).send({ invite });
  });

  app.post("/teams/join/:token", async (request, reply) => {
    const params = z.object({ token: z.string() }).parse(request.params);
    const invite = await app.prisma.teamInvite.findUnique({ where: { token: params.token } });

    if (!invite || invite.expiresAt < new Date()) {
      await reply.code(404).send({ message: "邀请链接无效或已过期" });
      return;
    }

    const membership = await app.prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: invite.teamId, userId: request.user.sub } },
      update: {},
      create: {
        teamId: invite.teamId,
        userId: request.user.sub,
        role: "MEMBER"
      }
    });

    await writeAudit(app, {
      teamId: invite.teamId,
      userId: request.user.sub,
      action: "TEAM_JOINED",
      entity: "team_member",
      entityId: membership.id
    });

    await reply.send({ membership });
  });

  app.patch("/teams/:teamId/members/:userId/role", async (request, reply) => {
    const params = z.object({ teamId: z.string(), userId: z.string() }).parse(request.params);
    const body = roleSchema.parse(request.body);
    const membership = await requireOwner(app, request as AuthenticatedRequest, reply, params.teamId);
    if (!membership) return;

    const target = await app.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: params.teamId, userId: params.userId } }
    });

    if (!target) {
      await reply.code(404).send({ message: "成员不存在" });
      return;
    }

    if (target.role === "OWNER") {
      await reply.code(400).send({ message: "不能修改群主权限" });
      return;
    }

    const updated = await app.prisma.teamMember.update({
      where: { id: target.id },
      data: { role: body.role }
    });

    await writeAudit(app, {
      teamId: params.teamId,
      userId: request.user.sub,
      action: "TEAM_MEMBER_ROLE_UPDATED",
      entity: "team_member",
      entityId: updated.id,
      metadata: { role: body.role }
    });

    await reply.send({ member: updated });
  });

  app.patch("/teams/:teamId/members/:userId/run-visibility", async (request, reply) => {
    const params = z.object({ teamId: z.string(), userId: z.string() }).parse(request.params);
    const body = runVisibilitySchema.parse(request.body);
    const membership = await requireOwner(app, request as AuthenticatedRequest, reply, params.teamId);
    if (!membership) return;

    const target = await app.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: params.teamId, userId: params.userId } }
    });

    if (!target) {
      await reply.code(404).send({ message: "成员不存在" });
      return;
    }

    if (target.role === "OWNER") {
      await reply.code(400).send({ message: "群主默认可以查看所有执行记录" });
      return;
    }

    const updated = await app.prisma.teamMember.update({
      where: { id: target.id },
      data: { canViewAllRuns: body.canViewAllRuns }
    });

    await writeAudit(app, {
      teamId: params.teamId,
      userId: request.user.sub,
      action: "TEAM_MEMBER_RUN_VISIBILITY_UPDATED",
      entity: "team_member",
      entityId: updated.id,
      metadata: { canViewAllRuns: body.canViewAllRuns }
    });

    await reply.send({ member: updated });
  });

  app.delete("/teams/:teamId/members/:userId", async (request, reply) => {
    const params = z.object({ teamId: z.string(), userId: z.string() }).parse(request.params);
    const membership = await requireOwner(app, request as AuthenticatedRequest, reply, params.teamId);
    if (!membership) return;

    const target = await app.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: params.teamId, userId: params.userId } }
    });

    if (!target) {
      await reply.code(404).send({ message: "成员不存在" });
      return;
    }

    if (target.role === "OWNER") {
      await reply.code(400).send({ message: "不能移除群主" });
      return;
    }

    await app.prisma.teamMember.delete({ where: { id: target.id } });
    await writeAudit(app, {
      teamId: params.teamId,
      userId: request.user.sub,
      action: "TEAM_MEMBER_REMOVED",
      entity: "team_member",
      entityId: target.id
    });

    await reply.code(204).send();
  });
}
