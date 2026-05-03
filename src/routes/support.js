// ============================================================================
// SceneLink — Contact Support AI (dedicated, separate from /api/concierge)
// ============================================================================
// Purpose: Help users with app support, how-to, account, business inquiries,
//          reporting venue info, troubleshooting, contact routing.
// Different from /api/concierge which does nightlife recommendations.
// ============================================================================

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

// Rate limit: 30 messages per 15 minutes per IP
const supportLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many support messages. Please wait a few minutes.' }
});

// Dedicated system prompt for support — NOT nightlife concierge
const SUPPORT_SYSTEM_PROMPT = `You are the SceneLink Support Assistant — a dedicated help/support chatbot for the SceneLink app (Boston nightlife & dining discovery).

Your role is to help users with:
- How to use SceneLink features (save venues, create plans, my lists, favorites, check-ins, reviews)
- Account questions (sign in, sign up, password reset, profile, logout)
- Business/venue partner questions (how to claim a venue, business account, analytics, pricing)
- Reporting incorrect venue information (direct them to contact form)
- App troubleshooting (map not loading, search issues, filter problems, login issues)
- General contact routing (who to email for what)
- Explaining SceneLink's mission and features

You are NOT a nightlife concierge. Do NOT recommend specific venues or events. If a user asks for nightlife recommendations, politely say: "For personalized nightlife picks, please use the SceneLink Concierge (look for the gold AI button in the corner of any page), or visit our Explore or Nightlife pages."

Keep answers:
- Concise (2-4 short paragraphs max, plain text)
- Practical with actionable steps
- Friendly but professional
- Grounded in real SceneLink features (don't invent features that don't exist)

Key SceneLink features you know about:
- Explore page: browse 1,700+ venues across Boston neighborhoods with filters (cuisine, price, energy, neighborhood)
- Nightlife page: bars, clubs, lounges with live energy indicators
- Events page: upcoming events with map, category filters, date pickers, ticket links
- Tonight's Picks: curated picks for tonight
- My Lists / Favorites: save venues and events, organize into custom lists
- Plan with Friends: create a plan, add venues/events, invite friends
- Profile: your account, saved items, reviews, check-ins
- Business page: claim your venue, get analytics, manage your listing
- AI Concierge (global): separate AI for nightlife recommendations
- Contact page: reach support via form or this chat

How users contact SceneLink:
- General support: use the Contact form at /contact
- Business inquiries: business email on the /business page, or claim a venue there
- Report incorrect venue info: use the Contact form with subject "Report Venue Info"
- Account issues: use the Contact form

When troubleshooting, always suggest:
1. Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
2. Try incognito mode
3. Check internet connection
4. If still broken, use the Contact form below with details

If asked about you: "I'm the SceneLink Support Assistant — here to help with how-to questions, account issues, and getting you to the right place. I'm not a venue recommender — for that, use the gold AI button for nightlife picks."

Never expose API keys, secrets, internal URLs, or backend details. Never pretend to execute actions (like actually signing someone in or saving a venue on their behalf).`;

// POST /api/support/chat — send a support message
router.post('/chat', supportLimiter, async (req, res) => {
    try {
        const { message, history } = req.body;
        if (!message || typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ error: 'Message is required.' });
        }
        if (message.length > 2000) {
            return res.status(400).json({ error: 'Message too long (max 2000 chars).' });
        }

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            // Graceful fallback — no AI configured
            return res.json({
                ok: true,
                reply: "I'm temporarily unavailable. Please use the contact form on this page to send your question, and we'll get back within 1 business day. For common questions:\n\n• Save a venue: tap the heart icon on any venue card.\n• Create a plan: visit Plan with Friends from the nav.\n• Claim your business: visit /business and click 'Claim Your Venue'.\n• Report incorrect info: use the contact form with subject 'Report Venue Info'."
            });
        }

        // Build conversation with system prompt + history + current message
        const messages = [
            { role: 'system', content: SUPPORT_SYSTEM_PROMPT }
        ];

        if (Array.isArray(history)) {
            for (const m of history.slice(-8)) { // cap context
                if (m && typeof m.role === 'string' && typeof m.content === 'string') {
                    if (m.role === 'user' || m.role === 'assistant') {
                        messages.push({ role: m.role, content: m.content.slice(0, 2000) });
                    }
                }
            }
        }

        messages.push({ role: 'user', content: message.trim() });

        // Call OpenAI
        const openaiResp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                messages,
                temperature: 0.5,
                max_tokens: 400
            })
        });

        if (!openaiResp.ok) {
            const errText = await openaiResp.text().catch(() => '');
            console.error('[support] OpenAI error:', openaiResp.status, errText.slice(0, 200));
            return res.status(502).json({
                ok: false,
                reply: "I'm having trouble reaching my AI brain right now. Please try again in a moment, or use the contact form below to send your question directly."
            });
        }

        const data = await openaiResp.json();
        const reply = data?.choices?.[0]?.message?.content?.trim()
            || "I'm not sure how to help with that. Try rephrasing, or use the contact form to reach our team.";

        res.json({
            ok: true,
            reply,
            model: data?.model || 'gpt-4o-mini'
        });
    } catch (err) {
        console.error('[support] error:', err.message);
        res.status(500).json({
            ok: false,
            reply: "Something went wrong on my end. Please use the contact form below to send your question — our team will respond within 1 business day."
        });
    }
});

// GET /api/support/health — quick check
router.get('/health', (req, res) => {
    res.json({
        ok: true,
        service: 'contact-support-ai',
        configured: !!process.env.OPENAI_API_KEY
    });
});

module.exports = router;