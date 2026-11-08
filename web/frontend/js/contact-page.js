/**
 * SceneLink — Contact Page
 * - FAQ accordion
 * - Contact form → POST /api/contact (real backend, stored in DB + email)
 * - AI support card click → opens AI concierge
 * v3 — full backend integration
 */

document.addEventListener('DOMContentLoaded', function () {
    initFAQAccordion();
    initContactForm();
    initAISupportCard();
});

// ============================================================
// FAQ ACCORDION
// ============================================================
function initFAQAccordion() {
    document.querySelectorAll('.faq-item').forEach(function (item) {
        var q = item.querySelector('.faq-question');
        if (!q) return;
        q.addEventListener('click', function () {
            var isOpen = item.classList.contains('active');
            document.querySelectorAll('.faq-item.active').forEach(function (o) { o.classList.remove('active'); });
            if (!isOpen) item.classList.add('active');
        });
    });
}

// ============================================================
// AI SUPPORT CARD — opens concierge with pre-filled message
// ============================================================
function initAISupportCard() {
    document.querySelectorAll('[data-sl-concierge]').forEach(function (el) {
        el.addEventListener('click', function (e) {
            e.preventDefault();
            var msg = el.getAttribute('data-sl-concierge') || 'I need help';
            // Try to open the global AI concierge widget
            try {
                if (window.SLConcierge && typeof window.SLConcierge.open === 'function') {
                    window.SLConcierge.open(msg);
                    return;
                }
                // Fallback: dispatch custom event
                window.dispatchEvent(new CustomEvent('sl:open-concierge', { detail: { message: msg } }));
                // Trigger any nav link with data-ai-concierge-nav
                var navLink = document.querySelector('[data-ai-concierge-nav]');
                if (navLink) navLink.click();
            } catch (e) { /* silent */ }
        });
    });
}

// ============================================================
// CONTACT FORM — real backend API
// ============================================================
function initContactForm() {
    var form = document.getElementById('contactForm');
    if (!form) return;

    var nameInput     = document.getElementById('name');
    var emailInput    = document.getElementById('email');
    var subjectSelect = document.getElementById('subject');
    var msgTextarea   = document.getElementById('message');

    // Real-time validation on blur
    if (nameInput)     nameInput.addEventListener('blur',     function () { validateName(nameInput); });
    if (emailInput)    emailInput.addEventListener('blur',    function () { validateEmail(emailInput); });
    if (subjectSelect) subjectSelect.addEventListener('change', function () { validateSubject(subjectSelect); });
    if (msgTextarea)   msgTextarea.addEventListener('blur',   function () { validateMessage(msgTextarea); });

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var ok = [
            validateName(nameInput),
            validateEmail(emailInput),
            validateSubject(subjectSelect),
            validateMessage(msgTextarea),
        ].every(Boolean);
        if (ok) submitContactForm(form);
        else showNotification('error', 'Please fix the errors in the form', 'Some fields are missing or invalid.');
    });
}

// ── Validators ───────────────────────────────────────────────
function validateName(input) {
    if (!input) return true;
    var v = input.value.trim();
    var g = input.closest('.form-group');
    if (!v) { setError(g, 'Name is required'); return false; }
    if (v.length < 2) { setError(g, 'Name must be at least 2 characters'); return false; }
    setSuccess(g); return true;
}
function validateEmail(input) {
    if (!input) return true;
    var v = input.value.trim();
    var g = input.closest('.form-group');
    if (!v) { setError(g, 'Email is required'); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setError(g, 'Please enter a valid email'); return false; }
    setSuccess(g); return true;
}
function validateSubject(select) {
    if (!select) return true;
    var g = select.closest('.form-group');
    if (!select.value) { setError(g, 'Please select a subject'); return false; }
    setSuccess(g); return true;
}
function validateMessage(textarea) {
    if (!textarea) return true;
    var v = textarea.value.trim();
    var g = textarea.closest('.form-group');
    if (!v) { setError(g, 'Message is required'); return false; }
    if (v.length < 10) { setError(g, 'Message must be at least 10 characters'); return false; }
    setSuccess(g); return true;
}
function setError(g, msg) {
    if (!g) return;
    g.classList.remove('success'); g.classList.add('error');
    var el = g.querySelector('.error-message');
    if (!el) { el = document.createElement('div'); el.className = 'error-message'; g.appendChild(el); }
    el.textContent = msg;
}
function setSuccess(g) {
    if (!g) return;
    g.classList.remove('error'); g.classList.add('success');
    var el = g.querySelector('.error-message'); if (el) el.remove();
}

