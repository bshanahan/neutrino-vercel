import { OpenAI } from 'openai';
import axios from 'axios';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export default async function handler(req, res) {
  try {
    const url = req.query.url;
    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    const response = await axios.get(url);
    const articleText = extractText(response.data);

    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are an expert at rewriting text to remove bias while keeping accuracy."
        },
        {
          role: "user",
          content: `Please rewrite the following text to remove bias while maintaining neutrality:\n\n${articleText}`
        }
      ]
    });

    const debiasedText = aiResponse.choices[0].message.content;
    res.status(200).json({ original: articleText, debiased: debiasedText });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error processing request" });
  }
}

function extractText(html) {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}
