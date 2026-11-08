/**
 * SceneLink — Contact Page Inline AI Support Chat
 * Embedded chat panel that talks to /api/concierge
 * Self-contained: does NOT require full concierge widget
 * v1.0
 */
(function () {
  'use strict';

  var API_BASE = (window.SL_CONFIG && window.SL_CONFIG.API_BASE) || 'https://scenelink-api-prod.onrender.com';

  var sessionId = 'contact-' + Math.random().toString(36).slice(2, 10);
  var isOpen = false;
  var isLoading = false;
  var messageHistory = [];

  function injectStyles() {
    if (document.getElementById('sl-cai-styles')) return;
    var style = document.createElement('style');
    style.id = 'sl-cai-styles';
    style.textContent = [
      '#sl-contact-ai-panel{display:none;position:fixed;inset:0;z-index:99900}',
      '#sl-contact-ai-panel.sl-cai--open{display:block}',
      '.sl-cai-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);animation:slCaiFadeIn 0.2s ease}',
      '.sl-cai-panel{position:fixed;bottom:0;right:0;width:400px;max-width:100vw;height:580px;max-height:90vh;background:#0f0f0f;border:1px solid rgba(212,175,55,0.25);border-radius:16px 16px 0 0;display:flex;flex-direction:column;box-shadow:0 -8px 48px rgba(0,0,0,0.6);animation:slCaiSlideUp 0.28s cubic-bezier(0.22,1,0.36,1);overflow:hidden}',
      '@media(min-width:600px){.sl-cai-panel{border-radius:16px;bottom:24px;right:24px}}',
      '@keyframes slCaiFadeIn{from{opacity:0}to{opacity:1}}',
      '@keyframes slCaiSlideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}',
      '.sl-cai-header{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,0.07);background:#111;flex-shrink:0}',
      '.sl-cai-header-left{display:flex;align-items:center;gap:12px}',
      '.sl-cai-avatar{width:40px;height:40px;background:linear-gradient(135deg,#D4AF37,#b8960c);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#000;font-size:16px}',
      '.sl-cai-title{font-size:15px;font-weight:700;color:#fff}',
      '.sl-cai-subtitle{font-size:12px;color:#888;display:flex;align-items:center;gap:5px}',
      '.sl-cai-dot{width:7px;height:7px;border-radius:50%;background:#22c55e;display:inline-block;box-shadow:0 0 6px #22c55e;animation:slCaiPulse 2s ease infinite}',
      '@keyframes slCaiPulse{0%,100%{opacity:1}50%{opacity:0.5}}',
      '.sl-cai-close{background:none;border:none;color:#666;font-size:18px;cursor:pointer;padding:6px;border-radius:6px}',
      '.sl-cai-close:hover{color:#fff}',
      '.sl-cai-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}',
      '.sl-cai-msg{display:flex;flex-direction:column;max-width:88%}',
      '.sl-cai-msg--user{align-self:flex-end;align-items:flex-end}',
      '.sl-cai-msg--ai{align-self:flex-start;align-items:flex-start}',
      '.sl-cai-bubble{padding:10px 14px;border-radius:16px;font-size:14px;line-height:1.55;white-space:pre-wrap;word-break:break-word}',
      '.sl-cai-msg--user .sl-cai-bubble{background:#D4AF37;color:#000;border-bottom-right-radius:4px;font-weight:500}',
      '.sl-cai-msg--ai .sl-cai-bubble{background:#1a1a1a;color:#e8e8e8;border:1px solid rgba(255,255,255,0.06);border-bottom-left-radius:4px}',
      '.sl-cai-quick-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}',
      '.sl-cai-chip{background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.3);color:#D4AF37;font-size:12px;padding:5px 10px;border-radius:20px;cursor:pointer;font-family:inherit}',
      '.sl-cai-chip:hover{background:rgba(212,175,55,0.2);border-color:#D4AF37}',
      '.sl-cai-venues{display:flex;flex-direction:column;gap:8px;margin-top:10px}',
      '.sl-cai-venue-card{background:#1a1a1a;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 12px;text-decoration:none;color:inherit;display:block}',
      '.sl-cai-venue-card:hover{border-color:rgba(212,175,55,0.4)}',
      '.sl-cai-venue-name{font-size:13px;font-weight:600;color:#fff;margin-bottom:3px}',
      '.sl-cai-venue-meta{font-size:11px;color:#888}',
      '.sl-cai-typing{display:none;gap:5px;padding:10px 18px;align-items:center}',
      '.sl-cai-typing.active{display:flex}',
      '.sl-cai-typing-dot{width:7px;height:7px;background:#D4AF37;border-radius:50%;animation:slCaiTyping 1.4s infinite}',
      '.sl-cai-typing-dot:nth-child(2){animation-delay:0.2s}',
      '.sl-cai-typing-dot:nth-child(3){animation-delay:0.4s}',
      '@keyframes slCaiTyping{0%,80%,100%{transform:scale(0.7);opacity:0.5}40%{transform:scale(1);opacity:1}}',
      '.sl-cai-input-area{display:flex;align-items:flex-end;gap:8px;padding:12px 14px;border-top:1px solid rgba(255,255,255,0.07);background:#111}',
      '.sl-cai-input{flex:1;background:#1a1a1a;border:1px solid rgba(255,255,255,0.1);border-radius:12px;color:#fff;font-size:14px;padding:10px 14px;resize:none;font-family:inherit;line-height:1.4;max-height:100px;overflow-y:auto}',
      '.sl-cai-input:focus{outline:none;border-color:rgba(212,175,55,0.5)}',
      '.sl-cai-input::placeholder{color:#555}',
      '.sl-cai-send{width:40px;height:40px;background:#D4AF37;border:none;border-radius:50%;color:#000;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center}',
      '.sl-cai-send:hover{transform:scale(1.08);background:#e0bc45}',
      '.sl-cai-send:disabled{background:#333;color:#666;cursor:not-allowed}',
      '.sl-cai-footer-note{font-size:11px;color:#444;text-align:center;padding:6px 14px 10px;background:#111}',
      '.sl-cai-footer-note a{color:#D4AF37;text-decoration:none}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function buildPanel() {
    if (document.getElementById('sl-contact-ai-panel')) return;
    var panel = document.createElement('div');
    panel.id = 'sl-contact-ai-panel';
    var html = '';
    html += '<div class="sl-cai-overlay" id="slCaiOverlay"></div>';
    html += '<div class="sl-cai-panel" role="dialog" aria-modal="true" aria-label="SceneLink AI Support">';
    html += '<div class="sl-cai-header">';
    html += '<div class="sl-cai-header-left">';
    html += '<div class="sl-cai-avatar"><i class="fas fa-magic"></i></div>';
    html += '<div><div class="sl-cai-title">AI Support</div>';
    html += '<div class="sl-cai-subtitle"><span class="sl-cai-dot"></span> Online · Instant answers</div></div></div>';
    html += '<button class="sl-cai-close" id="slCaiClose" aria-label="Close"><i class="fas fa-times"></i></button>';
    html += '</div>';
    html += '<div class="sl-cai-messages" id="slCaiMessages">';
    html += '<div class="sl-cai-msg sl-cai-msg--ai">';
    html += '<div class="sl-cai-bubble">Hi! I\'m SceneLink\'s AI — I can help with venue recommendations, account questions, or anything about Boston nightlife. What do you need?</div>';
    html += '<div class="sl-cai-quick-chips">';
    html += '<button class="sl-cai-chip" data-msg="What is SceneLink?">About SceneLink</button>';
    html += '<button class="sl-cai-chip" data-msg="Best rooftop bars in Boston">Rooftop bars</button>';
    html += '<button class="sl-cai-chip" data-msg="How do I create an account?">Account help</button>';
    html += '<button class="sl-cai-chip" data-msg="How do I claim my venue as a business?">Venue claim</button>';
    html += '<button class="sl-cai-chip" data-msg="I\'m having trouble logging in">Login issue</button>';
    html += '</div></div></div>';
    html += '<div class="sl-cai-typing" id="slCaiTyping">';
    html += '<div class="sl-cai-typing-dot"></div><div class="sl-cai-typing-dot"></div><div class="sl-cai-typing-dot"></div>';
    html += '</div>';
    html += '<div class="sl-cai-input-area">';
    html += '<textarea id="slCaiInput" class="sl-cai-input" placeholder="Ask anything about SceneLink..." rows="1" maxlength="500"></textarea>';
    html += '<button class="sl-cai-send" id="slCaiSend" aria-label="Send"><i class="fas fa-paper-plane"></i></button>';
    html += '</div>';
    html += '<div class="sl-cai-footer-note">Powered by SceneLink AI · <a href="#contactForm">Send a message</a> for human support</div>';
    html += '</div>';
    // Decode entities back to real HTML
    panel.innerHTML = html.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/&/g,'&amp;');
    document.body.appendChild(panel);
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function appendMessage(role, text, venues) {
    var container = document.getElementById('slCaiMessages');
    if (!container) return;
    var wrap = document.createElement('div');
    wrap.className = 'sl-cai-msg sl-cai-msg--' + role;
    var bubble = document.createElement('div');
    bubble.className = 'sl-cai-bubble';
    bubble.textContent = text;
    wrap.appendChild(bubble);
    if (role === 'ai' && venues && venues.length > 0) {
      var vc = document.createElement('div');
      vc.className = 'sl-cai-venues';
      venues.slice(0, 4).forEach(function (v) {
        var card = document.createElement('a');
        card.className = 'sl-cai-venue-card';
        card.href = 'explore.html';
        var rating = v.rating ? ' · ⭐ ' + parseFloat(v.rating).toFixed(1) : '';
        var nameDiv = document.createElement('div');
        nameDiv.className = 'sl-cai-venue-name';
        nameDiv.textContent = v.name || '';
        var metaDiv = document.createElement('div');
        metaDiv.className = 'sl-cai-venue-meta';
        metaDiv.textContent = (v.neighborhood || v.type || '') + rating;
        card.appendChild(nameDiv);
        card.appendChild(metaDiv);
        vc.appendChild(card);
      });
      wrap.appendChild(vc);
    }
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
  }

  function sendMessage(text) {
    if (!text || !text.trim() || isLoading) return;
    text = text.trim();
    appendMessage('user', text);
    messageHistory.push({ role: 'user', content: text });

    var inputEl = document.getElementById('slCaiInput');
    if (inputEl) { inputEl.value = ''; inputEl.style.height = 'auto'; }

    isLoading = true;
    var sendBtn = document.getElementById('slCaiSend');
    var typingEl = document.getElementById('slCaiTyping');
    if (sendBtn) sendBtn.disabled = true;
    if (typingEl) typingEl.classList.add('active');

    document.querySelectorAll('.sl-cai-quick-chips').forEach(function (c) { c.style.display = 'none'; });

    var token = localStorage.getItem('sl_jwt_token') || localStorage.getItem('sl_biz_token') || '';
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    fetch(API_BASE + '/api/concierge', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        message: text,
        session_id: sessionId,
        context: 'contact-support',
        history: messageHistory.slice(-6)
      })
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (typingEl) typingEl.classList.remove('active');
      var aiText = data.response || data.message || "I'm not sure about that — try emailing info@scenelink.app.";
      var venues = data.venues || [];
      appendMessage('ai', aiText, venues);
      messageHistory.push({ role: 'assistant', content: aiText });
    })
    .catch(function () {
      if (typingEl) typingEl.classList.remove('active');
      appendMessage('ai', "Sorry, I'm having trouble connecting right now. Please try again or email info@scenelink.app.");
    })
    .then(function () {
      isLoading = false;
      if (sendBtn) sendBtn.disabled = false;
      if (inputEl) inputEl.focus();
    });
  }

  function openPanel(prefilledMsg) {
    if (isOpen) return;
    isOpen = true;
    var panel = document.getElementById('sl-contact-ai-panel');
    if (panel) {
      panel.classList.add('sl-cai--open');
      document.body.style.overflow = 'hidden';
    }
    setTimeout(function () {
      var inputEl = document.getElementById('slCaiInput');
      if (inputEl) inputEl.focus();
      if (prefilledMsg && prefilledMsg !== 'I need help') {
        sendMessage(prefilledMsg);
      }
    }, 300);
  }

  function closePanel() {
    isOpen = false;
    var panel = document.getElementById('sl-contact-ai-panel');
    if (panel) {
      panel.classList.remove('sl-cai--open');
      document.body.style.overflow = '';
    }
  }

  function wireEvents() {
    var closeBtn = document.getElementById('slCaiClose');
    var overlay = document.getElementById('slCaiOverlay');
    var sendBtn = document.getElementById('slCaiSend');
    var inputEl = document.getElementById('slCaiInput');
    var msgContainer = document.getElementById('slCaiMessages');

    if (closeBtn) closeBtn.addEventListener('click', closePanel);
    if (overlay) overlay.addEventListener('click', closePanel);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) closePanel();
    });

    if (sendBtn) sendBtn.addEventListener('click', function () {
      if (inputEl) sendMessage(inputEl.value);
    });

    if (inputEl) {
      inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage(this.value);
        }
      });
      inputEl.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 100) + 'px';
      });
    }

    if (msgContainer) {
      msgContainer.addEventListener('click', function (e) {
        var chip = e.target.closest ? e.target.closest('.sl-cai-chip') : null;
        if (chip) sendMessage(chip.getAttribute('data-msg'));
      });
    }
  }

  function attachConciergeButtons() {
    document.querySelectorAll('[data-sl-concierge]').forEach(function (el) {
      if (el.getAttribute('data-cai-wired')) return;
      el.setAttribute('data-cai-wired', '1');
      el.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var msg = el.getAttribute('data-sl-concierge') || 'I need help';
        openPanel(msg);
      }, true);
    });

    window.addEventListener('sl:open-concierge', function (e) {
      openPanel((e && e.detail && e.detail.message) || '');
    });
  }

  window.SLContactAI = { open: openPanel, close: closePanel, send: sendMessage };

  function init() {
    injectStyles();
    buildPanel();
    wireEvents();
    attachConciergeButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();