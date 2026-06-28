import { aiAssistSchema } from "@/lib/validation";
import { json, parseBody, requireUser, withErrors } from "@/lib/api";
import { env } from "@/lib/env";

const PROMPTS: Record<string, string> = {
  summarize: "Summarize the following document text in 2-3 concise sentences:",
  continue: "Continue writing the following text naturally, adding 1-2 sentences:",
  fix_grammar: "Fix grammar and spelling. Return only the corrected text:",
  improve: "Improve clarity and tone. Return only the rewritten text:",
};

// POST /api/ai — text assist (summarize / continue / fix grammar / improve).
// Provider-agnostic: uses an OpenAI-compatible Chat Completions endpoint (Groq
// by default). Degrades gracefully with a clear message if no key is set, so
// the app never hard-fails on the optional AI feature.
export const POST = withErrors(async (req) => {
  await requireUser();
  const { action, text } = await parseBody(req, aiAssistSchema);

  if (!env.AI_API_KEY) {
    return json(
      { error: "AI is not configured. Set AI_API_KEY to enable this feature." },
      503,
    );
  }

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.AI_MODEL,
      temperature: 0.4,
      messages: [
        { role: "system", content: "You are a concise writing assistant." },
        { role: "user", content: `${PROMPTS[action]}\n\n${text}` },
      ],
    }),
  });

  if (!res.ok) {
    return json({ error: "AI provider error" }, 502);
  }

  const data = await res.json();
  const result: string = data.choices?.[0]?.message?.content?.trim() ?? "";
  return json({ result });
});
