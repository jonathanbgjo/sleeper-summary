// src/report/generate.js
import fs from "fs/promises";
import { CONFIG } from "../config.js";

// NOTE: If your files are under src/util/, change ../sleeper/... -> ../util/...
import {
  getState,
  getLeague,
  getLeagueUsers,
  getRosters,
  getMatchups,
  getTransactions,
} from "../sleeper/api.js";
import { loadPlayersCache, playerName } from "../sleeper/playersCache.js";

import { aiSummarize } from "../ai/provider.js";
const IS_VERCEL = !!process.env.VERCEL;
/* --------------------------- tiny numeric helpers -------------------------- */
const num = (v) => Number(v || 0);
const fmt = (n) => (typeof n === "number" ? n : 0).toFixed(2);

/* -------------------------- grouping & quick metrics ----------------------- */
function groupGames(matchups) {
  const games = new Map();
  for (const m of matchups) {
    games.set(m.matchup_id, [...(games.get(m.matchup_id) || []), m]);
  }
  return games;
}

function quickStandings(rosters, nameOf) {
  return rosters
    .map((r) => ({
      name: nameOf(r.roster_id),
      w: r.settings?.wins ?? 0,
      l: r.settings?.losses ?? 0,
      pf: num(r.settings?.fpts) + num(r.settings?.fpts_decimal) / 100,
    }))
    .sort((a, b) => b.w - a.w || b.pf - a.pf);
}

function quickHighlights(matchups, nameOf) {
  const games = groupGames(matchups);
  let topTeam = { name: "", pts: -1 };
  let blowout = null;

  for (const [, teams] of games) {
    if (teams.length !== 2) continue;
    const [a, b] = teams;

    for (const t of teams) {
      const pts = num(t.points);
      if (pts > topTeam.pts) topTeam = { name: nameOf(t.roster_id), pts };
    }

    const margin = Math.abs(num(a.points) - num(b.points));
    const aName = nameOf(a.roster_id);
    const bName = nameOf(b.roster_id);
    if (!blowout || margin > blowout.margin) {
      const winner = num(a.points) >= num(b.points) ? aName : bName;
      const loser = num(a.points) >= num(b.points) ? bName : aName;
      blowout = { winner, loser, margin };
    }
  }
  return { topTeam, blowout, games };
}

/* --------------------------- witty lite (no LLM) --------------------------- */
function wittyLiteSummary({ leagueName, week, matchups, nameOf }) {
  const { topTeam, blowout, games } = quickHighlights(matchups, nameOf);
  const lines = [];

  lines.push(
    `**Manager of the Week:** ${topTeam.name} (${fmt(
      topTeam.pts
    )} pts) — somewhere an analyst just quietly deleted a projection model.`
  );

  if (blowout) {
    lines.push(
      `**Biggest Blowout:** ${blowout.winner} flattened ${
        blowout.loser
      } by ${fmt(blowout.margin)} — thoughts and prayers.`
    );
  }

  // Light bench roast (≥10 pts over lowest starter)
  for (const [, teams] of games) {
    if (teams.length !== 2) continue;
    for (const t of teams) {
      const starters = t.starters || [];
      const ptsMap = t.players_points || {};
      if (!starters.length) continue;
      const minStarter = Math.min(...starters.map((p) => num(ptsMap[p])));
      const bench = (t.players || []).filter((p) => !starters.includes(p));
      const bestBench =
        bench.map((p) => num(ptsMap[p])).sort((x, y) => y - x)[0] || 0;
      if (bestBench - minStarter >= 10) {
        lines.push(
          `**Bench Oops:** ${nameOf(t.roster_id)} left ${fmt(
            bestBench
          )} on the bench. That one stings.`
        );
        break;
      }
    }
  }

  lines.push(`**Teaser:** Next week’s slate looks spicy. Bench responsibly.`);

  return `# ${leagueName} – Week ${week} Recap (Lite)\n\n` + lines.join("\n");
}

