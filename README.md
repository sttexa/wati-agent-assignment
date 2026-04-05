# WATI Agent

A Claude-powered WhatsApp business assistant. Manage WATI contacts, messages, templates, broadcast campaigns, and support tickets through natural language.

This project is a CLI-first automation agent for the WATI WhatsApp API assignment. The current implementation focuses on a safe MVP: natural-language planning, tool-based execution, dry-run previews, and a swappable mock/live API layer.

---
ABOUT THE VIDEO: Because the provided WATI tenant credentials were not reliable in my environment, I’m demonstrating the fully tested mock path, which is intentionally swappable with the live adapter.

## Quick Start

```bash
npm install
cp .env.example .env   # fill in WATI_BASE_URL, WATI_TOKEN, ANTHROPIC_API_KEY
npm run dev
```

Useful environment flags:

```bash
WATI_MOCK=true    # default, use local mock data
WATI_MOCK=false   # use the live WATI HTTP API
```

Smoke-test all executors without calling the LLM:

```bash
npm run test
```

---

## Current Scope

The implemented MVP covers these API domains:

- Contacts: list contacts, fetch a single contact, create/update a contact, update custom attributes
- Tags: list tags, add a tag to a contact, remove a tag from a contact
- Messages: list message history, send a session text message, send a template message
- Templates: list available templates
- Broadcasts: list broadcasts, create a broadcast
- Operators & Tickets: list operators, list tickets, assign a conversation to a team, create a ticket, resolve a ticket

What is intentionally not in the current MVP:

- Interactive messages are not implemented
- Rollback / compensation logic is not implemented
- Persistent memory across CLI restarts is not implemented
- Web UI / bot UI is not implemented; the interface is a terminal REPL

---

## Usage Examples

**Look up a contact and send a message**
```
you> Look up Alice's contact info, then send her the message: "Hello, how can I help you?"
```
The agent first calls `get_contact` to retrieve the contact, then calls `send_text_message` to send the message. A y/n confirmation prompt appears before the message is sent.

**Broadcast campaign**
```
you> Create a broadcast called "May Campaign" using the welcome_message template, targeting the VIP segment
```
The agent calls `create_broadcast` (with `segment_name`), prints an operation summary, and waits for confirmation before executing.

**Assign and resolve tickets**
```
you> Assign the conversation for 8613800138001 to the Support team
you> Mark ticket tk1 as resolved
```
The agent calls `assign_ticket` (requires a WhatsApp number and team name) and then `resolve_ticket` in sequence.

**Dry-run preview**
```
you> preview: send template message order_confirmation to 8613800138001, param 1=John
```
All write operations only print a `[preview]` description without making any real requests. The response includes a prompt on how to switch to live execution.

---

## Implemented Tools

These are the concrete tools exposed to the LLM today:

| Domain | Tools |
|--------|-------|
| Contacts | `get_contacts`, `get_contact`, `upsert_contact`, `update_contact_params` |
| Tags | `get_tags`, `add_tag_to_contact`, `remove_tag_from_contact` |
| Messages | `get_messages`, `send_text_message`, `send_template_message` |
| Templates | `get_templates` |
| Broadcasts | `get_broadcasts`, `create_broadcast` |
| Operators & Tickets | `get_operators`, `get_tickets`, `assign_ticket`, `create_ticket`, `resolve_ticket` |

This means the agent can handle multi-domain instructions such as:

- find a contact, inspect their profile, then send a message
- look up a template, then create a broadcast using it
- find a contact by number, then assign their conversation and add/remove tags

---

## Architecture

```
User input (CLI)
    │
    ▼
index.ts — readline REPL, handles /reset /exit, pause/resume main loop
    │
    ▼
agent.ts — runTurn()
  ├─ empty input detection → skip
  ├─ dry-run detection (detectDryRun)
  ├─ Anthropic API (claude-haiku-4-5 + tool_use)
  └─ tool-use loop (up to 6 rounds)
        │
        ▼
tools/index.ts — ALL_TOOLS (schema) + TOOL_EXECUTORS (dispatch)
        │
        ├─ read operation executor → query directly, return formatted string
        └─ write operation executor
              ├─ dryRun=true → print [preview], return description string
              └─ dryRun=false → CLI confirmation (y/n) → execute
                      │
                      ▼
              wati/mock.ts  ←→  (swap)  wati/client.ts
              (local mock data)         (live WATI HTTP API)
```

State management is intentionally lightweight:

- Conversation history is stored in memory for the current CLI session
- `/reset` clears the session history
- There is no database or cross-session persistence in this MVP

---

## Switching Between Mock and Live API

Set a single line in `.env` to switch:

```bash
WATI_MOCK=false   # use the live WATI HTTP API
WATI_MOCK=true    # use local mock (default)
```

The switching logic is centralized in `src/wati/index.ts`. All tool files import from this entry point, so no tool code needs to be modified when switching.

---

## Assignment Mapping

How this implementation maps to the assignment requirements:

