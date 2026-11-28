'use strict';
// Real Chromium -> canonical UI -> actual API -> disposable native PostgreSQL.
// Run only through the isolated acceptance launcher against an empty loopback DB.
// External mail, OAuth, uploads, models and maps remain disabled and unaccepted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const {spawn, execFileSync} = require('node:child_process');
const {Pool} = require('pg');
const moduleRoot = process.env.SCENELINK_BROWSER_MODULE_ROOT;
const {chromium} = require(moduleRoot ? path.join(moduleRoot, 'playwright') : 'playwright');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'evidence/account-social');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const steps = [], errors = [], requests = [];
let currentStage = 'setup', app, browser, pool, origin, page;
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd:ROOT, encoding:'utf8'}).trim();
const accessSecret = crypto.randomBytes(32).toString('hex');
const password = crypto.randomBytes(24).toString('base64url');
const memberID = 'b532045e-1a5f-4d78-950a-4daa0c801002';
const adminID = 'b532045e-1a5f-4d78-950a-4daa0c801001';
function note(name) { currentStage=name; console.log('[account-browser] '+name); }
async function freePort() { const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port; }
async function stage(name, action) { note(name); await action();steps.push({name,result:'passed'}); }
async function context(viewport={width:1440,height:1100}) {
  const ctx = await browser.newContext({viewport, serviceWorkers:'block', reducedMotion:'reduce'});
  await ctx.route('**/*', route => {
    const url = new URL(route.request().url());
    if(url.origin===origin || ['data:','blob:'].includes(url.protocol))return route.continue();
    return route.abort('blockedbyclient');
  });
  const p=await ctx.newPage(); p.setDefaultTimeout(10000);
  p.on('pageerror',e=>errors.push({stage:currentStage,message:e.message}));
  p.on('response',r=>{const u=new URL(r.url());if(u.origin===origin&&u.pathname.startsWith('/api/'))requests.push({method:r.request().method(),path:u.pathname,status:r.status()});});
  await p.goto(origin+'/profile.html');
  await p.locator('#access-secret').fill(accessSecret);
  await p.getByRole('button',{name:'Unlock test environment'}).click();
  await p.waitForFunction(()=>!!window.SLAuthUI);
  return {ctx,p};
}
async function openAuth(p,mode='login') {
  // Opening the shipped dialog through its public UI controller; all form entry
  // and submission below uses real rendered controls, with no session injection.
  await p.evaluate(mode=>window.SLAuthUI.open(mode),mode);
  await p.locator('.sl-auth-overlay.open').waitFor();
}
async function login(p,email) {
  await openAuth(p);await p.locator('#slLoginEmail').fill(email);await p.locator('#slLoginPassword').fill(password);
  await p.locator('#slLoginForm .sl-auth-submit').click();
  await p.waitForFunction(()=>window.SLAuth?.isAuthed()===true);
  await p.locator('.sl-auth-overlay.open').waitFor({state:'hidden'});
  await p.locator('#slSocialProfile .slsp-hero h1').waitFor();
}
async function shot(p,name,fullPage=false) {
  await p.screenshot({path:path.join(OUT,name+'.png'),fullPage,animations:'disabled'});
  const dimensions=await p.evaluate(()=>({width:innerWidth,body:document.documentElement.scrollWidth}));
  assert(dimensions.body<=dimensions.width+1,'No horizontal overflow: '+name+' '+JSON.stringify(dimensions));
}
async function verifyBannerClearance(p) {
  await p.locator('#slVerificationBanner').waitFor();
  await p.evaluate(()=>new Promise(requestAnimationFrame));
  const bounds=await p.evaluate(()=>({header:document.getElementById('mainHeader').getBoundingClientRect().bottom,banner:document.getElementById('slVerificationBanner').getBoundingClientRect().top}));
  assert(bounds.banner>=bounds.header-1,'Verification prompt clears the shared header: '+JSON.stringify(bounds));
}
async function search(p,query) {
  await p.locator('#slspTabFriends').click();await p.locator('#slspSearchInput').fill(query);
  await p.locator('#slspSearchForm [type=submit]').click();
  await p.locator('#slspSearchResults .slsp-person').waitFor();
}
async function db(sql,values=[]) {return (await pool.query(sql,values)).rows;}
async function waitUntil(fn,label,timeoutMs=5000) {for(let i=0;i<Math.ceil(timeoutMs/50);i++){if(await fn())return;await delay(50);}throw Error('Timed out: '+label);}
(async()=>{
  const database=new URL(process.env.TEST_DATABASE_URL||'');
  assert.equal(process.env.NODE_ENV,'test');assert.equal(process.env.SCENELINK_TEST_ALLOW_SCHEMA_INIT,'yes');
  assert(['postgres:','postgresql:'].includes(database.protocol));assert.equal(database.search,'');assert.equal(database.hash,'');
  assert(!/[?#]/.test(process.env.TEST_DATABASE_URL),'Database URL overrides are forbidden');
  assert(!fs.existsSync(path.join(ROOT,'.env'))&&!fs.existsSync(path.join(process.cwd(),'.env')),'Prepared checkout without .env required');
  assert.equal(database.hostname,'127.0.0.1');
  assert.equal(database.pathname,'/scenelink_release_qa_20261123_browser');assert(database.port);
  pool=new Pool({connectionString:database.href});
  assert.equal((await db("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'"))[0].n,0);
  const nativeVersion=(await db('SHOW server_version'))[0].server_version;
  const port=await freePort();origin='http://127.0.0.1:'+port;
  const env={...process.env,NODE_ENV:'test',DATABASE_URL:database.href,PORT:String(port),
    ACCEPTANCE_MODE:'isolated-synthetic',ACCEPTANCE_ENVIRONMENT_ID:'scenelink-release-qa-20261123',
    ACCEPTANCE_DB_NAME:database.pathname.slice(1),ACCEPTANCE_DB_HOST:'127.0.0.1',ACCEPTANCE_PUBLIC_ORIGIN:origin,
    ACCEPTANCE_ACCESS_SECRET:accessSecret,ACCEPTANCE_FIXTURE_PASSWORD:password,JWT_SECRET:crypto.randomBytes(48).toString('hex'),RENDER_GIT_COMMIT:sourceCommit};
  for(const key of Object.keys(env))if(/^(SMTP_|OPENAI_|GOOGLE_|APPLE_|APNS_|FCM_|CLOUDINARY_|SENTRY_|TICKETMASTER_|RESEND_|SENDGRID_|MAILGUN_)/.test(key)||['ADMIN_SECRET','RUN_ALL_SQL_MIGRATIONS'].includes(key))delete env[key];
  app=spawn(process.execPath,['qa/acceptance/start.cjs'],{cwd:ROOT,env,stdio:['ignore','pipe','pipe']});
  let appLog='';for(const stream of [app.stdout,app.stderr])stream.on('data',b=>{appLog=(appLog+b.toString()).slice(-6000);});
  await waitUntil(async()=>{if(app.exitCode!==null)throw Error('Isolated app exited: '+appLog);try{return (await fetch(origin+'/__acceptance/health')).ok;}catch{return false;}},'isolated health',30000);
  fs.mkdirSync(OUT,{recursive:true});
  // This directory contains generated QA evidence. A failed rerun must never
  // upload a previous successful receipt or screenshots it did not recapture.
  for(const name of fs.readdirSync(OUT)){
    const file=path.join(OUT,name);if(/\.(png|json)$/.test(name)&&fs.lstatSync(file).isFile())fs.unlinkSync(file);
  }
  browser=await chromium.launch({...(process.env.SCENELINK_CHROMIUM?{executablePath:process.env.SCENELINK_CHROMIUM}:{}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const member=await context();page=member.p;
  await stage('Desktop and mobile login, signup, recovery visuals',async()=>{
    await openAuth(page);await page.locator('.sl-auth-official-logo').evaluate(img=>img.decode());await shot(page,'login-desktop');
    await page.setViewportSize({width:390,height:844});await shot(page,'login-mobile');
    const closeSize=await page.locator('.sl-auth-close').boundingBox();assert(closeSize.width>=44&&closeSize.height>=44,'Auth close target is at least 44px in both dimensions');
    assert((await page.locator('#slLoginEmail').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)))>=16,'Mobile auth inputs retain readable 16px text');
    await page.locator('[data-tab=signup]').click();await shot(page,'signup-mobile');
    await page.locator('#slSignupForm .sl-auth-submit').scrollIntoViewIfNeeded();await shot(page,'signup-mobile-submit');
    await page.locator('[data-tab=login]').click();await page.locator('[data-action=forgot]').click();await shot(page,'recovery-mobile');
    await page.locator('#slRecoveryEmail').fill('qa.member@example.invalid');await page.locator('#slRecoveryForm .sl-auth-submit').click();
    await page.locator('[data-sl-error].show').waitFor();assert.match(await page.locator('[data-sl-error]').textContent(),/could not confirm/);
    assert.equal(await page.locator('[data-sl-success].show').count(),0);
    const contrast=await page.locator('[data-sl-error]').evaluate(el=>{
      const css=getComputedStyle(el),lum=value=>{const rgb=value.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
      const fg=lum(css.color),bg=lum(css.backgroundColor);return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);
    });
    assert(contrast>=4.5,'Auth error text retains at least 4.5:1 contrast');await shot(page,'recovery-error-mobile');
    await page.locator('.sl-auth-close').click();await page.setViewportSize({width:1440,height:1100});
  });
  await stage('Real password sign-in and profile customization persist through reload',async()=>{
    await login(page,'qa.member@example.invalid');
    await page.locator('[data-action=edit]').click();
    await page.locator('#slspEditForm [name=display_name]').fill('Casey · QA member');
    await page.locator('#slspEditForm [name=bio]').fill('Fictional account for SceneLink release testing. Coffee, live music, and plans with friends.');
    await page.locator('#slspEditForm [name=neighborhood]').fill('South End');
    await page.locator('#slspEditForm [name=city]').fill('Boston');
    await page.locator('#slspEditForm [name=social_instagram]').fill('https://www.instagram.com/scenelink_qa_fixture/');
    await page.locator('#slspEditForm [type=submit]').click();
    await page.waitForFunction(()=>document.querySelector('#slspActionStatus')?.textContent.includes('Profile saved and read back'));
    const saved=(await db('SELECT display_name,bio,city,social_links,profile_revision FROM users WHERE id=$1',[memberID]))[0];
    assert.equal(saved.display_name,'Casey · QA member');assert.equal(saved.city,'Boston');assert.equal(saved.social_links[0].provider,'instagram');assert(saved.profile_revision>0);
    await page.reload();await page.locator('#slSocialProfile .slsp-hero h1').waitFor();assert.equal(await page.locator('#slSocialProfile .slsp-hero h1').textContent(),saved.display_name);
    await shot(page,'profile-desktop');await page.setViewportSize({width:390,height:844});await shot(page,'profile-mobile');
    await page.locator('[data-action=edit]').click();
    await page.locator('#slspEdit').evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));await shot(page,'profile-editor-mobile');
    await page.locator('[data-action=cancel-edit]').click();await page.setViewportSize({width:1440,height:1100});
  });
  await stage('A single real consumer session carries across discovery, social, RSVP and business header',async()=>{
    for(const route of ['/explore.html','/events.html','/messages.html','/social-feed.html','/my-lists.html','/plan-with-friends.html','/business.html','/contact.html']){
      const verifiedSession=page.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname==='/api/auth/me'&&r.status()===200);
      await page.goto(origin+route,{waitUntil:'domcontentloaded'});
      assert.equal((await (await verifiedSession).json()).user.id,memberID,route+' real session');
      await page.waitForFunction(id=>window.SLAuth?.user()?.id===id,memberID);
      assert.equal(await page.evaluate(()=>!!window.SLAuth.token()),true,route);
      await page.locator('.slus-input').waitFor({state:'visible'});
      assert.equal(await page.locator('.slus-input').count(),1,route);
      assert.equal(await page.locator('.sl-auth-overlay.open').count(),0,route);
    }
    await page.goto(origin+'/profile.html',{waitUntil:'domcontentloaded'});
    await page.locator('#slSocialProfile .slsp-hero h1').waitFor();
    assert.equal(await page.locator('#slSocialProfile .slsp-hero h1').textContent(),'Casey · QA member');
  });
  const friend=await context();
  await stage('Search, request, recipient acceptance and shared friendship state',async()=>{
    await login(friend.p,'qa.admin@example.invalid');await search(page,'qa_admin');
    await page.locator('#slspSearchResults [data-action=request]').click();
    await waitUntil(async()=>!!(await db("SELECT 1 FROM friendships WHERE requester_id=$1 AND user_a_id=LEAST($1::uuid,$2::uuid) AND user_b_id=GREATEST($1::uuid,$2::uuid) AND status='pending'",[memberID,adminID])).length,'pending request');
    await friend.p.locator('#slspTabFriends').click();await friend.p.locator('#slspRequests [data-action=accept]').waitFor();
    await friend.p.locator('#slspRequests [data-action=accept]').click();
    await waitUntil(async()=>!!(await db("SELECT 1 FROM friendships WHERE requester_id=$1 AND user_a_id=LEAST($1::uuid,$2::uuid) AND user_b_id=GREATEST($1::uuid,$2::uuid) AND status='accepted'",[memberID,adminID])).length,'accepted request');
    await page.locator('[data-action=friends]').first().click();await page.locator('#slspFriends .slsp-person').waitFor();
    assert.equal(await page.locator('#slspFriends a[href*="/messages?to="]').count(),1);
    await waitUntil(async()=>(await page.locator('#slspSearchResults [data-action=remove]').textContent())==='Remove friend','search reflects accepted friendship');
    assert.equal(await page.locator('#slspActionStatus').textContent(),'');
    await page.setViewportSize({width:390,height:844});
    await page.locator('#slspPanelFriends').evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));await shot(page,'friends-mobile');
    await page.setViewportSize({width:1440,height:1100});
  });
  await stage('Privacy settings remove messaging and blocks remove friendship',async()=>{
    await friend.p.locator('#slspTabSettings').click();await friend.p.locator('#slspSettingsForm [name=allow_messages]').selectOption('none');
    await friend.p.locator('#slspSettingsForm [name=is_private]').check();await friend.p.locator('#slspSettingsForm [type=submit]').click();
    await friend.p.waitForFunction(()=>document.querySelector('#slspActionStatus')?.textContent.includes('Privacy settings saved and read back'));
    await page.locator('[data-action=friends]').first().click();await waitUntil(async()=>(await page.locator('#slspFriends a[href*="/messages?to="]').count())===0,'message control removed');
    await page.goto(origin+'/profile?u='+adminID);await page.locator('#slSocialProfile [data-action=block]').waitFor();
    page.on('dialog',dialog=>dialog.accept());await page.locator('#slSocialProfile [data-action=block]').click();
    await waitUntil(async()=>!!(await db('SELECT 1 FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2',[memberID,adminID])).length,'block persisted');
    assert.equal((await db("SELECT 1 FROM friendships WHERE user_a_id=LEAST($1::uuid,$2::uuid) AND user_b_id=GREATEST($1::uuid,$2::uuid) AND status IN ('accepted','pending')",[memberID,adminID])).length,0);
    await page.goto(origin+'/profile#settings');await page.locator('#slspBlocked [data-action=unblock]').waitFor();await page.locator('#slspBlocked [data-action=unblock]').click();
    await waitUntil(async()=>(await db('SELECT 1 FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2',[memberID,adminID])).length===0,'unblock persisted');
    assert.equal((await db("SELECT 1 FROM friendships WHERE (user_a_id=$1 OR user_b_id=$1) AND status IN ('accepted','pending')",[memberID])).length,0);
  });
  await stage('Cross-tab logout clears private state and revokes the session',async()=>{
    const second=await member.ctx.newPage();await second.goto(origin+'/profile');await second.locator('#slSocialProfile .slsp-hero h1').waitFor();
    const before=await page.evaluate(()=>window.SLAuth.token()); // Never recorded in logs/artifacts.
    await page.locator('#slspTabSettings').click();
    await page.locator('#slAcctLogout').click();await second.waitForFunction(()=>!window.SLAuth?.token());
    await second.waitForFunction(()=>!document.querySelector('#slAcctSettings'));
    const hash=crypto.createHash('sha256').update(before).digest('hex');
    await waitUntil(async()=>!!(await db('SELECT 1 FROM auth_revocations WHERE token_hash=$1',[hash])).length,'canonical token revocation');
    await page.waitForURL(origin+'/');await second.close();await page.goto(origin+'/profile');await page.waitForFunction(()=>!!window.SLAuthUI);
  });
  let newUser;
  await stage('Real signup queues one welcome email without a delivery claim',async()=>{
    await openAuth(page,'signup');
    await page.locator('#slSignupForm [name=display_name]').fill('Morgan · QA signup');await page.locator('#slSignupForm [name=username]').fill('qa_new_member');
    await page.locator('#slSignupForm [name=email]').fill('qa.signup@example.invalid');await page.locator('#slSignupForm [name=password]').fill(password);
    assert.equal(await page.locator('#slSignupForm [name=display_name]').inputValue(),'Morgan · QA signup','Signup focus preserves the display name');
    assert.equal(await page.locator('#slSignupForm [name=username]').inputValue(),'qa_new_member','Signup focus preserves the username');
    await page.locator('#slSignupForm .sl-auth-submit').click();await page.waitForFunction(()=>window.SLAuth?.isAuthed()===true);
    await page.locator('.sl-auth-overlay.open').waitFor({state:'hidden'});await page.locator('#slSocialProfile .slsp-hero h1').waitFor();
    await verifyBannerClearance(page);await shot(page,'new-account-desktop');await page.setViewportSize({width:390,height:844});await verifyBannerClearance(page);await shot(page,'new-account-mobile');
    await page.locator('#slspTabSettings').click();await page.locator('#slAcctDeleteBtn').waitFor();
    await page.locator('#slAcctSettings').evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));await shot(page,'account-settings-mobile');
    newUser=(await db("SELECT id FROM users WHERE email='qa.signup@example.invalid'"))[0];assert(newUser);
    const queued=await db('SELECT status FROM signup_welcome_emails WHERE user_id=$1',[newUser.id]);assert.deepEqual(queued,[{status:'pending'}]);
  });
  await stage('In-app permanent deletion clears the account, queue and current session',async()=>{
    await page.locator('#slAcctDeleteBtn').click();await page.locator('#slAcctPw').waitFor();
    await page.setViewportSize({width:390,height:844});await shot(page,'delete-mobile');
    await page.locator('#slAcctConfirm').fill('DELETE');await page.locator('#slAcctPw').fill(password);await page.locator('#slAcctConfirmBtn').click();
    await page.waitForFunction(()=>document.body.textContent.includes('Account deleted'));
    assert.equal((await db('SELECT 1 FROM users WHERE id=$1',[newUser.id])).length,0);
    assert.equal((await db('SELECT 1 FROM signup_welcome_emails WHERE user_id=$1',[newUser.id])).length,0);
    const receipt=(await db('SELECT user_id,email_hash,ip_address,deletion_reason FROM user_deletions WHERE user_id=$1',[newUser.id]))[0];
    assert(receipt);assert.equal(receipt.email_hash,null);assert.equal(receipt.ip_address,null);assert.equal(receipt.deletion_reason,null);
    assert.equal(await page.evaluate(()=>window.SLAuth.token()),'');
    assert.equal((await db('SELECT 1 FROM users WHERE id=ANY($1::uuid[])',[[memberID,adminID]])).length,2);
  });
  await stage('Isolated recovery screens and branded welcome email render at mobile and desktop widths',async()=>{
    await page.goto(origin+'/reset-password.html#token='+'a'.repeat(64));
    await page.locator('#newPassword:enabled').waitFor();assert(!page.url().includes('token'));
    await shot(page,'reset-mobile');
    await page.goto(origin+'/verify-email.html#token='+'b'.repeat(64));await page.locator('.sl-account-card').waitFor();assert(!page.url().includes('token'));
    await shot(page,'verify-mobile');
    const emailCtx=await browser.newContext({viewport:{width:900,height:1150},reducedMotion:'reduce'});const emailPage=await emailCtx.newPage();
    await emailCtx.route('**/*',route=>{
      const url=route.request().url();
      if(url==='https://scenelink.app/images/brand/welcome-scenelink-logo.png')return route.fulfill({contentType:'image/png',body:fs.readFileSync(path.join(ROOT,'web/frontend/images/brand/welcome-scenelink-logo.png'))});
      if(url.startsWith(origin+'/__welcome-preview/')){const variant=url.endsWith('/verified')?'verified':'unverified';return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(ROOT,'evidence/welcome-email',variant+'.html'))});}
      return route.abort('blockedbyclient');
    });
    for(const variant of ['unverified','verified']){
      await emailPage.goto(origin+'/__welcome-preview/'+variant);await emailPage.locator('img').first().waitFor();await emailPage.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
      await emailPage.setViewportSize({width:900,height:1150});await shot(emailPage,'welcome-'+variant+'-desktop',true);
      await emailPage.setViewportSize({width:390,height:1100});await shot(emailPage,'welcome-'+variant+'-mobile',true);
      await emailPage.route('**/welcome-scenelink-logo.png', route=>route.abort('blockedbyclient'));
      await emailPage.reload();
      await emailPage.getByText('Eat. Drink. Discover.',{exact:true}).waitFor({state:'visible'});
      await emailPage.getByRole('heading',{name:'Welcome to SceneLink',exact:true}).waitFor({state:'visible'});
      assert.equal(await emailPage.getByRole('link',{name:'Explore Boston',exact:true}).getAttribute('href'),'https://scenelink.app/explore.html');
      assert.equal(await emailPage.getByRole('link',{name:variant==='verified'?'Set up your profile':'Open your profile',exact:true}).getAttribute('href'),'https://scenelink.app/profile.html');
      assert(await emailPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'welcome must fit without its remote image');
      await shot(emailPage,'welcome-'+variant+'-images-blocked',true);
      await emailPage.unroute('**/welcome-scenelink-logo.png');
    }
    const newsletter=require('../src/services/mailer').newsletterConfirmEmail('T'.repeat(43));
    for(const width of [320,390,900]){
      await emailPage.setViewportSize({width,height:800});
      await emailPage.setContent(newsletter.html);
      const cancel=emailPage.getByRole('link',{name:'cancel this signup or unsubscribe',exact:true});
      assert.equal(await cancel.evaluate(link=>getComputedStyle(link).color),'rgb(247, 215, 134)');
      assert(await emailPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'newsletter must fit without horizontal scrolling');
      await shot(emailPage,'newsletter-'+width,true);
    }
    await emailCtx.close();
  });
  assert.deepEqual(errors,[],'No uncaught JavaScript errors in tested real pages');
  const sourceFiles=['src/launch/identity.js','src/launch/people.js','src/launch/media.js','src/launch/messages.js','src/launch/session.js','src/routes/oauth.js','src/services/mailer.js','web/frontend/js/sl-auth-core.js','web/frontend/js/sl-auth-ui.js','web/frontend/js/sl-bundle-7d.js','web/frontend/js/sl-social-profile.js','web/frontend/js/sl-social-messages.js','web/frontend/js/sl-account-settings.js','web/frontend/js/sl-reset-password.js','web/frontend/js/sl-email-verification.js','web/frontend/js/sl-verification-banner.js','web/frontend/css/sl-social-profile.css','web/frontend/css/sl-auth-ui.css','web/frontend/css/sl-account-entry.css','web/frontend/css/sl-bundle-7d.css','web/frontend/css/sl-design-system.css'];
  const receipt={scope:'isolated fictional browser acceptance; no real-provider or iOS certification',native_postgres:nativeVersion,browser:await browser.version(),tested_commit:sourceCommit,workflow_run_id:process.env.GITHUB_RUN_ID||null,
    source_sha256:Object.fromEntries(sourceFiles.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,file))).digest('hex')])),steps,api_responses:requests,uncaught_errors:errors,
    limitations:['SMTP inbox delivery not tested','Real Apple/Google OAuth not tested','Cloudinary upload and external cleanup not tested','Physical iOS, native accessibility and signed App Store build not tested','Recovery token validation uses separate route/DOM tests; these screenshots do not certify email delivery']};
  fs.writeFileSync(path.join(OUT,'browser-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log('[account-browser] '+steps.length+' stages passed; artifacts: evidence/account-social');
})().catch(async error=>{
  if(page){try{
    fs.mkdirSync(OUT,{recursive:true});
    await page.screenshot({path:path.join(OUT,'failure.png'),fullPage:true});
    const visibleErrors=await page.locator('.sl-auth-error.show, .slsp-status[data-kind=error]').allTextContents();
    fs.writeFileSync(path.join(OUT,'failure-receipt.json'),JSON.stringify({stage:currentStage,tested_commit:sourceCommit,completed_steps:steps,api_responses:requests,uncaught_errors:errors,visible_error_copy:visibleErrors},null,2)+'\n');
  }catch{}}
  console.error('[account-browser] FAILED at '+currentStage+': '+error.stack);process.exitCode=1;
}).finally(async()=>{
  if(browser)await browser.close();
  if(app&&app.exitCode===null){app.kill('SIGTERM');await Promise.race([new Promise(resolve=>app.once('exit',resolve)),delay(5000)]);if(app.exitCode===null)app.kill('SIGKILL');}
  if(pool)await pool.end();
});
