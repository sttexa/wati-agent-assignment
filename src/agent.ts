// ============================================================
// Agent core — complete tool_use agentic loop
//
// Flow per user turn:
//   1. Skip empty/whitespace input immediately
//   2. Detect dry-run intent from user message
//   3. Append user message to history
//   4. Call LLM (with tools; dryRun is forwarded to executors instead)
//   5. If stop_reason === "tool_use": execute tools, append results, loop
//   6. If stop_reason === "end_turn": return final text to CLI
//   7. After MAX_TURNS: return "指令过于复杂" message
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import * as dotenv from "dotenv";
import { ALL_TOOLS, TOOL_EXECUTORS } from "./tools";
import * as wati from "./wati";

dotenv.config({ override: true });

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TURNS = 6; // max agentic loop iterations before giving up
const WRITE_TOOL_NAMES = new Set([
  "upsert_contact",
  "update_contact_params",
  "add_tag_to_contact",
  "remove_tag_from_contact",
  "send_text_message",
  "send_template_message",
  "create_broadcast",
  "assign_ticket",
  "resolve_ticket",
  "create_ticket",
]);

// Conversation history persists across CLI turns within a session
let history: Anthropic.MessageParam[] = [];

// Guard against re-entrant calls (e.g. promptConfirm resumes stdin and the
// main readline fires a spurious "line" event with the confirmation input).
let _running = false;
let _warnedMockFallback = false;

/** True while runTurn() is executing — used by index.ts to ignore spurious input. */
export function isAgentRunning(): boolean {
  return _running;
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set. Check your .env file.");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

// ─── Public API ───────────────────────────────────────────────

/** Clear conversation history (called by /reset in index.ts) */
export function resetConversation(): void {
  history = [];
}

/**
 * Run one user turn through the full agentic loop.
 * @param userMessage  Raw text from the CLI
 * @returns            The agent's final text reply, or "" to signal silent skip
 */
export async function runTurn(userMessage: string): Promise<string> {
  // Skip empty / whitespace-only input — don't waste an API call
  if (!userMessage.trim()) return "";

  // Prevent re-entrant execution caused by promptConfirm resuming stdin
  if (_running) return "";
  _running = true;
  try {
    return await _runTurn(userMessage);
  } finally {
    _running = false;
  }
}

async function _runTurn(userMessage: string): Promise<string> {

  const isDryRun = detectDryRun(userMessage);

  if (shouldUseMockFallback()) {
    return runMockFallbackTurn(userMessage, isDryRun);
  }


  history.push({ role: "user", content: userMessage });

  for (let iteration = 0; iteration < MAX_TURNS; iteration++) {
    let response: Anthropic.Message;

    try {
      response = await getClient().messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: buildSystemPrompt(isDryRun),
        tools: ALL_TOOLS,
        messages: history,
      });
    } catch (err) {
      // Remove the user message we just added — it was never processed
      history.pop();
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `\n[API Error] Request failed — check your network connection and API key: ${msg}\n`
      );
      return ""; // signal index.ts to silently continue
    }

    // Always append assistant turn to history before processing
    history.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      return extractText(response.content);
    }

    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      // Print any accompanying text the LLM produced alongside tool calls
      const planText = extractText(response.content);
      if (planText) {
        process.stdout.write("\n" + planText + "\n");
      }

      // Execute all tool calls and collect results (dryRun forwarded to executors)
      const toolResults = await executeToolUses(toolUseBlocks, isDryRun);

      // Feed results back as a new user turn
      history.push({ role: "user", content: toolResults });

      // For read-only tool calls, keep the Anthropic tool_use -> tool_result
      // protocol intact in history, then return the raw tool output directly
      // so the CLI preserves fixed-width formatting.
      if (toolUseBlocks.length > 0 && toolUseBlocks.every((block) => !WRITE_TOOL_NAMES.has(block.name))) {
        return toolResults.map((result) => String(result.content)).join("\n\n");
      }

      continue; // loop → call LLM again with tool results
    }

    // Unexpected stop reason
    return `[Unexpected stop — stop_reason=${response.stop_reason}]`;
  }

  return "The request is too complex. Please break it into smaller steps.";
}

