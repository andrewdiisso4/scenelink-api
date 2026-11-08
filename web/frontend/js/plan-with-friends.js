/* ================================================
   Plan with Friends – Full Functionality
   ================================================ */

const PlanWithFriends = (function () {
    'use strict';
    if (window.SL_CONNECTED_PLANS) return;

    // ---- State ----
    let plans = [];
    let activeTab = 'active';
    let currentUser = { name: 'You', initials: 'YO', id: 'user_self' };

    // ---- Sample Data (Phase 5D-B: emptied; real data loaded from /api/friends) ----
    // Legacy: hardcoded Alex Chen / Sarah Martinez / Mike Johnson / Emily Davis /
    // James Wilson / Lisa Park appeared in the friend-picker even for users with
    // zero friends. Now populated from the live API; empty by default.
    let SAMPLE_FRIENDS = [];
    // Loaded from /api/friends at init time (logged-in users only).
    async function loadRealFriends() {
        try {
            if (!window.SLApi || !window.SLApi.friends) return;
            const r = await window.SLApi.friends();
            const list = (r && (r.friends || r.items)) || [];
            SAMPLE_FRIENDS = list.map(function(f){
                const name = f.display_name || f.full_name || f.username || 'Friend';
                const initials = name.split(/\s+/).slice(0,2).map(function(p){return p.charAt(0).toUpperCase();}).join('') || '?';
                return { id: f.id || f.user_id, name: name, initials: initials, avatar_url: f.avatar_url };
            });
        } catch(_) { SAMPLE_FRIENDS = []; }
    }

    // SAMPLE_PLANS removed in Phase 5D-B (was hardcoded "The Underground Club",
    // "Mamma Maria", "Neptune Oyster" etc.). The init() function only used it
    // when ?demo=1, but the data sat in the bundle. Empty array preserved so
    // any reference (e.g. ?demo=1 path) still resolves without crashing.
    const SAMPLE_PLANS = [];

    // ---- Utility Functions ----
    function getNextSaturday() {
        var d = new Date();
        d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
        return d.toISOString().split('T')[0];
    }

    function getDatePlusDays(n) {
        var d = new Date();
        d.setDate(d.getDate() + n);
        return d.toISOString().split('T')[0];
    }

    function formatDate(dateStr) {
        var d = new Date(dateStr + 'T12:00:00');
        var options = { weekday: 'short', month: 'short', day: 'numeric' };
        return d.toLocaleDateString('en-US', options);
    }

    function generateId() {
        return 'plan_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    }

    function showToast(message, icon) {
        icon = icon || '✅';
        var existing = document.querySelector('.pwf-toast');
        if (existing) existing.remove();
        var toast = document.createElement('div');
        toast.className = 'pwf-toast';
        toast.innerHTML = '<span class="pwf-toast-icon">' + icon + '</span>' + message;
        document.body.appendChild(toast);
        setTimeout(function () { toast.classList.add('show'); }, 50);
        setTimeout(function () {
            toast.classList.remove('show');
            setTimeout(function () { toast.remove(); }, 400);
        }, 3000);
    }

    // ---- Render Functions ----
    function renderPlans() {
        var grid = document.getElementById('pwfPlansGrid');
        if (!grid) return;

        var filtered = plans.filter(function (p) {
            if (activeTab === 'active') return p.status !== 'completed';
            if (activeTab === 'completed') return p.status === 'completed';
            if (activeTab === 'my-plans') return p.creator.id === currentUser.id;
            return true;
        });

        if (filtered.length === 0) {
            grid.innerHTML = '<div class="pwf-empty-state"><i class="fas fa-users"></i><h3>No plans yet</h3><p>Create a new plan to get started with your friends!</p><button class="pwf-btn pwf-btn-primary" onclick="PlanWithFriends.openCreateModal()"><i class="fas fa-plus"></i> Create Plan</button></div>';
            return;
        }

        grid.innerHTML = filtered.map(function (plan) {
            return renderPlanCard(plan);
        }).join('');

        bindCardEvents();
    }

    function renderPlanCard(plan) {
        var statusClass = 'pwf-status-' + plan.status;
        var statusLabel = plan.status.charAt(0).toUpperCase() + plan.status.slice(1);
        var statusIcon = plan.status === 'voting' ? '🗳️' : plan.status === 'confirmed' ? '✅' : plan.status === 'completed' ? '🏁' : '📝';

        var attendeesHtml = plan.attendees.slice(0, 4).map(function (a) {
            return '<div class="pwf-attendee-avatar" title="' + a.name + '">' + a.initials + '</div>';
        }).join('');
        if (plan.attendees.length > 4) {
            attendeesHtml += '<div class="pwf-attendee-avatar more">+' + (plan.attendees.length - 4) + '</div>';
        }

        var venuesHtml = plan.venues.map(function (v) {
            var winnerClass = v.winner ? ' pwf-venue-winner' : '';
            var votedClass = v.voters && v.voters.indexOf('user_self') > -1 ? ' voted' : '';
            return '<div class="pwf-venue-item' + winnerClass + '">' +
                '<div class="pwf-venue-info">' +
                    '<div class="pwf-venue-name">' + v.name + '</div>' +
                    '<div class="pwf-venue-meta"><i class="fas fa-tag"></i> ' + v.type + ' · <i class="fas fa-map-marker-alt"></i> ' + v.area + ' · <i class="fas fa-clock"></i> ' + v.time + '</div>' +
                '</div>' +
                '<div class="pwf-venue-votes">' +
                    '<button class="pwf-vote-btn' + votedClass + '" data-plan="' + plan.id + '" data-venue="' + v.id + '" data-dir="up"><i class="fas fa-thumbs-up"></i></button>' +
                    '<span class="pwf-vote-count">' + v.votes.up + '</span>' +
                    '<button class="pwf-vote-btn downvote" data-plan="' + plan.id + '" data-venue="' + v.id + '" data-dir="down"><i class="fas fa-thumbs-down"></i></button>' +
                '</div>' +
            '</div>';
        }).join('');

        var messagesHtml = plan.messages.slice(-3).map(function (m) {
            var bgColor = m.author.id === 'user_self' ? '#D4AF37' : '#3498db';
            return '<div class="pwf-message">' +
                '<div class="pwf-message-avatar" style="background:' + bgColor + '">' + m.author.initials + '</div>' +
                '<div class="pwf-message-content">' +
                    '<span class="pwf-message-author">' + m.author.name + '</span>' +
                    '<div class="pwf-message-text">' + m.text + '</div>' +
                    '<span class="pwf-message-time">' + m.time + '</span>' +
                '</div>' +
            '</div>';
        }).join('');

        var footerBtns = '';
        if (plan.status === 'voting') {
            footerBtns = '<button class="pwf-btn pwf-btn-sm pwf-btn-primary" onclick="PlanWithFriends.confirmPlan(\'' + plan.id + '\')"><i class="fas fa-check"></i> Confirm Top Pick</button>' +
                         '<button class="pwf-btn pwf-btn-sm pwf-btn-secondary" onclick="PlanWithFriends.sharePlan(\'' + plan.id + '\')"><i class="fas fa-share-alt"></i> Share</button>';
        } else if (plan.status === 'planning') {
            footerBtns = '<button class="pwf-btn pwf-btn-sm pwf-btn-primary" onclick="PlanWithFriends.startVoting(\'' + plan.id + '\')"><i class="fas fa-poll"></i> Start Voting</button>' +
                         '<button class="pwf-btn pwf-btn-sm pwf-btn-secondary" onclick="PlanWithFriends.addVenueToPlan(\'' + plan.id + '\')"><i class="fas fa-plus"></i> Add Venue</button>';
        } else if (plan.status === 'confirmed') {
            footerBtns = '<button class="pwf-btn pwf-btn-sm pwf-btn-success" onclick="PlanWithFriends.addToCalendar(\'' + plan.id + '\')"><i class="fas fa-calendar-plus"></i> Add to Calendar</button>' +
                         '<button class="pwf-btn pwf-btn-sm pwf-btn-secondary" onclick="PlanWithFriends.sharePlan(\'' + plan.id + '\')"><i class="fas fa-share-alt"></i> Share</button>';
        } else {
            footerBtns = '<button class="pwf-btn pwf-btn-sm pwf-btn-secondary" onclick="PlanWithFriends.sharePlan(\'' + plan.id + '\')"><i class="fas fa-share-alt"></i> Share Recap</button>';
        }

        return '<div class="pwf-plan-card" data-plan-id="' + plan.id + '">' +
            '<div class="pwf-plan-card-header">' +
                '<div class="pwf-plan-card-header-top">' +
                    '<div class="pwf-plan-title">' + plan.title + '</div>' +
                    '<span class="pwf-plan-status ' + statusClass + '">' + statusIcon + ' ' + statusLabel + '</span>' +
                '</div>' +
                '<div class="pwf-plan-date"><i class="fas fa-calendar-alt"></i> ' + formatDate(plan.date) + ' at ' + plan.time + '</div>' +
                '<div class="pwf-plan-creator">Created by <strong>' + plan.creator.name + '</strong></div>' +
            '</div>' +
            '<div class="pwf-plan-card-body">' +
                '<div class="pwf-plan-venues">' +
                    '<div class="pwf-plan-venues-title"><i class="fas fa-map-marker-alt"></i> Venue Options (' + plan.venues.length + ')</div>' +
                    venuesHtml +
                '</div>' +
                '<div class="pwf-attendees">' +
                    attendeesHtml +
                    '<span class="pwf-attendees-label">' + plan.attendees.length + ' friends going</span>' +
                '</div>' +
                '<div class="pwf-messages">' +
                    '<div class="pwf-messages-title"><i class="fas fa-comments"></i> Group Chat</div>' +
                    messagesHtml +
                    '<div class="pwf-message-input-row">' +
                        '<input class="pwf-message-input" placeholder="Send a message..." data-plan="' + plan.id + '">' +
                        '<button class="pwf-btn pwf-btn-xs pwf-btn-primary pwf-send-msg-btn" data-plan="' + plan.id + '"><i class="fas fa-paper-plane"></i></button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="pwf-plan-card-footer">' + footerBtns + '</div>' +
        '</div>';
    }

    // ---- Event Binding ----
    function bindCardEvents() {
        // Vote buttons
        document.querySelectorAll('.pwf-vote-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var planId = this.dataset.plan;
                var venueId = this.dataset.venue;
                var dir = this.dataset.dir;
                handleVote(planId, venueId, dir);
            });
        });

        // Message send
        document.querySelectorAll('.pwf-send-msg-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var planId = this.dataset.plan;
                sendMessage(planId);
            });
        });

        document.querySelectorAll('.pwf-message-input').forEach(function (input) {
            input.addEventListener('keypress', function (e) {
                if (e.key === 'Enter') {
                    sendMessage(this.dataset.plan);
                }
            });
        });
    }

    // ---- Actions ----
    function handleVote(planId, venueId, direction) {
        var plan = plans.find(function (p) { return p.id === planId; });
        if (!plan) return;
        var venue = plan.venues.find(function (v) { return v.id === venueId; });
        if (!venue) return;

        if (!venue.voters) venue.voters = [];
        var alreadyVoted = venue.voters.indexOf('user_self') > -1;

        if (direction === 'up') {
            if (alreadyVoted) {
                venue.votes.up = Math.max(0, venue.votes.up - 1);
                venue.voters = venue.voters.filter(function (v) { return v !== 'user_self'; });
                showToast('Vote removed', '🗳️');
            } else {
                venue.votes.up++;
                venue.voters.push('user_self');
                showToast('Voted for ' + venue.name + '!', '👍');
            }
        } else {
            venue.votes.down++;
            showToast('Downvoted ' + venue.name, '👎');
        }

        renderPlans();
    }

    function sendMessage(planId) {
        var input = document.querySelector('.pwf-message-input[data-plan="' + planId + '"]');
        if (!input || !input.value.trim()) return;

        var plan = plans.find(function (p) { return p.id === planId; });
        if (!plan) return;

        plan.messages.push({
            author: currentUser,
            text: input.value.trim(),
            time: 'Just now'
        });

        input.value = '';
        renderPlans();
        showToast('Message sent!', '💬');
    }

    function createPlan(data) {
        var newPlan = {
            id: generateId(),
            title: data.title,
            date: data.date,
            time: data.time,
            status: 'planning',
            creator: currentUser,
            attendees: [currentUser],
            venues: [],
            messages: [
                { author: currentUser, text: 'Created this plan — let\'s figure out where to go! 🎉', time: 'Just now' }
            ],
            description: data.description || ''
        };

        // Add invited friends
        if (data.invitedFriends && data.invitedFriends.length > 0) {
            data.invitedFriends.forEach(function (fId) {
                var friend = SAMPLE_FRIENDS.find(function (f) { return f.id === fId; });
                if (friend) newPlan.attendees.push(friend);
            });
        }

        // Add initial venue if provided
        if (data.venueName) {
            newPlan.venues.push({
                id: 'v_' + Date.now(),
                name: data.venueName,
                type: data.venueType || 'Venue',
                area: data.venueArea || 'Boston',
                time: data.time,
                votes: { up: 1, down: 0 },
                voters: ['user_self']
            });
        }

        plans.unshift(newPlan);
        activeTab = 'active';
        renderPlans();
        updateTabCounts();
        showToast('Plan created! Invite sent to ' + (newPlan.attendees.length - 1) + ' friends', '🎉');
    }

    function confirmPlan(planId) {
        var plan = plans.find(function (p) { return p.id === planId; });
        if (!plan) return;

        // Find venue with most votes
        var sorted = plan.venues.slice().sort(function (a, b) { return b.votes.up - a.votes.up; });
        if (sorted.length > 0) {
            plan.venues.forEach(function (v) { v.winner = false; });
            sorted[0].winner = true;
        }

        plan.status = 'confirmed';
        plan.messages.push({
            author: currentUser,
            text: 'Plan confirmed! ' + (sorted[0] ? sorted[0].name : 'Venue') + ' is our pick! 🎉',
            time: 'Just now'
        });

        renderPlans();
        updateTabCounts();
        showToast('Plan confirmed! ' + (sorted[0] ? sorted[0].name : '') + ' wins!', '🎉');
    }

    function startVoting(planId) {
        var plan = plans.find(function (p) { return p.id === planId; });
        if (!plan) return;

        if (plan.venues.length === 0) {
            showToast('Add at least one venue before starting a vote!', '⚠️');
            return;
        }

        plan.status = 'voting';
        plan.messages.push({
            author: currentUser,
            text: 'Voting is now open! Cast your votes on the venue options 🗳️',
            time: 'Just now'
        });

        renderPlans();
        updateTabCounts();
        showToast('Voting started! Friends can now vote.', '🗳️');
    }

    function addVenueToPlan(planId) {
        var name = prompt('Enter venue name:');
        if (!name) return;
        var type = prompt('Venue type (Restaurant, Bar, Nightclub, etc.):') || 'Venue';
        var area = prompt('Neighborhood/Area:') || 'Boston';

        var plan = plans.find(function (p) { return p.id === planId; });
        if (!plan) return;

        plan.venues.push({
            id: 'v_' + Date.now(),
            name: name,
            type: type,
            area: area,
            time: plan.time,
            votes: { up: 0, down: 0 },
            voters: []
        });

        plan.messages.push({
            author: currentUser,
            text: 'Added ' + name + ' as an option! 📍',
            time: 'Just now'
        });

        renderPlans();
        showToast(name + ' added to the plan!', '📍');
    }

    function addToCalendar(planId) {
        var plan = plans.find(function (p) { return p.id === planId; });
        if (!plan) return;

        var winner = plan.venues.find(function (v) { return v.winner; }) || plan.venues[0];
        var title = encodeURIComponent(plan.title);
        var location = winner ? encodeURIComponent(winner.name + ', ' + winner.area) : '';
        var details = encodeURIComponent(plan.description + '\n\nAttendees: ' + plan.attendees.map(function (a) { return a.name; }).join(', '));

        // Create ICS content
        var dateObj = new Date(plan.date + 'T' + convertTo24h(plan.time));
        var endDate = new Date(dateObj.getTime() + 3 * 60 * 60 * 1000); // 3 hours
        var icsContent = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'BEGIN:VEVENT',
            'DTSTART:' + dateObj.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z',
            'DTEND:' + endDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z',
            'SUMMARY:' + plan.title,
            'LOCATION:' + (winner ? winner.name + ', ' + winner.area : ''),
            'DESCRIPTION:' + plan.description,
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\r\n');

        var blob = new Blob([icsContent], { type: 'text/calendar' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = plan.title.replace(/[^a-zA-Z0-9]/g, '_') + '.ics';
        a.click();
        URL.revokeObjectURL(url);

        showToast('Calendar file downloaded! Import it to your calendar app.', '📅');
    }

    function convertTo24h(timeStr) {
        var match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!match) return '19:00';
        var hours = parseInt(match[1]);
        var mins = match[2];
        var ampm = match[3].toUpperCase();
        if (ampm === 'PM' && hours !== 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
        return (hours < 10 ? '0' : '') + hours + ':' + mins;
    }

    function sharePlan(planId) {
        var plan = plans.find(function (p) { return p.id === planId; });
        if (!plan) return;

        var winner = plan.venues.find(function (v) { return v.winner; }) || plan.venues[0];
        var shareText = plan.title + '\n📅 ' + formatDate(plan.date) + ' at ' + plan.time;
        if (winner) shareText += '\n📍 ' + winner.name + ', ' + winner.area;
        shareText += '\n👥 ' + plan.attendees.length + ' friends going';
        shareText += '\n\nJoin us on SceneLink!';

        if (navigator.share) {
            navigator.share({ title: plan.title, text: shareText }).catch(function () {});
        } else {
            // Copy to clipboard
            navigator.clipboard.writeText(shareText).then(function () {
                showToast('Plan details copied to clipboard!', '📋');
            }).catch(function () {
                showToast('Share: ' + shareText, '📋');
            });
        }
    }

    function updateTabCounts() {
        var activePlans = plans.filter(function (p) { return p.status !== 'completed'; });
        var completedPlans = plans.filter(function (p) { return p.status === 'completed'; });
        var myPlans = plans.filter(function (p) { return p.creator.id === currentUser.id; });

        var activeLabel = document.querySelector('[data-tab="active"] .pwf-tab-count');
        var completedLabel = document.querySelector('[data-tab="completed"] .pwf-tab-count');
        var myLabel = document.querySelector('[data-tab="my-plans"] .pwf-tab-count');

        if (activeLabel) activeLabel.textContent = activePlans.length;
        if (completedLabel) completedLabel.textContent = completedPlans.length;
        if (myLabel) myLabel.textContent = myPlans.length;
    }

    // ---- Modal Functions ----
    function openCreateModal(prefilledVenue) {
        var overlay = document.getElementById('pwfCreateModal');
        if (!overlay) return;

        // Reset form
        var form = overlay.querySelector('.pwf-modal-body');
        if (form) {
            var titleInput = document.getElementById('pwfPlanTitle');
            var dateInput = document.getElementById('pwfPlanDate');
            var timeInput = document.getElementById('pwfPlanTime');
            var descInput = document.getElementById('pwfPlanDesc');
            var venueInput = document.getElementById('pwfPlanVenue');

            if (titleInput) titleInput.value = '';
            if (dateInput) dateInput.value = getDatePlusDays(1);
            if (timeInput) timeInput.value = '20:00';
            if (descInput) descInput.value = '';
            if (venueInput) venueInput.value = prefilledVenue || '';
        }

        // Render friend checkboxes
        var friendsList = document.getElementById('pwfFriendsList');
        if (friendsList) {
            friendsList.innerHTML = SAMPLE_FRIENDS.map(function (f) {
                return '<label class="pwf-friend-check"><input type="checkbox" value="' + f.id + '"> <span class="pwf-attendee-avatar" style="width:24px;height:24px;font-size:0.65rem;margin:0">' + f.initials + '</span> ' + f.name + '</label>';
            }).join('');
        }

        overlay.classList.add('active');
    }

    function closeCreateModal() {
        var overlay = document.getElementById('pwfCreateModal');
        if (overlay) overlay.classList.remove('active');
        // Release body scroll lock
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
    }

    // Close modal on Escape
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            var overlay = document.getElementById('pwfCreateModal');
            if (overlay && overlay.classList.contains('active')) {
                closeCreateModal();
            }
        }
    });

    function handleCreateSubmit() {
        var title = (document.getElementById('pwfPlanTitle') || {}).value;
        var date = (document.getElementById('pwfPlanDate') || {}).value;
        var timeRaw = (document.getElementById('pwfPlanTime') || {}).value;
        var desc = (document.getElementById('pwfPlanDesc') || {}).value;
        var venue = (document.getElementById('pwfPlanVenue') || {}).value;

        if (!title || !date) {
            showToast('Please enter a plan name and date!', '⚠️');
            return;
        }

        // Convert time to 12h
        var timeParts = timeRaw ? timeRaw.split(':') : ['20', '00'];
        var h = parseInt(timeParts[0]);
        var m = timeParts[1];
        var ampm = h >= 12 ? 'PM' : 'AM';
        if (h > 12) h -= 12;
        if (h === 0) h = 12;
        var time12 = h + ':' + m + ' ' + ampm;

        // Get invited friends
        var invitedFriends = [];
        document.querySelectorAll('#pwfFriendsList input:checked').forEach(function (cb) {
            invitedFriends.push(cb.value);
        });

        createPlan({
            title: title,
            date: date,
            time: time12,
            description: desc,
            venueName: venue,
            invitedFriends: invitedFriends
        });

        closeCreateModal();
    }

    // ---- Initialization ----
    function init() {
        // Phase 5D-B: load real friends list (logged-in only, fails silently otherwise)
        loadRealFriends();
        // Load real user plans from localStorage (unified state); fall back to empty list.
        // NOTE: SAMPLE_PLANS retained only as fallback if dev mode enabled via ?demo=1
        try {
            var saved = JSON.parse(localStorage.getItem('sl_user_plans') || '[]');
            if (Array.isArray(saved) && saved.length) {
                plans = saved;
            } else if (new URLSearchParams(window.location.search).get('demo') === '1') {
                plans = SAMPLE_PLANS.slice();
            } else {
                plans = [];
            }
        } catch(_) {
            plans = [];
        }

        // Tab switching
        document.querySelectorAll('.pwf-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                document.querySelectorAll('.pwf-tab').forEach(function (t) { t.classList.remove('active'); });
                this.classList.add('active');
                activeTab = this.dataset.tab;
                renderPlans();
            });
        });

        // Create modal handlers
        var createBtn = document.getElementById('pwfCreateBtn');
        var createBtnHero = document.getElementById('pwfCreateBtnHero');
        var closeBtn = document.getElementById('pwfModalClose');
        var submitBtn = document.getElementById('pwfCreateSubmit');
        var cancelBtn = document.getElementById('pwfCreateCancel');

        if (createBtn) createBtn.addEventListener('click', function () { openCreateModal(); });
        if (createBtnHero) createBtnHero.addEventListener('click', function () { openCreateModal(); });
        if (closeBtn) closeBtn.addEventListener('click', closeCreateModal);
        if (submitBtn) submitBtn.addEventListener('click', handleCreateSubmit);
        if (cancelBtn) cancelBtn.addEventListener('click', closeCreateModal);

        // Close modal on overlay click
        var overlay = document.getElementById('pwfCreateModal');
        if (overlay) {
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) closeCreateModal();
            });
        }

        renderPlans();
        updateTabCounts();
    }

    // ---- Public API ----
    return {
        init: init,
        openCreateModal: openCreateModal,
        closeCreateModal: closeCreateModal,
        confirmPlan: confirmPlan,
        startVoting: startVoting,
        addVenueToPlan: addVenueToPlan,
        addToCalendar: addToCalendar,
        sharePlan: sharePlan,
        createPlan: createPlan,
        renderPlans: renderPlans,
        updateTabCounts: updateTabCounts,
        getPlans: function () { return plans; },
        getAllPlans: function () { return plans; },
        getPlan: function (planId) { return plans.find(function(p){ return p.id === planId; }); },
        getFriendById: function (fId) { return SAMPLE_FRIENDS.find(function(f){ return f.id === fId; }); },
        SAMPLE_FRIENDS: SAMPLE_FRIENDS
    };

})();

// Init on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('pwfPlansGrid')) {
        PlanWithFriends.init();

        // Check for venue parameter from other pages
        var params = new URLSearchParams(window.location.search);
        var venueParam = params.get('venue');
        if (venueParam) {
            setTimeout(function () {
                PlanWithFriends.openCreateModal(venueParam);
            }, 500);
        }
    }
});