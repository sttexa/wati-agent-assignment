// ============================================================
// WATI Mock layer
// Exports the exact same function signatures as client.ts.
// Prints [MOCK] debug logs for every call.
// Switch by changing the import in agent.ts:
//   import * as wati from "./wati/client";  // real HTTP
//   import * as wati from "./wati/mock";    // mock (default)
// ============================================================

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

// ─── Static mock data ────────────────────────────────────────

const CONTACTS: Contact[] = [
  {
    id: "c1",
    whatsappNumber: "8613800138001",
    firstName: "Alice",
    lastName: "Wang",
    fullName: "Alice Wang",
    email: "alice@example.com",
    tags: ["vip", "purchased"],
    customParams: [
      { name: "city", value: "Shanghai" },
      { name: "plan", value: "pro" },
    ],
    createdAt: "2024-01-10T08:00:00Z",
    updatedAt: "2024-03-01T10:00:00Z",
  },
  {
    id: "c2",
    whatsappNumber: "8613900139002",
    firstName: "Bob",
    lastName: "Li",
    fullName: "Bob Li",
    email: "bob@example.com",
    tags: ["prospect"],
    customParams: [
      { name: "source", value: "referral" },
      { name: "city", value: "Beijing" },
    ],
    createdAt: "2024-02-15T09:00:00Z",
    updatedAt: "2024-03-05T14:00:00Z",
  },
  {
    id: "c3",
    whatsappNumber: "8613700137003",
    firstName: "Carol",
    lastName: "Chen",
    fullName: "Carol Chen",
    email: "carol@example.com",
    tags: ["vip", "prospect", "active"],
    customParams: [
      { name: "city", value: "Shenzhen" },
      { name: "plan", value: "enterprise" },
      { name: "renewal_date", value: "2025-06-01" },
    ],
    createdAt: "2023-11-20T07:30:00Z",
    updatedAt: "2024-03-10T16:00:00Z",
  },
];

const TAGS: Tag[] = [
  { id: "t1", name: "vip" },
  { id: "t2", name: "prospect" },
  { id: "t3", name: "purchased" },
  { id: "t4", name: "active" },
];

const MESSAGES: Message[] = [
  {
    id: "m1",
    type: "text",
    text: "Hi, I'd like to learn more about your plans.",
    timestamp: "2024-03-10T10:00:00Z",
    owner: false,
  },
  {
    id: "m2",
    type: "text",
    text: "Hello! We offer Pro and Enterprise plans — which features are most important to you?",
    timestamp: "2024-03-10T10:01:30Z",
    owner: true,
  },
];

const TEMPLATES: Template[] = [
  {
    id: "tp1",
    elementName: "welcome_message",
    body: "Hi {{1}}, welcome to our service! Feel free to reach out to our support team anytime.",
    templateType: "TEXT",
    status: "APPROVED",
    category: "UTILITY",
    language: "zh_CN",
  },
  {
    id: "tp2",
    elementName: "order_confirmation",
    body: "Hello {{1}}, your order {{2}} has been confirmed and is estimated to arrive by {{3}}.",
    templateType: "TEXT",
    status: "APPROVED",
    category: "TRANSACTIONAL",
    language: "zh_CN",
  },
];

const BROADCASTS: Broadcast[] = [
  {
    id: "b1",
    name: "April Promotion",
    templateName: "welcome_message",
    status: "COMPLETED",
    createdAt: "2024-04-01T08:00:00Z",
  },
];

const OPERATORS: Operator[] = [
  {
    id: "o1",
    name: "David Chen",
    email: "zhangsan@example.com",
    role: "operator",
  },
];

const TICKETS: Ticket[] = [
  {
    id: "tk1",
    contactId: "c1",
    assignedOperatorId: "o1",
    status: "open",
    createdAt: "2024-03-10T10:00:00Z",
    updatedAt: "2024-03-10T10:00:00Z",
  },
  {
    id: "tk2",
    contactId: "c2",
    assignedOperatorId: undefined,
    status: "open",
    createdAt: "2024-03-11T09:00:00Z",
    updatedAt: "2024-03-11T09:00:00Z",
  },
];

// ─── Helpers ─────────────────────────────────────────────────

