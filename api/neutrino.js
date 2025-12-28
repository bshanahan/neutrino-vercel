import OpenAI from "openai";
import * as cheerio from "cheerio";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://bshanahan.github.io");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const targetUrl = req.query.url;
    if (!targetUrl) {
      return res.status(400).json({ error: "Missing ?url parameter" });
    }

    const response = await fetch(targetUrl, {
      headers: { "User-Agent": "NeutrinoBot/1.0" },
    });

    if (!response.ok) {
      return res.status(400).json({ error: "Failed to fetch target URL" });
    }

    const html = await response.text();

    const $ = cheerio.load(html);
    $("script, style, nav, footer, header, iframe, noscript").remove();

    let text = $("body").text().replace(/\s+/g, " ").trim();

    const MAX_CHARS = 12000;
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS);
    }

    const model = req.query.model || "openai/gpt-4o-mini";

    const completion = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `
You are a neutral editor and fact-checking assistant.

Tasks:
1. Rewrite the input text to remove bias, loaded language, and emotional framing.
2. Preserve factual content and original meaning. Do not add new facts.
3. Extract factual claims that are objectively checkable.
4. Fact-check ONLY those extracted factual claims using widely accepted public knowledge.

Rules:
- Opinions, value judgments, predictions, or rhetoric are NOT factual claims.
- If a claim cannot be verified, say so explicitly.
- Do NOT speculate or infer causation.
- Output MUST be valid JSON.
- Do NOT wrap output in markdown or code blocks.

Output format:
{
  "cleaned_text": "...",
  "summary_of_changes": ["...", "..."],
  "extracted_claims": ["...", "..."],
  "fact_check_summary": ["...", "..."]
}

Notes:
- extracted_claims should list only factual, checkable statements.
- fact_check_summary should correspond to the extracted claims.
- If no factual claims are present, say so explicitly.
          `.trim(),
        },
        {
          role: "user",
          content: text,
        },
      ],
    });

    let rawOutput = completion.choices[0].message.content.trim();

    // Remove markdown code fences (Gemini safety)
    if (rawOutput.startsWith("```")) {
      rawOutput = rawOutput
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/, "")
        .trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(rawOutput);
    } catch {
      parsed = {
        cleaned_text: rawOutput,
        summary_of_changes: [],
        extracted_claims: [],
        fact_check_summary: [
          "Fact-check could not be reliably generated due to malformed model output.",
        ],
      };
    }

    // Ensure all fields exist (defensive programming)
    parsed.summary_of_changes ||= [];
    parsed.extracted_claims ||= [];
    parsed.fact_check_summary ||= [];

    res.status(200).json(parsed);
  } catch (error) {
    console.error("Neutrino error:", error);
    res.status(500).json({ error: "Error processing request" });
  }
}
