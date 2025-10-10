// src/report/aiReport.js
import { aiSummarize } from "../ai/provider.js";

const DEFAULT_TONE = process.env.AI_TONE || "snarky";

function buildSystem(tone) {
  return [
    "You are a witty, sports-savvy fantasy football columnist for a Sleeper league.",
    "Write a spicy, human recap that is fun but kind. No profanity or personal attacks.",
    "FORMAT: Markdown only.",
    "STYLE: Bold section headers, short punchy paragraphs, light jokes.",
    "REQUIREMENTS:",
    "1) **League Overview** – one paragraph with the big picture this week.",
    "2) **Team-by-Team** – one *distinct* 1–2 sentence snippet for EVERY team.",
    "   - Mention opponent, result, and at least one specific player (top starter or bench oops) when relevant.",
    "3) **Trade Analyzer** – for each trade in `tradeImpacts`, say who 'won' *this week* and why (name the players and points).",
    "4) **Waiver Gems** – call out any notable waiver adds with points.",
    "5) **Power Rankings (lite)** – top 3 teams this week based on `power.score`.",
    "6) **Teaser** – one line for next week.",
    `Tone: ${tone}. Avoid clichés and keep it tight.`,
  ].join(" ");
}

function buildUserPayload(data) {
  return [
    "DATA (JSON):",
    "```json",
    JSON.stringify(data),
    "```",
    "",
    "NOTES:",
    "- The `teams` array already includes each team’s weekly points, opponent, result, and best bench/top starter.",
    "- The `tradeImpacts` array pre-computes this-week points from acquired players for each side; use that to decide a 'winner' for the Trade Analyzer.",
    "- If a team tied, you can have fun with it, but keep it kind.",
    "- If data is missing for a section (e.g., no trades), include the header with a one-liner like 'No trades this week.'",
    "",
    "OUTPUT:",
    "- Markdown only; include **all required sections**.",
    "- One concise snippet per team under **Team-by-Team** (no team left out).",
  ].join("\n");
}

export async function generateAIReport(jsonData, { tone = DEFAULT_TONE } = {}) {
  const system = buildSystem(tone);
  const user   = buildUserPayload(jsonData);
  const { text } = await aiSummarize({ system, user });
  return text;
}
