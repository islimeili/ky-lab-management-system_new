import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export type TeamRole = "OWNER" | "ADMIN" | "MEMBER";

export type AuthenticatedRequest = FastifyRequest & {
  user: { sub: string };
};

export const roleLabels: Record<TeamRole, string> = {
  OWNER: "群主",
  ADMIN: "管理员",
  MEMBER: "成员"
};

export function isOwnerOrAdmin(role: TeamRole) {
  return role === "OWNER" || role === "ADMIN";
}

export async function getMembership(app: FastifyInstance, userId: string, teamId: string) {
  return app.prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } }
  });
}

export async function requireMembership(
  app: FastifyInstance,
  request: AuthenticatedRequest,
  reply: FastifyReply,
  teamId: string
) {
  const membership = await getMembership(app, request.user.sub, teamId);

  if (!membership) {
    await reply.code(403).send({ message: "无权访问该实验室团队" });
    return null;
  }

  return membership;
}

export async function requireOwnerOrAdmin(
  app: FastifyInstance,
  request: AuthenticatedRequest,
  reply: FastifyReply,
  teamId: string
) {
  const membership = await requireMembership(app, request, reply, teamId);

  if (!membership) {
    return null;
  }

  if (!isOwnerOrAdmin(membership.role)) {
    await reply.code(403).send({ message: "仅群主和管理员可以执行该操作" });
    return null;
  }

  return membership;
}

export async function requireOwner(
  app: FastifyInstance,
  request: AuthenticatedRequest,
  reply: FastifyReply,
  teamId: string
) {
  const membership = await requireMembership(app, request, reply, teamId);

  if (!membership) {
    return null;
  }

  if (membership.role !== "OWNER") {
    await reply.code(403).send({ message: "仅群主可以执行该操作" });
    return null;
  }

  return membership;
}
