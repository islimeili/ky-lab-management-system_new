import {
  AlertTriangle,
  Archive,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Crown,
  FlaskConical,
  Image as ImageIcon,
  Lock,
  Package,
  Play,
  Plus,
  Search,
  ShieldCheck,
  ShoppingCart,
  Upload,
  Users,
  Video,
  XCircle
} from "lucide-react";
import { useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import "./App.css";

type Role = "OWNER" | "ADMIN" | "MEMBER";
type InventoryStatus = "ACTIVE" | "LOW_STOCK" | "EXPIRED" | "DISPOSED" | "ARCHIVED";
type RunResult = "SUCCESS" | "FAILED" | "ABORTED";
type OrderStatus = "PENDING" | "ORDERED" | "ARRIVED" | "CANCELED";
type TabKey = "dashboard" | "inventory" | "protocols" | "runs" | "team";

type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  canViewAllRuns: boolean;
  joinedAt: string;
};

type InventoryItem = {
  id: string;
  name: string;
  alias?: string;
  casNumber?: string;
  specification: string;
  supplier: string;
  catalogNumber?: string;
  batchNumber?: string;
  quantity: number;
  unit: string;
  location: string;
  expiresAt?: string;
  status: InventoryStatus;
  hazardTags: string[];
  notes?: string;
  imageUrl?: string;
  updatedAt: string;
};

type InventoryEvent = {
  id: string;
  itemId: string;
  itemName: string;
  type: "INITIAL" | "RESTOCK" | "CONSUME" | "DISPOSE" | "ADJUST";
  before: number;
  delta: number;
  after: number;
  reason: string;
  userName: string;
  createdAt: string;
};

type PurchaseOrder = {
  id: string;
  chemicalName: string;
  specification: string;
  supplier?: string;
  quantity: number;
  unit: string;
  requesterUserId: string;
  requestedAt: string;
  status: OrderStatus;
  note?: string;
};

type ProtocolStep = {
  id: string;
  title: string;
  description?: string;
};

type ProtocolStepDraft = {
  id: string;
  title: string;
  description: string;
};

type Protocol = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  externalVideoUrl?: string;
  createdByUserId: string;
  updatedAt: string;
  steps: ProtocolStep[];
};

type RunStep = ProtocolStep & {
  completedAt?: string;
  notes?: string;
};

type ExperimentRun = {
  id: string;
  protocolId: string;
  operatorUserId: string;
  status: "IN_PROGRESS" | "COMPLETED" | "ABORTED";
  resultStatus?: RunResult;
  failureReason?: string;
  failureStepId?: string;
  failureNotes?: string;
  startedAt: string;
  completedAt?: string;
  steps: RunStep[];
};

const roleText: Record<Role, string> = {
  OWNER: "群主",
  ADMIN: "管理员",
  MEMBER: "成员"
};

const statusText: Record<InventoryStatus, string> = {
  ACTIVE: "正常",
  LOW_STOCK: "低库存",
  EXPIRED: "已过期",
  DISPOSED: "已报废",
  ARCHIVED: "已归档"
};

const runResultText: Record<RunResult, string> = {
  SUCCESS: "成功",
  FAILED: "失败",
  ABORTED: "中止"
};

const orderStatusText: Record<OrderStatus, string> = {
  PENDING: "待订购",
  ORDERED: "已下单",
  ARRIVED: "已到货",
  CANCELED: "已取消"
};

const initialMembers: Member[] = [
  {
    id: "u-owner",
    name: "陈老师",
    email: "owner@lab.local",
    role: "OWNER",
    canViewAllRuns: true,
    joinedAt: "2026-06-01"
  },
  {
    id: "u-admin",
    name: "林博士",
    email: "admin@lab.local",
    role: "ADMIN",
    canViewAllRuns: false,
    joinedAt: "2026-06-03"
  },
  {
    id: "u-member",
    name: "周同学",
    email: "member@lab.local",
    role: "MEMBER",
    canViewAllRuns: false,
    joinedAt: "2026-06-08"
  }
];

const initialInventory: InventoryItem[] = [
  {
    id: "chem-1",
    name: "乙腈",
    alias: "ACN",
    casNumber: "75-05-8",
    specification: "HPLC grade, 4L",
    supplier: "Merck",
    catalogNumber: "100030",
    batchNumber: "B2406A",
    quantity: 6,
    unit: "瓶",
    location: "有机试剂柜 A-02",
    expiresAt: "2027-02-15",
    status: "ACTIVE",
    hazardTags: ["易燃", "有毒"],
    notes: "开封后优先用于色谱流动相。",
    imageUrl: "https://images.unsplash.com/photo-1581093458791-9d09b4f0c4fa?auto=format&fit=crop&w=640&q=80",
    updatedAt: "2026-06-10 09:30"
  },
  {
    id: "chem-2",
    name: "Tris-HCl 缓冲液",
    alias: "Tris buffer",
    specification: "1M, pH 8.0, 500mL",
    supplier: "Solarbio",
    catalogNumber: "T1080",
    batchNumber: "TB0426",
    quantity: 2,
    unit: "瓶",
    location: "4°C 冰箱 B 层",
    expiresAt: "2026-08-20",
    status: "LOW_STOCK",
    hazardTags: ["低库存"],
    imageUrl: "https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&w=640&q=80",
    updatedAt: "2026-06-09 17:12"
  },
  {
    id: "chem-3",
    name: "氯化钠",
    alias: "NaCl",
    casNumber: "7647-14-5",
    specification: "AR, 500g",
    supplier: "国药",
    batchNumber: "NACL2601",
    quantity: 11,
    unit: "瓶",
    location: "常温试剂柜 C-11",
    expiresAt: "2028-01-31",
    status: "ACTIVE",
    hazardTags: ["常规"],
    imageUrl: "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?auto=format&fit=crop&w=640&q=80",
    updatedAt: "2026-06-10 12:05"
  }
];

const initialEvents: InventoryEvent[] = [
  {
    id: "evt-1",
    itemId: "chem-1",
    itemName: "乙腈",
    type: "CONSUME",
    before: 7,
    delta: -1,
    after: 6,
    reason: "LC-MS 流动相",
    userName: "林博士",
    createdAt: "2026-06-10 09:30"
  },
  {
    id: "evt-2",
    itemId: "chem-2",
    itemName: "Tris-HCl 缓冲液",
    type: "RESTOCK",
    before: 1,
    delta: 1,
    after: 2,
    reason: "补充库存",
    userName: "陈老师",
    createdAt: "2026-06-09 17:12"
  }
];

