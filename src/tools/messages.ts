// ============================================================
// Tool schemas + executors for Messages
// ============================================================

import type Anthropic from "@anthropic-ai/sdk";
import * as wati from "../wati";
import { formatColumns, promptConfirm } from "../utils";

// ─── Tool schemas ─────────────────────────────────────────────

export const getMessagesTool: Anthropic.Tool = {
  name: "get_messages",
  description:
    "Retrieve message history for a contact (both sent and received), with pagination. " +
    "Use when the user asks about chat history or recent messages.",
  input_schema: {
    type: "object",
    properties: {
      whatsapp_number: { type: "string", description: "Contact's WhatsApp number" },
      page_size: { type: "number", description: "Number of results per page (default: 20)" },
      page: { type: "number", description: "Page number, starting at 1 (default: 1)" },
    },
    required: ["whatsapp_number"],
  },
};

export const sendTextMessageTool: Anthropic.Tool = {
  name: "send_text_message",
  description:
    "Send a plain-text WhatsApp message to a contact. " +
    "Note: outside the 24-hour conversation window only template messages are allowed — use this for active sessions only.",
  input_schema: {
    type: "object",
    properties: {
      whatsapp_number: { type: "string", description: "Recipient's WhatsApp number including country code" },
      message: { type: "string", description: "Message text" },
    },
    required: ["whatsapp_number", "message"],
  },
};

export const sendTemplateMessageTool: Anthropic.Tool = {
  name: "send_template_message",
  description:
    "Send an approved WhatsApp template message to a contact with placeholder parameters. " +
    "Use for proactive outreach outside the 24-hour window (e.g. order confirmations, promotions).",
  input_schema: {
    type: "object",
    properties: {
      whatsapp_number: { type: "string", description: "Recipient's WhatsApp number" },
      template_name: { type: "string", description: "Template elementName identifier" },
      broadcast_name: { type: "string", description: "Tracking label for this send (any string)" },
      parameters: {
        type: "array",
        description: "Template placeholder parameters, in order matching {{1}}{{2}} in the template body",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Parameter name, e.g. '1', '2'" },
            value: { type: "string", description: "Value to substitute into the placeholder" },
          },
          required: ["name", "value"],
        },
      },
    },
    required: ["whatsapp_number", "template_name", "broadcast_name"],
  },
};

// ─── Executors ────────────────────────────────────────────────

export async function executeGetMessages(
  input: Record<string, unknown>,
  _dryRun: boolean
): Promise<string> {
  try {
    const res = await wati.getMessages(
      input.whatsapp_number as string,
      (input.page_size as number) ?? 20,
      (input.page as number) ?? 1
    );
    if (res.count === 0) return "No messages found.";

    const table = formatColumns(
      ["Time", "Direction", "Content"],
      res.result.map((m) => [
        new Date(m.timestamp).toLocaleString("en-US"),
        m.owner ? "sent" : "received",
        m.text ?? `[${m.type}]`,
      ]),
      [22, 10, 60]
    );
    return `Messages (${res.count} total, page ${res.page}/${res.totalPages}):\n${table}`;
  } catch (err) {
    return `[Error] get_messages: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function executeSendTextMessage(
  input: Record<string, unknown>,
  dryRun: boolean
): Promise<string> {
  const description = `Send message to ${input.whatsapp_number}: "${input.message}"`;

  if (dryRun) {
    process.stdout.write(
      `[Preview] Would call sendTextMessage with: ${JSON.stringify(input)}\n`
    );
    return `[Preview] ${description}`;
  }

  const confirmed = await promptConfirm(description);
  if (!confirmed) return "Operation cancelled.";

  try {
    const res = await wati.sendTextMessage(
      input.whatsapp_number as string,
      input.message as string
    );
    const m = res.result;
    return `Message sent ✓\n  To: ${input.whatsapp_number}\n  Text: ${m.text}\n  Message ID: ${m.id}`;
  } catch (err) {
    return `[Error] send_text_message: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function executeSendTemplateMessage(
  input: Record<string, unknown>,
  dryRun: boolean
): Promise<string> {
  const description = `Send template "${input.template_name}" to ${input.whatsapp_number}`;

  if (dryRun) {
    process.stdout.write(
      `[Preview] Would call sendTemplateMessage with: ${JSON.stringify(input)}\n`
    );
    return `[Preview] ${description}`;
  }

  const confirmed = await promptConfirm(description);
  if (!confirmed) return "Operation cancelled.";

  try {
    const params = (input.parameters as Array<{ name: string; value: string }>) ?? [];
    const res = await wati.sendTemplateMessage(
      input.whatsapp_number as string,
      input.template_name as string,
      input.broadcast_name as string,
      params
    );
    const m = res.result;
    const paramSummary = params.map((p) => `{{${p.name}}}="${p.value}"`).join(", ");
    return (
      `Template message sent ✓\n` +
      `  To: ${input.whatsapp_number}\n` +
      `  Template: ${input.template_name}\n` +
      `  Params: ${paramSummary || "none"}\n` +
      `  Message ID: ${m.id}`
    );
  } catch (err) {
    return `[Error] send_template_message: ${err instanceof Error ? err.message : String(err)}`;
  }
}
