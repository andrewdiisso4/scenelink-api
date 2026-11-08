/**
 * Enhanced Venue Discovery System
 * Complete venue information with ratings, cuisine, pricing, and integration
 */

(function() {
    'use strict';

    // Enhanced venue data with all details
    const enhancedVenues = [
        {
            id: 'venue1',
            name: 'Sky Lounge',
            type: 'Rooftop Bar',
            category: 'bar',
            cuisine: ['Cocktails', 'Light Bites'],
            rating: 4.8,
            priceLevel: 3,
            image: '/assets/img/placeholder-venue.svg',
            address: '789 High St, Seaport, Boston',
            coordinates: { lat: 42.3518, lng: -71.0569 },
            distance: 0.8,
            description: 'Experience breathtaking city views from Boston\'s premier rooftop lounge. Perfect for sunset cocktails and special occasions.',
            detailedDescription: 'Sky Lounge offers an unparalleled outdoor seating experience with panoramic views of the Boston skyline. Our expert mixologists craft signature cocktails using premium spirits and fresh ingredients. The venue features a climate-controlled outdoor space, fire pits for cooler evenings, and live music on weekends. Ideal for romantic dates, group celebrations, and after-work gatherings.',
            features: ['Outdoor Seating', 'Rooftop', 'Live Music', 'Happy Hour', 'Fire Pits', 'WiFi', 'Reservations', 'Pet Friendly'],
            hours: {
                monday: '4PM - 1AM',
                tuesday: '4PM - 1AM',
                wednesday: '4PM - 1AM',
                thursday: '4PM - 2AM',
                friday: '4PM - 2AM',
                saturday: '12PM - 2AM',
                sunday: '12PM - 12AM'
            },
            phone: '(617) 555-0101',
            website: 'https://skyloungeboston.com',
            reservations: true,
            dressCode: 'Smart Casual',
            parking: 'Street parking available, nearby garages',
            specialOffers: '20% off happy hour 5-7 PM, group discounts available',
            tags: ['Romantic', 'Trending', 'Groups', 'Views', 'Cocktails']
        },
        {
            id: 'venue2',
            name: 'Blue Note Jazz Club',
            type: 'Jazz Club',
            category: 'restaurant',
            cuisine: ['American', 'Jazz Venue'],
            rating: 4.9,
            priceLevel: 4,
            image: '/assets/img/placeholder-venue.svg',
            address: '123 Music Ave, Downtown, Boston',
            coordinates: { lat: 42.3601, lng: -71.0589 },
            distance: 1.2,
            description: 'Intimate jazz performances paired with fine dining in an authentic New York-style jazz club.',
            detailedDescription: 'Step into the Blue Note Jazz Club for an unforgettable evening of live jazz and exceptional cuisine. Our intimate venue hosts world-class jazz musicians nightly, while our kitchen serves contemporary American cuisine with a southern twist. The venue features a full bar, vintage decor, and excellent acoustics. Perfect for date nights, special occasions, and jazz enthusiasts.',
            features: ['Live Music', 'Fine Dining', 'Full Bar', 'Reservations', 'WiFi', 'Private Events', 'Air Conditioning', 'Valet Parking'],
            hours: {
                monday: '6PM - 11PM',
                tuesday: '6PM - 11PM',
                wednesday: '6PM - 11PM',
                thursday: '6PM - 12AM',
                friday: '6PM - 1AM',
                saturday: '6PM - 1AM',
                sunday: '6PM - 11PM'
            },
            phone: '(617) 555-0102',
            website: 'https://bluenoteboston.com',
            reservations: true,
            dressCode: 'Business Casual',
            parking: 'Valet parking available',
            specialOffers: 'Complimentary appetizer with dinner reservation, early bird specials',
            tags: ['Date Night', 'Live Music', 'Upscale', 'Jazz', 'Romantic']
        },
        {
            id: 'venue3',
            name: 'The Underground Club',
            type: 'Nightclub',
            category: 'nightlife',
            cuisine: ['Club', 'Late Night'],
            rating: 4.6,
            priceLevel: 2,
            image: '/assets/img/placeholder-venue.svg',
            address: '456 Party St, Theater District, Boston',
            coordinates: { lat: 42.3505, lng: -71.0644 },
            distance: 0.5,
            description: 'High-energy nightclub with top DJs, dance floor, and an electric atmosphere for late-night entertainment.',
            detailedDescription: 'The Underground Club is Boston\'s premier nightlife destination, featuring state-of-the-art sound systems, multiple bars, and world-renowned DJs. Our venue includes a main dance floor, VIP lounge areas, outdoor patio, and themed nights throughout the week. With bottle service available and a professional security team, we ensure a safe and unforgettable nightlife experience.',
            features: ['Dancing', 'DJ', 'VIP Areas', 'Multiple Bars', 'Outdoor Patio', 'Bottle Service', 'Security', 'ATM'],
            hours: {
                monday: 'Closed',
                tuesday: '9PM - 2AM',
                wednesday: '9PM - 2AM',
                thursday: '9PM - 3AM',
                friday: '9PM - 3AM',
                saturday: '9PM - 3AM',
                sunday: '9PM - 2AM'
            },
            phone: '(617) 555-0103',
            website: 'https://undergroundboston.com',
            reservations: false,
            dressCode: 'Club Attire',
            parking: 'Nearby parking garages',
            specialOffers: 'No cover before 11 PM on weekdays, birthday packages available',
            tags: ['Nightlife', 'Dancing', 'DJ', 'Groups', 'Late Night']
        },
        {
            id: 'venue4',
            name: 'Pizzeria Uno',
            type: 'Italian Restaurant',
            category: 'restaurant',
            cuisine: ['Italian', 'Pizza', 'American'],
            rating: 4.5,
            priceLevel: 2,
            image: '/assets/img/placeholder-venue.svg',
            address: '123 Main St, North End, Boston',
            coordinates: { lat: 42.3643, lng: -71.0539 },
            distance: 0.3,
            description: 'Classic deep-dish pizza and Italian favorites in a casual, family-friendly atmosphere.',
            detailedDescription: 'Since 1943, Pizzeria Uno has been serving Chicago-style deep-dish pizza and traditional Italian-American cuisine. Our family-friendly restaurant features a comfortable atmosphere, full bar, and outdoor seating during warmer months. Perfect for family dinners, casual dates, and group gatherings. We also offer gluten-free options and an extensive kids menu.',
            features: ['Family Friendly', 'Outdoor Seating', 'Full Bar', 'Takeout', 'Delivery', 'WiFi', 'Parking', 'Gluten Free'],
            hours: {
                monday: '11AM - 11PM',
                tuesday: '11AM - 11PM',
                wednesday: '11AM - 11PM',
                thursday: '11AM - 12AM',
                friday: '11AM - 12AM',
                saturday: '11AM - 12AM',
                sunday: '12PM - 10PM'
            },
            phone: '(617) 555-0104',
            website: 'https://pizzeriaunoboston.com',
            reservations: true,
            dressCode: 'Casual',
            parking: 'Private parking lot',
            specialOffers: 'Family deals, weekday lunch specials',
            tags: ['Family Friendly', 'Pizza', 'Casual', 'Groups', 'Italian']
        },
        {
            id: 'venue5',
            name: 'The Garden Bistro',
            type: 'Farm-to-Table Restaurant',
            category: 'restaurant',
            cuisine: ['American', 'Farm-to-Table', 'Organic'],
            rating: 4.7,
            priceLevel: 4,
            image: '/assets/img/placeholder-venue.svg',
            address: '789 Garden Ave, Back Bay, Boston',
            coordinates: { lat: 42.3490, lng: -71.0766 },
            distance: 1.5,
            description: 'Elegant farm-to-table dining featuring seasonal ingredients and innovative American cuisine.',
            detailedDescription: 'The Garden Bistro offers a sophisticated dining experience with a focus on locally-sourced, seasonal ingredients. Our chef creates innovative American dishes that change seasonally to showcase the best of New England\'s bounty. The restaurant features a beautiful garden patio, extensive wine list, and intimate indoor dining. Perfect for special occasions, business dinners, and romantic evenings.',
            features: ['Farm-to-Table', 'Outdoor Seating', 'Wine Bar', 'Seasonal Menu', 'Reservations', 'Valet Parking', 'Private Dining', 'Vegetarian Options'],
            hours: {
                monday: '5:30PM - 10PM',
                tuesday: '5:30PM - 10PM',
                wednesday: '5:30PM - 10PM',
                thursday: '5:30PM - 11PM',
                friday: '5:30PM - 11PM',
                saturday: '5PM - 11PM',
                sunday: '5PM - 10PM'
            },
            phone: '(617) 555-0105',
            website: 'https://gardenbistroboston.com',
            reservations: true,
            dressCode: 'Business Casual',
            parking: 'Valet parking available',
            specialOffers: 'Wine pairing dinners, seasonal tasting menus',
            tags: ['Fine Dining', 'Romantic', 'Farm-to-Table', 'Wine', 'Seasonal']
        }
    ];

    // State management
    const state = {
        venues: enhancedVenues,
        userLocation: null,
        savedVenues: JSON.parse(localStorage.getItem('savedVenues') || '[]'),
        selectedVenue: null,
        filters: {
            category: 'all',
            cuisine: 'all',
            priceLevel: 'all',
            rating: 'all',
            features: []
        }
    };

    // Get user location
    function getUserLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    state.userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    updateDistances();
                },
                () => {
                    console.log('Location access denied, using default Boston location');
                    state.userLocation = { lat: 42.3601, lng: -71.0589 };
                }
            );
        } else {
            state.userLocation = { lat: 42.3601, lng: -71.0589 };
        }
    }

    // Calculate distances
    function updateDistances() {
        if (!state.userLocation) return;
        
        state.venues.forEach(venue => {
            venue.distance = calculateDistance(
                state.userLocation.lat,
                state.userLocation.lng,
                venue.coordinates.lat,
                venue.coordinates.lng
            );
        });
    }

    // Calculate distance between two points
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 3959; // Earth's radius in miles
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                    Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    // Render star rating
    function renderStarRating(rating) {
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 !== 0;
        let stars = '';
        
        for (let i = 0; i < fullStars; i++) {
            stars += '<i class="fas fa-star"></i>';
        }
        if (hasHalfStar) {
            stars += '<i class="fas fa-star-half-alt"></i>';
        }
        for (let i = Math.ceil(rating); i < 5; i++) {
            stars += '<i class="far fa-star"></i>';
        }
        
        return `<div class="star-rating">${stars}</div>`;
    }

    // Render price level
    function renderPriceLevel(level) {
        let price = '';
        for (let i = 0; i < level; i++) {
            price += '<span class="price-dollar">$</span>';
        }
        return `<div class="price-level">${price}</div>`;
    }

    // Render cuisine badges
    function renderCuisine(cuisine) {
        return cuisine.map(c => `<span class="cuisine-badge">${c}</span>`).join('');
    }

    // Render feature tags
    function renderFeatures(features) {
        return features.map(f => `<span class="feature-tag">${f}</span>`).join('');
    }

    // Render venue card
    function renderVenueCard(venue) {
        const isSaved = state.savedVenues.includes(venue.id);
        
        return `
            <div class="venue-card" data-venue-id="${venue.id}">
                <div class="venue-image">
                    <img src="${venue.image}" alt="${venue.name}">
                    <div class="venue-overlay">
                        <button class="quick-save ${isSaved ? 'saved' : ''}" onclick="toggleSave('${venue.id}')">
                            <i class="${isSaved ? 'fas' : 'far'} fa-heart"></i>
                        </button>
                        <div class="venue-type">${venue.type}</div>
                    </div>
                </div>
                
                <div class="venue-content">
                    <div class="venue-header">
                        <h3 class="venue-name">${venue.name}</h3>
                        <div class="venue-meta">
                            ${renderStarRating(venue.rating)}
                            ${renderPriceLevel(venue.priceLevel)}
                        </div>
                    </div>
                    
                    <div class="venue-cuisine">
                        ${renderCuisine(venue.cuisine)}
                    </div>
                    
                    <p class="venue-description">${venue.description}</p>
                    
                    <div class="venue-details">
                        <div class="venue-detail">
                            <i class="fas fa-map-marker-alt"></i>
                            <span>${venue.address}</span>
                        </div>
                        <div class="venue-detail">
                            <i class="fas fa-route"></i>
                            <span>${venue.distance.toFixed(1)} miles away</span>
                        </div>
                    </div>
                    
                    <div class="venue-features">
                        ${renderFeatures(venue.features.slice(0, 3))}
                        ${venue.features.length > 3 ? `<span class="more-features">+${venue.features.length - 3} more</span>` : ''}
                    </div>
                    
                    <div class="venue-actions">
                        <button class="btn-view-details" onclick="viewVenueDetails('${venue.id}')">
                            <i class="fas fa-info-circle"></i> View Details
                        </button>
                        <button class="btn-book" onclick="bookVenue('${venue.id}')">
                            <i class="fas fa-calendar-check"></i> Book Now
                        </button>
                        <button class="btn-share" onclick="shareVenue('${venue.id}')">
                            <i class="fas fa-share-alt"></i> Share
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // Toggle save venue
    window.toggleSave = function(venueId) {
        const index = state.savedVenues.indexOf(venueId);
        if (index > -1) {
            state.savedVenues.splice(index, 1);
            showNotification('Venue removed from saved', 'info');
        } else {
            state.savedVenues.push(venueId);
            showNotification('Venue saved to your list', 'success');
        }
        
        localStorage.setItem('savedVenues', JSON.stringify(state.savedVenues));
        
        // Update UI
        const saveBtn = document.querySelector(`[data-venue-id="${venueId}"] .quick-save`);
        if (saveBtn) {
            saveBtn.classList.toggle('saved');
            saveBtn.innerHTML = `<i class="${index > -1 ? 'far' : 'fas'} fa-heart"></i>`;
        }
    };

    // View venue details
    window.viewVenueDetails = function(venueId) {
        const venue = state.venues.find(v => v.id === venueId);
        if (!venue) return;
        
        state.selectedVenue = venue;
        showVenueModal(venue);
    };

    // Show venue modal
    function showVenueModal(venue) {
        const modal = document.createElement('div');
        modal.className = 'venue-modal active';
        modal.innerHTML = `
            <div class="venue-modal-content">
                <div class="venue-modal-header">
                    <img src="${venue.image}" alt="${venue.name}">
                    <button class="modal-close" onclick="closeVenueModal()">&times;</button>
                </div>
                
                <div class="venue-modal-body">
                    <div class="venue-modal-info">
                        <h2>${venue.name}</h2>
                        <div class="venue-modal-meta">
                            ${renderStarRating(venue.rating)}
                            <span class="rating-text">${venue.rating} (${Math.floor(Math.random() * 500) + 100} reviews)</span>
                            ${renderPriceLevel(venue.priceLevel)}
                            <span class="venue-type">${venue.type}</span>
                        </div>
                        
                        <p class="venue-detailed-description">${venue.detailedDescription}</p>
                        
                        <div class="venue-modal-details">
                            <div class="detail-section">
                                <h3>Cuisine Type</h3>
                                <div class="cuisine-list">${renderCuisine(venue.cuisine)}</div>
                            </div>
                            
                            <div class="detail-section">
                                <h3>Features & Amenities</h3>
                                <div class="features-grid">${renderFeatures(venue.features)}</div>
                            </div>
                            
                            <div class="detail-section">
                                <h3>Hours of Operation</h3>
                                <div class="hours-grid">
                                    ${Object.entries(venue.hours).map(([day, hours]) => `
                                        <div class="hours-item">
                                            <span class="day">${day.charAt(0).toUpperCase() + day.slice(1)}</span>
                                            <span class="time">${hours}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            
                            <div class="detail-section">
                                <h3>Contact & Location</h3>
                                <div class="contact-info">
                                    <div class="contact-item">
                                        <i class="fas fa-map-marker-alt"></i>
                                        <span>${venue.address}</span>
                                    </div>
                                    <div class="contact-item">
                                        <i class="fas fa-phone"></i>
                                        <span>${venue.phone}</span>
                                    </div>
                                    <div class="contact-item">
                                        <i class="fas fa-globe"></i>
                                        <a href="${venue.website}" target="_blank">${venue.website}</a>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="detail-section">
                                <h3>Additional Information</h3>
                                <div class="additional-info">
                                    <div class="info-item">
                                        <strong>Dress Code:</strong> ${venue.dressCode}
                                    </div>
                                    <div class="info-item">
                                        <strong>Parking:</strong> ${venue.parking}
                                    </div>
                                    <div class="info-item">
                                        <strong>Reservations:</strong> ${venue.reservations ? 'Recommended/Required' : 'Not required'}
                                    </div>
                                    <div class="info-item">
                                        <strong>Special Offers:</strong> ${venue.specialOffers}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="venue-modal-footer">
                    <button class="btn-primary" onclick="bookVenue('${venue.id}')">
                        <i class="fas fa-calendar-check"></i> Make Reservation
                    </button>
                    <button class="btn-secondary" onclick="shareVenue('${venue.id}')">
                        <i class="fas fa-share-alt"></i> Share
                    </button>
                    <button class="btn-outline" onclick="toggleSave('${venue.id}')">
                        <i class="${state.savedVenues.includes(venue.id) ? 'fas' : 'far'} fa-heart"></i>
                        ${state.savedVenues.includes(venue.id) ? 'Saved' : 'Save'}
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeVenueModal();
            }
        });
    }

    // Close venue modal
    window.closeVenueModal = function() {
        const modal = document.querySelector('.venue-modal');
        if (modal) {
            modal.remove();
        }
    };

    // Book venue
    window.bookVenue = function(venueId) {
        const venue = state.venues.find(v => v.id === venueId);
        if (!venue) return;
        
        // Create booking modal
        const bookingModal = document.createElement('div');
        bookingModal.className = 'booking-modal active';
        bookingModal.innerHTML = `
            <div class="booking-modal-content">
                <div class="booking-header">
                    <h3>Reserve at ${venue.name}</h3>
                    <button class="modal-close" onclick="closeBookingModal()">&times;</button>
                </div>
                
                <form class="booking-form" onsubmit="submitBooking(event, '${venueId}')">
                    <div class="form-row">
                        <div class="form-group">
                            <label>Date</label>
                            <input type="date" name="date" required min="${new Date().toISOString().split('T')[0]}">
                        </div>
                        <div class="form-group">
                            <label>Time</label>
                            <select name="time" required>
                                <option value="">Select time</option>
                                ${generateTimeOptions()}
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label>Party Size</label>
                            <select name="partySize" required>
                                <option value="">Select size</option>
                                ${[1,2,3,4,5,6,7,8].map(n => `<option value="${n}">${n} ${n === 1 ? 'person' : 'people'}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Occasion (optional)</label>
                            <select name="occasion">
                                <option value="">Select occasion</option>
                                <option value="birthday">Birthday</option>
                                <option value="anniversary">Anniversary</option>
                                <option value="date">Date Night</option>
                                <option value="business">Business Meal</option>
                                <option value="casual">Casual Dining</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>Name</label>
                        <input type="text" name="name" required>
                    </div>
                    
                    <div class="form-group">
                        <label>Phone</label>
                        <input type="tel" name="phone" required>
                    </div>
                    
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" name="email" required>
                    </div>
                    
                    <div class="form-group">
                        <label>Special Requests (optional)</label>
                        <textarea name="requests" rows="3"></textarea>
                    </div>
                    
                    <div class="booking-actions">
                        <button type="button" class="btn-secondary" onclick="closeBookingModal()">Cancel</button>
                        <button type="submit" class="btn-primary">Confirm Reservation</button>
                    </div>
                </form>
            </div>
        `;
        
        document.body.appendChild(bookingModal);
    };

    // Generate time options
    function generateTimeOptions() {
        const times = [];
        for (let hour = 11; hour <= 22; hour++) {
            for (let minute = 0; minute < 60; minute += 30) {
                const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                const displayHour = hour > 12 ? hour - 12 : hour;
                const ampm = hour >= 12 ? 'PM' : 'AM';
                times.push(`<option value="${time}">${displayHour}:${minute.toString().padStart(2, '0')} ${ampm}</option>`);
            }
        }
        return times.join('');
    }

    // Submit booking
    window.submitBooking = function(event, venueId) {
        event.preventDefault();
        const formData = new FormData(event.target);
        const bookingData = Object.fromEntries(formData);
        const venue = state.venues.find(v => v.id === venueId);
        
        // Store booking (in real app, this would go to backend)
        const bookings = JSON.parse(localStorage.getItem('bookings') || '[]');
        bookings.push({
            id: 'booking_' + Date.now(),
            venueId: venueId,
            venueName: venue.name,
            ...bookingData,
            createdAt: new Date().toISOString()
        });
        localStorage.setItem('bookings', JSON.stringify(bookings));
        
        closeBookingModal();
        showNotification(`Reservation confirmed at ${venue.name}!`, 'success');
    };

    // Close booking modal
    window.closeBookingModal = function() {
        const modal = document.querySelector('.booking-modal');
        if (modal) {
            modal.remove();
        }
    };

    // Share venue
    window.shareVenue = function(venueId) {
        const venue = state.venues.find(v => v.id === venueId);
        if (!venue) return;
        
        const shareData = {
            title: venue.name,
            text: `Check out ${venue.name} - ${venue.description}`,
            url: window.location.href + '#venue-' + venueId
        };
        
        if (navigator.share) {
            navigator.share(shareData)
                .catch(() => console.log('Share cancelled'));
        } else {
            // Fallback - copy to clipboard
            const text = `${venue.name} - ${venue.description} ${window.location.href}#venue-${venueId}`;
            navigator.clipboard.writeText(text)
                .then(() => showNotification('Venue link copied to clipboard!', 'success'))
                .catch(() => showNotification('Failed to copy link', 'error'));
        }
    };

    // Show notification
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '16px 24px',
            borderRadius: '8px',
            color: 'white',
            fontWeight: '600',
            zIndex: '10000',
            animation: 'slideInRight 0.3s ease',
            background: type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'
        });
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Initialize venue discovery
    function initializeVenueDiscovery() {
        getUserLocation();
        
        // Add venue discovery styling
        const style = document.createElement('style');
        style.textContent = `
            .venue-card {
                background: linear-gradient(135deg, rgba(26, 26, 26, 0.95) 0%, rgba(20, 20, 20, 0.95) 100%);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 16px;
                overflow: hidden;
                transition: all 0.3s ease;
                margin-bottom: 20px;
            }
            
            .venue-card:hover {
                transform: translateY(-4px);
                box-shadow: 0 12px 24px rgba(0, 0, 0, 0.3);
                border-color: rgba(212, 175, 55, 0.3);
            }
            
            .venue-image {
                position: relative;
                height: 200px;
                overflow: hidden;
            }
            
            .venue-image img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                transition: transform 0.3s ease;
            }
            
            .venue-card:hover .venue-image img {
                transform: scale(1.05);
            }
            
            .venue-overlay {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.7) 100%);
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                padding: 16px;
            }
            
            .quick-save {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.9);
                border: none;
                color: #ef4444;
                font-size: 18px;
                cursor: pointer;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .quick-save.saved {
                background: #ef4444;
                color: white;
            }
            
            .venue-type {
                background: rgba(212, 175, 55, 0.9);
                color: #0a0a0a;
                padding: 6px 12px;
                border-radius: 20px;
                font-size: 0.85rem;
                font-weight: 600;
            }
            
            .venue-content {
                padding: 20px;
            }
            
            .venue-header {
                margin-bottom: 12px;
            }
            
            .venue-name {
                font-size: 1.3rem;
                font-weight: 700;
                color: #ffffff;
                margin-bottom: 8px;
            }
            
            .venue-meta {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            
            .star-rating {
                display: flex;
                gap: 2px;
                color: #D4AF37;
            }
            
            .price-level {
                display: flex;
                gap: 2px;
                color: #D4AF37;
            }
            
            .cuisine-badge {
                background: rgba(212, 175, 55, 0.2);
                color: #D4AF37;
                padding: 4px 8px;
                border-radius: 12px;
                font-size: 0.8rem;
                font-weight: 600;
                margin-right: 8px;
                display: inline-block;
                margin-bottom: 8px;
            }
            
            .venue-description {
                color: #b0b0b0;
                margin-bottom: 16px;
                line-height: 1.5;
            }
            
            .venue-details {
                display: flex;
                gap: 16px;
                margin-bottom: 16px;
            }
            
            .venue-detail {
                display: flex;
                align-items: center;
                gap: 8px;
                color: #b0b0b0;
                font-size: 0.9rem;
            }
            
            .venue-detail i {
                color: #D4AF37;
            }
            
            .venue-features {
                margin-bottom: 16px;
            }
            
            .feature-tag {
                background: rgba(255, 255, 255, 0.1);
                color: #b0b0b0;
                padding: 4px 8px;
                border-radius: 8px;
                font-size: 0.8rem;
                margin-right: 6px;
                display: inline-block;
                margin-bottom: 6px;
            }
            
            .more-features {
                color: #D4AF37;
                font-size: 0.8rem;
                font-weight: 600;
            }
            
            .venue-actions {
                display: grid;
                grid-template-columns: 1fr 1fr 1fr;
                gap: 8px;
            }
            
            .venue-actions button {
                padding: 12px;
                border: none;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                font-size: 0.9rem;
            }
            
            .btn-view-details {
                background: rgba(255, 255, 255, 0.1);
                color: #ffffff;
            }
            
            .btn-view-details:hover {
                background: rgba(255, 255, 255, 0.2);
            }
            
            .btn-book {
                background: linear-gradient(135deg, #D4AF37 0%, #E5C158 100%);
                color: #0a0a0a;
            }
            
            .btn-book:hover {
                transform: translateY(-2px);
            }
            
            .btn-share {
                background: rgba(255, 255, 255, 0.05);
                color: #ffffff;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            .btn-share:hover {
                background: rgba(255, 255, 255, 0.1);
                border-color: #D4AF37;
            }
            
            .venue-modal,
            .booking-modal {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.8);
                backdrop-filter: blur(8px);
                z-index: 10000;
                display: none;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            
            .venue-modal.active,
            .booking-modal.active {
                display: flex;
            }
            
            .venue-modal-content,
            .booking-modal-content {
                background: #1a1a1a;
                border: 1px solid rgba(212, 175, 55, 0.3);
                border-radius: 20px;
                max-width: 800px;
                width: 100%;
                max-height: 90vh;
                overflow-y: auto;
            }
            
            .venue-modal-header {
                position: relative;
                height: 250px;
            }
            
            .venue-modal-header img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            
            .modal-close {
                position: absolute;
                top: 16px;
                right: 16px;
                width: 40px;
                height: 40px;
                background: rgba(0, 0, 0, 0.7);
                border: none;
                border-radius: 50%;
                color: white;
                font-size: 24px;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .modal-close:hover {
                background: rgba(255, 68, 68, 0.8);
            }
            
            .venue-modal-body {
                padding: 32px;
            }
            
            .venue-modal-info h2 {
                font-size: 2rem;
                margin-bottom: 12px;
                color: #ffffff;
            }
            
            .venue-modal-meta {
                display: flex;
                align-items: center;
                gap: 16px;
                margin-bottom: 24px;
                flex-wrap: wrap;
            }
            
            .rating-text {
                color: #b0b0b0;
            }
            
            .venue-detailed-description {
                color: #b0b0b0;
                line-height: 1.6;
                margin-bottom: 32px;
            }
            
            .detail-section {
                margin-bottom: 32px;
            }
            
            .detail-section h3 {
                color: #D4AF37;
                margin-bottom: 16px;
                font-size: 1.2rem;
            }
            
            .cuisine-list {
                display: flex;
                gap: 12px;
                flex-wrap: wrap;
            }
            
            .features-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                gap: 8px;
            }
            
            .hours-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 8px;
            }
            
            .hours-item {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            .day {
                font-weight: 600;
                color: #ffffff;
            }
            
            .time {
                color: #b0b0b0;
            }
            
            .contact-item {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 12px;
                color: #b0b0b0;
            }
            
            .contact-item i {
                color: #D4AF37;
                width: 20px;
            }
            
            .contact-item a {
                color: #D4AF37;
                text-decoration: none;
            }
            
            .info-item {
                margin-bottom: 12px;
                color: #b0b0b0;
            }
            
            .info-item strong {
                color: #ffffff;
            }
            
            .venue-modal-footer {
                padding: 24px 32px;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
                display: flex;
                gap: 12px;
            }
            
            .venue-modal-footer button {
                padding: 12px 24px;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                flex: 1;
            }
            
            .btn-primary {
                background: linear-gradient(135deg, #D4AF37 0%, #E5C158 100%);
                color: #0a0a0a;
                border: none;
            }
            
            .btn-secondary {
                background: rgba(255, 255, 255, 0.1);
                color: #ffffff;
                border: 1px solid rgba(255, 255, 255, 0.2);
            }
            
            .btn-outline {
                background: transparent;
                color: #ffffff;
                border: 1px solid rgba(255, 255, 255, 0.3);
            }
            
            .booking-modal-content {
                max-width: 500px;
            }
            
            .booking-header {
                padding: 24px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .booking-header h3 {
                color: #ffffff;
                margin: 0;
            }
            
            .booking-form {
                padding: 24px;
            }
            
            .form-row {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 16px;
                margin-bottom: 16px;
            }
            
            .form-group {
                margin-bottom: 16px;
            }
            
            .form-group label {
                display: block;
                margin-bottom: 8px;
                color: #b0b0b0;
                font-weight: 600;
            }
            
            .form-group input,
            .form-group select,
            .form-group textarea {
                width: 100%;
                padding: 12px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                color: #ffffff;
                font-family: inherit;
            }
            
            .booking-actions {
                display: flex;
                gap: 12px;
                margin-top: 24px;
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
            
            @media (max-width: 768px) {
                .venue-actions {
                    grid-template-columns: 1fr;
                }
                
                .venue-modal-meta {
                    flex-direction: column;
                    align-items: flex-start;
                }
                
                .venue-modal-footer {
                    flex-direction: column;
                }
                
                .form-row {
                    grid-template-columns: 1fr;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Expose global functions
    window.initializeVenueDiscovery = initializeVenueDiscovery;

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeVenueDiscovery);
    } else {
        initializeVenueDiscovery();
    }

})();
