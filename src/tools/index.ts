// ============================================================
// Aggregated tool schemas and executor map
// Import ALL_TOOLS for the Anthropic SDK, TOOL_EXECUTORS for dispatch.
// ============================================================

import type Anthropic from "@anthropic-ai/sdk";

// ── Schema imports ──────────────────────────────────────────
import {
  getContactsTool,
  getContactTool,
  upsertContactTool,
  updateContactParamsTool,
  getTagsTool,
  addTagToContactTool,
  removeTagFromContactTool,
} from "./contacts";

import {
  getMessagesTool,
  sendTextMessageTool,
  sendTemplateMessageTool,
} from "./messages";

import { getTemplatesTool } from "./templates";
import { getBroadcastsTool, createBroadcastTool } from "./broadcasts";
import { getOperatorsTool, getTicketsTool, assignTicketTool, resolveTicketTool, createTicketTool } from "./operators";

// ── Executor imports ─────────────────────────────────────────
import {
  executeGetContacts,
  executeGetContact,
  executeUpsertContact,
  executeUpdateContactParams,
  executeGetTags,
  executeAddTagToContact,
  executeRemoveTagFromContact,
} from "./contacts";

import {
  executeGetMessages,
  executeSendTextMessage,
  executeSendTemplateMessage,
} from "./messages";

import { executeGetTemplates } from "./templates";
import { executeGetBroadcasts, executeCreateBroadcast } from "./broadcasts";
import { executeGetOperators, executeGetTickets, executeAssignTicket, executeResolveTicket, executeCreateTicket } from "./operators";

// ── Public exports ────────────────────────────────────────────

/** Full list of tool schemas to pass directly to Anthropic messages.create() */
export const ALL_TOOLS: Anthropic.Tool[] = [
  // Contacts & Tags
  getContactsTool,
  getContactTool,
  upsertContactTool,
  updateContactParamsTool,
  getTagsTool,
  addTagToContactTool,
  removeTagFromContactTool,
  // Messages
  getMessagesTool,
  sendTextMessageTool,
  sendTemplateMessageTool,
  // Templates
  getTemplatesTool,
  // Broadcasts
  getBroadcastsTool,
  createBroadcastTool,
  // Operators & Tickets
  getOperatorsTool,
  getTicketsTool,
  assignTicketTool,
  resolveTicketTool,
  createTicketTool,
];

/**
 * Executor function type.
 * @param input   Raw tool input from the LLM
 * @param dryRun  When true, write operations preview instead of executing
 */
export type ToolExecutor = (input: Record<string, unknown>, dryRun: boolean) => Promise<string>;

/**
 * Map from tool name → executor function.
 * Used by agent.ts to dispatch tool_use blocks.
 */
export const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  // Contacts & Tags
  get_contacts: executeGetContacts,
  get_contact: executeGetContact,
  upsert_contact: executeUpsertContact,
  update_contact_params: executeUpdateContactParams,
  get_tags: executeGetTags,
  add_tag_to_contact: executeAddTagToContact,
  remove_tag_from_contact: executeRemoveTagFromContact,
  // Messages
  get_messages: executeGetMessages,
  send_text_message: executeSendTextMessage,
  send_template_message: executeSendTemplateMessage,
  // Templates
  get_templates: executeGetTemplates,
  // Broadcasts
  get_broadcasts: executeGetBroadcasts,
  create_broadcast: executeCreateBroadcast,
  // Operators & Tickets
  get_operators: executeGetOperators,
  get_tickets: executeGetTickets,
  assign_ticket: executeAssignTicket,
  resolve_ticket: executeResolveTicket,
  create_ticket: executeCreateTicket,
};

// Re-export individual tools for direct imports if needed
export {
  getContactsTool, getContactTool, upsertContactTool, updateContactParamsTool,
  getTagsTool, addTagToContactTool, removeTagFromContactTool,
  getMessagesTool, sendTextMessageTool, sendTemplateMessageTool,
  getTemplatesTool,
  getBroadcastsTool, createBroadcastTool,
  getOperatorsTool, getTicketsTool, assignTicketTool, resolveTicketTool, createTicketTool,
};
