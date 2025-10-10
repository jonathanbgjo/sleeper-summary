// src/notify/discord.js
import { CONFIG } from "../config.js";

export async function postToDiscord(markdown, meta = {}) {
  if (!CONFIG.DISCORD_WEBHOOK_URL) return { posted: false, reason: "missing_webhook" };

  const chunks = markdown.match(/[\s\S]{1,1900}/g) || [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const header = meta?.notice ? `> _${meta.notice}_\n\n` : "";
    const payload = { content: header + chunk };

    const res = await fetch(CONFIG.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    console.log(`[discord] chunk ${i + 1}/${chunks.length} status:`, res.status);
  }

  return { posted: true };
}
