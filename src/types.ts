// ============================================================
// Shared type definitions used across the agent
// ============================================================

// ----- WATI core entities -----

export interface Contact {
  id: string;
  whatsappNumber: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  phone?: string;
  email?: string;
  tags?: string[];
  customParams?: CustomParam[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomParam {
  name: string;
  value: string;
}

export interface Tag {
  id: string;
  name: string;
}

export interface Message {
  id: string;
  whatsappMessageId?: string;
  conversationId?: string;
  type: string;       // text | image | document | template | ...
  data?: string;
  text?: string;
  timestamp: string;
  statusString?: string;
  localMessageId?: string;
  owner: boolean;     // true = sent by agent/operator, false = received from contact
}

export interface Template {
  id: string;
  elementName: string;
  body?: string;
  templateType?: string;
  status?: string;
  category?: string;
  language?: string;
}

export interface Broadcast {
  id: string;
  name: string;
  templateName?: string;
  segmentName?: string;
  status?: string;
  scheduledTime?: string;
  createdAt?: string;
}

export interface Operator {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

export interface Ticket {
  id: string;
  contactId?: string;
  assignedOperatorId?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ----- Agent / LLM types -----

/**
 * A single turn in the conversation history passed to the LLM.
 * Mirrors Anthropic's MessageParam shape for convenience.
 */
export interface ConversationTurn {
  role: "user" | "assistant";
  content: string | ToolUseBlock[];
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

// ----- WATI API response wrappers -----

export interface WatiListResponse<T> {
  result: T[];
  page: number;
  pageSize: number;
  totalPages: number;
  count: number;
}

export interface WatiResponse<T> {
  result: T;
  message?: string;
}
