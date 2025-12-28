import OpenAI from "openai";
import * as cheerio from "cheerio";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

export default async function handler(req, res) {
  // Allow requests from your GitHub Pages site
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
      return res.status(400).json({ error: "Failed to fetch target URL" });
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

    const model = req.query.model || "openai/gpt-4o-mini"; // default
      
    // Call model with updated prompt including explanation
    const completion = await client.chat.completions.create({
      model: model,
      messages: [
        {
          role: "system",
          content: `You are a neutral editor and fact-checking assistant.

Tasks:
1. Rewrite the input text to remove bias, loaded language, and emotional framing.
2. Preserve factual content and original meaning.
3. Do not add new facts.
4. Provide a brief explanation of the changes made.
5. Provide a high-level fact-check summary based on widely accepted public knowledge.

Rules:
- Do NOT browse the web.
- If a claim cannot be verified, say so explicitly.
- Do NOT speculate.
- Output MUST be valid JSON.
- Do NOT wrap output in markdown or code blocks.

Output format:
{
  "cleaned_text": "...",
  "summary_of_changes": ["...", "..."],
  "fact_check_summary": ["...", "..."]
}

- fact_check_summary should list factual issues, uncertainties, or explicitly state that no obvious factual errors were detected.
`.trim(),
        },
        {
          role: "user",
          content: text,
        },
      ],
    });
      
    let rawOutput = completion.choices[0].message.content.trim();

    // Remove Markdown code fences if present (Gemini)
    if (rawOutput.startsWith("```")) {
	rawOutput = rawOutput
	    .replace(/^```(?:json)?/i, "")
	    .replace(/```$/, "")
	    .trim();
    }
    // const rawOutput = completion.choices[0].message.content;

    // Attempt to parse JSON
    let parsed;
    try {
      parsed = JSON.parse(rawOutput);
    } catch {
      // fallback: wrap the text if model didn't produce perfect JSON
      parsed = {
	  cleaned_text: rawOutput,
	  summary_of_changes: [],
	  fact_check_summary: ["Fact-check could not be reliably generated."]
      };
    }

    res.status(200).json(parsed);
  } catch (error) {
    console.error("Neutrino error:", error);
    res.status(500).json({ error: "Error processing request" });
  }
}
