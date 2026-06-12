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
  RefreshCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  Upload,
  Users,
  Video,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import "./App.css";

type Role = "OWNER" | "ADMIN" | "MEMBER";
type InventoryStatus = "ACTIVE" | "LOW_STOCK" | "EXPIRED" | "DISPOSED" | "ARCHIVED";
type RunResult = "SUCCESS" | "FAILED" | "ABORTED";
type OrderStatus = "PENDING" | "ORDERED" | "ARRIVED" | "CANCELED";
type TabKey = "dashboard" | "inventory" | "orders" | "protocols" | "runs" | "team";

type User = {
  id: string;
  name: string;
  email: string;
};

type Team = {
  id: string;
  name: string;
  role: Role;
  canViewAllRuns: boolean;
  fileUploadEnabled: boolean;
  joinedAt: string;
};

type Session = {
  token: string;
  user: User;
  activeTeamId?: string;
};

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
  imageUrls: string[];
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
  catalogNumber?: string;
  quantity: number;
  unit: string;
  requesterUserId: string;
  requesterName?: string;
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


function makeId(prefix: string) {
  const randomValue =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  return `${prefix}-${randomValue}`;
}

function canManage(role: Role) {
  return role === "OWNER" || role === "ADMIN";
}

function canViewAllRunRecords(member: Member) {
  return member.role === "OWNER" || member.role === "ADMIN" || member.canViewAllRuns;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";
const SESSION_STORAGE_KEY = "labflow-session";

type ApiRecord = Record<string, unknown>;

function asRecord(value: unknown): ApiRecord {
  return value && typeof value === "object" ? value as ApiRecord : {};
}

function stringValue(value: unknown, fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

function optionalString(value: unknown) {
  const text = stringValue(value).trim();
  return text || undefined;
}

function readStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) as Session : null;
  } catch {
    return null;
  }
}

