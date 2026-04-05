// ============================================================
// Tool schemas + executors for Broadcasts
// ============================================================

import type Anthropic from "@anthropic-ai/sdk";
import * as wati from "../wati";
import { formatColumns, promptConfirm } from "../utils";

// ─── Tool schemas ─────────────────────────────────────────────

export const getBroadcastsTool: Anthropic.Tool = {
  name: "get_broadcasts",
  description:
    "Retrieve the broadcast campaign history, with pagination. " +
    "Use when the user asks about past broadcasts or what campaigns have been sent.",
  input_schema: {
    type: "object",
    properties: {
      page_size: { type: "number", description: "Number of results per page (default: 20)" },
      page: { type: "number", description: "Page number, starting at 1 (default: 1)" },
    },
    required: [],
  },
};

export const createBroadcastTool: Anthropic.Tool = {
  name: "create_broadcast",
  description:
    "Create a new broadcast campaign using an approved template. " +
    "Optionally target a segment and/or schedule for a future time. " +
    "⚠️ This sends messages to multiple contacts — always confirm with the user first.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Broadcast campaign name (for internal labelling only)" },
      template_name: { type: "string", description: "elementName of the approved template to use" },
      segment_name: {
        type: "string",
        description: "Target audience segment name (maps to API segmentName). Leave empty to send to all contacts.",
      },
      scheduled_time: {
        type: "string",
        description: "ISO 8601 scheduled send time, e.g. 2025-06-01T10:00:00Z. Leave empty to send immediately.",
      },
    },
    required: ["name", "template_name"],
  },
};

// ─── Executors ────────────────────────────────────────────────

export async function executeGetBroadcasts(
  input: Record<string, unknown>,
  _dryRun: boolean
): Promise<string> {
  try {
    const res = await wati.getBroadcasts(
      (input.page_size as number) ?? 20,
      (input.page as number) ?? 1
    );
    if (res.count === 0) return "No broadcasts found.";

    const table = formatColumns(
      ["Name", "Status", "Template", "Created", "Scheduled"],
      res.result.map((b) => [
        b.name,
        b.status ?? "—",
        b.templateName ?? "—",
        b.createdAt ? new Date(b.createdAt).toLocaleString("en-US") : "—",
        b.scheduledTime ? new Date(b.scheduledTime).toLocaleString("en-US") : "—",
      ]),
      [22, 12, 18, 22, 22]
    );
    return `Found ${res.count} broadcast(s) (page ${res.page}/${res.totalPages}):\n${table}`;
  } catch (err) {
    return `[Error] get_broadcasts: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function executeCreateBroadcast(
  input: Record<string, unknown>,
  dryRun: boolean
): Promise<string> {
  const segmentPart = input.segment_name ? `, segment: ${input.segment_name}` : "";
  const description = `Create broadcast "${input.name}" (template: ${input.template_name}${segmentPart})`;

  if (dryRun) {
    process.stdout.write(
      `[Preview] Would call createBroadcast with: ${JSON.stringify(input)}\n`
    );
    return `[Preview] ${description}`;
  }

  const confirmed = await promptConfirm(description);
  if (!confirmed) return "Operation cancelled.";

  try {
    const res = await wati.createBroadcast(
      input.name as string,
      input.template_name as string,
      input.segment_name as string | undefined,
      input.scheduled_time as string | undefined
    );
    const b = res.result;
    const timing = b.scheduledTime
      ? `  Scheduled: ${new Date(b.scheduledTime).toLocaleString("en-US")}`
      : "  Status: queued";
    return (
      `Broadcast created ✓\n` +
      `  Name: ${b.name}\n` +
      `  Template: ${b.templateName}\n` +
      `  ID: ${b.id}\n` +
      timing
    );
  } catch (err) {
    return `[Error] create_broadcast: ${err instanceof Error ? err.message : String(err)}`;
  }
}
