/**
 * SceneLink — Plan with Friends: Voting Modal + localStorage Persistence
 */
(function () {
    'use strict';
    if (window.SL_CONNECTED_PLANS) return;

    if (!/plan-with-friends/.test(window.location.pathname) &&
        document.body.getAttribute('data-page') !== 'plan') return;

    const STORAGE_KEY = 'sl_plans_v2';

    function savePlans(plans) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(plans)); } catch(e) {}
    }

    function loadSavedVotes() {
        try { var r = localStorage.getItem('sl_plan_votes'); return r ? JSON.parse(r) : {}; } catch(e) { return {}; }
    }

    function saveVote(planId, venueId, dir) {
        var votes = loadSavedVotes();
        if (!votes[planId]) votes[planId] = {};
        votes[planId][venueId] = dir;
        try { localStorage.setItem('sl_plan_votes', JSON.stringify(votes)); } catch(e) {}
    }

    function clearVote(planId, venueId) {
        var votes = loadSavedVotes();
        if (votes[planId]) delete votes[planId][venueId];
        try { localStorage.setItem('sl_plan_votes', JSON.stringify(votes)); } catch(e) {}
    }

    function injectStyles() {
        if (document.getElementById('sl-voting-styles')) return;
        var style = document.createElement('style');
        style.id = 'sl-voting-styles';
        style.textContent = [
            '#sl-voting-overlay{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.85);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;pointer-events:none;transition:opacity 0.3s ease;}',
            '#sl-voting-overlay.sl-vo-open{opacity:1;pointer-events:all;}',
            '#sl-voting-modal{background:#111;border:1px solid rgba(212,175,55,0.25);border-radius:20px;width:100%;max-width:560px;max-height:90vh;overflow-y:auto;transform:translateY(30px) scale(0.97);transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1);scrollbar-width:thin;}',
            '#sl-voting-overlay.sl-vo-open #sl-voting-modal{transform:translateY(0) scale(1);}',
            '.sl-vo-header{padding:24px 24px 16px;border-bottom:1px solid rgba(255,255,255,0.06);position:sticky;top:0;background:#111;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;}',
            '.sl-vo-plan-title{font-size:18px;font-weight:700;color:#fff;line-height:1.3;}',
            '.sl-vo-plan-meta{font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;}',
            '.sl-vo-close{background:rgba(255,255,255,0.06);border:none;width:32px;height:32px;border-radius:50%;color:rgba(255,255,255,0.6);font-size:18px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:background 0.2s;}',
            '.sl-vo-close:hover{background:rgba(255,255,255,0.12);}',
            '.sl-vo-status-bar{padding:10px 24px;background:rgba(212,175,55,0.06);border-bottom:1px solid rgba(212,175,55,0.1);font-size:12px;color:rgba(255,255,255,0.5);display:flex;align-items:center;gap:8px;}',
            '.sl-vo-live-dot{width:7px;height:7px;border-radius:50%;background:#2ecc71;animation:sl-pulse 1.5s infinite;}',
            '.sl-vo-venues{padding:20px 24px;display:flex;flex-direction:column;gap:14px;}',
            '.sl-vo-venue-card{background:#1a1a1a;border:2px solid rgba(255,255,255,0.06);border-radius:14px;padding:16px;transition:border-color 0.2s,transform 0.15s;position:relative;overflow:hidden;}',
            '.sl-vo-venue-card:hover{border-color:rgba(212,175,55,0.2);}',
            '.sl-vo-venue-card.sl-vo-voted-up{border-color:rgba(212,175,55,0.5);background:rgba(212,175,55,0.04);}',
            '.sl-vo-venue-card.sl-vo-voted-down{border-color:rgba(255,80,80,0.3);background:rgba(255,80,80,0.03);}',
            '.sl-vo-venue-card.sl-vo-winner{border-color:#D4AF37;background:linear-gradient(135deg,rgba(212,175,55,0.08),rgba(212,175,55,0.03));}',
            '.sl-vo-winner-badge{position:absolute;top:12px;right:12px;background:linear-gradient(135deg,#D4AF37,#b8860b);color:#000;font-size:10px;font-weight:700;padding:3px 10px;border-radius:12px;letter-spacing:0.5px;text-transform:uppercase;}',
            '.sl-vo-venue-name{font-size:16px;font-weight:700;color:#fff;margin-bottom:6px;}',
            '.sl-vo-venue-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;}',
            '.sl-vo-tag{background:rgba(255,255,255,0.07);border-radius:20px;padding:3px 10px;font-size:11px;color:rgba(255,255,255,0.5);}',
            '.sl-vo-vote-row{display:flex;align-items:center;gap:12px;}',
            '.sl-vo-vote-bar-wrap{flex:1;height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;}',
            '.sl-vo-vote-bar-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,#D4AF37,#b8860b);transition:width 0.5s cubic-bezier(0.34,1.56,0.64,1);}',
            '.sl-vo-vote-count{font-size:12px;color:rgba(255,255,255,0.4);white-space:nowrap;}',
            '.sl-vo-btns{display:flex;gap:8px;margin-left:auto;}',
            '.sl-vo-btn{border:none;border-radius:10px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;gap:6px;}',
            '.sl-vo-btn-up{background:rgba(212,175,55,0.1);color:#D4AF37;border:1px solid rgba(212,175,55,0.2);}',
            '.sl-vo-btn-up:hover{background:rgba(212,175,55,0.2);border-color:#D4AF37;transform:scale(1.05);}',
            '.sl-vo-btn-up.active{background:linear-gradient(135deg,#D4AF37,#b8860b);color:#000;border-color:transparent;}',
            '.sl-vo-btn-down{background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.4);border:1px solid rgba(255,255,255,0.08);}',
            '.sl-vo-btn-down:hover{background:rgba(255,80,80,0.1);border-color:rgba(255,80,80,0.3);color:#ff6060;}',
            '.sl-vo-btn-down.active{background:rgba(255,80,80,0.1);border-color:rgba(255,80,80,0.3);color:#ff6060;}',
            '.sl-vo-footer{padding:16px 24px 24px;border-top:1px solid rgba(255,255,255,0.06);display:flex;gap:10px;flex-wrap:wrap;}',
            '.sl-vo-footer-btn{flex:1;min-width:120px;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;border:none;transition:all 0.2s;display:flex;align-items:center;justify-content:center;gap:8px;}',
            '.sl-vo-footer-btn-primary{background:linear-gradient(135deg,#D4AF37,#b8860b);color:#000;}',
            '.sl-vo-footer-btn-primary:hover{filter:brightness(1.1);}',
            '.sl-vo-footer-btn-secondary{background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.1);}',
            '.sl-vo-footer-btn-secondary:hover{background:rgba(255,255,255,0.1);}',
            '#sl-crew-picked-banner{position:fixed;top:0;left:0;right:0;z-index:11000;background:linear-gradient(135deg,#D4AF37,#b8860b);color:#000;text-align:center;padding:0;height:0;overflow:hidden;transition:height 0.4s ease,padding 0.4s ease;}',
            '#sl-crew-picked-banner.sl-cpb-show{height:auto;padding:18px 24px;}',
            '.sl-cpb-inner{max-width:560px;margin:0 auto;display:flex;align-items:center;justify-content:center;gap:12px;}',
            '.sl-cpb-icon{font-size:28px;animation:sl-bounce 0.6s infinite alternate;}',
            '.sl-cpb-text{font-size:18px;font-weight:700;}',
            '.sl-cpb-sub{font-size:13px;opacity:0.7;}',
            '.sl-cpb-close{position:absolute;right:16px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.15);border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;}',
            '.sl-vo-voters{display:flex;gap:4px;margin-top:10px;flex-wrap:wrap;}',
            '.sl-vo-voter-chip{background:rgba(212,175,55,0.1);border-radius:20px;padding:2px 8px;font-size:11px;color:rgba(255,255,255,0.5);}',
            '.sl-vo-add-venue{margin:0 24px 20px;border:2px dashed rgba(212,175,55,0.2);border-radius:14px;padding:16px;text-align:center;cursor:pointer;color:rgba(212,175,55,0.6);font-size:14px;transition:all 0.2s;}',
            '.sl-vo-add-venue:hover{border-color:rgba(212,175,55,0.5);color:#D4AF37;background:rgba(212,175,55,0.04);}',
            '@keyframes sl-pulse{0%,100%{opacity:1}50%{opacity:0.3}}',
            '@keyframes sl-bounce{from{transform:translateY(0)}to{transform:translateY(-4px)}}',
            '@keyframes sl-pop{0%{transform:scale(0.85)}60%{transform:scale(1.08)}100%{transform:scale(1)}}',
            '.sl-vo-pop{animation:sl-pop 0.35s cubic-bezier(0.34,1.56,0.64,1);}',
            '.pwf-vote-detail-btn{background:linear-gradient(135deg,rgba(212,175,55,0.15),rgba(212,175,55,0.05));border:1px solid rgba(212,175,55,0.3);color:#D4AF37;border-radius:8px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;display:inline-flex;align-items:center;gap:6px;}',
            '.pwf-vote-detail-btn:hover{background:linear-gradient(135deg,rgba(212,175,55,0.3),rgba(212,175,55,0.1));border-color:#D4AF37;}'
        ].join('');
        document.head.appendChild(style);
    }

    function buildModalDOM() {
        if (document.getElementById('sl-voting-overlay')) return;

        var banner = document.createElement('div');
        banner.id = 'sl-crew-picked-banner';
        banner.innerHTML = '<div class="sl-cpb-inner"><span class="sl-cpb-icon">&#127881;</span><div><div class="sl-cpb-text" id="sl-cpb-text">Crew picked a winner!</div><div class="sl-cpb-sub" id="sl-cpb-sub">The group has spoken</div></div></div><button class="sl-cpb-close" onclick="SLVoting.dismissBanner()">&#x2715;</button>';
        document.body.appendChild(banner);

        var overlay = document.createElement('div');
        overlay.id = 'sl-voting-overlay';
        overlay.innerHTML = '<div id="sl-voting-modal"><div class="sl-vo-header"><div><div class="sl-vo-plan-title" id="sl-vo-plan-title">Voting</div><div class="sl-vo-plan-meta" id="sl-vo-plan-meta"></div></div><button class="sl-vo-close" onclick="SLVoting.close()">&#x2715;</button></div><div class="sl-vo-status-bar"><div class="sl-vo-live-dot"></div><span id="sl-vo-status-text">Voting open</span></div><div class="sl-vo-venues" id="sl-vo-venues-list"></div><div class="sl-vo-add-venue" id="sl-vo-add-venue-btn" onclick="SLVoting.promptAddVenue()"><i class="fas fa-plus-circle"></i> Suggest another venue</div><div class="sl-vo-footer" id="sl-vo-footer"></div></div>';
        document.body.appendChild(overlay);

        overlay.addEventListener('click', function(e) { if (e.target === overlay) SLVoting.close(); });
        document.addEventListener('keydown', function(e) { if (e.key === 'Escape') SLVoting.close(); });
    }

    function renderVenueCards(plan, savedVotes) {
        var list = document.getElementById('sl-vo-venues-list');
        if (!list || !plan.venues) return;
        var maxVotes = Math.max.apply(null, plan.venues.map(function(v){ return v.votes ? v.votes.up : 0; }).concat([1]));
        var isConfirmed = plan.status === 'confirmed' || plan.status === 'completed';
        var planVotes = savedVotes[plan.id] || {};

        list.innerHTML = plan.venues.map(function(v, idx) {
            var myVote = planVotes[v.id] || null;
            var upVotes = v.votes ? v.votes.up : 0;
            var downVotes = v.votes ? v.votes.down : 0;
            var pct = Math.round((upVotes / maxVotes) * 100);
            var isWinner = v.winner || (isConfirmed && idx === 0);
            var upClass = myVote === 'up' ? ' active' : '';
            var downClass = myVote === 'down' ? ' active' : '';
            var cardClass = isWinner ? ' sl-vo-winner' : myVote === 'up' ? ' sl-vo-voted-up' : myVote === 'down' ? ' sl-vo-voted-down' : '';
            var voters = v.voters || [];
            var voterChips = voters.length > 0 ? '<div class="sl-vo-voters">' + voters.slice(0,5).map(function(vid){ return '<span class="sl-vo-voter-chip">' + (vid === 'user_self' ? 'You ✓' : vid) + '</span>'; }).join('') + (voters.length > 5 ? '<span class="sl-vo-voter-chip">+' + (voters.length-5) + ' more</span>' : '') + '</div>' : '';

            var btns = !isConfirmed ? '<div class="sl-vo-btns"><button class="sl-vo-btn sl-vo-btn-up' + upClass + '" onclick="SLVoting.vote(\'' + plan.id + '\',\'' + v.id + '\',\'up\')" title="Vote for this venue">&#128077; <span>' + (myVote === 'up' ? 'Voted' : 'Vote') + '</span></button><button class="sl-vo-btn sl-vo-btn-down' + downClass + '" onclick="SLVoting.vote(\'' + plan.id + '\',\'' + v.id + '\',\'down\')" title="Pass">&#128078;</button></div>' : '';

            return '<div class="sl-vo-venue-card' + cardClass + '" id="sl-vo-card-' + v.id + '">' + (isWinner ? '<div class="sl-vo-winner-badge">&#127942; Top Pick</div>' : '') + '<div class="sl-vo-venue-name">' + v.name + '</div><div class="sl-vo-venue-tags"><span class="sl-vo-tag"><i class="fas fa-tag"></i> ' + v.type + '</span><span class="sl-vo-tag"><i class="fas fa-map-marker-alt"></i> ' + v.area + '</span><span class="sl-vo-tag"><i class="fas fa-clock"></i> ' + v.time + '</span></div><div class="sl-vo-vote-row"><div class="sl-vo-vote-bar-wrap"><div class="sl-vo-vote-bar-fill" style="width:' + pct + '%"></div></div><span class="sl-vo-vote-count">' + upVotes + ' &#128077; &middot; ' + downVotes + ' &#128078;</span>' + btns + '</div>' + voterChips + '</div>';
        }).join('');
    }

    function renderFooter(plan) {
        var footer = document.getElementById('sl-vo-footer');
        var addVenueBtn = document.getElementById('sl-vo-add-venue-btn');
        if (!footer) return;
        var isConfirmed = plan.status === 'confirmed' || plan.status === 'completed';
        var isVoting = plan.status === 'voting';
        if (addVenueBtn) addVenueBtn.style.display = isConfirmed ? 'none' : '';
        var winner = plan.venues ? plan.venues.find(function(v){ return v.winner; }) || plan.venues[0] : null;

        if (isConfirmed) {
            footer.innerHTML = '<button class="sl-vo-footer-btn sl-vo-footer-btn-primary" onclick="SLVoting.close()"><i class="fas fa-check-circle"></i> Got it!</button>' + (winner ? '<button class="sl-vo-footer-btn sl-vo-footer-btn-secondary" onclick="window.location.href=\'explore.html?q=' + encodeURIComponent(winner.name) + '\'"><i class="fas fa-map-marker-alt"></i> Find ' + winner.name.split(' ')[0] + '</button>' : '');
        } else if (isVoting) {
            footer.innerHTML = '<button class="sl-vo-footer-btn sl-vo-footer-btn-primary" onclick="SLVoting.confirmTopPick(\'' + plan.id + '\')"><i class="fas fa-trophy"></i> Confirm Top Pick</button><button class="sl-vo-footer-btn sl-vo-footer-btn-secondary" onclick="SLVoting.close()">Close</button>';
        } else {
            footer.innerHTML = '<button class="sl-vo-footer-btn sl-vo-footer-btn-primary" onclick="SLVoting.startVotingModal(\'' + plan.id + '\')"><i class="fas fa-poll"></i> Open Voting</button><button class="sl-vo-footer-btn sl-vo-footer-btn-secondary" onclick="SLVoting.close()">Close</button>';
        }
    }

    function showCrewPickedBanner(venueName, planTitle) {
        var banner = document.getElementById('sl-crew-picked-banner');
        var textEl = document.getElementById('sl-cpb-text');
        var subEl = document.getElementById('sl-cpb-sub');
        if (!banner) return;
        if (textEl) textEl.textContent = '&#127942; Crew picked: ' + venueName + '!';
        if (subEl) subEl.textContent = planTitle + ' \u2014 the group has spoken \uD83C\uDF89';
        banner.classList.add('sl-cpb-show');
        clearTimeout(banner._dismissTimer);
        banner._dismissTimer = setTimeout(function(){ banner.classList.remove('sl-cpb-show'); }, 6000);
    }

    var _currentPlan = null;

    window.SLVoting = {
        open: function(plan) {
            _currentPlan = plan;
            buildModalDOM();
            var overlay = document.getElementById('sl-voting-overlay');
            var titleEl = document.getElementById('sl-vo-plan-title');
            var metaEl = document.getElementById('sl-vo-plan-meta');
            var statusEl = document.getElementById('sl-vo-status-text');
            if (titleEl) titleEl.textContent = plan.title;
            if (metaEl) {
                var d = plan.date ? new Date(plan.date + 'T12:00:00').toLocaleDateString('en-US', {weekday:'short',month:'short',day:'numeric'}) : '';
                metaEl.textContent = (d ? d + ' at ' : '') + (plan.time || '') + ' \u00b7 ' + (plan.attendees ? plan.attendees.length : '?') + ' friends going';
            }
            var isConfirmed = plan.status === 'confirmed' || plan.status === 'completed';
            var isVoting = plan.status === 'voting';
            if (statusEl) statusEl.textContent = isConfirmed ? '\u2705 Plan confirmed \u2014 winner selected' : isVoting ? '\uD83D\uDDF3\uFE0F Voting open \u2014 cast your vote on each venue' : '\uD83D\uDCCB Planning stage \u2014 add venues, then open voting';
            var savedVotes = loadSavedVotes();
            renderVenueCards(plan, savedVotes);
            renderFooter(plan);
            overlay.classList.add('sl-vo-open');
            document.body.style.overflow = 'hidden';
        },

        close: function() {
            var overlay = document.getElementById('sl-voting-overlay');
            if (overlay) overlay.classList.remove('sl-vo-open');
            document.body.style.overflow = '';
            _currentPlan = null;
        },

        vote: function(planId, venueId, dir) {
            var pwf = window.PlanWithFriends;
            if (!pwf || !pwf.getPlan) return;
            var plan = pwf.getPlan(planId);
            if (!plan) return;
            var venue = plan.venues.find(function(v){ return v.id === venueId; });
            if (!venue) return;

            var savedVotes = loadSavedVotes();
            var planVotes = savedVotes[planId] || {};
            var prevVote = planVotes[venueId] || null;
            if (!venue.voters) venue.voters = [];

            if (dir === 'up') {
                if (prevVote === 'up') {
                    venue.votes.up = Math.max(0, venue.votes.up - 1);
                    venue.voters = venue.voters.filter(function(v){ return v !== 'user_self'; });
                    clearVote(planId, venueId);
                } else {
                    if (prevVote === 'down') venue.votes.down = Math.max(0, venue.votes.down - 1);
                    venue.votes.up++;
                    if (venue.voters.indexOf('user_self') === -1) venue.voters.push('user_self');
                    saveVote(planId, venueId, 'up');
                }
            } else {
                if (prevVote === 'down') {
                    venue.votes.down = Math.max(0, venue.votes.down - 1);
                    clearVote(planId, venueId);
                } else {
                    if (prevVote === 'up') {
                        venue.votes.up = Math.max(0, venue.votes.up - 1);
                        venue.voters = venue.voters.filter(function(v){ return v !== 'user_self'; });
                    }
                    venue.votes.down++;
                    saveVote(planId, venueId, 'down');
                }
            }

            if (pwf.getAllPlans) savePlans(pwf.getAllPlans());
            var updatedSaved = loadSavedVotes();
            renderVenueCards(plan, updatedSaved);
            renderFooter(plan);
            if (pwf.renderPlans) pwf.renderPlans();

            var card = document.getElementById('sl-vo-card-' + venueId);
            if (card) { card.classList.remove('sl-vo-pop'); void card.offsetWidth; card.classList.add('sl-vo-pop'); }
        },

        confirmTopPick: function(planId) {
            var pwf = window.PlanWithFriends;
            if (!pwf || !pwf.confirmPlan) return;
            pwf.confirmPlan(planId);
            var plan = pwf.getPlan ? pwf.getPlan(planId) : null;
            if (plan) {
                var winner = plan.venues.find(function(v){ return v.winner; }) || plan.venues[0];
                this.close();
                if (winner) setTimeout(function(){ showCrewPickedBanner(winner.name, plan.title); }, 300);
            }
            if (pwf.getAllPlans) savePlans(pwf.getAllPlans());
        },

        startVotingModal: function(planId) {
            var pwf = window.PlanWithFriends;
            if (!pwf || !pwf.startVoting) return;
            pwf.startVoting(planId);
            if (pwf.getAllPlans) savePlans(pwf.getAllPlans());
            var plan = pwf.getPlan ? pwf.getPlan(planId) : null;
            if (plan) this.open(plan);
        },

        promptAddVenue: function() {
            if (!_currentPlan) return;
            var addBtn = document.getElementById('sl-vo-add-venue-btn');
            if (!addBtn) return;
            addBtn.innerHTML = '<div style="display:flex;flex-direction:column;gap:8px;text-align:left;"><input id="sl-vo-v-name" placeholder="Venue name *" style="background:#1a1a1a;border:1px solid rgba(212,175,55,0.3);border-radius:8px;padding:8px 12px;color:#fff;font-size:13px;width:100%;box-sizing:border-box;"><div style="display:flex;gap:8px;"><input id="sl-vo-v-type" placeholder="Type (Bar, Restaurant…)" style="flex:1;background:#1a1a1a;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:8px 12px;color:#fff;font-size:13px;"><input id="sl-vo-v-area" placeholder="Neighborhood" style="flex:1;background:#1a1a1a;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:8px 12px;color:#fff;font-size:13px;"></div><div style="display:flex;gap:8px;justify-content:flex-end;"><button onclick="SLVoting._resetAddBtn()" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:6px 14px;color:rgba(255,255,255,0.6);cursor:pointer;font-size:12px;">Cancel</button><button onclick="SLVoting.submitVenueAdd(\'' + _currentPlan.id + '\')" style="background:linear-gradient(135deg,#D4AF37,#b8860b);border:none;border-radius:8px;padding:6px 14px;color:#000;font-weight:700;cursor:pointer;font-size:12px;">Add</button></div></div>';
            addBtn.style.cursor = 'default';
            var nameInput = document.getElementById('sl-vo-v-name');
            if (nameInput) nameInput.focus();
        },

        _resetAddBtn: function() {
            var addBtn = document.getElementById('sl-vo-add-venue-btn');
            if (addBtn) { addBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Suggest another venue'; addBtn.style.cursor = 'pointer'; addBtn.onclick = function(){ SLVoting.promptAddVenue(); }; }
        },

        submitVenueAdd: function(planId) {
            var name = (document.getElementById('sl-vo-v-name') || {}).value || '';
            var type = (document.getElementById('sl-vo-v-type') || {}).value || 'Venue';
            var area = (document.getElementById('sl-vo-v-area') || {}).value || 'Boston';
            if (!name.trim()) return;
            var pwf = window.PlanWithFriends;
            if (!pwf || !pwf.getPlan) return;
            var plan = pwf.getPlan(planId);
            if (!plan) return;
            plan.venues.push({ id: 'v_' + Date.now(), name: name.trim(), type: type.trim() || 'Venue', area: area.trim() || 'Boston', time: plan.time || '8 PM', votes: { up: 0, down: 0 }, voters: [] });
            if (pwf.renderPlans) pwf.renderPlans();
            if (pwf.getAllPlans) savePlans(pwf.getAllPlans());
            this._resetAddBtn();
            renderVenueCards(plan, loadSavedVotes());
        },

        dismissBanner: function() {
            var banner = document.getElementById('sl-crew-picked-banner');
            if (banner) banner.classList.remove('sl-cpb-show');
        }
    };

    function enhancePlanCards() {
        var pwf = window.PlanWithFriends;
        if (!pwf) return;
        document.querySelectorAll('.pwf-plan-card').forEach(function(card) {
            if (card.querySelector('.pwf-vote-detail-btn')) return;
            var planId = card.dataset.planId;
            if (!planId) return;
            var plan = pwf.getPlan ? pwf.getPlan(planId) : null;
            if (!plan) return;
            var footer = card.querySelector('.pwf-plan-card-footer');
            if (!footer) return;
            var btn = document.createElement('button');
            btn.className = 'pwf-vote-detail-btn';
            btn.innerHTML = '<i class="fas fa-poll"></i> ' + (plan.status === 'voting' ? 'Voting Board' : plan.status === 'confirmed' ? '&#127942; See Winner' : plan.status === 'completed' ? '&#128203; Results' : 'Open Voting');
            btn.onclick = function() { SLVoting.open(plan); };
            footer.appendChild(btn);
        });
    }

    function patchPWF() {
        var pwf = window.PlanWithFriends;
        if (!pwf) return false;

        if (!pwf.showToast) {
            pwf.showToast = function(msg, icon) {
                var t = document.createElement('div');
                t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1a1a1a;border:1px solid rgba(212,175,55,0.3);color:#fff;padding:10px 20px;border-radius:50px;font-size:13px;z-index:99999;pointer-events:none;opacity:0;transition:opacity 0.3s;white-space:nowrap;';
                t.textContent = (icon || '') + ' ' + msg;
                document.body.appendChild(t);
                setTimeout(function(){ t.style.opacity = '1'; }, 10);
                setTimeout(function(){ t.style.opacity = '0'; setTimeout(function(){ t.remove(); }, 400); }, 2500);
            };
        }

        if (!pwf.confirmPlan) {
            pwf.confirmPlan = function(planId) {
                var plan = pwf.getPlan ? pwf.getPlan(planId) : null;
                if (!plan) return;
                var sorted = (plan.venues || []).slice().sort(function(a,b){ return b.votes.up - a.votes.up; });
                if (sorted.length) { plan.venues.forEach(function(v){ v.winner = false; }); sorted[0].winner = true; }
                plan.status = 'confirmed';
                if (pwf.renderPlans) pwf.renderPlans();
                if (pwf.updateTabCounts) pwf.updateTabCounts();
                pwf.showToast('Plan confirmed! ' + (sorted[0] ? sorted[0].name : '') + ' wins!', '&#127881;');
            };
        }

        if (!pwf.startVoting) {
            pwf.startVoting = function(planId) {
                var plan = pwf.getPlan ? pwf.getPlan(planId) : null;
                if (!plan) return;
                plan.status = 'voting';
                if (pwf.renderPlans) pwf.renderPlans();
                if (pwf.updateTabCounts) pwf.updateTabCounts();
                pwf.showToast('Voting started!', '&#128227;');
            };
        }

        var origConfirm = pwf.confirmPlan;
        if (origConfirm && !pwf._slConfirmPatched) {
            var _origRef = origConfirm;
            pwf.confirmPlan = function(planId) {
                _origRef.call(pwf, planId);
                var plan = pwf.getPlan ? pwf.getPlan(planId) : null;
                if (plan) {
                    var winner = plan.venues.find(function(v){ return v.winner; }) || plan.venues[0];
                    if (winner) setTimeout(function(){ showCrewPickedBanner(winner.name, plan.title); }, 400);
                    if (pwf.getAllPlans) savePlans(pwf.getAllPlans());
                }
            };
            pwf._slConfirmPatched = true;
        }

        return true;
    }

    function init() {
        injectStyles();
        buildModalDOM();
        var attempts = 0;
        function tryEnhance() {
            attempts++;
            if (attempts > 60) return;
            var pwf = window.PlanWithFriends;
            if (!pwf) { setTimeout(tryEnhance, 100); return; }
            if (!pwf.getPlan) {
                pwf.getPlan = function(planId) {
                    return (pwf.getAllPlans ? pwf.getAllPlans() : []).find(function(p){ return p.id === planId; });
                };
            }
            patchPWF();
            var grid = document.getElementById('pwfPlansGrid');
            if (!grid) { setTimeout(tryEnhance, 100); return; }
            setTimeout(enhancePlanCards, 300);
            var observer = new MutationObserver(function(){ setTimeout(enhancePlanCards, 60); });
            observer.observe(grid, { childList: true, subtree: true });
        }
        setTimeout(tryEnhance, 400);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