const initialOrders: PurchaseOrder[] = [
  {
    id: "order-1",
    chemicalName: "Tris-HCl 缓冲液",
    specification: "1M, pH 8.0, 500mL",
    supplier: "Solarbio",
    quantity: 4,
    unit: "瓶",
    requesterUserId: "u-admin",
    requestedAt: "2026-06-10 10:18",
    status: "PENDING",
    note: "低库存，优先补充细胞实验常用缓冲液。"
  }
];

const initialProtocols: Protocol[] = [
  {
    id: "protocol-1",
    title: "SDS-PAGE 蛋白电泳",
    description: "样品制备、上样、电泳、染色和脱色记录。",
    tags: ["蛋白", "电泳"],
    externalVideoUrl: "https://example.com/sds-page-reference",
    createdByUserId: "u-admin",
    updatedAt: "2026-06-08 14:22",
    steps: [
      { id: "p1-s1", title: "配制凝胶", description: "确认分离胶和浓缩胶比例，记录批号。" },
      { id: "p1-s2", title: "样品变性", description: "加入 loading buffer，95°C 加热 5 分钟。" },
      { id: "p1-s3", title: "上样与电泳", description: "按样品编号上样，80V 起跑后切换至 120V。" },
      { id: "p1-s4", title: "染色与脱色", description: "拍照保存原始胶图。" }
    ]
  },
  {
    id: "protocol-2",
    title: "细胞传代",
    description: "贴壁细胞消化、离心、重悬和接种流程。",
    tags: ["细胞", "培养"],
    createdByUserId: "u-owner",
    updatedAt: "2026-06-06 10:10",
    steps: [
      { id: "p2-s1", title: "观察细胞状态", description: "记录汇合度、污染和培养基颜色。" },
      { id: "p2-s2", title: "PBS 清洗", description: "弃培养基，PBS 轻柔清洗一次。" },
      { id: "p2-s3", title: "胰酶消化", description: "显微镜下确认细胞变圆后终止消化。" },
      { id: "p2-s4", title: "计数并接种", description: "记录接种密度和培养瓶编号。" }
    ]
  }
];

const initialRuns: ExperimentRun[] = [
  {
    id: "run-1",
    protocolId: "protocol-1",
    operatorUserId: "u-member",
    status: "IN_PROGRESS",
    startedAt: "2026-06-10 13:20",
    steps: [
      { id: "r1-s1", title: "配制凝胶", description: "确认分离胶和浓缩胶比例，记录批号。", completedAt: "2026-06-10 13:31" },
      { id: "r1-s2", title: "样品变性", description: "加入 loading buffer，95°C 加热 5 分钟。" },
      { id: "r1-s3", title: "上样与电泳", description: "按样品编号上样，80V 起跑后切换至 120V。" },
      { id: "r1-s4", title: "染色与脱色", description: "拍照保存原始胶图。" }
    ]
  }
];

