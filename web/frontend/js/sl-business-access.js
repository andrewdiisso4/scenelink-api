/* Business account entry, independent of consumer sign-in. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const overlay = byId('bizLoginOverlay');
  const dashboard = byId('bizDashboard');
  const landing = byId('bizLanding');
  const status = byId('bizAccessStatus');
  const retry = byId('bizRetry');
  const tokenKey = 'sl_biz_token';
  const legacyKeys = ['sl_biz_user', 'sl_business_user', 'sl_business'];
  const forms = {login: byId('bzFormLogin'), claim: byId('bzFormClaim'), forgot: byId('bzFormForgot')};
  let verifiedToken = null;
  let generation = 0;
  let formVersion = 0;
  let opener = null;
  let account = null;

  function hideDashboard() {
    verifiedToken = null;
    account = null;
    dashboard.classList.remove('active');
    landing.classList.remove('hidden');
  }

  function clearBusinessSession() {
    hideDashboard();
    localStorage.removeItem(tokenKey);
    legacyKeys.forEach(key => localStorage.removeItem(key));
  }

  function selectForm(name) {
    formVersion++;
    for (const [key, form] of Object.entries(forms)) {
      form.style.display = name === key ? 'block' : 'none';
      form.querySelector('[role=alert]').textContent = '';
    }
    document.querySelectorAll('.bz-ltab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.form === name);
      tab.setAttribute('aria-selected', String(tab.dataset.form === name));
    });
    byId('bzClaimTierLabel').textContent = byId('bzClaimTier').selectedOptions[0].textContent;
    byId('bzForgotSuccess').textContent = '';
    byId('bzForgotSuccess').style.display = 'none';
    overlay.querySelector('.bz-ltabs').style.display = name === 'forgot' ? 'none' : '';
    forms[name].querySelector('input').focus();
  }

  function open(name, trigger) {
    opener = trigger || byId('bizLoginBtn');
    overlay.classList.add('active');
    selectForm(name);
  }

  function close() {
    formVersion++;
    overlay.classList.remove('active');
    byId('bzPass').value = '';
    byId('bzClaimPass').value = '';
    if (opener) opener.focus();
  }

  async function request(path, {token, body} = {}) {
    const headers = {};
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body) headers['Content-Type'] = 'application/json';
    const r = await fetch('/api/business/' + path, {method: body ? 'POST' : 'GET',
      headers, body: body && JSON.stringify(body), cache: 'no-store', mode: 'same-origin'});
    const data = await r.json().catch(() => null);
    if (!r.ok) throw Object.assign(new Error(data?.error || 'Service unavailable. Please try again.'), {status: r.status});
    if (!data) throw Error('The service returned an incomplete response. Please retry.');
    return data;
  }

  async function restore() {
    const ticket = ++generation;
    const previouslyOpen = !!verifiedToken;
    const token = localStorage.getItem(tokenKey);
    hideDashboard();
    retry.hidden = true;
    if (!token || token === 'undefined' || token === 'null') {
      clearBusinessSession();
      return;
    }
    status.textContent = 'Checking business access…';
    const current = () => ticket === generation && localStorage.getItem(tokenKey) === token;
    try {
      const {user} = await request('me', {token});
      if (!current()) return;
      if (!user?.id || user.role !== 'business' || user.status !== 'active') {
        throw Object.assign(new Error('An approved business account is required.'), {status: 403});
      }
      verifiedToken = token;
      account = user;
      legacyKeys.forEach(key => localStorage.removeItem(key));
      if (overlay.classList.contains('active')) close();
      status.textContent = '';
      window.SLBizDashboard(user);
      window.SLBizApp.showAccount(user);
    } catch (error) {
      if (!current()) return;
      hideDashboard();
      if ([401,403,404].includes(error.status)) {
        clearBusinessSession();
        if (previouslyOpen) { location.replace('/business?login=1'); return; }
        status.textContent = 'Your business session has ended. Sign in again.';
      } else {
        status.textContent = 'We couldn’t open your dashboard. Check your connection and retry.';
        retry.hidden = false;
      }
    }
  }

  function logout() {
    const token = verifiedToken;
    generation++;
    clearBusinessSession();
    // A clean document drops private form drafts and any in-flight panel callbacks.
    if (token) window.fetch('/api/business/logout', {method:'POST', keepalive:true,
      headers:{Authorization:'Bearer '+token}}).catch(() => {});
    location.replace('/business?login=1');
  }

  function bind(name, submit) {
    const form = forms[name];
    const button = form.querySelector('button[type=submit]');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (button.disabled || !form.reportValidity()) return;
      const version = formVersion;
      const current = () => formVersion === version && overlay.classList.contains('active');
      const error = form.querySelector('[role=alert]');
      error.textContent = '';
      button.disabled = true;
      try { await submit(current); }
      catch (failure) {
        if (current()) {
          error.textContent = failure.message || 'We couldn’t reach SceneLink. Please try again.';
          error.style.display = 'block';
        }
      } finally { button.disabled = false; }
    });
  }

  bind('login', async current => {
    const d = await request('login', {body:{email:byId('bzEmail').value.trim(),password:byId('bzPass').value}});
    if (!current()) return;
    if (typeof d.token !== 'string' || !d.token.trim() || !d.user?.id ||
        d.user.role !== 'business' || d.user.status !== 'active') throw Error('Sign-in was not confirmed.');
    localStorage.setItem(tokenKey, d.token);
    close();
    await restore();
  });
  bind('claim', async current => {
    const password = byId('bzClaimPass').value;
    if (password.length < 8 || new TextEncoder().encode(password).length > 72)
      throw Error('Use at least 8 characters and at most 72 UTF-8 bytes.');
    const email = byId('bzClaimEmail').value.trim();
    const d = await request('claim', {body:{venue_name:byId('bzClaimName').value.trim(), email,
      password, tier:byId('bzClaimTier').value}});
    if (!current()) return;
    if (!d.ok || d.pending_review !== true) throw Error('Claim submission was not confirmed.');
    forms.claim.reset();
    byId('bzEmail').value = email;
    close();
    status.textContent = 'Claim received. Your venue is awaiting ownership review. You can sign in once approved.';
  });
  bind('forgot', async current => {
    const box = byId('bzForgotSuccess');
    box.style.display = 'none';
    const d = await request('forgot-password', {body:{email:byId('bzForgotEmail').value.trim()}});
    if (!current()) return;
    if (d.ok !== true) throw Error('The recovery request could not be confirmed. Please retry.');
    box.textContent = 'If this account is eligible, a reset email has been requested. Check your inbox and spam folder.';
    box.style.display = 'block';
  });

  document.querySelectorAll('#bizLoginBtn,#bizClaimBtn,.bz-open-login').forEach(btn =>
    btn.addEventListener('click', () => {
      if (btn.dataset.tier === 'enterprise') { window.openUpgradeInterestModal(); return; }
      if (btn.dataset.tier) byId('bzClaimTier').value = btn.dataset.tier;
      open(btn.id === 'bizLoginBtn' ? 'login' : 'claim', btn);
    }));
  byId('bzClaimTier').addEventListener('change', event => {
    byId('bzClaimTierLabel').textContent = event.target.selectedOptions[0].textContent;
  });
  overlay.querySelectorAll('[data-form],[data-form-switch],#bzForgotLink').forEach(el =>
    el.addEventListener('click', event => {
      event.preventDefault();
      selectForm(el.dataset.form || el.dataset.formSwitch || 'forgot');
    }));
  byId('bizLoginClose').addEventListener('click', close);
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') { close(); return; }
    if (event.key !== 'Tab') return;
    const visible = [...overlay.querySelectorAll('input, select, a[href], button')].filter(el =>
      !el.disabled && !el.closest('[style*="display: none"]') && !el.closest('[style*="display:none"]'));
    const first = visible[0], last = visible[visible.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  retry.addEventListener('click', restore);
  window.addEventListener('storage', event => {
    if (event.key === tokenKey || event.key === null) { generation++; hideDashboard(); location.reload(); }
  });
  window.addEventListener('pageshow', event => { if (event.persisted) { hideDashboard(); location.reload(); } });
  window.SLBizAccess = {
    token: () => verifiedToken === localStorage.getItem(tokenKey) ? verifiedToken : null,
    user: () => account, restore, logout
  };

  const params = new URLSearchParams(location.search);
  if (params.has('reset_token')) {
    location.replace('/business-reset-password.html#token='+encodeURIComponent(params.get('reset_token')));
  } else if (params.has('claim')) {
    byId('bzClaimName').value = params.get('claim');
    open('claim');
  } else if (params.get('login') === '1') open('login');
})();
