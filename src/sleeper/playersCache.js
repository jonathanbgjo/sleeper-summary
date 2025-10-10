import fs from "fs/promises";
import path from "path";
import { CONFIG } from "../config.js";
import { getPlayers } from "./api.js";

export async function loadPlayersCache() {
  const file = path.join(process.cwd(), CONFIG.PLAYERS_CACHE_FILE);
  try {
    const stat = await fs.stat(file);
    const hours = (Date.now() - stat.mtimeMs) / 36e5;
    if (hours < CONFIG.PLAYERS_CACHE_MAX_AGE_HOURS) {
      return JSON.parse(await fs.readFile(file, "utf8"));
    }
  } catch {}
  const data = await getPlayers();
  await fs.writeFile(file, JSON.stringify(data));
  return data;
}

export function playerName(players, pid) {
  const p = players[pid];
  if (!p) return pid;
  if (p.full_name) return p.full_name;
  if (p.first_name && p.last_name) return `${p.first_name} ${p.last_name}`;
  return p?.metadata?.short_name || pid;
}