function nowText() {
  return new Date().toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function canManage(role: Role) {
  return role === "OWNER" || role === "ADMIN";
}

function canViewAllRunRecords(member: Member) {
  return member.role === "OWNER" || member.canViewAllRuns;
}

function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [members, setMembers] = useState(initialMembers);
  const [currentUserId, setCurrentUserId] = useState("u-owner");
  const [inventory, setInventory] = useState(initialInventory);
  const [events, setEvents] = useState(initialEvents);
  const [orders, setOrders] = useState(initialOrders);
  const [protocols, setProtocols] = useState(initialProtocols);
  const [runs, setRuns] = useState(initialRuns);
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [protocolQuery, setProtocolQuery] = useState("");
  const [selectedRunId, setSelectedRunId] = useState("run-1");
  const [showInventoryForm, setShowInventoryForm] = useState(false);
  const [showProtocolForm, setShowProtocolForm] = useState(false);
  const [editingProtocolId, setEditingProtocolId] = useState<string | null>(null);
  const [protocolStepDrafts, setProtocolStepDrafts] = useState<ProtocolStepDraft[]>([
    { id: "draft-step-1", title: "", description: "" }
  ]);
  const [failureDraft, setFailureDraft] = useState({
    failureReason: "",
    failureStepId: "",
    failureNotes: ""
  });

  const currentMember = members.find((member) => member.id === currentUserId) ?? members[0];
  const canManageContent = canManage(currentMember.role);
  const isOwner = currentMember.role === "OWNER";
  const canViewAllRuns = canViewAllRunRecords(currentMember);
  const visibleRuns = canViewAllRuns ? runs : runs.filter((run) => run.operatorUserId === currentMember.id);
  const selectedRun = visibleRuns.find((run) => run.id === selectedRunId) ?? visibleRuns[0];
  const selectedVisibleRunId = selectedRun?.id ?? "";
  const editingProtocol = protocols.find((protocol) => protocol.id === editingProtocolId);

  const stats = useMemo(() => {
    const lowStock = inventory.filter((item) => item.status === "LOW_STOCK" || item.quantity <= 2).length;
    const activeRuns = visibleRuns.filter((run) => run.status === "IN_PROGRESS").length;
    const failedRuns = visibleRuns.filter((run) => run.resultStatus === "FAILED").length;

    return {
      chemicals: inventory.filter((item) => item.status !== "ARCHIVED").length,
      lowStock,
      protocols: protocols.length,
      activeRuns,
      failedRuns
    };
  }, [inventory, protocols.length, visibleRuns]);

  const filteredInventory = inventory.filter((item) => {
    const text = `${item.name} ${item.alias ?? ""} ${item.casNumber ?? ""} ${item.location}`.toLowerCase();
    return text.includes(inventoryQuery.toLowerCase());
  });

  const filteredProtocols = protocols.filter((protocol) => {
    const text = `${protocol.title} ${protocol.description} ${protocol.tags.join(" ")}`.toLowerCase();
    return text.includes(protocolQuery.toLowerCase());
  });

  function changeMemberRole(userId: string, role: "ADMIN" | "MEMBER") {
    if (!isOwner) return;
    setMembers((current) =>
      current.map((member) => (member.id === userId && member.role !== "OWNER" ? { ...member, role } : member))
    );
  }

  function toggleRunVisibility(userId: string) {
    if (!isOwner) return;
    setMembers((current) =>
      current.map((member) =>
        member.id === userId && member.role !== "OWNER"
          ? { ...member, canViewAllRuns: !member.canViewAllRuns }
          : member
      )
    );
  }

  function openNewProtocolForm() {
    setEditingProtocolId(null);
    setProtocolStepDrafts([{ id: `draft-${crypto.randomUUID()}`, title: "", description: "" }]);
    setShowProtocolForm(true);
  }

  function openEditProtocolForm(protocolId: string) {
    const protocol = protocols.find((item) => item.id === protocolId);
    if (!protocol || !canManageContent) return;

    setEditingProtocolId(protocol.id);
    setProtocolStepDrafts(
      protocol.steps.map((step) => ({
        id: `draft-${crypto.randomUUID()}`,
        title: step.title,
        description: step.description ?? ""
      }))
    );
    setShowProtocolForm(true);
  }

  function closeProtocolForm() {
    setEditingProtocolId(null);
    setProtocolStepDrafts([{ id: `draft-${crypto.randomUUID()}`, title: "", description: "" }]);
    setShowProtocolForm(false);
  }

  function archiveProtocol(protocolId: string) {
    if (!canManageContent) return;
    setProtocols((current) => current.filter((protocol) => protocol.id !== protocolId));
  }

  function addInventoryItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageContent) return;

    const form = new FormData(event.currentTarget);
    const image = form.get("image") as File | null;
    const imageUrl = image && image.size > 0 ? URL.createObjectURL(image) : undefined;
    const name = String(form.get("name") ?? "").trim();
    const quantity = Number(form.get("quantity") ?? 0);

    if (!name) return;

    const item: InventoryItem = {
      id: `chem-${crypto.randomUUID()}`,
      name,
      alias: String(form.get("alias") ?? ""),
      casNumber: String(form.get("casNumber") ?? ""),
      specification: String(form.get("specification") ?? ""),
      supplier: String(form.get("supplier") ?? ""),
      catalogNumber: String(form.get("catalogNumber") ?? ""),
      batchNumber: String(form.get("batchNumber") ?? ""),
      quantity,
      unit: String(form.get("unit") ?? "瓶"),
      location: String(form.get("location") ?? ""),
      expiresAt: String(form.get("expiresAt") ?? ""),
      status: quantity <= 2 ? "LOW_STOCK" : "ACTIVE",
      hazardTags: String(form.get("hazardTags") ?? "")
        .split(/[，,]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
      notes: String(form.get("notes") ?? ""),
      imageUrl,
      updatedAt: nowText()
    };

    setInventory((current) => [item, ...current]);
    setEvents((current) => [
      {
        id: `evt-${crypto.randomUUID()}`,
        itemId: item.id,
        itemName: item.name,
        type: "INITIAL",
        before: 0,
        delta: item.quantity,
        after: item.quantity,
        reason: "初始录入",
        userName: currentMember.name,
        createdAt: nowText()
      },
      ...current
    ]);
    event.currentTarget.reset();
    setShowInventoryForm(false);
  }

  function adjustStock(itemId: string, type: InventoryEvent["type"], rawDelta: number, reason: string) {
    if (!canManageContent) return;
    setInventory((current) =>
      current.map((item) => {
        if (item.id !== itemId) return item;
        const delta = type === "CONSUME" || type === "DISPOSE" ? -Math.abs(rawDelta) : Math.abs(rawDelta);
        const nextQuantity = Math.max(0, item.quantity + delta);
        const finalStatus: InventoryStatus = type === "DISPOSE" && nextQuantity === 0 ? "DISPOSED" : nextQuantity <= 2 ? "LOW_STOCK" : "ACTIVE";

        setEvents((existing) => [
          {
            id: `evt-${crypto.randomUUID()}`,
            itemId: item.id,
            itemName: item.name,
            type,
            before: item.quantity,
            delta: nextQuantity - item.quantity,
            after: nextQuantity,
            reason,
            userName: currentMember.name,
            createdAt: nowText()
          },
          ...existing
        ]);

        return {
          ...item,
          quantity: nextQuantity,
          status: finalStatus,
          updatedAt: nowText()
        };
      })
    );
  }

  function addOrderRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const chemicalName = String(form.get("chemicalName") ?? "").trim();
    const quantity = Number(form.get("quantity") ?? 0);

    if (!chemicalName || quantity <= 0) return;

    const order: PurchaseOrder = {
      id: `order-${crypto.randomUUID()}`,
      chemicalName,
      specification: String(form.get("specification") ?? ""),
      supplier: String(form.get("supplier") ?? ""),
      quantity,
      unit: String(form.get("unit") ?? "瓶"),
      requesterUserId: currentMember.id,
      requestedAt: nowText(),
      status: "PENDING",
      note: String(form.get("note") ?? "")
    };

    setOrders((current) => [order, ...current]);
    event.currentTarget.reset();
  }

  function addProtocol(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageContent) return;

    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const validSteps = protocolStepDrafts
      .map((step) => ({
        title: step.title.trim(),
        description: step.description.trim()
      }))
      .filter((step) => step.title);

    if (!title || validSteps.length === 0) return;

    const nextProtocol: Protocol = {
      id: editingProtocolId ?? `protocol-${crypto.randomUUID()}`,
      title,
      description: String(form.get("description") ?? ""),
      tags: String(form.get("tags") ?? "")
        .split(/[，,]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
      externalVideoUrl: String(form.get("externalVideoUrl") ?? ""),
      createdByUserId: editingProtocol?.createdByUserId ?? currentMember.id,
      updatedAt: nowText(),
      steps: validSteps.map((step) => ({
        id: `step-${crypto.randomUUID()}`,
        title: step.title,
        description: step.description
      }))
    };

    setProtocols((current) =>
      editingProtocolId
        ? current.map((protocol) => (protocol.id === editingProtocolId ? nextProtocol : protocol))
        : [nextProtocol, ...current]
    );
    event.currentTarget.reset();
    closeProtocolForm();
  }

  function startRun(protocolId: string) {
    const protocol = protocols.find((item) => item.id === protocolId);
    if (!protocol) return;

    const run: ExperimentRun = {
      id: `run-${crypto.randomUUID()}`,
      protocolId: protocol.id,
      operatorUserId: currentMember.id,
      status: "IN_PROGRESS",
      startedAt: nowText(),
      steps: protocol.steps.map((step) => ({
        ...step,
        id: `run-step-${crypto.randomUUID()}`
      }))
    };

    setRuns((current) => [run, ...current]);
    setSelectedRunId(run.id);
    setActiveTab("runs");
  }

  function toggleRunStep(runId: string, stepId: string) {
    setRuns((current) =>
      current.map((run) =>
        run.id === runId
          ? {
              ...run,
              steps: run.steps.map((step) =>
                step.id === stepId
                  ? {
                      ...step,
                      completedAt: step.completedAt ? undefined : nowText()
                    }
                  : step
              )
            }
          : run
      )
    );
  }

  function finishRun(resultStatus: RunResult) {
    if (!selectedRun) return;
    if (resultStatus === "FAILED" && !failureDraft.failureReason.trim()) return;

    setRuns((current) =>
      current.map((run) =>
        run.id === selectedRun.id
          ? {
              ...run,
              status: resultStatus === "ABORTED" ? "ABORTED" : "COMPLETED",
              resultStatus,
              failureReason: resultStatus === "FAILED" ? failureDraft.failureReason : undefined,
              failureStepId: resultStatus === "FAILED" ? failureDraft.failureStepId : undefined,
              failureNotes: resultStatus === "FAILED" ? failureDraft.failureNotes : undefined,
              completedAt: nowText()
            }
          : run
      )
    );

    setFailureDraft({ failureReason: "", failureStepId: "", failureNotes: "" });
  }

  return (
    <main className="app-shell">
      <aside className="side-nav">
        <div className="brand">
          <div className="brand-mark">
            <FlaskConical size={22} />
          </div>
          <div>
            <strong>实验室管理系统</strong>
            <span>LabFlow MVP</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="主导航">
          <NavButton icon={<ClipboardCheck />} label="工作台" tab="dashboard" activeTab={activeTab} onClick={setActiveTab} />
          <NavButton icon={<Package />} label="药品管理" tab="inventory" activeTab={activeTab} onClick={setActiveTab} />
          <NavButton icon={<FlaskConical />} label="实验模板" tab="protocols" activeTab={activeTab} onClick={setActiveTab} />
          <NavButton icon={<CheckCircle2 />} label="执行记录" tab="runs" activeTab={activeTab} onClick={setActiveTab} />
          <NavButton icon={<Users />} label="团队权限" tab="team" activeTab={activeTab} onClick={setActiveTab} />
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">分子诊断实验室</p>
            <h1>{titleForTab(activeTab)}</h1>
          </div>
          <div className="topbar-actions">
            <label className="user-switch">
              <span>当前身份</span>
              <select value={currentUserId} onChange={(event) => setCurrentUserId(event.target.value)}>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} / {roleText[member.role]}
                  </option>
                ))}
              </select>
            </label>
            <RoleBadge role={currentMember.role} />
          </div>
        </header>

        {activeTab === "dashboard" && (
          <Dashboard
            stats={stats}
            events={events}
            inventory={inventory}
            protocols={protocols}
            runs={visibleRuns}
            onOpenTab={setActiveTab}
          />
        )}

        {activeTab === "inventory" && (
          <InventoryView
            canManageContent={canManageContent}
            query={inventoryQuery}
            onQueryChange={setInventoryQuery}
            items={filteredInventory}
            events={events}
            orders={orders}
            members={members}
            currentMember={currentMember}
            showForm={showInventoryForm}
            onShowForm={setShowInventoryForm}
            onAddInventory={addInventoryItem}
            onAdjustStock={adjustStock}
            onAddOrderRequest={addOrderRequest}
          />
        )}

        {activeTab === "protocols" && (
          <ProtocolsView
            canManageContent={canManageContent}
            currentMember={currentMember}
            members={members}
            protocols={filteredProtocols}
            query={protocolQuery}
            onQueryChange={setProtocolQuery}
            showForm={showProtocolForm}
            editingProtocol={editingProtocol}
            onStartNewProtocol={openNewProtocolForm}
            onCloseForm={closeProtocolForm}
            onAddProtocol={addProtocol}
            stepDrafts={protocolStepDrafts}
            onStepDraftsChange={setProtocolStepDrafts}
            onEditProtocol={openEditProtocolForm}
            onArchiveProtocol={archiveProtocol}
            onStartRun={startRun}
          />
        )}

        {activeTab === "runs" && (
          <RunsView
            members={members}
            protocols={protocols}
            runs={visibleRuns}
            selectedRun={selectedRun}
            selectedRunId={selectedVisibleRunId}
            currentMember={currentMember}
            canViewAllRuns={canViewAllRuns}
            onSelectRun={setSelectedRunId}
            onToggleStep={toggleRunStep}
            onFinishRun={finishRun}
            onStartRun={startRun}
            failureDraft={failureDraft}
            onFailureDraftChange={setFailureDraft}
          />
        )}

        {activeTab === "team" && (
          <TeamView
            members={members}
            currentMember={currentMember}
            isOwner={isOwner}
            onChangeRole={changeMemberRole}
            onToggleRunVisibility={toggleRunVisibility}
          />
        )}
      </section>
    </main>
  );
}

