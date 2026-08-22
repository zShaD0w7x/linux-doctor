/**
 * Optional AI summary. Only used when the user passes --ai and LLM_API_KEY
 * is set. If anything fails, the tool silently falls back to the plain
 * report — the AI is a nice extra, never a dependency.
 *
 * `premium` (Pro) uses a deeper prompt: prioritized action plan, per-finding
 * fixes pulled from the findings' own fix field, and a confidence note.
 */
export async function aiSummary(findings, { premium = false } = {}) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;

  const baseUrl = (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.LLM_MODEL || "gpt-4o-mini";

  const list = findings
    .map((f, i) => `${i + 1}. [${f.severity}] ${f.title}: ${f.detail || ""}`)
    .join("\n");

  const prompt = premium
    ? `You are the plain-English voice of a Linux health checker, speaking to a Pro user who wants action, not just a summary. In 5-8 sentences of clear American English: (1) lead with the single most important problem and its urgency; (2) group related findings; (3) give the top 3 concrete commands to run, in order, taking them from the "fix" field of the findings when present; (4) end with what to watch for next. Do not invent facts or commands that are not in the findings. If nothing serious was found, say the system looks healthy and name one optional thing to check.\n\nFINDINGS:\n${list || "No findings."}`
    : `You are the plain-English voice of a Linux health checker. Summarize the findings below in 3-6 sentences of clear American English for a normal user (not a sysadmin). Lead with the most important issue, say how urgent it is, and end with one concrete recommended next step. Do not invent facts. If nothing serious was found, say the system looks healthy.\n\nFINDINGS:\n${list || "No findings."}`;

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.3, max_tokens: premium ? 700 : 400 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  } catch {
    return null;
  }
}
