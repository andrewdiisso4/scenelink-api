/**
 * Nightlife Page Enhanced JavaScript
 * Provides venue filtering, social features, and booking functionality
 */

(function() {
    'use strict';

    // State management
    const state = {
        venues: [],
        filteredVenues: [],
        activeFilters: {
            types: [],
            musicGenres: [],
            priceRange: 'all',
            features: []
        },
        savedVenues: JSON.parse(localStorage.getItem('savedNightlifeVenues') || '[]'),
        friendsGoing: JSON.parse(localStorage.getItem('friendsGoingTonight') || '{}')
    };

    // Mock venues data
    const mockVenues = [
        {
            id: 'nv1',
            name: 'The Underground Club',
            type: 'Club',
            image: '/assets/img/placeholder-venue.svg',
            rating: 4.5,
            reviews: 234,
            address: '123 Main St, Downtown',
            hours: '9:00 PM - 3:00 AM',
            coverCharge: 20,
            dressCode: 'Smart Casual',
            musicGenres: ['Electronic', 'House', 'Techno'],
            features: ['Dance Floor', 'VIP Section', 'Bottle Service', 'Outdoor Patio'],
            description: 'Premier nightclub featuring world-class DJs and an energetic atmosphere.',
            capacity: 500,
            currentAttendance: 320,
            friendsGoing: ['Sarah', 'Mike', 'Alex'],
            peakHours: '11 PM - 1 AM',
            ageRestriction: '21+'
        },
        {
            id: 'nv2',
            name: 'Jazz Lounge',
            type: 'Lounge',
            image: '/assets/img/placeholder-venue.svg',
            rating: 4.8,
            reviews: 189,
            address: '456 Oak Ave, South End',
            hours: '7:00 PM - 2:00 AM',
            coverCharge: 0,
            dressCode: 'Business Casual',
            musicGenres: ['Jazz', 'Blues', 'Soul'],
            features: ['Live Music', 'Craft Cocktails', 'Intimate Setting', 'Reservations'],
            description: 'Sophisticated lounge with live jazz performances and premium cocktails.',
            capacity: 150,
            currentAttendance: 95,
            friendsGoing: ['Emma'],
            peakHours: '9 PM - 11 PM',
            ageRestriction: '21+'
        },
        {
            id: 'nv3',
            name: 'Rooftop Bar & Lounge',
            type: 'Bar',
            image: '/assets/img/placeholder-venue.svg',
            rating: 4.6,
            reviews: 412,
            address: '789 High St, Seaport',
            hours: '5:00 PM - 1:00 AM',
            coverCharge: 15,
            dressCode: 'Upscale Casual',
            musicGenres: ['Top 40', 'Hip Hop', 'R&B'],
            features: ['Rooftop', 'City Views', 'Cocktails', 'Small Plates'],
            description: 'Stunning rooftop venue with panoramic city views and craft cocktails.',
            capacity: 200,
            currentAttendance: 145,
            friendsGoing: ['Chris', 'Taylor', 'Jordan'],
            peakHours: '8 PM - 10 PM',
            ageRestriction: '21+'
        },
        {
            id: 'nv4',
            name: 'Live Music Hall',
            type: 'Live Music',
            image: '/assets/img/placeholder-venue.svg',
            rating: 4.7,
            reviews: 567,
            address: '321 Music Blvd, Cambridge',
            hours: '8:00 PM - 2:00 AM',
            coverCharge: 25,
            dressCode: 'Casual',
            musicGenres: ['Rock', 'Indie', 'Alternative'],
            features: ['Live Bands', 'Full Bar', 'Dance Floor', 'Merch'],
            description: 'Iconic venue hosting local and touring bands in an intimate setting.',
            capacity: 400,
            currentAttendance: 280,
            friendsGoing: ['David', 'Ryan'],
            peakHours: '10 PM - 12 AM',
            ageRestriction: '18+'
        },
        {
            id: 'nv5',
            name: 'Speakeasy Bar',
            type: 'Bar',
            image: '/assets/img/placeholder-venue.svg',
            rating: 4.9,
            reviews: 298,
            address: '555 Hidden Ln, Back Bay',
            hours: '6:00 PM - 1:00 AM',
            coverCharge: 0,
            dressCode: 'Smart Casual',
            musicGenres: ['Jazz', 'Swing', 'Vintage'],
            features: ['Craft Cocktails', 'Hidden Entrance', 'Intimate', 'Reservations Required'],
            description: 'Secret speakeasy with expertly crafted cocktails and vintage ambiance.',
            capacity: 80,
            currentAttendance: 72,
            friendsGoing: ['Lisa', 'Mark'],
            peakHours: '9 PM - 11 PM',
            ageRestriction: '21+'
        },
        {
            id: 'nv6',
            name: 'Dance Club Mega',
            type: 'Club',
            image: '/assets/img/placeholder-venue.svg',
            rating: 4.4,
            reviews: 678,
            address: '888 Party St, Theater District',
            hours: '10:00 PM - 4:00 AM',
            coverCharge: 30,
            dressCode: 'Dress to Impress',
            musicGenres: ['EDM', 'Hip Hop', 'Top 40'],
            features: ['Multiple Floors', 'VIP Tables', 'Bottle Service', 'Light Show'],
            description: 'Massive multi-level nightclub with state-of-the-art sound and lighting.',
            capacity: 800,
            currentAttendance: 520,
            friendsGoing: ['Nicole', 'Brandon', 'Ashley'],
            peakHours: '12 AM - 2 AM',
            ageRestriction: '21+'
        }
    ];

    // Initialize
    function init() {
        state.venues = mockVenues;
        state.filteredVenues = [...mockVenues];
        
        renderVenuesList();
        setupEventListeners();
        setupScrollAnimations();
        updateResultsCount();
    }

    // Render venues list
    function renderVenuesList() {
        const venuesContainer = document.getElementById('nightlifeVenuesContainer');
        if (!venuesContainer) return;

        if (state.filteredVenues.length === 0) {
            venuesContainer.innerHTML = `
                <div class="no-venues">
                    <i class="fas fa-moon"></i>
                    <h3>No Venues Found</h3>
                    <p>Try adjusting your filters to see more options.</p>
                </div>
            `;
            return;
        }

        venuesContainer.innerHTML = state.filteredVenues.map(venue => createVenueCard(venue)).join('');
        attachVenueCardListeners();
    }

    // Create venue card HTML
    function createVenueCard(venue) {
        const isSaved = state.savedVenues.includes(venue.id);
        const attendancePercentage = (venue.currentAttendance / venue.capacity) * 100;
        const crowdLevel = attendancePercentage > 80 ? 'Very Busy' : 
                          attendancePercentage > 60 ? 'Busy' : 
                          attendancePercentage > 40 ? 'Moderate' : 'Quiet';
        
        return `
            <div class="nightlife-venue-card" data-venue-id="${venue.id}">
                <div class="venue-image">
                    <img src="${venue.image}" alt="${venue.name}">
                    <div class="venue-type-badge">${venue.type}</div>
                    ${venue.friendsGoing.length > 0 ? `
                        <div class="friends-going-badge">
                            <i class="fas fa-user-friends"></i>
                            ${venue.friendsGoing.length} friend${venue.friendsGoing.length > 1 ? 's' : ''} going tonight
                        </div>
                    ` : ''}
                    <button class="venue-save-btn ${isSaved ? 'saved' : ''}" data-venue-id="${venue.id}">
                        <i class="fas fa-bookmark"></i>
                    </button>
                </div>
                <div class="venue-content">
                    <div class="venue-header">
                        <h3 class="venue-name">${venue.name}</h3>
                        <div class="venue-rating">
                            <i class="fas fa-star"></i>
                            <span>${venue.rating}</span>
                            <span class="review-count">(${venue.reviews})</span>
                        </div>
                    </div>
                    <div class="venue-info-row">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${venue.address}</span>
                    </div>
                    <div class="venue-info-row">
                        <i class="fas fa-clock"></i>
                        <span>${venue.hours}</span>
                    </div>
                    <div class="venue-info-row">
                        <i class="fas fa-ticket-alt"></i>
                        <span>${venue.coverCharge === 0 ? 'No Cover' : `$${venue.coverCharge} Cover`}</span>
                    </div>
                    <div class="venue-info-row">
                        <i class="fas fa-tshirt"></i>
                        <span>${venue.dressCode}</span>
                    </div>
                    <div class="venue-music-genres">
                        ${venue.musicGenres.map(genre => `<span class="genre-tag">${genre}</span>`).join('')}
                    </div>
                    <p class="venue-description">${venue.description}</p>
                    <div class="venue-features">
                        ${venue.features.slice(0, 3).map(feature => `
                            <span class="feature-tag">
                                <i class="fas fa-check"></i>
                                ${feature}
                            </span>
                        `).join('')}
                        ${venue.features.length > 3 ? `<span class="feature-tag">+${venue.features.length - 3} more</span>` : ''}
                    </div>
                    <div class="venue-crowd-meter">
                        <div class="crowd-meter-header">
                            <span class="crowd-label">Crowd Level</span>
                            <span class="crowd-level ${crowdLevel.toLowerCase().replace(' ', '-')}">${crowdLevel}</span>
                        </div>
                        <div class="crowd-meter-bar">
                            <div class="crowd-meter-fill" style="width: ${attendancePercentage}%"></div>
                        </div>
                        <div class="crowd-meter-info">
                            <span>${venue.currentAttendance} / ${venue.capacity} people</span>
                            <span class="peak-hours">Peak: ${venue.peakHours}</span>
                        </div>
                    </div>
                    ${venue.friendsGoing.length > 0 ? `
                        <div class="friends-going-list">
                            <strong>Friends going tonight:</strong>
                            <div class="friend-avatars">
                                ${venue.friendsGoing.map(friend => `
                                    <div class="friend-avatar" title="${friend}">
                                        ${friend.charAt(0)}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    <div class="venue-actions">
                        <button class="btn-details" data-venue-id="${venue.id}">
                            <i class="fas fa-info-circle"></i>
                            Details
                        </button>
                        <button class="btn-book-table" data-venue-id="${venue.id}">
                            <i class="fas fa-calendar-check"></i>
                            Book Table
                        </button>
                        <button class="btn-directions" data-venue-id="${venue.id}">
                            <i class="fas fa-directions"></i>
                            Directions
                        </button>
                        <button class="btn-share" data-venue-id="${venue.id}">
                            <i class="fas fa-share-alt"></i>
                            Share
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // Attach venue card listeners
    function attachVenueCardListeners() {
        // Save buttons
        document.querySelectorAll('.venue-save-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const venueId = btn.dataset.venueId;
                toggleSaveVenue(venueId);
            });
        });

        // Details buttons
        document.querySelectorAll('.btn-details').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const venueId = btn.dataset.venueId;
                showVenueDetails(venueId);
            });
        });

        // Book table buttons
        document.querySelectorAll('.btn-book-table').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const venueId = btn.dataset.venueId;
                showBookingModal(venueId);
            });
        });

        // Directions buttons
        document.querySelectorAll('.btn-directions').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const venueId = btn.dataset.venueId;
                getDirections(venueId);
            });
        });

        // Share buttons
        document.querySelectorAll('.btn-share').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const venueId = btn.dataset.venueId;
                shareVenue(venueId);
            });
        });
    }

    // Toggle save venue
    function toggleSaveVenue(venueId) {
        const index = state.savedVenues.indexOf(venueId);
        if (index > -1) {
            state.savedVenues.splice(index, 1);
            showNotification('Venue removed from saved', 'info');
        } else {
            state.savedVenues.push(venueId);
            showNotification('Venue saved!', 'success');
        }
        localStorage.setItem('savedNightlifeVenues', JSON.stringify(state.savedVenues));
        renderVenuesList();
    }

    // Show venue details modal
    function showVenueDetails(venueId) {
        const venue = state.venues.find(v => v.id === venueId);
        if (!venue) return;

        const modal = document.getElementById('venueDetailsModal');
        if (!modal) return;

        const isSaved = state.savedVenues.includes(venue.id);
        
        modal.innerHTML = `
            <div class="modal-content venue-details-content">
                <button class="modal-close" onclick="this.closest('.modal').style.display='none'">
                    <i class="fas fa-times"></i>
                </button>
                <div class="venue-details-image">
                    <img src="${venue.image}" alt="${venue.name}">
                    <div class="venue-type-badge">${venue.type}</div>
                </div>
                <div class="venue-details-body">
                    <div class="venue-details-header">
                        <div>
                            <h2>${venue.name}</h2>
                            <div class="venue-rating-large">
                                <i class="fas fa-star"></i>
                                <span>${venue.rating}</span>
                                <span class="review-count">(${venue.reviews} reviews)</span>
                            </div>
                        </div>
                        <button class="venue-save-btn-large ${isSaved ? 'saved' : ''}" onclick="window.nightlifePageEnhanced.toggleSaveVenue('${venue.id}')">
                            <i class="fas fa-bookmark"></i>
                            ${isSaved ? 'Saved' : 'Save'}
                        </button>
                    </div>
                    
                    <div class="venue-detail-section">
                        <h3><i class="fas fa-info-circle"></i> About</h3>
                        <p>${venue.description}</p>
                    </div>

                    <div class="venue-detail-section">
                        <h3><i class="fas fa-map-marker-alt"></i> Location & Hours</h3>
                        <p><strong>Address:</strong> ${venue.address}</p>
                        <p><strong>Hours:</strong> ${venue.hours}</p>
                        <p><strong>Peak Hours:</strong> ${venue.peakHours}</p>
                    </div>

                    <div class="venue-detail-section">
                        <h3><i class="fas fa-music"></i> Music</h3>
                        <div class="music-genres-list">
                            ${venue.musicGenres.map(genre => `<span class="genre-tag-large">${genre}</span>`).join('')}
                        </div>
                    </div>

                    <div class="venue-detail-section">
                        <h3><i class="fas fa-ticket-alt"></i> Entry & Dress Code</h3>
                        <p><strong>Cover Charge:</strong> ${venue.coverCharge === 0 ? 'No Cover' : `$${venue.coverCharge}`}</p>
                        <p><strong>Dress Code:</strong> ${venue.dressCode}</p>
                        <p><strong>Age Restriction:</strong> ${venue.ageRestriction}</p>
                    </div>

                    <div class="venue-detail-section">
                        <h3><i class="fas fa-check-circle"></i> Features & Amenities</h3>
                        <div class="features-grid">
                            ${venue.features.map(feature => `
                                <div class="feature-item">
                                    <i class="fas fa-check"></i>
                                    <span>${feature}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    ${venue.friendsGoing.length > 0 ? `
                        <div class="venue-detail-section">
                            <h3><i class="fas fa-user-friends"></i> Friends Going Tonight</h3>
                            <div class="friends-going-detail">
                                ${venue.friendsGoing.map(friend => `
                                    <div class="friend-item">
                                        <div class="friend-avatar-large">${friend.charAt(0)}</div>
                                        <span>${friend}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <div class="venue-modal-actions">
                        <button class="btn-primary" onclick="window.nightlifePageEnhanced.showBookingModal('${venue.id}')">
                            <i class="fas fa-calendar-check"></i>
                            Book a Table
                        </button>
                        <button class="btn-secondary" onclick="window.nightlifePageEnhanced.getDirections('${venue.id}')">
                            <i class="fas fa-directions"></i>
                            Get Directions
                        </button>
                        <button class="btn-secondary" onclick="window.nightlifePageEnhanced.shareVenue('${venue.id}')">
                            <i class="fas fa-share-alt"></i>
                            Share
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        modal.style.display = 'flex';
    }

    // Show booking modal
    function showBookingModal(venueId) {
        const venue = state.venues.find(v => v.id === venueId);
        if (!venue) return;

        showNotification('Table booking feature coming soon!', 'info');
        // In production, this would open a booking modal or redirect to booking page
    }

    // Get directions
    function getDirections(venueId) {
        const venue = state.venues.find(v => v.id === venueId);
        if (!venue) return;

        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.address)}`;
        window.open(mapsUrl, '_blank');
    }

    // Share venue
    function shareVenue(venueId) {
        const venue = state.venues.find(v => v.id === venueId);
        if (!venue) return;

        const shareData = {
            title: venue.name,
            text: `Check out ${venue.name} - ${venue.description}`,
            url: window.location.href + '?venue=' + venueId
        };

        if (navigator.share) {
            navigator.share(shareData)
                .then(() => showNotification('Venue shared!', 'success'))
                .catch(() => copyToClipboard(shareData.url));
        } else {
            copyToClipboard(shareData.url);
        }
    }

    // Filter venues
    function filterVenues() {
        let filtered = [...state.venues];

        // Filter by type
        if (state.activeFilters.types.length > 0) {
            filtered = filtered.filter(venue => 
                state.activeFilters.types.includes(venue.type)
            );
        }

        // Filter by music genre
        if (state.activeFilters.musicGenres.length > 0) {
            filtered = filtered.filter(venue =>
                venue.musicGenres.some(genre => 
                    state.activeFilters.musicGenres.includes(genre)
                )
            );
        }

        // Filter by price
        if (state.activeFilters.priceRange === 'free') {
            filtered = filtered.filter(venue => venue.coverCharge === 0);
        } else if (state.activeFilters.priceRange === 'under20') {
            filtered = filtered.filter(venue => venue.coverCharge < 20);
        } else if (state.activeFilters.priceRange === 'under30') {
            filtered = filtered.filter(venue => venue.coverCharge < 30);
        }

        // Filter by features
        if (state.activeFilters.features.length > 0) {
            filtered = filtered.filter(venue =>
                state.activeFilters.features.every(feature =>
                    venue.features.includes(feature)
                )
            );
        }

        state.filteredVenues = filtered;
        renderVenuesList();
        updateResultsCount();
    }

    // Update results count
    function updateResultsCount() {
        const countElement = document.getElementById('nightlifeCount');
        if (countElement) {
            countElement.textContent = `${state.filteredVenues.length} venue${state.filteredVenues.length !== 1 ? 's' : ''} found`;
        }
    }

    // Setup event listeners
    function setupEventListeners() {
        // Venue type filters
        document.querySelectorAll('.venue-type-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;
                
                if (type === 'all') {
                    state.activeFilters.types = [];
                    document.querySelectorAll('.venue-type-filter').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                } else {
                    document.querySelector('.venue-type-filter[data-type="all"]')?.classList.remove('active');
                    
                    const index = state.activeFilters.types.indexOf(type);
                    if (index > -1) {
                        state.activeFilters.types.splice(index, 1);
                        btn.classList.remove('active');
                    } else {
                        state.activeFilters.types.push(type);
                        btn.classList.add('active');
                    }
                }
                
                filterVenues();
            });
        });

        // Music genre filters
        document.querySelectorAll('.music-genre-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                const genre = btn.dataset.genre;
                
                if (genre === 'all') {
                    state.activeFilters.musicGenres = [];
                    document.querySelectorAll('.music-genre-filter').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                } else {
                    document.querySelector('.music-genre-filter[data-genre="all"]')?.classList.remove('active');
                    
                    const index = state.activeFilters.musicGenres.indexOf(genre);
                    if (index > -1) {
                        state.activeFilters.musicGenres.splice(index, 1);
                        btn.classList.remove('active');
                    } else {
                        state.activeFilters.musicGenres.push(genre);
                        btn.classList.add('active');
                    }
                }
                
                filterVenues();
            });
        });

        // Price filters
        document.querySelectorAll('.price-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.price-filter').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.activeFilters.priceRange = btn.dataset.price;
                filterVenues();
            });
        });

        // Search
        const searchInput = document.getElementById('nightlifeSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                state.filteredVenues = state.venues.filter(venue =>
                    venue.name.toLowerCase().includes(query) ||
                    venue.address.toLowerCase().includes(query) ||
                    venue.description.toLowerCase().includes(query) ||
                    venue.musicGenres.some(genre => genre.toLowerCase().includes(query)) ||
                    venue.features.some(feature => feature.toLowerCase().includes(query))
                );
                renderVenuesList();
                updateResultsCount();
            });
        }
    }

    // Setup scroll animations
    function setupScrollAnimations() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-in');
                }
            });
        }, observerOptions);

        document.querySelectorAll('.nightlife-venue-card').forEach(card => {
            observer.observe(card);
        });
    }

    // Utility functions
    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            showNotification('Link copied to clipboard!', 'success');
        });
    }

    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Export functions for modal use
    window.nightlifePageEnhanced = {
        toggleSaveVenue,
        showBookingModal,
        getDirections,
        shareVenue
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();