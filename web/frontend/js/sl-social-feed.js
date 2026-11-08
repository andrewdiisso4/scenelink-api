/**
 * SceneLink — Real Social Feed (v2)
 * Wires social-feed.html to real backend endpoints:
 *   GET  /api/posts/feed           — posts + checkins + reviews (real users only)
 *   POST /api/posts                — create post
 *   POST /api/posts/:id/like       — toggle like
 *   GET  /api/posts/:id/comments   — list comments
 *   POST /api/posts/:id/comments   — add comment
 *
 * Zero fake data. Clean empty-state when nothing real yet.
 */
(function () {
    'use strict';

    const isSocialPage = /social-feed\.html/.test(window.location.pathname) ||
                         /^\/social/.test(window.location.pathname) ||
                         document.body.getAttribute('data-page') === 'social' ||
                         !!document.querySelector('.social-feed-container, [data-social-feed]');
    if (!isSocialPage) return;

    const STATE = { me: null, items: [], loading: false };

    async function init() {
        if (!window.SLApi) return;
        await loadMe();
        mountContainer();
        await refresh();
    }

    async function loadMe() {
        if (!window.SLApi.isLoggedIn()) { STATE.me = null; return; }
        try {
            const r = await window.SLApi.me();
            STATE.me = (r && (r.user || r)) || null;
        } catch (_) { STATE.me = null; }
    }

    function mountContainer() {
        let c = document.querySelector('#sl-social-feed');
        if (c) return c;
        c = document.createElement('section');
        c.id = 'sl-social-feed';
        c.style.cssText = 'max-width:720px;margin:24px auto;padding:0 16px;';
        const main = document.querySelector('main, .social-landing, body');
        const firstSection = main && main.querySelector('section');
        if (firstSection) firstSection.parentNode.insertBefore(c, firstSection.nextSibling);
        else main && main.appendChild(c);
        return c;
    }

    async function refresh() {
        const c = document.querySelector('#sl-social-feed') || mountContainer();
        STATE.loading = true;
        c.innerHTML = headerHtml() + composerHtml() + '<div class="slf-loading" style="text-align:center;padding:40px;color:rgba(255,255,255,.5);">Loading feed…</div>';
        try {
            const res = await fetch('/api/posts/feed', authHeader());
            const data = res.ok ? await res.json() : { items: [] };
            STATE.items = data.items || [];
        } catch (_) {
            STATE.items = [];
        }
        STATE.loading = false;
        render();
    }

    function authHeader() {
        const tok = window.SLApi && window.SLApi.getToken && window.SLApi.getToken();
        return tok ? { headers: { 'Authorization': 'Bearer ' + tok } } : {};
    }

    function render() {
        const c = document.querySelector('#sl-social-feed');
        if (!c) return;
        let html = headerHtml() + composerHtml();
        if (!STATE.items.length) {
            html += emptyStateHtml();
        } else {
            html += STATE.items.map(renderItem).join('');
        }
        c.innerHTML = html;
        bindEvents(c);
        document.querySelectorAll('.friends-section,[data-friends-section]').forEach(el => {
            el.innerHTML = friendsCtaHtml();
        });
    }

    function headerHtml() {
        return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
               '<h2 style="color:#D4AF37;margin:0;font-size:20px;">Live Feed</h2>' +
               '<span style="color:rgba(255,255,255,.5);font-size:12px;">' +
                 '<i class="fas fa-circle" style="color:#0f0;font-size:8px;animation:pulse 1.5s infinite;"></i> ' +
                 (STATE.items.length) + ' posts' +
               '</span>' +
               '</div>';
    }

    function composerHtml() {
        if (!STATE.me) {
            return '<div style="background:linear-gradient(135deg,#1a1a1a,#0f0f0f);border:1px solid rgba(212,175,55,.3);border-radius:12px;padding:20px;margin-bottom:16px;text-align:center;">' +
                     '<div style="color:#D4AF37;font-weight:600;margin-bottom:8px;">Join the conversation</div>' +
                     '<div style="color:rgba(255,255,255,.6);font-size:14px;margin-bottom:12px;">Sign up to check in, share, and see where your crew is tonight.</div>' +
                     '<button class="sl-auth-trigger" style="background:linear-gradient(135deg,#D4AF37,#b8860b);color:#000;padding:10px 24px;border-radius:8px;border:none;font-weight:600;cursor:pointer;">Sign Up Free</button>' +
                   '</div>';
        }
        const name = STATE.me.display_name || (STATE.me.email||'').split('@')[0] || 'you';
        const initial = (name || 'S').charAt(0).toUpperCase();
        return '<div class="slf-composer" style="background:#141414;border:1px solid rgba(212,175,55,.2);border-radius:12px;padding:14px;margin-bottom:16px;">' +
                 '<div style="display:flex;gap:10px;align-items:flex-start;">' +
                   '<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#D4AF37,#b8860b);color:#000;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;">' + escapeHtml(initial) + '</div>' +
                   '<textarea class="slf-composer-body" rows="2" placeholder="What\'s the move tonight, ' + escapeHtml(name.split(' ')[0]) + '?" maxlength="2000" style="flex:1;background:#0c0c0c;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:10px;color:#fff;font-size:14px;font-family:inherit;resize:vertical;"></textarea>' +
                 '</div>' +
                 '<div style="display:flex;justify-content:flex-end;margin-top:10px;">' +
                   '<button class="slf-post-btn" style="background:#D4AF37;color:#000;border:none;padding:8px 18px;border-radius:8px;font-weight:600;cursor:pointer;">Post</button>' +
                 '</div>' +
               '</div>';
    }

    function emptyStateHtml() {
        return '<div style="background:#141414;border:1px dashed rgba(212,175,55,.25);border-radius:12px;padding:40px 24px;text-align:center;color:rgba(255,255,255,.6);">' +
                 '<i class="fas fa-comments" style="font-size:32px;color:#D4AF37;margin-bottom:12px;display:block;"></i>' +
                 '<div style="color:#D4AF37;font-weight:600;font-size:16px;margin-bottom:6px;">No posts yet</div>' +
                 '<div style="font-size:13px;">Be the first to share where you\'re going tonight, check in at a venue, or review a spot.</div>' +
               '</div>';
    }

    function friendsCtaHtml() {
        return '<div style="background:#141414;border:1px dashed rgba(212,175,55,.3);border-radius:12px;padding:20px;text-align:center;color:rgba(255,255,255,.6);">' +
                 '<i class="fas fa-user-friends" style="font-size:22px;color:#D4AF37;margin-bottom:6px;display:block;"></i>' +
                 '<div style="color:#D4AF37;font-weight:600;margin-bottom:4px;">Add friends</div>' +
                 '<div style="font-size:13px;"><a href="/profile" style="color:#D4AF37;">Go to your profile</a> to find people and send friend requests.</div>' +
               '</div>';
    }

    function renderItem(x) {
        const name = x.display_name || x.username || 'SceneLink user';
        const handle = x.username ? '@' + x.username : '';
        const initial = (name || 'S').charAt(0).toUpperCase();
        const timeAgo = formatTimeAgo(x.created_at);
        const kindLabel = kindLabelFor(x);
        const venueHtml = x.venue_id && x.venue_name
            ? '<a href="/explore?venue=' + encodeURIComponent(x.venue_id) + '" style="color:#D4AF37;text-decoration:none;"><b>' + escapeHtml(x.venue_name) + '</b></a>' + (x.venue_neighborhood ? ' <span style="color:rgba(255,255,255,.4);">· ' + escapeHtml(x.venue_neighborhood) + '</span>' : '')
            : '';
        const body = x.body ? '<div style="color:rgba(255,255,255,.85);font-size:14px;margin-top:6px;">' + escapeHtml(x.body) + '</div>' : '';
        const ratingLine = x.kind === 'review' && x.rating
            ? '<div style="color:#D4AF37;font-size:13px;margin-top:4px;">' + renderStars(Number(x.rating)) + ' <span style="color:rgba(255,255,255,.5);">' + Number(x.rating).toFixed(1) + '</span></div>'
            : '';
        const imageHtml = x.image_url
            ? '<img src="' + x.image_url + '" alt="" style="width:100%;max-height:320px;object-fit:cover;border-radius:8px;margin-top:10px;">'
            : '';
        const isPost = x.kind === 'post';
        const actionsBar = isPost ? renderActionsBar(x) : '';

        return '<article class="slf-item" data-post-id="' + (x.id || '') + '" data-kind="' + (x.kind || '') + '" style="background:#141414;border:1px solid rgba(255,255,255,.05);border-radius:12px;padding:14px;margin-bottom:12px;">' +
                 '<div style="display:flex;gap:12px;">' +
                   '<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#D4AF37,#b8860b);color:#000;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;">' + escapeHtml(initial) + '</div>' +
                   '<div style="flex:1;min-width:0;">' +
                     '<div style="font-size:14px;color:#fff;">' +
                       '<b>' + escapeHtml(name) + '</b>' +
                       (handle ? ' <span style="color:rgba(255,255,255,.4);font-weight:400;font-size:12px;">' + escapeHtml(handle) + '</span>' : '') +
                       ' <span style="color:rgba(255,255,255,.55);">· ' + kindLabel + '</span>' +
                       (venueHtml ? ' ' + venueHtml : '') +
                     '</div>' +
                     body + imageHtml + ratingLine +
                     '<div style="color:rgba(255,255,255,.4);font-size:11px;margin-top:8px;">' + timeAgo + '</div>' +
                     actionsBar +
                   '</div>' +
                 '</div>' +
               '</article>';
    }

    function renderActionsBar(x) {
        const likedClass = x.liked_by_me ? 'slf-liked' : '';
        const likeColor = x.liked_by_me ? '#D4AF37' : 'rgba(255,255,255,.6)';
        const loggedIn = !!STATE.me;
        return '<div class="slf-actions" style="display:flex;gap:18px;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.05);font-size:13px;color:rgba(255,255,255,.6);">' +
                 '<button class="slf-like-btn ' + likedClass + '" ' + (loggedIn?'':'data-login-required') + ' style="background:none;border:none;color:' + likeColor + ';cursor:pointer;font-size:13px;display:flex;align-items:center;gap:4px;">' +
                   '<i class="fas fa-heart"></i> <span class="slf-like-count">' + (x.like_count||0) + '</span>' +
                 '</button>' +
                 '<button class="slf-comment-toggle" style="background:none;border:none;color:rgba(255,255,255,.6);cursor:pointer;font-size:13px;display:flex;align-items:center;gap:4px;">' +
                   '<i class="far fa-comment"></i> <span class="slf-comment-count">' + (x.comment_count||0) + '</span>' +
                 '</button>' +
                 (loggedIn && (!STATE.me || STATE.me.id !== x.user_id) ?
                   '<button class="slf-report-btn" data-action="report" data-target-type="post" data-target-id="' + x.id + '" data-target-label="this post" title="Report" style="background:none;border:none;color:rgba(255,255,255,.35);cursor:pointer;font-size:13px;margin-left:auto;padding:2px 6px;" aria-label="Report post">' +
                     '<i class="fas fa-flag"></i>' +
                   '</button>' : '') +
               '</div>' +
               '<div class="slf-comments" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.05);"></div>';
    }

    function kindLabelFor(x) {
        if (x.kind === 'checkin') return '<span style="color:rgba(255,255,255,.55);">checked in at</span>';
        if (x.kind === 'review')  return '<span style="color:rgba(255,255,255,.55);">reviewed</span>';
        if (x.kind === 'post' && x.venue_id) return '<span style="color:rgba(255,255,255,.55);">at</span>';
        return '';
    }

    function renderStars(r) {
        const n = Math.max(0, Math.min(5, Math.round(r)));
        return '★'.repeat(n) + '<span style="color:rgba(255,255,255,.2);">' + '★'.repeat(5 - n) + '</span>';
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function formatTimeAgo(iso) {
        if (!iso) return 'just now';
        const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
        if (s < 60) return s + 's ago';
        if (s < 3600) return Math.floor(s / 60) + 'm ago';
        if (s < 86400) return Math.floor(s / 3600) + 'h ago';
        return Math.floor(s / 86400) + 'd ago';
    }

    function bindEvents(root) {
        const postBtn = root.querySelector('.slf-post-btn');
        const bodyEl = root.querySelector('.slf-composer-body');
        if (postBtn && bodyEl) {
            postBtn.addEventListener('click', async function () {
                const body = bodyEl.value.trim();
                if (!body) { bodyEl.focus(); return; }
                postBtn.disabled = true;
                postBtn.textContent = 'Posting…';
                try {
                    const res = await fetch('/api/posts', {
                        method: 'POST',
                        headers: Object.assign({ 'Content-Type': 'application/json' }, (authHeader().headers || {})),
                        body: JSON.stringify({ body: body })
                    });
                    if (!res.ok) throw new Error('failed');
                    bodyEl.value = '';
                    await refresh();
                } catch (_) {
                    postBtn.textContent = 'Try again';
                    setTimeout(() => { postBtn.textContent = 'Post'; postBtn.disabled = false; }, 1500);
                }
            });
        }

        root.querySelectorAll('.slf-item').forEach(function (article) {
            const postId = article.getAttribute('data-post-id');
            const isPost = article.getAttribute('data-kind') === 'post';
            if (!isPost || !postId) return;

            const likeBtn = article.querySelector('.slf-like-btn');
            if (likeBtn) {
                likeBtn.addEventListener('click', async function () {
                    if (likeBtn.hasAttribute('data-login-required')) return openLogin('like posts');
                    try {
                        const res = await fetch('/api/posts/' + postId + '/like', {
                            method: 'POST',
                            headers: (authHeader().headers || {})
                        });
                        if (res.ok) {
                            const j = await res.json();
                            article.querySelector('.slf-like-count').textContent = j.like_count;
                            likeBtn.style.color = j.liked ? '#D4AF37' : 'rgba(255,255,255,.6)';
                        }
                    } catch (_) {}
                });
            }

            const commentToggle = article.querySelector('.slf-comment-toggle');
            const commentsBox = article.querySelector('.slf-comments');
            if (commentToggle && commentsBox) {
                commentToggle.addEventListener('click', async function () {
                    const visible = commentsBox.style.display !== 'none';
                    if (visible) { commentsBox.style.display = 'none'; return; }
                    commentsBox.style.display = 'block';
                    commentsBox.innerHTML = '<div style="color:rgba(255,255,255,.4);font-size:12px;">Loading…</div>';
                    try {
                        const res = await fetch('/api/posts/' + postId + '/comments');
                        const data = res.ok ? await res.json() : { comments: [] };
                        commentsBox.innerHTML = renderCommentsUI(data.comments || []);
                        wireCommentSubmit(commentsBox, postId, article);
                    } catch (_) {
                        commentsBox.innerHTML = '<div style="color:#f66;font-size:12px;">Couldn\'t load comments.</div>';
                    }
                });
            }
        });
    }

    function renderCommentsUI(comments) {
        const list = comments.map(function (c) {
            return '<div style="display:flex;gap:8px;margin-bottom:8px;">' +
                     '<div style="width:28px;height:28px;border-radius:50%;background:#D4AF37;color:#000;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0;">' + escapeHtml((c.display_name||'S').charAt(0).toUpperCase()) + '</div>' +
                     '<div style="flex:1;background:#0c0c0c;border-radius:10px;padding:8px 10px;">' +
                       '<div style="font-size:12px;color:#fff;"><b>' + escapeHtml(c.display_name || c.username || 'user') + '</b> <span style="color:rgba(255,255,255,.4);font-weight:400;">· ' + formatTimeAgo(c.created_at) + '</span></div>' +
                       '<div style="font-size:13px;color:rgba(255,255,255,.85);margin-top:2px;">' + escapeHtml(c.body) + '</div>' +
                     '</div>' +
                   '</div>';
        }).join('') || '<div style="color:rgba(255,255,255,.4);font-size:12px;margin-bottom:8px;">Be the first to comment.</div>';

        const canComment = !!STATE.me;
        const composer = canComment
            ? '<div style="display:flex;gap:8px;margin-top:6px;">' +
                '<input class="slf-comment-input" placeholder="Write a comment…" maxlength="1000" style="flex:1;background:#0c0c0c;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:8px;color:#fff;font-size:13px;">' +
                '<button class="slf-comment-submit" style="background:#D4AF37;color:#000;border:none;padding:6px 14px;border-radius:8px;font-weight:600;cursor:pointer;">Send</button>' +
              '</div>'
            : '<div style="color:rgba(255,255,255,.4);font-size:12px;">' +
                '<button class="sl-auth-trigger" style="background:none;border:none;color:#D4AF37;cursor:pointer;font-size:12px;text-decoration:underline;">Log in</button> to comment.' +
              '</div>';
        return list + composer;
    }

    function wireCommentSubmit(commentsBox, postId, article) {
        const btn = commentsBox.querySelector('.slf-comment-submit');
        const input = commentsBox.querySelector('.slf-comment-input');
        if (!btn || !input) return;
        async function submit() {
            const body = input.value.trim();
            if (!body) return;
            btn.disabled = true;
            try {
                const res = await fetch('/api/posts/' + postId + '/comments', {
                    method: 'POST',
                    headers: Object.assign({ 'Content-Type': 'application/json' }, (authHeader().headers || {})),
                    body: JSON.stringify({ body: body })
                });
                if (!res.ok) throw new Error('failed');
                input.value = '';
                const refresh = await fetch('/api/posts/' + postId + '/comments');
                const data = refresh.ok ? await refresh.json() : { comments: [] };
                commentsBox.innerHTML = renderCommentsUI(data.comments || []);
                wireCommentSubmit(commentsBox, postId, article);
                const countEl = article.querySelector('.slf-comment-count');
                if (countEl) countEl.textContent = (data.comments || []).length;
            } catch (_) {} finally { btn.disabled = false; }
        }
        btn.addEventListener('click', submit);
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });
    }

    function openLogin(actionLabel) {
        const ev = new CustomEvent('sl-open-auth', { detail: { action: actionLabel || 'continue' } });
        document.dispatchEvent(ev);
        const trigger = document.querySelector('.sl-auth-trigger');
        if (trigger) trigger.click();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
    document.addEventListener('sl-auth-change', async function () { await loadMe(); render(); });
})();