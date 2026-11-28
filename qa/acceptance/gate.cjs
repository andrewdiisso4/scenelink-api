'use strict';
const {createHmac, createHash, randomBytes, timingSafeEqual} = require('node:crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');

const COOKIE = '__Host-sl_acceptance';
const TTL = 4 * 60 * 60;
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const equal = (a, b) => timingSafeEqual(createHash('sha256').update(String(a)).digest(), createHash('sha256').update(String(b)).digest());
function destination(value) { return typeof value === 'string' && /^\/(?!\/)/.test(value) && !/[\\\r\n]/.test(value) && value.length < 2000 ? value : '/__acceptance/'; }
function signature(config, payload) { return createHmac('sha256', config.accessSecret).update(config.environmentId + '.' + payload).digest('base64url'); }
function issueCookie(config, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({exp:Math.floor(now / 1000) + TTL, nonce:randomBytes(12).toString('hex')})).toString('base64url');
  return payload + '.' + signature(config, payload);
}
function validCookie(config, header = '', now = Date.now()) {
  const matches = header.split(';').map(item => item.trim()).filter(item => item.startsWith(COOKIE + '='));
  if (matches.length !== 1) return false;
  const value = matches[0].slice(COOKIE.length + 1);
  if (value.length > 512 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return false;
  const [payload, mac] = value.split('.');
  if (!equal(mac, signature(config, payload))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return Number.isInteger(data.exp) && data.exp > now / 1000 && data.exp <= now / 1000 + TTL && /^[0-9a-f]{24}$/.test(data.nonce);
  } catch { return false; }
}
function shell(title, body) {
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escape(title) + '</title><style>body{font:16px system-ui;background:#10131c;color:#f6f6fb;margin:0;padding:32px}main{max-width:760px;margin:auto}h1{font-size:28px}a{color:#c9b7ff}input,button{font:inherit;padding:12px;border-radius:8px;margin:8px 0}input{display:block;box-sizing:border-box;width:100%;max-width:500px}button{background:#c4a9ff;border:0;color:#191025}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:10px;border-bottom:1px solid #394052}code{word-break:break-all}.note{padding:16px;background:#222736;border-radius:10px;line-height:1.6}</style><main><h1>' + escape(title) + '</h1>' + body + '</main></html>';
}
function unlockPage(next, message = '') {
  return shell('SceneLink isolated acceptance', '<p>Private test environment. All accounts and venues are fictional.</p><p>' + escape(message) + '</p><form action="/__acceptance/unlock" method="post"><label for="access-secret">Acceptance access secret</label><input id="access-secret" name="secret" type="password" autocomplete="current-password" required><input name="next" type="hidden" value="' + escape(destination(next)) + '"><button type="submit">Unlock test environment</button></form>');
}
function sendUnlock(res, next, status = 200, message = '') {
  // Native form POSTs under no-referrer serialize Origin as null. Preserve the
  // HTTPS origin without putting a locked deep link's path/query in Referer.
  return res.status(status).set('Referrer-Policy','strict-origin').type('html').send(unlockPage(next, message));
}
function installGate(app, config, {health = async () => true} = {}) {
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(async (req, res, next) => {
    res.set({'Content-Security-Policy':CSP, 'Cache-Control':'private, no-store', 'Referrer-Policy':'no-referrer',
      'X-Content-Type-Options':'nosniff', 'X-Frame-Options':'DENY', 'X-Robots-Tag':'noindex, nofollow, noarchive',
      'X-SceneLink-Acceptance':'synthetic-only'});
    if (req.path === '/__acceptance/health' && req.method === 'GET') {
      try { if (await health()) return res.json({status:'ok'}); } catch {}
      return res.status(503).json({status:'unavailable'});
    }
    const origin = req.get('origin');
    if ((origin && origin !== config.origin) || req.get('sec-fetch-site') === 'cross-site'
        || (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origin !== config.origin)) return res.status(403).json({error:'Same-origin acceptance request required'});
    next();
  });
  app.get('/__acceptance/unlock', (req, res) => sendUnlock(res, req.query.next));
  app.post('/__acceptance/unlock', rateLimit({windowMs:15*60*1000,max:15,standardHeaders:true,legacyHeaders:false}),
    express.urlencoded({extended:false,limit:'2kb'}), (req, res) => {
      if (typeof req.body.secret !== 'string' || !equal(req.body.secret, config.accessSecret)) return sendUnlock(res, req.body.next, 401, 'The access secret was not accepted.');
      res.setHeader('Set-Cookie', COOKIE + '=' + issueCookie(config) + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=' + TTL);
      res.redirect(303, destination(req.body.next));
    });
  app.use((req, res, next) => {
    if (validCookie(config, req.headers.cookie)) return next();
    if (req.path.startsWith('/api/') || /^\/__acceptance\/fixture-health\/?$/i.test(req.path)
        || !['GET','HEAD'].includes(req.method)) return res.status(401).json({error:'Unlock the isolated acceptance environment first',code:'ACCEPTANCE_LOCKED'});
    sendUnlock(res, req.originalUrl, 401);
  });
  app.post('/__acceptance/lock', (req, res) => {
    res.setHeader('Set-Cookie', COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
    res.redirect(303, '/__acceptance/unlock');
  });
}

module.exports = {COOKIE, TTL, CSP, escape, destination, issueCookie, validCookie, shell, installGate};
