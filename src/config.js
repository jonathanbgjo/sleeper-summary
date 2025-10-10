import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ✅ project root is one level up from /src
const ROOT = path.resolve(__dirname, "..");

// Load .env explicitly from project root
dotenv.config({ path: path.join(ROOT, ".env") });

export const CONFIG = {
  API_BASE: "https://api.sleeper.app/v1",
  LEAGUE_ID: process.env.SLEEPER_LEAGUE_ID || "1257419979179966464",
  DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL || null,
  PLAYERS_CACHE_FILE: "players.json",
  PLAYERS_CACHE_MAX_AGE_HOURS: 24,
};

// Optional: keep the helpful warnings, now pointing to the correct path
if (!process.env.DISCORD_WEBHOOK_URL) {
  console.warn("[warn] DISCORD_WEBHOOK_URL not found in .env at", path.join(ROOT, ".env"));
}
if (!process.env.SLEEPER_LEAGUE_ID) {
  console.warn("[warn] SLEEPER_LEAGUE_ID not found in .env at", path.join(ROOT, ".env"));
}
