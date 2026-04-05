// ============================================================
// Tool schemas + executors for Operators & Tickets
// ============================================================

import type Anthropic from "@anthropic-ai/sdk";
import * as wati from "../wati";
import { formatColumns, promptConfirm } from "../utils";

// ─── Tool schemas ─────────────────────────────────────────────

export const getOperatorsTool: Anthropic.Tool = {
  name: "get_operators",
  description:
    "List all operators (support agents) in the account. " +
    "Use when the user asks who the support agents are, or needs an operator ID for ticket assignment.",
  input_schema: { type: "object", properties: {}, required: [] },
};

export const getTicketsTool: Anthropic.Tool = {
  name: "get_tickets",
  description:
    "Retrieve support tickets, optionally filtered by status (open / resolved / pending), with pagination.",
  input_schema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        description: "Filter by ticket status: open | resolved | pending",
        enum: ["open", "resolved", "pending"],
      },
      page_size: { type: "number", description: "Number of results per page (default: 20)" },
      page: { type: "number", description: "Page number, starting at 1 (default: 1)" },
    },
    required: [],
  },
};

export const assignTicketTool: Anthropic.Tool = {
  name: "assign_ticket",
  description:
    "Assign a contact's conversation to a support team. " +
    "Calls POST /api/v1/tickets/assign — requires the contact's WhatsApp number and the team name.",
  input_schema: {
    type: "object",
    properties: {
      whatsapp_number: { type: "string", description: "Contact's WhatsApp number including country code" },
      team_name: { type: "string", description: "Target team name, e.g. Support" },
    },
    required: ["whatsapp_number", "team_name"],
  },
};

export const resolveTicketTool: Anthropic.Tool = {
  name: "resolve_ticket",
  description:
    "Mark a ticket as resolved. " +
    "⚠️ This action cannot be undone — confirm with the user before executing.",
  input_schema: {
    type: "object",
    properties: {
      ticket_id: { type: "string", description: "ID of the ticket to resolve" },
    },
    required: ["ticket_id"],
  },
};

export const createTicketTool: Anthropic.Tool = {
  name: "create_ticket",
  description:
    "Create a new support ticket for a contact. " +
    "An optional note can describe the issue background.",
  input_schema: {
    type: "object",
    properties: {
      whatsapp_number: { type: "string", description: "Contact's WhatsApp number including country code" },
      note: { type: "string", description: "Optional note describing the issue or context" },
    },
    required: ["whatsapp_number"],
  },
};

// ─── Executors ────────────────────────────────────────────────

export async function executeGetOperators(
  _input: Record<string, unknown>,
  _dryRun: boolean
): Promise<string> {
  try {
    const res = await wati.getOperators();
    if (res.count === 0) return "No operators found.";

    const table = formatColumns(
      ["Name", "ID", "Email", "Role"],
      res.result.map((o) => [
        o.name,
        o.id,
        o.email ?? "—",
        o.role ?? "—",
      ]),
      [20, 8, 28, 12]
    );
    return `Found ${res.count} operator(s):\n${table}`;
  } catch (err) {
    return `[Error] get_operators: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function executeGetTickets(
  input: Record<string, unknown>,
  _dryRun: boolean
): Promise<string> {
  try {
    const res = await wati.getTickets(
      input.status as string | undefined,
      (input.page_size as number) ?? 20,
      (input.page as number) ?? 1
    );
    if (res.count === 0) return "No tickets found.";

    const table = formatColumns(
      ["Ticket ID", "Status", "Contact", "Assigned To"],
      res.result.map((t) => [
        t.id,
        t.status ?? "—",
        t.contactId ?? "—",
        t.assignedOperatorId ?? "Unassigned",
      ]),
      [14, 12, 12, 18]
    );
    return `Found ${res.count} ticket(s) (page ${res.page}/${res.totalPages}):\n${table}`;
  } catch (err) {
    return `[Error] get_tickets: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function executeResolveTicket(
  input: Record<string, unknown>,
  dryRun: boolean
): Promise<string> {
  const description = `Mark ticket ${input.ticket_id} as resolved`;

  if (dryRun) {
    process.stdout.write(
      `[Preview] Would call resolveTicket with: ${JSON.stringify(input)}\n`
    );
    return `[Preview] ${description}`;
  }

  const confirmed = await promptConfirm(description);
  if (!confirmed) return "Operation cancelled.";

  try {
    const res = await wati.resolveTicket(input.ticket_id as string);
    const t = res.result;
    return `Ticket resolved ✓\n  Ticket ID: ${t.id}\n  Status: ${t.status}`;
  } catch (err) {
    return `[Error] resolve_ticket: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function executeCreateTicket(
  input: Record<string, unknown>,
  dryRun: boolean
): Promise<string> {
  const description = `Create ticket for ${input.whatsapp_number}${input.note ? ` (note: ${input.note})` : ""}`;

  if (dryRun) {
    process.stdout.write(
      `[Preview] Would call createTicket with: ${JSON.stringify(input)}\n`
    );
    return `[Preview] ${description}`;
  }

  const confirmed = await promptConfirm(description);
  if (!confirmed) return "Operation cancelled.";

  try {
    const res = await wati.createTicket(
      input.whatsapp_number as string,
      input.note as string | undefined
    );
    const t = res.result;
    return `Ticket created ✓\n  Ticket ID: ${t.id}\n  Contact: ${input.whatsapp_number}\n  Status: ${t.status}`;
  } catch (err) {
    return `[Error] create_ticket: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function executeAssignTicket(
  input: Record<string, unknown>,
  dryRun: boolean
): Promise<string> {
  const description = `Assign ${input.whatsapp_number}'s conversation to team "${input.team_name}"`;

  if (dryRun) {
    process.stdout.write(
      `[Preview] Would call assignTicket with: ${JSON.stringify(input)}\n`
    );
    return `[Preview] ${description}`;
  }

  const confirmed = await promptConfirm(description);
  if (!confirmed) return "Operation cancelled.";

  try {
    const res = await wati.assignTicket(
      input.whatsapp_number as string,
      input.team_name as string
    );
    const t = res.result;
    return (
      `Ticket assigned ✓\n` +
      `  Contact: ${input.whatsapp_number}\n` +
      `  Team: ${input.team_name}\n` +
      `  Status: ${t.status ?? "—"}`
    );
  } catch (err) {
    return `[Error] assign_ticket: ${err instanceof Error ? err.message : String(err)}`;
  }
}
