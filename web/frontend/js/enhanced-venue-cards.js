// Enhanced Venue Card Components - Better Display and Interactions
class EnhancedVenueCards {
    constructor() {
        this.cardStyles = this.getCardStyles();
        this.animationQueue = [];
        this.isAnimating = false;
    }

    getCardStyles() {
        return `
            .enhanced-venue-card {
                background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
                border-radius: 16px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
                margin-bottom: 16px;
                overflow: hidden;
                transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                cursor: pointer;
                position: relative;
                animation: slideInUp 0.6s ease-out forwards;
                opacity: 0;
            }

            .enhanced-venue-card:hover {
                transform: translateY(-4px) scale(1.02);
                box-shadow: 0 16px 48px rgba(0, 0, 0, 0.15);
            }

            .enhanced-venue-card::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 4px;
                background: linear-gradient(90deg, #d4af37, #f4e4bc, #d4af37);
                transform: scaleX(0);
                transition: transform 0.3s ease;
            }

            .enhanced-venue-card:hover::before {
                transform: scaleX(1);
            }

            @keyframes slideInUp {
                from {
                    transform: translateY(30px);
                    opacity: 0;
                }
                to {
                    transform: translateY(0);
                    opacity: 1;
                }
            }

            .venue-card-image-container {
                position: relative;
                height: 200px;
                overflow: hidden;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }

            .venue-card-image {
                width: 100%;
                height: 100%;
                object-fit: cover;
                transition: transform 0.6s ease;
            }

            .enhanced-venue-card:hover .venue-card-image {
                transform: scale(1.1);
            }

            .venue-card-overlay {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.7) 100%);
                opacity: 0;
                transition: opacity 0.3s ease;
            }

            .enhanced-venue-card:hover .venue-card-overlay {
                opacity: 1;
            }

            .venue-card-quick-actions {
                position: absolute;
                top: 12px;
                right: 12px;
                display: flex;
                gap: 8px;
                z-index: 2;
            }

            .venue-quick-action {
                width: 36px;
                height: 36px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(10px);
                border: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s ease;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            }

            .venue-quick-action:hover {
                transform: scale(1.1);
                background: #d4af37;
                color: white;
            }

            .venue-quick-action.liked {
                background: #e74c3c;
                color: white;
            }

            .venue-card-content {
                padding: 20px;
            }

            .venue-card-header {
                display: flex;
                justify-content: space-between;
                align-items: start;
                margin-bottom: 12px;
            }

            .venue-card-name {
                font-size: 20px;
                font-weight: 700;
                color: #2c3e50;
                margin-bottom: 4px;
                line-height: 1.2;
            }

            .venue-card-neighborhood {
                font-size: 14px;
                color: #7f8c8d;
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .venue-card-actions {
                display: flex;
                gap: 8px;
            }

            .venue-action-btn {
                flex: 1;
                padding: 12px 16px;
                border: none;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                text-align: center;
                font-size: 14px;
            }

            .venue-action-btn.primary {
                background: linear-gradient(135deg, #d4af37 0%, #f4e4bc 100%);
                color: white;
            }

            .venue-action-btn.primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 20px rgba(212, 175, 55, 0.3);
            }

            .venue-action-btn.secondary {
                background: #f8f9fa;
                color: #495057;
                border: 1px solid #dee2e6;
            }

            .venue-action-btn.secondary:hover {
                background: #e9ecef;
                transform: translateY(-1px);
            }
        `;
    }

