// ============================================================
// Tool schemas + executors for Contacts & Tags
// ============================================================

import type Anthropic from "@anthropic-ai/sdk";
import * as wati from "../wati";
import { formatColumns, promptConfirm } from "../utils";

// ─── Tool schemas ─────────────────────────────────────────────

export const getContactsTool: Anthropic.Tool = {
  name: "get_contacts",
  description:
    "Retrieve a paginated list of WATI contacts. Supports keyword search (by name, phone) and exact tag filtering.",
  input_schema: {
    type: "object",
    properties: {
      page_size: { type: "number", description: "Number of results per page (default: 20)" },
      page: { type: "number", description: "Page number, starting at 1 (default: 1)" },
      search_term: { type: "string", description: "Optional keyword for fuzzy search by name or phone number." },
      tag: { type: "string", description: "Filter by exact tag name, e.g. VIP — maps to the API ?tag= parameter." },
    },
    required: [],
  },
};

export const getContactTool: Anthropic.Tool = {
  name: "get_contact",
  description:
    "Get full details of a single contact by WhatsApp number (tags, custom params, etc.). Use when the user provides a specific number or needs a complete profile.",
  input_schema: {
    type: "object",
    properties: {
      whatsapp_number: {
        type: "string",
        description: "WhatsApp number including country code, e.g. 6281234567890",
      },
    },
    required: ["whatsapp_number"],
  },
};

export const upsertContactTool: Anthropic.Tool = {
  name: "upsert_contact",
  description:
    "Create a new contact or update an existing one's basic info. WhatsApp number is the unique key — updates if it exists, creates otherwise.",
  input_schema: {
    type: "object",
    properties: {
      whatsapp_number: { type: "string", description: "WhatsApp number including country code, e.g. 6281234567890" },
      first_name: { type: "string", description: "First name" },
      last_name: { type: "string", description: "Last name" },
      email: { type: "string", description: "Email address" },
    },
    required: ["whatsapp_number"],
  },
};

export const updateContactParamsTool: Anthropic.Tool = {
  name: "update_contact_params",
  description:
    "Batch-update a contact's custom parameters (key-value pairs, e.g. city, plan, renewal_date).",
  input_schema: {
    type: "object",
    properties: {
      whatsapp_number: { type: "string", description: "Contact's WhatsApp number" },
      params: {
        type: "array",
        description: "Array of custom parameters, each as { name, value }",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Parameter name" },
            value: { type: "string", description: "Parameter value" },
          },
          required: ["name", "value"],
        },
      },
    },
    required: ["whatsapp_number", "params"],
  },
};

export const getTagsTool: Anthropic.Tool = {
  name: "get_tags",
  description: "List all contact tags in the account.",
  input_schema: { type: "object", properties: {}, required: [] },
};

export const addTagToContactTool: Anthropic.Tool = {
  name: "add_tag_to_contact",
  description: "Add a tag to a contact. WATI auto-creates the tag if it doesn't exist.",
  input_schema: {
    type: "object",
    properties: {
      whatsapp_number: { type: "string", description: "Contact's WhatsApp number" },
      tag_name: { type: "string", description: "Tag name to add" },
    },
    required: ["whatsapp_number", "tag_name"],
  },
};

export const removeTagFromContactTool: Anthropic.Tool = {
  name: "remove_tag_from_contact",
  description: "Remove a tag from a contact.",
  input_schema: {
    type: "object",
    properties: {
      whatsapp_number: { type: "string", description: "Contact's WhatsApp number" },
      tag_name: { type: "string", description: "Tag name to remove" },
    },
    required: ["whatsapp_number", "tag_name"],
  },
};

// ─── Executors ────────────────────────────────────────────────

