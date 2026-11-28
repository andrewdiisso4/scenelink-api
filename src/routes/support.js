const express = require('express');

const router = express.Router();

// Keep a fail-closed endpoint for stale clients. This route deliberately has
// no provider path, even when the separate Concierge key is provisioned.
router.post('/chat', (_req, res) => {
    res.set('Cache-Control', 'no-store').status(503).json({
        ok: false,
        code: 'SUPPORT_CHAT_DISABLED',
        reply: 'Use the contact form to send your question to the SceneLink team.'
    });
});

router.get('/health', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({
        ok: true,
        service: 'contact-support-ai',
        configured: false
    });
});

module.exports = router;
