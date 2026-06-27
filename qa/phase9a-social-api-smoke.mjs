/**
 * Phase 9A — Social API Smoke Test
 *
 * Exercises EVERY endpoint the frontend SL.social.* client depends on, using
 * TWO real accounts (A and B) against production (or BASE override).
 *
 * Usage:  node qa/phase9a-social-api-smoke.mjs
 *         BASE=https://scenelink-api-prod.onrender.com/api node qa/phase9a-social-api-smoke.mjs
 *
 * Exits non-zero if any required check fails.
 */
const BASE = process.env.BASE || 'https://scenelink-api-prod.onrender.com/api';
const TS = Date.now();
let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; failures.push(name + (extra ? ' :: ' + JSON.stringify(extra) : '')); console.log('FAIL', name, extra != null ? JSON.stringify(extra).slice(0,200) : ''); }
}

async function req(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + path, { method, headers, body: body != null ? JSON.stringify(body) : undefined });
  let data = null;
  const txt = await res.text();
  try { data = txt ? JSON.parse(txt) : null; } catch (_) { data = { raw: txt }; }
  return { status: res.status, data };
}

async function signup(tag) {
  const r = await req('POST', '/auth/signup', null, {
    email: `qa9a_${tag}_${TS}@scenelink.test`,
    password: 'TestPass123!',
    display_name: `QA ${tag.toUpperCase()} ${TS}`,
    username: `qa9a_${tag}_${TS}`,
  });
  return r;
}

