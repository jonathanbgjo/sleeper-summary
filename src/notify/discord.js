// src/notify/discord.js
import { CONFIG } from "../config.js";

/** Parse markdown into sections using H2 headers (## Heading) */
function parseSections(md) {
  const sections = {};
  let current = "Overview";
  sections[current] = [];
  const lines = (md || "").split(/\r?\n/);

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.*)\s*$/);
    if (h2) {
      current = h2[1].trim();
      if (!sections[current]) sections[current] = [];
    } else {
      sections[current] ??= [];
      sections[current].push(line);
    }
  }
  for (const k of Object.keys(sections)) sections[k] = sections[k].join("\n").trim();
  return sections;
}

/** Discord limits */
const LIMITS = {
  EMBEDS_PER_MESSAGE: 10,
  EMBED_DESC: 4096,
  FIELD_NAME: 256,
  FIELD_VALUE: 1024,
  FIELDS_PER_EMBED: 25,
};

const cut = (s, n) => (!s ? "" : s.length <= n ? s : s.slice(0, n - 1) + "…");

function makeEmbed({ title, description, fields, color = 0x5865f2 }) {
  const embed = { title: cut(title, 256), color };
  if (description) embed.description = cut(description, LIMITS.EMBED_DESC);
  if (fields?.length) {
    embed.fields = fields.map(({ name, value, inline }) => ({
      name: cut(name || " ", LIMITS.FIELD_NAME),
      value: cut(value || " ", LIMITS.FIELD_VALUE),
      inline: !!inline,
    }));
  }
  return embed;
}

function splitToFields(namePrefix, body, inline = false) {
  if (!body?.trim()) return [];
  const paras = body.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
  const fields = [];
  let i = 1;
  for (const p of paras) {
    if (p.length > LIMITS.FIELD_VALUE) {
      // hard-split long paragraphs
      let start = 0;
      while (start < p.length) {
        fields.push({ name: `${namePrefix} ${i++}`, value: p.slice(start, start + LIMITS.FIELD_VALUE), inline });
        start += LIMITS.FIELD_VALUE;
      }
    } else {
      fields.push({ name: `${namePrefix} ${i++}`, value: p, inline });
    }
  }
  return fields;
}

/**
 * Post the report as embeds (split by sections). Optional meta.notice adds a banner line.
 * Falls back to plain text if embeds fail.
 */
export async function postReportEmbeds(markdown, meta = {}) {
  const url = CONFIG.DISCORD_WEBHOOK_URL;
  if (!url) {
    console.warn("[warn] Skipping Discord post: DISCORD_WEBHOOK_URL is missing");
    return { posted: false, reason: "missing_webhook" };
  }
  const base = url.includes("?") ? `${url}&wait=true` : `${url}?wait=true`;

  const sections = parseSections(markdown);
  const embeds = [];

  // 1) Overview
  const overview = sections["League Overview"] || sections["Overview"] || "";
  if (overview) embeds.push(makeEmbed({ title: "🏈 League Overview", description: overview }));

  // 2) Team-by-Team
  const teamBody = sections["Team-by-Team"] || sections["Team by Team"] || "";
  if (teamBody) {
    const teamFields = splitToFields("Team", teamBody, false);
    while (teamFields.length) {
      embeds.push(makeEmbed({ title: "👥 Team-by-Team", fields: teamFields.splice(0, LIMITS.FIELDS_PER_EMBED) }));
    }
  }

  // 3) Trade Analyzer
  const trades = sections["Trade Analyzer"] || sections["Trades"] || "";
  if (trades) {
    const tradeFields = splitToFields("Trade", trades, false);
    if (tradeFields.length) {
      while (tradeFields.length) {
        embeds.push(makeEmbed({ title: "🔄 Trade Analyzer", fields: tradeFields.splice(0, LIMITS.FIELDS_PER_EMBED), color: 0xf59e0b }));
      }
    } else {
      embeds.push(makeEmbed({ title: "🔄 Trade Analyzer", description: trades, color: 0xf59e0b }));
    }
  }

  // 4) Waiver Gems
  const waivers = sections["Waiver Gems"] || sections["Waivers"] || "";
  if (waivers) {
    const waiverFields = splitToFields("Add", waivers, true);
    if (waiverFields.length) {
      while (waiverFields.length) {
        embeds.push(makeEmbed({ title: "💎 Waiver Gems", fields: waiverFields.splice(0, LIMITS.FIELDS_PER_EMBED), color: 0x10b981 }));
      }
    } else {
      embeds.push(makeEmbed({ title: "💎 Waiver Gems", description: waivers, color: 0x10b981 }));
    }
  }

  // 5) Power Rankings
  const power = sections["Power Rankings"] || sections["Power"] || "";
  if (power) embeds.push(makeEmbed({ title: "📊 Power Rankings", description: power, color: 0x3b82f6 }));

  // 6) Teaser / Next Week
  const teaser = sections["Teaser"] || sections["Next Week"] || "";
  if (teaser) embeds.push(makeEmbed({ title: "⏭️ Next Week", description: teaser, color: 0xa855f7 }));

  // If nothing parsed, send plain text
  if (!embeds.length) {
    const content = (meta?.notice ? `> _${meta.notice}_\n\n` : "") + (markdown || "(empty report)");
    const plain = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const text = await plain.text();
    return { posted: plain.ok, mode: "plain", status: plain.status, body: text.slice(0, 200) };
  }

  // Optional header line above first embed
  const noticeContent = meta?.notice ? `> _${meta.notice}_` : undefined;

  // Post in batches of up to 10 embeds per message
  let sent = 0;
  for (let i = 0; i < embeds.length; i += LIMITS.EMBEDS_PER_MESSAGE) {
    const batch = embeds.slice(i, i + LIMITS.EMBEDS_PER_MESSAGE);
    const res = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "supDawg Reports",
        content: i === 0 ? noticeContent : undefined,
        embeds: batch,
      }),
    });
    const txt = await res.text();
    if (!res.ok) {
      console.error("[discord] embed post failed:", res.status, txt.slice(0, 500));
      // Fallback to plain text for this batch
      const fallback = await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content:
            (noticeContent ? noticeContent + "\n\n" : "") +
            batch.map(b => `**${b.title || ""}**\n${b.description || ""}`).join("\n\n"),
        }),
      });
      const ftxt = await fallback.text();
      if (!fallback.ok) {
        return { posted: false, mode: "fallback-failed", status: fallback.status, body: ftxt.slice(0, 200) };
      }
    } else {
      sent += batch.length;
    }
  }

  return { posted: true, mode: "embeds", embeds_sent: sent };
}
