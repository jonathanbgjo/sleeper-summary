// api/state.js
import { getState } from "../src/sleeper/api.js";
import { CONFIG } from "../src/config.js";

export default async function handler(req, res) {
  try {
    const s = await getState();
    res.status(200).json({
      week: s?.week ?? null,
      display_week: s?.display_week ?? s?.week ?? null,
      season_type: s?.season_type ?? null,
      season: s?.season ?? null,
      defaultLeagueId: CONFIG.LEAGUE_ID || null,
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || "failed to fetch state" });
  }
}