/* ------------------------------ plain fallback ----------------------------- */
function fallbackMarkdown({ leagueName, week, rosters, matchups, nameOf }) {
  const { topTeam, blowout } = quickHighlights(matchups, nameOf);
  const table = quickStandings(rosters, nameOf);

  let md = `# ${leagueName} – Week ${week} Recap (Fallback)\n\n`;
  md += `**Team of the Week:** ${topTeam.name} (${fmt(topTeam.pts)} pts)\n`;
  if (blowout)
    md += `**Biggest Blowout:** ${blowout.winner} over ${
      blowout.loser
    } by ${fmt(blowout.margin)} pts\n`;
  md += `\n## Standings\n`;
  for (const t of table) md += `- ${t.name}: ${t.w}-${t.l} (PF ${fmt(t.pf)})\n`;
  return md;
}

/* ----------------------- compact serializer for the LLM -------------------- */
function serializeWeek({
  week,
  leagueName,
  rosters,
  matchups,
  transactions,
  nameOfRoster,
  nameOfPlayer,
}) {
  const byRosterId = new Map(rosters.map((r) => [r.roster_id, r]));
  const userNameOf = (rid) => {
    const r = byRosterId.get(rid);
    return r ? nameOfRoster(rid) : `Team ${rid}`;
  };

  const games = groupGames(matchups);
  const matchList = [];

  for (const [, teams] of games) {
    if (teams.length !== 2) continue;
    const [a, b] = teams;

    const norm = (t) => ({
      team: userNameOf(t.roster_id),
      points: num(t.points),
      starters: (t.starters || []).map((pid) => ({
        id: pid,
        name: nameOfPlayer(pid),
        pts: num(t.players_points?.[pid]),
      })),
      bench: (t.players || [])
        .filter((p) => !(t.starters || []).includes(p))
        .map((pid) => ({
          id: pid,
          name: nameOfPlayer(pid),
          pts: num(t.players_points?.[pid]),
        })),
    });

    matchList.push({ a: norm(a), b: norm(b) });
  }

  const standings = rosters
    .map((r) => ({
      team: nameOfRoster(r.roster_id),
      w: r.settings?.wins ?? 0,
      l: r.settings?.losses ?? 0,
      pf: num(r.settings?.fpts) + num(r.settings?.fpts_decimal) / 100,
    }))
    .sort((x, y) => y.w - x.w || y.pf - x.pf);

  const trades = transactions
    .filter((t) => t.type === "trade" && t.status === "complete")
    .map((t) => {
      const adds = Object.entries(t.adds || {}).map(([pid, rid]) => ({
        to: userNameOf(rid),
        player: nameOfPlayer(pid),
        pid,
      }));
      return { between: (t.roster_ids || []).map(userNameOf), adds };
    });

  const waivers = transactions
    .filter((t) => t.type === "waiver" && t.status === "complete")
    .map((t) => {
      const pid = t.adds ? Object.keys(t.adds)[0] : null;
      const rid = t.adds ? Object.values(t.adds)[0] : null;
      return pid && rid
        ? { to: userNameOf(rid), player: nameOfPlayer(pid), pid }
        : null;
    })
    .filter(Boolean);

  return {
    league: leagueName,
    week,
    matchups: matchList,
    standings,
    trades,
    waivers,
  };
}

/* --------------------------------- PROMPTS --------------------------------- */
function buildSystem(tone) {
  return [
    "You are a witty, sports-savvy fantasy football columnist.",
    "Write a concise, funny weekly recap for a Sleeper league.",
    "Use tasteful humor. No profanity or personal attacks.",
    "Prefer 5–10 short paragraphs with punchy lines and bolded highlights.",
    "Highlight: Manager of the Week, Biggest Blowout, Heartbreaker, Bench Oops, Trade Fallout, Waiver Gem (when applicable).",
    `Tone: ${tone}. Use Markdown with **bold** section labels.`,
  ].join(" ");
}

function buildUser(data) {
  return [
    "Here is the week's data in JSON:",
    "```json",
    JSON.stringify(data),
    "```",
    "",
    "INSTRUCTIONS:",
    "- Identify notable performances (team & player).",
    "- If a traded player had a big game for the new team, call it **Trade Fallout**.",
    "- If someone benched a high-scorer (>10 pts over a starter), call it **Bench Oops** (be kind).",
    "- Name **Manager of the Week** (highest score or upset).",
    "- End with a one-line teaser for next week.",
    "",
    "OUTPUT: Markdown only.",
  ].join("\n");
}