// ─── System prompt ─────────────────────────────────────────────

function buildSystemPrompt(isDryRun: boolean): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const base = `You are a WATI WhatsApp business assistant. You help users manage contacts, send messages, work with templates, run broadcast campaigns, and handle support tickets.

Today's date is ${today}. Use this when generating campaign names, scheduled times, or any date-sensitive fields.

[Execution Rules]
1. Before taking any action, clearly explain your plan to the user in plain language, step by step.
2. For operations with side effects (sending messages, creating broadcasts, modifying contacts), proceed with execution in the same reply after explaining the plan — unless the user explicitly asks you to confirm first.
3. Read-only operations (listing, querying) can be executed directly without pre-explanation.
4. When instructions are ambiguous, ask for clarification. Never guess contact numbers or template names.
5. Always reply in English. Preserve original data field formats.`;

  if (isDryRun) {
    return (
      base +
      `\n\n[Current Mode: Preview / Dry-Run]\n` +
      `You are in preview mode. Tools will be called normally, but all write operations (sending messages, modifying data, etc.) will return a preview description instead of executing.\n` +
      `Analyze the user's intent and call tools as usual — the executors handle the preview logic automatically.\n` +
      `At the end of your reply, remind the user: "To execute for real, repeat your request without the 'preview' keyword."`
    );
  }

  return base;
}

// ─── Dry-run detection ─────────────────────────────────────────

function detectDryRun(message: string): boolean {
  return /preview|dry[\s-]?run/i.test(message);
}

function shouldUseMockFallback(): boolean {
  const useMock = process.env.WATI_MOCK !== "false";
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  return useMock && !apiKey;
}

function normalizeInput(message: string): string {
  return message
    .replace(/^preview:\s*/i, "")
    .replace(/^dry[\s-]?run:\s*/i, "")
    .trim();
}

async function executeNamedTool(
  toolName: string,
  input: Record<string, unknown>,
  dryRun: boolean
): Promise<string> {
  const executor = TOOL_EXECUTORS[toolName];
  if (!executor) return `[Error] Unknown tool: ${toolName}`;
  return executor(input, dryRun);
}

