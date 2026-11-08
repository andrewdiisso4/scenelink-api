/* ============================================================
   SCENELINK PRODUCT EVOLUTION — JavaScript Engine
   "The fastest way to decide where to go tonight"
   ============================================================ */
(function () {
    'use strict';

    /* ==========================================================
       VENUE DATABASE — Rich mock data with energy/social signals
       ========================================================== */
    // Phase 5D-B: VENUES array emptied (was hardcoded "The Underground Club", "Skyline Rooftop", "The Velvet Lounge", "Royale Nightclub", "Neptune Oyster", "Trattoria Milano", "Harpoon Beer Hall" etc.). The function that consumed it is gated with early return; this prevents any leak even via dead-code paths.
    var VENUES = [];

    /* ==========================================================
       SOCIAL ACTIVITY SIMULATION
       ========================================================== */
    var NAMES = ['Alex', 'Jordan', 'Sam', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Avery', 'Quinn', 'Blake', 'Jamie', 'Drew'];
    var ACTIONS = ['saved', 'checked in at', 'is heading to', 'added to Tonight Plan'];
    var AVATAR_COLORS = ['#D4AF37', '#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f97316', '#ec4899', '#06b6d4'];

    function generateActivity() {
        var activities = [];
        for (var i = 0; i < 12; i++) {
            var name = NAMES[Math.floor(Math.random() * NAMES.length)];
            var venue = VENUES[Math.floor(Math.random() * VENUES.length)];
            var action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
            var mins = Math.floor(Math.random() * 45) + 1;
            activities.push({
                name: name,
                initials: name.charAt(0),
                color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
                action: action,
                venue: venue.name,
                venueId: venue.id,
                time: mins + 'm'
            });
        }
        return activities;
    }

    /* ==========================================================
       FOMO ENGINE
       ========================================================== */
    var FOMO_LINES = [
        'Almost full',
        'Trending fast',
        'People heading here now',
        'Getting packed',
        'Line forming',
        '🔥 Hot right now',
        'Wait time growing',
        'Friends are here'
    ];

    function getFomoText(venue) {
        if (venue.fomo) return venue.fomo;
        if (venue.energy >= 8) return FOMO_LINES[Math.floor(Math.random() * 3)];
        if (venue.friends > 0) return venue.friends + ' friend' + (venue.friends > 1 ? 's' : '') + ' here';
        return null;
    }

    /* ==========================================================
       ENERGY SYSTEM
       ========================================================== */
    function getEnergyLevel(score) {
        if (score >= 8) return 'high';
        if (score >= 6) return 'med';
        if (score >= 4) return 'low';
        return 'chill';
    }

    function getStatusLabel(status) {
        var labels = {
            packed: '🔴 Packed',
            busy: '🟡 Getting Busy',
            filling: '🟢 Filling Up',
            chill: '🔵 Lowkey'
        };
        return labels[status] || status;
    }

    function getStatusClass(status) {
        var classes = { packed: 'sl-status-packed', busy: 'sl-status-busy', filling: 'sl-status-filling', chill: 'sl-status-chill' };
        return classes[status] || '';
    }

    /* ==========================================================
       CATEGORIZE VENUES INTO FEED SECTIONS
       ========================================================== */
    function getTrendingNow() {
        return VENUES.filter(function (v) { return v.energy >= 7.5; })
            .sort(function (a, b) { return b.energy - a.energy; });
    }

    function getGettingBusy() {
        return VENUES.filter(function (v) { return v.status === 'filling' || (v.status === 'busy' && v.energy < 7.5); })
            .sort(function (a, b) { return b.crowd / b.capacity - a.crowd / a.capacity; });
    }

    function getLowkeyGems() {
        return VENUES.filter(function (v) { return v.energy < 5 && v.rating >= 4.4; })
            .sort(function (a, b) { return b.rating - a.rating; });
    }

    function getBestVibeTonight() {
        return VENUES.filter(function (v) { return v.rating >= 4.5 && v.energy >= 5; })
            .sort(function (a, b) { return (b.rating * 10 + b.energy) - (a.rating * 10 + a.energy); })
            .slice(0, 6);
    }

    /* ==========================================================
       BUILD VENUE CARD HTML
       ========================================================== */
    function buildVenueCard(venue) {
        var el = getEnergyLevel(venue.energy);
        var fomoText = getFomoText(venue);
        var crowdPct = Math.round((venue.crowd / venue.capacity) * 100);

        var html = '<div class="sl-venue-card" data-venue-id="' + venue.id + '">';
        html += '  <div class="sl-vc-image">';
        html += '    <img src="' + venue.image + '" alt="' + venue.name + '" loading="lazy">';
        html += '    <div class="sl-vc-image-overlay"></div>';
        html += '    <div class="sl-energy-badge energy-' + el + '"><i class="fas fa-fire"></i> ' + venue.energy.toFixed(1) + '</div>';
        html += '    <div class="sl-status-tag ' + getStatusClass(venue.status) + '">' + getStatusLabel(venue.status) + '</div>';

        if (fomoText) {
            html += '    <div class="sl-fomo-tag"><i class="fas fa-bolt"></i> ' + fomoText + '</div>';
        }

        if (venue.friends > 0) {
            html += '    <div class="sl-social-signal"><i class="fas fa-user-friends"></i> ' + venue.friends + ' friend' + (venue.friends > 1 ? 's' : '') + '</div>';
        }

        html += '  </div>';

        html += '  <div class="sl-vc-body">';
        html += '    <div class="sl-vc-top-row">';
        html += '      <h3 class="sl-vc-name">' + venue.name + '</h3>';
        html += '      <div class="sl-vc-rating"><i class="fas fa-star"></i> ' + venue.rating + '</div>';
        html += '    </div>';

        html += '    <div class="sl-vc-meta">';
        html += '      <span>' + venue.type + '</span><span class="sl-dot"></span>';
        html += '      <span>' + venue.neighborhood + '</span><span class="sl-dot"></span>';
        html += '      <span>' + venue.distance + '</span><span class="sl-dot"></span>';
        html += '      <span>' + venue.price + '</span>';
        html += '    </div>';

        html += '    <div class="sl-vc-vibes">';
        venue.vibes.forEach(function (v) {
            html += '      <span class="sl-vibe-tag">' + v + '</span>';
        });
        html += '    </div>';

        html += '    <div class="sl-energy-bar">';
        html += '      <span class="sl-energy-label">Energy</span>';
        html += '      <div class="sl-energy-track"><div class="sl-energy-fill energy-' + el + '" style="width:' + (venue.energy * 10) + '%"></div></div>';
        html += '      <span class="sl-energy-value energy-' + el + '">' + venue.energy.toFixed(1) + '</span>';
        html += '    </div>';

        html += '    <div class="sl-vc-actions">';
        html += '      <button class="sl-vc-action action-save" data-venue-id="' + venue.id + '"><i class="fas fa-bookmark"></i> Save</button>';
        html += '      <button class="sl-vc-action action-map" data-venue-id="' + venue.id + '"><i class="fas fa-map-marker-alt"></i> Map</button>';
        html += '      <button class="sl-vc-action action-send" data-venue-id="' + venue.id + '"><i class="fas fa-paper-plane"></i> Send</button>';
        html += '    </div>';

        html += '  </div>';
        html += '</div>';

        return html;
    }

    /* ==========================================================
       BUILD FEED SECTION
       ========================================================== */
    function buildSection(title, icon, badgeClass, badgeText, venues) {
        if (!venues || venues.length === 0) return '';
        var html = '<div class="sl-feed-section">';
        html += '  <div class="sl-section-header">';
        html += '    <h3 class="sl-section-title"><i class="' + icon + '"></i> ' + title;
        if (badgeText) html += ' <span class="sl-section-badge ' + badgeClass + '">' + badgeText + '</span>';
        html += '    </h3>';
        html += '    <button class="sl-see-all">See all →</button>';
        html += '  </div>';
        html += '  <div class="sl-venue-scroll">';
        venues.forEach(function (v) {
            html += buildVenueCard(v);
        });
        html += '  </div>';
        html += '</div>';
        return html;
    }

    /* ==========================================================
       BUILD TONIGHT MODE HERO
       ========================================================== */
    function buildTonightHero() {
        var totalOut = 0;
        VENUES.forEach(function (v) { totalOut += v.crowd; });
        var now = new Date();
        var hour = now.getHours();
        var greeting = hour < 17 ? 'Tonight' : (hour < 21 ? 'Right Now' : 'Late Night');

        var html = '<div class="sl-tonight-hero">';
        html += '  <div class="sl-tonight-hero-inner">';
        html += '    <div class="sl-tonight-headline">';
        html += '      <h2><span>Tonight</span> in Boston</h2>';
        html += '      <span class="sl-live-pill"><span class="sl-live-dot"></span>LIVE</span>';
        html += '    </div>';
        html += '    <div class="sl-tonight-stats">';
        html += '      <div class="sl-tonight-stat"><i class="fas fa-users"></i> <strong>' + totalOut.toLocaleString() + '</strong> people out</div>';
        html += '      <div class="sl-tonight-stat"><i class="fas fa-fire"></i> <strong>' + VENUES.filter(function (v) { return v.status === 'packed'; }).length + '</strong> venues packed</div>';
        html += '      <div class="sl-tonight-stat"><i class="fas fa-bolt"></i> <strong>' + VENUES.filter(function (v) { return v.energy >= 7; }).length + '</strong> trending</div>';
        html += '    </div>';
        html += '  </div>';
        html += '</div>';
        return html;
    }

    /* ==========================================================
       BUILD DECISION SHORTCUTS
       ========================================================== */
    function buildShortcuts() {
        var html = '<div class="sl-shortcuts-bar">';
        html += '  <button class="sl-shortcut-btn gold"><i class="fas fa-fire"></i> Best spot right now</button>';
        html += '  <button class="sl-shortcut-btn"><i class="fas fa-map-pin"></i> Closest lit spot</button>';
        html += '  <button class="sl-shortcut-btn"><i class="fas fa-cocktail"></i> No wait drinks</button>';
        html += '  <button class="sl-shortcut-btn"><i class="fas fa-heart"></i> Date night</button>';
        html += '  <button class="sl-shortcut-btn"><i class="fas fa-users"></i> Good for groups</button>';
        html += '  <button class="sl-shortcut-btn"><i class="fas fa-music"></i> Live music</button>';
        html += '  <button class="sl-shortcut-btn"><i class="fas fa-utensils"></i> Late night eats</button>';
        html += '</div>';
        return html;
    }

    /* ==========================================================
       BUILD OUT TONIGHT STATUS BAR
       ========================================================== */
    function buildOutTonightBar() {
        var html = '<div class="sl-out-tonight-bar">';
        html += '  <div class="sl-out-tonight-inner">';
        html += '    <span class="sl-out-tonight-label">Your status tonight:</span>';
        html += '    <div class="sl-status-toggles">';
        html += '      <button class="sl-status-toggle active" data-status="going">🔥 Going out</button>';
        html += '      <button class="sl-status-toggle" data-status="undecided">🤔 Undecided</button>';
        html += '      <button class="sl-status-toggle" data-status="staying">🏠 Staying in</button>';
        html += '    </div>';
        html += '    <div class="sl-friends-out">';
        html += '      <div class="sl-friends-avatars">';
        html += '        <div class="sl-mini-avatar" style="background:#D4AF37">A</div>';
        html += '        <div class="sl-mini-avatar" style="background:#ef4444">J</div>';
        html += '        <div class="sl-mini-avatar" style="background:#3b82f6">S</div>';
        html += '        <div class="sl-mini-avatar" style="background:#22c55e">T</div>';
        html += '      </div>';
        html += '      <span><strong>7 friends</strong> going out tonight</span>';
        html += '    </div>';
        html += '  </div>';
        html += '</div>';
        return html;
    }

    /* ==========================================================
       BUILD SOCIAL STRIP — WHERE PEOPLE ARE GOING
       ========================================================== */
    function buildSocialStrip() {
        var activities = generateActivity();
        var html = '<div class="sl-social-strip">';
        html += '  <div class="sl-social-strip-header">';
        html += '    <span class="sl-social-strip-title"><i class="fas fa-bolt"></i> Where People Are Going</span>';
        html += '    <button class="sl-see-all">View all →</button>';
        html += '  </div>';
        html += '  <div class="sl-activity-scroll">';
        activities.forEach(function (a) {
            html += '    <div class="sl-activity-item" data-venue="' + a.venueId + '">';
            html += '      <div class="sl-activity-avatar" style="background:' + a.color + '">' + a.initials + '</div>';
            html += '      <div class="sl-activity-text"><strong>' + a.name + '</strong> ' + a.action + ' <span class="sl-gold">' + a.venue + '</span></div>';
            html += '      <span class="sl-activity-time">' + a.time + '</span>';
            html += '    </div>';
        });
        html += '  </div>';
        html += '</div>';
        return html;
    }

    /* ==========================================================
       BUILD JOIN THE MOVE
       ========================================================== */
    function buildJoinTheMove() {
        var hotVenue = getTrendingNow()[0];
        if (!hotVenue) return '';
        var html = '<div class="sl-join-move">';
        html += '  <div class="sl-join-move-card">';
        html += '    <div class="sl-join-icon"><i class="fas fa-fire"></i></div>';
        html += '    <div class="sl-join-info">';
        html += '      <h4>Join the Move → ' + hotVenue.name + '</h4>';
        html += '      <p><strong>' + hotVenue.crowd + ' people</strong> are here · ' + hotVenue.friends + ' friends going · Energy ' + hotVenue.energy.toFixed(1) + '/10</p>';
        html += '    </div>';
        html += '    <span class="sl-join-arrow"><i class="fas fa-chevron-right"></i></span>';
        html += '  </div>';
        html += '</div>';
        return html;
    }

    /* ==========================================================
       BUILD TONIGHT PLAN
       ========================================================== */
    function buildTonightPlan() {
        var html = '<div class="sl-tonight-plan">';
        html += '  <div class="sl-plan-header">';
        html += '    <span class="sl-plan-title"><i class="fas fa-route"></i> Tonight\'s Plan</span>';
        html += '    <button class="sl-see-all">Edit plan →</button>';
        html += '  </div>';
        html += '  <div class="sl-plan-steps">';

        html += '    <div class="sl-plan-step">';
        html += '      <div class="sl-plan-step-num">1</div>';
        html += '      <div class="sl-plan-step-icon">🍸</div>';
        html += '      <div class="sl-plan-step-label">Pre-game Drinks</div>';
        html += '      <div class="sl-plan-step-sub">Tap to add a venue</div>';
        html += '    </div>';

        html += '    <div class="sl-plan-connector"><i class="fas fa-chevron-right"></i></div>';

        html += '    <div class="sl-plan-step">';
        html += '      <div class="sl-plan-step-num">2</div>';
        html += '      <div class="sl-plan-step-icon">🍽️</div>';
        html += '      <div class="sl-plan-step-label">Dinner</div>';
        html += '      <div class="sl-plan-step-sub">Tap to add a venue</div>';
        html += '    </div>';

        html += '    <div class="sl-plan-connector"><i class="fas fa-chevron-right"></i></div>';

        html += '    <div class="sl-plan-step">';
        html += '      <div class="sl-plan-step-num">3</div>';
        html += '      <div class="sl-plan-step-icon">🎵</div>';
        html += '      <div class="sl-plan-step-label">Nightlife</div>';
        html += '      <div class="sl-plan-step-sub">Tap to add a venue</div>';
        html += '    </div>';

        html += '    <div class="sl-plan-connector"><i class="fas fa-chevron-right"></i></div>';

        html += '    <div class="sl-plan-step">';
        html += '      <div class="sl-plan-step-num">4</div>';
        html += '      <div class="sl-plan-step-icon">🌙</div>';
        html += '      <div class="sl-plan-step-label">Late Night</div>';
        html += '      <div class="sl-plan-step-sub">Tap to add a venue</div>';
        html += '    </div>';

        html += '  </div>';
        html += '</div>';
        return html;
    }

    /* ==========================================================
       BUILD SAVE MODAL
       ========================================================== */
    function buildSaveModal() {
        var html = '<div class="sl-save-modal-overlay" id="slEvoSaveModal">';
        html += '  <div class="sl-save-modal">';
        html += '    <div class="sl-save-modal-header">';
        html += '      <h3>Save to...</h3>';
        html += '      <button class="sl-save-modal-close" id="slEvoSaveClose">×</button>';
        html += '    </div>';
        html += '    <div class="sl-save-modal-body">';

        html += '      <div class="sl-save-option tonight-save" data-list="tonight">';
        html += '        <div class="sl-save-option-icon"><i class="fas fa-fire"></i></div>';
        html += '        <div class="sl-save-option-text"><h4>Saved Tonight</h4><p>Temporary — resets tomorrow</p></div>';
        html += '      </div>';

        html += '      <div class="sl-save-option favorites-save" data-list="favorites">';
        html += '        <div class="sl-save-option-icon"><i class="fas fa-heart"></i></div>';
        html += '        <div class="sl-save-option-text"><h4>Favorites</h4><p>Your go-to spots</p></div>';
        html += '      </div>';

        html += '      <div class="sl-save-option list-save" data-list="date-night">';
        html += '        <div class="sl-save-option-icon"><i class="fas fa-list"></i></div>';
        html += '        <div class="sl-save-option-text"><h4>Date Night Spots</h4><p>3 venues</p></div>';
        html += '      </div>';

        html += '      <div class="sl-save-option list-save" data-list="group-hangs">';
        html += '        <div class="sl-save-option-icon"><i class="fas fa-list"></i></div>';
        html += '        <div class="sl-save-option-text"><h4>Group Hangs</h4><p>5 venues</p></div>';
        html += '      </div>';

        html += '      <div class="sl-save-option new-list-save" data-list="new">';
        html += '        <div class="sl-save-option-icon"><i class="fas fa-plus"></i></div>';
        html += '        <div class="sl-save-option-text"><h4>Create New List</h4><p>Start a new collection</p></div>';
        html += '      </div>';

        html += '    </div>';
        html += '  </div>';
        html += '</div>';
        return html;
    }

    /* ==========================================================
       BUILD SHARE MODAL
       ========================================================== */
    function buildShareModal() {
        var html = '<div class="sl-share-modal-overlay" id="slEvoShareModal">';
        html += '  <div class="sl-share-modal">';
        html += '    <div class="sl-save-modal-header">';
        html += '      <h3>Send to Friends</h3>';
        html += '      <button class="sl-save-modal-close" id="slEvoShareClose">×</button>';
        html += '    </div>';
        html += '    <div class="sl-share-venue-preview" id="slEvoSharePreview">';
        html += '      <img src="" alt="" id="slEvoShareImg">';
        html += '      <div class="sl-share-venue-info">';
        html += '        <h4 id="slEvoShareName"></h4>';
        html += '        <p id="slEvoShareMeta"></p>';
        html += '      </div>';
        html += '    </div>';
        html += '    <div class="sl-share-actions">';
        html += '      <button class="sl-share-btn" data-method="copy"><i class="fas fa-link"></i>Copy Link</button>';
        html += '      <button class="sl-share-btn" data-method="text"><i class="fas fa-sms"></i>Text</button>';
        html += '      <button class="sl-share-btn" data-method="insta"><i class="fab fa-instagram"></i>Story</button>';
        html += '      <button class="sl-share-btn" data-method="more"><i class="fas fa-ellipsis-h"></i>More</button>';
        html += '    </div>';
        html += '  </div>';
        html += '</div>';
        return html;
    }

    /* ==========================================================
       TOAST SYSTEM
       ========================================================== */
    function showEvoToast(msg, icon) {
        var existing = document.querySelector('.sl-evo-toast');
        if (existing) existing.remove();
        var t = document.createElement('div');
        t.className = 'sl-evo-toast';
        t.innerHTML = '<i class="fas fa-' + (icon || 'check-circle') + '"></i> ' + msg;
        document.body.appendChild(t);
        requestAnimationFrame(function () {
            t.classList.add('show');
        });
        setTimeout(function () {
            t.classList.remove('show');
            setTimeout(function () { t.remove(); }, 300);
        }, 2500);
    }

    /* ==========================================================
       WIRE INTERACTIONS
       ========================================================== */
    var currentSaveVenueId = null;

    function wireInteractions() {
        // Status toggles
        document.querySelectorAll('.sl-status-toggle').forEach(function (btn) {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.sl-status-toggle').forEach(function (b) {
                    b.classList.remove('active', 'active-red');
                });
                btn.classList.add(btn.dataset.status === 'staying' ? 'active-red' : 'active');
                var msgs = { going: '🔥 You\'re going out tonight!', undecided: '🤔 Still deciding...', staying: '🏠 Staying in tonight' };
                showEvoToast(msgs[btn.dataset.status] || 'Status updated');
            });
        });

        // Save buttons
        document.addEventListener('click', function (e) {
            var saveBtn = e.target.closest('.action-save');
            if (saveBtn) {
                e.preventDefault();
                e.stopPropagation();
                currentSaveVenueId = saveBtn.dataset.venueId;
                var modal = document.getElementById('slEvoSaveModal');
                if (modal) modal.classList.add('open');
            }
        }, true);

        // Save modal close
        var saveClose = document.getElementById('slEvoSaveClose');
        if (saveClose) {
            saveClose.addEventListener('click', function () {
                document.getElementById('slEvoSaveModal').classList.remove('open');
            });
        }
        var saveOverlay = document.getElementById('slEvoSaveModal');
        if (saveOverlay) {
            saveOverlay.addEventListener('click', function (e) {
                if (e.target === saveOverlay) saveOverlay.classList.remove('open');
            });
        }

        // Save options
        document.querySelectorAll('.sl-save-option').forEach(function (opt) {
            opt.addEventListener('click', function () {
                var listName = opt.dataset.list;
                var venue = VENUES.find(function (v) { return v.id === currentSaveVenueId; });
                var venueName = venue ? venue.name : 'Venue';

                if (listName === 'new') {
                    showEvoToast('Create new list (coming soon)', 'plus');
                } else if (listName === 'tonight') {
                    showEvoToast('Saved "' + venueName + '" to Tonight ⚡', 'fire');
                } else if (listName === 'favorites') {
                    showEvoToast('Added "' + venueName + '" to Favorites ❤️', 'heart');
                } else {
                    showEvoToast('Saved to "' + opt.querySelector('h4').textContent + '" ✓', 'bookmark');
                }

                document.getElementById('slEvoSaveModal').classList.remove('open');

                // Persist
                var saved = JSON.parse(localStorage.getItem('sl_evo_saved') || '{}');
                if (!saved[listName]) saved[listName] = [];
                if (saved[listName].indexOf(currentSaveVenueId) === -1) saved[listName].push(currentSaveVenueId);
                localStorage.setItem('sl_evo_saved', JSON.stringify(saved));
            });
        });

        // Send/share buttons
        document.addEventListener('click', function (e) {
            var sendBtn = e.target.closest('.action-send');
            if (sendBtn) {
                e.preventDefault();
                e.stopPropagation();
                var venueId = sendBtn.dataset.venueId;
                var venue = VENUES.find(function (v) { return v.id === venueId; });
                if (!venue) return;

                var modal = document.getElementById('slEvoShareModal');
                document.getElementById('slEvoShareImg').src = venue.image;
                document.getElementById('slEvoShareName').textContent = venue.name;
                document.getElementById('slEvoShareMeta').textContent = venue.type + ' · ' + venue.neighborhood + ' · ' + venue.vibes[0];
                modal.classList.add('open');
            }
        }, true);

        // Share modal close
        var shareClose = document.getElementById('slEvoShareClose');
        if (shareClose) {
            shareClose.addEventListener('click', function () {
                document.getElementById('slEvoShareModal').classList.remove('open');
            });
        }
        var shareOverlay = document.getElementById('slEvoShareModal');
        if (shareOverlay) {
            shareOverlay.addEventListener('click', function (e) {
                if (e.target === shareOverlay) shareOverlay.classList.remove('open');
            });
        }

        // Share method buttons
        document.querySelectorAll('.sl-share-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                showEvoToast('Link copied! 📋', 'link');
                document.getElementById('slEvoShareModal').classList.remove('open');
            });
        });

        // Map buttons — scroll to existing map section
        document.addEventListener('click', function (e) {
            var mapBtn = e.target.closest('.action-map');
            if (mapBtn) {
                e.preventDefault();
                var mapSection = document.querySelector('.explore-city-section, .nightlife-map-section, #homeMap');
                if (mapSection) {
                    mapSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    showEvoToast('Showing on map 📍', 'map-marker-alt');
                }
            }
        }, true);

        // Decision shortcuts
        document.querySelectorAll('.sl-shortcut-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.sl-shortcut-btn').forEach(function (b) { b.classList.remove('active', 'gold'); });
                btn.classList.add('gold');

                var text = btn.textContent.trim().toLowerCase();
                var result = null;

                if (text.indexOf('best spot') >= 0) {
                    result = getTrendingNow()[0];
                    showEvoToast('🔥 ' + result.name + ' — Hottest spot right now!', 'fire');
                } else if (text.indexOf('closest') >= 0) {
                    result = VENUES.slice().sort(function (a, b) { return parseFloat(a.distance) - parseFloat(b.distance); })[0];
                    showEvoToast('📍 ' + result.name + ' — Just ' + result.distance + ' away', 'map-pin');
                } else if (text.indexOf('no wait') >= 0) {
                    result = VENUES.filter(function (v) { return v.status === 'chill' || v.status === 'filling'; })[0];
                    showEvoToast('🍸 ' + result.name + ' — Walk right in', 'cocktail');
                } else if (text.indexOf('date') >= 0) {
                    result = VENUES.filter(function (v) { return v.vibes.join(',').toLowerCase().indexOf('date') >= 0 || v.vibes.join(',').toLowerCase().indexOf('romantic') >= 0; })[0];
                    showEvoToast('❤️ ' + result.name + ' — Perfect for date night', 'heart');
                } else if (text.indexOf('group') >= 0) {
                    result = VENUES.filter(function (v) { return v.vibes.join(',').toLowerCase().indexOf('group') >= 0 || v.capacity > 200; })[0];
                    showEvoToast('👥 ' + result.name + ' — Great for groups', 'users');
                } else if (text.indexOf('live music') >= 0) {
                    result = VENUES.filter(function (v) { return v.vibes.join(',').toLowerCase().indexOf('live') >= 0 || v.vibes.join(',').toLowerCase().indexOf('jazz') >= 0; })[0];
                    showEvoToast('🎵 ' + result.name + ' — Live music tonight', 'music');
                } else if (text.indexOf('late night') >= 0) {
                    result = VENUES.filter(function (v) { return v.hours.indexOf('2 AM') >= 0 || v.hours.indexOf('3 AM') >= 0; })[0];
                    showEvoToast('🌙 ' + result.name + ' — Open late', 'moon');
                }
            });
        });

        // Join the Move click
        var joinCard = document.querySelector('.sl-join-move-card');
        if (joinCard) {
            joinCard.addEventListener('click', function () {
                var hotVenue = getTrendingNow()[0];
                showEvoToast('🔥 You joined the move to ' + hotVenue.name + '!', 'fire');
            });
        }

        // Tonight Plan step clicks
        document.querySelectorAll('.sl-plan-step').forEach(function (step) {
            step.addEventListener('click', function () {
                showEvoToast('Pick a venue from the feed above ☝️', 'hand-point-up');
            });
        });
    }

    /* ==========================================================
       SIMULATE LIVE UPDATES (engagement loop)
       ========================================================== */
    function simulateLiveUpdates() {
        setInterval(function () {
            VENUES.forEach(function (v) {
                var delta = Math.floor(Math.random() * 11) - 5;
                v.crowd = Math.max(10, Math.min(v.capacity, v.crowd + delta));
                v.energy = Math.max(1, Math.min(10, v.energy + (Math.random() - 0.5) * 0.3));
                var pct = v.crowd / v.capacity;
                if (pct >= 0.85) v.status = 'packed';
                else if (pct >= 0.6) v.status = 'busy';
                else if (pct >= 0.35) v.status = 'filling';
                else v.status = 'chill';
            });
        }, 30000); // Update every 30 seconds
    }

    /* ==========================================================
       MAIN INIT — TONIGHT MODE
       ========================================================== */
    function initTonightMode() {
        // Tonight Mode no longer activates on home page — homepage reverted to scenelink.app style
        // Tonight Mode content now lives on Explore and Tonight's Picks pages
        var path = location.pathname.toLowerCase();
        var isHome = path.indexOf('index') >= 0 || path === '/' || path.endsWith('/');

        // On ALL pages (including home), inject save/share modals
        document.body.insertAdjacentHTML('beforeend', buildSaveModal());
        document.body.insertAdjacentHTML('beforeend', buildShareModal());
        wireGlobalSaveButtons();

        // Do NOT inject tonight feed on homepage anymore
        if (isHome) return;

        // Also skip non-home pages (original behavior was home-only)
        // Tonight feed injection will be handled by dedicated page JS
        return;

        // --- DISABLED: Original Tonight Mode homepage injection ---
        // Activate Tonight Mode
        document.body.classList.add('tonight-mode');

        // Find injection point — after hero
        var hero = document.querySelector('.hero-v2, #heroSection');
        if (!hero) return;

        // Build the entire tonight mode feed
        var feedHTML = '';
        feedHTML += buildTonightHero();
        feedHTML += buildShortcuts();
        feedHTML += buildOutTonightBar();
        feedHTML += buildSocialStrip();
        feedHTML += buildSection('🔥 Trending Now', 'fas fa-fire', 'sl-badge-hot', 'HOT', getTrendingNow());
        feedHTML += buildJoinTheMove();
        feedHTML += buildSection('⚡ Getting Busy', 'fas fa-bolt', 'sl-badge-rising', 'RISING', getGettingBusy());
        feedHTML += buildSection('👀 Lowkey Gems', 'fas fa-gem', 'sl-badge-gem', 'HIDDEN', getLowkeyGems());
        feedHTML += buildSection('🥂 Best Vibe Tonight', 'fas fa-glass-cheers', 'sl-badge-vibe', 'CURATED', getBestVibeTonight());
        feedHTML += buildTonightPlan();

        // Inject after hero
        var container = document.createElement('div');
        container.id = 'slTonightFeed';
        container.innerHTML = feedHTML;
        hero.parentNode.insertBefore(container, hero.nextSibling);

        // Inject modals
        document.body.insertAdjacentHTML('beforeend', buildSaveModal());
        document.body.insertAdjacentHTML('beforeend', buildShareModal());

        // Wire everything
        wireInteractions();
        simulateLiveUpdates();
    }

    /* ==========================================================
       GLOBAL SAVE BUTTON WIRE (for non-home pages)
       ========================================================== */
    function wireGlobalSaveButtons() {
        // Wire save buttons on explore, nightlife, etc.
        document.addEventListener('click', function (e) {
            var saveBtn = e.target.closest('.sl-venue-save, .sl-list-card-save, .sl-venue-card-save, .nl-r2-save, #slCardSave');
            if (saveBtn) {
                e.preventDefault();
                e.stopImmediatePropagation();
                var modal = document.getElementById('slEvoSaveModal');
                if (modal) modal.classList.add('open');
            }
        }, true);

        // Wire close
        setTimeout(function () {
            var saveClose = document.getElementById('slEvoSaveClose');
            if (saveClose) {
                saveClose.addEventListener('click', function () {
                    document.getElementById('slEvoSaveModal').classList.remove('open');
                });
            }
            var saveOverlay = document.getElementById('slEvoSaveModal');
            if (saveOverlay) {
                saveOverlay.addEventListener('click', function (e) {
                    if (e.target === saveOverlay) saveOverlay.classList.remove('open');
                });
            }
            document.querySelectorAll('.sl-save-option').forEach(function (opt) {
                opt.addEventListener('click', function () {
                    showEvoToast('Saved ✓', 'bookmark');
                    document.getElementById('slEvoSaveModal').classList.remove('open');
                });
            });
        }, 500);
    }

    /* ==========================================================
       BOOT
       ========================================================== */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTonightMode);
    } else {
        initTonightMode();
    }

})();
/* ==============================================================
   NIGHTLIFE MAP ENHANCEMENT - Pulse Markers + Energy Overlays
   ============================================================== */