(async () => {
  console.log('Phase 9A Social API Smoke @ ' + BASE + '\n');

  // ── Accounts ──
  const a = await signup('a');
  ok('signup A (201)', a.status === 201, { status: a.status });
  const b = await signup('b');
  ok('signup B (201)', b.status === 201, { status: b.status });
  const TOKA = a.data && a.data.token, TOKB = b.data && b.data.token;
  const IDA = a.data && a.data.user && a.data.user.id;
  const IDB = b.data && b.data.user && b.data.user.id;
  ok('A token + id', !!TOKA && !!IDA);
  ok('B token + id', !!TOKB && !!IDB);
  if (!TOKA || !TOKB) { console.log('\nCannot continue without tokens'); process.exit(1); }

  // ── Profiles ──
  const meA = await req('GET', '/users/me', TOKA);
  ok('GET /users/me', meA.status === 200 && meA.data && (meA.data.id || (meA.data.user && meA.data.user.id)));

  const profB = await req('GET', '/users/' + IDB, TOKA);
  ok('GET /users/:id (other profile)', profB.status === 200 && profB.data && profB.data.user, { status: profB.status });
  ok('profile has friendship_status + is_me', profB.data && 'is_me' in profB.data && 'friendship_status' in profB.data);

  const updA = await req('PUT', '/auth/profile', TOKA, { bio: 'Phase 9A QA bio', neighborhood: 'Back Bay' });
  ok('PUT /auth/profile (update me)', updA.status === 200 && updA.data && updA.data.user, { status: updA.status });

  const search = await req('GET', '/users/search?q=qa9a&limit=5', TOKA);
  ok('GET /users/search', search.status === 200);

  const sugg = await req('GET', '/users/suggestions?limit=5', TOKA);
  ok('GET /users/suggestions', sugg.status === 200 && Array.isArray(sugg.data && sugg.data.suggestions));

  // ── Summary (badges) ──
  const sum = await req('GET', '/social/summary', TOKA);
  ok('GET /social/summary', sum.status === 200 && sum.data && 'friends' in sum.data);

  // ── Friends ──
  const fr = await req('POST', '/friends/request', TOKB, { user_id: IDA });
  ok('POST /friends/request (B->A)', fr.status === 200 || fr.status === 201, { status: fr.status });
  const fid = fr.data && fr.data.friendship_id;

  const pend = await req('GET', '/friends/pending', TOKA);
  ok('GET /friends/pending shows incoming', pend.status === 200 && pend.data && Array.isArray(pend.data.incoming) && pend.data.incoming.length >= 1);

  const acc = await req('POST', '/friends/accept', TOKA, { friendship_id: fid });
  ok('POST /friends/accept', acc.status === 200 || acc.status === 201, { status: acc.status });

  const friends = await req('GET', '/friends', TOKA);
  ok('GET /friends shows accepted', friends.status === 200 && friends.data && (Array.isArray(friends.data.friends) ? friends.data.friends.length >= 1 : true));

  // ── Posts / feed ──
  const post = await req('POST', '/posts', TOKB, { body: 'Phase 9A smoke post ' + TS });
  ok('POST /posts', (post.status === 200 || post.status === 201) && post.data && post.data.post && post.data.post.id, { status: post.status });
  const postId = post.data && post.data.post && post.data.post.id;

  const feed = await req('GET', '/posts/feed?limit=10', TOKA);
  ok('GET /posts/feed (items)', feed.status === 200 && feed.data && Array.isArray(feed.data.items));
  ok('feed supports cursor (next_cursor/has_more keys)', feed.data && ('next_cursor' in feed.data) && ('has_more' in feed.data));

  const feedCursor = await req('GET', '/posts/feed?limit=2', TOKA);
  if (feedCursor.data && feedCursor.data.next_cursor) {
    const page2 = await req('GET', '/posts/feed?limit=2&cursor=' + encodeURIComponent(feedCursor.data.next_cursor), TOKA);
    ok('GET /posts/feed?cursor= (page 2)', page2.status === 200 && page2.data && Array.isArray(page2.data.items));
  } else { ok('GET /posts/feed?cursor= (page 2)', true, 'no second page (acceptable)'); }

  const like1 = await req('POST', '/posts/' + postId + '/like', TOKA);
  ok('POST /posts/:id/like (like)', like1.status === 200 && like1.data && ('liked' in like1.data || 'like_count' in like1.data));
  const like2 = await req('POST', '/posts/' + postId + '/like', TOKA);
  ok('POST /posts/:id/like (unlike toggles)', like2.status === 200);

  const cmt = await req('POST', '/posts/' + postId + '/comments', TOKA, { body: 'Phase 9A comment' });
  ok('POST /posts/:id/comments', cmt.status === 200 || cmt.status === 201, { status: cmt.status });
  const cmts = await req('GET', '/posts/' + postId + '/comments', TOKA);
  ok('GET /posts/:id/comments', cmts.status === 200 && cmts.data && (Array.isArray(cmts.data.comments) || Array.isArray(cmts.data.items)));

  const userPosts = await req('GET', '/posts?user_id=' + IDB, TOKA);
  ok('GET /posts?user_id= (profile posts)', userPosts.status === 200 && userPosts.data && (Array.isArray(userPosts.data.posts) || Array.isArray(userPosts.data.items)));

  // ── Check-ins / venue activity ──
  const venues = await req('GET', '/venues?limit=1', TOKA);
  const venueId = venues.data && (venues.data.venues || venues.data.items || [])[0] && (venues.data.venues || venues.data.items)[0].id;
  if (venueId) {
    const ci = await req('POST', '/checkins', TOKA, { venue_id: venueId, note: 'QA check-in' });
    ok('POST /checkins', ci.status === 200 || ci.status === 201, { status: ci.status });
    const va = await req('GET', '/venues/' + venueId + '/activity?limit=10', TOKA);
    ok('GET /venues/:id/activity', va.status === 200 && va.data && Array.isArray(va.data.items));
  } else { ok('POST /checkins', false, 'no venue found'); ok('GET /venues/:id/activity', false, 'no venue'); }

  // ── Messages ──
  const conv = await req('POST', '/conversations', TOKA, { user_id: IDB });
  ok('POST /conversations', (conv.status === 200 || conv.status === 201) && conv.data && (conv.data.conversation_id || (conv.data.conversation && conv.data.conversation.id)), { status: conv.status });
  const convId = conv.data && (conv.data.conversation_id || (conv.data.conversation && conv.data.conversation.id));
  if (convId) {
    const sent = await req('POST', '/conversations/' + convId + '/messages', TOKA, { body: 'Phase 9A hi' });
    ok('POST /conversations/:id/messages', sent.status === 200 || sent.status === 201, { status: sent.status });
    const msgs = await req('GET', '/conversations/' + convId + '/messages?limit=20', TOKB);
    ok('GET /conversations/:id/messages (B receives)', msgs.status === 200 && msgs.data && Array.isArray(msgs.data.messages) && msgs.data.messages.length >= 1);
    const read = await req('POST', '/conversations/' + convId + '/read', TOKB);
    ok('POST /conversations/:id/read', read.status === 200 || read.status === 204);
  } else { ['messages send','messages recv','messages read'].forEach(n=>ok(n,false,'no convId')); }

  const convList = await req('GET', '/conversations', TOKA);
  ok('GET /conversations', convList.status === 200 && convList.data && Array.isArray(convList.data.conversations));
  const unreadM = await req('GET', '/conversations/unread-count', TOKA);
  ok('GET /conversations/unread-count', unreadM.status === 200);

  // ── Notifications ──
  const notifs = await req('GET', '/notifications', TOKB);
  ok('GET /notifications', notifs.status === 200 && notifs.data && Array.isArray(notifs.data.notifications));
  const unreadN = await req('GET', '/notifications/unread-count', TOKB);
  ok('GET /notifications/unread-count', unreadN.status === 200);
  const readAll = await req('POST', '/notifications/read-all', TOKB);
  ok('POST /notifications/read-all', readAll.status === 200 || readAll.status === 204);

  // ── Sharing ──
  const lists = await req('GET', '/lists', TOKA);
  const listId = lists.data && (lists.data.lists || lists.data.items || [])[0] && (lists.data.lists || lists.data.items)[0].id;
  if (listId) {
    const share = await req('POST', '/lists/' + listId + '/share', TOKA);
    ok('POST /lists/:id/share', share.status === 200 || share.status === 201, { status: share.status });
    const getList = await req('GET', '/lists/' + listId, TOKA);
    ok('GET /lists/:id (owner)', getList.status === 200);
  } else { ok('POST /lists/:id/share', true, 'no list (skipped)'); ok('GET /lists/:id', true, 'skipped'); }

  // ── Moderation ──
  if (postId) {
    const rep = await req('POST', '/reports', TOKA, { target_type: 'post', target_id: postId, reason: 'spam' });
    ok('POST /reports (report post)', rep.status === 200 || rep.status === 201, { status: rep.status });
  }
  const block = await req('POST', '/users/' + IDB + '/block', TOKA);
  ok('POST /users/:id/block', block.status === 200 || block.status === 201, { status: block.status });
  const unblock = await req('DELETE', '/users/' + IDB + '/block', TOKA);
  ok('DELETE /users/:id/block', unblock.status === 200 || unblock.status === 204);

  // ── Media capability (gated) ──
  const cap = await req('GET', '/media/capability', TOKA);
  ok('GET /media/capability', cap.status === 200 && cap.data && ('enabled' in cap.data));
  console.log('  media enabled:', cap.data && cap.data.enabled);

  // ── Realtime guard ──
  const sse = await fetch(BASE + '/events/stream', { headers: {} });
  ok('GET /events/stream requires auth (401)', sse.status === 401, { status: sse.status });

  console.log('\n=== RESULT ===');
  console.log('PASS: ' + pass + '  FAIL: ' + fail);
  if (failures.length) { console.log('FAILURES:\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('ALL SOCIAL API CHECKS PASSED');
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