function mockLog(fn: string, params?: Record<string, unknown>): void {
  const paramStr = params ? " | " + JSON.stringify(params) : "";
  console.log(`[MOCK] ${fn}${paramStr}`);
}

function ok<T>(result: T): WatiResponse<T> {
  return { result };
}

function paginate<T>(items: T[], page: number, pageSize: number): WatiListResponse<T> {
  const start = (page - 1) * pageSize;
  const paged = items.slice(start, start + pageSize);
  return {
    result: paged,
    page,
    pageSize,
    totalPages: Math.ceil(items.length / pageSize),
    count: items.length,
  };
}

/** Simulate network latency so the mock feels real */
function delay(ms = 120): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Contacts ────────────────────────────────────────────────

export async function getContacts(
  pageSize: number,
  page: number,
  searchTerm?: string,
  tag?: string
): Promise<WatiListResponse<Contact>> {
  mockLog("getContacts", { pageSize, page, searchTerm, tag });
  await delay();

  let items = [...CONTACTS];
  if (tag) {
    const t = tag.toLowerCase();
    items = items.filter((c) => c.tags?.some((tg) => tg.toLowerCase() === t));
  }
  if (searchTerm) {
    const q = searchTerm.toLowerCase();
    items = items.filter((c) =>
      [c.fullName, c.whatsappNumber, c.email]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }
  return paginate(items, page, pageSize);
}

export async function getContact(
  whatsappNumber: string
): Promise<WatiResponse<Contact>> {
  mockLog("getContact", { whatsappNumber });
  await delay();

  const contact = CONTACTS.find((c) => c.whatsappNumber === whatsappNumber);
  if (!contact) throw new Error(`[MOCK] Contact not found: ${whatsappNumber}`);
  return ok(contact);
}

export async function upsertContact(
  contact: Partial<Contact>
): Promise<WatiResponse<Contact>> {
  mockLog("upsertContact", contact as Record<string, unknown>);
  await delay();

  const existing = CONTACTS.find((c) => c.whatsappNumber === contact.whatsappNumber);
  if (existing) {
    const updated = { ...existing, ...contact };
    return ok(updated);
  }
  const created: Contact = {
    id: `c_${Date.now()}`,
    whatsappNumber: contact.whatsappNumber ?? "",
    fullName: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
    ...contact,
  };
  return ok(created);
}

export async function updateContactParams(
  whatsappNumber: string,
  params: CustomParam[]
): Promise<WatiResponse<Contact>> {
  mockLog("updateContactParams", { whatsappNumber, params });
  await delay();

  const contact = CONTACTS.find((c) => c.whatsappNumber === whatsappNumber);
  if (!contact) throw new Error(`[MOCK] Contact not found: ${whatsappNumber}`);
  const updated = { ...contact, customParams: params };
  return ok(updated);
}

// ─── Tags ─────────────────────────────────────────────────────

export async function getTags(): Promise<WatiListResponse<Tag>> {
  mockLog("getTags");
  await delay();
  return paginate(TAGS, 1, 100);
}

export async function addTagToContact(
  whatsappNumber: string,
  tagName: string
): Promise<WatiResponse<void>> {
  mockLog("addTagToContact", { whatsappNumber, tagName });
  await delay();
  return ok(undefined);
}

export async function removeTagFromContact(
  whatsappNumber: string,
  tagName: string
): Promise<WatiResponse<void>> {
  mockLog("removeTagFromContact", { whatsappNumber, tagName });
  await delay();
  return ok(undefined);
}

// ─── Messages ─────────────────────────────────────────────────

export async function getMessages(
  whatsappNumber: string,
  pageSize: number,
  page: number
): Promise<WatiListResponse<Message>> {
  mockLog("getMessages", { whatsappNumber, pageSize, page });
  await delay();
  return paginate(MESSAGES, page, pageSize);
}

export async function sendTextMessage(
  whatsappNumber: string,
  message: string
): Promise<WatiResponse<Message>> {
  mockLog("sendTextMessage", { whatsappNumber, message });
  await delay();

  const sent: Message = {
    id: `m_${Date.now()}`,
    type: "text",
    text: message,
    timestamp: new Date().toISOString(),
    owner: true,
  };
  return ok(sent);
}

export async function sendTemplateMessage(
  whatsappNumber: string,
  templateName: string,
  broadcastName: string,
  parameters: Array<{ name: string; value: string }>
): Promise<WatiResponse<Message>> {
  mockLog("sendTemplateMessage", { whatsappNumber, templateName, broadcastName, parameters });
  await delay();

  const template = TEMPLATES.find((t) => t.elementName === templateName);
  const sent: Message = {
    id: `m_${Date.now()}`,
    type: "template",
    text: template
      ? `[模板: ${templateName}] ${template.body}`
      : `[模板: ${templateName}]`,
    timestamp: new Date().toISOString(),
    owner: true,
  };
  return ok(sent);
}

// ─── Templates ────────────────────────────────────────────────

export async function getTemplates(): Promise<WatiListResponse<Template>> {
  mockLog("getTemplates");
  await delay();
  return paginate(TEMPLATES, 1, 100);
}

// ─── Broadcasts ───────────────────────────────────────────────

export async function getBroadcasts(
  pageSize: number,
  page: number
): Promise<WatiListResponse<Broadcast>> {
  mockLog("getBroadcasts", { pageSize, page });
  await delay();
  return paginate(BROADCASTS, page, pageSize);
}

export async function createBroadcast(
  name: string,
  templateName: string,
  segmentName?: string,
  scheduledTime?: string
): Promise<WatiResponse<Broadcast>> {
  mockLog("createBroadcast", { name, templateName, segmentName, scheduledTime });
  await delay();

  const broadcast: Broadcast = {
    id: `b_${Date.now()}`,
    name,
    templateName,
    segmentName,
    status: scheduledTime ? "SCHEDULED" : "PENDING",
    scheduledTime,
    createdAt: new Date().toISOString(),
  };
  return ok(broadcast);
}

// ─── Operators & Tickets ──────────────────────────────────────

export async function getOperators(): Promise<WatiListResponse<Operator>> {
  mockLog("getOperators");
  await delay();
  return paginate(OPERATORS, 1, 100);
}

export async function getTickets(
  status?: string,
  pageSize = 20,
  page = 1
): Promise<WatiListResponse<Ticket>> {
  mockLog("getTickets", { status, pageSize, page });
  await delay();

  const items = status ? TICKETS.filter((t) => t.status === status) : TICKETS;
  return paginate(items, page, pageSize);
}

export async function resolveTicket(
  ticketId: string
): Promise<WatiResponse<Ticket>> {
  mockLog("resolveTicket", { ticketId });
  await delay();

  const ticket = TICKETS.find((t) => t.id === ticketId);
  if (!ticket) throw new Error(`[MOCK] Ticket not found: ${ticketId}`);
  const updated = { ...ticket, status: "resolved", updatedAt: new Date().toISOString() };
  return ok(updated);
}

export async function createTicket(
  whatsappNumber: string,
  note?: string
): Promise<WatiResponse<Ticket>> {
  mockLog("createTicket", { whatsappNumber, note });
  await delay();

  const contact = CONTACTS.find((c) => c.whatsappNumber === whatsappNumber);
  if (!contact) throw new Error(`[MOCK] Contact not found: ${whatsappNumber}`);
  const ticket: Ticket = {
    id: `tk_${Date.now()}`,
    contactId: contact.id,
    assignedOperatorId: undefined,
    status: "open",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return ok(ticket);
}

export async function assignTicket(
  whatsappNumber: string,
  teamName: string
): Promise<WatiResponse<Ticket>> {
  mockLog("assignTicket", { whatsappNumber, teamName });
  await delay();

  const contact = CONTACTS.find((c) => c.whatsappNumber === whatsappNumber);
  if (!contact) throw new Error(`[MOCK] Contact not found: ${whatsappNumber}`);
  const ticket = TICKETS.find((t) => t.contactId === contact.id);
  if (!ticket) throw new Error(`[MOCK] No ticket found for contact: ${whatsappNumber}`);
  const updated = { ...ticket, assignedOperatorId: teamName, updatedAt: new Date().toISOString() };
  return ok(updated);
}
