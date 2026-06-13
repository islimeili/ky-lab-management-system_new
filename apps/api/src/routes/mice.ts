import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireMembership, type AuthenticatedRequest } from "../services/permissions.js";
import { writeAudit } from "../services/audit.js";

const teamQuerySchema = z.object({
  teamId: z.string()
});

const nullableText = z.string().trim().optional().nullable();
const nullableDate = z.coerce.date().optional().nullable();
const nullableInt = z.coerce.number().int().nonnegative().optional().nullable();

const cageSchema = z.object({
  teamId: z.string(),
  cageCode: z.string().min(1).max(120),
  location: nullableText,
  rack: nullableText,
  layer: nullableText,
  capacity: nullableInt,
  strain: nullableText,
  caretakerUserId: nullableText,
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  notes: z.string().max(2000).optional().nullable()
});

const animalSchema = z.object({
  teamId: z.string(),
  cageId: nullableText,
  animalCode: z.string().min(1).max(120),
  strain: nullableText,
  genotype: nullableText,
  sex: z.enum(["MALE", "FEMALE", "UNKNOWN"]).optional(),
  birthDate: nullableDate,
  source: nullableText,
  supplier: nullableText,
  batchNumber: nullableText,
  status: z.enum(["ACTIVE", "EXPERIMENT", "BREEDING", "PENDING_DISPOSAL", "DISPOSED", "DEAD", "ARCHIVED"]).optional(),
  notes: z.string().max(2000).optional().nullable()
});

const breedingSchema = z.object({
  teamId: z.string(),
  cageId: nullableText,
  fatherMouseId: nullableText,
  motherMouseId: nullableText,
  pairDate: nullableDate,
  separatedDate: nullableDate,
  litterDate: nullableDate,
  weanDate: nullableDate,
  litterCount: nullableInt,
  offspringCount: nullableInt,
  status: z.enum(["PAIRING", "PREGNANT", "LITTER_BORN", "WEANED", "CLOSED", "ARCHIVED"]).optional(),
  notes: z.string().max(2000).optional().nullable()
});

const recordSchema = z.object({
  teamId: z.string(),
  mouseId: z.string(),
  recordType: z.enum(["DOSING", "SAMPLING", "SURGERY", "BEHAVIOR", "EUTHANASIA", "OTHER"]).optional(),
  title: z.string().min(1).max(180),
  performedAt: z.coerce.date().optional(),
  notes: z.string().max(2000).optional().nullable()
});

const idParamSchema = z.object({ id: z.string() });

async function ensureCageInTeam(app: FastifyInstance, teamId: string, cageId?: string | null) {
  if (!cageId) return true;
  const cage = await app.prisma.mouseCage.findFirst({ where: { id: cageId, teamId, archivedAt: null } });
  return Boolean(cage);
}

async function ensureMouseInTeam(app: FastifyInstance, teamId: string, mouseId?: string | null) {
  if (!mouseId) return true;
  const mouse = await app.prisma.mouseAnimal.findFirst({ where: { id: mouseId, teamId, archivedAt: null } });
  return Boolean(mouse);
}

async function ensureMemberInTeam(app: FastifyInstance, teamId: string, userId?: string | null) {
  if (!userId) return true;
  const member = await app.prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } } });
  return Boolean(member);
}