export async function executeGetContacts(
  input: Record<string, unknown>,
  _dryRun: boolean
): Promise<string> {
  try {
    const res = await wati.getContacts(
      (input.page_size as number) ?? 20,
      (input.page as number) ?? 1,
      input.search_term as string | undefined,
      input.tag as string | undefined
    );
    if (res.count === 0) return "No contacts found.";

    const table = formatColumns(
      ["Name", "Number", "Tags", "Email"],
      res.result.map((c) => [
        c.fullName ?? "—",
        c.whatsappNumber,
        c.tags?.join(", ") || "—",
        c.email ?? "—",
      ]),
      [18, 16, 22, 28]
    );
    return `Found ${res.count} contact(s) (page ${res.page}/${res.totalPages}):\n${table}`;
  } catch (err) {
    return `[Error] get_contacts: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function executeGetContact(
  input: Record<string, unknown>,
  _dryRun: boolean
): Promise<string> {
  try {
    const res = await wati.getContact(input.whatsapp_number as string);
    const c = res.result;
    const params = c.customParams?.map((p) => `${p.name}=${p.value}`).join(", ") ?? "none";
    return (
      `Contact details:\n` +
      `  Name: ${c.fullName ?? "—"}\n` +
      `  Number: ${c.whatsappNumber}\n` +
      `  Email: ${c.email ?? "—"}\n` +
      `  Tags: ${c.tags?.join(", ") || "none"}\n` +
      `  Custom params: ${params}`
    );
  } catch (err) {
    return `[Error] get_contact: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function executeUpsertContact(
  input: Record<string, unknown>,
  dryRun: boolean
): Promise<string> {
  const description = `Create/update contact ${input.whatsapp_number}`;

  if (dryRun) {
    process.stdout.write(
      `[Preview] Would call upsertContact with: ${JSON.stringify(input)}\n`
    );
    return `[Preview] ${description}`;
  }

  const confirmed = await promptConfirm(description);
  if (!confirmed) return "Operation cancelled.";

  try {
    const res = await wati.upsertContact({
      whatsappNumber: input.whatsapp_number as string,
      firstName: input.first_name as string | undefined,
      lastName: input.last_name as string | undefined,
      email: input.email as string | undefined,
    });
    const c = res.result;
    return `Contact saved: ${c.fullName ?? c.whatsappNumber} (ID: ${c.id})`;
  } catch (err) {
    return `[Error] upsert_contact: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function executeUpdateContactParams(
  input: Record<string, unknown>,
  dryRun: boolean
): Promise<string> {
  const params = input.params as Array<{ name: string; value: string }>;
  const description = `Update custom params for ${input.whatsapp_number}`;

  if (dryRun) {
    process.stdout.write(
      `[Preview] Would call updateContactParams with: ${JSON.stringify(input)}\n`
    );
    return `[Preview] ${description}`;
  }

  const confirmed = await promptConfirm(description);
  if (!confirmed) return "Operation cancelled.";

  try {
    await wati.updateContactParams(input.whatsapp_number as string, params);
    const summary = params.map((p) => `${p.name}="${p.value}"`).join(", ");
    return `Custom params updated for ${input.whatsapp_number}: ${summary}`;
  } catch (err) {
    return `[Error] update_contact_params: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function executeGetTags(
  _input: Record<string, unknown>,
  _dryRun: boolean
): Promise<string> {
  try {
    const res = await wati.getTags();
    if (res.count === 0) return "No tags found.";
    return `All tags (${res.count} total):\n` + res.result.map((t) => `• ${t.name}`).join("\n");
  } catch (err) {
    return `[Error] get_tags: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function executeAddTagToContact(
  input: Record<string, unknown>,
  dryRun: boolean
): Promise<string> {
  const description = `Add tag "${input.tag_name}" to ${input.whatsapp_number}`;

  if (dryRun) {
    process.stdout.write(
      `[Preview] Would call addTagToContact with: ${JSON.stringify(input)}\n`
    );
    return `[Preview] ${description}`;
  }

  const confirmed = await promptConfirm(description);
  if (!confirmed) return "Operation cancelled.";

  try {
    await wati.addTagToContact(input.whatsapp_number as string, input.tag_name as string);
    return `Tag "${input.tag_name}" added to ${input.whatsapp_number}.`;
  } catch (err) {
    return `[Error] add_tag_to_contact: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function executeRemoveTagFromContact(
  input: Record<string, unknown>,
  dryRun: boolean
): Promise<string> {
  const description = `Remove tag "${input.tag_name}" from ${input.whatsapp_number}`;

  if (dryRun) {
    process.stdout.write(
      `[Preview] Would call removeTagFromContact with: ${JSON.stringify(input)}\n`
    );
    return `[Preview] ${description}`;
  }

  const confirmed = await promptConfirm(description);
  if (!confirmed) return "Operation cancelled.";

  try {
    await wati.removeTagFromContact(input.whatsapp_number as string, input.tag_name as string);
    return `Tag "${input.tag_name}" removed from ${input.whatsapp_number}.`;
  } catch (err) {
    return `[Error] remove_tag_from_contact: ${err instanceof Error ? err.message : String(err)}`;
  }
}