function storeSession(session: Session | null) {
  if (session) {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

async function apiRequest<T>(path: string, token?: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) {
    let message = `请求失败：${response.status}`;
    try {
      const payload = await response.json() as { message?: string };
      message = payload.message ?? message;
    } catch {
      // Keep the HTTP status message when the server did not return JSON.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function displayDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function displayDateOnly(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

function tokenizedFileUrl(publicUrl: string | undefined, token: string) {
  if (!publicUrl) return undefined;
  return `${API_BASE}${publicUrl}?token=${encodeURIComponent(token)}`;
}

function mapMember(membership: ApiRecord): Member {
  const user = asRecord(membership.user);
  return {
    id: stringValue(user.id ?? membership.userId),
    name: stringValue(user.name, "未命名成员"),
    email: stringValue(user.email),
    role: membership.role as Role,
    canViewAllRuns: membership.role === "OWNER" || Boolean(membership.canViewAllRuns),
    joinedAt: displayDate(stringValue(membership.joinedAt))
  };
}

function mapInventoryItem(item: ApiRecord, token: string): InventoryItem {
  const tags = Array.isArray(item.hazardTags) ? item.hazardTags.map(String) : [];
  const imageFile = asRecord(item.imageFile);
  const imageUrls = Array.isArray(item.imageFiles)
    ? item.imageFiles
        .map((file) => tokenizedFileUrl(optionalString(asRecord(file).publicUrl), token))
        .filter((url): url is string => Boolean(url))
    : [];
  const legacyImageUrl = tokenizedFileUrl(optionalString(imageFile.publicUrl), token);
  const allImageUrls = Array.from(new Set([...(legacyImageUrl ? [legacyImageUrl] : []), ...imageUrls]));

  return {
    id: stringValue(item.id),
    name: stringValue(item.name),
    alias: optionalString(item.alias),
    casNumber: optionalString(item.casNumber),
    specification: stringValue(item.specification),
    supplier: stringValue(item.supplier),
    catalogNumber: optionalString(item.catalogNumber),
    batchNumber: optionalString(item.batchNumber),
    quantity: Number(item.quantity ?? 0),
    unit: stringValue(item.unit),
    location: stringValue(item.location),
    expiresAt: displayDateOnly(stringValue(item.expiresAt)),
    status: item.status as InventoryStatus,
    hazardTags: tags,
    notes: optionalString(item.notes),
    imageUrl: allImageUrls[0],
    imageUrls: allImageUrls,
    updatedAt: displayDate(stringValue(item.updatedAt))
  };
}

function mapInventoryEvent(event: ApiRecord): InventoryEvent {
  const item = asRecord(event.item);
  const user = asRecord(event.user);
  return {
    id: stringValue(event.id),
    itemId: stringValue(event.itemId),
    itemName: stringValue(event.itemName ?? item.name, "未知药品"),
    type: event.type as InventoryEvent["type"],
    before: Number(event.quantityBefore ?? event.before ?? 0),
    delta: Number(event.quantityDelta ?? event.delta ?? 0),
    after: Number(event.quantityAfter ?? event.after ?? 0),
    reason: stringValue(event.reason),
    userName: stringValue(event.userName ?? user.name, "未知成员"),
    createdAt: displayDate(stringValue(event.createdAt))
  };
}

function mapOrder(order: ApiRecord): PurchaseOrder {
  const requestedBy = asRecord(order.requestedBy);
  return {
    id: stringValue(order.id),
    chemicalName: stringValue(order.chemicalName),
    specification: stringValue(order.specification),
    supplier: optionalString(order.supplier),
    catalogNumber: optionalString(order.catalogNumber),
    quantity: Number(order.quantity ?? 0),
    unit: stringValue(order.unit),
    requesterUserId: stringValue(order.requestedByUserId),
    requesterName: optionalString(requestedBy.name),
    requestedAt: displayDate(stringValue(order.createdAt ?? order.requestedAt)),
    status: order.status as OrderStatus,
    note: optionalString(order.note)
  };
}

function mapProtocol(protocol: ApiRecord): Protocol {
  return {
    id: stringValue(protocol.id),
    title: stringValue(protocol.title),
    description: stringValue(protocol.description),
    tags: Array.isArray(protocol.tags) ? protocol.tags.map(String) : [],
    externalVideoUrl: optionalString(protocol.externalVideoUrl),
    createdByUserId: stringValue(protocol.createdByUserId),
    updatedAt: displayDate(stringValue(protocol.updatedAt)),
    steps: Array.isArray(protocol.steps)
      ? protocol.steps.map((step: ApiRecord) => ({
          id: stringValue(step.id),
          title: stringValue(step.title),
          description: optionalString(step.description)
        }))
      : []
  };
}

function mapRun(run: ApiRecord): ExperimentRun {
  return {
    id: stringValue(run.id),
    protocolId: stringValue(run.protocolId),
    operatorUserId: stringValue(run.operatorUserId),
    status: run.status as ExperimentRun["status"],
    resultStatus: optionalString(run.resultStatus) as RunResult | undefined,
    failureReason: optionalString(run.failureReason),
    failureStepId: optionalString(run.failureStepId),
    failureNotes: optionalString(run.failureNotes),
    startedAt: displayDate(stringValue(run.startedAt)),
    completedAt: displayDate(stringValue(run.completedAt)),
    steps: Array.isArray(run.steps)
      ? run.steps.map((step: ApiRecord) => ({
          id: stringValue(step.id),
          title: stringValue(step.title),
          description: optionalString(step.description),
          completedAt: displayDate(stringValue(step.completedAt)),
          notes: optionalString(step.notes)
        }))
      : []
  };
}

function extractInviteToken(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    return parsed.searchParams.get("invite") ?? trimmed;
  } catch {
    return trimmed;
  }
}

function nullableFormValue(form: FormData, key: string) {
  const value = String(form.get(key) ?? "").trim();
  return value || null;
}

function splitTags(value: string) {
  return value
    .split(/[，,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function withoutTeamId(body: {
  teamId: string;
  title: string;
  description: string | null;
  tags: string[];
  externalVideoUrl: string | null;
  steps: { title: string; description: string | null }[];
}) {
  return {
    title: body.title,
    description: body.description,
    tags: body.tags,
    externalVideoUrl: body.externalVideoUrl,
    steps: body.steps
  };
}

function App() {
  const [session, setSession] = useState<Session | null>(() => readStoredSession());
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeamId, setActiveTeamId] = useState(session?.activeTeamId ?? "");
  const [members, setMembers] = useState<Member[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [events, setEvents] = useState<InventoryEvent[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [runs, setRuns] = useState<ExperimentRun[]>([]);
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [orderQuery, setOrderQuery] = useState("");
  const [protocolQuery, setProtocolQuery] = useState("");
  const [protocolTagFilter, setProtocolTagFilter] = useState("全部");
  const [selectedRunId, setSelectedRunId] = useState("");
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
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [inviteToken, setInviteToken] = useState(() => extractInviteToken(new URLSearchParams(window.location.search).get("invite") ?? ""));
  const [inviteLink, setInviteLink] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const activeTeam = teams.find((team) => team.id === activeTeamId);
  const currentMember = members.find((member) => member.id === session?.user.id) ?? {
    id: session?.user.id ?? "",
    name: session?.user.name ?? "",
    email: session?.user.email ?? "",
    role: activeTeam?.role ?? "MEMBER",
    canViewAllRuns: activeTeam?.canViewAllRuns ?? false,
    joinedAt: activeTeam?.joinedAt ?? ""
  };
  const canManageContent = canManage(currentMember.role);
  const isOwner = currentMember.role === "OWNER";
  const canViewAllRuns = canViewAllRunRecords(currentMember);
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? runs[0];
  const selectedVisibleRunId = selectedRun?.id ?? "";
  const editingProtocol = protocols.find((protocol) => protocol.id === editingProtocolId);

  useEffect(() => {
    if (session) {
      void loadWorkspace(session, session.activeTeamId);
    }
    // loadWorkspace is triggered only when a login token changes to avoid repeated refetch loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  const stats = useMemo(() => {
    const lowStock = inventory.filter((item) => item.status === "LOW_STOCK" || item.quantity <= 2).length;
    const activeRuns = runs.filter((run) => run.status === "IN_PROGRESS").length;
    const failedRuns = runs.filter((run) => run.resultStatus === "FAILED").length;

    return {
      chemicals: inventory.filter((item) => item.status !== "ARCHIVED").length,
      lowStock,
      protocols: protocols.length,
      activeRuns,
      failedRuns
    };
  }, [inventory, protocols.length, runs]);

  const filteredInventory = inventory.filter((item) => {
    const text = `${item.name} ${item.alias ?? ""} ${item.casNumber ?? ""} ${item.location}`.toLowerCase();
    return text.includes(inventoryQuery.toLowerCase());
  });

  const protocolTags = useMemo(
    () => ["全部", ...Array.from(new Set(protocols.flatMap((protocol) => protocol.tags))).filter(Boolean)],
    [protocols]
  );

  const filteredProtocols = protocols.filter((protocol) => {
    const text = `${protocol.title} ${protocol.description} ${protocol.tags.join(" ")}`.toLowerCase();
    const matchesSearch = text.includes(protocolQuery.toLowerCase());
    const matchesTag = protocolTagFilter === "全部" || protocol.tags.includes(protocolTagFilter);
    return matchesSearch && matchesTag;
  });

  const filteredOrders = orders.filter((order) => {
    const text = `${order.chemicalName} ${order.specification} ${order.supplier ?? ""} ${order.catalogNumber ?? ""} ${order.requesterName ?? ""} ${order.note ?? ""}`.toLowerCase();
    return text.includes(orderQuery.toLowerCase());
  });

  async function loadWorkspace(nextSession = session, requestedTeamId = activeTeamId) {
    if (!nextSession) return;
    setLoading(true);
    setErrorMessage("");

    try {
      const teamPayload = await apiRequest<{ teams: Team[] }>("/teams", nextSession.token);
      const nextTeams = teamPayload.teams.map((team) => ({
        ...team,
        joinedAt: displayDate(team.joinedAt)
      }));
      const resolvedTeamId = requestedTeamId && nextTeams.some((team) => team.id === requestedTeamId)
        ? requestedTeamId
        : nextTeams[0]?.id ?? "";

      setTeams(nextTeams);
      setActiveTeamId(resolvedTeamId);
      const storedSession = { ...nextSession, activeTeamId: resolvedTeamId };
      storeSession(storedSession);
      setSession((current) => current && current.token === nextSession.token ? storedSession : current);

      if (!resolvedTeamId) {
        setMembers([]);
        setInventory([]);
        setEvents([]);
        setOrders([]);
        setProtocols([]);
        setRuns([]);
        return;
      }

      const [memberPayload, inventoryPayload, eventPayload, orderPayload, protocolPayload, runPayload] = await Promise.all([
        apiRequest<{ members: ApiRecord[] }>(`/teams/${resolvedTeamId}/members`, nextSession.token),
        apiRequest<{ items: ApiRecord[] }>(`/inventory?teamId=${encodeURIComponent(resolvedTeamId)}`, nextSession.token),
        apiRequest<{ events: ApiRecord[] }>(`/inventory/events?teamId=${encodeURIComponent(resolvedTeamId)}&limit=50`, nextSession.token),
        apiRequest<{ orders: ApiRecord[] }>(`/orders?teamId=${encodeURIComponent(resolvedTeamId)}`, nextSession.token),
        apiRequest<{ protocols: ApiRecord[] }>(`/protocols?teamId=${encodeURIComponent(resolvedTeamId)}`, nextSession.token),
        apiRequest<{ runs: ApiRecord[] }>(`/runs?teamId=${encodeURIComponent(resolvedTeamId)}`, nextSession.token)
      ]);

      const nextRuns = runPayload.runs.map(mapRun);
      setMembers(memberPayload.members.map(mapMember));
      setInventory(inventoryPayload.items.map((item) => mapInventoryItem(item, nextSession.token)));
      setEvents(eventPayload.events.map(mapInventoryEvent));
      setOrders(orderPayload.orders.map(mapOrder));
      setProtocols(protocolPayload.protocols.map(mapProtocol));
      setRuns(nextRuns);
      setSelectedRunId((current) => nextRuns.some((run) => run.id === current) ? current : nextRuns[0]?.id ?? "");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "加载数据失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await authenticate("/auth/login", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? "")
    }, String(form.get("inviteToken") ?? inviteToken));
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const teamName = String(form.get("teamName") ?? "").trim();
    await authenticate("/auth/register", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      name: String(form.get("name") ?? ""),
      teamName: teamName || undefined
    }, String(form.get("inviteToken") ?? inviteToken));
  }

  async function authenticate(path: "/auth/login" | "/auth/register", body: ApiRecord, rawInviteToken: string) {
    setLoading(true);
    setErrorMessage("");
    try {
      const payload = await apiRequest<{ token: string; user: User; activeTeamId?: string }>(path, undefined, {
        method: "POST",
        body: JSON.stringify(body)
      });
      const nextInviteToken = extractInviteToken(rawInviteToken);
      if (nextInviteToken) {
        await apiRequest(`/teams/join/${encodeURIComponent(nextInviteToken)}`, payload.token, { method: "POST" });
      }
      const nextSession = { token: payload.token, user: payload.user, activeTeamId: payload.activeTeamId };
      storeSession(nextSession);
      setSession(nextSession);
      setInviteToken("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    storeSession(null);
    setSession(null);
    setTeams([]);
    setActiveTeamId("");
    setMembers([]);
    setInventory([]);
    setEvents([]);
    setOrders([]);
    setProtocols([]);
    setRuns([]);
  }

  async function handleTeamChange(teamId: string) {
    if (!session) return;
    setActiveTeamId(teamId);
    await loadWorkspace({ ...session, activeTeamId: teamId }, teamId);
  }

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (!name) return;

    setLoading(true);
    setErrorMessage("");
    try {
      const payload = await apiRequest<{ team: { id: string } }>("/teams", session.token, {
        method: "POST",
        body: JSON.stringify({ name })
      });
      event.currentTarget.reset();
      await loadWorkspace(session, payload.team.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "创建团队失败");
    } finally {
      setLoading(false);
    }
  }

  async function joinTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const form = new FormData(event.currentTarget);
    const token = extractInviteToken(String(form.get("token") ?? ""));
    if (!token) return;

    setLoading(true);
    setErrorMessage("");
    try {
      await apiRequest(`/teams/join/${encodeURIComponent(token)}`, session.token, { method: "POST" });
      event.currentTarget.reset();
      await loadWorkspace(session);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "加入团队失败");
    } finally {
      setLoading(false);
    }
  }

  async function changeMemberRole(userId: string, role: "ADMIN" | "MEMBER") {
    if (!session || !activeTeamId || !isOwner) return;
    await apiRequest(`/teams/${activeTeamId}/members/${userId}/role`, session.token, {
      method: "PATCH",
      body: JSON.stringify({ role })
    });
    await loadWorkspace(session, activeTeamId);
  }

  async function toggleRunVisibility(userId: string) {
    if (!session || !activeTeamId || !isOwner) return;
    const target = members.find((member) => member.id === userId);
    if (!target) return;
    await apiRequest(`/teams/${activeTeamId}/members/${userId}/run-visibility`, session.token, {
      method: "PATCH",
      body: JSON.stringify({ canViewAllRuns: !target.canViewAllRuns })
    });
    await loadWorkspace(session, activeTeamId);
  }

  async function updateMemberName(userId: string, currentName: string) {
    if (!session || !activeTeamId || !canManageContent) return;
    const name = window.prompt("请输入新的成员姓名", currentName)?.trim();
    if (!name || name === currentName) return;

    await apiRequest(`/teams/${activeTeamId}/members/${userId}/name`, session.token, {
      method: "PATCH",
      body: JSON.stringify({ name })
    });
    await loadWorkspace(session, activeTeamId);
  }

  async function removeMember(userId: string, memberName: string) {
    if (!session || !activeTeamId || !canManageContent) return;
    if (!window.confirm(`确定要将 ${memberName} 移出当前团队吗？`)) return;

    await apiRequest(`/teams/${activeTeamId}/members/${userId}`, session.token, {
      method: "DELETE"
    });
    await loadWorkspace(session, activeTeamId);
  }

  async function transferOwner(userId: string, memberName: string) {
    if (!session || !activeTeamId || !isOwner) return;
    if (!window.confirm(`确定要把群主转让给 ${memberName} 吗？转让后你会变为管理员。`)) return;

    await apiRequest(`/teams/${activeTeamId}/owner`, session.token, {
      method: "PATCH",
      body: JSON.stringify({ userId })
    });
    await loadWorkspace(session, activeTeamId);
  }

  async function createInvite() {
    if (!session || !activeTeamId || !canManageContent) return;
    const payload = await apiRequest<{ invite: { token: string } }>(`/teams/${activeTeamId}/invites`, session.token, {
      method: "POST"
    });
    setInviteLink(`${window.location.origin}${window.location.pathname}?invite=${payload.invite.token}`);
  }

  function openNewProtocolForm() {
    setEditingProtocolId(null);
    setProtocolStepDrafts([{ id: makeId("draft"), title: "", description: "" }]);
    setShowProtocolForm(true);
  }

  function openEditProtocolForm(protocolId: string) {
    const protocol = protocols.find((item) => item.id === protocolId);
    if (!protocol || !canManageContent) return;
    setEditingProtocolId(protocol.id);
    setProtocolStepDrafts(protocol.steps.map((step) => ({
      id: makeId("draft"),
      title: step.title,
      description: step.description ?? ""
    })));
    setShowProtocolForm(true);
  }

  function closeProtocolForm() {
    setEditingProtocolId(null);
    setProtocolStepDrafts([{ id: makeId("draft"), title: "", description: "" }]);
    setShowProtocolForm(false);
  }

  async function archiveProtocol(protocolId: string) {
    if (!session || !canManageContent) return;
    await apiRequest(`/protocols/${protocolId}/archive`, session.token, { method: "PATCH" });
    await loadWorkspace(session, activeTeamId);
  }

  async function addInventoryItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !activeTeamId || !canManageContent) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const images = form.getAll("images").filter((value): value is File => value instanceof File && value.size > 0);

    const imageFileIds: string[] = [];
    for (const image of images) {
      const fileForm = new FormData();
      fileForm.set("file", image);
      const filePayload = await apiRequest<{ file: { id: string } }>(`/files?teamId=${activeTeamId}&kind=CHEMICAL_IMAGE`, session.token, {
        method: "POST",
        body: fileForm
      });
      imageFileIds.push(filePayload.file.id);
    }

    await apiRequest("/inventory", session.token, {
      method: "POST",
      body: JSON.stringify({
        teamId: activeTeamId,
        name: String(form.get("name") ?? "").trim(),
        alias: nullableFormValue(form, "alias"),
        casNumber: nullableFormValue(form, "casNumber"),
        specification: nullableFormValue(form, "specification"),
        supplier: nullableFormValue(form, "supplier"),
        catalogNumber: nullableFormValue(form, "catalogNumber"),
        batchNumber: nullableFormValue(form, "batchNumber"),
        quantity: Number(form.get("quantity") ?? 0),
        unit: String(form.get("unit") ?? "瓶"),
        location: String(form.get("location") ?? ""),
        expiresAt: nullableFormValue(form, "expiresAt"),
        hazardTags: splitTags(String(form.get("hazardTags") ?? "")),
        notes: nullableFormValue(form, "notes"),
        imageFileId: imageFileIds[0],
        imageFileIds
      })
    });

    formElement.reset();
    setShowInventoryForm(false);
    await loadWorkspace(session, activeTeamId);
  }

  async function adjustStock(itemId: string, type: InventoryEvent["type"], quantityDelta: number, reason: string) {
    if (!session || !canManageContent) return;
    await apiRequest(`/inventory/${itemId}/events`, session.token, {
      method: "POST",
      body: JSON.stringify({ type, quantityDelta, reason })
    });
    await loadWorkspace(session, activeTeamId);
  }

  async function addOrderRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !activeTeamId) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await apiRequest("/orders", session.token, {
      method: "POST",
      body: JSON.stringify({
        teamId: activeTeamId,
        chemicalName: String(form.get("chemicalName") ?? "").trim(),
        specification: nullableFormValue(form, "specification"),
        supplier: nullableFormValue(form, "supplier"),
        catalogNumber: nullableFormValue(form, "catalogNumber"),
        quantity: Number(form.get("quantity") ?? 0),
        unit: String(form.get("unit") ?? "瓶"),
        note: nullableFormValue(form, "note")
      })
    });
    formElement.reset();
    await loadWorkspace(session, activeTeamId);
  }

  async function updateOrderStatus(orderId: string, status: OrderStatus) {
    if (!session || !canManageContent) return;
    await apiRequest(`/orders/${orderId}/status`, session.token, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    await loadWorkspace(session, activeTeamId);
  }

  async function addProtocol(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !activeTeamId || !canManageContent) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const title = String(form.get("title") ?? "").trim();
    const steps = protocolStepDrafts
      .map((step) => ({ title: step.title.trim(), description: step.description.trim() || null }))
      .filter((step) => step.title);
    if (!title || steps.length === 0) return;

    const body = {
      teamId: activeTeamId,
      title,
      description: nullableFormValue(form, "description"),
      tags: splitTags(String(form.get("tags") ?? "")),
      externalVideoUrl: nullableFormValue(form, "externalVideoUrl"),
      steps
    };

    await apiRequest(editingProtocolId ? `/protocols/${editingProtocolId}` : "/protocols", session.token, {
      method: editingProtocolId ? "PATCH" : "POST",
      body: JSON.stringify(editingProtocolId ? withoutTeamId(body) : body)
    });

    formElement.reset();
    closeProtocolForm();
    await loadWorkspace(session, activeTeamId);
  }

  async function startRun(protocolId: string) {
    if (!session) return;
    const payload = await apiRequest<{ run: ApiRecord }>("/runs", session.token, {
      method: "POST",
      body: JSON.stringify({ protocolId })
    });
    const run = mapRun(payload.run);
    await loadWorkspace(session, activeTeamId);
    setSelectedRunId(run.id);
    setActiveTab("runs");
  }

  async function deleteRun(runId: string) {
    if (!session) return;
    const run = runs.find((item) => item.id === runId);
    if (!run || run.operatorUserId !== session.user.id) return;
    if (!window.confirm("确定删除这条实验记录吗？删除后无法恢复。")) return;

    await apiRequest(`/runs/${runId}`, session.token, { method: "DELETE" });
    await loadWorkspace(session, activeTeamId);
  }

  async function toggleRunStep(runId: string, stepId: string) {
    if (!session) return;
    const run = runs.find((item) => item.id === runId);
    const step = run?.steps.find((item) => item.id === stepId);
    if (!run || !step) return;
    await apiRequest(`/runs/${runId}/steps/${stepId}`, session.token, {
      method: "PATCH",
      body: JSON.stringify({ completed: !step.completedAt, notes: step.notes ?? null })
    });
    await loadWorkspace(session, activeTeamId);
  }

  async function finishRun(resultStatus: RunResult) {
    if (!session || !selectedRun) return;
    if (resultStatus === "FAILED" && !failureDraft.failureReason.trim()) return;
    await apiRequest(`/runs/${selectedRun.id}/finish`, session.token, {
      method: "PATCH",
      body: JSON.stringify({
        resultStatus,
        failureReason: resultStatus === "FAILED" ? failureDraft.failureReason : null,
        failureStepId: resultStatus === "FAILED" ? failureDraft.failureStepId || null : null,
        failureNotes: resultStatus === "FAILED" ? failureDraft.failureNotes : null
      })
    });
    setFailureDraft({ failureReason: "", failureStepId: "", failureNotes: "" });
    await loadWorkspace(session, activeTeamId);
  }

  if (!session) {
    return (
      <AuthView
        mode={authMode}
        inviteToken={inviteToken}
        loading={loading}
        errorMessage={errorMessage}
        onModeChange={setAuthMode}
        onInviteTokenChange={setInviteToken}
        onLogin={handleLogin}
        onRegister={handleRegister}
      />
    );
  }

  if (!activeTeamId) {
    return (
      <TeamOnboarding
        user={session.user}
        loading={loading}
        errorMessage={errorMessage}
        onCreateTeam={createTeam}
        onJoinTeam={joinTeam}
        onLogout={logout}
      />
    );
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
            <span>{activeTeam?.name ?? "LabFlow"}</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="主导航">
          <NavButton icon={<ClipboardCheck />} label="工作台" tab="dashboard" activeTab={activeTab} onClick={setActiveTab} />
          <NavButton icon={<Package />} label="药品管理" tab="inventory" activeTab={activeTab} onClick={setActiveTab} />
          <NavButton icon={<ShoppingCart />} label="药品订购" tab="orders" activeTab={activeTab} onClick={setActiveTab} />
          <NavButton icon={<FlaskConical />} label="实验模板" tab="protocols" activeTab={activeTab} onClick={setActiveTab} />
          <NavButton icon={<CheckCircle2 />} label="执行记录" tab="runs" activeTab={activeTab} onClick={setActiveTab} />
          <NavButton icon={<Users />} label="团队权限" tab="team" activeTab={activeTab} onClick={setActiveTab} />
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{activeTeam?.name ?? "实验室团队"}</p>
            <h1>{titleForTab(activeTab)}</h1>
          </div>
          <div className="topbar-actions">
            <label className="user-switch">
              <span>当前团队</span>
              <select value={activeTeamId} onChange={(event) => void handleTeamChange(event.target.value)}>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </label>
            <div className="signed-user">
              <strong>{session.user.name}</strong>
              <span>{session.user.email}</span>
            </div>
            <RoleBadge role={currentMember.role} />
            <button className="secondary-button" type="button" onClick={logout}>退出</button>
          </div>
        </header>

        {errorMessage && <Notice icon={<AlertTriangle />} text={errorMessage} />}
        {loading && <Notice icon={<RefreshCcw />} text="正在同步服务器数据..." />}

        {activeTab === "dashboard" && (
          <Dashboard stats={stats} events={events} inventory={inventory} protocols={protocols} runs={runs} onOpenTab={setActiveTab} />
        )}

        {activeTab === "inventory" && (
          <InventoryView
            canManageContent={canManageContent}
            query={inventoryQuery}
            onQueryChange={setInventoryQuery}
            items={filteredInventory}
            events={events}
            showForm={showInventoryForm}
            onShowForm={setShowInventoryForm}
            onAddInventory={addInventoryItem}
            onAdjustStock={adjustStock}
          />
        )}

        {activeTab === "orders" && (
          <OrdersView
            canManageContent={canManageContent}
            orders={filteredOrders}
            totalOrderCount={orders.length}
            query={orderQuery}
            onQueryChange={setOrderQuery}
            currentMember={currentMember}
            onAddOrderRequest={addOrderRequest}
            onUpdateOrderStatus={updateOrderStatus}
          />
        )}

        {activeTab === "protocols" && (
          <ProtocolsView
            canManageContent={canManageContent}
            currentMember={currentMember}
            members={members}
            protocols={filteredProtocols}
            allTags={protocolTags}
            activeTag={protocolTagFilter}
            query={protocolQuery}
            onQueryChange={setProtocolQuery}
            onTagChange={setProtocolTagFilter}
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
            runs={runs}
            selectedRun={selectedRun}
            selectedRunId={selectedVisibleRunId}
            currentMember={currentMember}
            canViewAllRuns={canViewAllRuns}
            onSelectRun={setSelectedRunId}
            onToggleStep={toggleRunStep}
            onFinishRun={finishRun}
            onDeleteRun={deleteRun}
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
            canInvite={canManageContent}
            inviteLink={inviteLink}
            onCreateInvite={createInvite}
            onChangeRole={changeMemberRole}
            onToggleRunVisibility={toggleRunVisibility}
            onUpdateMemberName={updateMemberName}
            onRemoveMember={removeMember}
            onTransferOwner={transferOwner}
          />
        )}
      </section>
    </main>
  );
}