function titleForTab(tab: TabKey) {
  const titles: Record<TabKey, string> = {
    dashboard: "今日工作台",
    inventory: "药品管理",
    protocols: "实验模板",
    runs: "实验执行记录",
    team: "团队权限"
  };
  return titles[tab];
}

function NavButton({
  icon,
  label,
  tab,
  activeTab,
  onClick
}: {
  icon: ReactNode;
  label: string;
  tab: TabKey;
  activeTab: TabKey;
  onClick: (tab: TabKey) => void;
}) {
  return (
    <button className={`nav-button ${activeTab === tab ? "active" : ""}`} onClick={() => onClick(tab)}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`role-badge role-${role.toLowerCase()}`}>
      {role === "OWNER" && <Crown size={14} />}
      {role === "ADMIN" && <ShieldCheck size={14} />}
      {role === "MEMBER" && <Users size={14} />}
      {roleText[role]}
    </span>
  );
}

function Dashboard({
  stats,
  events,
  inventory,
  protocols,
  runs,
  onOpenTab
}: {
  stats: { chemicals: number; lowStock: number; protocols: number; activeRuns: number; failedRuns: number };
  events: InventoryEvent[];
  inventory: InventoryItem[];
  protocols: Protocol[];
  runs: ExperimentRun[];
  onOpenTab: (tab: TabKey) => void;
}) {
  const newestRun = runs[0];
  const protocol = protocols.find((item) => item.id === newestRun?.protocolId);

  return (
    <div className="page-grid">
      <section className="stat-grid">
        <StatCard icon={<Package />} label="药品条目" value={stats.chemicals} tone="green" />
        <StatCard icon={<AlertTriangle />} label="低库存" value={stats.lowStock} tone="amber" />
        <StatCard icon={<FlaskConical />} label="实验模板" value={stats.protocols} tone="cyan" />
        <StatCard icon={<ClipboardCheck />} label="进行中实验" value={stats.activeRuns} tone="rose" />
      </section>

      <section className="dashboard-band">
        <div className="band-copy">
          <p className="eyebrow">核心闭环</p>
          <h2>库存、模板、执行记录在同一个团队空间里流转</h2>
          <div className="band-actions">
            <button className="primary-button" onClick={() => onOpenTab("inventory")}>
              <Package size={18} />
              录入药品
            </button>
            <button className="secondary-button" onClick={() => onOpenTab("protocols")}>
              <FlaskConical size={18} />
              查看模板
            </button>
          </div>
        </div>
        <div className="band-visual">
          {inventory.slice(0, 3).map((item) => (
            <img key={item.id} src={item.imageUrl} alt={item.name} />
          ))}
        </div>
      </section>

      <div className="two-column">
        <section className="panel">
          <SectionHeader icon={<Archive />} title="最近库存流水" actionLabel="全部药品" onAction={() => onOpenTab("inventory")} />
          <div className="activity-list">
            {events.slice(0, 5).map((event) => (
              <div className="activity-row" key={event.id}>
                <div>
                  <strong>{event.itemName}</strong>
                  <span>{event.reason}</span>
                </div>
                <div className={event.delta < 0 ? "delta negative" : "delta positive"}>
                  {event.delta > 0 ? "+" : ""}
                  {event.delta}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <SectionHeader icon={<CheckCircle2 />} title="最近实验" actionLabel="执行记录" onAction={() => onOpenTab("runs")} />
          {newestRun ? (
            <div className="run-snapshot">
              <div>
                <span className="soft-label">模板</span>
                <strong>{protocol?.title}</strong>
              </div>
              <ProgressBar value={newestRun.steps.filter((step) => step.completedAt).length} max={newestRun.steps.length} />
              <span>{newestRun.steps.filter((step) => step.completedAt).length} / {newestRun.steps.length} 已完成</span>
            </div>
          ) : (
            <EmptyState icon={<ClipboardCheck />} text="暂无实验记录" />
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: string }) {
  return (
    <article className={`stat-card ${tone}`}>
      <div className="stat-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function InventoryView({
  canManageContent,
  query,
  onQueryChange,
  items,
  events,
  orders,
  members,
  currentMember,
  showForm,
  onShowForm,
  onAddInventory,
  onAdjustStock,
  onAddOrderRequest
}: {
  canManageContent: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  items: InventoryItem[];
  events: InventoryEvent[];
  orders: PurchaseOrder[];
  members: Member[];
  currentMember: Member;
  showForm: boolean;
  onShowForm: (value: boolean) => void;
  onAddInventory: (event: FormEvent<HTMLFormElement>) => void;
  onAdjustStock: (itemId: string, type: InventoryEvent["type"], delta: number, reason: string) => void;
  onAddOrderRequest: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="page-grid">
      <Toolbar
        icon={<Package />}
        title="药品台账"
        searchValue={query}
        searchPlaceholder="搜索名称、CAS、位置"
        onSearchChange={onQueryChange}
        action={
          <button className="primary-button" onClick={() => onShowForm(!showForm)} disabled={!canManageContent}>
            <Plus size={18} />
            新增药品
          </button>
        }
      />

      {!canManageContent && (
        <Notice icon={<Lock />} text="成员可以查看药品信息，库存录入和变更由群主或管理员处理。" />
      )}

      {showForm && (
        <section className="panel">
          <SectionHeader icon={<Camera />} title="拍照录入药品" />
          <form className="inventory-form" onSubmit={onAddInventory}>
            <label>
              药品图片
              <input name="image" type="file" accept="image/*" capture="environment" />
            </label>
            <label>
              药品名称
              <input name="name" placeholder="例如 乙腈" required />
            </label>
            <label>
              别名
              <input name="alias" placeholder="例如 ACN" />
            </label>
            <label>
              CAS
              <input name="casNumber" placeholder="75-05-8" />
            </label>
            <label>
              规格/浓度
              <input name="specification" placeholder="HPLC grade, 4L" required />
            </label>
            <label>
              供应商
              <input name="supplier" placeholder="供应商" required />
            </label>
            <label>
              货号
              <input name="catalogNumber" />
            </label>
            <label>
              批号
              <input name="batchNumber" />
            </label>
            <label>
              数量
              <input name="quantity" type="number" min="0" step="0.001" defaultValue="1" required />
            </label>
            <label>
              单位
              <input name="unit" defaultValue="瓶" required />
            </label>
            <label>
              位置
              <input name="location" placeholder="有机试剂柜 A-02" required />
            </label>
            <label>
              有效期
              <input name="expiresAt" type="date" />
            </label>
            <label className="wide">
              危险性标签
              <input name="hazardTags" placeholder="易燃，有毒，低库存" />
            </label>
            <label className="wide">
              备注
              <textarea name="notes" rows={3} />
            </label>
            <div className="form-actions wide">
              <button className="secondary-button" type="button" onClick={() => onShowForm(false)}>
                取消
              </button>
              <button className="primary-button" type="submit">
                <Check size={18} />
                保存药品
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="panel order-panel">
        <SectionHeader icon={<ShoppingCart />} title="药品订购表" />
        <form className="order-form" onSubmit={onAddOrderRequest}>
          <label>
            药品名称
            <input name="chemicalName" placeholder="例如 Tris-HCl 缓冲液" required />
          </label>
          <label>
            规格/浓度
            <input name="specification" placeholder="1M, pH 8.0, 500mL" required />
          </label>
          <label>
            供应商
            <input name="supplier" placeholder="可选" />
          </label>
          <label>
            数量
            <input name="quantity" type="number" min="1" step="1" defaultValue="1" required />
          </label>
          <label>
            单位
            <input name="unit" defaultValue="瓶" required />
          </label>
          <label className="wide">
            备注
            <input name="note" placeholder={`${currentMember.name} 发起订购申请，可填写用途或紧急程度`} />
          </label>
          <div className="form-actions wide">
            <button className="primary-button" type="submit">
              <Plus size={18} />
              加入订购表
            </button>
          </div>
        </form>

        <div className="order-table">
          {orders.map((order) => {
            const requester = members.find((member) => member.id === order.requesterUserId);
            return (
              <div className="order-row" key={order.id}>
                <div>
                  <strong>{order.chemicalName}</strong>
                  <span>{order.specification}</span>
                </div>
                <span>{order.supplier || "未填写供应商"}</span>
                <strong>
                  {order.quantity}
                  {order.unit}
                </strong>
                <span>{requester?.name ?? "未知成员"} · {order.requestedAt}</span>
                <span className={`order-status order-${order.status.toLowerCase()}`}>{orderStatusText[order.status]}</span>
                {order.note && <small>{order.note}</small>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="inventory-layout">
        <div className="inventory-list">
          {items.map((item) => (
            <article className="chemical-card" key={item.id}>
              <div className="chemical-image">
                {item.imageUrl ? <img src={item.imageUrl} alt={item.name} /> : <ImageIcon size={24} />}
              </div>
              <div className="chemical-main">
                <div className="chemical-title">
                  <div>
                    <h3>{item.name}</h3>
                    <span>{item.alias || item.casNumber || item.specification}</span>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <div className="chemical-meta">
                  <span>{item.specification}</span>
                  <span>{item.supplier}</span>
                  <span>{item.location}</span>
                  {item.expiresAt && <span>有效期 {item.expiresAt}</span>}
                </div>
                <div className="tag-row">
                  {item.hazardTags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </div>
              <div className="stock-panel">
                <span>库存</span>
                <strong>
                  {item.quantity}
                  <small>{item.unit}</small>
                </strong>
                <div className="stock-actions">
                  <button aria-label="消耗一单位" title="消耗一单位" disabled={!canManageContent} onClick={() => onAdjustStock(item.id, "CONSUME", 1, "实验消耗")}>
                    -
                  </button>
                  <button aria-label="补充一单位" title="补充一单位" disabled={!canManageContent} onClick={() => onAdjustStock(item.id, "RESTOCK", 1, "补充库存")}>
                    +
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>

        <aside className="panel compact-panel">
          <SectionHeader icon={<Archive />} title="库存流水" />
          <div className="activity-list">
            {events.slice(0, 8).map((event) => (
              <div className="activity-row" key={event.id}>
                <div>
                  <strong>{event.itemName}</strong>
                  <span>{event.userName} · {event.createdAt}</span>
                </div>
                <div className={event.delta < 0 ? "delta negative" : "delta positive"}>
                  {event.delta > 0 ? "+" : ""}
                  {event.delta}
                </div>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}

function ProtocolsView({
  canManageContent,
  currentMember,
  members,
  protocols,
  query,
  onQueryChange,
  showForm,
  editingProtocol,
  onStartNewProtocol,
  onCloseForm,
  onAddProtocol,
  stepDrafts,
  onStepDraftsChange,
  onEditProtocol,
  onArchiveProtocol,
  onStartRun
}: {
  canManageContent: boolean;
  currentMember: Member;
  members: Member[];
  protocols: Protocol[];
  query: string;
  onQueryChange: (value: string) => void;
  showForm: boolean;
  editingProtocol?: Protocol;
  onStartNewProtocol: () => void;
  onCloseForm: () => void;
  onAddProtocol: (event: FormEvent<HTMLFormElement>) => void;
  stepDrafts: ProtocolStepDraft[];
  onStepDraftsChange: (steps: ProtocolStepDraft[]) => void;
  onEditProtocol: (protocolId: string) => void;
  onArchiveProtocol: (protocolId: string) => void;
  onStartRun: (protocolId: string) => void;
}) {
  function updateStepDraft(stepId: string, field: "title" | "description", value: string) {
    onStepDraftsChange(stepDrafts.map((step) => (step.id === stepId ? { ...step, [field]: value } : step)));
  }

  function addStepDraft() {
    onStepDraftsChange([...stepDrafts, { id: `draft-${crypto.randomUUID()}`, title: "", description: "" }]);
  }

  function removeStepDraft(stepId: string) {
    if (stepDrafts.length === 1) return;
    onStepDraftsChange(stepDrafts.filter((step) => step.id !== stepId));
  }

  return (
    <div className="page-grid">
      <Toolbar
        icon={<FlaskConical />}
        title="实验模板库"
        searchValue={query}
        searchPlaceholder="搜索模板、标签"
        onSearchChange={onQueryChange}
        action={
          <button className="primary-button" disabled={!canManageContent} onClick={onStartNewProtocol}>
            <Upload size={18} />
            上传模板
          </button>
        }
      />

      <UploadAccessPanel />

      {!canManageContent && (
        <Notice icon={<Lock />} text={`当前身份为${roleText[currentMember.role]}，可以使用模板，不能上传或更改模板。`} />
      )}

      {showForm && canManageContent && (
        <section className="panel">
          <SectionHeader icon={<Upload />} title={editingProtocol ? "编辑实验模板" : "创建实验模板"} />
          <form className="protocol-form" onSubmit={onAddProtocol} key={editingProtocol?.id ?? "new-protocol"}>
            <label>
              模板名称
              <input name="title" placeholder="例如 SDS-PAGE 蛋白电泳" defaultValue={editingProtocol?.title ?? ""} required />
            </label>
            <label>
              标签
              <input name="tags" placeholder="蛋白，电泳" defaultValue={editingProtocol?.tags.join("，") ?? ""} />
            </label>
            <label className="wide">
              参考视频链接
              <input name="externalVideoUrl" type="url" placeholder="https://..." defaultValue={editingProtocol?.externalVideoUrl ?? ""} />
            </label>
            <label className="wide">
              说明
              <textarea name="description" rows={3} defaultValue={editingProtocol?.description ?? ""} />
            </label>
            <div className="wide step-editor">
              <div className="step-editor-head">
                <span>步骤</span>
                <button className="secondary-button" type="button" onClick={addStepDraft}>
                  <Plus size={16} />
                  增加步骤
                </button>
              </div>
              {stepDrafts.map((step, index) => (
                <div className="step-input-card" key={step.id}>
                  <div className="step-input-index">{index + 1}</div>
                  <label>
                    步骤名称
                    <input
                      value={step.title}
                      onChange={(event) => updateStepDraft(step.id, "title", event.target.value)}
                      placeholder="例如 配制凝胶"
                      required={index === 0}
                    />
                  </label>
                  <label>
                    步骤说明
                    <textarea
                      rows={2}
                      value={step.description}
                      onChange={(event) => updateStepDraft(step.id, "description", event.target.value)}
                      placeholder="记录关键温度、时间、注意事项"
                    />
                  </label>
                  <button className="icon-button" type="button" aria-label="删除步骤" title="删除步骤" onClick={() => removeStepDraft(step.id)} disabled={stepDrafts.length === 1}>
                    <XCircle size={18} />
                  </button>
                </div>
              ))}
            </div>
            <div className="form-actions wide">
              <button className="secondary-button" type="button" onClick={onCloseForm}>
                取消
              </button>
              <button className="primary-button" type="submit">
                <Check size={18} />
                {editingProtocol ? "更新模板" : "保存模板"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="protocol-grid">
        {protocols.map((protocol) => {
          const creator = members.find((member) => member.id === protocol.createdByUserId);
          return (
            <article className="protocol-card" key={protocol.id}>
              <div className="protocol-head">
                <div>
                  <h3>{protocol.title}</h3>
                  <span>{creator?.name} · {protocol.updatedAt}</span>
                </div>
                <button className="icon-button" aria-label="开始实验" title="开始实验" onClick={() => onStartRun(protocol.id)}>
                  <Play size={18} />
                </button>
              </div>
              <p>{protocol.description}</p>
              <div className="tag-row">
                {protocol.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              {protocol.externalVideoUrl && (
                <a className="video-link" href={protocol.externalVideoUrl}>
                  <Video size={16} />
                  参考视频
                </a>
              )}
              {canManageContent && (
                <div className="protocol-actions">
                  <button className="secondary-button" onClick={() => onEditProtocol(protocol.id)}>
                    编辑
                  </button>
                  <button className="secondary-button danger" onClick={() => onArchiveProtocol(protocol.id)}>
                    归档
                  </button>
                </div>
              )}
              <div className="step-preview">
                {protocol.steps.slice(0, 4).map((step, index) => (
                  <div key={step.id}>
                    <span>{index + 1}</span>
                    {step.title}
                  </div>
                ))}
              </div>
              <button className="primary-button full-width" onClick={() => onStartRun(protocol.id)}>
                <Play size={18} />
                使用模板
              </button>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function RunsView({
  members,
  protocols,
  runs,
  selectedRun,
  selectedRunId,
  currentMember,
  canViewAllRuns,
  onSelectRun,
  onToggleStep,
  onFinishRun,
  onStartRun,
  failureDraft,
  onFailureDraftChange
}: {
  members: Member[];
  protocols: Protocol[];
  runs: ExperimentRun[];
  selectedRun?: ExperimentRun;
  selectedRunId: string;
  currentMember: Member;
  canViewAllRuns: boolean;
  onSelectRun: (id: string) => void;
  onToggleStep: (runId: string, stepId: string) => void;
  onFinishRun: (result: RunResult) => void;
  onStartRun: (protocolId: string) => void;
  failureDraft: { failureReason: string; failureStepId: string; failureNotes: string };
  onFailureDraftChange: (value: { failureReason: string; failureStepId: string; failureNotes: string }) => void;
}) {
  const protocol = protocols.find((item) => item.id === selectedRun?.protocolId);
  const operator = members.find((member) => member.id === selectedRun?.operatorUserId);
  const completed = selectedRun?.steps.filter((step) => step.completedAt).length ?? 0;
  const total = selectedRun?.steps.length ?? 0;

  return (
    <div className="runs-layout">
      <aside className="run-list">
        <SectionHeader icon={<ClipboardCheck />} title="实验记录" />
        {!canViewAllRuns && (
          <div className="run-scope-note">
            <Lock size={16} />
            <span>{currentMember.name} 只能查看自己的执行记录</span>
          </div>
        )}
        {runs.map((run) => {
          const itemProtocol = protocols.find((protocolItem) => protocolItem.id === run.protocolId);
          const itemOperator = members.find((member) => member.id === run.operatorUserId);
          return (
            <button className={`run-list-item ${run.id === selectedRunId ? "active" : ""}`} key={run.id} onClick={() => onSelectRun(run.id)}>
              <div>
                <strong>{itemProtocol?.title}</strong>
                <span>{itemOperator?.name} · {run.startedAt}</span>
              </div>
              <ChevronRight size={16} />
            </button>
          );
        })}
      </aside>

      <section className="run-detail">
        {selectedRun && protocol ? (
          <>
            <div className="run-hero">
              <div>
                <p className="eyebrow">{operator?.name} 的实验</p>
                <h2>{protocol.title}</h2>
                <span>{selectedRun.startedAt}</span>
              </div>
              {selectedRun.resultStatus ? (
                <span className={`result-badge result-${selectedRun.resultStatus.toLowerCase()}`}>
                  {runResultText[selectedRun.resultStatus]}
                </span>
              ) : (
                <span className="result-badge result-progress">进行中</span>
              )}
            </div>

            {selectedRun.status !== "IN_PROGRESS" && (
              <section className="next-run-panel">
                <div>
                  <strong>本次实验记录已保存</strong>
                  <span>可以基于同一个模板立即开启下一条独立实验记录。</span>
                </div>
                <button className="primary-button" onClick={() => onStartRun(protocol.id)}>
                  <Play size={18} />
                  开启下一次实验
                </button>
              </section>
            )}

            <section className="panel">
              <SectionHeader icon={<CheckCircle2 />} title="步骤进度" />
              <ProgressBar value={completed} max={total} />
              <div className="checklist">
                {selectedRun.steps.map((step, index) => (
                  <button
                    className={`check-row ${step.completedAt ? "done" : ""}`}
                    key={step.id}
                    onClick={() => onToggleStep(selectedRun.id, step.id)}
                    disabled={selectedRun.status !== "IN_PROGRESS"}
                  >
                    <span className="check-index">{step.completedAt ? <Check size={16} /> : index + 1}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <small>{step.description}</small>
                    </div>
                    {step.completedAt && <time>{step.completedAt}</time>}
                  </button>
                ))}
              </div>
            </section>

            {selectedRun.status === "IN_PROGRESS" && (
              <section className="panel">
                <SectionHeader icon={<XCircle />} title="结束实验" />
                <div className="failure-grid">
                  <label>
                    失败步骤
                    <select value={failureDraft.failureStepId} onChange={(event) => onFailureDraftChange({ ...failureDraft, failureStepId: event.target.value })}>
                      <option value="">未选择</option>
                      {selectedRun.steps.map((step) => (
                        <option key={step.id} value={step.id}>
                          {step.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    失败原因
                    <input value={failureDraft.failureReason} onChange={(event) => onFailureDraftChange({ ...failureDraft, failureReason: event.target.value })} placeholder="例如条带拖尾、细胞污染" />
                  </label>
                  <label className="wide">
                    现象与改进
                    <textarea rows={3} value={failureDraft.failureNotes} onChange={(event) => onFailureDraftChange({ ...failureDraft, failureNotes: event.target.value })} />
                  </label>
                </div>
                <div className="form-actions">
                  <button className="secondary-button success" onClick={() => onFinishRun("SUCCESS")}>
                    <CheckCircle2 size={18} />
                    标记成功
                  </button>
                  <button className="secondary-button danger" onClick={() => onFinishRun("FAILED")} disabled={!failureDraft.failureReason.trim()}>
                    <XCircle size={18} />
                    标记失败
                  </button>
                  <button className="secondary-button" onClick={() => onFinishRun("ABORTED")}>
                    中止
                  </button>
                </div>
              </section>
            )}

            {selectedRun.resultStatus === "FAILED" && (
              <Notice
                icon={<AlertTriangle />}
                text={`失败原因：${selectedRun.failureReason ?? "未填写"}${selectedRun.failureNotes ? `；${selectedRun.failureNotes}` : ""}`}
              />
            )}
          </>
        ) : (
          <EmptyState icon={<ClipboardCheck />} text="暂无实验记录" />
        )}
      </section>
    </div>
  );
}

function TeamView({
  members,
  currentMember,
  isOwner,
  onChangeRole,
  onToggleRunVisibility
}: {
  members: Member[];
  currentMember: Member;
  isOwner: boolean;
  onChangeRole: (userId: string, role: "ADMIN" | "MEMBER") => void;
  onToggleRunVisibility: (userId: string) => void;
}) {
  return (
    <div className="page-grid">
      <section className="team-summary">
        <div>
          <p className="eyebrow">团队身份</p>
          <h2>{currentMember.name}</h2>
          <RoleBadge role={currentMember.role} />
        </div>
        <div className="permission-matrix">
          <Permission label="设定管理员" allowed={currentMember.role === "OWNER"} />
          <Permission label="维护实验模板" allowed={canManage(currentMember.role)} />
          <Permission label="修改库存" allowed={canManage(currentMember.role)} />
          <Permission label="使用实验模板" allowed />
          <Permission label="查看全部执行记录" allowed={canViewAllRunRecords(currentMember)} />
        </div>
      </section>

      <section className="panel">
        <SectionHeader icon={<Users />} title="成员列表" />
        <div className="member-table">
          {members.map((member) => (
            <div className="member-row" key={member.id}>
              <div>
                <strong>{member.name}</strong>
                <span>{member.email}</span>
              </div>
              <RoleBadge role={member.role} />
              <span>{canViewAllRunRecords(member) ? "可查看全部记录" : "仅查看本人记录"}</span>
              <span>{member.joinedAt}</span>
              <div className="member-actions">
                <button
                  className="secondary-button"
                  disabled={!isOwner || member.role === "OWNER"}
                  onClick={() => onChangeRole(member.id, member.role === "ADMIN" ? "MEMBER" : "ADMIN")}
                >
                  {member.role === "ADMIN" ? "取消管理员" : "设为管理员"}
                </button>
                <button
                  className="secondary-button"
                  disabled={!isOwner || member.role === "OWNER"}
                  onClick={() => onToggleRunVisibility(member.id)}
                >
                  {member.canViewAllRuns ? "关闭记录权限" : "允许看全部记录"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function UploadAccessPanel() {
  return (
    <section className="upload-panel">
      <div className="upload-icon">
        <Lock size={20} />
      </div>
      <div>
        <strong>视频/附件上传未开通</strong>
        <span>若想使用本功能，请联系系统负责人 3119314861@qq.com</span>
      </div>
      <span className="limit-pill">200MB</span>
    </section>
  );
}

function Toolbar({
  icon,
  title,
  searchValue,
  searchPlaceholder,
  onSearchChange,
  action
}: {
  icon: ReactNode;
  title: string;
  searchValue: string;
  searchPlaceholder: string;
  onSearchChange: (value: string) => void;
  action: ReactNode;
}) {
  return (
    <section className="toolbar">
      <div className="toolbar-title">
        {icon}
        <h2>{title}</h2>
      </div>
      <label className="search-box">
        <Search size={18} />
        <input value={searchValue} placeholder={searchPlaceholder} onChange={(event) => onSearchChange(event.target.value)} />
      </label>
      {action}
    </section>
  );
}

function SectionHeader({
  icon,
  title,
  actionLabel,
  onAction
}: {
  icon: ReactNode;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <header className="section-header">
      <div>
        {icon}
        <h2>{title}</h2>
      </div>
      {actionLabel && (
        <button className="text-button" onClick={onAction}>
          {actionLabel}
          <ChevronRight size={16} />
        </button>
      )}
    </header>
  );
}

function StatusBadge({ status }: { status: InventoryStatus }) {
  return <span className={`status-badge status-${status.toLowerCase()}`}>{statusText[status]}</span>;
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const percent = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="progress-track" aria-label={`完成度 ${percent}%`}>
      <div style={{ width: `${percent}%` }} />
    </div>
  );
}

function Permission({ label, allowed }: { label: string; allowed: boolean }) {
  return (
    <div className={allowed ? "permission allowed" : "permission denied"}>
      {allowed ? <Check size={16} /> : <XCircle size={16} />}
      <span>{label}</span>
    </div>
  );
}

function Notice({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="notice">
      {icon}
      <span>{text}</span>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="empty-state">
      {icon}
      <span>{text}</span>
    </div>
  );
}

export default App;
