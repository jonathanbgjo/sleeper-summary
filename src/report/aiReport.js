import { aiSummarize } from "../ai/provider.js";

const DEFAULT_TONE = process.env.AI_TONE || "snarky";

function buildSystem(tone) {
  return [
    "You are a witty, sports-savvy fantasy football columnist.",
    "Write a concise, funny weekly recap for a Sleeper league.",
    "Use tasteful humor. No profanity or personal attacks.",
    "Prefer 5–10 short paragraphs with punchy lines and bolded highlights.",
    "Highlight: Manager of the Week, Biggest Blowout, Heartbreaker, Bench Oops, Trade Fallout, Waiver Gem.",
    `Tone: ${tone}. Use Markdown with **bold** section labels.`,
  ].join(" ");
}

function buildUserPayload(data) {
  return [
    "Here is the week's data in JSON:",
    "```json",
    JSON.stringify(data),
    "```",
    "",
    "INSTRUCTIONS:",
    "- Identify notable performances (team & player).",
    "- If a traded player had a big game for the new team, call it out as **Trade Fallout**.",
    "- If someone benched a high-scorer (>10 pts over a starter), call it **Bench Oops** (be kind).",
    "- Name **Manager of the Week** (highest score or upset).",
    "- End with a one-line teaser for next week.",
    "",
    "OUTPUT: Markdown only.",
  ].join("\n");
}

export async function generateAIReport(jsonData, { tone = DEFAULT_TONE } = {}) {
  const system = buildSystem(tone);
  const user   = buildUserPayload(jsonData);
  const { text } = await aiSummarize({ system, user });
  return text;
}