    createVenueCard(venue, index = 0) {
        const isLiked = this.isVenueLiked(venue.id);
        const isLive = this.isVenueLive(venue);
        
        return `
            <div class="enhanced-venue-card" data-venue-id="${venue.id}" style="animation-delay: ${index * 0.1}s">
                <div class="venue-card-image-container">
                    <img src="${venue.image}" alt="${venue.name}" class="venue-card-image" onerror="SL_IMG_FALLBACK(this,'venue')">
                    <div class="venue-card-overlay"></div>
                    
                    <div class="venue-card-quick-actions">
                        <button class="venue-quick-action save-btn ${isLiked ? 'liked' : ''}" onclick="enhancedCards.toggleSave('${venue.id}', event)">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                            </svg>
                        </button>
                        <button class="venue-quick-action share-btn" onclick="enhancedCards.shareVenue('${venue.id}', event)">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="18" cy="5" r="3"></circle>
                                <circle cx="6" cy="12" r="3"></circle>
                                <circle cx="18" cy="19" r="3"></circle>
                                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                            </svg>
                        </button>
                    </div>
                    
                    ${isLive ? `
                        <div class="venue-live-indicator">
                            <span class="live-pulse"></span>
                            LIVE NOW
                        </div>
                    ` : ''}
                    
                    ${venue.trending ? `
                        <div class="venue-trending-badge">
                            🔥 Trending
                        </div>
                    ` : ''}
                </div>
                
                <div class="venue-card-content">
                    <div class="venue-card-header">
                        <div>
                            <h3 class="venue-card-name">${venue.name}</h3>
                            <div class="venue-card-neighborhood">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                    <circle cx="12" cy="10" r="3"></circle>
                                </svg>
                                ${venue.neighborhood}
                            </div>
                        </div>
                        
                        <div class="venue-card-rating">
                            <div class="rating-stars">
                                ${this.generateStars(venue.rating)}
                            </div>
                            <span class="rating-number">${venue.rating}</span>
                            <span class="rating-count">(${venue.reviewCount})</span>
                        </div>
                    </div>
                    
                    <div class="venue-card-description">
                        ${venue.description}
                    </div>
                    
                    <div class="venue-card-tags">
                        ${venue.tags.map(tag => `
                            <span class="venue-tag">${tag}</span>
                        `).join('')}
                    </div>
                    
                    <div class="venue-card-meta">
                        <div class="meta-item">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="1" x2="12" y2="23"></line>
                                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                            </svg>
                            ${venue.priceRange}
                        </div>
                        <div class="meta-item">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            ${venue.hours}
                        </div>
                        <div class="meta-item">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                <circle cx="9" cy="7" r="4"></circle>
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                            </svg>
                            ${venue.groupSize || '2-6'}
                        </div>
                    </div>
                    
                    <div class="venue-card-actions">
                        <button class="venue-action-btn primary" onclick="enhancedCards.viewDetails('${venue.id}')">
                            View Details
                        </button>
                        <button class="venue-action-btn secondary" onclick="enhancedCards.makeReservation('${venue.id}')">
                            Reserve
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    generateStars(rating) {
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 !== 0;
        let stars = '';
        
        for (let i = 0; i < fullStars; i++) {
            stars += '<svg width="16" height="16" viewBox="0 0 24 24" fill="#d4af37"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
        }
        
        if (hasHalfStar) {
            stars += '<svg width="16" height="16" viewBox="0 0 24 24" fill="#d4af37"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" opacity="0.5"/></svg>';
        }
        
        const emptyStars = 5 - Math.ceil(rating);
        for (let i = 0; i < emptyStars; i++) {
            stars += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d4af37" stroke-width="1"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
        }
        
        return stars;
    }

    isVenueLiked(venueId) {
        const savedVenues = JSON.parse(localStorage.getItem('savedVenues') || '[]');
        return savedVenues.includes(venueId);
    }

    isVenueLive(venue) {
        // Simulate live status - in real app, this would come from API
        const currentHour = new Date().getHours();
        const liveVenues = ['venue-1', 'venue-3', 'venue-5'];
        return liveVenues.includes(venue.id) && currentHour >= 18 && currentHour <= 23;
    }

    toggleSave(venueId, event) {
        event.stopPropagation();
        
        const savedVenues = JSON.parse(localStorage.getItem('savedVenues') || '[]');
        const button = event.currentTarget;
        const isCurrentlySaved = savedVenues.includes(venueId);
        
        if (isCurrentlySaved) {
            // Remove from saved
            const index = savedVenues.indexOf(venueId);
            savedVenues.splice(index, 1);
            button.classList.remove('liked');
            
            // Show notification
            this.showNotification('Venue removed from your list', 'remove');
        } else {
            // Add to saved
            savedVenues.push(venueId);
            button.classList.add('liked');
            
            // Show notification
            this.showNotification('Venue saved to your list!', 'success');
        }
        
        localStorage.setItem('savedVenues', JSON.stringify(savedVenues));
    }

    shareVenue(venueId, event) {
        event.stopPropagation();
        
        const venue = window.mockVenues ? window.mockVenues.find(v => v.id === venueId) : null;
        if (venue) {
            const shareText = `Check out ${venue.name} - ${venue.description}`;
            
            if (navigator.share) {
                navigator.share({
                    title: venue.name,
                    text: shareText,
                    url: window.location.href
                });
            } else {
                // Fallback - copy to clipboard
                navigator.clipboard.writeText(shareText + ' ' + window.location.href);
                this.showNotification('Venue details copied to clipboard!', 'success');
            }
        }
    }

    viewDetails(venueId) {
        // Navigate to venue detail page
        const detailUrl = `/venue-details.html?id=${venueId}`;
        window.location.href = detailUrl;
    }

    makeReservation(venueId) {
        // Navigate to booking page or open booking modal
        const bookingUrl = `/venue-details.html?id=${venueId}#booking`;
        window.location.href = bookingUrl;
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `concierge-notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;
        
        // Add styles if not already added
        if (!document.getElementById('notification-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-styles';
            style.innerHTML = `
                .concierge-notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
                    z-index: 10000;
                    animation: slideInRight 0.3s ease-out;
                    max-width: 300px;
                }
                
