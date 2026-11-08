/* Server-backed direct messages. No simulated presence, delivery, typing, media or encryption. */
(function () {
  'use strict';
  const host = document.getElementById('slMessagesWorkspace');
  if (!host) return;
  const C = () => window.SLConnected;
  const E = v => C().esc(v);
  const api = (path, options) => C().request(path, options);
  const enc = encodeURIComponent;
  let session = '', epoch = 0, me, active = null, conversationOffset = 0, moreConversations = false;
  let conversations = new Map(), threads = new Map(), listBusy = false, searchSeq = 0, searchTimer, listStamp = 0, startBusy = false;
  let pollTimer, started = false;
  const $ = s => host.querySelector(s);
  const current = gen => gen === epoch && C().token() === session;
  function name(u) { return u.display_name || u.username || 'SceneLink member'; }
  function time(iso) { const date = new Date(iso); return iso && Number.isFinite(date.getTime()) ? date.toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : ''; }
  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    if (!window.crypto || !window.crypto.getRandomValues) throw new Error('This browser cannot safely create a message retry ID. Use a secure HTTPS browser.');
    const bytes = window.crypto.getRandomValues(new Uint8Array(16)); bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
    const s = Array.from(bytes, b => b.toString(16).padStart(2,'0')).join(''); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20);
  }
  function thread(id) {
    if (!threads.has(id)) threads.set(id,{id, messages:new Map(), cursor:null, more:false, syncSeq:'0', receipts:[], loaded:false, loading:false, olderBusy:false, syncing:false, outbox:[], draft:'', edit:null, error:'', readId:null, readBusy:false, allowed:true});
    return threads.get(id);
  }
  function sorted(t) { return Array.from(t.messages.values()).sort((a,b) => String(a.cursor_at||a.created_at).localeCompare(String(b.cursor_at||b.created_at)) || String(a.id).localeCompare(String(b.id))); }
  function merge(t, messages) {
    for (const m of messages) {
      if (!m || !m.id || m.conversation_id && m.conversation_id !== t.id) continue;
      const old = t.messages.get(m.id);
      if (!old || Number(m.revision || 0) >= Number(old.revision || 0)) t.messages.set(m.id,Object.assign({},old||{},m));
      t.outbox = t.outbox.filter(o => o.id !== m.id);
    }
  }
  function errorText(e) {
    if (e.status === 401) return 'Your session has ended. Sign in again to continue.';
    if (e.status === 403 || e.status === 404) return e.message || 'This conversation is unavailable or its privacy settings changed.';
    if (e.status === 409) return 'This message changed elsewhere. Refresh, review the current version, then try again.';
    return e.message || 'The service is unavailable. Please retry.';
  }
  function status(text, isError) { const el=$('[data-inbox-status]'); if(el){el.textContent=text;el.classList.toggle('slm-error',!!isError);} }
  function renderShell() {
    host.innerHTML = '<div class="slm-heading"><div><p class="slm-eyebrow">YOUR PEOPLE, YOUR PLANS</p><h1>Messages</h1><p class="slm-muted">Keep the conversation with your plans, right here.</p></div><a class="slm-button slm-secondary" href="/profile#privacy">Privacy settings</a></div>'+
      '<details class="slm-capabilities"><summary>How messaging works</summary><p>Direct text conversations are stored on SceneLink. Updates are checked while this tab is visible. Read receipts appear only when a participant chooses to share them. “Sent” means the server saved the message, not that a device received it. Creating group chats, sending photos, voice/video calls, disappearing messages and end-to-end encryption are not available in this build.</p></details>'+
      '<p data-inbox-status class="slm-status" role="status" aria-live="polite"></p><div class="slm-layout"><aside class="slm-inbox" aria-label="Conversations"><div class="slm-inbox-head"><h2>Inbox</h2><button type="button" data-new-message class="slm-button">New message</button></div>'+
      '<form data-search-form hidden class="slm-search"><label for="slMessageSearch">Find someone</label><div class="slm-row"><input id="slMessageSearch" name="query" type="search" maxlength="80" placeholder="Name or @username" autocomplete="off"><button class="slm-button slm-secondary" type="submit">Search</button></div><p class="slm-muted">Private accounts may require an exact @username. Their messaging preferences still apply.</p><div data-search-results aria-live="polite"></div></form>'+
      '<div data-conversations><p class="slm-empty">Loading conversations…</p></div><button type="button" data-more-conversations class="slm-button slm-secondary slm-wide" hidden>Load more conversations</button><button type="button" data-refresh-inbox class="slm-text-button slm-wide">Refresh inbox</button></aside>'+
      '<section class="slm-thread" data-thread aria-label="Message thread"><div class="slm-empty"><h2>A conversation starts here</h2><p>Choose a conversation, or find someone to message.</p><a href="/profile#friends">Find and manage friends</a></div></section></div>';
    $('[data-new-message]').onclick = () => { const form=$('[data-search-form]'); form.hidden=!form.hidden;if(!form.hidden)form.querySelector('input').focus(); };
    $('[data-search-form]').onsubmit = e => {e.preventDefault();clearTimeout(searchTimer);search();};
    $('#slMessageSearch').oninput = () => {++searchSeq;clearTimeout(searchTimer);if($('#slMessageSearch').value.trim().length<2){$('[data-search-results]').textContent='Enter at least two characters.';return;}searchTimer=setTimeout(search,300);};
    $('[data-more-conversations]').onclick=()=>loadConversations(true);
    $('[data-refresh-inbox]').onclick=()=>loadConversations(false);
  }
  function renderList() {
    const el=$('[data-conversations]');if(!el)return;
    const rows=Array.from(conversations.values()).sort((a,b)=>String(b.last_message_at||'').localeCompare(String(a.last_message_at||''))||String(b.id).localeCompare(String(a.id)));
    el.innerHTML=rows.length?rows.map(c=>{const people=(c.participants||[]).filter(p=>!me||p.id!==me.id),title=c.title||people.map(name).join(', ')||'Conversation';
      const text=c.last_message_deleted?'Message deleted':typeof c.last_message==='string'?c.last_message:c.last_message&&c.last_message.body;
      return '<button class="slm-conversation '+(c.id===active?'is-active':'')+'" type="button" data-open-conversation="'+E(c.id)+'" aria-pressed="'+(c.id===active)+'"><span class="slm-initial" aria-hidden="true">'+E(title.charAt(0).toUpperCase())+'</span><span class="slm-conversation-copy"><strong>'+E(title)+'</strong><span>'+E(text||'No visible message preview')+'</span></span>'+(Number(c.unread_count)>0?'<span class="slm-unread">'+E(c.unread_count)+' unread</span>':'')+'</button>';}).join(''):'<div class="slm-empty"><h3>No conversations yet</h3><p>Find a friend and start talking.</p></div>';
    el.querySelectorAll('[data-open-conversation]').forEach(b=>b.onclick=()=>open(b.dataset.openConversation));
    $('[data-more-conversations]').hidden=!moreConversations;
    $('[data-more-conversations]').disabled=listBusy;
  }
  async function loadConversations(more, quiet) {
    if(listBusy||!me)return;listBusy=true;const gen=epoch;
    const moreButton=$('[data-more-conversations]');if(moreButton)moreButton.disabled=true;
    try {
      // Refresh every loaded page, rather than merging stale previews forever. Blocks/removals
      // must disappear without discarding previously paginated portions of the inbox.
      const wanted=more?30:Math.max(30,conversationOffset),collected=[];
      let offset=more?conversationOffset:0,remaining=wanted,hasMore=false;
      do {
        const limit=Math.min(100,remaining),data=await api('/conversations?limit='+limit+'&offset='+offset);
        if(!current(gen))return;if(!Array.isArray(data.conversations))throw new Error('The service returned an invalid inbox.');
        collected.push(...data.conversations);offset+=data.conversations.length;remaining-=data.conversations.length;hasMore=data.has_more===true;
        if(!data.conversations.length)break;
      } while(!more&&remaining>0&&hasMore);
      if(!more)conversations=new Map();for(const c of collected)conversations.set(c.id,c);
      conversationOffset=offset;moreConversations=hasMore;
      listStamp=Date.now();renderList();if(!quiet)status('Inbox refreshed.');
    } catch(e){if(current(gen)){if(!quiet||!conversations.size)status(errorText(e),true);if(!conversations.size)$('[data-conversations]').textContent='Your inbox could not be loaded. Use Refresh inbox to retry.';}}
    finally{if(current(gen)){listBusy=false;if($('[data-more-conversations]'))$('[data-more-conversations]').disabled=false;}}
  }
  async function search() {
    const q=$('#slMessageSearch').value.trim(),seq=++searchSeq,gen=epoch,target=$('[data-search-results]');
    if(q.length<2){target.textContent='Enter at least two characters.';return;}
    target.textContent='Searching…';
    try{const data=await api('/users/search?q='+enc(q)+'&limit=20');if(!current(gen)||seq!==searchSeq)return;
      const results=data.results||data.users;if(!Array.isArray(results))throw new Error('The service returned an invalid search.');
      const users=results.filter(u=>u.id!==me.id);target.innerHTML=users.length?users.map(u=>'<div class="slm-search-result"><a href="/profile?u='+enc(u.id)+'"><strong>'+E(name(u))+'</strong><span>@'+E(u.username||'')+'</span></a><button type="button" class="slm-button slm-secondary" data-message-user="'+E(u.id)+'">Message</button></div>').join(''):'<p>No matching discoverable users. Try their exact @username.</p>';
      target.querySelectorAll('[data-message-user]').forEach(b=>b.onclick=()=>startConversation(b.dataset.messageUser,b));
    }catch(e){if(current(gen)&&seq===searchSeq)target.textContent=errorText(e);}
  }
  async function startConversation(userId,button) {
    if(startBusy)return;startBusy=true;if(button)button.disabled=true;const gen=epoch;status('Opening conversation…');
    try{
      if(!/^[0-9a-f-]{36}$/i.test(userId)){const resolved=await api('/users/'+enc(userId));userId=resolved.user.id;}
      const data=await api('/conversations',{method:'POST',body:{user_id:userId}});if(!current(gen))return;
      if(!data.conversation||!data.conversation.id)throw new Error('The service did not confirm the conversation.');
      await loadConversations(false,true);if(!current(gen))return;
      $('[data-search-form]').hidden=true;status('Conversation ready.');open(data.conversation.id);
    }catch(e){if(current(gen))status(errorText(e),true);}finally{if(current(gen)){startBusy=false;if(button)button.disabled=false;}}
  }
  function updateLocation(id,replace) {const url=new URL(location.href);url.searchParams.delete('user');url.searchParams.delete('to');if(id)url.searchParams.set('conversation',id);else url.searchParams.delete('conversation');history[replace?'replaceState':'pushState']({slConversation:id},'',url.pathname+url.search+url.hash);}
  function preserveDraft() {if(!active)return;const t=thread(active),input=$('[data-compose]');if(input)t.draft=input.value;const edit=$('[data-edit-body]');if(edit&&t.edit)t.edit.body=edit.value;}
  async function open(id,fromHistory) {
    if(!id)return;preserveDraft();active=id;const t=thread(id);if(!fromHistory)updateLocation(id,false);renderList();renderThread(t);if(!t.loaded&&!t.loading)await loadThread(t);else if(t.loaded)await sync(t);if(active===id)markRead(t);
  }
  function renderThread(t) {
    if(active!==t.id)return;
    const box=$('[data-thread]');if(!box)return;
    const c=t.conversation||conversations.get(t.id)||{},people=(t.participants||c.participants||[]).filter(p=>p.id!==me.id),title=c.title||people.map(name).join(', ')||'Conversation';
    const peer=people.length===1?people[0]:null;
    box.innerHTML='<div class="slm-thread-head"><div><h2>'+E(title)+'</h2><p class="slm-muted">'+(c.is_group?'Existing group conversation':'Direct conversation')+'</p></div><div class="slm-row">'+(peer?'<a class="slm-text-button" href="/profile?u='+enc(peer.id)+'">View profile</a><button type="button" class="slm-text-button" data-block-person="'+E(peer.id)+'">Block</button>':'')+'<button type="button" class="slm-text-button" data-close-thread>Close</button></div></div>'+
      '<div data-thread-status class="slm-status '+(t.error?'slm-error':'')+'" role="status" aria-live="polite">'+E(t.error)+'</div><div data-thread-tools></div>'+
      '<div class="slm-history" data-history tabindex="0" aria-label="Messages"><button type="button" class="slm-text-button slm-wide" data-older '+(!t.more?'hidden':'')+' '+(t.olderBusy?'disabled':'')+'>Load older messages</button><div data-message-list></div></div>'+
      '<div data-outbox></div><div data-message-editor></div><form data-compose-form class="slm-composer"><label for="slMessageCompose">Message</label><textarea id="slMessageCompose" data-compose rows="2" maxlength="5000" placeholder="Write a message…" '+(!t.loaded||!t.allowed?'disabled':'')+'>'+E(t.draft)+'</textarea><div class="slm-row slm-compose-bottom"><span class="slm-muted">Enter for a new line · Ctrl/⌘ + Enter to send</span><button type="submit" class="slm-button" data-send '+(!t.loaded||!t.allowed?'disabled':'')+'>Send</button></div><p class="slm-muted slm-draft-note">Unsent text stays in this tab only. Closing or signing out clears it.</p></form>';
    $('[data-close-thread]').onclick=()=>closeThread();
    $('[data-older]').onclick=()=>loadThread(t,true);
    if(peer)$('[data-block-person]').onclick=()=>blockPrompt(t,peer);
    $('[data-compose-form]').onsubmit=e=>{e.preventDefault();send(t);};
    $('[data-compose]').oninput=e=>{t.draft=e.target.value;};
    $('[data-compose]').onkeydown=e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&!e.isComposing){e.preventDefault();send(t);}};
    $('[data-history]').onscroll=()=>markRead(t);
    renderMessages(t,true);renderOutbox(t);renderEditor(t);
  }
  function renderMessages(t,scrollBottom) {
    if(active!==t.id)return;const el=$('[data-message-list]'),history=$('[data-history]');if(!el)return;
    const nearBottom=history.scrollHeight-history.scrollTop-history.clientHeight<90,oldHeight=history.scrollHeight,oldTop=history.scrollTop;
    const rows=sorted(t);
    el.innerHTML=!t.loaded?'<p class="slm-empty">'+(t.loading?'Loading messages…':'Messages not loaded.')+'</p>':rows.length?rows.map(m=>{
      const mine=m.sender_id===me.id,deleted=!!m.deleted_at;
      return '<article class="slm-message '+(mine?'is-mine':'')+' '+(deleted?'is-deleted':'')+'" data-message-id="'+E(m.id)+'"><div class="slm-bubble"><div class="slm-author">'+E(mine?'You':m.display_name||m.username||'Member')+'</div><p>'+E(deleted?'Message deleted':m.body||'')+'</p><div class="slm-message-meta"><time datetime="'+E(m.created_at)+'">'+E(time(m.created_at))+'</time>'+(m.edited_at&&!deleted?' · Edited':'')+(mine&&!deleted?' · Sent':'')+'</div></div>'+(!deleted?'<div class="slm-message-actions">'+(mine?'<button type="button" data-edit="'+E(m.id)+'">Edit</button><button type="button" data-delete="'+E(m.id)+'">Delete</button>':'<button type="button" data-report="'+E(m.id)+'">Report</button>')+'</div>':'')+'</article>';}).join(''):'<div class="slm-empty"><p>No messages yet. Say hello.</p></div>';
    const receiptText=(t.receipts||[]).map(r=>{
      const id=r.last_read_message_id||r.through_id,message=t.messages.get(id),person=(t.participants||[]).find(p=>p.id===(r.user_id||r.id));
      if(!message||!person||person.id===me.id)return '';
      return '<p class="slm-read-receipt">'+E(name(person))+' read through '+E(time(message.created_at))+'.</p>';
    }).join('');if(receiptText)el.insertAdjacentHTML('beforeend',receiptText);
    el.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{const m=t.messages.get(b.dataset.edit);t.edit={id:m.id,revision:m.revision,body:m.body,kind:'edit',busy:false};renderEditor(t);});
    el.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{const m=t.messages.get(b.dataset.delete);t.edit={id:m.id,revision:m.revision,kind:'delete',busy:false};renderEditor(t);});
    el.querySelectorAll('[data-report]').forEach(b=>b.onclick=()=>{if(window.SLReportModal)window.SLReportModal.open('message',b.dataset.report,{label:'this message'});else{t.error='Reporting is unavailable. Please retry later.';setThreadStatus(t);}});
    if(scrollBottom===true||nearBottom&&scrollBottom!==false)history.scrollTop=history.scrollHeight;
    else if(scrollBottom===false)history.scrollTop=oldTop+(history.scrollHeight-oldHeight);
    else history.scrollTop=oldTop;
  }
  function setThreadStatus(t){if(active===t.id&&$('[data-thread-status]')){$('[data-thread-status]').textContent=t.error;$('[data-thread-status]').classList.toggle('slm-error',!!t.error);}}
  async function loadThread(t,older) {
    if(t.loading||t.olderBusy||older&&!t.cursor)return;const gen=epoch;
    if(older)t.olderBusy=true;else{t.loading=true;t.error='';}if(active===t.id){if(!older)renderThread(t);else $('[data-older]').disabled=true;}
    try{const data=await api('/conversations/'+enc(t.id)+'/messages?limit=40'+(older?'&cursor='+enc(t.cursor):''));if(!current(gen))return;
      if(!Array.isArray(data.messages))throw new Error('The service returned an invalid message history.');
      merge(t,data.messages);t.conversation=data.conversation;t.participants=data.participants||[];t.cursor=data.next_cursor||null;t.more=data.has_more===true;t.receipts=data.read_receipts||[];t.loaded=true;t.allowed=data.can_send!==false;
      // Older pages cannot advance the change feed past unseen changes.
      if(!older)t.syncSeq=String(data.sync_seq||'0');t.error=t.allowed?'':'This person is not currently accepting new messages from you.';
      if(active===t.id){if(!older)renderThread(t);else{renderMessages(t,false);$('[data-older]').hidden=!t.more;}}markRead(t);
    }catch(e){if(current(gen)){t.error=errorText(e);if(e.status===403||e.status===404){t.allowed=false;t.messages.clear();t.loaded=false;conversations.delete(t.id);renderList();}setThreadStatus(t);if(active===t.id&&!older){renderThread(t);const tools=$('[data-thread-tools]');tools.innerHTML='<button type="button" class="slm-button slm-secondary" data-retry-thread>Retry loading</button>';tools.querySelector('button').onclick=()=>loadThread(t);}}}
    finally{if(current(gen)){t.loading=false;t.olderBusy=false;if(active===t.id&&$('[data-older]'))$('[data-older]').disabled=false;}}
  }
  async function sync(t) {
    if(t.syncing||t.loading||!t.loaded||document.hidden)return;t.syncing=true;const gen=epoch;
    try{
      let hasMore=true,rounds=0;
      while(hasMore&&current(gen)&&active===t.id&&!document.hidden){
        const data=await api('/conversations/'+enc(t.id)+'/changes?after_seq='+enc(t.syncSeq)+'&limit=80');if(!current(gen))return;
        if(!Array.isArray(data.messages))throw new Error('Message updates are unavailable.');
        merge(t,data.messages);t.syncSeq=String(data.next_seq||t.syncSeq);t.receipts=data.read_receipts||[];if(data.can_send!==undefined)t.allowed=data.can_send;
        hasMore=data.has_more===true;if(++rounds>=10)break; // Continue next poll; never spin indefinitely on a broken cursor.
      }
      t.error=t.allowed?'':'This person is not currently accepting new messages from you.';if(active===t.id){renderMessages(t);renderOutbox(t);setThreadStatus(t);$('[data-compose]').disabled=!t.allowed;$('[data-send]').disabled=!t.allowed;}markRead(t);
    }catch(e){if(current(gen)){t.error=errorText(e);if(e.status===403||e.status===404){t.allowed=false;t.messages.clear();t.loaded=false;conversations.delete(t.id);renderList();if(active===t.id)renderThread(t);}else setThreadStatus(t);}}
    finally{if(current(gen))t.syncing=false;}
  }
  async function markRead(t) {
    if(document.hidden||active!==t.id||t.readBusy||!t.loaded)return;
    const h=$('[data-history]');if(!h||h.scrollHeight-h.scrollTop-h.clientHeight>90)return;
    const last=sorted(t).at(-1);if(!last||last.id===t.lastMarkedDisplayedId)return;
    t.readBusy=true;const gen=epoch;
    try{const r=await api('/conversations/'+enc(t.id)+'/read',{method:'POST',body:{through_id:last.id}});if(!current(gen))return;if(r.ok!==true||!r.through_id)throw new Error('Read state was not confirmed.');t.readId=r.through_id;t.lastMarkedDisplayedId=last.id;loadConversations(false,true);}
    catch(e){if(current(gen)){t.error='Read state could not be saved. '+errorText(e);setThreadStatus(t);}}
    finally{if(current(gen))t.readBusy=false;}
  }
  function renderOutbox(t) {
    if(active!==t.id)return;const el=$('[data-outbox]');if(!el)return;
    el.innerHTML=t.outbox.map(o=>'<div class="slm-outbox" data-outbox-id="'+E(o.id)+'"><p>'+E(o.body)+'</p><span role="status">'+E(o.sending?'Saving to server…':o.error||'Not confirmed')+'</span>'+(!o.sending?'<button class="slm-button slm-secondary" type="button" data-retry-message="'+E(o.id)+'">Retry same message</button>':'')+'</div>').join('');
    el.querySelectorAll('[data-retry-message]').forEach(b=>b.onclick=()=>transmit(t,t.outbox.find(o=>o.id===b.dataset.retryMessage)));
  }
  async function send(t) {
    const input=$('[data-compose]');if(!input||active!==t.id||!t.loaded||!t.allowed)return;
    const body=input.value.trim();if(!body)return;if(body.length>5000){t.error='Messages must be 5,000 characters or fewer.';setThreadStatus(t);return;}
    try{const o={id:uuid(),body,sending:false,error:''};t.outbox.push(o);t.draft='';input.value='';await transmit(t,o);}catch(e){t.error=errorText(e);setThreadStatus(t);}
  }
  async function transmit(t,o) {
    if(!o||o.sending)return;o.sending=true;o.error='';renderOutbox(t);const gen=epoch;
    try{const data=await api('/conversations/'+enc(t.id)+'/messages',{method:'POST',body:{body:o.body,client_id:o.id}});if(!current(gen))return;
      if(!data.message||data.message.id!==o.id)throw new Error('The server did not confirm this message.');
      merge(t,[data.message]);t.error='';if(active===t.id){renderMessages(t,true);setThreadStatus(t);}loadConversations(false,true);markRead(t);
    }catch(e){if(current(gen)){o.error=(e.status===408||!e.status?'Not confirmed — it may already be saved. Retry uses the same message ID. ':'Not sent. ')+errorText(e);if(e.status===403||e.status===404)t.allowed=false;}}
    finally{if(current(gen)){o.sending=false;renderOutbox(t);}}
  }
  function renderEditor(t) {
    if(active!==t.id)return;const el=$('[data-message-editor]');if(!el)return;const edit=t.edit;
    if(!edit){el.innerHTML='';return;}
    el.innerHTML='<form class="slm-editor" data-edit-form><h3>'+(edit.kind==='delete'?'Delete your message?':'Edit your message')+'</h3>'+(edit.kind==='delete'?'<p>This replaces the message with a deleted-message marker for participants. Someone may already have read or copied it.</p>':'<label for="slEditMessage">Updated message</label><textarea id="slEditMessage" data-edit-body rows="3" required maxlength="5000">'+E(edit.body)+'</textarea>')+'<p role="status" class="slm-error">'+E(edit.error||'')+'</p><div class="slm-row"><button type="submit" class="slm-button" '+(edit.busy?'disabled':'')+'>'+(edit.busy?'Saving…':edit.kind==='delete'?'Delete for everyone':'Save edit')+'</button><button type="button" data-cancel-edit class="slm-button slm-secondary" '+(edit.busy?'disabled':'')+'>Cancel</button></div></form>';
    $('[data-cancel-edit]').onclick=()=>{t.edit=null;renderEditor(t);$('[data-compose]').focus();};
    if($('[data-edit-body]')){$('[data-edit-body]').oninput=e=>edit.body=e.target.value;if(!edit.busy)$('[data-edit-body]').focus();}
    $('[data-edit-form]').onsubmit=e=>{e.preventDefault();editMessage(t);};
  }
  async function editMessage(t) {
    const edit=t.edit;if(!edit||edit.busy)return;edit.busy=true;edit.error='';const gen=epoch;
    const payload={revision:edit.revision};if(edit.kind==='edit'){payload.body=edit.body.trim();if(!payload.body){edit.busy=false;edit.error='Write a message or cancel.';renderEditor(t);return;}}
    renderEditor(t);
    try{const data=await api('/conversations/'+enc(t.id)+'/messages/'+enc(edit.id),{method:edit.kind==='delete'?'DELETE':'PATCH',body:payload});if(!current(gen))return;if(!data.message||data.message.id!==edit.id)throw new Error('This change was not confirmed.');merge(t,[data.message]);t.edit=null;renderMessages(t);renderEditor(t);loadConversations(false,true);}
    catch(e){if(current(gen)){edit.error=errorText(e);if(e.status===409){await sync(t);const fresh=t.messages.get(edit.id);if(fresh){edit.revision=fresh.revision;edit.error+=' Current server message: '+(fresh.deleted_at?'Deleted':fresh.body||'');}}}}
    finally{if(current(gen)&&t.edit===edit){edit.busy=false;renderEditor(t);}}
  }
  function blockPrompt(t,peer) {
    const tools=$('[data-thread-tools]');tools.innerHTML='<div class="slm-editor"><h3>Block '+E(name(peer))+'?</h3><p>This removes your friendship and prevents messages and profile access between you. You can manage blocked accounts in your profile.</p><div class="slm-row"><button type="button" data-confirm-block class="slm-button">Block account</button><button type="button" data-cancel-block class="slm-button slm-secondary">Cancel</button></div><p role="status"></p></div>';
    $('[data-cancel-block]').onclick=()=>{tools.innerHTML='';};
    $('[data-confirm-block]').onclick=async function(){this.disabled=true;const gen=epoch;try{await api('/users/'+enc(peer.id)+'/block',{method:'POST'});if(!current(gen))return;threads.delete(t.id);conversations.delete(t.id);closeThread();renderList();status('Account blocked.');}catch(e){if(current(gen)){tools.querySelector('[role=status]').textContent=errorText(e);this.disabled=false;}}};
  }
  function closeThread(fromHistory) {preserveDraft();active=null;if(!fromHistory)updateLocation(null,false);renderList();$('[data-thread]').innerHTML='<div class="slm-empty"><h2>Choose a conversation</h2><p>Your unsent text stays in this tab while you browse conversations.</p></div>';}
  async function boot() {
    if(!C())return;const next=C().token();if(started&&next===session)return;started=true;session=next;++epoch;const gen=epoch;
    clearInterval(pollTimer);clearTimeout(searchTimer);++searchSeq;active=null;me=null;threads.clear();conversations.clear();listBusy=false;startBusy=false;conversationOffset=0;moreConversations=false;
    if(!session){host.innerHTML='<div class="slm-empty slm-signin"><h1>Your conversations, together</h1><p>Sign in to message people and manage your privacy.</p><button type="button" class="slm-button sl-auth-trigger">Sign in</button><p><a href="/">Keep exploring Boston</a></p></div>';return;}
    renderShell();status('Loading your account…');
    try{const data=await api('/users/me');if(!current(gen))return;me=data.user||data;if(!me.id)throw new Error('Your account could not be loaded.');await loadConversations(false,true);if(!current(gen))return;status('');
      const params=new URLSearchParams(location.search),cid=params.get('conversation')||params.get('conv'),user=params.get('user')||params.get('to');if(cid)open(cid,true);else if(user)startConversation(user);
      pollTimer=setInterval(()=>{if(C().token()!==session){boot();return;}if(document.hidden||!me)return;if(active)sync(thread(active));if(Date.now()-listStamp>15000)loadConversations(false,true);},5000);
    }catch(e){if(current(gen)){status(errorText(e),true);const retry=document.createElement('button');retry.type='button';retry.className='slm-button';retry.textContent='Retry account';retry.onclick=()=>{started=false;boot();};$('[data-inbox-status]').after(retry);}}
  }
  window.addEventListener('popstate',()=>{if(!me)return;const id=new URLSearchParams(location.search).get('conversation');if(id)open(id,true);else closeThread(true);});
  window.addEventListener('online',()=>{if(me){if(active)sync(thread(active));loadConversations(false,true);}});
  document.addEventListener('visibilitychange',()=>{if(C()&&C().token()!==session)boot();else if(!document.hidden&&active)sync(thread(active));});
  ['sl-auth-change','sl-auth-changed','sl-auth-ready'].forEach(event=>{window.addEventListener(event,boot);document.addEventListener(event,boot);});
  window.addEventListener('storage',e=>{if(e.key==='sl_jwt_token')boot();});
  window.addEventListener('pagehide',()=>{clearInterval(pollTimer);clearTimeout(searchTimer);});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