function AuthView({
  mode,
  inviteToken,
  loading,
  errorMessage,
  onModeChange,
  onInviteTokenChange,
  onLogin,
  onRegister
}: {
  mode: "login" | "register";
  inviteToken: string;
  loading: boolean;
  errorMessage: string;
  onModeChange: (mode: "login" | "register") => void;
  onInviteTokenChange: (value: string) => void;
  onLogin: (event: FormEvent<HTMLFormElement>) => void;
  onRegister: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand auth-brand">
          <div className="brand-mark">
            <FlaskConical size={22} />
          </div>
          <div>
            <strong>实验室管理系统</strong>
            <span>真实团队数据 · MySQL 持久化</span>
          </div>
        </div>
        <div className="auth-tabs">
          <button className={mode === "login" ? "active" : ""} onClick={() => onModeChange("login")}>登录</button>
          <button className={mode === "register" ? "active" : ""} onClick={() => onModeChange("register")}>注册</button>
        </div>
        {errorMessage && <Notice icon={<AlertTriangle />} text={errorMessage} />}

        {mode === "login" ? (
          <form className="auth-form" onSubmit={onLogin}>
            <label>
              邮箱
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              密码
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <label>
              团队邀请链接或 token
              <input name="inviteToken" value={inviteToken} onChange={(event) => onInviteTokenChange(event.target.value)} placeholder="可选，收到邀请时填写" />
            </label>
            <button className="primary-button full-width" disabled={loading} type="submit">登录并进入系统</button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={onRegister}>
            <label>
              姓名
              <input name="name" autoComplete="name" required />
            </label>
            <label>
              邮箱
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              密码
              <input name="password" type="password" minLength={8} autoComplete="new-password" required />
            </label>
            <label>
              创建新实验室团队
              <input name="teamName" placeholder="例如 分子诊断实验室；加入别人团队时可不填" />
            </label>
            <label>
              团队邀请链接或 token
              <input name="inviteToken" value={inviteToken} onChange={(event) => onInviteTokenChange(event.target.value)} placeholder="收到邀请时填写" />
            </label>
            <button className="primary-button full-width" disabled={loading} type="submit">注册</button>
          </form>
        )}
      </section>
    </main>
  );
}

