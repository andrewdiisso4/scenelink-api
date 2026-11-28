'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');const root=path.resolve(__dirname,'../frontend');
const tick=()=>new Promise(r=>setTimeout(r,30));
const ME='10000000-0000-4000-8000-000000000001',PEER='10000000-0000-4000-8000-000000000002',CID='20000000-0000-4000-8000-000000000001';
async function make(t,{token='session-a',handle,search=''}={}){
 const d=new JSDOM('<!doctype html><html><head></head><body><div id="socialLanding">Guest landing</div><div id="socialFeed"><button class="sf-tab active" data-tab="all" aria-pressed="true">All Activity</button><button class="sf-tab" data-tab="friends" aria-pressed="false">Friends &amp; You</button><div class="sf-create"><button class="sf-create-action" data-act="visit">Log a visit</button><div id="sfUserAvatar"></div><input id="sfCreateInput"><button id="sfPostBtn">Post</button></div><div id="sfFeedContent"></div><aside class="sf-sidebar"><div class="sf-sidebar-card"><div class="sf-sidebar-title">People</div><div id="sfSuggestions"></div></div><div id="sfTrending"></div><span id="sfStatCheckins"></span><span id="sfStatReviews"></span><span id="sfStatSaved"></span><span id="sfStatScene"></span></aside></div></body></html>',{url:'https://scenelink.test/social-feed'+search,runScripts:'outside-only',pretendToBeVisual:true}),w=d.window;t.after(()=>w.close());if(token)w.localStorage.setItem('sl_jwt_token',token);w.AbortController=AbortController;
 const calls=[];w.fetch=async(url,opts={})=>{const call={url:String(url),token:opts.headers?.Authorization,method:opts.method,body:opts.body?JSON.parse(opts.body):null};calls.push(call);const reply=handle&&await handle(call);if(reply&&reply.networkFailure)throw Error('Simulated isolated connection loss');if(reply&&reply.httpStatus)return new Response(JSON.stringify(reply.data||{}),{status:reply.httpStatus});let data=reply;
 if(!data){if(call.url==='/api/posts'&&call.method==='POST')data={post:{id:call.body.client_id}};else if(call.url.includes('/users/me'))data={user:{id:ME,display_name:call.token==='Bearer session-b'?'NEW ACCOUNT':'OLD ACCOUNT'}};else if(call.url.includes('/posts/feed'))data={items:[{id:'post1',kind:'post',user_id:PEER,body:call.token==='Bearer session-b'?'NEW PRIVATE POST':'OLD PRIVATE POST',display_name:'Peer',created_at:'2026-11-08T00:00:00Z'}]};else if(call.url.includes('/conversations'))data={conversations:[{id:CID,participants:[{id:ME,display_name:'Me'},{id:PEER,display_name:'Named Peer'}],last_message:'PRIVATE PREVIEW',unread_count:1}]};else if(call.url.includes('/friends/pending'))data={incoming:[]};else if(call.url.includes('/suggestions'))data={suggestions:[]};else if(call.url.includes('/media/capability'))data={enabled:false};else data={};}
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
 };
 w.eval(fs.readFileSync(path.join(root,'js/sl-social-core.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'js/sl-social-feed-9a.js'),'utf8'));await tick();
 return{w,calls,$:id=>w.document.getElementById(id),change(next,type='sl-auth-changed'){if(next)w.localStorage.setItem('sl_jwt_token',next);else w.localStorage.removeItem('sl_jwt_token');w.dispatchEvent(type==='storage'?new w.StorageEvent('storage',{key:'sl_jwt_token'}):new w.Event(type));}};
}
test('feed starts on canonical sign-in event without a page reload',async t=>{const m=await make(t,{token:null});assert.equal(m.$('socialFeed').style.display,'none');m.change('session-a');await tick();assert.notEqual(m.$('socialFeed').style.display,'none');assert.match(m.$('sfFeedContent').textContent,/OLD PRIVATE POST/);});
test('cross-tab logout clears private feed, composer and preview DOM',async t=>{const m=await make(t);m.$('sfCreateInput').value='PRIVATE DRAFT';assert.match(m.$('sfFeedContent').textContent,/OLD PRIVATE POST/);m.change(null,'storage');await tick();assert.equal(m.$('socialFeed').style.display,'none');assert.equal(m.$('sfCreateInput').value,'');assert(!m.w.document.body.textContent.includes('OLD PRIVATE POST'));assert(!m.w.document.body.textContent.includes('PRIVATE PREVIEW'));assert(!m.w.document.body.textContent.includes('OLD ACCOUNT'));});
test('account switch clears prior draft and ignores delayed prior-account feed response',async t=>{let release;const m=await make(t,{handle:c=>c.url.includes('/posts/feed')&&c.token==='Bearer session-a'?new Promise(r=>release=r):null});m.$('sfCreateInput').value='OLD DRAFT';m.change('session-b','storage');await tick();assert.match(m.$('sfFeedContent').textContent,/NEW PRIVATE POST/);assert.equal(m.$('sfCreateInput').value,'');release({items:[{id:'old',kind:'post',body:'LATE OLD PRIVATE POST'}]});await tick();assert.match(m.$('sfFeedContent').textContent,/NEW PRIVATE POST/);assert(!m.w.document.body.textContent.includes('LATE OLD'));});
test('duplicate same-session auth events preserve unsent post draft and avoid duplicate feed loads',async t=>{const m=await make(t);m.$('sfCreateInput').value='CURRENT DRAFT';const n=m.calls.filter(c=>c.url.includes('/posts/feed')).length;m.w.dispatchEvent(new m.w.Event('sl-auth-ready'));m.w.document.dispatchEvent(new m.w.Event('sl-auth-change'));await tick();assert.equal(m.$('sfCreateInput').value,'CURRENT DRAFT');assert.equal(m.calls.filter(c=>c.url.includes('/posts/feed')).length,n);});
test('message previews link to canonical conversation and display actual participant',async t=>{const m=await make(t);const a=m.$('sfMsgList').querySelector('a');assert.equal(new URL(a.href).searchParams.get('conversation'),CID);assert.match(a.textContent,/Named Peer/);});
test('delayed prior account sidebar and account responses cannot repopulate cleared DOM',async t=>{
 const pending=[];const m=await make(t,{handle:c=>c.token==='Bearer session-a'&&(/conversations|suggestions|social\/summary/.test(c.url))?new Promise(r=>pending.push(r)):null});m.change(null,'storage');await tick();pending.forEach(r=>r({conversations:[{id:CID,participants:[{id:PEER,display_name:'OLD SECRET NAME'}],last_message:'OLD SECRET MESSAGE'}],suggestions:[{id:PEER,display_name:'OLD SECRET SUGGESTION'}],checkins:777}));await tick();assert(!m.w.document.body.textContent.includes('OLD SECRET'));assert.equal(m.$('sfStatCheckins').textContent,'—');assert(!m.$('sfMessagesCard'));
});
test('delayed initial account response cannot reactivate feed after logout',async t=>{let release;const m=await make(t,{handle:c=>c.url.includes('/users/me')?new Promise(r=>release=r):null});m.change(null,'storage');release({user:{id:ME,display_name:'LATE OLD ACCOUNT'}});await tick();assert.equal(m.$('socialFeed').style.display,'none');assert(!m.w.document.body.textContent.includes('LATE OLD ACCOUNT'));assert.equal(m.calls.filter(c=>c.url.includes('/posts/feed')).length,0);});
test('deleted message preview never renders old body',async t=>{const m=await make(t,{handle:c=>c.url.includes('/conversations')?{conversations:[{id:CID,participants:[{id:PEER,display_name:'Peer'}],last_message:'DELETED SECRET',last_message_deleted:true}]}:null});assert.match(m.$('sfMsgList').textContent,/Message deleted/);assert(!m.$('sfMsgList').textContent.includes('DELETED SECRET'));});
function submit(m){m.$('sfCreateInput').dispatchEvent(new m.w.KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true}));}
test('repeated keyboard submit while posting sends a single idempotent post and preserves newer draft',async t=>{let release;const m=await make(t,{handle:c=>c.url==='/api/posts'?new Promise(r=>release=()=>r({post:{id:c.body.client_id}})):null});m.$('sfCreateInput').value='First post';submit(m);submit(m);await tick();const posts=m.calls.filter(c=>c.url==='/api/posts');assert.equal(posts.length,1);assert.match(posts[0].body.client_id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);m.$('sfCreateInput').value='Newer unsent draft';release();await tick();assert.equal(m.$('sfCreateInput').value,'Newer unsent draft');assert.equal(m.$('sfPostBtn').disabled,false);assert.match(m.$('sfPostStatus').textContent,/Post saved/);});
test('uncertain same-content retry reuses ID; edited draft starts a new submission',async t=>{const m=await make(t,{handle:c=>c.url==='/api/posts'?{networkFailure:true}:null});m.$('sfCreateInput').value='Unconfirmed draft';submit(m);await tick();submit(m);await tick();let posts=m.calls.filter(c=>c.url==='/api/posts');assert.equal(posts.length,2);assert.equal(posts[0].body.client_id,posts[1].body.client_id);m.$('sfCreateInput').value='Changed draft';submit(m);await tick();posts=m.calls.filter(c=>c.url==='/api/posts');assert.notEqual(posts[1].body.client_id,posts[2].body.client_id);assert.equal(m.$('sfCreateInput').value,'Changed draft');assert.match(m.$('sfPostStatus').textContent,/without changing/);});
test('session switch clears uncertain post ID and delayed send cannot erase next account draft',async t=>{let release;const m=await make(t,{handle:c=>c.url==='/api/posts'&&c.token==='Bearer session-a'?new Promise(r=>release=()=>r({post:{id:c.body.client_id}})):c.url==='/api/posts'?{networkFailure:true}:null});m.$('sfCreateInput').value='Same content';submit(m);await tick();m.change('session-b','storage');await tick();m.$('sfCreateInput').value='Same content';submit(m);await tick();release();await tick();const posts=m.calls.filter(c=>c.url==='/api/posts');assert.equal(posts.length,2);assert.notEqual(posts[0].body.client_id,posts[1].body.client_id);assert.equal(m.$('sfCreateInput').value,'Same content');assert(!m.$('sfPostStatus').textContent.includes('Post saved'));});
test('unconfirmed success shape retains draft and retry ID',async t=>{const m=await make(t,{handle:c=>c.url==='/api/posts'?{ok:true}:null});m.$('sfCreateInput').value='Keep this draft';submit(m);await tick();submit(m);await tick();const posts=m.calls.filter(c=>c.url==='/api/posts');assert.equal(posts[0].body.client_id,posts[1].body.client_id);assert.equal(m.$('sfCreateInput').value,'Keep this draft');assert.match(m.$('sfPostStatus').textContent,/did not confirm/);});

const visit=(id,user_id=PEER,audience='friends')=>({id,kind:'checkin',display_name:'Test member',user_id,audience,body:'VISIT '+id,venue_id:CID,venue_slug:'stale-venue-slug',venue_name:'Boston test place',created_at:'2026-11-18T23:00:00Z'});
function scope(m,name){m.w.document.querySelector('.sf-tab[data-tab="'+name+'"]').click();}
test('Friends & You uses server scope on every page and drops a delayed All response',async t=>{
 let all,first=true;
 const m=await make(t,{handle:c=>{
  if(!c.url.includes('/posts/feed'))return;
  if(c.url.includes('scope=friends'))return c.url.includes('cursor=friend%2Bpage')?{items:[visit('page2')]}:{items:[visit('page1')],has_more:true,next_cursor:'friend+page'};
  if(first){first=false;return new Promise(r=>all=r);}
  return {items:[visit('NEW ALL')]};
 }});
 scope(m,'friends');await tick();
 assert.equal(m.w.document.querySelector('[data-tab=friends]').getAttribute('aria-pressed'),'true');
 assert.match(m.$('sfFeedContent').textContent,/logged a visit at Boston test place/);
 const link=m.$('sfFeedContent').querySelector('a[href^="/explore?venue="]');
 assert.equal(link.getAttribute('href'),'/explore?venue='+CID);
 m.$('sfLoadMore').click();await tick();assert.match(m.$('sfFeedContent').textContent,/VISIT page2/);
 assert(m.calls.some(c=>/scope=friends.*cursor=friend%2Bpage/.test(c.url)));
 all({items:[visit('LATE ALL')]});await tick();
 assert(!m.$('sfFeedContent').textContent.includes('LATE ALL'));
 scope(m,'all');await tick();assert.match(m.$('sfFeedContent').textContent,/NEW ALL/);
});
test('visit visibility is labeled for owner and POST summary cannot substitute for visits',async t=>{
 const m=await make(t,{handle:c=>c.url.includes('/posts/feed')?{items:[visit('private',ME,'private'),visit('shared',ME),visit('other')]}:c.url.includes('/social/summary')?{posts:99}:null});
 const cards=m.$('sfFeedContent').querySelectorAll('[data-kind=checkin]');
 assert.match(cards[0].textContent,/Only you/);assert.match(cards[1].textContent,/Shared with accepted friends/);
 assert.doesNotMatch(cards[2].textContent,/Only you|Shared with accepted friends/);
 assert.equal(m.$('sfStatCheckins').textContent,'—');
});
test('malformed Friends load retries without rendering stale or fake empty state',async t=>{
 let requests=0;
 const m=await make(t,{handle:c=>c.url.includes('scope=friends')?(++requests===1?{items:[null]}:{items:[]}):null});
 scope(m,'friends');await tick();assert.match(m.$('sfFeedContent').textContent,/Could not load this activity/);
 assert.doesNotMatch(m.$('sfFeedContent').textContent,/OLD PRIVATE POST|No friend activity/);
 m.$('sfRetryFeed').click();await tick();assert.match(m.$('sfFeedContent').textContent,/No friend activity yet/);
 assert.equal(requests,2);
});
test('venue selection opens exact venue detail without writing or touching composer draft',async t=>{
 const m=await make(t,{handle:c=>c.url.includes('/venues/search')?{venues:[{id:CID,name:'Boston test place'}]}:null});
 let opened;m.w.SLVenueDetail={open:id=>opened=id};
 m.$('sfCreateInput').value='Unsent post text';
 m.w.document.querySelector('[data-act=visit]').click();
 const input=m.$('sfVenueSearch');input.value='boston';input.dispatchEvent(new m.w.Event('input',{bubbles:true}));
 for(let i=0;i<20&&!m.$('sfVenueResults').querySelector('a');i++)await tick();
 m.$('sfVenueResults').querySelector('a').click();
 assert.equal(opened,CID);assert.equal(m.$('sfCreateInput').value,'Unsent post text');
 assert(!m.calls.some(c=>c.method==='POST'));
});
test('confirmed visit event refreshes the same scoped feed only for the active session',async t=>{
 const m=await make(t);scope(m,'friends');await tick();
 const n=m.calls.filter(c=>c.url.includes('/posts/feed')).length;
 m.w.dispatchEvent(new m.w.Event('sl-checkins-changed'));await tick();
 assert.equal(m.calls.filter(c=>c.url.includes('/posts/feed')).length,n+1);
 assert(m.calls.filter(c=>c.url.includes('/posts/feed')).at(-1).url.includes('scope=friends'));
 m.change(null);m.w.dispatchEvent(new m.w.Event('sl-checkins-changed'));await tick();
 assert.equal(m.calls.filter(c=>c.url.includes('/posts/feed')).length,n+1);
});


const POST='30000000-0000-4000-8000-000000000001',OTHER='30000000-0000-4000-8000-000000000002';
const post=(id=POST,audience='public',extra={})=>({id,kind:'post',audience,user_id:PEER,display_name:'Fictional poster',body:'Fictional post',like_count:2,comment_count:0,created_at:'2026-11-18T23:00:00Z',...extra});
test('share copies only the canonical URL for ordinary public posts; restricted and reference posts never offer sharing',async t=>{
 const m=await make(t,{handle:c=>c.url.includes('/posts/feed')?{items:[post(),post(OTHER,'friends'),post(CID,'public',{ref_type:'list_share'}),post(ME,'private')]}:null});
 const buttons=m.$('sfFeedContent').querySelectorAll('.sf-share');assert.equal(buttons.length,1);
 let captured;Object.defineProperty(m.w.navigator,'clipboard',{value:{writeText(url){captured=url;return Promise.resolve();}}});
 buttons[0].click();await tick();
 assert.equal(captured,'https://scenelink.test/social-feed?post='+POST);assert.doesNotMatch(captured,/Fictional|session/);
 assert.match(m.$('sfFeedContent').querySelector('.sf-action-status').textContent,/Link copied.*sign in/);
 assert(!m.calls.some(c=>c.method==='POST'));
});
test('clipboard denial provides manual copy without claiming success',async t=>{
 const m=await make(t,{handle:c=>c.url.includes('/posts/feed')?{items:[post()]}:null});
 Object.defineProperty(m.w.navigator,'clipboard',{value:{writeText(){return Promise.reject(Error('denied'));}}});
 m.$('sfFeedContent').querySelector('.sf-share').click();await tick();
 const input=m.$('sfFeedContent').querySelector('.sf-share-fallback input');
 assert.equal(input.value,'https://scenelink.test/social-feed?post='+POST);
 assert(input.readOnly);assert(!input.parentElement.hidden);
 assert.doesNotMatch(m.$('sfFeedContent').querySelector('.sf-action-status').textContent,/copied/i);
});
test('a shared link requests its exact post under viewer authorization and opens likes and comments',async t=>{
 let release;
 const m=await make(t,{search:'?post='+POST,handle:c=>{
  if(c.url==='/api/posts/'+POST)return {post:post()};
  if(c.url==='/api/posts/'+POST+'/like')return new Promise(r=>release=r);
  if(c.url==='/api/posts/'+POST+'/comments')return {comments:[{body:'Fictional comment',display_name:'Fictional friend'}]};
 }});
 const content=m.$('sfFeedContent');assert.match(content.textContent,/Fictional post/);
 assert(m.calls.some(c=>c.url==='/api/posts/'+POST&&c.token==='Bearer session-a'));
 assert(!m.calls.some(c=>c.url.includes('/posts/feed')));
 const like=content.querySelector('.sf-like');like.click();like.click();
 assert.deepEqual(m.calls.filter(c=>c.url.endsWith('/like')).map(c=>[c.method,c.body]),[['PUT',{liked:true}]]);
 release({liked:true,like_count:3});await tick();
 assert.equal(like.getAttribute('aria-pressed'),'true');assert.equal(like.querySelector('span').textContent,'3');
 const comments=content.querySelector('.sf-comment-toggle');comments.click();await tick();
 assert.equal(comments.getAttribute('aria-expanded'),'true');
 assert.match(content.textContent,/Fictional comment/);
});
test('a guest sees sign-in hint and a denied recipient sees unavailable, never another post',async t=>{
 const m=await make(t,{token:null,search:'?post='+POST,handle:c=>c.url==='/api/posts/'+POST?{httpStatus:404,data:{error:'Hidden body not for the DOM'}}:null});
 assert.match(m.$('socialLanding').textContent,/Sign in to view this shared post/);
 assert(!m.calls.some(c=>c.url.startsWith('/api/posts')));
 m.change('session-b');await tick();
 assert.match(m.$('sfFeedContent').textContent,/unavailable or is not shared/);
 assert.doesNotMatch(m.$('sfFeedContent').textContent,/Hidden body/);
 assert(!m.calls.some(c=>c.url.includes('/posts/feed')));
});
test('invalid or ambiguous post IDs never reach API and show the back link',async t=>{
 const m=await make(t,{search:'?post='+POST+'&post='+OTHER});
 assert.match(m.$('sfFeedContent').textContent,/invalid/);
 assert(m.$('sfFeedContent').querySelector('a[href="/social-feed"]'));
 assert(!m.calls.some(c=>c.url.startsWith('/api/posts')));
});
test('a slow prior-account permalink response cannot appear after an account switch',async t=>{
 let release;
 const m=await make(t,{search:'?post='+POST,handle:c=>c.url==='/api/posts/'+POST?(c.token==='Bearer session-a'?new Promise(r=>release=r):{httpStatus:404}):null});
 m.change('session-b','storage');await tick();release({post:post(POST,'private',{body:'SECRET prior-account text'})});await tick();
 assert.match(m.$('sfFeedContent').textContent,/unavailable/);
 assert.doesNotMatch(m.w.document.body.textContent,/SECRET prior-account/);
});
