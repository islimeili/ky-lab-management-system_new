import ExcelJS from "exceljs";
import type { FastifyInstance, FastifyReply } from "fastify";
import JSZip from "jszip";
import { z } from "zod";
import { requireMembership, requireOwnerOrAdmin, type AuthenticatedRequest } from "../services/permissions.js";

const formatSchema = z.enum(["json", "xlsx", "bundle"]).default("json");
const moduleSchema = z.enum(["inventory", "orders", "protocols", "runs", "mice", "messages"]);

const exportQuerySchema = z.object({
  teamId: z.string(),
  format: formatSchema
});

const moduleExportQuerySchema = exportQuerySchema.extend({
  module: moduleSchema
});

type ExportFormat = z.infer<typeof formatSchema>;
type ExportModule = z.infer<typeof moduleSchema>;

type SheetColumn = {
  key: string;
  header: string;
  width?: number;
};

type SheetData = {
  name: string;
  columns: SheetColumn[];
  rows: Record<string, unknown>[];
};

type ExportDataset = {
  title: string;
  fileStem: string;
  payload: Record<string, unknown>;
  sheets: SheetData[];
};

const userSelect = {
  id: true,
  name: true,
  email: true,
  createdAt: true
} as const;

const moduleLabels: Record<ExportModule, string> = {
  inventory: "药品管理",
  orders: "药品订购",
  protocols: "实验模板",
  runs: "执行记录",
  mice: "小鼠管理",
  messages: "消息"
};

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

function isoDate(value: unknown) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function plainValue(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "object" && "toString" in value && value.constructor?.name === "Decimal") {
    return Number(value.toString());
  }
  return JSON.stringify(value);
}

function tagsText(value: unknown) {
  if (!value) return "";
  if (Array.isArray(value)) return value.map(String).join("，");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function userName(user: { name?: string | null; email?: string | null } | null | undefined) {
  if (!user) return "";
  return user.name || user.email || "";
}

function makeExportInfo(input: { title: string; teamId: string; exportedByUserId: string; module?: ExportModule }) {
  return {
    schemaVersion: 2,
    title: input.title,
    teamId: input.teamId,
    module: input.module ?? "team",
    exportedAt: new Date(),
    exportedByUserId: input.exportedByUserId,
    note: "Backup export. File binaries are not embedded; file metadata and local download paths are included."
  };
}

function addWorksheet(workbook: ExcelJS.Workbook, sheet: SheetData) {
  const worksheet = workbook.addWorksheet(sheet.name.slice(0, 31));
  worksheet.columns = sheet.columns.map((column) => ({
    key: column.key,
    header: column.header,
    width: column.width ?? 18
  }));

  sheet.rows.forEach((row) => {
    const normalized: Record<string, string | number | boolean> = {};
    sheet.columns.forEach((column) => {
      normalized[column.key] = plainValue(row[column.key]);
    });
    worksheet.addRow(normalized);
  });

  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE5F0EA" }
  };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length }
  };
}

async function makeWorkbookBuffer(dataset: ExportDataset) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LabFlow LMS";
  workbook.created = new Date();
  workbook.modified = new Date();

  dataset.sheets.forEach((sheet) => addWorksheet(workbook, sheet));

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

