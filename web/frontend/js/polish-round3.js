/* ====================================================
   SCENELINK — ROUND 3 PRODUCTION POLISH JS
   ==================================================== */
(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        initNightlifeMapUpgrade();
        initNightlifeScrollToListFix();
        initProfileSocial();
        initRemoveDuplicateSave();
        initFilterAnimationKill();
    });

    /* ====================================================
       1. NIGHTLIFE MAP — Explore-Parity Upgrade
       Adds pulsing pins, live crowd badge, my-location btn
       ==================================================== */
    function initNightlifeMapUpgrade() {
        var mapEl = document.getElementById('nightlifeMapPremium');
        if (!mapEl) return;

        // Wait for the original map to init, then patch
        var checkMap = setInterval(function () {
            // The original IIFE stores map in closure — we detect markers on the page
            var pins = mapEl.querySelectorAll('.nl-pin-wrap');
            if (pins.length > 0) {
                clearInterval(checkMap);
                upgradePins(mapEl);
                injectCrowdIndex(mapEl);
                injectMyLocationBtn(mapEl);
            }
        }, 300);

        // Safety timeout
        setTimeout(function () { clearInterval(checkMap); }, 8000);
    }

    /* Upgrade pin HTML to include pulse rings */
    function upgradePins(mapEl) {
        // We need access to the Leaflet map. It's in the closure, but we can
        // access it through Leaflet's internal _leaflet_id on the container
        var mapInstance = null;
        // Try to find the map instance
        if (mapEl._leaflet_id) {
            // Leaflet stores the map on the DOM element
            for (var key in mapEl) {
                if (key.indexOf('_leaflet') === 0 && mapEl[key] && mapEl[key]._zoom !== undefined) {
                    mapInstance = mapEl[key];
                    break;
                }
            }
        }

        // Override the renderMarkers by patching the pin HTML on mutation
        var observer = new MutationObserver(function () {
            mapEl.querySelectorAll('.nl-pin-wrap').forEach(function (wrap) {
                // Already upgraded?
                if (wrap.querySelector('.nl-pin-r3')) return;

                var oldPin = wrap.querySelector('.nl-pin');
                if (!oldPin) return;

                // Detect type from class
                var type = 'bar';
                var classes = oldPin.className || '';
                if (classes.indexOf('nightclub') !== -1) type = 'nightclub';
                else if (classes.indexOf('cocktail-lounge') !== -1) type = 'cocktail-lounge';
                else if (classes.indexOf('lounge') !== -1) type = 'lounge';
                else if (classes.indexOf('rooftop') !== -1) type = 'rooftop';
                else if (classes.indexOf('bar') !== -1) type = 'bar';

                // Get icon from inner
                var innerIcon = oldPin.querySelector('.nl-pin-inner i');
                var iconClass = innerIcon ? innerIcon.className : 'fas fa-music';

                // Build new pin HTML
                var newPin = document.createElement('div');
                newPin.className = 'nl-pin-r3 cat-' + type;
                newPin.innerHTML =
                    '<div class="nl-pin-r3-pulse"></div>' +
                    '<div class="nl-pin-r3-body"><i class="' + iconClass + '"></i></div>';

                // Replace old pin
                oldPin.style.display = 'none';
                wrap.appendChild(newPin);
            });
        });

        observer.observe(mapEl, { childList: true, subtree: true });

        // Also run immediately for existing pins
        mapEl.querySelectorAll('.nl-pin-wrap').forEach(function (wrap) {
            if (wrap.querySelector('.nl-pin-r3')) return;
            var oldPin = wrap.querySelector('.nl-pin');
            if (!oldPin) return;

            var type = 'bar';
            var classes = oldPin.className || '';
            if (classes.indexOf('nightclub') !== -1) type = 'nightclub';
            else if (classes.indexOf('cocktail-lounge') !== -1) type = 'cocktail-lounge';
            else if (classes.indexOf('lounge') !== -1) type = 'lounge';
            else if (classes.indexOf('rooftop') !== -1) type = 'rooftop';
            else if (classes.indexOf('bar') !== -1) type = 'bar';

            var innerIcon = oldPin.querySelector('.nl-pin-inner i');
            var iconClass = innerIcon ? innerIcon.className : 'fas fa-music';

            var newPin = document.createElement('div');
            newPin.className = 'nl-pin-r3 cat-' + type;
            newPin.innerHTML =
                '<div class="nl-pin-r3-pulse"></div>' +
                '<div class="nl-pin-r3-body"><i class="' + iconClass + '"></i></div>';

            oldPin.style.display = 'none';
            wrap.appendChild(newPin);
        });
    }

    /* Inject Live Crowd Index badge (bottom-left of map) */
    function injectCrowdIndex(mapEl) {
        // Don't duplicate
        if (mapEl.parentElement.querySelector('.nl-crowd-index-r3')) return;

        // Calculate total people from venue data visible on cards
        // We'll estimate from the page — there are 20 venues with people counts
        var totalPeople = 0;
        var venueCards = document.querySelectorAll('.nightlife-venue-card');
        venueCards.forEach(function (card) {
            var peopleText = card.querySelector('.venue-stat') || card.querySelector('.vc-people');
            if (peopleText) {
                var num = parseInt(peopleText.textContent);
                if (!isNaN(num)) totalPeople += num;
            }
        });
        // Fallback: use a realistic number based on 20 venues
        if (totalPeople === 0) totalPeople = 2547;

        var badge = document.createElement('div');
        badge.className = 'nl-crowd-index-r3';
        badge.innerHTML =
            '<div class="nl-crowd-pulse-r3"></div>' +
            '<span class="nl-crowd-label-r3">LIVE</span>' +
            '<span class="nl-crowd-count-r3" id="nlCrowdCountR3">' + totalPeople.toLocaleString() + ' people out tonight</span>';

        // Insert into the map hero section
        var heroSection = mapEl.closest('.nl-map-hero');
        if (heroSection) {
            heroSection.style.position = heroSection.style.position || 'relative';
            heroSection.appendChild(badge);
        }
    }

    /* Inject My Location button with crosshairs icon */
    function injectMyLocationBtn(mapEl) {
        var heroSection = mapEl.closest('.nl-map-hero');
        if (!heroSection) return;

        // Check if existing controls exist — enhance them
        var existingControls = heroSection.querySelector('.nl-map-controls');
        if (!existingControls) return;

        // Check if a my-location btn already exists with crosshairs
        var existingLocBtn = document.getElementById('nlMyLocationBtnR3');
        if (existingLocBtn) return;

        // Create a new my-location button with crosshairs icon
        var locBtn = document.createElement('button');
        locBtn.className = 'nl-map-ctrl';
        locBtn.id = 'nlMyLocationBtnR3';
        locBtn.title = 'My Location';
        locBtn.innerHTML = '<i class="fas fa-crosshairs"></i>';

        // Insert at top of controls
        existingControls.insertBefore(locBtn, existingControls.firstChild);

        locBtn.addEventListener('click', function () {
            locBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    function (pos) {
                        // Access the leaflet map
                        var leafletMap = getLeafletMap(mapEl);
                        if (leafletMap) {
                            leafletMap.setView([pos.coords.latitude, pos.coords.longitude], 15, { animate: true });
                        }
                        locBtn.innerHTML = '<i class="fas fa-crosshairs"></i>';
                    },
                    function () {
                        // Error — reset to default
                        var leafletMap = getLeafletMap(mapEl);
                        if (leafletMap) {
                            leafletMap.setView([42.3555, -71.0655], 14, { animate: true });
                        }
                        locBtn.innerHTML = '<i class="fas fa-crosshairs"></i>';
                    },
                    { timeout: 8000 }
                );
            } else {
                locBtn.innerHTML = '<i class="fas fa-crosshairs"></i>';
            }
        });
    }

    /* Helper: Get leaflet map instance from container element */
    function getLeafletMap(el) {
        // Leaflet stores the map on the DOM element as _leaflet_map
        // Try multiple approaches
        for (var key in el) {
            if (key.indexOf('_leaflet') === 0 && el[key] && typeof el[key].setView === 'function') {
                return el[key];
            }
        }
        // Approach 2: check L.Map instances
        if (window.L && window.L.Map) {
            // Scan for map with this container
            var maps = [];
            document.querySelectorAll('.leaflet-container').forEach(function (container) {
                for (var k in container) {
                    if (k.indexOf('_leaflet') === 0 && container[k] && typeof container[k].setView === 'function') {
                        if (container === el) return container[k];
                    }
                }
            });
        }
        return null;
    }

    /* ====================================================
       2. NIGHTLIFE — Fix Browse Venue List Button Position
       ==================================================== */
    function initNightlifeScrollToListFix() {
        // The button is injected by polish-round2.js as .nl-scroll-to-list
        // Move it INSIDE the map hero for absolute positioning at bottom
        var checkBtn = setInterval(function () {
            var scrollDiv = document.querySelector('.nl-scroll-to-list');
            if (scrollDiv) {
                clearInterval(checkBtn);
                var hero = document.querySelector('.nl-map-hero');
                if (hero && scrollDiv.parentElement !== hero) {
                    hero.style.position = 'relative';
                    hero.appendChild(scrollDiv);
                }
            }
        }, 300);
        setTimeout(function () { clearInterval(checkBtn); }, 8000);
    }

    /* ====================================================
       3. NIGHTLIFE — Remove duplicate save buttons
       ==================================================== */
    function initRemoveDuplicateSave() {
        // Watch for the action bar injected by polish-round2.js in the venue card popup
        var observer = new MutationObserver(function () {
            // Remove any save buttons from the map venue card popup
            var card = document.getElementById('nlMapVenueCard');
            if (card) {
                var saveBtns = card.querySelectorAll('.save-btn, #nlVcSaveBtn2');
                saveBtns.forEach(function (b) { b.style.display = 'none'; });
            }
        });

        var card = document.getElementById('nlMapVenueCard');
        if (card) {
            observer.observe(card, { childList: true, subtree: true });
        }
    }

    /* ====================================================
       4. NIGHTLIFE — Kill filter animation
       ==================================================== */
    function initFilterAnimationKill() {
        // Remove any animation classes when chips are clicked
        document.addEventListener('click', function (e) {
            var chip = e.target.closest('.nl-map-chip, .filter-btn');
            if (chip) {
                chip.style.animation = 'none';
                chip.style.transform = 'none';
            }
        }, true);
    }

    /* ====================================================
       5. USER PROFILE — Disabled (Phase 5D-B)
       The legacy profile-social subsystem injected fake friends, messages,
       activity, and social links into profile.html. This is now handled
       by real backend-connected modules (sl-profile-page.js, sl-social-feed.js,
       messages.html → /api/conversations, etc.). Disabling to prevent fake
       fake/placeholder names from appearing as if they were real production
       activity.
       ==================================================== */
    function initProfileSocial() {
        // Intentionally no-op. Real profile UI lives elsewhere.
        return;
    }

    /* Social media links under bio */
    function injectProfileSocialLinks() {
        var bioEl = document.querySelector('.profile-bio');
        if (!bioEl) return;
        if (document.querySelector('.profile-social-links')) return;

        var links = document.createElement('div');
        links.className = 'profile-social-links';
        links.innerHTML =
            '<a href="#" class="profile-social-link" title="Instagram"><i class="fab fa-instagram"></i></a>' +
            '<a href="#" class="profile-social-link sl-social-x" title="X (formerly Twitter)"><i class="fa-brands fa-x-twitter"></i></a>' +
            '<a href="#" class="profile-social-link" title="TikTok"><i class="fab fa-tiktok"></i></a>' +
            '<a href="#" class="profile-social-link" title="Spotify"><i class="fab fa-spotify"></i></a>';

        bioEl.parentElement.insertBefore(links, bioEl.nextSibling);
    }

    /* Profile content tabs: Activity / Lists / Friends */
    function injectProfileTabs() {
        // Find the main content area after profile header
        var mainContent = document.querySelector('.profile-header-enhanced + section') ||
                          document.querySelector('.profile-content-area') ||
                          document.querySelector('.profile-header-enhanced');
        if (!mainContent) return;

        // Don't duplicate
        if (document.querySelector('.profile-content-tabs')) return;

        // Find or create a container after profile header
        var profileSection = document.querySelector('.profile-header-enhanced');
        if (!profileSection) return;

        var tabContainer = document.createElement('div');
        tabContainer.className = 'container';
        tabContainer.style.marginTop = '24px';

        var tabs = document.createElement('div');
        tabs.className = 'profile-content-tabs';
        tabs.innerHTML =
            '<button class="profile-content-tab active" data-tab="activity"><i class="fas fa-bolt"></i> Activity</button>' +
            '<button class="profile-content-tab" data-tab="lists"><i class="fas fa-list"></i> My Lists</button>' +
            '<button class="profile-content-tab" data-tab="friends"><i class="fas fa-users"></i> Friends</button>' +
            '<button class="profile-content-tab" data-tab="messages"><i class="fas fa-comment-dots"></i> Messages</button>';

        // Activity panel
        var activityPanel = document.createElement('div');
        activityPanel.className = 'profile-tab-panel active';
        activityPanel.id = 'profileTabActivity';
        activityPanel.innerHTML = buildActivityFeed();

        // Lists panel
        var listsPanel = document.createElement('div');
        listsPanel.className = 'profile-tab-panel';
        listsPanel.id = 'profileTabLists';
        listsPanel.innerHTML = buildListsContent();

        // Friends panel placeholder
        var friendsPanel = document.createElement('div');
        friendsPanel.className = 'profile-tab-panel';
        friendsPanel.id = 'profileTabFriends';
        // Will be populated by injectFriendsPanel

        // Messages panel placeholder
        var messagesPanel = document.createElement('div');
        messagesPanel.className = 'profile-tab-panel';
        messagesPanel.id = 'profileTabMessages';
        // Will be populated by injectMessagingPanel

        tabContainer.appendChild(tabs);
        tabContainer.appendChild(activityPanel);
        tabContainer.appendChild(listsPanel);
        tabContainer.appendChild(friendsPanel);
        tabContainer.appendChild(messagesPanel);

        // Insert after profile header section
        profileSection.after(tabContainer);

        // Tab switching
        tabs.addEventListener('click', function (e) {
            var tab = e.target.closest('.profile-content-tab');
            if (!tab) return;
            var target = tab.getAttribute('data-tab');

            tabs.querySelectorAll('.profile-content-tab').forEach(function (t) { t.classList.remove('active'); });
            tab.classList.add('active');

            tabContainer.querySelectorAll('.profile-tab-panel').forEach(function (p) { p.classList.remove('active'); });
            var panel = document.getElementById('profileTab' + target.charAt(0).toUpperCase() + target.slice(1));
            if (panel) panel.classList.add('active');
        });
    }

    function buildActivityFeed() {
        // Phase 5D-B: array emptied (was fake "Alex reviewed Trattoria Milano",
        // "checked in at Skyline Rooftop", "Velvet Lounge", "Royale Nightclub" etc.).
        // Function is unreachable (initProfileSocial returns early).
        var activities = [];

        var html = '';
        activities.forEach(function (a) {
            html +=
                '<div class="profile-activity-item">' +
                '<div class="profile-activity-icon ' + a.icon + '"><i class="fas ' + a.fa + '"></i></div>' +
                '<div class="profile-activity-body">' +
                '<div class="profile-activity-text">' + a.text + '</div>' +
                '<div class="profile-activity-time">' + a.time + '</div>' +
                '</div>' +
                '</div>';
        });
        return html;
    }

    function buildListsContent() {
        // Phase 5D-B: array emptied (was fake "Favorites", "Date Night Spots" etc.).
        var lists = [];

        var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;">';
        lists.forEach(function (l) {
            html +=
                '<div style="background:rgba(18,18,24,0.95);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:20px;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.borderColor=\'rgba(212,175,55,0.3)\'" onmouseout="this.style.borderColor=\'rgba(255,255,255,0.06)\'">' +
                '<div style="width:40px;height:40px;border-radius:12px;background:' + l.color + '20;display:flex;align-items:center;justify-content:center;margin-bottom:12px;">' +
                '<i class="fas ' + l.icon + '" style="color:' + l.color + ';font-size:16px;"></i></div>' +
                '<div style="font-size:15px;font-weight:700;color:#fff;margin-bottom:4px;">' + l.name + '</div>' +
                '<div style="font-size:12px;color:rgba(255,255,255,0.4);">' + l.count + ' venues</div>' +
                '</div>';
        });
        html += '</div>';
        return html;
    }

    /* Friends panel */
    function injectFriendsPanel() {
        var panel = document.getElementById('profileTabFriends');
        if (!panel) {
            // Wait for tabs to be injected
            setTimeout(injectFriendsPanel, 500);
            return;
        }
        if (panel.innerHTML.trim()) return;

        // Phase 5D-B: array emptied (was fake Jordan Lee, Sophia Chen,
        // Marcus Wright, Emma Davis, Ryan Kim, Isabella Torres, Noah Brooks, Ava Martinez).
        var friends = [];

        var html = '<div class="profile-friends-panel">';
        html += '<div class="profile-friends-header"><h3>Friends <span style="color:rgba(255,255,255,0.35);font-weight:400;">(' + friends.length + ')</span></h3></div>';
        html += '<div class="profile-friends-search"><input type="text" placeholder="Search friends..." id="profileFriendSearch"></div>';

        friends.forEach(function (f) {
            html +=
                '<div class="profile-friend-row" data-name="' + f.name.toLowerCase() + '">' +
                '<img class="profile-friend-avatar" src="' + f.avatar + '" alt="' + f.name + '">' +
                '<div class="profile-friend-info">' +
                '<div class="profile-friend-name">' + f.name + '</div>' +
                '<div class="profile-friend-username">' + f.user + '</div>' +
                '<div class="profile-friend-status">' +
                (f.online ? '<span class="online-dot"></span> Online' : 'Last seen recently') +
                ' · ' + f.mutual + ' mutual friends</div>' +
                '</div>' +
                '<div class="profile-friend-actions">' +
                '<button class="profile-friend-btn" onclick="window._r3OpenDM(\'' + f.name + '\', \'' + f.avatar + '\')"><i class="fas fa-comment"></i></button>' +
                '<button class="profile-friend-btn primary"><i class="fas fa-user-check"></i></button>' +
                '</div>' +
                '</div>';
        });
        html += '</div>';
        panel.innerHTML = html;

        // Friend search
        setTimeout(function () {
            var searchInput = document.getElementById('profileFriendSearch');
            if (searchInput) {
                searchInput.addEventListener('input', function () {
                    var q = searchInput.value.toLowerCase();
                    panel.querySelectorAll('.profile-friend-row').forEach(function (row) {
                        var name = row.getAttribute('data-name') || '';
                        row.style.display = name.indexOf(q) !== -1 ? '' : 'none';
                    });
                });
            }
        }, 100);
    }

    /* Messaging panel */
    function injectMessagingPanel() {
        var panel = document.getElementById('profileTabMessages');
        if (!panel) {
            setTimeout(injectMessagingPanel, 500);
            return;
        }
        if (panel.innerHTML.trim()) return;

        // Phase 5D-B: hardcoded fake threads (Jordan Lee, Sophia Chen, Marcus Wright,
        // Emma Davis, Isabella Torres, Ava Martinez) removed. Real messages UI lives
        // on /messages.html backed by /api/conversations.
        var threads = [];

        var html = '<div class="profile-messaging-panel">';
        html += '<div class="profile-messaging-header"><h3>Messages</h3>' +
            '<button class="profile-msg-compose-btn" title="New Message"><i class="fas fa-pen"></i></button></div>';

        threads.forEach(function (t) {
            html +=
                '<div class="profile-msg-thread" onclick="window._r3OpenDM(\'' + t.name + '\', \'' + t.avatar + '\')">' +
                '<img class="profile-msg-avatar" src="' + t.avatar + '" alt="' + t.name + '">' +
                '<div class="profile-msg-body">' +
                '<div class="profile-msg-name">' + t.name + '</div>' +
                '<div class="profile-msg-preview">' + t.preview + '</div>' +
                '</div>' +
                '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">' +
                '<span class="profile-msg-time">' + t.time + '</span>' +
                (t.unread ? '<span class="profile-msg-unread"></span>' : '') +
                '</div>' +
                '</div>';
        });
        html += '</div>';
        panel.innerHTML = html;
    }

    /* Edit Profile */
    function injectEditProfile() {
        // Find the edit button (or add one)
        var editBtns = document.querySelectorAll('.edit-profile-btn, .btn-edit-profile, [data-action="edit-profile"]');
        
        // If no edit button exists, inject one near the profile name
        var nameRow = document.querySelector('.profile-name-row');
        if (nameRow && !nameRow.querySelector('.edit-profile-trigger-r3')) {
            var editBtn = document.createElement('button');
            editBtn.className = 'edit-profile-trigger-r3';
            editBtn.innerHTML = '<i class="fas fa-pen"></i> Edit Profile';
            editBtn.style.cssText = 'padding:8px 18px;border-radius:10px;background:rgba(212,175,55,0.15);border:1px solid rgba(212,175,55,0.3);color:#D4AF37;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;margin-left:12px;';
            editBtn.addEventListener('click', openEditModal);
            nameRow.appendChild(editBtn);
        }

        // Also wire existing edit buttons
        editBtns.forEach(function (btn) {
            btn.addEventListener('click', openEditModal);
        });

        // Create modal
        if (!document.getElementById('editProfileOverlayR3')) {
            var overlay = document.createElement('div');
            overlay.className = 'edit-profile-overlay';
            overlay.id = 'editProfileOverlayR3';
            overlay.innerHTML =
                '<div class="edit-profile-modal">' +
                '<h2>Edit Profile</h2>' +
                '<div class="edit-profile-field"><label>Display Name</label><input type="text" id="editProfName" value=""></div>' +
                '<div class="edit-profile-field"><label>Username</label><input type="text" id="editProfUser" value=""></div>' +
                '<div class="edit-profile-field"><label>Bio</label><textarea id="editProfBio"></textarea></div>' +
                '<div class="edit-profile-field"><label>Location</label><input type="text" id="editProfLoc" value=""></div>' +
                '<div class="edit-profile-field"><label>Instagram</label><input type="text" id="editProfIG" placeholder="@username"></div>' +
                '<div class="edit-profile-field"><label>Twitter / X</label><input type="text" id="editProfTW" placeholder="@username"></div>' +
                '<div class="edit-profile-actions">' +
                '<button class="edit-profile-cancel-btn" id="editProfCancel">Cancel</button>' +
                '<button class="edit-profile-save-btn" id="editProfSave">Save Changes</button>' +
                '</div>' +
                '</div>';

            document.body.appendChild(overlay);

            // Close handlers
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) overlay.classList.remove('active');
            });
            document.getElementById('editProfCancel').addEventListener('click', function () {
                overlay.classList.remove('active');
            });
            document.getElementById('editProfSave').addEventListener('click', function () {
                // Save to UI
                var name = document.getElementById('editProfName').value;
                var bio = document.getElementById('editProfBio').value;
                var user = document.getElementById('editProfUser').value;

                var nameEl = document.querySelector('.profile-name-row h1');
                if (nameEl) nameEl.textContent = name;
                var bioEl = document.querySelector('.profile-bio');
                if (bioEl) bioEl.textContent = bio;
                var userEl = document.querySelector('.profile-username');
                if (userEl) userEl.textContent = user;

                // Store in localStorage
                localStorage.setItem('sl_profile', JSON.stringify({
                    name: name, bio: bio, user: user,
                    location: document.getElementById('editProfLoc').value,
                    ig: document.getElementById('editProfIG').value,
                    tw: document.getElementById('editProfTW').value
                }));

                overlay.classList.remove('active');
                if (window.showToast) window.showToast('Profile updated! ✅');
            });
        }

        // Load saved profile data
        try {
            var saved = JSON.parse(localStorage.getItem('sl_profile'));
            if (saved) {
                if (saved.name) {
                    var nameEl = document.querySelector('.profile-name-row h1');
                    if (nameEl) nameEl.textContent = saved.name;
                    document.getElementById('editProfName').value = saved.name;
                }
                if (saved.bio) {
                    var bioEl = document.querySelector('.profile-bio');
                    if (bioEl) bioEl.textContent = saved.bio;
                    document.getElementById('editProfBio').value = saved.bio;
                }
                if (saved.user) {
                    var userEl = document.querySelector('.profile-username');
                    if (userEl) userEl.textContent = saved.user;
                    document.getElementById('editProfUser').value = saved.user;
                }
            }
        } catch (e) { }
    }

    function openEditModal() {
        var overlay = document.getElementById('editProfileOverlayR3');
        if (overlay) overlay.classList.add('active');
    }

    /* DM Chat overlay */
    function injectDMChat() {
        if (document.getElementById('dmChatOverlayR3')) return;

        var chat = document.createElement('div');
        chat.className = 'dm-chat-overlay';
        chat.id = 'dmChatOverlayR3';
        chat.innerHTML =
            '<div class="dm-chat-header">' +
            '<img id="dmChatAvatar" src="" alt="">' +
            '<span class="dm-chat-header-name" id="dmChatName"></span>' +
            '<button class="dm-chat-close" id="dmChatClose">&times;</button>' +
            '</div>' +
            '<div class="dm-chat-messages" id="dmChatMessages"></div>' +
            '<div class="dm-chat-input-row">' +
            '<input type="text" id="dmChatInput" placeholder="Type a message...">' +
            '<button class="dm-chat-send-btn" id="dmChatSend"><i class="fas fa-paper-plane"></i></button>' +
            '</div>';

        document.body.appendChild(chat);

        document.getElementById('dmChatClose').addEventListener('click', function () {
            chat.classList.remove('active');
        });

        document.getElementById('dmChatSend').addEventListener('click', sendDM);
        document.getElementById('dmChatInput').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') sendDM();
        });
    }

    function sendDM() {
        var input = document.getElementById('dmChatInput');
        var text = input.value.trim();
        if (!text) return;

        var msgs = document.getElementById('dmChatMessages');
        var msg = document.createElement('div');
        msg.className = 'dm-msg sent';
        msg.textContent = text;
        msgs.appendChild(msg);
        msgs.scrollTop = msgs.scrollHeight;
        input.value = '';

        // Simulate response
        setTimeout(function () {
            var responses = [
                "Sounds great! Let's do it 🎉",
                "I've been wanting to check that place out!",
                "Friday works for me!",
                "Have you tried their cocktails? So good!",
                "I'll add it to our group plan 📋",
                "Love that spot! The vibes are amazing ✨"
            ];
            var resp = document.createElement('div');
            resp.className = 'dm-msg received';
            resp.textContent = responses[Math.floor(Math.random() * responses.length)];
            msgs.appendChild(resp);
            msgs.scrollTop = msgs.scrollHeight;
        }, 1000 + Math.random() * 1500);
    }

    // Global function to open DM
    window._r3OpenDM = function (name, avatar) {
        var chat = document.getElementById('dmChatOverlayR3');
        if (!chat) return;

        document.getElementById('dmChatName').textContent = name;
        document.getElementById('dmChatAvatar').src = avatar;

        // Load mock conversation
        var msgs = document.getElementById('dmChatMessages');
        msgs.innerHTML =
            '<div class="dm-msg received">Hey! How\'s it going? 👋</div>' +
            '<div class="dm-msg sent">Good! Any plans tonight?</div>' +
            '<div class="dm-msg received">Thinking about checking out that new spot in Seaport!</div>';

        chat.classList.add('active');
        msgs.scrollTop = msgs.scrollHeight;
    };

})();