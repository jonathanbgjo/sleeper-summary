// src/sleeper/playersCache.js
import fs from "fs/promises";

const IS_SERVERLESS = !!process.env.VERCEL || !!process.env.AWS_REGION;
const TMP_PATH = "/tmp/players.json";
const BUNDLED_URL = new URL("../../players.json", import.meta.url); // adjust if your file lives elsewhere

let MEM_CACHE = null; // survives warm invocations

async function fileExists(path) {
  try { await fs.access(path); return true; } catch { return false; }
}

async function readJsonMaybe(urlOrPath) {
  try {
    if (typeof urlOrPath === "string") {
      const raw = await fs.readFile(urlOrPath, "utf-8");
      return JSON.parse(raw);
    } else {
      // URL object (bundled file)
      const raw = await fs.readFile(urlOrPath, "utf-8");
      return JSON.parse(raw);
    }
  } catch { return null; }
}

async function fetchSleeperPlayers() {
  const res = await fetch("https://api.sleeper.app/v1/players/nfl");
  if (!res.ok) throw new Error("failed to fetch players from Sleeper");
  return await res.json();
}

/**
 * Load players cache safely on serverless:
 * 1) in-memory (warm)
 * 2) /tmp/players.json
 * 3) bundled players.json in repo (read-only)
 * 4) live fetch from Sleeper -> write /tmp for this invocation
 */
export async function loadPlayersCache() {
  if (MEM_CACHE) return MEM_CACHE;

  // Try /tmp (only on serverless)
  if (IS_SERVERLESS && await fileExists(TMP_PATH)) {
    const j = await readJsonMaybe(TMP_PATH);
    if (j) { MEM_CACHE = j; return MEM_CACHE; }
  }

  // Try bundled file in repo (read-only)
  const bundled = await readJsonMaybe(BUNDLED_URL);
  if (bundled) {
    MEM_CACHE = bundled;
    // Optionally mirror to /tmp for faster future cold starts
    if (IS_SERVERLESS) {
      try { await fs.writeFile(TMP_PATH, JSON.stringify(bundled)); } catch {}
    }
    return MEM_CACHE;
  }

  // Last resort: live fetch from Sleeper
  const live = await fetchSleeperPlayers();
  MEM_CACHE = live;
  if (IS_SERVERLESS) {
    try { await fs.writeFile(TMP_PATH, JSON.stringify(live)); } catch {}
  }
  return MEM_CACHE;
}

export function playerName(players, pid) {
  if (!pid || !players) return `Player ${pid || "?"}`;
  const p = players[pid];
  if (!p) return `Player ${pid}`;
  // Sleeper fields: full_name OR first_name/last_name OR metadata
  return p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.search_full_name || `Player ${pid}`;
}
