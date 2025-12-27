import OpenAI from "openai";
import * as cheerio from "cheerio";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

export default async function handler(req, res) {
  // Allow requests from anywhere (for testing)
  res.setHeader("Access-Control-Allow-Origin", "https://bshanahan.github.io");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight OPTIONS request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const targetUrl = req.query.url;

    if (!targetUrl) {
      return res.status(400).json({ error: "Missing ?url parameter" });
    }

    // Fetch page
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "NeutrinoBot/1.0",
      },
    });

    if (!response.ok) {
      return res
        .status(400)
        .json({ error: "Failed to fetch target URL" });
    }

    const html = await response.text();

    // Parse & clean HTML
    const $ = cheerio.load(html);

    $("script, style, nav, footer, header, iframe, noscript").remove();

    let text = $("body")
      .text()
      .replace(/\s+/g, " ")
      .trim();

    // Hard limit to stay under token cap
    const MAX_CHARS = 12000;
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS);
    }

    // Call model
    const completion = await client.chat.completions.create({
      model: "anthropic/claude-3-haiku",
      messages: [
        {
          role: "system",
	    content: `
            You rewrite text to remove bias, loaded language, and emotional framing.

            Rules:
              - Output ONLY the rewritten text.
              - Do NOT add introductions, explanations, or commentary.
              - Preserve factual meaning.
              - Use neutral, journalistic tone.
              `.trim(),
        },
        {
          role: "user",
          content: text,
        },
      ],
    });

  const raw = completion.choices[0].message.content;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // fallback: wrap as simple JSON
    parsed = { cleaned_text: raw, summary_of_changes: [] };
  }

  res.status(200).json(parsed);
} catch (error) {
  console.error(error);
  res.status(500).json({ error: error.message });
}