async function sendDataset(reply: FastifyReply, dataset: ExportDataset, format: ExportFormat) {
  const today = new Date().toISOString().slice(0, 10);
  const stem = `${dataset.fileStem}-${today}`;

  if (format === "json") {
    const fileName = `${stem}.json`;
    return reply
      .header("content-type", "application/json; charset=utf-8")
      .header("content-disposition", `attachment; filename="${encodeURIComponent(fileName)}"`)
      .send(makeExportJson(dataset.payload));
  }

  if (format === "xlsx") {
    const fileName = `${stem}.xlsx`;
    const buffer = await makeWorkbookBuffer(dataset);
    return reply
      .header("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("content-disposition", `attachment; filename="${encodeURIComponent(fileName)}"`)
      .send(buffer);
  }

  const jsonName = `${stem}.json`;
  const xlsxName = `${stem}.xlsx`;
  const zipName = `${stem}.zip`;
  const zip = new JSZip();
  zip.file(jsonName, makeExportJson(dataset.payload));
  zip.file(xlsxName, await makeWorkbookBuffer(dataset));
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

  return reply
    .header("content-type", "application/zip")
    .header("content-disposition", `attachment; filename="${encodeURIComponent(zipName)}"`)
    .send(zipBuffer);
}

function inventorySheets(input: { items: any[]; events: any[]; files?: any[] }): SheetData[] {
  return [
    {
      name: "药品台账",
      columns: [
        { key: "name", header: "名称", width: 24 },
        { key: "alias", header: "别名", width: 18 },
        { key: "casNumber", header: "CAS", width: 18 },
        { key: "specification", header: "规格/浓度", width: 22 },
        { key: "supplier", header: "供应商", width: 22 },
        { key: "catalogNumber", header: "货号", width: 18 },
        { key: "batchNumber", header: "批号", width: 18 },
        { key: "quantity", header: "数量", width: 12 },
        { key: "unit", header: "单位", width: 10 },
        { key: "location", header: "位置", width: 20 },
        { key: "expiresAt", header: "有效期", width: 22 },
        { key: "status", header: "状态", width: 14 },
        { key: "hazardTags", header: "危险性标签", width: 24 },
        { key: "notes", header: "备注", width: 32 },
        { key: "createdAt", header: "创建时间", width: 22 },
        { key: "updatedAt", header: "更新时间", width: 22 },
        { key: "deletedAt", header: "删除/归档时间", width: 22 }
      ],
      rows: input.items.map((item) => ({
        ...item,
        quantity: Number(item.quantity ?? 0),
        expiresAt: isoDate(item.expiresAt),
        hazardTags: tagsText(item.hazardTags),
        createdAt: isoDate(item.createdAt),
        updatedAt: isoDate(item.updatedAt),
        deletedAt: isoDate(item.deletedAt)
      }))
    },
    {
      name: "库存流水",
      columns: [
        { key: "itemName", header: "药品", width: 24 },
        { key: "type", header: "类型", width: 14 },
        { key: "quantityBefore", header: "变更前", width: 12 },
        { key: "quantityDelta", header: "变化量", width: 12 },
        { key: "quantityAfter", header: "变更后", width: 12 },
        { key: "reason", header: "原因", width: 30 },
        { key: "operator", header: "操作者", width: 18 },
        { key: "createdAt", header: "时间", width: 22 }
      ],
      rows: input.events.map((event) => ({
        ...event,
        itemName: event.item?.name ?? event.itemName ?? "",
        quantityBefore: Number(event.quantityBefore ?? 0),
        quantityDelta: Number(event.quantityDelta ?? 0),
        quantityAfter: Number(event.quantityAfter ?? 0),
        operator: userName(event.user),
        createdAt: isoDate(event.createdAt)
      }))
    },
    {
      name: "药品图片",
      columns: [
        { key: "originalName", header: "文件名", width: 28 },
        { key: "mimeType", header: "类型", width: 18 },
        { key: "sizeBytes", header: "大小(bytes)", width: 16 },
        { key: "publicUrl", header: "访问路径", width: 36 },
        { key: "inventoryItemId", header: "关联药品ID", width: 36 },
        { key: "uploadedBy", header: "上传者", width: 18 },
        { key: "createdAt", header: "上传时间", width: 22 }
      ],
      rows: (input.files ?? []).map((file) => ({
        ...file,
        uploadedBy: userName(file.uploadedBy),
        createdAt: isoDate(file.createdAt)
      }))
    }
  ];
}

function orderSheets(orders: any[]): SheetData[] {
  return [
    {
      name: "药品订购",
      columns: [
        { key: "chemicalName", header: "药品名称", width: 24 },
        { key: "specification", header: "规格/浓度", width: 22 },
        { key: "supplier", header: "供应商", width: 22 },
        { key: "catalogNumber", header: "货号", width: 18 },
        { key: "quantity", header: "数量", width: 12 },
        { key: "unit", header: "单位", width: 10 },
        { key: "status", header: "状态", width: 14 },
        { key: "requestedBy", header: "发起人", width: 18 },
        { key: "note", header: "备注", width: 32 },
        { key: "createdAt", header: "创建时间", width: 22 },
        { key: "updatedAt", header: "更新时间", width: 22 }
      ],
      rows: orders.map((order) => ({
        ...order,
        quantity: Number(order.quantity ?? 0),
        requestedBy: userName(order.requestedBy),
        createdAt: isoDate(order.createdAt),
        updatedAt: isoDate(order.updatedAt)
      }))
    }
  ];
}

function protocolSheets(input: { protocols: any[]; files?: any[] }): SheetData[] {
  return [
    {
      name: "实验模板",
      columns: [
        { key: "title", header: "模板名称", width: 26 },
        { key: "description", header: "说明", width: 36 },
        { key: "tags", header: "标签", width: 24 },
        { key: "externalVideoUrl", header: "参考视频链接", width: 36 },
        { key: "status", header: "状态", width: 14 },
        { key: "createdBy", header: "创建者", width: 18 },
        { key: "createdAt", header: "创建时间", width: 22 },
        { key: "updatedAt", header: "更新时间", width: 22 }
      ],
      rows: input.protocols.map((protocol) => ({
        ...protocol,
        tags: tagsText(protocol.tags),
        createdBy: userName(protocol.createdBy),
        createdAt: isoDate(protocol.createdAt),
        updatedAt: isoDate(protocol.updatedAt)
      }))
    },
    {
      name: "模板步骤",
      columns: [
        { key: "protocolTitle", header: "模板", width: 26 },
        { key: "orderIndex", header: "序号", width: 10 },
        { key: "title", header: "步骤名称", width: 28 },
        { key: "description", header: "步骤说明", width: 42 }
      ],
      rows: input.protocols.flatMap((protocol) => (protocol.steps ?? []).map((step: any) => ({
        ...step,
        protocolTitle: protocol.title
      })))
    },
    {
      name: "模板附件",
      columns: [
        { key: "originalName", header: "文件名", width: 28 },
        { key: "mimeType", header: "类型", width: 18 },
        { key: "sizeBytes", header: "大小(bytes)", width: 16 },
        { key: "publicUrl", header: "访问路径", width: 36 },
        { key: "protocolId", header: "关联模板ID", width: 36 },
        { key: "createdAt", header: "上传时间", width: 22 }
      ],
      rows: (input.files ?? []).map((file) => ({ ...file, createdAt: isoDate(file.createdAt) }))
    }
  ];
}

function runSheets(input: { runs: any[]; files?: any[] }): SheetData[] {
  return [
    {
      name: "执行记录",
      columns: [
        { key: "protocolTitle", header: "实验模板", width: 26 },
        { key: "operator", header: "操作者", width: 18 },
        { key: "status", header: "进度状态", width: 14 },
        { key: "resultStatus", header: "实验结果", width: 14 },
        { key: "failureStepTitle", header: "失败步骤", width: 24 },
        { key: "failureReason", header: "失败原因", width: 32 },
        { key: "failureNotes", header: "现象与改进", width: 42 },
        { key: "startedAt", header: "开始时间", width: 22 },
        { key: "completedAt", header: "结束时间", width: 22 }
      ],
      rows: input.runs.map((run) => {
        const failureStep = (run.steps ?? []).find((step: any) => step.id === run.failureStepId);
        return {
          ...run,
          protocolTitle: run.protocol?.title ?? "",
          operator: userName(run.operator),
          failureStepTitle: failureStep?.title ?? "",
          startedAt: isoDate(run.startedAt),
          completedAt: isoDate(run.completedAt)
        };
      })
    },
    {
      name: "执行步骤",
      columns: [
        { key: "protocolTitle", header: "实验模板", width: 26 },
        { key: "operator", header: "操作者", width: 18 },
        { key: "orderIndex", header: "序号", width: 10 },
        { key: "title", header: "步骤名称", width: 28 },
        { key: "description", header: "步骤说明", width: 42 },
        { key: "completedAt", header: "完成时间", width: 22 },
        { key: "notes", header: "步骤备注", width: 32 }
      ],
      rows: input.runs.flatMap((run) => (run.steps ?? []).map((step: any) => ({
        ...step,
        protocolTitle: run.protocol?.title ?? "",
        operator: userName(run.operator),
        completedAt: isoDate(step.completedAt)
      })))
    },
    {
      name: "记录附件",
      columns: [
        { key: "originalName", header: "文件名", width: 28 },
        { key: "mimeType", header: "类型", width: 18 },
        { key: "sizeBytes", header: "大小(bytes)", width: 16 },
        { key: "publicUrl", header: "访问路径", width: 36 },
        { key: "runId", header: "关联记录ID", width: 36 },
        { key: "createdAt", header: "上传时间", width: 22 }
      ],
      rows: (input.files ?? []).map((file) => ({ ...file, createdAt: isoDate(file.createdAt) }))
    }
  ];
}

function mouseSheets(input: { cages: any[]; animals: any[]; breedingPairs: any[]; records: any[] }): SheetData[] {
  return [
    {
      name: "笼位",
      columns: [
        { key: "cageCode", header: "笼位编号", width: 18 },
        { key: "location", header: "位置", width: 18 },
        { key: "rack", header: "架号", width: 14 },
        { key: "layer", header: "层数", width: 14 },
        { key: "capacity", header: "容量", width: 10 },
        { key: "strain", header: "品系", width: 18 },
        { key: "caretaker", header: "负责人", width: 18 },
        { key: "status", header: "状态", width: 14 },
        { key: "notes", header: "备注", width: 32 },
        { key: "updatedAt", header: "更新时间", width: 22 }
      ],
      rows: input.cages.map((cage) => ({
        ...cage,
        caretaker: userName(cage.caretaker),
        updatedAt: isoDate(cage.updatedAt)
      }))
    },
    {
      name: "小鼠档案",
      columns: [
        { key: "animalCode", header: "小鼠编号", width: 18 },
        { key: "cageCode", header: "笼位", width: 18 },
        { key: "strain", header: "品系", width: 18 },
        { key: "genotype", header: "基因型", width: 18 },
        { key: "sex", header: "性别", width: 12 },
        { key: "birthDate", header: "出生日期", width: 22 },
        { key: "source", header: "来源", width: 18 },
        { key: "supplier", header: "供应商", width: 18 },
        { key: "batchNumber", header: "批号", width: 18 },
        { key: "status", header: "状态", width: 14 },
        { key: "notes", header: "备注", width: 32 },
        { key: "updatedAt", header: "更新时间", width: 22 }
      ],
      rows: input.animals.map((animal) => ({
        ...animal,
        cageCode: animal.cage?.cageCode ?? "",
        birthDate: isoDate(animal.birthDate),
        updatedAt: isoDate(animal.updatedAt)
      }))
    },
    {
      name: "繁殖记录",
      columns: [
        { key: "cageCode", header: "笼位", width: 18 },
        { key: "fatherCode", header: "父本", width: 18 },
        { key: "motherCode", header: "母本", width: 18 },
        { key: "pairDate", header: "配笼日期", width: 22 },
        { key: "separatedDate", header: "分笼日期", width: 22 },
        { key: "litterDate", header: "产仔日期", width: 22 },
        { key: "weanDate", header: "断奶日期", width: 22 },
        { key: "litterCount", header: "窝数/仔数", width: 12 },
        { key: "offspringCount", header: "子代数", width: 12 },
        { key: "status", header: "状态", width: 16 },
        { key: "notes", header: "备注", width: 32 },
        { key: "updatedAt", header: "更新时间", width: 22 }
      ],
      rows: input.breedingPairs.map((pair) => ({
        ...pair,
        cageCode: pair.cage?.cageCode ?? "",
        fatherCode: pair.fatherMouse?.animalCode ?? "",
        motherCode: pair.motherMouse?.animalCode ?? "",
        pairDate: isoDate(pair.pairDate),
        separatedDate: isoDate(pair.separatedDate),
        litterDate: isoDate(pair.litterDate),
        weanDate: isoDate(pair.weanDate),
        updatedAt: isoDate(pair.updatedAt)
      }))
    },
    {
      name: "使用记录",
      columns: [
        { key: "mouseCode", header: "小鼠编号", width: 18 },
        { key: "operator", header: "操作者", width: 18 },
        { key: "recordType", header: "类型", width: 16 },
        { key: "title", header: "标题", width: 24 },
        { key: "performedAt", header: "时间", width: 22 },
        { key: "notes", header: "备注", width: 36 }
      ],
      rows: input.records.map((record) => ({
        ...record,
        mouseCode: record.mouse?.animalCode ?? "",
        operator: userName(record.operator),
        performedAt: isoDate(record.performedAt)
      }))
    }
  ];
}

function messageSheets(input: { systemReminders: any[]; directMessages: any[]; announcements: any[] }): SheetData[] {
  return [
    {
      name: "系统提醒",
      columns: [
        { key: "title", header: "标题", width: 24 },
        { key: "body", header: "内容", width: 42 },
        { key: "itemName", header: "药品", width: 24 },
        { key: "location", header: "位置", width: 18 },
        { key: "expiresAt", header: "有效期", width: 22 },
        { key: "daysLeft", header: "剩余天数", width: 12 }
      ],
      rows: input.systemReminders.map((reminder) => ({
        ...reminder,
        expiresAt: isoDate(reminder.expiresAt)
      }))
    },
    {
      name: "成员消息",
      columns: [
        { key: "senderName", header: "发送人", width: 18 },
        { key: "recipientName", header: "接收人", width: 18 },
        { key: "body", header: "内容", width: 42 },
        { key: "createdAt", header: "时间", width: 22 }
      ],
      rows: input.directMessages.map((message) => ({
        ...message,
        senderName: userName(message.sender),
        recipientName: userName(message.recipient),
        createdAt: isoDate(message.createdAt)
      }))
    },
    {
      name: "实验室公告",
      columns: [
        { key: "title", header: "标题", width: 24 },
        { key: "body", header: "内容", width: 42 },
        { key: "senderName", header: "发布人", width: 18 },
        { key: "createdAt", header: "发布时间", width: 22 }
      ],
      rows: input.announcements.map((message) => ({
        ...message,
        senderName: userName(message.sender),
        createdAt: isoDate(message.createdAt)
      }))
    }
  ];
}

function teamSheets(data: any): SheetData[] {
  return [
    {
      name: "团队信息",
      columns: [
        { key: "name", header: "团队名称", width: 24 },
        { key: "ownerUserId", header: "群主用户ID", width: 36 },
        { key: "fileUploadEnabled", header: "文件上传权限", width: 16 },
        { key: "createdAt", header: "创建时间", width: 22 },
        { key: "updatedAt", header: "更新时间", width: 22 }
      ],
      rows: [{ ...data.team, createdAt: isoDate(data.team.createdAt), updatedAt: isoDate(data.team.updatedAt) }]
    },
    {
      name: "成员",
      columns: [
        { key: "name", header: "姓名", width: 18 },
        { key: "email", header: "邮箱", width: 28 },
        { key: "role", header: "角色", width: 14 },
        { key: "canViewAllRuns", header: "可看全部记录", width: 16 },
        { key: "joinedAt", header: "加入时间", width: 22 }
      ],
      rows: data.members.map((member: any) => ({
        name: member.user?.name ?? "",
        email: member.user?.email ?? "",
        role: member.role,
        canViewAllRuns: member.canViewAllRuns,
        joinedAt: isoDate(member.joinedAt)
      }))
    },
    {
      name: "邀请记录",
      columns: [
        { key: "token", header: "邀请 token", width: 36 },
        { key: "createdBy", header: "创建者", width: 18 },
        { key: "expiresAt", header: "过期时间", width: 22 },
        { key: "usedAt", header: "使用时间", width: 22 },
        { key: "createdAt", header: "创建时间", width: 22 }
      ],
      rows: data.invites.map((invite: any) => ({
        ...invite,
        createdBy: userName(invite.createdBy),
        expiresAt: isoDate(invite.expiresAt),
        usedAt: isoDate(invite.usedAt),
        createdAt: isoDate(invite.createdAt)
      }))
    },
    ...inventorySheets({ items: data.inventory.items, events: data.inventory.events, files: data.inventory.imageFiles }),
    ...orderSheets(data.purchaseOrders),
    ...protocolSheets({ protocols: data.protocols, files: data.protocolFiles }),
    ...runSheets({ runs: data.experimentRuns, files: data.runFiles }),
    ...mouseSheets(data.mouseManagement),
    ...messageSheets({
      systemReminders: data.systemReminders,
      directMessages: data.messages.filter((message: any) => message.kind === "DIRECT"),
      announcements: data.messages.filter((message: any) => message.kind === "ANNOUNCEMENT")
    }),
    {
      name: "文件元数据",
      columns: [
        { key: "kind", header: "类型", width: 18 },
        { key: "originalName", header: "文件名", width: 28 },
        { key: "mimeType", header: "MIME", width: 18 },
        { key: "sizeBytes", header: "大小(bytes)", width: 16 },
        { key: "publicUrl", header: "访问路径", width: 36 },
        { key: "uploadedBy", header: "上传者", width: 18 },
        { key: "createdAt", header: "上传时间", width: 22 }
      ],
      rows: data.files.map((file: any) => ({
        ...file,
        uploadedBy: userName(file.uploadedBy),
        createdAt: isoDate(file.createdAt)
      }))
    },
    {
      name: "审计日志",
      columns: [
        { key: "action", header: "动作", width: 26 },
        { key: "entity", header: "对象", width: 20 },
        { key: "entityId", header: "对象ID", width: 36 },
        { key: "operator", header: "操作者", width: 18 },
        { key: "metadata", header: "元数据", width: 36 },
        { key: "createdAt", header: "时间", width: 22 }
      ],
      rows: data.auditLogs.map((log: any) => ({
        ...log,
        operator: userName(log.user),
        metadata: tagsText(log.metadata),
        createdAt: isoDate(log.createdAt)
      }))
    }
  ];
}

async function loadSystemReminders(app: FastifyInstance, teamId: string) {
  const now = new Date();
  const warningUntil = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const items = await app.prisma.inventoryItem.findMany({
    where: {
      teamId,
      deletedAt: null,
      status: { notIn: ["DISPOSED", "ARCHIVED"] },
      expiresAt: { gte: now, lte: warningUntil }
    },
    orderBy: { expiresAt: "asc" }
  });

  return items.map((item) => {
    const daysLeft = item.expiresAt
      ? Math.ceil((item.expiresAt.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    return {
      id: `expiry-${item.id}`,
      inventoryItemId: item.id,
      title: "药品即将过期",
      body: `${item.name} 将在 ${item.expiresAt?.toISOString().slice(0, 10)} 过期，请及时确认库存或处理。`,
      itemName: item.name,
      location: item.location,
      expiresAt: item.expiresAt,
      daysLeft
    };
  });
}

async function loadInventoryData(app: FastifyInstance, teamId: string) {
  const [items, events, imageFiles] = await Promise.all([
    app.prisma.inventoryItem.findMany({
      where: { teamId },
      include: { imageFile: true, imageFiles: true },
      orderBy: { updatedAt: "desc" }
    }),
    app.prisma.inventoryEvent.findMany({
      where: { teamId },
      include: { item: { select: { id: true, name: true } }, user: { select: userSelect } },
      orderBy: { createdAt: "desc" }
    }),
    app.prisma.fileAsset.findMany({
      where: { teamId, kind: "CHEMICAL_IMAGE" },
      include: { uploadedBy: { select: userSelect } },
      orderBy: { createdAt: "desc" }
    })
  ]);

  return { items, events, imageFiles };
}

async function loadOrderData(app: FastifyInstance, teamId: string) {
  return app.prisma.purchaseOrder.findMany({
    where: { teamId },
    include: { requestedBy: { select: userSelect } },
    orderBy: { createdAt: "desc" }
  });
}

async function loadProtocolData(app: FastifyInstance, teamId: string) {
  const [protocols, protocolFiles] = await Promise.all([
    app.prisma.protocol.findMany({
      where: { teamId },
      include: {
        createdBy: { select: userSelect },
        steps: { orderBy: { orderIndex: "asc" } },
        files: true
      },
      orderBy: { updatedAt: "desc" }
    }),
    app.prisma.fileAsset.findMany({
      where: { teamId, protocolId: { not: null } },
      include: { uploadedBy: { select: userSelect } },
      orderBy: { createdAt: "desc" }
    })
  ]);

  return { protocols, protocolFiles };
}

async function loadRunData(app: FastifyInstance, teamId: string, userId: string, canViewAllRuns: boolean) {
  const where = { teamId, operatorUserId: canViewAllRuns ? undefined : userId };
  const [runs, runFiles] = await Promise.all([
    app.prisma.experimentRun.findMany({
      where,
      include: {
        protocol: { select: { id: true, title: true } },
        operator: { select: userSelect },
        steps: { orderBy: { orderIndex: "asc" } },
        files: true
      },
      orderBy: { startedAt: "desc" }
    }),
    app.prisma.fileAsset.findMany({
      where: {
        teamId,
        runId: { not: null },
        run: { operatorUserId: canViewAllRuns ? undefined : userId }
      },
      include: { uploadedBy: { select: userSelect } },
      orderBy: { createdAt: "desc" }
    })
  ]);

  return { runs, runFiles };
}

async function loadMouseData(app: FastifyInstance, teamId: string) {
  const [cages, animals, breedingPairs, records] = await Promise.all([
    app.prisma.mouseCage.findMany({
      where: { teamId },
      include: { caretaker: { select: userSelect } },
      orderBy: { updatedAt: "desc" }
    }),
    app.prisma.mouseAnimal.findMany({
      where: { teamId },
      include: { cage: true },
      orderBy: { updatedAt: "desc" }
    }),
    app.prisma.mouseBreedingPair.findMany({
      where: { teamId },
      include: { cage: true, fatherMouse: true, motherMouse: true },
      orderBy: { updatedAt: "desc" }
    }),
    app.prisma.mouseExperimentRecord.findMany({
      where: { teamId },
      include: { mouse: true, operator: { select: userSelect } },
      orderBy: { performedAt: "desc" }
    })
  ]);

  return { cages, animals, breedingPairs, records };
}

async function loadVisibleMessageData(app: FastifyInstance, teamId: string, userId: string) {
  const [systemReminders, directMessages, announcements] = await Promise.all([
    loadSystemReminders(app, teamId),
    app.prisma.teamMessage.findMany({
      where: {
        teamId,
        kind: "DIRECT",
        deletedAt: null,
        OR: [
          { senderUserId: userId, senderDeletedAt: null },
          { recipientUserId: userId, recipientDeletedAt: null }
        ]
      },
      include: { sender: { select: userSelect }, recipient: { select: userSelect } },
      orderBy: { createdAt: "desc" }
    }),
    app.prisma.teamMessage.findMany({
      where: { teamId, kind: "ANNOUNCEMENT", deletedAt: null },
      include: { sender: { select: userSelect }, recipient: { select: userSelect } },
      orderBy: { createdAt: "desc" }
    })
  ]);

  return { systemReminders, directMessages, announcements };
}

async function loadTeamDataset(app: FastifyInstance, teamId: string, exportedByUserId: string): Promise<ExportDataset> {
  const [
    team,
    members,
    invites,
    inventory,
    purchaseOrders,
    protocols,
    runs,
    mouseManagement,
    messages,
    files,
    auditLogs,
    systemReminders
  ] = await Promise.all([
    app.prisma.team.findUniqueOrThrow({ where: { id: teamId } }),
    app.prisma.teamMember.findMany({
      where: { teamId },
      include: { user: { select: userSelect } },
      orderBy: { joinedAt: "asc" }
    }),
    app.prisma.teamInvite.findMany({
      where: { teamId },
      include: { createdBy: { select: userSelect } },
      orderBy: { createdAt: "desc" }
    }),
    loadInventoryData(app, teamId),
    loadOrderData(app, teamId),
    loadProtocolData(app, teamId),
    loadRunData(app, teamId, exportedByUserId, true),
    loadMouseData(app, teamId),
    app.prisma.teamMessage.findMany({
      where: { teamId },
      include: { sender: { select: userSelect }, recipient: { select: userSelect } },
      orderBy: { createdAt: "desc" }
    }),
    app.prisma.fileAsset.findMany({
      where: { teamId },
      include: { uploadedBy: { select: userSelect } },
      orderBy: { createdAt: "desc" }
    }),
    app.prisma.auditLog.findMany({
      where: { teamId },
      include: { user: { select: userSelect } },
      orderBy: { createdAt: "desc" }
    }),
    loadSystemReminders(app, teamId)
  ]);

  const payload = {
    exportInfo: makeExportInfo({ title: "团队完整数据备份", teamId, exportedByUserId }),
    team,
    members,
    invites,
    inventory: {
      items: inventory.items,
      events: inventory.events,
      imageFiles: inventory.imageFiles
    },
    purchaseOrders,
    protocols: protocols.protocols,
    protocolFiles: protocols.protocolFiles,
    experimentRuns: runs.runs,
    runFiles: runs.runFiles,
    mouseManagement,
    systemReminders,
    messages,
    files,
    auditLogs
  };

  return {
    title: "团队完整数据备份",
    fileStem: `lab-backup-${safeFilePart(team.name)}`,
    payload,
    sheets: teamSheets(payload)
  };
}

async function loadModuleDataset(app: FastifyInstance, module: ExportModule, teamId: string, exportedByUserId: string, canViewAllRuns: boolean): Promise<ExportDataset> {
  const team = await app.prisma.team.findUniqueOrThrow({ where: { id: teamId } });
  const exportInfo = makeExportInfo({ title: moduleLabels[module], teamId, exportedByUserId, module });
  const fileStem = `lab-${module}-${safeFilePart(team.name)}`;

  if (module === "inventory") {
    const data = await loadInventoryData(app, teamId);
    const payload = { exportInfo, inventory: data };
    return { title: moduleLabels[module], fileStem, payload, sheets: inventorySheets({ items: data.items, events: data.events, files: data.imageFiles }) };
  }

  if (module === "orders") {
    const purchaseOrders = await loadOrderData(app, teamId);
    const payload = { exportInfo, purchaseOrders };
    return { title: moduleLabels[module], fileStem, payload, sheets: orderSheets(purchaseOrders) };
  }

  if (module === "protocols") {
    const data = await loadProtocolData(app, teamId);
    const payload = { exportInfo, protocols: data.protocols, protocolFiles: data.protocolFiles };
    return { title: moduleLabels[module], fileStem, payload, sheets: protocolSheets({ protocols: data.protocols, files: data.protocolFiles }) };
  }

  if (module === "runs") {
    const data = await loadRunData(app, teamId, exportedByUserId, canViewAllRuns);
    const payload = { exportInfo, experimentRuns: data.runs, runFiles: data.runFiles };
    return { title: moduleLabels[module], fileStem, payload, sheets: runSheets({ runs: data.runs, files: data.runFiles }) };
  }

  if (module === "mice") {
    const data = await loadMouseData(app, teamId);
    const payload = { exportInfo, mouseManagement: data };
    return { title: moduleLabels[module], fileStem, payload, sheets: mouseSheets(data) };
  }

  const data = await loadVisibleMessageData(app, teamId, exportedByUserId);
  const payload = { exportInfo, messages: data };
  return { title: moduleLabels[module], fileStem, payload, sheets: messageSheets(data) };
}

export async function exportRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.get("/exports/team", async (request, reply) => {
    const query = exportQuerySchema.parse(request.query);
    const membership = await requireOwnerOrAdmin(app, request as AuthenticatedRequest, reply, query.teamId);
    if (!membership) return;

    const dataset = await loadTeamDataset(app, query.teamId, request.user.sub);
    return sendDataset(reply, dataset, query.format);
  });

  app.get("/exports/module", async (request, reply) => {
    const query = moduleExportQuerySchema.parse(request.query);
    const membership = await requireMembership(app, request as AuthenticatedRequest, reply, query.teamId);
    if (!membership) return;

    const canViewAllRuns = membership.role === "OWNER" || membership.role === "ADMIN" || membership.canViewAllRuns;
    const dataset = await loadModuleDataset(app, query.module, query.teamId, request.user.sub, canViewAllRuns);
    return sendDataset(reply, dataset, query.format);
  });
}
