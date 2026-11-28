'use strict';

// Only these two transactional messages may use this credential. No campaigns,
// password resets, contact notifications, account security mail or fallback retries.
const purposes = new Set(['signup-welcome', 'newsletter-confirm']);
const email = /^[^\s,@<>;\r\n]+@[^\s,@<>;\r\n]+\.[^\s,@<>;\r\n]+$/;
function create({env=process.env, fetcher=globalThis.fetch}={}) {
  const enabled = env.SIGNUP_MAIL_TRANSPORT === 'resend' && !env.ACCEPTANCE_MODE;
  const key = env.RESEND_SIGNUP_API_KEY || '';
  const cutoff = env.RESEND_SIGNUP_WELCOME_NOT_BEFORE || '';
  const validCutoff = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(cutoff) && Number.isFinite(Date.parse(cutoff));
  const ready = purpose => enabled && purposes.has(purpose) && /^re_[A-Za-z0-9_-]+$/.test(key) &&
    (purpose !== 'signup-welcome' || validCutoff);
  async function send(opts) {
    if (!ready(opts.purpose)) return {ok:false,skipped:true,reason:'mailer-not-ready'};
    const address = opts.to?.address;
    if (typeof address !== 'string' || !email.test(address) || /[^\x21-\x7e]/.test(address)) return {ok:false};
    try {
      const response = await fetcher('https://api.resend.com/emails', {
        method:'POST', redirect:'error', signal:AbortSignal.timeout(9500),
        headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
        body:JSON.stringify({from:'SceneLink <hello@mail.scenelink.app>',to:[address],
          reply_to:'info@scenelink.app',subject:opts.subject,html:opts.html,text:opts.text}),
      });
      if (!response.ok) return {ok:false};
      const result = await response.json();
      return typeof result?.id === 'string' && result.id ? {ok:true} : {ok:false};
    } catch (_) { return {ok:false}; }
  }
  return {selects:purpose => enabled && purposes.has(purpose), ready, send, welcomeNotBefore:validCutoff && enabled ? cutoff : null};
}
module.exports = {create};
