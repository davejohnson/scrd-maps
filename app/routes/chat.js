const crypto = require('crypto');
const { Router } = require('express');
const { chat } = require('../services/claude');

const router = Router();

// In-memory session store with limits
const sessions = new Map();
const MAX_SESSIONS = 500;
const MAX_MESSAGES_PER_SESSION = 40; // 20 turns (user + assistant)
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

// Evict expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

function sanitizePropertyContext(ctx) {
  if (!ctx || typeof ctx !== 'object') return null;
  const allowed = ['address', 'pid', 'lot_size', 'zoning', 'zoning_code',
                    'ocp', 'ocp_area', 'subdivision_district'];
  const clean = {};
  for (const key of allowed) {
    if (key in ctx) {
      clean[key] = String(ctx[key]).slice(0, 200);
    }
  }
  // Neighbours: allow array, sanitize each
  if (Array.isArray(ctx.neighbours)) {
    clean.neighbours = ctx.neighbours.slice(0, 20).map(n => ({
      direction: String(n.direction || '').slice(0, 20),
      address: String(n.address || '').slice(0, 100),
      zoning: String(n.zoning || '').slice(0, 100),
      ocp: String(n.ocp || '').slice(0, 100),
      subdivision_district: String(n.subdivision_district || '').slice(0, 10),
    }));
  }
  return clean;
}

// POST /api/chat
router.post('/', async (req, res) => {
  const { message, sessionId, propertyContext } = req.body;

  // Validate message
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message must be a non-empty string' });
  }
  if (message.length > 5000) {
    return res.status(400).json({ error: 'Message too long (max 5000 characters)' });
  }

  const sid = (sessionId && typeof sessionId === 'string') ? sessionId : crypto.randomUUID();
  const session = sessions.get(sid) || { messages: [], propertyContext: null, createdAt: Date.now() };

  // Session limits
  if (session.messages.length >= MAX_MESSAGES_PER_SESSION) {
    return res.status(400).json({ error: 'Conversation too long. Please start a new chat.' });
  }

  // Evict oldest if at capacity
  if (!sessions.has(sid) && sessions.size >= MAX_SESSIONS) {
    const oldest = sessions.keys().next().value;
    sessions.delete(oldest);
  }

  if (propertyContext) {
    session.propertyContext = sanitizePropertyContext(propertyContext);
  }

  session.messages.push({ role: 'user', content: message });

  try {
    const result = await chat(session.messages, session.propertyContext);
    session.messages = result.messages;
    sessions.set(sid, session);
    res.json({ reply: result.reply, sessionId: sid });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// DELETE /api/chat/:sessionId
router.delete('/:sessionId', (req, res) => {
  sessions.delete(req.params.sessionId);
  res.json({ ok: true });
});

module.exports = router;
