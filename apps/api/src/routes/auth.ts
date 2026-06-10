import type { FastifyInstance } from "fastify";
import { hash, compare } from "bcryptjs";
import { z } from "zod";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(80),
  teamName: z.string().min(1).max(120).optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

function publicUser(user: { id: string; email: string; name: string; createdAt: Date }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt
  };
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const passwordHash = await hash(body.password, 12);

    const result = await app.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: body.email.toLowerCase(),
          name: body.name,
          passwordHash
        }
      });

      let activeTeamId: string | undefined;
      if (body.teamName) {
        const team = await tx.team.create({
          data: {
            name: body.teamName,
            ownerUserId: user.id,
            members: {
              create: {
                userId: user.id,
                role: "OWNER"
              }
            }
          }
        });
        activeTeamId = team.id;
      }

      return { user, activeTeamId };
    });

    const token = app.jwt.sign({ sub: result.user.id });
    await reply.code(201).send({ token, user: publicUser(result.user), activeTeamId: result.activeTeamId });
  });

  app.post("/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const user = await app.prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });

    if (!user || !(await compare(body.password, user.passwordHash))) {
      await reply.code(401).send({ message: "邮箱或密码不正确" });
      return;
    }

    const firstMembership = await app.prisma.teamMember.findFirst({
      where: { userId: user.id },
      orderBy: { joinedAt: "asc" }
    });

    const token = app.jwt.sign({ sub: user.id });
    await reply.send({ token, user: publicUser(user), activeTeamId: firstMembership?.teamId });
  });

  app.get("/auth/me", { onRequest: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, name: true, createdAt: true }
    });

    return { user };
  });
}