                .concierge-notification.success {
                    border-left: 4px solid #27ae60;
                }
                
                .concierge-notification.remove {
                    border-left: 4px solid #e74c3c;
                }
                
                .concierge-notification.info {
                    border-left: 4px solid #3498db;
                }
                
                .notification-content {
                    padding: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                
                .notification-message {
                    flex: 1;
                    font-size: 14px;
                    color: #2c3e50;
                }
                
                .notification-close {
                    background: none;
                    border: none;
                    font-size: 18px;
                    cursor: pointer;
                    color: #7f8c8d;
                    margin-left: 12px;
                }
                
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
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(notification);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 3000);
    }

    injectStyles() {
        if (!document.getElementById('enhanced-venue-cards-styles')) {
            const style = document.createElement('style');
            style.id = 'enhanced-venue-cards-styles';
            style.innerHTML = this.cardStyles + `
                .venue-card-rating {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    margin-bottom: 8px;
                }
                
                .rating-stars {
                    display: flex;
                    gap: 2px;
                }
                
                .rating-number {
                    font-weight: 600;
                    color: #2c3e50;
                    font-size: 14px;
                }
                
                .rating-count {
                    color: #7f8c8d;
                    font-size: 12px;
                }
                
                .venue-card-description {
                    color: #495057;
                    font-size: 14px;
                    line-height: 1.5;
                    margin-bottom: 12px;
                }
                
                .venue-card-tags {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    margin-bottom: 16px;
                }
                
                .venue-tag {
                    background: linear-gradient(135deg, #d4af37 0%, #f4e4bc 100%);
                    color: white;
                    padding: 4px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 500;
                }
                
                .venue-card-meta {
                    display: flex;
                    gap: 16px;
                    margin-bottom: 16px;
                    padding: 12px 0;
                    border-top: 1px solid #e9ecef;
                    border-bottom: 1px solid #e9ecef;
                }
                
                .meta-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    color: #6c757d;
                    font-size: 13px;
                }
                
                .venue-live-indicator {
                    position: absolute;
                    top: 12px;
                    left: 12px;
                    background: rgba(231, 76, 60, 0.9);
                    color: white;
                    padding: 6px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    backdrop-filter: blur(10px);
                }
                
                .live-pulse {
                    width: 8px;
                    height: 8px;
                    background: white;
                    border-radius: 50%;
                    animation: pulse 2s infinite;
                }
                
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                
                .venue-trending-badge {
                    position: absolute;
                    bottom: 12px;
                    left: 12px;
                    background: rgba(255, 193, 7, 0.9);
                    color: #2c3e50;
                    padding: 6px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 600;
                    backdrop-filter: blur(10px);
                }
            `;
            document.head.appendChild(style);
        }
    }

    renderVenues(venues, containerId = 'concierge-venues-container') {
        this.injectStyles();
        
        let container = document.getElementById(containerId);
        if (!container) {
            container = document.createElement('div');
            container.id = containerId;
            // Add to appropriate location in concierge
            const messageContainer = document.querySelector('.concierge-messages');
            if (messageContainer) {
                messageContainer.appendChild(container);
            }
        }
        
        // Clear existing content
        container.innerHTML = '';
        
        // Add venue cards
        venues.forEach((venue, index) => {
            const cardHTML = this.createVenueCard(venue, index);
            container.innerHTML += cardHTML;
        });
        
        // Add click handlers for entire cards
        container.querySelectorAll('.enhanced-venue-card').forEach(card => {
            card.addEventListener('click', (e) => {
                // Don't navigate if clicking on buttons
                if (e.target.closest('.venue-quick-action') || e.target.closest('.venue-action-btn')) {
                    return;
                }
                
                const venueId = card.dataset.venueId;
                this.viewDetails(venueId);
            });
        });
    }
}

// Initialize the enhanced cards system
const enhancedCards = new EnhancedVenueCards();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnhancedVenueCards;
} else {
    window.EnhancedVenueCards = EnhancedVenueCards;
}