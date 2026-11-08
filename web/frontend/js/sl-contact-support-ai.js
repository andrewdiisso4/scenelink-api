/* SceneLink — Contact Support AI (dedicated module)
 * Fully separate from global AI Concierge.
 * Own namespace: window.SLContactSupportAI
 * Own backend endpoint: POST /api/support/chat
 * Own UI panel, button handler, session.
 * v1.0 — 2026-05-03
 */
(function () {
    'use strict';

    var API_BASE = (window.SL_CONFIG && window.SL_CONFIG.API_BASE) || '';
    var ENDPOINT = API_BASE + '/api/support/chat';

    var sessionId = 'support-' + Math.random().toString(36).slice(2, 10);
    var isOpen = false;
    var isLoading = false;
    var history = []; // [{role, content}]

    // ---- STYLES ----
    function injectStyles() {
        if (document.getElementById('sl-support-ai-styles')) return;
        var css = [
            '#sl-support-ai-panel{display:none;position:fixed;inset:0;z-index:99950;font-family:inherit}',
            '#sl-support-ai-panel.sl-sup--open{display:block}',
            '.sl-sup-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);animation:slSupFade .2s ease}',
            '@keyframes slSupFade{from{opacity:0}to{opacity:1}}',
            '@keyframes slSupSlide{from{transform:translateY(30px);opacity:0}to{transform:translateY(0);opacity:1}}',
            '.sl-sup-panel{position:fixed;bottom:24px;right:24px;width:420px;max-width:calc(100vw - 32px);height:620px;max-height:calc(100vh - 48px);background:#0f0f0f;border:1px solid rgba(212,175,55,0.25);border-radius:16px;display:flex;flex-direction:column;box-shadow:0 12px 64px rgba(0,0,0,0.7);animation:slSupSlide .28s cubic-bezier(0.22,1,0.36,1);overflow:hidden}',
            '@media(max-width:600px){.sl-sup-panel{bottom:0;right:0;left:0;width:100%;height:100vh;max-height:100vh;border-radius:0}}',

            '.sl-sup-header{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,0.07);background:linear-gradient(180deg,#171717 0%,#111 100%);flex-shrink:0}',
            '.sl-sup-header-left{display:flex;align-items:center;gap:12px}',
            '.sl-sup-avatar{width:40px;height:40px;background:linear-gradient(135deg,#3b82f6,#2563eb);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;font-weight:700}',
            '.sl-sup-title{font-size:15px;font-weight:700;color:#fff;line-height:1.2}',
            '.sl-sup-subtitle{font-size:12px;color:#9ca3af;margin-top:2px;display:flex;align-items:center;gap:6px}',
            '.sl-sup-dot{width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 6px #22c55e;animation:slSupPulse 2s ease infinite}',
            '@keyframes slSupPulse{0%,100%{opacity:1}50%{opacity:0.5}}',
            '.sl-sup-close{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.08);color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s}',
            '.sl-sup-close:hover{background:rgba(59,130,246,0.2);border-color:rgba(59,130,246,0.4)}',

            '.sl-sup-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;background:#0a0a0a}',
            '.sl-sup-msg{display:flex;flex-direction:column;max-width:88%}',
            '.sl-sup-msg--user{align-self:flex-end;align-items:flex-end}',
            '.sl-sup-msg--ai{align-self:flex-start;align-items:flex-start}',
            '.sl-sup-bubble{padding:10px 14px;border-radius:14px;font-size:14px;line-height:1.55;white-space:pre-wrap;word-break:break-word}',
            '.sl-sup-msg--user .sl-sup-bubble{background:#2563eb;color:#fff;border-bottom-right-radius:4px;font-weight:500}',
            '.sl-sup-msg--ai .sl-sup-bubble{background:#171717;color:#e8e8e8;border:1px solid rgba(255,255,255,0.06);border-bottom-left-radius:4px}',

            '.sl-sup-quick-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}',
            '.sl-sup-chip{background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);color:#93c5fd;font-size:12px;padding:5px 10px;border-radius:20px;cursor:pointer;font-family:inherit;transition:all .15s}',
            '.sl-sup-chip:hover{background:rgba(59,130,246,0.2);border-color:#3b82f6;color:#dbeafe}',

            '.sl-sup-typing{display:none;gap:5px;padding:10px 18px;align-items:center}',
            '.sl-sup-typing.active{display:flex}',
            '.sl-sup-typing-dot{width:7px;height:7px;background:#3b82f6;border-radius:50%;animation:slSupType 1.4s infinite}',
            '.sl-sup-typing-dot:nth-child(2){animation-delay:.2s}',
            '.sl-sup-typing-dot:nth-child(3){animation-delay:.4s}',
            '@keyframes slSupType{0%,80%,100%{transform:scale(0.7);opacity:.5}40%{transform:scale(1);opacity:1}}',

            '.sl-sup-input-area{display:flex;align-items:flex-end;gap:8px;padding:12px 14px;border-top:1px solid rgba(255,255,255,0.07);background:#111}',
            '.sl-sup-input{flex:1;background:#1a1a1a;border:1px solid rgba(255,255,255,0.1);border-radius:12px;color:#fff;font-size:14px;padding:10px 14px;resize:none;font-family:inherit;line-height:1.4;max-height:110px;overflow-y:auto;min-height:40px}',
            '.sl-sup-input:focus{outline:none;border-color:#3b82f6}',
            '.sl-sup-send{width:40px;height:40px;border-radius:10px;background:#2563eb;color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s}',
            '.sl-sup-send:hover{background:#1d4ed8}',
            '.sl-sup-send:disabled{background:#374151;cursor:not-allowed}',
            '.sl-sup-footnote{text-align:center;font-size:10px;color:#6b7280;padding:6px 0 8px 0;border-top:1px solid rgba(255,255,255,0.04);background:#111}',
            '.sl-sup-error{background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#fca5a5;padding:10px 14px;border-radius:10px;font-size:13px}'
        ].join('');
        var st = document.createElement('style');
        st.id = 'sl-support-ai-styles';
        st.textContent = css;
        document.head.appendChild(st);
    }

    // ---- PANEL HTML ----
    function buildPanel() {
        if (document.getElementById('sl-support-ai-panel')) return;
        var wrap = document.createElement('div');
        wrap.id = 'sl-support-ai-panel';
        wrap.innerHTML = [
            '<div class="sl-sup-overlay" data-sup-close="1"></div>',
            '<div class="sl-sup-panel" role="dialog" aria-label="SceneLink Support Assistant">',
            '  <div class="sl-sup-header">',
            '    <div class="sl-sup-header-left">',
            '      <div class="sl-sup-avatar">?</div>',
            '      <div>',
            '        <div class="sl-sup-title">SceneLink Support</div>',
            '        <div class="sl-sup-subtitle"><span class="sl-sup-dot"></span>Support Assistant</div>',
            '      </div>',
            '    </div>',
            '    <button class="sl-sup-close" data-sup-close="1" aria-label="Close support chat">&times;</button>',
            '  </div>',
            '  <div class="sl-sup-messages" id="slSupMessages"></div>',
            '  <div class="sl-sup-typing" id="slSupTyping"><span class="sl-sup-typing-dot"></span><span class="sl-sup-typing-dot"></span><span class="sl-sup-typing-dot"></span></div>',
            '  <div class="sl-sup-input-area">',
            '    <textarea class="sl-sup-input" id="slSupInput" placeholder="Ask a support question..." rows="1"></textarea>',
            '    <button class="sl-sup-send" id="slSupSend" aria-label="Send"><i class="fas fa-paper-plane"></i></button>',
            '  </div>',
            '  <div class="sl-sup-footnote">Support — not nightlife recommendations. For venue picks use the AI Concierge.</div>',
            '</div>'
        ].join('');
        document.body.appendChild(wrap);

        // Close handlers
        wrap.querySelectorAll('[data-sup-close]').forEach(function (el) {
            el.addEventListener('click', close);
        });

        // Input handlers
        var input = document.getElementById('slSupInput');
        var sendBtn = document.getElementById('slSupSend');
        input.addEventListener('input', function () {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 110) + 'px';
        });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
            }
        });
        sendBtn.addEventListener('click', send);

        // Escape to close
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && isOpen) close();
        });

        // Quick chip delegation
        document.getElementById('slSupMessages').addEventListener('click', function (e) {
            var chip = e.target.closest('.sl-sup-chip');
            if (chip) {
                var prefill = chip.getAttribute('data-q') || chip.textContent;
                input.value = prefill;
                send();
            }
        });
    }

    // ---- UI RENDERING ----
    function addMessage(role, text) {
        var msgs = document.getElementById('slSupMessages');
        if (!msgs) return;
        var wrap = document.createElement('div');
        wrap.className = 'sl-sup-msg sl-sup-msg--' + (role === 'user' ? 'user' : 'ai');
        var bubble = document.createElement('div');
        bubble.className = 'sl-sup-bubble';
        bubble.textContent = text;
        wrap.appendChild(bubble);
        msgs.appendChild(wrap);
        msgs.scrollTop = msgs.scrollHeight;
    }

    function addChips() {
        var msgs = document.getElementById('slSupMessages');
        if (!msgs) return;
        var wrap = document.createElement('div');
        wrap.className = 'sl-sup-msg sl-sup-msg--ai';
        var chips = document.createElement('div');
        chips.className = 'sl-sup-quick-chips';
        var qs = [
            'How do I save a venue?',
            'How do I create a plan?',
            'How do I claim my business?',
            'How do I report incorrect venue info?',
            'Why is my map not loading?'
        ];
        qs.forEach(function (q) {
            var c = document.createElement('span');
            c.className = 'sl-sup-chip';
            c.setAttribute('data-q', q);
            c.textContent = q;
            chips.appendChild(c);
        });
        wrap.appendChild(chips);
        msgs.appendChild(wrap);
        msgs.scrollTop = msgs.scrollHeight;
    }

    function showTyping(on) {
        var t = document.getElementById('slSupTyping');
        if (!t) return;
        t.classList.toggle('active', !!on);
    }

    // ---- API ----
    function send() {
        if (isLoading) return;
        var input = document.getElementById('slSupInput');
        if (!input) return;
        var text = (input.value || '').trim();
        if (!text) return;

        addMessage('user', text);
        history.push({ role: 'user', content: text });
        input.value = '';
        input.style.height = 'auto';

        isLoading = true;
        showTyping(true);
        document.getElementById('slSupSend').disabled = true;

        fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
            body: JSON.stringify({ message: text, history: history.slice(-8) })
        })
            .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
            .then(function (resp) {
                var reply = (resp.data && resp.data.reply) || "Sorry, I couldn't respond. Please use the contact form below.";
                addMessage('ai', reply);
                history.push({ role: 'assistant', content: reply });
            })
            .catch(function () {
                addMessage('ai', "I'm having trouble connecting. Please use the contact form below to send your question — our team responds within 1 business day.");
            })
            .finally(function () {
                isLoading = false;
                showTyping(false);
                var sb = document.getElementById('slSupSend');
                if (sb) sb.disabled = false;
            });
    }

    // ---- PUBLIC API ----
    function open(prefill) {
        injectStyles();
        buildPanel();
        var p = document.getElementById('sl-support-ai-panel');
        if (!p) return;
        p.classList.add('sl-sup--open');
        isOpen = true;
        document.body.style.overflow = 'hidden';

        // Only show greeting if fresh
        var msgs = document.getElementById('slSupMessages');
        if (msgs && !msgs.children.length) {
            addMessage('ai', "👋 Hi! I'm the SceneLink Support Assistant. I can help you with how-to questions, account issues, and app troubleshooting. What can I help you with?");
            addChips();
        }

        if (prefill) {
            var input = document.getElementById('slSupInput');
            if (input) { input.value = prefill; input.focus(); }
        } else {
            setTimeout(function () {
                var i = document.getElementById('slSupInput'); if (i) i.focus();
            }, 200);
        }
    }

    function close() {
        var p = document.getElementById('sl-support-ai-panel');
        if (p) p.classList.remove('sl-sup--open');
        isOpen = false;
        document.body.style.overflow = '';
    }

    window.SLContactSupportAI = { open: open, close: close, send: send };

    // ---- AUTO-BIND on contact page ----
    // Bind specifically to contact-page support triggers.
    // Must be captured BEFORE the global concierge handler.
    function bindTriggers() {
        // Contact page support triggers (use dedicated data attribute + existing hints)
        var selectors = [
            '[data-sl-contact-support]',
            '#aiSupportBtn',
            '.ai-support-card',
            '[data-sl-concierge="I need help"]'
        ];
        document.querySelectorAll(selectors.join(',')).forEach(function (el) {
            if (el.getAttribute('data-sup-wired') === '1') return;
            el.setAttribute('data-sup-wired', '1');
            el.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                open(el.getAttribute('data-prefill') || '');
            }, true); // capture phase
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindTriggers);
    } else {
        bindTriggers();
    }
    // Re-bind if DOM changes
    if (window.MutationObserver) {
        var mo = new MutationObserver(function () { bindTriggers(); });
        if (document.body) mo.observe(document.body, { childList: true, subtree: true });
        else document.addEventListener('DOMContentLoaded', function () { mo.observe(document.body, { childList: true, subtree: true }); });
    }
})();