function TeamOnboarding({
  user,
  loading,
  errorMessage,
  onCreateTeam,
  onJoinTeam,
  onLogout
}: {
  user: User;
  loading: boolean;
  errorMessage: string;
  onCreateTeam: (event: FormEvent<HTMLFormElement>) => void;
  onJoinTeam: (event: FormEvent<HTMLFormElement>) => void;
  onLogout: () => void;
}) {
  return (
    <main className="auth-shell">
      <section className="auth-panel onboarding-panel">
        <div>
          <p className="eyebrow">已登录：{user.name}</p>
          <h1>创建或加入一个实验室团队</h1>
        </div>
        {errorMessage && <Notice icon={<AlertTriangle />} text={errorMessage} />}
        <form className="auth-form" onSubmit={onCreateTeam}>
          <label>
            新团队名称
            <input name="name" placeholder="例如 分子诊断实验室" required />
          </label>
          <button className="primary-button" disabled={loading} type="submit">创建团队并成为群主</button>
        </form>
        <form className="auth-form" onSubmit={onJoinTeam}>
          <label>
            邀请链接或 token
            <input name="token" placeholder="由群主或管理员生成" required />
          </label>
          <button className="secondary-button" disabled={loading} type="submit">加入已有团队</button>
        </form>
        <button className="text-button" onClick={onLogout}>退出登录</button>
      </section>
    </main>
  );
}