export async function mouseRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.get("/mice", async (request, reply) => {
    const query = teamQuerySchema.parse(request.query);
    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, query.teamId);
    if (!membership) return;

    const [cages, animals, breedingPairs, records] = await Promise.all([
      app.prisma.mouseCage.findMany({
        where: { teamId: query.teamId, archivedAt: null },
        include: { caretaker: { select: { id: true, name: true, email: true } } },
        orderBy: { updatedAt: "desc" }
      }),
      app.prisma.mouseAnimal.findMany({
        where: { teamId: query.teamId, archivedAt: null },
        include: { cage: true },
        orderBy: { updatedAt: "desc" }
      }),
      app.prisma.mouseBreedingPair.findMany({
        where: { teamId: query.teamId, archivedAt: null },
        include: { cage: true, fatherMouse: true, motherMouse: true },
        orderBy: { updatedAt: "desc" }
      }),
      app.prisma.mouseExperimentRecord.findMany({
        where: { teamId: query.teamId, archivedAt: null },
        include: {
          mouse: true,
          operator: { select: { id: true, name: true, email: true } }
        },
        orderBy: { performedAt: "desc" }
      })
    ]);

    return { cages, animals, breedingPairs, records };
  });

  app.post("/mice/cages", async (request, reply) => {
    const body = cageSchema.parse(request.body);
    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, body.teamId);
    if (!membership) return;

    if (!(await ensureMemberInTeam(app, body.teamId, body.caretakerUserId))) {
      await reply.code(404).send({ message: "负责人不在当前团队中" });
      return;
    }

    const cage = await app.prisma.mouseCage.create({
      data: {
        teamId: body.teamId,
        cageCode: body.cageCode,
        location: body.location,
        rack: body.rack,
        layer: body.layer,
        capacity: body.capacity,
        strain: body.strain,
        caretakerUserId: body.caretakerUserId,
        status: body.status,
        notes: body.notes
      },
      include: { caretaker: { select: { id: true, name: true, email: true } } }
    });

    await writeAudit(app, {
      teamId: body.teamId,
      userId: request.user.sub,
      action: "MOUSE_CAGE_CREATED",
      entity: "mouse_cage",
      entityId: cage.id
    });

    await reply.code(201).send({ cage });
  });

  app.patch("/mice/cages/:id", async (request, reply) => {
    const params = idParamSchema.parse(request.params);
    const body = cageSchema.omit({ teamId: true }).partial().parse(request.body);
    const existing = await app.prisma.mouseCage.findUnique({ where: { id: params.id } });
    if (!existing) {
      await reply.code(404).send({ message: "笼位不存在" });
      return;
    }

    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, existing.teamId);
    if (!membership) return;

    if (!(await ensureMemberInTeam(app, existing.teamId, body.caretakerUserId))) {
      await reply.code(404).send({ message: "负责人不在当前团队中" });
      return;
    }

    const cage = await app.prisma.mouseCage.update({
      where: { id: params.id },
      data: body,
      include: { caretaker: { select: { id: true, name: true, email: true } } }
    });

    await writeAudit(app, {
      teamId: existing.teamId,
      userId: request.user.sub,
      action: "MOUSE_CAGE_UPDATED",
      entity: "mouse_cage",
      entityId: cage.id
    });

    await reply.send({ cage });
  });

  app.delete("/mice/cages/:id", async (request, reply) => {
    const params = idParamSchema.parse(request.params);
    const existing = await app.prisma.mouseCage.findUnique({ where: { id: params.id } });
    if (!existing) {
      await reply.code(404).send({ message: "笼位不存在" });
      return;
    }

    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, existing.teamId);
    if (!membership) return;

    const cage = await app.prisma.mouseCage.update({
      where: { id: params.id },
      data: { status: "ARCHIVED", archivedAt: new Date() }
    });

    await writeAudit(app, {
      teamId: existing.teamId,
      userId: request.user.sub,
      action: "MOUSE_CAGE_ARCHIVED",
      entity: "mouse_cage",
      entityId: cage.id
    });

    await reply.send({ cage });
  });

  app.post("/mice/animals", async (request, reply) => {
    const body = animalSchema.parse(request.body);
    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, body.teamId);
    if (!membership) return;

    if (!(await ensureCageInTeam(app, body.teamId, body.cageId))) {
      await reply.code(404).send({ message: "笼位不在当前团队中" });
      return;
    }

    const animal = await app.prisma.mouseAnimal.create({
      data: {
        teamId: body.teamId,
        cageId: body.cageId,
        animalCode: body.animalCode,
        strain: body.strain,
        genotype: body.genotype,
        sex: body.sex,
        birthDate: body.birthDate,
        source: body.source,
        supplier: body.supplier,
        batchNumber: body.batchNumber,
        status: body.status,
        notes: body.notes
      },
      include: { cage: true }
    });

    await writeAudit(app, {
      teamId: body.teamId,
      userId: request.user.sub,
      action: "MOUSE_ANIMAL_CREATED",
      entity: "mouse_animal",
      entityId: animal.id
    });

    await reply.code(201).send({ animal });
  });

  app.patch("/mice/animals/:id", async (request, reply) => {
    const params = idParamSchema.parse(request.params);
    const body = animalSchema.omit({ teamId: true }).partial().parse(request.body);
    const existing = await app.prisma.mouseAnimal.findUnique({ where: { id: params.id } });
    if (!existing) {
      await reply.code(404).send({ message: "小鼠不存在" });
      return;
    }

    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, existing.teamId);
    if (!membership) return;

    if (!(await ensureCageInTeam(app, existing.teamId, body.cageId))) {
      await reply.code(404).send({ message: "笼位不在当前团队中" });
      return;
    }

    const animal = await app.prisma.mouseAnimal.update({
      where: { id: params.id },
      data: body,
      include: { cage: true }
    });

    await writeAudit(app, {
      teamId: existing.teamId,
      userId: request.user.sub,
      action: "MOUSE_ANIMAL_UPDATED",
      entity: "mouse_animal",
      entityId: animal.id
    });

    await reply.send({ animal });
  });

  app.delete("/mice/animals/:id", async (request, reply) => {
    const params = idParamSchema.parse(request.params);
    const existing = await app.prisma.mouseAnimal.findUnique({ where: { id: params.id } });
    if (!existing) {
      await reply.code(404).send({ message: "小鼠不存在" });
      return;
    }

    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, existing.teamId);
    if (!membership) return;

    const animal = await app.prisma.mouseAnimal.update({
      where: { id: params.id },
      data: { status: "ARCHIVED", archivedAt: new Date() }
    });

    await writeAudit(app, {
      teamId: existing.teamId,
      userId: request.user.sub,
      action: "MOUSE_ANIMAL_ARCHIVED",
      entity: "mouse_animal",
      entityId: animal.id
    });

    await reply.send({ animal });
  });

  app.post("/mice/breeding", async (request, reply) => {
    const body = breedingSchema.parse(request.body);
    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, body.teamId);
    if (!membership) return;

    if (!(await ensureCageInTeam(app, body.teamId, body.cageId))) {
      await reply.code(404).send({ message: "笼位不在当前团队中" });
      return;
    }

    if (!(await ensureMouseInTeam(app, body.teamId, body.fatherMouseId)) || !(await ensureMouseInTeam(app, body.teamId, body.motherMouseId))) {
      await reply.code(404).send({ message: "父本或母本不在当前团队中" });
      return;
    }

    const pair = await app.prisma.mouseBreedingPair.create({
      data: {
        teamId: body.teamId,
        cageId: body.cageId,
        fatherMouseId: body.fatherMouseId,
        motherMouseId: body.motherMouseId,
        pairDate: body.pairDate,
        separatedDate: body.separatedDate,
        litterDate: body.litterDate,
        weanDate: body.weanDate,
        litterCount: body.litterCount,
        offspringCount: body.offspringCount,
        status: body.status,
        notes: body.notes
      },
      include: { cage: true, fatherMouse: true, motherMouse: true }
    });

    await writeAudit(app, {
      teamId: body.teamId,
      userId: request.user.sub,
      action: "MOUSE_BREEDING_CREATED",
      entity: "mouse_breeding_pair",
      entityId: pair.id
    });

    await reply.code(201).send({ pair });
  });

  app.patch("/mice/breeding/:id", async (request, reply) => {
    const params = idParamSchema.parse(request.params);
    const body = breedingSchema.omit({ teamId: true }).partial().parse(request.body);
    const existing = await app.prisma.mouseBreedingPair.findUnique({ where: { id: params.id } });
    if (!existing) {
      await reply.code(404).send({ message: "繁殖记录不存在" });
      return;
    }

    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, existing.teamId);
    if (!membership) return;

    if (!(await ensureCageInTeam(app, existing.teamId, body.cageId))) {
      await reply.code(404).send({ message: "笼位不在当前团队中" });
      return;
    }

    if (!(await ensureMouseInTeam(app, existing.teamId, body.fatherMouseId)) || !(await ensureMouseInTeam(app, existing.teamId, body.motherMouseId))) {
      await reply.code(404).send({ message: "父本或母本不在当前团队中" });
      return;
    }

    const pair = await app.prisma.mouseBreedingPair.update({
      where: { id: params.id },
      data: body,
      include: { cage: true, fatherMouse: true, motherMouse: true }
    });

    await writeAudit(app, {
      teamId: existing.teamId,
      userId: request.user.sub,
      action: "MOUSE_BREEDING_UPDATED",
      entity: "mouse_breeding_pair",
      entityId: pair.id
    });

    await reply.send({ pair });
  });

  app.delete("/mice/breeding/:id", async (request, reply) => {
    const params = idParamSchema.parse(request.params);
    const existing = await app.prisma.mouseBreedingPair.findUnique({ where: { id: params.id } });
    if (!existing) {
      await reply.code(404).send({ message: "繁殖记录不存在" });
      return;
    }

    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, existing.teamId);
    if (!membership) return;

    const pair = await app.prisma.mouseBreedingPair.update({
      where: { id: params.id },
      data: { status: "ARCHIVED", archivedAt: new Date() }
    });

    await writeAudit(app, {
      teamId: existing.teamId,
      userId: request.user.sub,
      action: "MOUSE_BREEDING_ARCHIVED",
      entity: "mouse_breeding_pair",
      entityId: pair.id
    });

    await reply.send({ pair });
  });

  app.post("/mice/records", async (request, reply) => {
    const body = recordSchema.parse(request.body);
    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, body.teamId);
    if (!membership) return;

    if (!(await ensureMouseInTeam(app, body.teamId, body.mouseId))) {
      await reply.code(404).send({ message: "小鼠不在当前团队中" });
      return;
    }

    const record = await app.prisma.mouseExperimentRecord.create({
      data: {
        teamId: body.teamId,
        mouseId: body.mouseId,
        operatorUserId: request.user.sub,
        recordType: body.recordType,
        title: body.title,
        performedAt: body.performedAt,
        notes: body.notes
      },
      include: {
        mouse: true,
        operator: { select: { id: true, name: true, email: true } }
      }
    });

    await writeAudit(app, {
      teamId: body.teamId,
      userId: request.user.sub,
      action: "MOUSE_RECORD_CREATED",
      entity: "mouse_experiment_record",
      entityId: record.id
    });

    await reply.code(201).send({ record });
  });

  app.patch("/mice/records/:id", async (request, reply) => {
    const params = idParamSchema.parse(request.params);
    const body = recordSchema.omit({ teamId: true }).partial().parse(request.body);
    const existing = await app.prisma.mouseExperimentRecord.findUnique({ where: { id: params.id } });
    if (!existing) {
      await reply.code(404).send({ message: "使用记录不存在" });
      return;
    }

    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, existing.teamId);
    if (!membership) return;

    if (!(await ensureMouseInTeam(app, existing.teamId, body.mouseId))) {
      await reply.code(404).send({ message: "小鼠不在当前团队中" });
      return;
    }

    const record = await app.prisma.mouseExperimentRecord.update({
      where: { id: params.id },
      data: body,
      include: {
        mouse: true,
        operator: { select: { id: true, name: true, email: true } }
      }
    });

    await writeAudit(app, {
      teamId: existing.teamId,
      userId: request.user.sub,
      action: "MOUSE_RECORD_UPDATED",
      entity: "mouse_experiment_record",
      entityId: record.id
    });

    await reply.send({ record });
  });

  app.delete("/mice/records/:id", async (request, reply) => {
    const params = idParamSchema.parse(request.params);
    const existing = await app.prisma.mouseExperimentRecord.findUnique({ where: { id: params.id } });
    if (!existing) {
      await reply.code(404).send({ message: "使用记录不存在" });
      return;
    }

    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, existing.teamId);
    if (!membership) return;

    const record = await app.prisma.mouseExperimentRecord.update({
      where: { id: params.id },
      data: { archivedAt: new Date() }
    });

    await writeAudit(app, {
      teamId: existing.teamId,
      userId: request.user.sub,
      action: "MOUSE_RECORD_ARCHIVED",
      entity: "mouse_experiment_record",
      entityId: record.id
    });

    await reply.send({ record });
  });
}
