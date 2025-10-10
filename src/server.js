// src/server.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { generateReport } from "./report/generate.js";
import { CONFIG } from "./config.js";
import { getState } from "./sleeper/api.js"; // or ../util/api.js if that's your path

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Serve the UI in /public
app.use(express.static(path.join(__dirname, "..", "public")));

// Current NFL week (used to cap the dropdown)
app.get("/api/state", async (_req, res) => {
  try {
    const s = await getState();
    // Sleeper returns { week, display_week, season_type, season }
    res.json({
      week: s?.week ?? null,
      display_week: s?.display_week ?? s?.week ?? null,
      season_type: s?.season_type ?? null,
      season: s?.season ?? null,
      defaultLeagueId: CONFIG.LEAGUE_ID || null,
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || "failed to fetch state" });
  }
});

// Generate a report (AI if available, otherwise your witty fallback)
app.get("/api/report", async (req, res) => {
  try {
    const leagueId = req.query.leagueId || CONFIG.LEAGUE_ID;
    const week = req.query.week ? Number(req.query.week) : undefined;
    if (!leagueId) return res.status(400).json({ error: "leagueId is required" });

    const out = await generateReport(week, leagueId);
    // out = { file, markdown, week, leagueName, quotaHit, usedAI?, aiReason? } depending on your current version
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e?.message || "failed to generate report" });
  }
});

// Start server
const PORT = process.env.PORT || 5173;
app.listen(PORT, () => {
  console.log(`UI available → http://localhost:${PORT}`);
});