async function runMockFallbackTurn(userMessage: string, dryRun: boolean): Promise<string> {
  if (!_warnedMockFallback) {
    process.stderr.write(
      "[Mock Fallback] ANTHROPIC_API_KEY not set; using local rule-based command handling.\n"
    );
    _warnedMockFallback = true;
  }

  const input = normalizeInput(userMessage);

  let match: RegExpMatchArray | null;

  if (/^list all operators$/i.test(input)) {
    return executeNamedTool("get_operators", {}, dryRun);
  }

  if ((match = input.match(/^show all tickets(?: with status (open|resolved|pending))?$/i))) {
    return executeNamedTool(
      "get_tickets",
      match[1] ? { status: match[1].toLowerCase() } : {},
      dryRun
    );
  }

  if ((match = input.match(/^list all contacts tagged ([\w-]+)$/i))) {
    return executeNamedTool("get_contacts", { tag: match[1] }, dryRun);
  }

  if ((match = input.match(/^show me the full contact details for (\d+)$/i))) {
    return executeNamedTool("get_contact", { whatsapp_number: match[1] }, dryRun);
  }

  if ((match = input.match(/^look up contact (\d+)$/i))) {
    return executeNamedTool("get_contact", { whatsapp_number: match[1] }, dryRun);
  }

  if ((match = input.match(/^show messages for (\d+)$/i))) {
    return executeNamedTool("get_messages", { whatsapp_number: match[1] }, dryRun);
  }

  if ((match = input.match(/^list templates$/i))) {
    return executeNamedTool("get_templates", {}, dryRun);
  }

  if (
    (match = input.match(
      /^send template message ([\w-]+) to (\d+),?\s*param\s+(\d+)=("?)([^"]+)\4$/i
    ))
  ) {
    return executeNamedTool(
      "send_template_message",
      {
        whatsapp_number: match[2],
        template_name: match[1],
        broadcast_name: `mock-send-${new Date().toISOString().slice(0, 10)}`,
        parameters: [{ name: match[3], value: match[5] }],
      },
      dryRun
    );
  }

  if ((match = input.match(/^assign the conversation for (\d+) to the ([\w ]+?) team$/i))) {
    return executeNamedTool(
      "assign_ticket",
      { whatsapp_number: match[1], team_name: match[2].trim() },
      dryRun
    );
  }

  if (
    (match = input.match(
      /^create a broadcast called "([^"]+)" using the ([\w-]+) template(?:, targeting the ([\w ]+) segment)?$/i
    ))
  ) {
    const payload: Record<string, unknown> = {
      name: match[1],
      template_name: match[2],
    };
    if (match[3]) payload.segment_name = match[3].trim();
    return executeNamedTool("create_broadcast", payload, dryRun);
  }

  if (
    (match = input.match(
      /^look up contact (\d+), create a support ticket with note "([^"]+)", then assign the conversation to the ([\w ]+?) team$/i
    ))
  ) {
    const contactInfo = await executeNamedTool("get_contact", { whatsapp_number: match[1] }, dryRun);
    const ticketResult = await executeNamedTool(
      "create_ticket",
      { whatsapp_number: match[1], note: match[2] },
      dryRun
    );
    const assignResult = await executeNamedTool(
      "assign_ticket",
      { whatsapp_number: match[1], team_name: match[3].trim() },
      dryRun
    );
    return [contactInfo, ticketResult, assignResult].join("\n\n");
  }

  if (
    (match = input.match(
      /^find ([a-z][a-z\s'-]*)'?s contact details, then send (?:him|her|them )?the message: "([^"]+)"$/i
    ))
  ) {
    const searchTerm = match[1].trim();
    const contacts = await wati.getContacts(20, 1, searchTerm);
    const contact = contacts.result[0];
    if (!contact) return `No contact found matching "${searchTerm}".`;

    const contactInfo = await executeNamedTool(
      "get_contact",
      { whatsapp_number: contact.whatsappNumber },
      dryRun
    );
    const sendResult = await executeNamedTool(
      "send_text_message",
      { whatsapp_number: contact.whatsappNumber, message: match[2] },
      dryRun
    );
    return [contactInfo, sendResult].join("\n\n");
  }

  return [
    "[Mock Fallback] I could not confidently parse that command without an LLM.",
    "Supported examples in fallback mode:",
    '- "List all contacts tagged vip"',
    '- "Show me the full contact details for 8613800138001"',
    '- "List all operators"',
    '- "Show all tickets"',
    '- "preview: send template message welcome_message to 8613800138001, param 1=Alice"',
    '- "Assign the conversation for 8613800138001 to the Support team"',
    '- "Create a broadcast called \\"May Campaign\\" using the welcome_message template, targeting the VIP segment"',
  ].join("\n");
}

// ─── Tool execution ────────────────────────────────────────────

/**
 * Execute tool_use blocks serially and return tool_result blocks.
 *
 * Why serial instead of Promise.all():
 * - Many write executors require CLI confirmation via promptConfirm()
 * - Concurrent confirmations would compete for the same readline instance
 * - Serial execution keeps multi-step write workflows stable and predictable
 *
 * @param dryRun  Forwarded to every executor — write ops will preview instead of execute.
 */
async function executeToolUses(
  blocks: Anthropic.ToolUseBlock[],
  dryRun: boolean
): Promise<Anthropic.ToolResultBlockParam[]> {
  const results: Anthropic.ToolResultBlockParam[] = [];

  for (const block of blocks) {
    const executor = TOOL_EXECUTORS[block.name];

    if (!executor) {
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: `[Error] Unknown tool: ${block.name}`,
        is_error: true,
      });
      continue;
    }

    const result = await executor(block.input as Record<string, unknown>, dryRun);
    results.push({
      type: "tool_result",
      tool_use_id: block.id,
      content: result,
    });
  }

  return results;
}

// ─── Helpers ──────────────────────────────────────────────────

/** Extract concatenated text from a mixed content block array */
function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
