// ============================================================
// CLI entry point
// Starts a readline REPL that feeds user input into the agent.
// ============================================================

import * as readline from "readline";
import * as dotenv from "dotenv";
import { runTurn, resetConversation, isAgentRunning } from "./agent";
import { setConfirmHandler } from "./utils";

dotenv.config();

// ANSI colour helpers (safe to use in any modern terminal)
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";

function printBanner(): void {
  console.log(`
${BOLD}${CYAN}╔══════════════════════════════════════╗
║          WATI Agent (Claude)         ║
╚══════════════════════════════════════╝${RESET}
Type a natural-language instruction and press Enter.
Special commands:
  ${YELLOW}/reset${RESET}  — clear conversation history
  ${YELLOW}/exit${RESET}   — quit
`);
}

/**
 * Main readline loop.
 * Reads user input, sends it to the agent, and prints the response.
 */
async function main(): Promise<void> {
  printBanner();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${GREEN}you>${RESET} `,
  });

  setConfirmHandler((description) => {
    return new Promise<boolean>((resolve) => {
      rl.resume();
      rl.question(`\nAbout to execute: ${description}. Confirm? (y/n) `, (answer) => {
        rl.pause();
        resolve(answer.trim().toLowerCase() === "y");
      });
    });
  });

  rl.prompt();

  rl.on("line", async (line) => {
    // Ignore any accidental extra input while a turn is still in flight.
    if (isAgentRunning()) return;

    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    // Handle special slash commands
    if (input === "/exit" || input === "/quit") {
      console.log("Goodbye!");
      rl.close();
      process.exit(0);
    }

    if (input === "/reset") {
      resetConversation();
      console.log(`${YELLOW}[Conversation history cleared.]${RESET}`);
      rl.prompt();
      return;
    }

    // Pause readline while the agent is thinking
    rl.pause();

    try {
      const response = await runTurn(input);
      // runTurn returns "" to signal silent skip (empty input or API error already printed)
      if (response) {
        process.stdout.write(`${CYAN}agent>${RESET} `);
        console.log(response);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${RED}[Error] ${message}${RESET}`);
    }

    console.log(); // blank line for readability
    rl.resume();
    rl.prompt();
  });

  rl.on("close", () => {
    console.log("\nGoodbye!");
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
