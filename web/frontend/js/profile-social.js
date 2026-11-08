/* ============================================
   PROFILE SOCIAL FEATURES — SceneLink V2 (Real API)

   Wires profile.html to real backend:
     - Edit Profile (PUT /api/auth/profile with username uniqueness)
     - Friends widget (GET /api/friends, /api/friends/pending)
     - All Friends modal (search users, accept/decline/remove)
     - Messages modal (conversations, thread, send)
     - Favorite cuisines (still localStorage — no backend field)

   No fake data. No mock messages. No seed friends.
   ============================================ */

(function () {
  'use strict';

  // Wait until SLApi is available + DOM ready
  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  ready(function () {
    if (!window.SLApi) { console.warn('[profile-social] SLApi not available'); return; }

    var SLApi = window.SLApi;
    var SL_USER = null; // populated after /auth/me
    var FRIENDS_CACHE = [];   // accepted friends
    var PENDING_CACHE = { incoming: [], outgoing: [] };

    // Local-only data: cuisines (no backend field yet)
    var CUISINES_KEY = 'scenelink_cuisines';
    var allCuisines = [
      'Italian', 'Japanese', 'Mexican', 'Thai', 'American', 'Chinese', 'Indian',
      'French', 'Korean', 'Mediterranean', 'Vietnamese', 'Greek', 'Spanish',
      'Ethiopian', 'Brazilian', 'Turkish', 'Peruvian', 'Caribbean', 'Lebanese', 'Moroccan'
    ];

    /* -------------------- Helpers -------------------- */
    function toast(msg, kind) {
      if (window.SLToast) return window.SLToast(msg, 2800, kind);
      console.log('[toast]', msg);
    }
    function esc(s) {
      if (s === null || s === undefined) return '';
      return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function avatarUrl(user) {
      if (!user) return (window.SL_AVATAR ? SL_AVATAR('?') : 'https://ui-avatars.com/api/?name=?&size=50&background=D4AF37&color=0a0a0a');
      if (user.avatar_url) return user.avatar_url;
      var n = user.display_name || user.username || '?';
      return (window.SL_AVATAR ? SL_AVATAR(n) : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(n) +
        '&size=50&background=D4AF37&color=0a0a0a');
    }
    function openModal(id) {
      var m = document.getElementById(id);
      if (!m) return;
      m.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
    function closeModal(id) {
      var m = document.getElementById(id);
      if (!m) return;
      m.classList.remove('active');
      document.body.style.overflow = '';
    }
    function relTime(iso) {
      if (!iso) return '';
      var ms = Date.now() - new Date(iso).getTime();
      var s = Math.floor(ms / 1000);
      if (s < 60) return 'just now';
      var m = Math.floor(s / 60);
      if (m < 60) return m + 'm ago';
      var h = Math.floor(m / 60);
      if (h < 24) return h + 'h ago';
      var d = Math.floor(h / 24);
      if (d < 7) return d + 'd ago';
      return new Date(iso).toLocaleDateString();
    }

    /* -------------------- 1. EDIT PROFILE -------------------- */
    function buildEditProfileModal() {
      if (document.getElementById('editProfileModal')) return;
      var modal = document.createElement('div');
      modal.id = 'editProfileModal';
      modal.className = 'sl-modal-overlay';
      modal.innerHTML =
        '<div class="sl-modal">' +
        '  <div class="sl-modal-header">' +
        '    <h2>Edit Profile</h2>' +
        '    <button class="sl-modal-close" data-close="editProfileModal"><i class="fas fa-times"></i></button>' +
        '  </div>' +
        '  <div class="sl-modal-body">' +
        '    <div class="sl-form-group">' +
        '      <label>Display Name</label>' +
        '      <input type="text" class="sl-input" id="editName" maxlength="100">' +
        '    </div>' +
        '    <div class="sl-form-group">' +
        '      <label>Username</label>' +
        '      <input type="text" class="sl-input" id="editUsername" maxlength="30" autocomplete="off">' +
        '      <div class="sl-char-count" id="editUsernameStatus" style="min-height:16px;"></div>' +
        '    </div>' +
        '    <div class="sl-form-group">' +
        '      <label>Bio</label>' +
        '      <textarea class="sl-input" id="editBio" maxlength="500" rows="3"></textarea>' +
        '      <div class="sl-char-count"><span id="bioCharCount">0</span>/500</div>' +
        '    </div>' +
        '    <div class="sl-form-group">' +
        '      <label>Avatar URL (optional)</label>' +
        '      <input type="url" class="sl-input" id="editAvatarUrl" maxlength="500" placeholder="https://...">' +
        '    </div>' +
        '  </div>' +
        '  <div class="sl-modal-footer">' +
        '    <button class="sl-btn sl-btn-secondary" data-close="editProfileModal">Cancel</button>' +
        '    <button class="sl-btn sl-btn-primary" id="saveProfileBtn"><i class="fas fa-check"></i> Save Changes</button>' +
        '  </div>' +
        '</div>';
      document.body.appendChild(modal);

      modal.querySelectorAll('[data-close]').forEach(function (b) {
        b.addEventListener('click', function () { closeModal('editProfileModal'); });
      });

      var bioEl = document.getElementById('editBio');
      bioEl.addEventListener('input', function () {
        document.getElementById('bioCharCount').textContent = this.value.length;
      });

      // Live username availability check
      var unameInput = document.getElementById('editUsername');
      var unameStatus = document.getElementById('editUsernameStatus');
      var unameTimer = null;
      unameInput.addEventListener('input', function () {
        var v = this.value.trim().toLowerCase();
        clearTimeout(unameTimer);
        if (!v) { unameStatus.textContent = ''; return; }
        if (SL_USER && v === (SL_USER.username || '').toLowerCase()) {
          unameStatus.textContent = 'Your current username';
          unameStatus.style.color = '#888';
          return;
        }
        if (!/^[a-z0-9_]{3,30}$/.test(v)) {
          unameStatus.textContent = '3-30 chars: lowercase letters, numbers, underscore';
          unameStatus.style.color = '#e57373';
          return;
        }
        unameStatus.textContent = 'Checking…';
        unameStatus.style.color = '#888';
        unameTimer = setTimeout(function () {
          SLApi.usernameAvailable(v).then(function (r) {
            if (r && r.available) {
              unameStatus.textContent = '✓ Available';
              unameStatus.style.color = '#66bb6a';
            } else {
              unameStatus.textContent = '✗ Already taken';
              unameStatus.style.color = '#e57373';
            }
          }).catch(function () {
            unameStatus.textContent = '';
          });
        }, 400);
      });

      document.getElementById('saveProfileBtn').addEventListener('click', function () {
        var btn = this;
        var body = {
          display_name: document.getElementById('editName').value.trim(),
          username: document.getElementById('editUsername').value.trim().toLowerCase(),
          bio: document.getElementById('editBio').value,
          avatar_url: document.getElementById('editAvatarUrl').value.trim()
        };
        // Only send fields that changed / are non-empty
        if (!body.display_name) delete body.display_name;
        if (!body.username) delete body.username;
        if (!body.avatar_url) delete body.avatar_url;

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';

        SLApi.updateProfile(body).then(function (r) {
          SL_USER = r.user || SL_USER;
          try { window.SL_USER = SL_USER; } catch (e) {}
          applyProfileToPage(SL_USER);
          closeModal('editProfileModal');
          toast('Profile updated', 'success');
        }).catch(function (err) {
          toast((err && err.message) || 'Could not save profile', 'error');
        }).finally(function () {
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-check"></i> Save Changes';
        });
      });
    }

    function openEditProfile() {
      if (!SL_USER) { toast('Please log in first'); return; }
      buildEditProfileModal();
      document.getElementById('editName').value = SL_USER.display_name || '';
      document.getElementById('editUsername').value = SL_USER.username || '';
      document.getElementById('editBio').value = SL_USER.bio || '';
      document.getElementById('editAvatarUrl').value = SL_USER.avatar_url || '';
      document.getElementById('bioCharCount').textContent = (SL_USER.bio || '').length;
      document.getElementById('editUsernameStatus').textContent = '';
      openModal('editProfileModal');
    }

    function applyProfileToPage(u) {
      if (!u) return;
      var nameEl = document.getElementById('profileDisplayName');
      if (nameEl) nameEl.textContent = u.display_name || u.username || 'SceneLink user';
      var bioEl = document.getElementById('profileBioEl');
      if (bioEl) bioEl.textContent = u.bio || 'Discovering the best of Boston one venue at a time.';
      var emailEl = document.getElementById('profileEmailEl');
      if (emailEl) emailEl.textContent = u.username ? '@' + u.username : (u.email || '');
      var avEl = document.getElementById('profileAvatarImg');
      if (avEl) avEl.src = avatarUrl(u).replace('size=50', 'size=200');
    }

    function wireEditProfileButton() {
      var btn = document.getElementById('profileEditBtn');
      if (btn) btn.addEventListener('click', openEditProfile);
      var own = document.getElementById('profileOwnActionsRow');
      if (own) own.style.display = '';
      var other = document.getElementById('profileActionsRow');
      if (other) other.style.display = 'none';
    }

    /* -------------------- 2. FRIENDS WIDGET -------------------- */
    function renderFriendsWidget() {
      var list = document.getElementById('profileFriendsList');
      if (!list) return;

      if (!SLApi.isLoggedIn()) {
        list.innerHTML =
          '<div style="padding:20px;text-align:center;color:rgba(255,255,255,0.4);font-size:13px;">' +
          '<i class="fas fa-user-friends" style="font-size:24px;margin-bottom:8px;display:block;opacity:0.4;"></i>' +
          'Log in to connect with friends</div>';
        return;
      }

      // loading state
      list.innerHTML =
        '<div style="padding:20px;text-align:center;color:rgba(255,255,255,0.4);font-size:13px;">' +
        '<i class="fas fa-spinner fa-spin"></i></div>';

      Promise.all([SLApi.friends(), SLApi.friendsPending()]).then(function (results) {
        FRIENDS_CACHE = (results[0] && results[0].friends) || [];
        PENDING_CACHE = {
          incoming: (results[1] && results[1].incoming) || [],
          outgoing: (results[1] && results[1].outgoing) || []
        };

        if (FRIENDS_CACHE.length === 0 && PENDING_CACHE.incoming.length === 0) {
          list.innerHTML =
            '<div style="padding:20px;text-align:center;color:rgba(255,255,255,0.4);font-size:13px;">' +
            '<i class="fas fa-user-friends" style="font-size:24px;margin-bottom:8px;display:block;opacity:0.4;"></i>' +
            'No friends yet — tap below to find people' +
            '</div>';
          return;
        }

        var html = '';
        if (PENDING_CACHE.incoming.length > 0) {
          html += '<div style="padding:8px 12px;font-size:11px;text-transform:uppercase;color:#D4AF37;letter-spacing:0.5px;">' +
            PENDING_CACHE.incoming.length + ' pending ' +
            (PENDING_CACHE.incoming.length === 1 ? 'request' : 'requests') + '</div>';
        }
        var toShow = FRIENDS_CACHE.slice(0, 5);
        if (toShow.length === 0) {
          html += '<div style="padding:12px;text-align:center;color:rgba(255,255,255,0.4);font-size:13px;">No friends yet</div>';
        } else {
          toShow.forEach(function (f) {
            html +=
              '<a href="#" class="friend-item" data-friend-id="' + esc(f.user_id) + '">' +
              '  <img src="' + esc(avatarUrl(f)) + '" alt="' + esc(f.display_name || f.username) + '">' +
              '  <div class="friend-info">' +
              '    <span class="friend-name">' + esc(f.display_name || f.username) + '</span>' +
              '    <span class="friend-status">@' + esc(f.username || '') + '</span>' +
              '  </div>' +
              '  <div class="friend-item-actions">' +
              '    <button class="sl-btn-icon btn-msg-friend" data-friend-id="' + esc(f.user_id) + '" title="Message">' +
              '      <i class="fas fa-comment"></i>' +
              '    </button>' +
              '  </div>' +
              '</a>';
          });
        }
        list.innerHTML = html;

        list.querySelectorAll('.btn-msg-friend').forEach(function (btn) {
          btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            openMessageModal(this.dataset.friendId);
          });
        });
      }).catch(function () {
        list.innerHTML =
          '<div style="padding:20px;text-align:center;color:#e57373;font-size:13px;">' +
          'Could not load friends</div>';
      });

      // Hook "Find Friends" button to all-friends modal
      var findBtn = list.closest('.profile-widget') && list.closest('.profile-widget').querySelector('.btn-view-all');
      if (findBtn && !findBtn.dataset.wired) {
        findBtn.dataset.wired = '1';
        findBtn.textContent = 'Find Friends';
        findBtn.addEventListener('click', function (e) {
          e.preventDefault();
          openAllFriendsModal();
        });
      }
    }

    /* -------------------- 3. ALL FRIENDS MODAL -------------------- */
    function buildAllFriendsModal() {
      if (document.getElementById('allFriendsModal')) return;
      var modal = document.createElement('div');
      modal.id = 'allFriendsModal';
      modal.className = 'sl-modal-overlay';
      modal.innerHTML =
        '<div class="sl-modal" style="max-width:560px;">' +
        '  <div class="sl-modal-header">' +
        '    <h2>Friends</h2>' +
        '    <button class="sl-modal-close" data-close="allFriendsModal"><i class="fas fa-times"></i></button>' +
        '  </div>' +
        '  <div class="sl-modal-tabs" style="display:flex;border-bottom:1px solid rgba(255,255,255,0.08);">' +
        '    <button class="sl-tab-btn active" data-tab="friends">Friends <span id="tabCountFriends">0</span></button>' +
        '    <button class="sl-tab-btn" data-tab="pending">Pending <span id="tabCountPending">0</span></button>' +
        '    <button class="sl-tab-btn" data-tab="find">Find People</button>' +
        '  </div>' +
        '  <div class="sl-modal-body" id="allFriendsBody" style="min-height:320px;"></div>' +
        '</div>';
      document.body.appendChild(modal);

      modal.querySelectorAll('[data-close]').forEach(function (b) {
        b.addEventListener('click', function () { closeModal('allFriendsModal'); });
      });
      modal.querySelectorAll('.sl-tab-btn').forEach(function (tab) {
        tab.addEventListener('click', function () {
          modal.querySelectorAll('.sl-tab-btn').forEach(function (t) { t.classList.remove('active'); });
          this.classList.add('active');
          renderAllFriendsTab(this.dataset.tab);
        });
      });

      // Minimal tab styles
      if (!document.getElementById('sl-tab-style')) {
        var st = document.createElement('style');
        st.id = 'sl-tab-style';
        st.textContent =
          '.sl-tab-btn{flex:1;background:transparent;border:0;color:#aaa;padding:12px;font-size:13px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;}' +
          '.sl-tab-btn.active{color:#D4AF37;border-bottom-color:#D4AF37;}' +
          '.sl-tab-btn span{display:inline-block;background:rgba(212,175,55,0.15);color:#D4AF37;padding:1px 6px;border-radius:8px;margin-left:4px;font-size:11px;}' +
          '.sl-friend-row{display:flex;align-items:center;gap:12px;padding:12px;border-radius:8px;}' +
          '.sl-friend-row:hover{background:rgba(255,255,255,0.04);}' +
          '.sl-friend-row img{width:44px;height:44px;border-radius:50%;object-fit:cover;}' +
          '.sl-friend-row .sl-friend-meta{flex:1;min-width:0;}' +
          '.sl-friend-row .sl-friend-meta strong{color:#fff;font-size:14px;display:block;}' +
          '.sl-friend-row .sl-friend-meta small{color:#888;font-size:12px;}' +
          '.sl-friend-row .sl-btn{padding:6px 12px;font-size:12px;}' +
          '.sl-empty{text-align:center;padding:40px 20px;color:rgba(255,255,255,0.4);font-size:13px;}' +
          '.sl-search-bar{display:flex;gap:8px;margin-bottom:12px;}' +
          '.sl-search-bar input{flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#fff;padding:10px 12px;border-radius:8px;font-size:14px;}';
        document.head.appendChild(st);
      }
    }

    function openAllFriendsModal() {
      if (!SLApi.isLoggedIn()) { toast('Please log in first'); return; }
      buildAllFriendsModal();
      openModal('allFriendsModal');
      renderAllFriendsTab('friends');
      // refresh counts
      Promise.all([SLApi.friends(), SLApi.friendsPending()]).then(function (r) {
        var f = (r[0] && r[0].friends) || [];
        var p = (r[1] && r[1].incoming) || [];
        document.getElementById('tabCountFriends').textContent = f.length;
        document.getElementById('tabCountPending').textContent = p.length;
        FRIENDS_CACHE = f;
        PENDING_CACHE.incoming = p;
        PENDING_CACHE.outgoing = (r[1] && r[1].outgoing) || [];
      }).catch(function () {});
    }

    function renderAllFriendsTab(tab) {
      var body = document.getElementById('allFriendsBody');
      if (!body) return;

      if (tab === 'friends') {
        body.innerHTML = '<div class="sl-empty"><i class="fas fa-spinner fa-spin"></i></div>';
        SLApi.friends().then(function (r) {
          var f = (r && r.friends) || [];
          FRIENDS_CACHE = f;
          document.getElementById('tabCountFriends').textContent = f.length;
          if (f.length === 0) {
            body.innerHTML = '<div class="sl-empty">No friends yet. Use "Find People" to connect.</div>';
            return;
          }
          body.innerHTML = f.map(friendRowHtml).join('');
          body.querySelectorAll('[data-act="message"]').forEach(function (b) {
            b.addEventListener('click', function () { openMessageModal(this.dataset.userId); });
          });
          body.querySelectorAll('[data-act="remove"]').forEach(function (b) {
            b.addEventListener('click', function () {
              var id = this.dataset.userId;
              if (!confirm('Remove this friend?')) return;
              SLApi.removeFriend(id).then(function () {
                toast('Friend removed');
                renderAllFriendsTab('friends');
                renderFriendsWidget();
              }).catch(function (e) { toast(e.message || 'Failed', 'error'); });
            });
          });
        }).catch(function () {
          body.innerHTML = '<div class="sl-empty" style="color:#e57373;">Could not load friends</div>';
        });
      } else if (tab === 'pending') {
        body.innerHTML = '<div class="sl-empty"><i class="fas fa-spinner fa-spin"></i></div>';
        SLApi.friendsPending().then(function (r) {
          var inc = (r && r.incoming) || [];
          var out = (r && r.outgoing) || [];
          PENDING_CACHE.incoming = inc;
          PENDING_CACHE.outgoing = out;
          document.getElementById('tabCountPending').textContent = inc.length;
          if (inc.length === 0 && out.length === 0) {
            body.innerHTML = '<div class="sl-empty">No pending requests</div>';
            return;
          }
          var html = '';
          if (inc.length > 0) {
            html += '<div style="font-size:11px;text-transform:uppercase;color:#D4AF37;letter-spacing:0.5px;padding:8px 4px;">Incoming</div>';
            html += inc.map(function (u) { return friendRowHtml(u, 'incoming'); }).join('');
          }
          if (out.length > 0) {
            html += '<div style="font-size:11px;text-transform:uppercase;color:#888;letter-spacing:0.5px;padding:12px 4px 8px;">Sent</div>';
            html += out.map(function (u) { return friendRowHtml(u, 'outgoing'); }).join('');
          }
          body.innerHTML = html;

          body.querySelectorAll('[data-act="accept"]').forEach(function (b) {
            b.addEventListener('click', function () {
              SLApi.acceptFriend(this.dataset.friendshipId).then(function () {
                toast('Friend request accepted', 'success');
                renderAllFriendsTab('pending');
                renderFriendsWidget();
              }).catch(function (e) { toast(e.message || 'Failed', 'error'); });
            });
          });
          body.querySelectorAll('[data-act="decline"]').forEach(function (b) {
            b.addEventListener('click', function () {
              SLApi.declineFriend(this.dataset.friendshipId).then(function () {
                toast('Request declined');
                renderAllFriendsTab('pending');
              }).catch(function (e) { toast(e.message || 'Failed', 'error'); });
            });
          });
          body.querySelectorAll('[data-act="cancel"]').forEach(function (b) {
            b.addEventListener('click', function () {
              SLApi.removeFriend(this.dataset.userId).then(function () {
                toast('Request cancelled');
                renderAllFriendsTab('pending');
              }).catch(function (e) { toast(e.message || 'Failed', 'error'); });
            });
          });
        }).catch(function () {
          body.innerHTML = '<div class="sl-empty" style="color:#e57373;">Could not load requests</div>';
        });
      } else if (tab === 'find') {
        body.innerHTML =
          '<div class="sl-search-bar">' +
          '  <input type="text" id="findUsersInput" placeholder="Search by username or name…" autocomplete="off">' +
          '</div>' +
          '<div id="findUsersResults"><div class="sl-empty">Start typing to find people</div></div>';

        var input = document.getElementById('findUsersInput');
        var results = document.getElementById('findUsersResults');
        var timer = null;
        input.addEventListener('input', function () {
          var q = this.value.trim();
          clearTimeout(timer);
          if (q.length < 2) {
            results.innerHTML = '<div class="sl-empty">Type at least 2 characters</div>';
            return;
          }
          results.innerHTML = '<div class="sl-empty"><i class="fas fa-spinner fa-spin"></i></div>';
          timer = setTimeout(function () {
            SLApi.searchUsers(q, 15).then(function (r) {
              var users = (r && (r.users || r.results)) || [];
              if (users.length === 0) {
                results.innerHTML = '<div class="sl-empty">No users found</div>';
                return;
              }
              results.innerHTML = users.map(function (u) { return friendRowHtml(u, 'find'); }).join('');
              results.querySelectorAll('[data-act="request"]').forEach(function (b) {
                b.addEventListener('click', function () {
                  var btn = this;
                  var uid = this.dataset.userId;
                  btn.disabled = true;
                  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                  SLApi.sendFriendRequest({ user_id: uid }).then(function () {
                    btn.innerHTML = '<i class="fas fa-check"></i> Sent';
                    btn.classList.remove('sl-btn-primary');
                    btn.classList.add('sl-btn-secondary');
                    toast('Friend request sent', 'success');
                  }).catch(function (e) {
                    btn.disabled = false;
                    btn.innerHTML = 'Add';
                    toast(e.message || 'Failed', 'error');
                  });
                });
              });
            }).catch(function () {
              results.innerHTML = '<div class="sl-empty" style="color:#e57373;">Search failed</div>';
            });
          }, 300);
        });
      }
    }

    function friendRowHtml(u, mode) {
      var name = esc(u.display_name || u.username || 'User');
      var handle = u.username ? '@' + esc(u.username) : '';
      var uid = esc(u.user_id || u.id);
      var actions = '';
      if (mode === 'incoming') {
        actions =
          '<button class="sl-btn sl-btn-primary" data-act="accept" data-friendship-id="' + esc(u.friendship_id) + '">Accept</button>' +
          '<button class="sl-btn sl-btn-secondary" data-act="decline" data-friendship-id="' + esc(u.friendship_id) + '" style="margin-left:4px;">Decline</button>';
      } else if (mode === 'outgoing') {
        actions =
          '<button class="sl-btn sl-btn-secondary" data-act="cancel" data-user-id="' + uid + '">Cancel</button>';
      } else if (mode === 'find') {
        actions = '<button class="sl-btn sl-btn-primary" data-act="request" data-user-id="' + uid + '">Add</button>';
      } else {
        actions =
          '<button class="sl-btn sl-btn-secondary" data-act="message" data-user-id="' + uid + '"><i class="fas fa-comment"></i></button>' +
          '<button class="sl-btn sl-btn-secondary" data-act="remove" data-user-id="' + uid + '" style="margin-left:4px;">Remove</button>';
      }
      return (
        '<div class="sl-friend-row">' +
        '  <img src="' + esc(avatarUrl(u)) + '" alt="">' +
        '  <div class="sl-friend-meta">' +
        '    <strong>' + name + '</strong>' +
        (handle ? '<small>' + handle + '</small>' : '') +
        '  </div>' +
        '  <div>' + actions + '</div>' +
        '</div>'
      );
    }

    /* -------------------- 4. MESSAGE MODAL -------------------- */
    function buildMessageModal() {
      if (document.getElementById('messageModal')) return;
      var modal = document.createElement('div');
      modal.id = 'messageModal';
      modal.className = 'sl-modal-overlay';
      modal.innerHTML =
        '<div class="sl-modal" style="max-width:560px;display:flex;flex-direction:column;height:min(80vh,680px);">' +
        '  <div class="sl-modal-header">' +
        '    <h2 id="messageModalTitle">Messages</h2>' +
        '    <button class="sl-modal-close" data-close="messageModal"><i class="fas fa-times"></i></button>' +
        '  </div>' +
        '  <div id="messageThread" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;"></div>' +
        '  <div style="padding:12px;border-top:1px solid rgba(255,255,255,0.08);display:flex;gap:8px;">' +
        '    <input type="text" id="messageInput" placeholder="Type a message…" maxlength="4000" ' +
        '      style="flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#fff;padding:10px 12px;border-radius:8px;font-size:14px;">' +
        '    <button class="sl-btn sl-btn-primary" id="messageSendBtn"><i class="fas fa-paper-plane"></i></button>' +
        '  </div>' +
        '</div>';
      document.body.appendChild(modal);

      modal.querySelectorAll('[data-close]').forEach(function (b) {
        b.addEventListener('click', function () { closeModal('messageModal'); });
      });
      document.getElementById('messageSendBtn').addEventListener('click', sendCurrentMessage);
      document.getElementById('messageInput').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') sendCurrentMessage();
      });

      if (!document.getElementById('sl-msg-style')) {
        var st = document.createElement('style');
        st.id = 'sl-msg-style';
        st.textContent =
          '.sl-msg{max-width:75%;padding:8px 12px;border-radius:14px;font-size:14px;line-height:1.4;word-break:break-word;}' +
          '.sl-msg.me{align-self:flex-end;background:linear-gradient(135deg,#D4AF37,#b8860b);color:#000;}' +
          '.sl-msg.them{align-self:flex-start;background:rgba(255,255,255,0.08);color:#fff;}' +
          '.sl-msg small{display:block;font-size:10px;opacity:0.6;margin-top:2px;}';
        document.head.appendChild(st);
      }
    }

    var CURRENT_CONV = null;

    function openMessageModal(otherUserId) {
      if (!SLApi.isLoggedIn()) { toast('Please log in first'); return; }
      buildMessageModal();
      openModal('messageModal');
      var thread = document.getElementById('messageThread');
      thread.innerHTML = '<div class="sl-empty"><i class="fas fa-spinner fa-spin"></i></div>';
      document.getElementById('messageModalTitle').textContent = 'Messages';
      CURRENT_CONV = null;

      SLApi.startConversation(otherUserId).then(function (r) {
        // Backend returns { conversation_id, reused } or { conversation: {...} }
        var conv = r && (r.conversation || r);
        var convId = (r && r.conversation_id) || (conv && conv.id);
        if (!convId) throw new Error('No conversation id');
        CURRENT_CONV = convId;
        var other = (conv && conv.other_user) || {};
        document.getElementById('messageModalTitle').textContent = other.display_name || other.username || 'Messages';
        return SLApi.messages(convId, { limit: 50 });
      }).then(function (r) {
        var msgs = (r && r.messages) || [];
        renderThread(msgs);
        SLApi.markConversationRead(CURRENT_CONV).catch(function () {});
      }).catch(function (e) {
        thread.innerHTML = '<div class="sl-empty" style="color:#e57373;">' + esc(e.message || 'Could not open conversation') + '</div>';
      });
    }

    function renderThread(msgs) {
      var thread = document.getElementById('messageThread');
      if (!thread) return;
      if (msgs.length === 0) {
        thread.innerHTML = '<div class="sl-empty">No messages yet. Say hi 👋</div>';
        return;
      }
      var myId = SL_USER && SL_USER.id;
      thread.innerHTML = msgs.map(function (m) {
        var mine = myId && m.sender_id === myId;
        return '<div class="sl-msg ' + (mine ? 'me' : 'them') + '">' +
          esc(m.body) +
          '<small>' + esc(relTime(m.created_at)) + '</small>' +
          '</div>';
      }).join('');
      thread.scrollTop = thread.scrollHeight;
    }

    function sendCurrentMessage() {
      if (!CURRENT_CONV) return;
      var input = document.getElementById('messageInput');
      var body = input.value.trim();
      if (!body) return;
      input.value = '';
      SLApi.sendMessage(CURRENT_CONV, body).then(function () {
        return SLApi.messages(CURRENT_CONV, { limit: 50 });
      }).then(function (r) {
        renderThread((r && r.messages) || []);
      }).catch(function (e) {
        toast(e.message || 'Could not send', 'error');
      });
    }

    /* -------------------- 5. FAVORITE CUISINES (local) -------------------- */
    function loadCuisines() {
      try {
        var saved = localStorage.getItem(CUISINES_KEY);
        return saved ? JSON.parse(saved) : ['Italian', 'Japanese', 'Mexican', 'Thai', 'American'];
      } catch (e) { return []; }
    }
    function saveCuisines(arr) {
      try { localStorage.setItem(CUISINES_KEY, JSON.stringify(arr)); } catch (e) {}
    }
    function renderCuisines(cuisines) {
      var wrap = document.querySelector('.cuisine-tags');
      if (!wrap) return;
      wrap.innerHTML = cuisines.map(function (c) {
        return '<span class="cuisine-tag">' + esc(c) + '</span>';
      }).join('') + '<button class="cuisine-tag" id="editCuisinesBtn" style="background:rgba(212,175,55,0.15);color:#D4AF37;border:1px dashed #D4AF37;"><i class="fas fa-pen"></i></button>';
      var editBtn = document.getElementById('editCuisinesBtn');
      if (editBtn) editBtn.addEventListener('click', openEditCuisines);
    }
    function openEditCuisines() {
      buildEditCuisinesModal();
      var current = loadCuisines();
      var container = document.getElementById('cuisinesChecklist');
      container.innerHTML = allCuisines.map(function (c) {
        var checked = current.indexOf(c) >= 0 ? 'checked' : '';
        return '<label style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;margin:3px;background:rgba(255,255,255,0.05);border-radius:16px;font-size:13px;cursor:pointer;">' +
          '<input type="checkbox" value="' + esc(c) + '" ' + checked + '> ' + esc(c) + '</label>';
      }).join('');
      openModal('editCuisinesModal');
    }
    function buildEditCuisinesModal() {
      if (document.getElementById('editCuisinesModal')) return;
      var modal = document.createElement('div');
      modal.id = 'editCuisinesModal';
      modal.className = 'sl-modal-overlay';
      modal.innerHTML =
        '<div class="sl-modal">' +
        '  <div class="sl-modal-header"><h2>Favorite Cuisines</h2>' +
        '    <button class="sl-modal-close" data-close="editCuisinesModal"><i class="fas fa-times"></i></button></div>' +
        '  <div class="sl-modal-body"><div id="cuisinesChecklist"></div></div>' +
        '  <div class="sl-modal-footer">' +
        '    <button class="sl-btn sl-btn-secondary" data-close="editCuisinesModal">Cancel</button>' +
        '    <button class="sl-btn sl-btn-primary" id="saveCuisinesBtn">Save</button>' +
        '  </div>' +
        '</div>';
      document.body.appendChild(modal);
      modal.querySelectorAll('[data-close]').forEach(function (b) {
        b.addEventListener('click', function () { closeModal('editCuisinesModal'); });
      });
      document.getElementById('saveCuisinesBtn').addEventListener('click', function () {
        var picks = [];
        modal.querySelectorAll('input:checked').forEach(function (i) { picks.push(i.value); });
        saveCuisines(picks);
        renderCuisines(picks);
        closeModal('editCuisinesModal');
        toast('Cuisines updated', 'success');
      });
    }

    /* -------------------- INIT -------------------- */
    function init() {
      renderCuisines(loadCuisines());

      if (!SLApi.isLoggedIn()) {
        // Not logged in — show sign-in prompt in friends widget
        renderFriendsWidget();
        return;
      }

      SLApi.me().then(function (d) {
        SL_USER = d && d.user;
        if (!SL_USER) return;
        try { window.SL_USER = SL_USER; } catch (e) {}
        applyProfileToPage(SL_USER);
        wireEditProfileButton();
        renderFriendsWidget();
      }).catch(function () {
        renderFriendsWidget();
      });
    }

    // Also re-run when auth completes (login flow)
    window.addEventListener('sl-auth-ready', function (e) {
      SL_USER = (e.detail && e.detail.user) || window.SL_USER || SL_USER;
      if (SL_USER) {
        applyProfileToPage(SL_USER);
        wireEditProfileButton();
      }
      renderFriendsWidget();
    });

    init();

    // Public hook so other scripts (e.g. social-feed) can open DM from outside
    window.SLMessaging = { open: openMessageModal };
    window.SLFriends = {
      widget: renderFriendsWidget,
      openAll: openAllFriendsModal
    };
  });
})();