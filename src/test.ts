// ============================================================
// Executor-layer smoke test — no LLM required.
// Calls every tool executor directly with mock-appropriate inputs.
// Write operations run with dryRun=true to skip CLI confirmation.
//
// Usage:  npm run test
// ============================================================

import * as dotenv from "dotenv";
dotenv.config({ override: true });

import { TOOL_EXECUTORS } from "./tools";

// ─── Helpers ──────────────────────────────────────────────────

const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET  = "\x1b[0m";

let passed = 0;
let failed = 0;

async function run(
  name: string,
  input: Record<string, unknown>,
  dryRun = false,
  expectContains?: string
): Promise<void> {
  const executor = TOOL_EXECUTORS[name];
  if (!executor) {
    console.log(`${RED}✗ ${name}: executor not found${RESET}`);
    failed++;
    return;
  }

  try {
    const result = await executor(input, dryRun);
    const ok = !result.startsWith("[操作失败]") &&
               (expectContains ? result.includes(expectContains) : true);

    if (ok) {
      console.log(`${GREEN}✓ ${name}${RESET}`);
      if (process.env.VERBOSE) console.log(`  → ${result.split("\n")[0]}`);
      passed++;
    } else {
      console.log(`${RED}✗ ${name}${RESET}`);
      console.log(`  → ${result}`);
      failed++;
    }
  } catch (err) {
    console.log(`${RED}✗ ${name}: ${err}${RESET}`);
    failed++;
  }
}

// ─── Test cases ───────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n${YELLOW}=== WATI Agent — Executor Smoke Tests ===${RESET}\n`);

  // Contacts
  console.log("── Contacts ──────────────────────────────────");
  await run("get_contacts", {}, false, "contact");
  await run("get_contacts", { tag: "vip" }, false, "Alice");
  await run("get_contacts", { search_term: "Bob" }, false, "Bob");
  await run("get_contact", { whatsapp_number: "8613800138001" }, false, "Alice");
  await run("upsert_contact", { whatsapp_number: "8613800138001", first_name: "Alice" }, true, "[Preview]");
  await run("update_contact_params", {
    whatsapp_number: "8613800138001",
    params: [{ name: "plan", value: "enterprise" }],
  }, true, "[Preview]");

  // Tags
  console.log("\n── Tags ──────────────────────────────────────");
  await run("get_tags", {}, false, "vip");
  await run("add_tag_to_contact", { whatsapp_number: "8613800138001", tag_name: "test-tag" }, true, "[Preview]");
  await run("remove_tag_from_contact", { whatsapp_number: "8613800138001", tag_name: "vip" }, true, "[Preview]");

  // Messages
  console.log("\n── Messages ──────────────────────────────────");
  await run("get_messages", { whatsapp_number: "8613800138001" }, false, "Messages");
  await run("send_text_message", { whatsapp_number: "8613800138001", message: "Hello!" }, true, "[Preview]");
  await run("send_template_message", {
    whatsapp_number: "8613800138001",
    template_name: "welcome_message",
    broadcast_name: "test-broadcast",
    parameters: [{ name: "1", value: "Alice" }],
  }, true, "[Preview]");

  // Templates
  console.log("\n── Templates ─────────────────────────────────");
  await run("get_templates", {}, false, "welcome_message");

  // Broadcasts
  console.log("\n── Broadcasts ────────────────────────────────");
  await run("get_broadcasts", {}, false, "broadcast");
  await run("create_broadcast", {
    name: "May Campaign",
    template_name: "welcome_message",
    segment_name: "VIP Customers",
  }, true, "[Preview]");

  // Operators & Tickets
  console.log("\n── Operators & Tickets ───────────────────────");
  await run("get_operators", {}, false, "David Chen");
  await run("get_tickets", {}, false, "ticket");
  await run("get_tickets", { status: "open" }, false, "ticket");
  await run("assign_ticket", { whatsapp_number: "8613800138001", team_name: "Support" }, true, "[Preview]");
  await run("resolve_ticket", { ticket_id: "tk1" }, true, "[Preview]");
  await run("create_ticket", { whatsapp_number: "8613800138001", note: "User reported login issues" }, true, "[Preview]");

  // Summary
  const total = passed + failed;
  console.log(`\n${YELLOW}─────────────────────────────────────────────${RESET}`);
  console.log(`${passed === total ? GREEN : RED}Result: ${passed}/${total} passed${RESET}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
