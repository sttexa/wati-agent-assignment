// ============================================================
// WATI HTTP client
// Base URL: https://live-mt-server.wati.io/{TENANT_ID}
// Auth:     Authorization: Bearer {TOKEN}
// Endpoint reference: assignment PDF §3
// ============================================================

import axios, { AxiosInstance, AxiosError } from "axios";
import * as dotenv from "dotenv";
import type {
  Contact,
  Tag,
  Message,
  Template,
  Broadcast,
  Operator,
  Ticket,
  WatiListResponse,
  WatiResponse,
  CustomParam,
} from "../types";

dotenv.config();

// ─── Axios singleton ──────────────────────────────────────────

let _http: AxiosInstance | null = null;

function getHttp(): AxiosInstance {
  if (_http) return _http;

  const baseURL = process.env.WATI_BASE_URL;
  const token = process.env.WATI_TOKEN;

  if (!baseURL || !token) {
    throw new Error("WATI_BASE_URL and WATI_TOKEN must be set in environment");
  }

  _http = axios.create({
    baseURL,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    timeout: 15000,
  });

  // Print every outgoing request URL to aid debugging
  _http.interceptors.request.use((config) => {
    const url = `${config.baseURL}${config.url}`;
    process.stderr.write(`[HTTP] ${config.method?.toUpperCase()} ${url}\n`);
    return config;
  });

  return _http;
}

// ─── Response normalizers ─────────────────────────────────────

function normaliseContact(raw: Record<string, unknown>): Contact {
  return {
    id: String(raw.id ?? raw.wAid ?? ""),
    whatsappNumber: String(raw.wAid ?? raw.whatsappNumber ?? raw.phone ?? ""),
    firstName: raw.firstName as string | undefined,
    lastName: raw.lastName as string | undefined,
    fullName: raw.fullName as string | undefined,
    phone: raw.phone as string | undefined,
    email: raw.email as string | undefined,
    tags: (raw.tags as string[]) ?? [],
    customParams: (raw.customParams as CustomParam[]) ?? [],
    createdAt: (raw.created ?? raw.createdAt) as string | undefined,
    updatedAt: (raw.updated ?? raw.updatedAt) as string | undefined,
  };
}

function buildList<T>(
  items: T[],
  info: Record<string, unknown>,
  pageSize: number,
  page: number
): WatiListResponse<T> {
  return {
    result: items,
    page,
    pageSize,
    totalPages: Number(info.totalPages ?? info.total_pages ?? 1),
    count: Number(info.totalRecords ?? info.total_records ?? info.count ?? items.length),
  };
}

// ─── Error helper ─────────────────────────────────────────────

function watiError(err: unknown, fnName: string): never {
  if (axios.isAxiosError(err)) {
    const ae = err as AxiosError;
    const status = ae.response?.status;
    const body = JSON.stringify(ae.response?.data ?? "");
    const url = ae.config?.url ?? "";
    throw new Error(`${fnName} HTTP ${status}: ${url} → ${body}`);
  }
  throw err;
}

// ─── Contacts ────────────────────────────────────────────────
// PDF: GET /api/v1/getContacts?pageSize=20&pageNumber=1
//      GET /api/v1/getContacts?tag=VIP

export async function getContacts(
  pageSize: number,
  page: number,
  searchTerm?: string,
  tag?: string
): Promise<WatiListResponse<Contact>> {
  try {
    const params: Record<string, unknown> = { pageSize, pageNumber: page };
    if (tag) params.tag = tag;
    if (searchTerm) params.search = searchTerm;
    const res = await getHttp().get("/api/v1/getContacts", { params });
    const data = res.data as Record<string, unknown>;
    const items = (
      (data.result ?? data.contact_list ?? []) as Record<string, unknown>[]
    ).map(normaliseContact);
    const info = (data.info ?? {}) as Record<string, unknown>;
    return buildList(items, info, pageSize, page);
  } catch (err) {
    return watiError(err, "getContacts");
  }
}

// PDF: GET /api/v1/getContactInfo/{whatsappNumber}
export async function getContact(
  whatsappNumber: string
): Promise<WatiResponse<Contact>> {
  try {
    const res = await getHttp().get(`/api/v1/getContactInfo/${whatsappNumber}`);
    const data = res.data as Record<string, unknown>;
    const raw = (data.contact ?? data.result ?? data) as Record<string, unknown>;
    return { result: normaliseContact(raw) };
  } catch (err) {
    return watiError(err, "getContact");
  }
}

