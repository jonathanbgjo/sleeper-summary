// src/notify/discord.js
import { CONFIG } from "../config.js";

export async function postToDiscord(markdown, meta = {}) {
  const url = CONFIG.DISCORD_WEBHOOK_URL;
  if (!url) {
    console.warn("[warn] Skipping Discord post: DISCORD_WEBHOOK_URL is missing");
    return { posted: false, reason: "missing_webhook" };
  }
  const base = url.includes("?") ? `${url}&wait=true` : `${url}?wait=true`;

  // Break into safe chunks
  const MAX = 1900;
  const chunks = [];
  let remaining = markdown || "";
  while (remaining.length) {
    chunks.push(remaining.slice(0, MAX));
    remaining = remaining.slice(MAX);
  }
  if (chunks.length === 0) chunks.push("(empty report)");

  // Optional header notice (e.g., quota exceeded)
  const header = meta?.notice ? `> _${meta.notice}_\n\n` : "";

  // Send a ping first so you see the job is alive
  const ping = await fetch(base, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: "🔔 Posting weekly report…" }),
  });
  console.log("[discord] ping status:", ping.status);

  for (let i = 0; i < chunks.length; i++) {
    const res = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: header + chunks[i] }),
    });
    const text = await res.text();
    console.log(`[discord] chunk ${i + 1}/${chunks.length} status:`, res.status, "body:", text.slice(0, 200));
    if (!res.ok) return { posted: false, reason: "chunk_failed", index: i, status: res.status, body: text };
  }
  return { posted: true };
}
