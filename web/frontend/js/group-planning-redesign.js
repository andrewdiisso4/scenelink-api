/**
 * Group Planning - Complete Redesign JavaScript
 * Enhanced functionality and user experience
 */

(function() {
    'use strict';

    // State management
    const state = {
        events: [],
        activeFilter: 'active',
        currentUser: {
            id: 'user1',
            name: 'You',
            avatar: 'https://ui-avatars.com/api/?name=You&size=100&background=D4AF37&color=0a0a0a'
        }
    };

    // Mock events data
    const mockEvents = [
        {
            id: 'event1',
            title: '🎉 Saturday Night Out',
            date: 'Saturday, Nov 25',
            time: '8:00 PM',
            status: 'planning',
            participants: [
                { id: 'user1', name: 'You', avatar: 'https://ui-avatars.com/api/?name=You&size=100&background=D4AF37&color=0a0a0a' },
                { id: 'user2', name: 'Sarah Chen', avatar: 'https://ui-avatars.com/api/?name=Sarah+Chen&size=100&background=D4AF37&color=0a0a0a' },
                { id: 'user3', name: 'Mike Johnson', avatar: 'https://ui-avatars.com/api/?name=Mike+Johnson&size=100&background=D4AF37&color=0a0a0a' },
                { id: 'user4', name: 'Emma Davis', avatar: 'https://ui-avatars.com/api/?name=Emma+Davis&size=100&background=D4AF37&color=0a0a0a' },
                { id: 'user5', name: 'Alex Kim', avatar: 'https://ui-avatars.com/api/?name=Alex+Kim&size=100&background=D4AF37&color=0a0a0a' },
                { id: 'user6', name: 'Jordan Lee', avatar: 'https://ui-avatars.com/api/?name=Jordan+Lee&size=100&background=D4AF37&color=0a0a0a' },
                { id: 'user7', name: 'Taylor Swift', avatar: 'https://ui-avatars.com/api/?name=Taylor+Swift&size=100&background=D4AF37&color=0a0a0a' },
                { id: 'user8', name: 'Chris Brown', avatar: 'https://ui-avatars.com/api/?name=Chris+Brown&size=100&background=D4AF37&color=0a0a0a' }
            ],
            votingOptions: [
                {
                    id: 'venue1',
                    name: 'Sky Lounge',
                    type: 'Rooftop Bar',
                    rating: 4.8,
                    price: '$$$',
                    distance: '0.8 miles',
                    votes: 5,
                    votedBy: ['user1', 'user2', 'user3', 'user4', 'user5']
                },
                {
                    id: 'venue2',
                    name: 'Blue Note Jazz Club',
                    type: 'Jazz Club',
                    rating: 4.9,
                    price: '$$$$',
                    distance: '1.2 miles',
                    votes: 2,
                    votedBy: ['user6', 'user7']
                },
                {
                    id: 'venue3',
                    name: 'The Underground Club',
                    type: 'Nightclub',
                    rating: 4.6,
                    price: '$$',
                    distance: '0.5 miles',
                    votes: 1,
                    votedBy: ['user8']
                }
            ]
        },
        {
            id: 'event2',
            title: '🍕 Pizza Night',
            date: 'Friday, Nov 24',
            time: '7:00 PM',
            status: 'confirmed',
            participants: [
                { id: 'user1', name: 'You', avatar: 'https://ui-avatars.com/api/?name=You&size=100&background=D4AF37&color=0a0a0a' },
                { id: 'user2', name: 'Sarah Chen', avatar: 'https://ui-avatars.com/api/?name=Sarah+Chen&size=100&background=D4AF37&color=0a0a0a' },
                { id: 'user3', name: 'Mike Johnson', avatar: 'https://ui-avatars.com/api/?name=Mike+Johnson&size=100&background=D4AF37&color=0a0a0a' }
            ],
            confirmedVenue: {
                name: 'Pizzeria Uno',
                address: '123 Main St'
            }
        },
        {
            id: 'event3',
            title: '🎭 Theater Night',
            date: 'Sunday, Nov 26',
            time: '6:30 PM',
            status: 'upcoming',
            participants: [
                { id: 'user1', name: 'You', avatar: 'https://ui-avatars.com/api/?name=You&size=100&background=D4AF37&color=0a0a0a' },
                { id: 'user4', name: 'Emma Davis', avatar: 'https://ui-avatars.com/api/?name=Emma+Davis&size=100&background=D4AF37&color=0a0a0a' },
                { id: 'user5', name: 'Alex Kim', avatar: 'https://ui-avatars.com/api/?name=Alex+Kim&size=100&background=D4AF37&color=0a0a0a' }
            ],
            confirmedVenue: {
                name: 'Boston Opera House',
                address: '539 Washington St'
            }
        }
    ];

    // Initialize
    function init() {
        state.events = mockEvents;
        renderEvents();
        initEventListeners();
        renderSidebarWidgets();
    }

    // Render events
    function renderEvents() {
        const eventsGrid = document.querySelector('.events-grid');
        if (!eventsGrid) return;

        const filteredEvents = filterEvents();
        
        if (filteredEvents.length === 0) {
            eventsGrid.innerHTML = `
                <div style="text-align: center; padding: 60px 20px; color: #b0b0b0;">
                    <i class="fas fa-calendar-times" style="font-size: 3rem; margin-bottom: 16px; color: #808080;"></i>
                    <p style="font-size: 1.1rem;">No ${state.activeFilter} events found</p>
                    <button class="btn-create-event" onclick="openCreateEventModal()" style="margin-top: 20px;">
                        <i class="fas fa-plus-circle"></i> Create New Event
                    </button>
                </div>
            `;
            return;
        }

        eventsGrid.innerHTML = filteredEvents.map(event => renderEventCard(event)).join('');
        
        // Add event listeners to voting buttons
        document.querySelectorAll('.vote-btn').forEach(btn => {
            btn.addEventListener('click', handleVote);
        });
    }

    // Filter events
    function filterEvents() {
        return state.events.filter(event => {
            if (state.activeFilter === 'active') {
                return event.status === 'planning';
            } else if (state.activeFilter === 'upcoming') {
                return event.status === 'confirmed' || event.status === 'upcoming';
            } else if (state.activeFilter === 'past') {
                return event.status === 'past';
            }
            return true;
        });
    }

    // Render event card
    function renderEventCard(event) {
        const totalVotes = event.votingOptions ? 
            event.votingOptions.reduce((sum, opt) => sum + opt.votes, 0) : 0;

        return `
            <div class="event-card ${event.status === 'planning' ? 'active-planning' : ''}" data-event-id="${event.id}">
                <div class="event-card-header">
                    <div class="event-info">
                        <h3>${event.title}</h3>
                        <p class="event-date">
                            <i class="fas fa-calendar"></i> ${event.date} • ${event.time}
                        </p>
                    </div>
                    <div class="event-status">
                        <span class="status-badge ${event.status}">${formatStatus(event.status)}</span>
                    </div>
                </div>

                <div class="event-participants">
                    <div class="participants-avatars">
                        ${event.participants.slice(0, 4).map(p => `
                            <img src="${p.avatar}" alt="${p.name}" title="${p.name}">
                        `).join('')}
                        ${event.participants.length > 4 ? `
                            <span class="more-participants">+${event.participants.length - 4}</span>
                        ` : ''}
                    </div>
                    <span class="participants-count">${event.participants.length} going</span>
                </div>

                ${event.status === 'planning' && event.votingOptions ? `
                    <div class="event-voting">
                        <h4>Vote for venue:</h4>
                        <div class="voting-options">
                            ${event.votingOptions.map(option => {
                                const percentage = totalVotes > 0 ? (option.votes / totalVotes * 100) : 0;
                                const hasVoted = option.votedBy.includes(state.currentUser.id);
                                
                                return `
                                    <div class="voting-option ${hasVoted ? 'voted' : ''}" data-venue-id="${option.id}">
                                        <div class="voting-option-header">
                                            <span class="voting-option-name">${option.name}</span>
                                            <span class="voting-option-votes">
                                                <i class="fas fa-check-circle"></i> ${option.votes}
                                            </span>
                                        </div>
                                        <div class="voting-option-details">
                                            <span class="voting-option-detail">
                                                <i class="fas fa-utensils"></i> ${option.type}
                                            </span>
                                            <span class="voting-option-detail">
                                                <i class="fas fa-star"></i> ${option.rating}
                                            </span>
                                            <span class="voting-option-detail">
                                                <i class="fas fa-dollar-sign"></i> ${option.price}
                                            </span>
                                            <span class="voting-option-detail">
                                                <i class="fas fa-map-marker-alt"></i> ${option.distance}
                                            </span>
                                        </div>
                                        <div class="voting-progress">
                                            <div class="voting-progress-bar" style="width: ${percentage}%"></div>
                                        </div>
                                        <button class="vote-btn ${hasVoted ? 'voted' : ''}" 
                                                data-event-id="${event.id}" 
                                                data-venue-id="${option.id}">
                                            ${hasVoted ? '✓ Voted' : 'Vote'}
                                        </button>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                ` : ''}

                ${event.confirmedVenue ? `
                    <div class="confirmed-venue" style="padding: 16px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 12px; margin-bottom: 16px;">
                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                            <i class="fas fa-check-circle" style="color: #34d399; font-size: 1.2rem;"></i>
                            <span style="font-weight: 700; color: #34d399;">Confirmed Venue</span>
                        </div>
                        <div style="color: #ffffff; font-weight: 600; margin-bottom: 4px;">${event.confirmedVenue.name}</div>
                        <div style="color: #b0b0b0; font-size: 0.9rem;">
                            <i class="fas fa-map-marker-alt"></i> ${event.confirmedVenue.address}
                        </div>
                    </div>
                ` : ''}

                <div class="event-actions">
                    <button class="event-action-btn" onclick="viewEventDetails('${event.id}')">
                        <i class="fas fa-eye"></i> View Details
                    </button>
                    <button class="event-action-btn" onclick="shareEvent('${event.id}')">
                        <i class="fas fa-share-alt"></i> Share
                    </button>
                    <button class="event-action-btn" onclick="inviteToEvent('${event.id}')">
                        <i class="fas fa-user-plus"></i> Invite
                    </button>
                </div>
            </div>
        `;
    }

    // Format status
    function formatStatus(status) {
        const statusMap = {
            'planning': 'Planning',
            'confirmed': 'Confirmed',
            'upcoming': 'Upcoming',
            'past': 'Past'
        };
        return statusMap[status] || status;
    }

    // Handle vote
    function handleVote(e) {
        const btn = e.target;
        const eventId = btn.dataset.eventId;
        const venueId = btn.dataset.venueId;

        const event = state.events.find(e => e.id === eventId);
        if (!event || !event.votingOptions) return;

        const venue = event.votingOptions.find(v => v.id === venueId);
        if (!venue) return;

        const hasVoted = venue.votedBy.includes(state.currentUser.id);

        if (hasVoted) {
            // Remove vote
            venue.votes--;
            venue.votedBy = venue.votedBy.filter(id => id !== state.currentUser.id);
            showNotification('Vote removed', 'info');
        } else {
            // Add vote (remove from other venues first)
            event.votingOptions.forEach(v => {
                if (v.votedBy.includes(state.currentUser.id)) {
                    v.votes--;
                    v.votedBy = v.votedBy.filter(id => id !== state.currentUser.id);
                }
            });
            venue.votes++;
            venue.votedBy.push(state.currentUser.id);
            showNotification(`Voted for ${venue.name}!`, 'success');
        }

        renderEvents();
    }

    // Initialize event listeners
    function initEventListeners() {
        // Filter tabs
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                state.activeFilter = this.dataset.filter;
                renderEvents();
            });
        });

        // Create event button
        const createBtn = document.getElementById('createEventBtn');
        if (createBtn) {
            createBtn.addEventListener('click', openCreateEventModal);
        }

        // Create event modal
        initCreateEventModal();
    }

    // Initialize create event modal
    function initCreateEventModal() {
        const modalHTML = `
            <div class="create-event-modal" id="createEventModal">
                <div class="create-event-content">
                    <div class="create-event-header">
                        <h3>Create New Event</h3>
                        <button class="modal-close-btn" onclick="closeCreateEventModal()">×</button>
                    </div>
                    <div class="create-event-body">
                        <form id="createEventForm">
                            <div class="form-group">
                                <label>Event Name</label>
                                <input type="text" name="title" placeholder="e.g., Saturday Night Out" required>
                            </div>
                            
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Date</label>
                                    <input type="date" name="date" required>
                                </div>
                                <div class="form-group">
                                    <label>Time</label>
                                    <input type="time" name="time" required>
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label>Description (Optional)</label>
                                <textarea name="description" placeholder="Add details about your event..."></textarea>
                            </div>
                            
                            <div class="form-group">
                                <label>Invite Friends</label>
                                <select name="friends" multiple style="height: 120px;">
                                    <option value="user2">Sarah Chen</option>
                                    <option value="user3">Mike Johnson</option>
                                    <option value="user4">Emma Davis</option>
                                    <option value="user5">Alex Kim</option>
                                    <option value="user6">Jordan Lee</option>
                                    <option value="user7">Taylor Swift</option>
                                    <option value="user8">Chris Brown</option>
                                </select>
                                <small style="color: #808080; font-size: 0.85rem; margin-top: 4px; display: block;">
                                    Hold Ctrl/Cmd to select multiple friends
                                </small>
                            </div>
                        </form>
                    </div>
                    <div class="create-event-footer">
                        <button class="btn-cancel" onclick="closeCreateEventModal()">Cancel</button>
                        <button class="btn-create" onclick="createEvent()">Create Event</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    // Open create event modal
    window.openCreateEventModal = function() {
        const modal = document.getElementById('createEventModal');
        if (modal) {
            modal.classList.add('active');
            // Set min date to today
            const dateInput = modal.querySelector('input[name="date"]');
            if (dateInput) {
                const today = new Date().toISOString().split('T')[0];
                dateInput.min = today;
            }
        }
    };

    // Close create event modal
    window.closeCreateEventModal = function() {
        const modal = document.getElementById('createEventModal');
        if (modal) {
            modal.classList.remove('active');
            document.getElementById('createEventForm').reset();
        }
    };

    // Create event
    window.createEvent = function() {
        const form = document.getElementById('createEventForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const formData = new FormData(form);
        const selectedFriends = Array.from(form.querySelectorAll('select[name="friends"] option:checked'))
            .map(opt => opt.value);

        // Create new event
        const newEvent = {
            id: 'event' + (state.events.length + 1),
            title: formData.get('title'),
            date: new Date(formData.get('date')).toLocaleDateString('en-US', { 
                weekday: 'long', 
                month: 'short', 
                day: 'numeric' 
            }),
            time: formData.get('time'),
            status: 'planning',
            participants: [
                state.currentUser,
                ...selectedFriends.map(id => {
                    const names = {
                        'user2': 'Sarah Chen',
                        'user3': 'Mike Johnson',
                        'user4': 'Emma Davis',
                        'user5': 'Alex Kim',
                        'user6': 'Jordan Lee',
                        'user7': 'Taylor Swift',
                        'user8': 'Chris Brown'
                    };
                    return {
                        id: id,
                        name: names[id],
                        avatar: `https://ui-avatars.com/api/?name=${names[id]}&size=100&background=D4AF37&color=0a0a0a`
                    };
                })
            ],
            votingOptions: []
        };

        state.events.unshift(newEvent);
        closeCreateEventModal();
        renderEvents();
        showNotification('Event created successfully!', 'success');
    };

    // View event details
    window.viewEventDetails = function(eventId) {
        const event = state.events.find(e => e.id === eventId);
        if (!event) return;
        
        showNotification('Event details feature coming soon!', 'info');
    };

    // Share event
    window.shareEvent = function(eventId) {
        const event = state.events.find(e => e.id === eventId);
        if (!event) return;
        
        if (navigator.share) {
            navigator.share({
                title: event.title,
                text: `Join me for ${event.title} on ${event.date} at ${event.time}!`,
                url: window.location.href
            }).catch(() => {});
        } else {
            showNotification('Event link copied to clipboard!', 'success');
        }
    };

    // Invite to event
    window.inviteToEvent = function(eventId) {
        showNotification('Invite feature coming soon!', 'info');
    };

    // Render sidebar widgets
    function renderSidebarWidgets() {
        const sidebar = document.querySelector('.planning-sidebar');
        if (!sidebar) return;

        const activeEvents = state.events.filter(e => e.status === 'planning').length;
        const upcomingEvents = state.events.filter(e => e.status === 'confirmed' || e.status === 'upcoming').length;
        const totalParticipants = state.events.reduce((sum, e) => sum + e.participants.length, 0);

        sidebar.innerHTML = `
            <!-- Quick Stats -->
            <div class="sidebar-widget">
                <h3><i class="fas fa-chart-line"></i> Quick Stats</h3>
                <div class="quick-stats">
                    <div class="stat-item">
                        <span class="stat-value">${activeEvents}</span>
                        <span class="stat-label">Active</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">${upcomingEvents}</span>
                        <span class="stat-label">Upcoming</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">${state.events.length}</span>
                        <span class="stat-label">Total Events</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">${totalParticipants}</span>
                        <span class="stat-label">Participants</span>
                    </div>
                </div>
            </div>

            <!-- Upcoming Events -->
            <div class="sidebar-widget">
                <h3><i class="fas fa-calendar-check"></i> Upcoming</h3>
                <div class="upcoming-events-list">
                    ${state.events
                        .filter(e => e.status === 'confirmed' || e.status === 'upcoming')
                        .slice(0, 3)
                        .map(event => `
                            <div class="upcoming-event-item" onclick="viewEventDetails('${event.id}')">
                                <div class="upcoming-event-date">${event.date}</div>
                                <div class="upcoming-event-name">${event.title}</div>
                                <div class="upcoming-event-participants">
                                    ${event.participants.length} participants
                                </div>
                            </div>
                        `).join('') || '<p style="color: #808080; text-align: center; padding: 20px;">No upcoming events</p>'}
                </div>
            </div>

            <!-- Friend Suggestions -->
            <div class="sidebar-widget">
                <h3><i class="fas fa-user-friends"></i> Invite Friends</h3>
                <div class="friend-suggestions-list">
                    ${generateFriendSuggestions()}
                </div>
            </div>
        `;
    }

    // Generate friend suggestions
    function generateFriendSuggestions() {
        const friends = [
            { id: 'user9', name: 'Lisa Park', mutual: 5 },
            { id: 'user10', name: 'David Chen', mutual: 8 },
            { id: 'user11', name: 'Maria Garcia', mutual: 3 }
        ];

        return friends.map(friend => `
            <div class="friend-suggestion-item">
                <img src="https://ui-avatars.com/api/?name=${friend.name}&size=100&background=D4AF37&color=0a0a0a" 
                     alt="${friend.name}" 
                     class="friend-suggestion-avatar">
                <div class="friend-suggestion-info">
                    <div class="friend-suggestion-name">${friend.name}</div>
                    <div class="friend-suggestion-mutual">${friend.mutual} mutual friends</div>
                </div>
                <button class="invite-friend-btn" onclick="inviteFriend('${friend.id}')">
                    Invite
                </button>
            </div>
        `).join('');
    }

    // Invite friend
    window.inviteFriend = function(friendId) {
        showNotification('Friend invited!', 'success');
    };

    // Show notification
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: ${type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : '#3b82f6'};
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            animation: slideInRight 0.3s ease;
            font-weight: 600;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Add animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        @keyframes slideOutRight {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
