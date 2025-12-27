import OpenAI from "openai";
import * as cheerio from "cheerio";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

export default async function handler(req, res) {
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
          content:
            "Rewrite the following text to remove bias, loaded language, and emotional framing. Preserve factual content and original meaning. Do not add new facts.",
        },
        {
          role: "user",
          content: text,
        },
      ],
    });

    const output = completion.choices[0].message.content;

    res.status(200).json({ cleaned: output });
  } catch (error) {
    console.error("Neutrino error:", error);
    res.status(500).json({ error: "Error processing request" });
  }
}