function titleForTab(tab: TabKey) {
  const titles: Record<TabKey, string> = {
    dashboard: "今日工作台",
    inventory: "药品管理",
    orders: "药品订购",
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
  showForm,
  onShowForm,
  onAddInventory,
  onAdjustStock
}: {
  canManageContent: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  items: InventoryItem[];
  events: InventoryEvent[];
  showForm: boolean;
  onShowForm: (value: boolean) => void;
  onAddInventory: (event: FormEvent<HTMLFormElement>) => void;
  onAdjustStock: (itemId: string, type: InventoryEvent["type"], delta: number, reason: string) => void;
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
              <input name="images" type="file" accept="image/*" capture="environment" multiple />
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
                {item.imageUrls.length > 1 && (
                  <div className="chemical-thumbs">
                    {item.imageUrls.map((url, index) => (
                      <img key={url} src={url} alt={`${item.name} 图片 ${index + 1}`} />
                    ))}
                  </div>
                )}
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

function OrdersView({
  canManageContent,
  orders,
  totalOrderCount,
  query,
  onQueryChange,
  currentMember,
  onAddOrderRequest,
  onUpdateOrderStatus
}: {
  canManageContent: boolean;
  orders: PurchaseOrder[];
  totalOrderCount: number;
  query: string;
  onQueryChange: (value: string) => void;
  currentMember: Member;
  onAddOrderRequest: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus) => void;
}) {
  return (
    <div className="page-grid">
      <Toolbar
        icon={<ShoppingCart />}
        title="药品订购表"
        searchValue={query}
        searchPlaceholder="搜索药品、供应商、备注或发起人"
        onSearchChange={onQueryChange}
        action={<span className="limit-pill">{orders.length}/{totalOrderCount} 条</span>}
      />

      <section className="panel order-panel">
        <SectionHeader icon={<Plus />} title="新增订购记录" />
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
            <input name="supplier" placeholder="例如 Solarbio、国药、Merck" />
          </label>
          <label>
            货号
            <input name="catalogNumber" placeholder="供应商货号" />
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
            <input name="note" placeholder={`${currentMember.name} 发起订购，可填写用途、货号、预算或紧急程度`} />
          </label>
          <div className="form-actions wide">
            <button className="primary-button" type="submit">
              <Plus size={18} />
              加入订购表
            </button>
          </div>
        </form>
      </section>

      <section className="panel order-panel">
        <SectionHeader icon={<ShoppingCart />} title="已记录的订购药品" />
        <div className="order-table">
          {orders.map((order) => (
            <div className="order-row" key={order.id}>
              <div>
                <strong>{order.chemicalName}</strong>
                <span>{order.specification}</span>
                {order.catalogNumber && <small>货号：{order.catalogNumber}</small>}
                {order.note && <small>{order.note}</small>}
              </div>
              <span>{order.supplier || "未填写供应商"}</span>
              <strong>
                {order.quantity}
                {order.unit}
              </strong>
              <span>{order.requesterName ?? "未知成员"} · {order.requestedAt}</span>
              {canManageContent ? (
                <select value={order.status} onChange={(event) => onUpdateOrderStatus(order.id, event.target.value as OrderStatus)}>
                  <option value="PENDING">待订购</option>
                  <option value="ORDERED">已下单</option>
                  <option value="ARRIVED">已到货</option>
                  <option value="CANCELED">已取消</option>
                </select>
              ) : (
                <span className={`order-status order-${order.status.toLowerCase()}`}>{orderStatusText[order.status]}</span>
              )}
            </div>
          ))}
          {orders.length === 0 && (
            <EmptyState
              icon={<ShoppingCart />}
              text={totalOrderCount === 0 ? "还没有药品订购记录" : "没有匹配的订购记录"}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function ProtocolsView({
  canManageContent,
  currentMember,
  members,
  protocols,
  allTags,
  activeTag,
  onTagChange,
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
  allTags: string[];
  activeTag: string;
  onTagChange: (value: string) => void;
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
    onStepDraftsChange([...stepDrafts, { id: makeId("draft"), title: "", description: "" }]);
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

      <div className="tag-filter-panel">
        {allTags.map((tag) => (
          <button
            key={tag}
            type="button"
            className={tag === activeTag ? "active" : ""}
            onClick={() => onTagChange(tag)}
          >
            {tag}
          </button>
        ))}
      </div>

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
  onDeleteRun,
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
  onDeleteRun: (runId: string) => void;
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
              <div className="run-hero-actions">
                {selectedRun.resultStatus ? (
                  <span className={`result-badge result-${selectedRun.resultStatus.toLowerCase()}`}>
                    {runResultText[selectedRun.resultStatus]}
                  </span>
                ) : (
                  <span className="result-badge result-progress">进行中</span>
                )}
                {selectedRun.operatorUserId === currentMember.id && (
                  <button className="secondary-button danger" type="button" onClick={() => onDeleteRun(selectedRun.id)}>
                    <Trash2 size={16} />
                    删除记录
                  </button>
                )}
              </div>
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
  canInvite,
  inviteLink,
  onCreateInvite,
  onChangeRole,
  onToggleRunVisibility,
  onUpdateMemberName,
  onRemoveMember,
  onTransferOwner
}: {
  members: Member[];
  currentMember: Member;
  isOwner: boolean;
  canInvite: boolean;
  inviteLink: string;
  onCreateInvite: () => void;
  onChangeRole: (userId: string, role: "ADMIN" | "MEMBER") => void;
  onToggleRunVisibility: (userId: string) => void;
  onUpdateMemberName: (userId: string, currentName: string) => void;
  onRemoveMember: (userId: string, memberName: string) => void;
  onTransferOwner: (userId: string, memberName: string) => void;
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

      <section className="panel invite-panel">
        <SectionHeader icon={<Users />} title="邀请真实成员加入" />
        <p>群主或管理员可以生成邀请链接。对方打开链接后注册/登录，即可加入当前实验室团队。</p>
        <div className="invite-row">
          <button className="primary-button" disabled={!canInvite} onClick={onCreateInvite}>
            <Plus size={18} />
            生成邀请链接
          </button>
          {inviteLink && <input value={inviteLink} readOnly onFocus={(event) => event.currentTarget.select()} />}
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
                  disabled={member.role === "OWNER" || (!isOwner && !(currentMember.role === "ADMIN" && member.role === "MEMBER"))}
                  onClick={() => onUpdateMemberName(member.id, member.name)}
                >
                  修改姓名
                </button>
                <button
                  className="secondary-button"
                  disabled={!isOwner || member.role === "OWNER"}
                  onClick={() => onChangeRole(member.id, member.role === "ADMIN" ? "MEMBER" : "ADMIN")}
                >
                  {member.role === "ADMIN" ? "取消管理员" : "设为管理员"}
                </button>
                <button
                  className="secondary-button"
                  disabled={!isOwner || member.role !== "MEMBER"}
                  onClick={() => onToggleRunVisibility(member.id)}
                >
                  {member.canViewAllRuns ? "关闭记录权限" : "允许看全部记录"}
                </button>
                <button
                  className="secondary-button"
                  disabled={!isOwner || member.role === "OWNER"}
                  onClick={() => onTransferOwner(member.id, member.name)}
                >
                  转让群主
                </button>
                <button
                  className="secondary-button danger"
                  disabled={member.role === "OWNER" || (!isOwner && !(currentMember.role === "ADMIN" && member.role === "MEMBER"))}
                  onClick={() => onRemoveMember(member.id, member.name)}
                >
                  移出
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
