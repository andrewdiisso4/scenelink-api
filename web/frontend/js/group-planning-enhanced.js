/**
 * Enhanced Group Planning Integration
 * Seamless integration with venue discovery, social features, and other platform components
 */

(function() {
    'use strict';

    // State management
    const state = {
        events: [],
        venues: [],
        userLocation: null,
        selectedVenues: [],
        activeEvent: null,
        participants: []
    };

    // Initialize enhanced group planning
    function initializeEnhancedGroupPlanning() {
        loadVenues();
        enhanceGroupPlanningInterface();
        setupIntegrations();
    }

    // Load venues
    function loadVenues() {
        state.venues = [
            {
                id: 'venue1',
                name: 'Sky Lounge',
                type: 'Rooftop Bar',
                category: 'bar',
                rating: 4.8,
                priceLevel: 3,
                distance: 0.8,
                image: '/assets/img/placeholder-venue.svg',
                features: ['Outdoor Seating', 'Rooftop', 'Live Music', 'Happy Hour']
            },
            {
                id: 'venue2',
                name: 'Blue Note Jazz Club',
                type: 'Jazz Club',
                category: 'restaurant',
                rating: 4.9,
                priceLevel: 4,
                distance: 1.2,
                image: '/assets/img/placeholder-venue.svg',
                features: ['Live Music', 'Fine Dining', 'Full Bar', 'Reservations']
            },
            {
                id: 'venue3',
                name: 'The Underground Club',
                type: 'Nightclub',
                category: 'nightlife',
                rating: 4.6,
                priceLevel: 2,
                distance: 0.5,
                image: '/assets/img/placeholder-venue.svg',
                features: ['Dancing', 'DJ', 'VIP Areas', 'Multiple Bars']
            },
            {
                id: 'venue4',
                name: 'Pizzeria Uno',
                type: 'Italian Restaurant',
                category: 'restaurant',
                rating: 4.5,
                priceLevel: 2,
                distance: 0.3,
                image: '/assets/img/placeholder-venue.svg',
                features: ['Family Friendly', 'Outdoor Seating', 'Full Bar', 'Takeout']
            },
            {
                id: 'venue5',
                name: 'The Garden Bistro',
                type: 'Farm-to-Table Restaurant',
                category: 'restaurant',
                rating: 4.7,
                priceLevel: 4,
                distance: 1.5,
                image: '/assets/img/placeholder-venue.svg',
                features: ['Farm-to-Table', 'Outdoor Seating', 'Wine Bar', 'Seasonal Menu']
            }
        ];
    }

    // Enhance group planning interface
    function enhanceGroupPlanningInterface() {
        addVenueDiscoverySection();
        addSocialIntegrationSection();
        enhanceVotingSystem();
        addCalendarIntegration();
    }

    // Add venue discovery section
    function addVenueDiscoverySection() {
        const planningMain = document.querySelector('.planning-main');
        if (!planningMain) return;

        const venueSection = document.createElement('section');
        venueSection.className = 'venue-discovery-section';
        venueSection.innerHTML = `
            <div class="section-header-inline">
                <h2>
                    <i class="fas fa-search"></i>
                    Discover Venues
                </h2>
                <div class="venue-discovery-actions">
                    <button class="btn-filter" onclick="showVenueFilters()">
                        <i class="fas fa-filter"></i> Filters
                    </button>
                    <button class="btn-map-view" onclick="showVenueMap()">
                        <i class="fas fa-map"></i> Map View
                    </button>
                </div>
            </div>
            
            <div class="venue-discovery-filters" id="venueDiscoveryFilters" style="display: none;">
                <div class="filter-row">
                    <select id="venueTypeFilter" onchange="filterVenues()">
                        <option value="all">All Types</option>
                        <option value="restaurant">Restaurants</option>
                        <option value="bar">Bars</option>
                        <option value="nightlife">Nightlife</option>
                    </select>
                    
                    <select id="venuePriceFilter" onchange="filterVenues()">
                        <option value="all">All Prices</option>
                        <option value="1">$</option>
                        <option value="2">$$</option>
                        <option value="3">$$$</option>
                        <option value="4">$$$$</option>
                    </select>
                    
                    <select id="venueRatingFilter" onchange="filterVenues()">
                        <option value="all">All Ratings</option>
                        <option value="4.5">4.5+ Stars</option>
                        <option value="4">4+ Stars</option>
                        <option value="3.5">3.5+ Stars</option>
                    </select>
                </div>
            </div>
            
            <div class="venues-grid" id="venuesGrid">
                ${renderVenueCards()}
            </div>
        `;
        
        const eventsGrid = planningMain.querySelector('.events-grid');
        if (eventsGrid) {
            planningMain.insertBefore(venueSection, eventsGrid);
        } else {
            planningMain.appendChild(venueSection);
        }

        // Add styles
        addVenueDiscoveryStyles();
    }

    // Render venue cards
    function renderVenueCards(venues = state.venues) {
        if (!venues || venues.length === 0) {
            return '<p class="no-venues">No venues found. Try adjusting your filters.</p>';
        }
        
        return venues.map(venue => `
            <div class="discovered-venue-card" data-venue-id="${venue.id}">
                <div class="venue-image">
                    <img src="${venue.image}" alt="${venue.name}">
                    <button class="add-to-voting" onclick="addVenueToVoting('${venue.id}')">
                        <i class="fas fa-plus"></i>
                        Add to Voting
                    </button>
                </div>
                
                <div class="venue-info">
                    <h4>${venue.name}</h4>
                    <div class="venue-meta">
                        <div class="rating">
                            <i class="fas fa-star"></i> ${venue.rating}
                        </div>
                        <div class="price">
                            ${'$'.repeat(venue.priceLevel)}
                        </div>
                        <div class="distance">
                            <i class="fas fa-map-marker-alt"></i> ${venue.distance} mi
                        </div>
                    </div>
                    
                    <div class="venue-features">
                        ${venue.features.slice(0, 3).map(f => `<span class="feature-tag">${f}</span>`).join('')}
                    </div>
                </div>
            </div>
        `).join('');
    }

    // Add venue discovery styles
    function addVenueDiscoveryStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .venue-discovery-section {
                background: linear-gradient(135deg, rgba(26, 26, 26, 0.95) 0%, rgba(20, 20, 20, 0.95) 100%);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 16px;
                padding: 24px;
                margin-bottom: 24px;
            }
            
            .venue-discovery-actions {
                display: flex;
                gap: 12px;
            }
            
            .btn-filter, .btn-map-view {
                padding: 8px 16px;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 8px;
                color: #ffffff;
                cursor: pointer;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 0.9rem;
            }
            
            .btn-filter:hover, .btn-map-view:hover {
                background: rgba(212, 175, 55, 0.1);
                border-color: #D4AF37;
            }
            
            .venue-discovery-filters {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 20px;
            }
            
            .filter-row {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 16px;
                margin-bottom: 16px;
            }
            
            .filter-row select {
                width: 100%;
                padding: 10px;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 8px;
                color: #ffffff;
                font-size: 0.95rem;
            }
            
            .venues-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                gap: 20px;
            }
            
            .discovered-venue-card {
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                overflow: hidden;
                transition: all 0.3s ease;
            }
            
            .discovered-venue-card:hover {
                transform: translateY(-4px);
                border-color: rgba(212, 175, 55, 0.3);
            }
            
            .venue-image {
                position: relative;
                height: 160px;
                overflow: hidden;
            }
            
            .venue-image img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            
            .add-to-voting {
                position: absolute;
                top: 12px;
                right: 12px;
                padding: 8px 12px;
                background: linear-gradient(135deg, #D4AF37 0%, #E5C158 100%);
                color: #0a0a0a;
                border: none;
                border-radius: 6px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                font-size: 0.85rem;
            }
            
            .add-to-voting:hover {
                transform: scale(1.05);
            }
            
            .venue-info {
                padding: 16px;
            }
            
            .venue-info h4 {
                font-size: 1.1rem;
                font-weight: 700;
                color: #ffffff;
                margin-bottom: 12px;
            }
            
            .venue-meta {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
                font-size: 0.9rem;
            }
            
            .rating {
                color: #D4AF37;
                display: flex;
                align-items: center;
                gap: 4px;
            }
            
            .price {
                color: #D4AF37;
                font-weight: 600;
            }
            
            .distance {
                color: #b0b0b0;
                display: flex;
                align-items: center;
                gap: 4px;
            }
            
            .feature-tag {
                background: rgba(212, 175, 55, 0.2);
                color: #D4AF37;
                padding: 4px 8px;
                border-radius: 12px;
                font-size: 0.75rem;
                font-weight: 600;
                margin-right: 6px;
                margin-bottom: 4px;
                display: inline-block;
            }
            
            .no-venues {
                text-align: center;
                color: #b0b0b0;
                padding: 40px;
                font-style: italic;
            }
            
            @media (max-width: 768px) {
                .venues-grid {
                    grid-template-columns: 1fr;
                }
                
                .filter-row {
                    grid-template-columns: 1fr;
                }
                
                .venue-discovery-actions {
                    flex-direction: column;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Show venue filters
    window.showVenueFilters = function() {
        const filters = document.getElementById('venueDiscoveryFilters');
        filters.style.display = filters.style.display === 'none' ? 'block' : 'none';
    };

    // Show venue map
    window.showVenueMap = function() {
        showNotification('Map view coming soon!', 'info');
    };

    // Filter venues
    window.filterVenues = function() {
        const typeFilter = document.getElementById('venueTypeFilter').value;
        const priceFilter = document.getElementById('venuePriceFilter').value;
        const ratingFilter = document.getElementById('venueRatingFilter').value;
        
        let filteredVenues = state.venues.filter(venue => {
            let matches = true;
            
            if (typeFilter !== 'all' && venue.category !== typeFilter) {
                matches = false;
            }
            
            if (priceFilter !== 'all' && venue.priceLevel !== parseInt(priceFilter)) {
                matches = false;
            }
            
            if (ratingFilter !== 'all' && venue.rating < parseFloat(ratingFilter)) {
                matches = false;
            }
            
            return matches;
        });
        
        const venuesGrid = document.getElementById('venuesGrid');
        if (venuesGrid) {
            venuesGrid.innerHTML = renderVenueCards(filteredVenues);
        }
    };

    // Add venue to voting
    window.addVenueToVoting = function(venueId) {
        const venue = state.venues.find(v => v.id === venueId);
        if (!venue) return;
        
        // Add to first active event's voting options
        const activeEvents = document.querySelectorAll('.event-card.active-planning');
        if (activeEvents.length > 0) {
            const firstEvent = activeEvents[0];
            const votingOptions = firstEvent.querySelector('.voting-options');
            
            // Create new voting option
            const newOption = document.createElement('div');
            newOption.className = 'voting-option';
            newOption.innerHTML = `
                <div class="voting-option-header">
                    <span class="voting-option-name">${venue.name}</span>
                    <span class="voting-option-votes">
                        <i class="fas fa-check-circle"></i> 0
                    </span>
                </div>
                <div class="voting-option-details">
                    <span class="voting-option-detail">
                        <i class="fas fa-utensils"></i> ${venue.type}
                    </span>
                    <span class="voting-option-detail">
                        <i class="fas fa-star"></i> ${venue.rating}
                    </span>
                    <span class="voting-option-detail">
                        <i class="fas fa-dollar-sign"></i> ${'$'.repeat(venue.priceLevel)}
                    </span>
                    <span class="voting-option-detail">
                        <i class="fas fa-map-marker-alt"></i> ${venue.distance} miles
                    </span>
                </div>
                <div class="voting-progress">
                    <div class="voting-progress-bar" style="width: 0%"></div>
                </div>
                <button class="vote-btn" onclick="handleVote(event, '${venue.id}')">
                    Vote
                </button>
            `;
            
            votingOptions.appendChild(newOption);
            
            showNotification(`${venue.name} added to voting!`, 'success');
            
            // Scroll to the event card
            firstEvent.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstEvent.classList.add('highlight-pulse');
            setTimeout(() => firstEvent.classList.remove('highlight-pulse'), 2000);
        } else {
            showNotification('Create an event first to add venues to voting!', 'warning');
        }
    };

    // Handle vote
    window.handleVote = function(event, venueId) {
        const btn = event.target;
        const votingOption = btn.closest('.voting-option');
        const votesCount = votingOption.querySelector('.voting-option-votes');
        const currentVotes = parseInt(votesCount.textContent.trim().match(/\d+/)[0]);
        
        if (btn.classList.contains('voted')) {
            btn.classList.remove('voted');
            btn.textContent = 'Vote';
            votesCount.innerHTML = `<i class="fas fa-check-circle"></i> ${currentVotes - 1}`;
        } else {
            btn.classList.add('voted');
            btn.textContent = '✓ Voted';
            votesCount.innerHTML = `<i class="fas fa-check-circle"></i> ${currentVotes + 1}`;
        }
    };

    // Add social integration section
    function addSocialIntegrationSection() {
        const planningSidebar = document.querySelector('.planning-sidebar');
        if (!planningSidebar) return;

        const socialSection = document.createElement('div');
        socialSection.className = 'sidebar-widget social-integration';
        socialSection.innerHTML = `
            <h3><i class="fas fa-users"></i> Social Integration</h3>
            
            <div class="social-options">
                <button class="social-btn" onclick="shareToSocialFeed()">
                    <i class="fas fa-rss"></i>
                    Share to Social Feed
                </button>
                
                <button class="social-btn" onclick="inviteFromFriends()">
                    <i class="fas fa-user-plus"></i>
                    Invite from Friends
                </button>
                
                <button class="social-btn" onclick="checkFriendAvailability()">
                    <i class="fas fa-calendar-check"></i>
                    Check Availability
                </button>
                
                <button class="social-btn" onclick="createPoll()">
                    <i class="fas fa-poll"></i>
                    Create Quick Poll
                </button>
            </div>
            
            <div class="recent-social-activity">
                <h4>Recent Activity</h4>
                <div class="activity-list">
                    <div class="activity-item">
                        <img src="https://ui-avatars.com/api/?name=Sarah&size=40&background=D4AF37&color=0a0a0a" alt="Sarah">
                        <div class="activity-content">
                            <strong>Sarah</strong> voted for Sky Lounge
                            <span class="activity-time">2 min ago</span>
                        </div>
                    </div>
                    <div class="activity-item">
                        <img src="https://ui-avatars.com/api/?name=Mike&size=40&background=D4AF37&color=0a0a0a" alt="Mike">
                        <div class="activity-content">
                            <strong>Mike</strong> invited 3 friends
                            <span class="activity-time">15 min ago</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        planningSidebar.insertBefore(socialSection, planningSidebar.firstChild);
    }

    // Social integration functions
    window.shareToSocialFeed = function() {
        showNotification('Shared to social feed!', 'success');
    };

    window.inviteFromFriends = function() {
        showNotification('Friend invite sent!', 'success');
    };

    window.checkFriendAvailability = function() {
        showNotification('Checking friend availability...', 'info');
    };

    window.createPoll = function() {
        showNotification('Quick poll created!', 'success');
    };

    // Add calendar integration
    function addCalendarIntegration() {
        // Add calendar export buttons to events
        const eventCards = document.querySelectorAll('.event-card');
        eventCards.forEach(card => {
            const actions = card.querySelector('.event-actions');
            if (actions) {
                const calendarBtn = document.createElement('button');
                calendarBtn.className = 'event-action-btn calendar-btn';
                calendarBtn.innerHTML = `
                    <i class="fas fa-calendar-plus"></i>
                    Add to Calendar
                `;
                calendarBtn.onclick = () => addToCalendar(card);
                actions.appendChild(calendarBtn);
            }
        });
    }

    // Add to calendar
    window.addToCalendar = function(eventCard) {
        const title = eventCard.querySelector('h3')?.textContent || 'Event';
        const date = eventCard.querySelector('.event-date')?.textContent || '';
        
        // Create Google Calendar link
        const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=20241125T200000Z/20241125T230000Z&details=${encodeURIComponent('Group event via SceneLink')}`;
        
        window.open(calendarUrl, '_blank');
        showNotification('Calendar event created!', 'success');
    };

    // Setup integrations
    function setupIntegrations() {
        // Add social integration styles
        const socialStyle = document.createElement('style');
        socialStyle.textContent = `
            .social-integration {
                border-color: rgba(59, 130, 246, 0.3) !important;
            }
            
            .social-options {
                display: flex;
                flex-direction: column;
                gap: 8px;
                margin-bottom: 20px;
            }
            
            .social-btn {
                width: 100%;
                padding: 12px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                color: #ffffff;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 0.9rem;
            }
            
            .social-btn:hover {
                background: rgba(212, 175, 55, 0.1);
                border-color: #D4AF37;
            }
            
            .recent-social-activity h4 {
                font-size: 1rem;
                color: #ffffff;
                margin-bottom: 12px;
            }
            
            .activity-list {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            
            .activity-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 8px;
                background: rgba(255, 255, 255, 0.03);
                border-radius: 8px;
            }
            
            .activity-item img {
                width: 32px;
                height: 32px;
                border-radius: 50%;
            }
            
            .activity-content {
                flex: 1;
            }
            
            .activity-content strong {
                color: #ffffff;
                display: block;
                margin-bottom: 2px;
            }
            
            .activity-time {
                font-size: 0.8rem;
                color: #808080;
            }
            
            .calendar-btn {
                background: rgba(16, 185, 129, 0.1) !important;
                border-color: rgba(16, 185, 129, 0.3) !important;
                color: #34d399 !important;
            }
            
            .calendar-btn:hover {
                background: rgba(16, 185, 129, 0.2) !important;
                border-color: #34d399 !important;
            }
            
            .highlight-pulse {
                animation: highlightPulse 2s ease;
            }
            
            @keyframes highlightPulse {
                0%, 100% { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                50% { box-shadow: 0 8px 24px rgba(212,175,55,0.4); }
            }
        `;
        document.head.appendChild(socialStyle);
    }

    // Show notification
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        Object.assign(notification.style, {
            position: 'fixed',
            top: '80px',
            right: '20px',
            padding: '16px 24px',
            borderRadius: '8px',
            color: 'white',
            fontWeight: '600',
            zIndex: '10000',
            animation: 'slideInRight 0.3s ease',
            background: type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : '#3b82f6'
        });
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeEnhancedGroupPlanning);
    } else {
        initializeEnhancedGroupPlanning();
    }

})();
