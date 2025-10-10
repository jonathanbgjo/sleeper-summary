// src/index.js
import { generateReport } from "./report/generate.js";
import { postToDiscord } from "./notify/discord.js";
import { CONFIG } from "./config.js";

function parseWeekArg() {
  const i = process.argv.indexOf("--week");
  if (i !== -1) {
    const v = Number(process.argv[i + 1]);
    if (!Number.isNaN(v)) return v;
  }
  const last = Number(process.argv[process.argv.length - 1]);
  return Number.isFinite(last) ? last : undefined;
}

(async () => {
  try {
    console.log("[boot] LEAGUE_ID:", CONFIG.LEAGUE_ID);
    console.log("[boot] WEBHOOK set?:", !!CONFIG.DISCORD_WEBHOOK_URL);
    console.log("[boot] AI_KEY set?:", !!process.env.OPENAI_API_KEY);

    const weekOverride = parseWeekArg();

    const { file, markdown, week, leagueName, quotaHit } = await generateReport(weekOverride);

    console.log(`[report] Generated ${file} for ${leagueName} (week ${week})`);
    console.log("[report] Markdown length:", markdown?.length ?? 0);

    const meta = quotaHit ? { notice: "AI quota exceeded — using witty lite summary" } : undefined;
    const res = await postToDiscord(markdown, meta);
    console.log("[report] postToDiscord result:", res);
  } catch (e) {
    console.error("[fatal]", e);
    process.exit(1);
  }
})();