/* ============================== MAIN ENTRYPOINT ============================ */
/**
 * @param {number|undefined} weekOverride
 * @returns {{file:string, markdown:string, week:number, leagueName:string}}
 */
export async function generateReport(
  weekOverride,
  leagueIdOverride,
  options = {}
) {
  const REQUIRE_AI =
    options.requireAI === true ||
    process.env.REQUIRE_AI === "true" ||
    (Array.isArray(process?.argv) && process.argv.includes("--require-ai"));
  // 1) Select week
  const state = await getState();
  const week = weekOverride ?? state.display_week ?? state.week;

  // 2) Pull data
  const leagueId = leagueIdOverride || CONFIG.LEAGUE_ID;
  const [league, users, rosters, matchups, txns, players] = await Promise.all([
    getLeague(leagueId),
    getLeagueUsers(leagueId),
    getRosters(leagueId),
    getMatchups(leagueId, week),
    getTransactions(leagueId, week),
    loadPlayersCache(),
  ]);

  // 3) Naming helpers
  const byRosterId = new Map(rosters.map((r) => [r.roster_id, r]));
  const userDisplay = new Map(
    users.map((u) => [
      u.user_id,
      u?.metadata?.team_name || u?.display_name || u?.username,
    ])
  );

  const nameOfRoster = (rid) => {
    const r = byRosterId.get(rid);
    return r ? userDisplay.get(r.owner_id) || `Team ${rid}` : `Team ${rid}`;
  };
  const nameOfPlayer = (pid) => playerName(players, pid);

  // 4) Prep data for AI
  const dataForAI = serializeWeek({
    week,
    leagueName: league.name,
    rosters,
    matchups,
    transactions: txns,
    nameOfRoster,
    nameOfPlayer,
  });

  // 5) Try AI → witty lite on quota → plain fallback otherwise
  let finalMarkdown = "";
  let usedAI = false;
  let quotaHit = false;
  let aiReason = "none";
  try {
    console.log(
      "[ai] model:",
      process.env.AI_MODEL || "gpt-4o-mini",
      "tone:",
      process.env.AI_TONE || "snarky",
      "max:",
      process.env.AI_MAX_TOKENS || "800"
    );

    const { text, error } = await aiSummarize({
      system: buildSystem(process.env.AI_TONE || "snarky"),
      user: buildUser(dataForAI),
    });

    if (error === "quota") {
      quotaHit = true;
      aiReason = "quota";
      console.warn("[ai] quota exceeded — using witty lite summary");
    } else if (error) {
      aiReason = String(error);
    }

    if (text && text.trim().length > 50) {
      finalMarkdown = text.trim();
      usedAI = true;
      console.log("[ai] received length:", finalMarkdown.length);
    } else {
      if (aiReason === "none") aiReason = "empty";
    }
  } catch (e) {
    console.warn("[ai] generation failed:", e?.message || e);
    aiReason = e?.message || "exception";
    console.warn("[ai] generation failed:", aiReason);
  }

  if (!usedAI) {
    if (REQUIRE_AI) {
      throw new Error(
        `[ai] REQUIRE_AI set — aborting because AI failed (reason: ${aiReason})`
      );
    }
    if (quotaHit) {
      finalMarkdown = wittyLiteSummary({
        leagueName: league.name,
        week,
        matchups,
        nameOf: nameOfRoster,
      });
    } else {
      finalMarkdown = fallbackMarkdown({
        leagueName: league.name,
        week,
        rosters,
        matchups,
        nameOf: nameOfRoster,
      });
    }
  }

  // 6) Write & return
  const file = `week_${week}_report.md`;
  try {
    if (IS_VERCEL) {
      // optional: write to /tmp if you really want a file during the request lifetime
      await fs.writeFile(`/tmp/${file}`, finalMarkdown);
    } else {
      await fs.writeFile(file, finalMarkdown);
    }
  } catch (e) {
    // don’t crash the API just because the write failed in serverless
    console.warn("[report] write skipped:", e?.message || e);
  }

  return {
    file,
    markdown: finalMarkdown,
    week,
    leagueName: league.name,
    quotaHit,
    usedAI,
    aiReason,
  };
}
