const express = require('express');
const fs      = require('fs');
const path    = require('path');
const router  = express.Router();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions';

function buildSystemPrompt() {
  const policies = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/policies.json'), 'utf8'));

  const policiesText = policies.map(p =>
    `### ${p.title} (${p.category} — v${p.version}, effective ${p.effectiveDate})\n${p.content}`
  ).join('\n\n');

  return `You are an HR Policy Assistant for WIND-IS (Unified Workspace platform).

Your ONLY job is to answer questions about WIND-IS company HR policies. You have access to the following official policies:

${policiesText}

STRICT RULES:
1. ONLY answer questions that are directly related to HR policies, workplace conduct, leave, attendance, performance, IT security, or remote work at WIND-IS.
2. If a question is NOT related to HR policies or the workplace (e.g. sports, celebrities, general knowledge, cooking, politics, etc.), respond EXACTLY with: "I'm only able to answer questions about WIND-IS HR policies. Please ask me something related to leave, conduct, performance, remote work, IT security, or other workplace policies."
3. Base your answers strictly on the policy content provided above. Do not invent or assume policies.
4. Be concise, friendly, and professional.
5. When relevant, mention the policy name and version you're referencing.`;
}

router.post('/ask', async (req, res) => {
  const { question } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ success: false, message: 'Question is required.' });
  }

  try {
    const response = await fetch(GROQ_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model:       'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user',   content: question.trim() }
        ],
        temperature: 0.2,
        max_tokens:  512
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Groq API error:', response.status, err);
      return res.status(502).json({ success: false, message: 'AI service unavailable. Please try again.' });
    }

    const data   = await response.json();
    const answer = data?.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';

    res.json({ success: true, answer });
  } catch (err) {
    console.error('hr-chat error:', err);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
