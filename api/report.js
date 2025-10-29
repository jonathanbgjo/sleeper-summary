// api/report.js
import { generateReport } from "../src/report/generate.js";

export default async function handler(req, res) {
  try {
    const { leagueId, week, require_ai } = req.query || {};
    const out = await generateReport(
      week ? Number(week) : undefined,
      leagueId || undefined,
      { requireAI: require_ai === "true" } // optional strict mode
    );
    res.status(200).json(out);
  } catch (e) {
    res.status(500).json({ error: e?.message || "failed to generate report" });
  }
}