// PDF: POST /api/v1/addContact/{whatsappNumber}
//      Body: { "name": "...", "customParams": [...] }
export async function upsertContact(
  contact: Partial<Contact>
): Promise<WatiResponse<Contact>> {
  try {
    const payload = {
      name: contact.fullName ?? `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim(),
      customParams: contact.customParams ?? [],
    };
    const res = await getHttp().post(`/api/v1/addContact/${contact.whatsappNumber}`, payload);
    const data = res.data as Record<string, unknown>;
    const raw = (data.result ?? data) as Record<string, unknown>;
    return { result: normaliseContact(raw) };
  } catch (err) {
    return watiError(err, "upsertContact");
  }
}

// PDF: POST /api/v1/updateContactAttributes/{whatsappNumber}
//      Body: { "customParams": [...] }
export async function updateContactParams(
  whatsappNumber: string,
  params: CustomParam[]
): Promise<WatiResponse<Contact>> {
  try {
    const res = await getHttp().post(
      `/api/v1/updateContactAttributes/${whatsappNumber}`,
      { customParams: params }
    );
    const data = res.data as Record<string, unknown>;
    const raw = (data.result ?? data) as Record<string, unknown>;
    return { result: normaliseContact(raw) };
  } catch (err) {
    return watiError(err, "updateContactParams");
  }
}

// ─── Tags ────────────────────────────────────────────────────
// (getTags not in PDF; best-effort endpoint kept for internal use)

export async function getTags(): Promise<WatiListResponse<Tag>> {
  try {
    const res = await getHttp().get("/api/v1/getTags");
    const data = res.data as Record<string, unknown>;
    const items = (
      (data.result ?? data.tags ?? []) as Record<string, unknown>[]
    ).map((t) => ({ id: String(t.id ?? t.name ?? ""), name: String(t.name ?? t.id ?? "") }));
    return buildList<Tag>(items, data as Record<string, unknown>, 100, 1);
  } catch (err) {
    return watiError(err, "getTags");
  }
}

// PDF: POST /api/v1/addTag/{whatsappNumber}
//      Body: { "tag": "VIP" }
export async function addTagToContact(
  whatsappNumber: string,
  tagName: string
): Promise<WatiResponse<void>> {
  try {
    await getHttp().post(`/api/v1/addTag/${whatsappNumber}`, { tag: tagName });
    return { result: undefined };
  } catch (err) {
    return watiError(err, "addTagToContact");
  }
}

// PDF: DELETE /api/v1/removeTag/{whatsappNumber}/{tagName}
export async function removeTagFromContact(
  whatsappNumber: string,
  tagName: string
): Promise<WatiResponse<void>> {
  try {
    await getHttp().delete(`/api/v1/removeTag/${whatsappNumber}/${tagName}`);
    return { result: undefined };
  } catch (err) {
    return watiError(err, "removeTagFromContact");
  }
}

// ─── Messages ────────────────────────────────────────────────
// (getMessages not in PDF; best-effort endpoint kept)

export async function getMessages(
  whatsappNumber: string,
  pageSize: number,
  page: number
): Promise<WatiListResponse<Message>> {
  try {
    const res = await getHttp().get(`/api/v1/getMessages/${whatsappNumber}`, {
      params: { pageSize, pageNumber: page },
    });
    const data = res.data as Record<string, unknown>;
    const items = (
      (data.result ?? data.messages ?? []) as Record<string, unknown>[]
    ).map((m) => ({
      id: String(m.id ?? m.wAMid ?? ""),
      whatsappMessageId: m.wAMid as string | undefined,
      conversationId: m.conversationId as string | undefined,
      type: String(m.type ?? "text"),
      data: m.data as string | undefined,
      text: (m.text ?? m.messageText) as string | undefined,
      timestamp: String(m.created ?? m.timestamp ?? new Date().toISOString()),
      statusString: m.statusString as string | undefined,
      owner: Boolean(m.owner),
    } as Message));
    const info = (data.info ?? {}) as Record<string, unknown>;
    return buildList(items, info, pageSize, page);
  } catch (err) {
    return watiError(err, "getMessages");
  }
}

// PDF: POST /api/v1/sendSessionMessage/{whatsappNumber}
//      Body: { "messageText": "Hello!" }
export async function sendTextMessage(
  whatsappNumber: string,
  message: string
): Promise<WatiResponse<Message>> {
  try {
    const res = await getHttp().post(
      `/api/v1/sendSessionMessage/${whatsappNumber}`,
      { messageText: message }
    );
    const data = res.data as Record<string, unknown>;
    const raw = (data.result ?? data) as Record<string, unknown>;
    return {
      result: {
        id: String(raw.id ?? raw.wAMid ?? ""),
        type: "text",
        text: message,
        timestamp: new Date().toISOString(),
        owner: true,
      },
    };
  } catch (err) {
    return watiError(err, "sendTextMessage");
  }
}

// PDF: POST /api/v1/sendTemplateMessage/{whatsappNumber}
//      Body: { "template_name":"...","broadcast_name":"...","parameters":[...] }
export async function sendTemplateMessage(
  whatsappNumber: string,
  templateName: string,
  broadcastName: string,
  parameters: Array<{ name: string; value: string }>
): Promise<WatiResponse<Message>> {
  try {
    const res = await getHttp().post(
      `/api/v1/sendTemplateMessage/${whatsappNumber}`,
      { template_name: templateName, broadcast_name: broadcastName, parameters }
    );
    const data = res.data as Record<string, unknown>;
    const raw = (data.result ?? data) as Record<string, unknown>;
    return {
      result: {
        id: String(raw.id ?? raw.messageId ?? ""),
        type: "template",
        text: templateName,
        timestamp: new Date().toISOString(),
        owner: true,
      },
    };
  } catch (err) {
    return watiError(err, "sendTemplateMessage");
  }
}

// ─── Templates ───────────────────────────────────────────────
// PDF: GET /api/v1/getMessageTemplates?pageSize=20&pageNumber=1

export async function getTemplates(): Promise<WatiListResponse<Template>> {
  try {
    const res = await getHttp().get("/api/v1/getMessageTemplates", {
      params: { pageSize: 100, pageNumber: 1 },
    });
    const data = res.data as Record<string, unknown>;
    const items = (
      (data.messageTemplates ?? data.result ?? data.templates ?? []) as Record<string, unknown>[]
    ).map((t) => ({
      id: String(t.id ?? t.elementName ?? ""),
      elementName: String(t.elementName ?? t.name ?? ""),
      body: t.body as string | undefined,
      templateType: t.templateType as string | undefined,
      status: t.status as string | undefined,
      category: t.category as string | undefined,
      language: t.language as string | undefined,
    } as Template));
    const info = (data.info ?? {}) as Record<string, unknown>;
    return buildList(items, info, 100, 1);
  } catch (err) {
    return watiError(err, "getTemplates");
  }
}

// ─── Broadcasts ──────────────────────────────────────────────
// PDF: POST /api/v1/sendBroadcastToSegment
//      Body: { "template_name":"...","broadcast_name":"...","segmentName":"..." }
// getBroadcasts not in PDF spec; best-effort kept.

export async function getBroadcasts(
  pageSize: number,
  page: number
): Promise<WatiListResponse<Broadcast>> {
  try {
    const res = await getHttp().get("/api/v1/getBroadcastSummary", {
      params: { pageSize, pageNumber: page },
    });
    const data = res.data as Record<string, unknown>;
    const items = (
      (data.result ?? data.broadcasts ?? []) as Record<string, unknown>[]
    ).map((b) => ({
      id: String(b.id ?? ""),
      name: String(b.name ?? ""),
      templateName: b.templateName as string | undefined,
      status: b.status as string | undefined,
      scheduledTime: b.scheduledTime as string | undefined,
      createdAt: (b.created ?? b.createdAt) as string | undefined,
    } as Broadcast));
    const info = (data.info ?? {}) as Record<string, unknown>;
    return buildList(items, info, pageSize, page);
  } catch (err) {
    return watiError(err, "getBroadcasts");
  }
}

export async function createBroadcast(
  name: string,
  templateName: string,
  segmentName?: string,
  scheduledTime?: string
): Promise<WatiResponse<Broadcast>> {
  try {
    // PDF endpoint: POST /api/v1/sendBroadcastToSegment
    const payload: Record<string, unknown> = {
      broadcast_name: name,
      template_name: templateName,
    };
    if (segmentName) payload.segmentName = segmentName;
    if (scheduledTime) payload.scheduledTime = scheduledTime;
    const res = await getHttp().post("/api/v1/sendBroadcastToSegment", payload);
    const data = res.data as Record<string, unknown>;
    const raw = (data.result ?? data) as Record<string, unknown>;
    return {
      result: {
        id: String(raw.id ?? ""),
        name: String(raw.name ?? name),
        templateName: (raw.templateName as string | undefined) ?? templateName,
        status: (raw.status as string | undefined) ?? "CREATED",
        scheduledTime: raw.scheduledTime as string | undefined,
        createdAt: (raw.created as string | undefined) ?? new Date().toISOString(),
      },
    };
  } catch (err) {
    return watiError(err, "createBroadcast");
  }
}

// ─── Operators & Tickets ──────────────────────────────────────
// PDF: GET  /api/v1/getOperators
//      POST /api/v1/assignOperator/{whatsappNumber}  Body: { "email": "..." }
//      POST /api/v1/tickets/assign                   Body: { "whatsappNumber":"...","teamName":"..." }

export async function getOperators(): Promise<WatiListResponse<Operator>> {
  try {
    const res = await getHttp().get("/api/v1/getOperators");
    const data = res.data as Record<string, unknown>;
    const items = (
      (data.result ?? data.operators ?? []) as Record<string, unknown>[]
    ).map((o) => ({
      id: String(o.id ?? ""),
      name: String(o.fullName ?? o.name ?? ""),
      email: o.email as string | undefined,
      role: o.role as string | undefined,
    } as Operator));
    return buildList(items, data as Record<string, unknown>, 100, 1);
  } catch (err) {
    return watiError(err, "getOperators");
  }
}

export async function getTickets(
  status?: string,
  pageSize?: number,
  page?: number
): Promise<WatiListResponse<Ticket>> {
  try {
    const params: Record<string, unknown> = {
      pageSize: pageSize ?? 20,
      pageNumber: page ?? 1,
    };
    if (status) params.status = status;
    const res = await getHttp().get("/api/v1/getTickets", { params });
    const data = res.data as Record<string, unknown>;
    const items = (
      (data.result ?? data.tickets ?? []) as Record<string, unknown>[]
    ).map((t) => ({
      id: String(t.id ?? ""),
      contactId: t.contactId as string | undefined,
      assignedOperatorId: t.assignedOperatorId as string | undefined,
      status: t.status as string | undefined,
      createdAt: (t.created ?? t.createdAt) as string | undefined,
      updatedAt: (t.updated ?? t.updatedAt) as string | undefined,
    } as Ticket));
    const info = (data.info ?? {}) as Record<string, unknown>;
    return buildList(items, info, pageSize ?? 20, page ?? 1);
  } catch (err) {
    return watiError(err, "getTickets");
  }
}

export async function resolveTicket(
  ticketId: string
): Promise<WatiResponse<Ticket>> {
  try {
    const res = await getHttp().put(`/api/v1/tickets/${ticketId}/resolve`, {});
    const data = res.data as Record<string, unknown>;
    const raw = (data.result ?? data) as Record<string, unknown>;
    return {
      result: {
        id: String(raw.id ?? ticketId),
        status: "resolved",
        assignedOperatorId: raw.assignedOperatorId as string | undefined,
      },
    };
  } catch (err) {
    return watiError(err, "resolveTicket");
  }
}

export async function createTicket(
  whatsappNumber: string,
  note?: string
): Promise<WatiResponse<Ticket>> {
  try {
    const payload: Record<string, unknown> = { whatsappNumber };
    if (note) payload.note = note;
    const res = await getHttp().post("/api/v1/tickets", payload);
    const data = res.data as Record<string, unknown>;
    const raw = (data.result ?? data) as Record<string, unknown>;
    return {
      result: {
        id: String(raw.id ?? ""),
        contactId: whatsappNumber,
        status: "open",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    return watiError(err, "createTicket");
  }
}

// PDF: POST /api/v1/tickets/assign  Body: { "whatsappNumber":"...","teamName":"..." }
export async function assignTicket(
  whatsappNumber: string,
  teamName: string
): Promise<WatiResponse<Ticket>> {
  try {
    const res = await getHttp().post("/api/v1/tickets/assign", {
      whatsappNumber,
      teamName,
    });
    const data = res.data as Record<string, unknown>;
    const raw = (data.result ?? data) as Record<string, unknown>;
    return {
      result: {
        id: String(raw.id ?? ""),
        assignedOperatorId: teamName,
        status: raw.status as string | undefined,
      },
    };
  } catch (err) {
    return watiError(err, "assignTicket");
  }
}
