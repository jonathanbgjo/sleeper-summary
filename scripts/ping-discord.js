import dotenv from "dotenv";
dotenv.config();
const url = process.env.DISCORD_WEBHOOK_URL;
if (!url) {
  console.error("Missing DISCORD_WEBHOOK_URL in .env");
  process.exit(1);
}
const base = url.includes("?") ? `${url}&wait=true` : `${url}?wait=true`;

const res = await fetch(base, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ content: "🔔 Webhook ping: hello from supDawg" }),
});
const body = await res.text();
console.log("status:", res.status);
console.log("body:", body);
