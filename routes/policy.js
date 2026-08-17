const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');

const policiesPath = path.join(__dirname, '../data/policies.json');
const read = () => JSON.parse(fs.readFileSync(policiesPath, 'utf8'));

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

// GET /api/policy — list all policies
router.get('/', requireAuth, (req, res) => {
  const policies = read().map(p => ({
    id: p.id, title: p.title, category: p.category,
    version: p.version, effectiveDate: p.effectiveDate
  }));
  res.json({ success: true, policies });
});

// POST /api/policy/ask — search/ask about policies
router.post('/ask', requireAuth, (req, res) => {
  const query    = (req.body.question || '').toLowerCase().trim();
  const policies = read();

  if (!query) {
    return res.json({ success: true, answer: "Please type a question about company policies.", sources: [] });
  }

  // Score each policy by keyword match
  const scored = policies.map(p => {
    const keywords = p.keywords || [];
    const content  = (p.content + ' ' + p.title + ' ' + keywords.join(' ')).toLowerCase();
    let score = 0;

    query.split(/\s+/).forEach(word => {
      if (word.length > 2 && content.includes(word)) score++;
    });

    keywords.forEach(kw => {
      if (query.includes(kw.toLowerCase())) score += 3;
    });

    return { policy: p, score };
  }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return res.json({
      success: true,
      answer:  "I couldn't find a specific policy matching your question. Please try different keywords, or contact HR for assistance.",
      sources: []
    });
  }

  // Build response from top matches
  const top     = scored.slice(0, 2);
  const answer  = top.map(s => `**${s.policy.title}** (v${s.policy.version})\n\n${s.policy.content}`).join('\n\n---\n\n');
  const sources = top.map(s => ({ id: s.policy.id, title: s.policy.title, category: s.policy.category }));

  res.json({ success: true, answer, sources });
});

module.exports = router;
