// api/discord.js
import { generateReport } from "../src/report/generate.js";
import { postReportEmbeds } from "../src/notify/discord.js";

export default async function handler(req, res) {
  try {
    const { leagueId, week, require_ai } = req.query || {};
    const out = await generateReport(
      week ? Number(week) : undefined,
      leagueId || undefined,
      { requireAI: require_ai === "true" }
    );

    const meta = out.quotaHit
      ? { notice: "AI quota exceeded — using witty lite summary" }
      : undefined;

    const postRes = await postReportEmbeds(out.markdown, meta);
    res.status(200).json({ ok: true, posted: postRes, report: out });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || "discord post failed" });
  }
}
