// Group Planning JavaScript - Complete Implementation
// Handles event creation, voting, participant management, and group interactions

class GroupPlanningManager {
    constructor() {
        this.events = this.loadEvents();
        this.currentFilter = 'active';
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.renderEvents();
        this.setupNotifications();
    }

    setupEventListeners() {
        // Create Event Button
        const createBtn = document.getElementById('createEventBtn');
        if (createBtn) {
            createBtn.addEventListener('click', () => this.openCreateModal());
        }

        // Modal Close Buttons
        const closeButtons = document.querySelectorAll('.close-modal');
        closeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) this.closeModal(modal.id);
            });
        });

        // Modal Background Click
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal(modal.id);
                }
            });
        });

        // Event Form Submit
        const eventForm = document.getElementById('createEventForm');
        if (eventForm) {
            eventForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.createEvent();
            });
        }

        // Filter Buttons
        const filterButtons = document.querySelectorAll('.filter-btn');
        filterButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.target.dataset.filter;
                this.setFilter(filter);
            });
        });

        // Search Input
        const searchInput = document.getElementById('eventSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchEvents(e.target.value);
            });
        }
    }

    openCreateModal() {
        const modal = document.getElementById('createEventModal');
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
            
            // Reset form if it's the create modal
            if (modalId === 'createEventModal') {
                const form = document.getElementById('createEventForm');
                if (form) form.reset();
            }
        }
    }

    createEvent() {
        const form = document.getElementById('createEventForm');
        const formData = new FormData(form);
        
        const newEvent = {
            id: Date.now(),
            title: formData.get('eventTitle'),
            date: formData.get('eventDate'),
            time: formData.get('eventTime'),
            type: formData.get('eventType'),
            budget: formData.get('budget'),
            description: formData.get('description'),
            status: 'planning',
            participants: [
                {
                    id: 1,
                    name: 'You',
                    avatar: 'https://i.pravatar.cc/150?img=1',
                    isOrganizer: true
                }
            ],
            venues: [],
            votes: {},
            createdAt: new Date().toISOString()
        };

        this.events.unshift(newEvent);
        this.saveEvents();
        this.renderEvents();
        this.closeModal('createEventModal');
        
        this.showNotification('Event created successfully!', 'success');
    }

    setFilter(filter) {
        this.currentFilter = filter;
        
        // Update active button
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.filter === filter) {
                btn.classList.add('active');
            }
        });
        
        this.renderEvents();
    }

    searchEvents(query) {
        const filteredEvents = this.events.filter(event => {
            return event.title.toLowerCase().includes(query.toLowerCase()) ||
                   event.description.toLowerCase().includes(query.toLowerCase());
        });
        
        this.renderEvents(filteredEvents);
    }

    renderEvents(eventsToRender = null) {
        const container = document.getElementById('eventsContainer');
        if (!container) return;

        let events = eventsToRender || this.getFilteredEvents();
        
        if (events.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-calendar-times"></i>
                    <h3>No events found</h3>
                    <p>Create your first group event to get started!</p>
                    <button class="btn-primary" onclick="groupPlanning.openCreateModal()">
                        <i class="fas fa-plus"></i> Create Event
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = events.map(event => this.renderEventCard(event)).join('');
        this.attachEventCardListeners();
    }

    getFilteredEvents() {
        const now = new Date();
        
        switch(this.currentFilter) {
            case 'active':
                return this.events.filter(e => e.status === 'planning' || e.status === 'confirmed');
            case 'upcoming':
                return this.events.filter(e => {
                    const eventDate = new Date(e.date);
                    return eventDate > now && e.status === 'confirmed';
                });
            case 'past':
                return this.events.filter(e => {
                    const eventDate = new Date(e.date);
                    return eventDate < now;
                });
            default:
                return this.events;
        }
    }

    renderEventCard(event) {
        const statusClass = this.getStatusClass(event.status);
        const statusText = this.getStatusText(event.status);
        const participantCount = event.participants.length;
        const venueCount = event.venues ? event.venues.length : 0;
        
        return `
            <div class="event-card" data-event-id="${event.id}">
                <div class="event-header">
                    <div class="event-info">
                        <h3>${event.title}</h3>
                        <div class="event-meta">
                            <span><i class="far fa-calendar"></i> ${this.formatDate(event.date)}</span>
                            <span><i class="far fa-clock"></i> ${event.time}</span>
                            <span><i class="fas fa-tag"></i> ${event.type}</span>
                        </div>
                    </div>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>

                <p class="event-description">${event.description}</p>

                <div class="event-stats">
                    <div class="stat">
                        <i class="fas fa-users"></i>
                        <span>${participantCount} participant${participantCount !== 1 ? 's' : ''}</span>
                    </div>
                    <div class="stat">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${venueCount} venue${venueCount !== 1 ? 's' : ''} suggested</span>
                    </div>
                    <div class="stat">
                        <i class="fas fa-dollar-sign"></i>
                        <span>${event.budget}</span>
                    </div>
                </div>

                <div class="participants-preview">
                    ${event.participants.slice(0, 5).map(p => `
                        <img src="${p.avatar}" alt="${p.name}" title="${p.name}">
                    `).join('')}
                    ${participantCount > 5 ? `<span class="more-count">+${participantCount - 5}</span>` : ''}
                </div>

                ${event.venues && event.venues.length > 0 ? this.renderVotingSection(event) : ''}

                <div class="event-actions">
                    <button class="btn-secondary" onclick="groupPlanning.viewEventDetails(${event.id})">
                        <i class="fas fa-eye"></i> View Details
                    </button>
                    <button class="btn-secondary" onclick="groupPlanning.inviteFriends(${event.id})">
                        <i class="fas fa-user-plus"></i> Invite
                    </button>
                    ${event.status === 'planning' ? `
                        <button class="btn-primary" onclick="groupPlanning.suggestVenue(${event.id})">
                            <i class="fas fa-plus"></i> Suggest Venue
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    renderVotingSection(event) {
        if (!event.venues || event.venues.length === 0) return '';
        
        return `
            <div class="voting-section">
                <h4>Vote for a Venue</h4>
                <div class="venue-options">
                    ${event.venues.map(venue => this.renderVenueOption(event.id, venue)).join('')}
                </div>
            </div>
        `;
    }

    renderVenueOption(eventId, venue) {
        const votes = venue.votes || 0;
        const hasVoted = venue.voters && venue.voters.includes('currentUser');
        
        return `
            <div class="venue-option ${hasVoted ? 'voted' : ''}">
                <img src="${venue.image}" alt="${venue.name}">
                <div class="venue-info">
                    <h5>${venue.name}</h5>
                    <p>${venue.cuisine} • ${venue.price}</p>
                    <div class="venue-meta">
                        <span><i class="fas fa-star"></i> ${venue.rating}</span>
                        <span><i class="fas fa-map-marker-alt"></i> ${venue.distance}</span>
                    </div>
                </div>
                <div class="vote-section">
                    <button class="vote-btn ${hasVoted ? 'voted' : ''}" 
                            onclick="groupPlanning.voteForVenue(${eventId}, ${venue.id})">
                        <i class="fas fa-thumbs-up"></i>
                        <span>${votes}</span>
                    </button>
                </div>
            </div>
        `;
    }

    voteForVenue(eventId, venueId) {
        const event = this.events.find(e => e.id === eventId);
        if (!event) return;

        const venue = event.venues.find(v => v.id === venueId);
        if (!venue) return;

        // Initialize voters array if it doesn't exist
        if (!venue.voters) venue.voters = [];
        
        // Toggle vote
        const userIndex = venue.voters.indexOf('currentUser');
        if (userIndex > -1) {
            venue.voters.splice(userIndex, 1);
            venue.votes = (venue.votes || 1) - 1;
            this.showNotification('Vote removed', 'info');
        } else {
            venue.voters.push('currentUser');
            venue.votes = (venue.votes || 0) + 1;
            this.showNotification('Vote added!', 'success');
        }

        this.saveEvents();
        this.renderEvents();
    }

    suggestVenue(eventId) {
        // In a real app, this would open a venue search modal
        this.showNotification('Venue suggestion feature coming soon!', 'info');
        
        // For demo purposes, add a sample venue
        const event = this.events.find(e => e.id === eventId);
        if (!event) return;

        if (!event.venues) event.venues = [];
        
        const sampleVenue = {
            id: Date.now(),
            name: 'Sample Restaurant',
            cuisine: 'Italian',
            price: '$$',
            rating: 4.5,
            distance: '0.5 mi',
            image: '/assets/img/placeholder-venue.svg',
            votes: 0,
            voters: []
        };
        
        event.venues.push(sampleVenue);
        this.saveEvents();
        this.renderEvents();
    }

    inviteFriends(eventId) {
        this.showNotification('Invite friends feature coming soon!', 'info');
    }

    viewEventDetails(eventId) {
        const event = this.events.find(e => e.id === eventId);
        if (!event) return;
        
        // In a real app, this would open a detailed modal
        console.log('Event details:', event);
        this.showNotification('Opening event details...', 'info');
    }

    getStatusClass(status) {
        const statusMap = {
            'planning': 'status-planning',
            'confirmed': 'status-confirmed',
            'upcoming': 'status-upcoming',
            'completed': 'status-completed'
        };
        return statusMap[status] || 'status-planning';
    }

    getStatusText(status) {
        const textMap = {
            'planning': 'Planning',
            'confirmed': 'Confirmed',
            'upcoming': 'Upcoming',
            'completed': 'Completed'
        };
        return textMap[status] || 'Planning';
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const options = { month: 'short', day: 'numeric', year: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    }

    attachEventCardListeners() {
        // Add any additional event listeners for dynamically created elements
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    setupNotifications() {
        // Add notification styles if not already present
        if (!document.getElementById('notificationStyles')) {
            const style = document.createElement('style');
            style.id = 'notificationStyles';
            style.textContent = `
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: #1a1a1a;
                    color: white;
                    padding: 15px 20px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    transform: translateX(400px);
                    transition: transform 0.3s ease;
                    z-index: 10000;
                    border-left: 4px solid #D4AF37;
                }
                
                .notification.show {
                    transform: translateX(0);
                }
                
                .notification-success {
                    border-left-color: #4CAF50;
                }
                
                .notification-error {
                    border-left-color: #f44336;
                }
                
                .notification-info {
                    border-left-color: #2196F3;
                }
                
                .notification i {
                    font-size: 20px;
                }
            `;
            document.head.appendChild(style);
        }
    }

    loadEvents() {
        const stored = localStorage.getItem('groupPlanningEvents');
        if (stored) {
            return JSON.parse(stored);
        }
        
        // Return sample events for demo
        return [
            {
                id: 1,
                title: 'Weekend Dinner Plans',
                date: '2024-11-30',
                time: '7:00 PM',
                type: 'Dinner',
                budget: '$$',
                description: 'Looking for a great Italian spot for dinner this weekend!',
                status: 'planning',
                participants: [
                    { id: 1, name: 'You', avatar: 'https://i.pravatar.cc/150?img=1', isOrganizer: true },
                    { id: 2, name: 'Sarah Chen', avatar: 'https://i.pravatar.cc/150?img=2' },
                    { id: 3, name: 'Mike Johnson', avatar: 'https://i.pravatar.cc/150?img=3' },
                    { id: 4, name: 'Emily Davis', avatar: 'https://i.pravatar.cc/150?img=4' }
                ],
                venues: [
                    {
                        id: 1,
                        name: 'Trattoria Toscana',
                        cuisine: 'Italian',
                        price: '$$',
                        rating: 4.7,
                        distance: '0.8 mi',
                        image: '/assets/img/placeholder-venue.svg',
                        votes: 3,
                        voters: ['user2', 'user3', 'user4']
                    },
                    {
                        id: 2,
                        name: 'Bella Vita',
                        cuisine: 'Italian',
                        price: '$$$',
                        rating: 4.8,
                        distance: '1.2 mi',
                        image: '/assets/img/placeholder-venue.svg',
                        votes: 1,
                        voters: ['user2']
                    }
                ],
                createdAt: '2024-11-20T10:00:00Z'
            },
            {
                id: 2,
                title: 'Birthday Celebration',
                date: '2024-12-05',
                time: '8:00 PM',
                type: 'Celebration',
                budget: '$$$',
                description: "Celebrating Alex's birthday with cocktails and dinner!",
                status: 'confirmed',
                participants: [
                    { id: 1, name: 'You', avatar: 'https://i.pravatar.cc/150?img=1', isOrganizer: true },
                    { id: 2, name: 'Alex Rivera', avatar: 'https://i.pravatar.cc/150?img=5' },
                    { id: 3, name: 'Jordan Lee', avatar: 'https://i.pravatar.cc/150?img=6' },
                    { id: 4, name: 'Taylor Swift', avatar: 'https://i.pravatar.cc/150?img=7' },
                    { id: 5, name: 'Chris Martin', avatar: 'https://i.pravatar.cc/150?img=8' },
                    { id: 6, name: 'Sam Wilson', avatar: 'https://i.pravatar.cc/150?img=9' }
                ],
                venues: [],
                createdAt: '2024-11-18T14:30:00Z'
            }
        ];
    }

    saveEvents() {
        localStorage.setItem('groupPlanningEvents', JSON.stringify(this.events));
    }
}

// Initialize when DOM is ready
let groupPlanning;
document.addEventListener('DOMContentLoaded', () => {
    groupPlanning = new GroupPlanningManager();
});

// ============================================
// SOCIAL FEED INTEGRATION
// ============================================

function shareEventToFeed(button) {
    const eventCard = button.closest('.event-card');
    const eventTitle = eventCard.querySelector('h3').textContent;
    const eventDate = eventCard.querySelector('.event-date').textContent;
    
    // Mark button as shared
    button.classList.add('shared');
    button.innerHTML = '<i class="fas fa-check"></i> Shared';
    button.disabled = true;
    
    // Mark card as shared
    eventCard.classList.add('shared-to-feed');
    
    // Show success notification
    if (typeof showNotification === 'function') {
        showNotification(
            'success',
            'Shared to Feed!',
            `"${eventTitle}" has been shared to your social feed. Your friends can now see and join this event.`
        );
    }
    
    // Simulate posting to social feed
    const eventData = {
        title: eventTitle,
        date: eventDate,
        sharedAt: new Date().toISOString(),
        type: 'group-event'
    };
    
    // Store in localStorage for social feed to display
    let sharedEvents = JSON.parse(localStorage.getItem('sharedEvents') || '[]');
    sharedEvents.unshift(eventData);
    localStorage.setItem('sharedEvents', JSON.stringify(sharedEvents));
    
    console.log('Event shared to social feed:', eventData);
}

// Link to social feed from event cards
function viewEventInFeed(eventId) {
    window.location.href = `social-feed.html?event=${eventId}`;
}

// Quick invite friends from social feed
function inviteFriendsFromFeed() {
    window.location.href = 'social-feed.html?action=invite';
}