// ── Submission ───────────────────────────────────────────────
function submitContactForm(form) {
    var btn = form.querySelector('button[type="submit"]');
    var origText = btn ? btn.textContent : 'Send Message';
    if (btn) { btn.textContent = 'Sending…'; btn.disabled = true; }

    var name    = (document.getElementById('name') || {}).value || '';
    var email   = (document.getElementById('email') || {}).value || '';
    var sel     = document.getElementById('subject');
    var subject = sel ? ((sel.options[sel.selectedIndex] || {}).text || sel.value) : '';
    var message = (document.getElementById('message') || {}).value || '';

    // Attach user context if logged in
    var token = '';
    try {
        token = (window.SLAuth && SLAuth.token && SLAuth.token()) ||
                localStorage.getItem('sl_jwt_token') || '';
    } catch (_) {}

    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    fetch('/api/contact', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            subject: subject,
            message: message.trim(),
            source: 'contact-page',
        }),
    })
    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
    .then(function (res) {
        if (btn) { btn.textContent = origText; btn.disabled = false; }

        if (res.ok && res.data.ok) {
            // Success — show the success state
            form.style.display = 'none';
            var successEl = document.getElementById('contactSuccess');
            if (successEl) {
                var msgEl = document.getElementById('contactSuccessMsg');
                if (msgEl) msgEl.textContent = res.data.message || 'Your message has been sent. We\'ll reply within 1 business day.';
                successEl.style.display = 'block';
                successEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                showNotification('success', 'Message Sent', res.data.message || 'We\'ll reply within 1 business day!');
            }
            form.reset();
            form.querySelectorAll('.form-group').forEach(function (g) { g.classList.remove('success', 'error'); });

            // Track in analytics
            try {
                if (window.SLAnalytics) window.SLAnalytics.track('contact_form_submit', { subject: subject });
            } catch (_) {}
        } else {
            var errMsg = (res.data && res.data.error) || 'Could not send message. Please email info@scenelink.app directly.';
            showNotification('error', 'Send Failed', errMsg);
            // Fallback: open mailto
            _fallbackMailto(name, email, subject, message);
        }
    })
    .catch(function (err) {
        if (btn) { btn.textContent = origText; btn.disabled = false; }
        showNotification('error', 'Network Error', 'Could not connect. Opening your email client as a fallback…');
        setTimeout(function () { _fallbackMailto(name, email, subject, message); }, 800);
    });
}

function _fallbackMailto(name, email, subject, message) {
    var body = 'Name: ' + name + '\nEmail: ' + email + '\nSubject: ' + subject + '\n\n' + message;
    try {
        window.open('mailto:info@scenelink.app?subject=' +
            encodeURIComponent('[SceneLink Contact] ' + subject + ' – ' + name) +
            '&body=' + encodeURIComponent(body));
    } catch (_) {}
}

// ============================================================
// NOTIFICATION TOAST
// ============================================================
function showNotification(type, title, message) {
    document.querySelectorAll('.sl-contact-notification').forEach(function (n) { n.remove(); });
    var el = document.createElement('div');
    el.className = 'sl-contact-notification ' + type;
    el.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;max-width:340px;background:' +
        (type === 'success' ? '#0d2b1a' : '#2b0d0d') + ';border:1px solid ' +
        (type === 'success' ? '#00b894' : '#e17055') + ';border-radius:12px;padding:16px 20px;' +
        'color:#fff;font-family:sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.4);' +
        'animation:sl-slide-in 0.3s ease;display:flex;align-items:flex-start;gap:12px;';
    el.innerHTML = '<span style="font-size:18px;flex-shrink:0">' + (type === 'success' ? '✓' : '✕') + '</span>' +
        '<div><strong style="display:block;margin-bottom:2px">' + title + '</strong>' +
        '<span style="font-size:13px;color:rgba(255,255,255,0.7)">' + message + '</span></div>' +
        '<button onclick="this.parentElement.remove()" style="background:none;border:none;color:#fff;' +
        'font-size:16px;cursor:pointer;margin-left:auto;padding:0 0 0 8px;flex-shrink:0">×</button>';
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 6000);
}

// Export
if (typeof window !== 'undefined') window.showNotification = showNotification;