(function() {
    'use strict';

    var isNightlife = /nightlife/i.test(window.location.pathname);
    if (!isNightlife) return;

    // Energy data for nightlife venues (keyed by name fragment)
    var venueEnergy = {
        'underground': { energy: 8.7, status: 'packed', crowd: 'Almost at capacity' },
        'jazz lounge': { energy: 6.2, status: 'moderate', crowd: 'Filling up' },
        'rooftop bar': { energy: 7.2, status: 'busy', crowd: 'Getting busy' },
        'live music': { energy: 7.8, status: 'busy', crowd: 'Trending fast' },
        'latin quarter': { energy: 8.0, status: 'packed', crowd: 'Line forming' },
        'craft beer': { energy: 4.5, status: 'chill', crowd: 'Plenty of room' },
        'wine bar': { energy: 3.8, status: 'chill', crowd: 'Relaxed vibe' },
        'comedy club': { energy: 6.8, status: 'moderate', crowd: 'Filling up' },
        'karaoke': { energy: 7.5, status: 'busy', crowd: 'Getting packed' },
        'speakeasy': { energy: 5.5, status: 'moderate', crowd: 'Steady crowd' }
    };

    function getVenueEnergy(name) {
        var n = (name || '').toLowerCase();
        for (var key in venueEnergy) {
            if (n.indexOf(key) !== -1) return venueEnergy[key];
        }
        // Default random energy
        var e = (Math.random() * 5 + 4).toFixed(1);
        return { energy: parseFloat(e), status: e > 7 ? 'busy' : 'moderate', crowd: 'Active tonight' };
    }

    function getEnergyColor(e) {
        if (e >= 8) return '#ff4444';
        if (e >= 6) return '#D4AF37';
        if (e >= 4) return '#4CAF50';
        return '#888';
    }

    // Enhance existing map markers with pulse effect
    function enhanceMapMarkers() {
        var pins = document.querySelectorAll('.nl-pin-wrap .nl-pin');
        if (pins.length === 0) return;

        pins.forEach(function(pin) {
            if (pin.dataset.evoEnhanced) return;
            pin.dataset.evoEnhanced = '1';

            var e = (Math.random() * 5 + 4).toFixed(1);
            var color = getEnergyColor(parseFloat(e));

            // Add pulse ring
            var pulse = document.createElement('div');
            pulse.className = 'evo-map-pulse';
            pulse.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:40px;height:40px;border-radius:50%;border:2px solid ' + color + ';animation:evoPulse ' + (3 - parseFloat(e)/5) + 's infinite;opacity:0.6;pointer-events:none;z-index:-1;';
            pin.style.position = 'relative';
            pin.appendChild(pulse);

            // Add energy dot
            var dot = document.createElement('div');
            dot.style.cssText = 'position:absolute;top:-4px;right:-4px;width:10px;height:10px;border-radius:50%;background:' + color + ';border:1px solid #000;font-size:0;z-index:2;';
            pin.appendChild(dot);
        });
    }

    // Enhance nightlife venue listing cards with energy bars
    function enhanceVenueListings() {
        var cards = document.querySelectorAll('.nl-venue-card, .venue-card-enhanced, [class*="venue-card"]');
        if (cards.length === 0) return;

        cards.forEach(function(card) {
            if (card.dataset.evoEnergy) return;
            card.dataset.evoEnergy = '1';

            var name = '';
            var nameEl = card.querySelector('h3, h4, .venue-name, [class*="name"]');
            if (nameEl) name = nameEl.textContent;

            var data = getVenueEnergy(name);
            var color = getEnergyColor(data.energy);
            var statusClass = data.status === 'packed' ? 'evo-status-packed' : data.status === 'busy' ? 'evo-status-busy' : data.status === 'moderate' ? 'evo-status-moderate' : 'evo-status-chill';

            // Add energy badge to card
            var badge = document.createElement('div');
            badge.className = 'evo-nl-energy-badge';
            badge.innerHTML = '<span class="evo-nl-energy-score" style="color:' + color + '">' + data.energy + '</span>' +
                '<span class="evo-nl-energy-bar"><span style="width:' + (data.energy * 10) + '%;background:' + color + '"></span></span>' +
                '<span class="evo-nl-status ' + statusClass + '">' + data.crowd + '</span>';
            badge.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 10px;margin-top:8px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid rgba(212,175,55,0.1);';

            // Style inner elements
            var scoreSpan = badge.querySelector('.evo-nl-energy-score');
            scoreSpan.style.cssText = 'font-weight:700;font-size:14px;min-width:28px;';

            var barOuter = badge.querySelector('.evo-nl-energy-bar');
            barOuter.style.cssText = 'flex:1;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;';
            var barInner = barOuter.querySelector('span');
            barInner.style.cssText = 'display:block;height:100%;border-radius:2px;width:' + (data.energy * 10) + '%;background:' + color + ';transition:width 0.5s;';

            var statusSpan = badge.querySelector('.evo-nl-status');
            statusSpan.style.cssText = 'font-size:11px;color:rgba(255,255,255,0.5);white-space:nowrap;';

            // Insert before the last child or at the end
            var detailsArea = card.querySelector('.nl-venue-details, .venue-details, [class*="details"]');
            if (detailsArea) {
                detailsArea.appendChild(badge);
            } else {
                card.appendChild(badge);
            }
        });
    }

    // Add pulse animation CSS
    var style = document.createElement('style');
    style.textContent = '@keyframes evoPulse{0%{transform:translate(-50%,-50%) scale(1);opacity:0.6}100%{transform:translate(-50%,-50%) scale(2.5);opacity:0}}';
    document.head.appendChild(style);

    // Run enhancements with delay to let other scripts finish
    function runEnhancements() {
        setTimeout(enhanceMapMarkers, 2000);
        setTimeout(enhanceVenueListings, 2500);
        // Re-run periodically for dynamically added elements
        setInterval(function() {
            enhanceMapMarkers();
            enhanceVenueListings();
        }, 5000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runEnhancements);
    } else {
        runEnhancements();
    }
})();
