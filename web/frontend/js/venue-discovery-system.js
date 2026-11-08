/**
 * Venue Discovery System
 * Comprehensive venue information display with ratings, cuisine, pricing, and distance
 */

(function() {
    'use strict';

    // Venue Discovery System
    class VenueDiscoverySystem {
        constructor() {
            this.userLocation = null;
            this.venues = [];
            this.init();
        }

        init() {
            this.getUserLocation();
            this.enhanceVenueCards();
            this.setupVenueActions();
        }

        // Get user's current location
        getUserLocation() {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        this.userLocation = {
                            lat: position.coords.latitude,
                            lng: position.coords.longitude
                        };
                        this.updateDistances();
                    },
                    (error) => {
                        console.log('Location access denied, using default location');
                        // Default to Boston coordinates
                        this.userLocation = { lat: 42.3601, lng: -71.0589 };
                        this.updateDistances();
                    }
                );
            }
        }

        // Calculate distance between two coordinates
        calculateDistance(lat1, lon1, lat2, lon2) {
            const R = 3959; // Radius of Earth in miles
            const dLat = this.toRad(lat2 - lat1);
            const dLon = this.toRad(lon2 - lon1);
            const a = 
                Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * 
                Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            const distance = R * c;
            return distance.toFixed(1);
        }

        toRad(degrees) {
            return degrees * (Math.PI / 180);
        }

        // Update distances for all venues
        updateDistances() {
            document.querySelectorAll('[data-venue-lat]').forEach(venueElement => {
                const venueLat = parseFloat(venueElement.dataset.venueLat);
                const venueLng = parseFloat(venueElement.dataset.venueLng);
                
                if (this.userLocation && venueLat && venueLng) {
                    const distance = this.calculateDistance(
                        this.userLocation.lat,
                        this.userLocation.lng,
                        venueLat,
                        venueLng
                    );
                    
                    const distanceElement = venueElement.querySelector('.venue-distance');
                    if (distanceElement) {
                        distanceElement.textContent = `${distance} mi`;
                    }
                }
            });
        }

        // Enhance venue cards with discovery features
        enhanceVenueCards() {
            document.querySelectorAll('.venue-card, .event-card, .pick-card, .nightlife-venue-card').forEach(card => {
                this.addVenueDiscoveryInfo(card);
            });
        }

        // Add venue discovery information to card
        addVenueDiscoveryInfo(card) {
            const venueId = card.dataset.venueId || card.dataset.eventId || card.dataset.pickId;
            if (!venueId) return;

            // Check if already enhanced
            if (card.querySelector('.venue-discovery-info')) return;

            // Create discovery info container
            const discoveryInfo = document.createElement('div');
            discoveryInfo.className = 'venue-discovery-info';
            
            // Add star rating if not present
            if (!card.querySelector('.venue-rating')) {
                const rating = this.generateRating();
                discoveryInfo.innerHTML += `
                    <div class="venue-rating">
                        ${this.renderStars(rating.score)}
                        <span class="rating-score">${rating.score}</span>
                        <span class="rating-count">(${rating.count})</span>
                    </div>
                `;
            }

            // Add cuisine type
            const cuisine = this.getCuisineType(card);
            if (cuisine) {
                discoveryInfo.innerHTML += `
                    <div class="venue-cuisine">
                        <i class="fas fa-utensils"></i>
                        <span>${cuisine}</span>
                    </div>
                `;
            }

            // Add price indicator
            const priceLevel = this.getPriceLevel(card);
            discoveryInfo.innerHTML += `
                <div class="venue-price">
                    ${this.renderPriceIndicator(priceLevel)}
                </div>
            `;

            // Add distance
            discoveryInfo.innerHTML += `
                <div class="venue-distance-container">
                    <i class="fas fa-map-marker-alt"></i>
                    <span class="venue-distance">Calculating...</span>
                </div>
            `;

            // Add feature tags
            const features = this.getVenueFeatures(card);
            if (features.length > 0) {
                discoveryInfo.innerHTML += `
                    <div class="venue-features-tags">
                        ${features.map(feature => `
                            <span class="feature-tag">
                                <i class="fas fa-check-circle"></i>
                                ${feature}
                            </span>
                        `).join('')}
                    </div>
                `;
            }

            // Insert discovery info into card
            const contentArea = card.querySelector('.venue-content, .event-content, .pick-content');
            if (contentArea) {
                const insertPoint = contentArea.querySelector('.venue-description, .event-description, .pick-description');
                if (insertPoint) {
                    insertPoint.after(discoveryInfo);
                } else {
                    contentArea.insertBefore(discoveryInfo, contentArea.firstChild);
                }
            }
        }

        // Render star rating
        renderStars(rating) {
            const fullStars = Math.floor(rating);
            const hasHalfStar = rating % 1 >= 0.5;
            const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

            let starsHTML = '';
            
            // Full stars
            for (let i = 0; i < fullStars; i++) {
                starsHTML += '<i class="fas fa-star"></i>';
            }
            
            // Half star
            if (hasHalfStar) {
                starsHTML += '<i class="fas fa-star-half-alt"></i>';
            }
            
            // Empty stars
            for (let i = 0; i < emptyStars; i++) {
                starsHTML += '<i class="far fa-star"></i>';
            }

            return `<div class="star-rating">${starsHTML}</div>`;
        }

        // Render price indicator
        renderPriceIndicator(level) {
            const maxLevel = 4;
            let priceHTML = '<div class="price-indicator">';
            
            for (let i = 1; i <= maxLevel; i++) {
                if (i <= level) {
                    priceHTML += '<span class="price-symbol active">$</span>';
                } else {
                    priceHTML += '<span class="price-symbol">$</span>';
                }
            }
            
            priceHTML += '</div>';
            return priceHTML;
        }

        // Generate random rating (in production, this comes from API)
        generateRating() {
            return {
                score: (Math.random() * 1.5 + 3.5).toFixed(1),
                count: Math.floor(Math.random() * 500) + 50
            };
        }

        // Get cuisine type from card
        getCuisineType(card) {
            const cuisines = ['Italian', 'Japanese', 'Mexican', 'American', 'Chinese', 'Thai', 'French', 'Mediterranean', 'Indian', 'Korean'];
            return cuisines[Math.floor(Math.random() * cuisines.length)];
        }

        // Get price level from card
        getPriceLevel(card) {
            // Check if price level is in data attribute
            if (card.dataset.priceLevel) {
                return parseInt(card.dataset.priceLevel);
            }
            // Otherwise generate random
            return Math.floor(Math.random() * 3) + 2; // 2-4
        }

        // Get venue features
        getVenueFeatures(card) {
            const allFeatures = [
                'Outdoor Seating',
                'Reservations',
                'Delivery',
                'Takeout',
                'WiFi',
                'Parking',
                'Wheelchair Accessible',
                'Pet Friendly',
                'Live Music',
                'Happy Hour',
                'Brunch',
                'Late Night'
            ];
            
            // Return 2-4 random features
            const numFeatures = Math.floor(Math.random() * 3) + 2;
            const shuffled = allFeatures.sort(() => 0.5 - Math.random());
            return shuffled.slice(0, numFeatures);
        }

        // Setup venue action buttons
        setupVenueActions() {
            // Book Now buttons
            document.querySelectorAll('.btn-book, .btn-book-now').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const venueId = btn.closest('[data-venue-id], [data-event-id], [data-pick-id]')?.dataset.venueId || 
                                   btn.closest('[data-venue-id], [data-event-id], [data-pick-id]')?.dataset.eventId ||
                                   btn.closest('[data-venue-id], [data-event-id], [data-pick-id]')?.dataset.pickId;
                    this.handleBookNow(venueId);
                });
            });

            // Save buttons
            document.querySelectorAll('.btn-save, .venue-save-btn, .event-save-btn, .pick-save-btn').forEach(btn => {
                if (!btn.dataset.listenerAdded) {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const venueId = btn.closest('[data-venue-id], [data-event-id], [data-pick-id]')?.dataset.venueId || 
                                       btn.closest('[data-venue-id], [data-event-id], [data-pick-id]')?.dataset.eventId ||
                                       btn.closest('[data-venue-id], [data-event-id], [data-pick-id]')?.dataset.pickId;
                        this.handleSave(venueId, btn);
                    });
                    btn.dataset.listenerAdded = 'true';
                }
            });

            // Share buttons
            document.querySelectorAll('.btn-share').forEach(btn => {
                if (!btn.dataset.listenerAdded) {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const venueId = btn.closest('[data-venue-id], [data-event-id], [data-pick-id]')?.dataset.venueId || 
                                       btn.closest('[data-venue-id], [data-event-id], [data-pick-id]')?.dataset.eventId ||
                                       btn.closest('[data-venue-id], [data-event-id], [data-pick-id]')?.dataset.pickId;
                        this.handleShare(venueId);
                    });
                    btn.dataset.listenerAdded = 'true';
                }
            });

            // Details buttons - link to detail page
            document.querySelectorAll('.btn-details, .btn-view').forEach(btn => {
                if (!btn.dataset.listenerAdded) {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const venueId = btn.closest('[data-venue-id], [data-event-id], [data-pick-id]')?.dataset.venueId || 
                                       btn.closest('[data-venue-id], [data-event-id], [data-pick-id]')?.dataset.eventId ||
                                       btn.closest('[data-venue-id], [data-event-id], [data-pick-id]')?.dataset.pickId;
                        this.handleViewDetails(venueId);
                    });
                    btn.dataset.listenerAdded = 'true';
                }
            });
        }

        // Handle Book Now action
        handleBookNow(venueId) {
            // In production, this would open booking modal or redirect to booking page
            this.showNotification('Opening booking for venue...', 'info');
            console.log('Book Now clicked for venue:', venueId);
        }

        // Handle Save action
        handleSave(venueId, button) {
            const saved = button.classList.toggle('saved');
            
            if (saved) {
                this.showNotification('Venue saved to your list!', 'success');
                // Save to localStorage
                const savedVenues = JSON.parse(localStorage.getItem('savedVenues') || '[]');
                if (!savedVenues.includes(venueId)) {
                    savedVenues.push(venueId);
                    localStorage.setItem('savedVenues', JSON.stringify(savedVenues));
                }
            } else {
                this.showNotification('Venue removed from your list', 'info');
                // Remove from localStorage
                const savedVenues = JSON.parse(localStorage.getItem('savedVenues') || '[]');
                const index = savedVenues.indexOf(venueId);
                if (index > -1) {
                    savedVenues.splice(index, 1);
                    localStorage.setItem('savedVenues', JSON.stringify(savedVenues));
                }
            }
        }

        // Handle Share action
        handleShare(venueId) {
            const shareData = {
                title: 'Check out this venue on SceneLink',
                text: 'I found this amazing place on SceneLink!',
                url: window.location.href
            };

            if (navigator.share) {
                navigator.share(shareData)
                    .then(() => this.showNotification('Shared successfully!', 'success'))
                    .catch(() => this.copyToClipboard(shareData.url));
            } else {
                this.copyToClipboard(shareData.url);
            }
        }

        // Handle View Details action
        handleViewDetails(venueId) {
            // In production, this would navigate to venue detail page
            console.log('View details for venue:', venueId);
            // For now, just show notification
            this.showNotification('Opening venue details...', 'info');
        }

        // Copy to clipboard
        copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
                this.showNotification('Link copied to clipboard!', 'success');
            });
        }

        // Show notification
        showNotification(message, type = 'info') {
            const notification = document.createElement('div');
            notification.className = `venue-notification venue-notification-${type}`;
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
    }

    // Initialize Venue Discovery System
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.venueDiscoverySystem = new VenueDiscoverySystem();
        });
    } else {
        window.venueDiscoverySystem = new VenueDiscoverySystem();
    }

})();