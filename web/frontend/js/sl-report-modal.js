/**
 * SL Report Modal — UGC moderation required by App Store Guideline 1.2
 *
 * Usage (from any button):
 *   <button data-action="report" data-target-type="post" data-target-id="{uuid}">Report</button>
 *
 * Or programmatically:
 *   window.SLReportModal.open('post', '<uuid>', { label: 'this post' });
 *
 * Reasons map 1:1 to backend CHECK constraint.
 */
(function () {
  if (window.__SL_REPORT_MODAL__) return;
  window.__SL_REPORT_MODAL__ = true;

  var REASONS = [
    { k: 'spam',           l: 'Spam or scam' },
    { k: 'harassment',     l: 'Harassment or bullying' },
    { k: 'hate_speech',    l: 'Hate speech' },
    { k: 'violence',       l: 'Violence or threats' },
    { k: 'sexual_content', l: 'Sexual or explicit content' },
    { k: 'misinformation', l: 'Misinformation' },
    { k: 'illegal',        l: 'Illegal activity' },
    { k: 'impersonation',  l: 'Impersonation' },
    { k: 'self_harm',      l: 'Self-harm or suicide' },
    { k: 'other',          l: 'Something else' }
  ];

  function esc(s) { return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

  function injectStyle() {
    if (document.getElementById('sl-report-modal-style')) return;
    var s = document.createElement('style');
    s.id = 'sl-report-modal-style';
    s.textContent = [
      '.sl-rep-ov{position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:99999;',
      ' display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px);}',
      '.sl-rep-m{background:#111;border:1px solid rgba(255,255,255,0.1);border-radius:16px;',
      ' width:100%;max-width:440px;max-height:90vh;overflow-y:auto;padding:26px;color:#fff;',
      ' font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
      '.sl-rep-m h3{margin:0 0 6px 0;font-size:18px;color:#fff;}',
      '.sl-rep-m p.sl-rep-sub{color:rgba(255,255,255,0.6);font-size:13px;margin:0 0 18px 0;}',
      '.sl-rep-m .sl-rep-row{display:flex;align-items:center;gap:10px;padding:12px 14px;',
      ' border:1px solid rgba(255,255,255,0.1);border-radius:10px;margin-bottom:8px;cursor:pointer;',
      ' transition:all 0.15s;}',
      '.sl-rep-m .sl-rep-row:hover{border-color:#D4AF37;background:rgba(212,175,55,0.06);}',
      '.sl-rep-m .sl-rep-row.sel{border-color:#D4AF37;background:rgba(212,175,55,0.1);}',
      '.sl-rep-m .sl-rep-row input{margin:0;}',
      '.sl-rep-m .sl-rep-row label{flex:1;cursor:pointer;font-size:14px;color:#fff;}',
      '.sl-rep-m textarea{width:100%;background:#0a0a0a;border:1px solid rgba(255,255,255,0.15);',
      ' color:#fff;border-radius:8px;padding:10px;font:inherit;font-size:13px;min-height:70px;',
      ' resize:vertical;margin:14px 0 6px 0;box-sizing:border-box;}',
      '.sl-rep-m textarea:focus{outline:none;border-color:#D4AF37;}',
      '.sl-rep-m .sl-rep-actions{display:flex;gap:10px;margin-top:18px;}',
      '.sl-rep-m .sl-rep-btn{flex:1;padding:12px;border-radius:10px;font-weight:600;',
      ' font-size:14px;cursor:pointer;border:none;transition:all 0.15s;}',
      '.sl-rep-m .sl-rep-btn.ghost{background:transparent;color:rgba(255,255,255,0.6);',
      ' border:1px solid rgba(255,255,255,0.15);}',
      '.sl-rep-m .sl-rep-btn.ghost:hover{color:#fff;border-color:rgba(255,255,255,0.3);}',
      '.sl-rep-m .sl-rep-btn.primary{background:#e53935;color:#fff;}',
      '.sl-rep-m .sl-rep-btn.primary:hover{background:#c62828;}',
      '.sl-rep-m .sl-rep-btn.primary:disabled{opacity:0.4;cursor:not-allowed;}',
      '.sl-rep-err{color:#e57373;font-size:13px;margin-top:8px;}',
      '.sl-rep-ok{color:#81c784;font-size:13px;margin-top:8px;}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function toast(msg, kind) {
    if (window.SLToast) return window.SLToast(msg, 2800, kind || 'success');
    // fallback
    try { console.log('[report]', kind || '', msg); } catch(_){}
  }

  function open(targetType, targetId, opts) {
    opts = opts || {};
    if (!targetType || !targetId) return;

    // Require login
    var tok = null;
    try { tok = localStorage.getItem('sl_jwt_token'); } catch(_) {}
    if (!tok) {
      if (window.SLAuthOpen) window.SLAuthOpen();
      else toast('Sign in to report content', 'error');
      return;
    }

    injectStyle();

    // Remove any existing modal
    var prev = document.getElementById('slReportOverlay');
    if (prev) prev.remove();

    var subject = opts.label || (targetType + ' content');

    var ov = document.createElement('div');
    ov.className = 'sl-rep-ov';
    ov.id = 'slReportOverlay';
    ov.innerHTML =
      '<div class="sl-rep-m" role="dialog" aria-modal="true" aria-labelledby="slRepTitle">' +
        '<h3 id="slRepTitle">Report ' + esc(subject) + '</h3>' +
        '<p class="sl-rep-sub">Help us keep SceneLink safe. Your report is anonymous to the person being reported.</p>' +
        '<div id="slRepReasons">' +
          REASONS.map(function (r) {
            return '<div class="sl-rep-row" data-k="' + r.k + '">' +
              '<input type="radio" name="slRepReason" id="slr_' + r.k + '" value="' + r.k + '">' +
              '<label for="slr_' + r.k + '">' + esc(r.l) + '</label>' +
            '</div>';
          }).join('') +
        '</div>' +
        '<textarea id="slRepDetails" placeholder="Optional — add more context (max 1000 chars)" maxlength="1000"></textarea>' +
        '<div id="slRepErr" class="sl-rep-err" style="display:none;"></div>' +
        '<div class="sl-rep-actions">' +
          '<button class="sl-rep-btn ghost" id="slRepCancel">Cancel</button>' +
          '<button class="sl-rep-btn primary" id="slRepSubmit" disabled>Submit report</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';

    function close() {
      try { ov.remove(); } catch(_) {}
      document.body.style.overflow = '';
    }

    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.getElementById('slRepCancel').addEventListener('click', close);

    var chosen = null;
    ov.querySelectorAll('.sl-rep-row').forEach(function (row) {
      row.addEventListener('click', function () {
        chosen = row.dataset.k;
        ov.querySelectorAll('.sl-rep-row').forEach(function (r) { r.classList.remove('sel'); });
        row.classList.add('sel');
        var radio = row.querySelector('input[type=radio]');
        if (radio) radio.checked = true;
        document.getElementById('slRepSubmit').disabled = false;
      });
    });

    document.getElementById('slRepSubmit').addEventListener('click', function () {
      if (!chosen) return;
      var err = document.getElementById('slRepErr');
      err.style.display = 'none';
      var btn = this;
      btn.disabled = true;
      btn.textContent = 'Submitting…';
      var details = (document.getElementById('slRepDetails').value || '').trim().slice(0, 1000);

      window.SLApi.reportContent(targetType, targetId, chosen, details).then(function (r) {
        close();
        if (r && r.already_reported) {
          toast('Already reported — thanks for letting us know.', 'success');
        } else {
          toast('Report submitted. Our team will review it shortly.', 'success');
        }
      }).catch(function (e) {
        err.textContent = (e && e.message) || 'Could not submit report';
        err.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Submit report';
      });
    });
  }

  // Delegated click for any [data-action="report"]
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-action="report"]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    open(btn.dataset.targetType, btn.dataset.targetId, { label: btn.dataset.targetLabel });
  });

  window.SLReportModal = { open: open };
})();