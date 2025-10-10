// src/ai/provider.js
import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;
const model  = process.env.AI_MODEL || "gpt-4o-mini";
const maxTokens = Number(process.env.AI_MAX_TOKENS || 800);
const MAX_RETRIES = 2;

let client = null;
if (!apiKey) console.warn("[warn] OPENAI_API_KEY not set — AI summaries disabled");
else client = new OpenAI({ apiKey });

async function withRetries(fn) {
  let attempt = 0, lastErr;
  while (attempt <= MAX_RETRIES) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      const status = e?.status || e?.response?.status;
      const retryable = status === 429 || status === 500 || status === 503;
      if (!retryable || attempt === MAX_RETRIES) break;
      const delay = 750 * Math.pow(2, attempt); // 0.75s, 1.5s, 3s
      console.warn(`[ai] retrying after ${status}, backoff ${delay}ms (attempt ${attempt+1})`);
      await new Promise(r => setTimeout(r, delay));
      attempt++;
    }
  }
  throw lastErr;
}

export async function aiSummarize({ system, user }) {
  if (!client) return { text: "", error: "no_client" };

  // Try Responses API, with retries
  try {
    const res = await withRetries(() =>
      client.responses.create({
        model,
        input: [
          { role: "system", content: system },
          { role: "user",   content: user },
        ],
        max_output_tokens: maxTokens,
      })
    );
    const text = res.output_text ?? res.content?.[0]?.text ?? "";
    return { text: (text || "").trim() };
  } catch (e) {
    console.warn("[ai] responses.create failed:", e?.status, e?.message);
    if (e?.status === 429) return { text: "", error: "quota" };
  }

  // Fallback: Chat Completions (also retry)
  try {
    const res = await withRetries(() =>
      client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user",   content: user },
        ],
        temperature: 0.8,
      })
    );
    const text = res.choices?.[0]?.message?.content || "";
    return { text: text.trim() };
  } catch (e) {
    console.warn("[ai] chat.completions failed:", e?.status, e?.message);
    if (e?.status === 429) return { text: "", error: "quota" };
    return { text: "", error: "other" };
  }
}