- Natural-language to API plan: implemented through Anthropic tool use plus a multi-step execution loop in `src/agent.ts`
- Multi-domain orchestration: supported across contacts, tags, messages, templates, broadcasts, and tickets
- LLM integration: implemented with Claude Haiku 4.5
- Real API or realistic mock: both are supported through a shared interface in `src/wati/index.ts`
- Safe UX: implemented via plan explanation, dry-run detection, and confirmation before write operations

Partially covered items:

- Missing-parameter handling mostly relies on the model asking clarifying questions, rather than custom validation code per tool
- API failure handling is implemented as readable executor / HTTP error messages, but not yet normalized into a richer recovery UX
- Partial execution is safe in the sense that each write is confirmed, but there is no rollback mechanism if a later step fails

Explicit non-goals for this submission:

- Full production-grade WATI coverage
- Persistent conversational memory
- Batch progress reporting, rate limiting, and retry orchestration

---

## Problem Framing

The core problem this project solves is: **how do you let non-technical users operate the WATI WhatsApp API through natural language, while keeping write operations safe and predictable?**

The MVP scope is defined as:
- Support WATI's core business objects (contacts, messages, templates, broadcasts, tickets)
- A complete agentic loop (LLM → tool call → result feedback → re-reasoning)
- Write operation safety gates (CLI confirmation + dry-run preview)
- A mock layer so development works without real API credentials

Features beyond MVP scope (Web UI, rollback, paginated browsing, bulk operation progress) are deferred to V2.

---

## Safety and UX Choices

- Read operations execute directly so the user gets fast answers for lookup workflows
- Write operations require an explicit `y/n` CLI confirmation in the executor layer
- If the user includes `preview` or `dry-run`, every write tool returns a preview instead of executing
- The system prompt tells the model to explain its plan before taking action
- The tool-use loop is capped at 6 iterations so the agent cannot recurse indefinitely
- Live HTTP errors and mock-layer failures are surfaced back as readable tool results

---

## AI/LLM Usage

**Why claude-haiku-4-5 with tool use?**

| Approach                                             | Pros                                                                               | Cons                                                  |
|------------------------------------------------------|------------------------------------------------------------------------------------|-------------------------------------------------------|
| Prompt parsing (regex / JSON parsing of user intent) | No SDK dependency                                                                  | Brittle — ambiguous instructions are easy to misparse |
| Function calling / tool use                          | LLM handles intent parsing and parameter extraction; structured output is reliable | Requires an API                                       |

Tool use lets the LLM emit structured tool calls with parameters directly, eliminating the fragility of hand-written intent parsers. claude-haiku-4-5 outperforms Sonnet on speed and cost, and is more than sufficient for this class of CRUD operations.

The agentic loop (up to 6 rounds) supports multi-step reasoning: query the contact list first, then decide which message to send based on the result — without requiring the user to manually break the task into steps.

---

## Build Notes

**Time allocation**
- Data types & mock layer: 20%
- Tool schema design: 15%
- Agentic loop core: 20%
- Executor implementation: 25%
- Error handling & interaction polish (confirmation, dry-run): 15%
- README: 5%

**What we intentionally skipped**
- **Web UI**: The CLI is sufficient to validate the agentic workflow; a UI is a separate engineering effort
- **Rollback**: Write operations have no transactional semantics and the API layer doesn't support it; the confirmation gate handles this defensively upfront
- **Paginated browsing**: Users can specify a `page` parameter through natural language — no dedicated UI needed
- **Concurrency rate limiting**: Not needed for the mock layer; can be added at the axios interceptor level in the real client
- **Persistent memory**: Session history lives in memory only; durable memory would require a storage layer and retrieval strategy

**V2 Roadmap**
- Harden and validate the real WATI API integration end-to-end against tenant credentials
- Streaming output to reduce perceived latency
- Session persistence (store history in SQLite)
- Multi-tenant support (switch between multiple WATI accounts)

---

## Trade-offs

**1. Tool use instead of JSON parsing**

We chose Anthropic tool use rather than having the LLM output raw JSON and parsing it manually. Reason: tool use has format correctness guaranteed by the SDK, and when parameters are missing the LLM will proactively ask for them rather than silently failing. The trade-off is a hard dependency on the Anthropic API, which is acceptable for this use case.

**2. Mock and client layers share identical signatures, switched centrally via index.ts**

`mock.ts` and `client.ts` export exactly the same function signatures. `wati/index.ts` reads the `WATI_MOCK` environment variable to decide which layer to use — switching requires changing a single line in `.env`. The trade-off is that the mock layer must be kept in sync with the client interface, but the payoff is zero API costs during development, stable tests, and a CI pipeline with no external dependencies.

**3. Confirmation logic lives in the executor layer, not the agent layer**

Write operation confirmation is handled inside each executor (rather than being intercepted centrally in `agent.ts`). This allows each tool to customize the wording of its operation summary, making it more specific — "Send message to 8613800138001: 'Hello'" is clearer than a generic "A write operation will be performed." The trade-off is that every write executor must import `promptConfirm`, but the logic itself is centralized in `utils.ts` with no duplication.

---

## Deliverables

- Working demo repository: this project
- Demo recording: to be submitted separately as a short 3-5 minute walkthrough
- Short write-up: included in this README via Problem Framing, Architecture, AI/LLM Usage, Build Notes, and Trade-offs
