// ============================================================
// Tool schemas + executors for Templates
// ============================================================

import type Anthropic from "@anthropic-ai/sdk";
import * as wati from "../wati";
import { formatColumns } from "../utils";

// ─── Tool schemas ─────────────────────────────────────────────

export const getTemplatesTool: Anthropic.Tool = {
  name: "get_templates",
  description:
    "List all WhatsApp message templates in the account (APPROVED, PENDING, REJECTED). " +
    "Use when the user asks what templates are available or needs to look up a template name.",
  input_schema: { type: "object", properties: {}, required: [] },
};

// ─── Executors ────────────────────────────────────────────────

export async function executeGetTemplates(
  _input: Record<string, unknown>,
  _dryRun: boolean
): Promise<string> {
  try {
    const res = await wati.getTemplates();
    if (res.count === 0) return "No templates found.";

    const table = formatColumns(
      ["Name", "Status", "Language", "Type", "Category"],
      res.result.map((t) => [
        t.elementName,
        t.status ?? "—",
        t.language ?? "—",
        t.templateType ?? "—",
        t.category ?? "—",
      ]),
      [24, 10, 10, 12, 14]
    );
    return `Templates (${res.count} total):\n${table}`;
  } catch (err) {
    return `[Error] get_templates: ${err instanceof Error ? err.message : String(err)}`;
  }
}
