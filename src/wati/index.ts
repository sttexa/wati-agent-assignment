// ============================================================
// WATI client selector
// Default: mock (safe for development / testing).
// Set WATI_MOCK=false in .env to switch to the real HTTP client.
// ============================================================

import * as dotenv from "dotenv";
dotenv.config({ override: true });

import * as mock from "./mock";
import * as client from "./client";

const useMock = process.env.WATI_MOCK !== "false";
process.stderr.write(
  useMock
    ? "[WATI] Mock mode (set WATI_MOCK=false to use the real API)\n"
    : "[WATI] Live API mode\n"
);

const impl = useMock ? mock : client;

export const {
  getContacts,
  getContact,
  upsertContact,
  updateContactParams,
  getTags,
  addTagToContact,
  removeTagFromContact,
  getMessages,
  sendTextMessage,
  sendTemplateMessage,
  getTemplates,
  getBroadcasts,
  createBroadcast,
  getOperators,
  getTickets,
  assignTicket,
  resolveTicket,
  createTicket,
} = impl;
