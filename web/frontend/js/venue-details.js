// SceneLink Venue Details Page JavaScript
class VenueDetailsPage {
    constructor() {
        this.venue = null;
        this.isSaved = false;
        this.init();
    }

    init() {
        this.loadVenueData();
        this.setupEventListeners();
        this.renderVenue();
        this.loadPhotos();
        this.loadReviews();
        this.loadSimilarVenues();
    }

    loadVenueData() {
        // Get venue ID from URL parameter
        const urlParams = new URLSearchParams(window.location.search);
        const venueId = parseInt(urlParams.get('id'));
        
        // Comprehensive venue data - matches explore page data
        const venues = [
            {
                id: 1,
                name: "The Golden Hour",
                type: "Cocktail Bar",
                price: "$$",
                neighborhood: "Back Bay",
                distance: 0.3,
                rating: 4.8,
                image: "/assets/img/placeholder-venue.svg",
                description: "An elegant cocktail lounge specializing in craft cocktails and small plates. The Golden Hour offers a sophisticated atmosphere with expert mixologists and a curated selection of premium spirits. Known for our artisanal cocktails and intimate ambiance.",
                vibes: ["Upscale", "Date Night", "Craft Cocktails", "Live Music"],
                phone: "+1 (617) 555-0123",
                address: "123 Boylston St, Boston, MA 02116",
                hours: "5:00 PM - 2:00 AM",
                website: "www.goldenhourboston.com",
                reservations: true,
                outdoorSeating: true,
                liveMusic: true,
                fullMenu: true
            },
            {
                id: 2,
                name: "Sakura Sushi House",
                type: "Japanese Restaurant",
                price: "$$$",
                neighborhood: "Beacon Hill",
                distance: 0.5,
                rating: 4.9,
                image: "/assets/img/placeholder-venue.svg",
                description: "Authentic Japanese cuisine featuring fresh sushi, sashimi, and traditional dishes. Our experienced chefs create exquisite culinary experiences with the finest ingredients. Specializing in omakase and traditional Edo-style sushi.",
                vibes: ["Fine Dining", "Romantic", "Japanese", "Omakase"],
                phone: "+1 (617) 555-0124",
                address: "456 Charles St, Boston, MA 02114",
                hours: "11:30 AM - 10:00 PM",
                website: "www.sakurasushiboston.com",
                reservations: true,
                outdoorSeating: false,
                liveMusic: false,
                fullMenu: true
            },
            {
                id: 3,
                name: "The Underground",
                type: "Nightclub",
                price: "$$",
                neighborhood: "Fenway",
                distance: 1.2,
                rating: 4.6,
                image: "/assets/img/placeholder-venue.svg",
                description: "Boston's premier nightclub featuring top DJs, state-of-the-art sound system, and multiple dance floors. Experience the ultimate nightlife destination in the heart of the city with themed nights and bottle service.",
                vibes: ["High Energy", "Dancing", "DJ", "Party"],
                phone: "+1 (617) 555-0125",
                address: "789 Lansdowne St, Boston, MA 02215",
                hours: "9:00 PM - 2:00 AM",
                website: "www.undergroundboston.com",
                reservations: false,
                outdoorSeating: false,
                liveMusic: true,
                fullMenu: false
            },
            {
                id: 4,
                name: "Blue Note Lounge",
                type: "Jazz Bar",
                price: "$$",
                neighborhood: "South End",
                distance: 0.8,
                rating: 4.7,
                image: "/assets/img/placeholder-venue.svg",
                description: "Intimate jazz venue featuring live performances nightly. Enjoy classic cocktails and a sophisticated atmosphere while listening to Boston's best jazz musicians in our cozy, vintage-inspired setting.",
                vibes: ["Live Music", "Intimate", "Classic", "Sophisticated"],
                phone: "+1 (617) 555-0126",
                address: "321 Tremont St, Boston, MA 02118",
                hours: "6:00 PM - 1:00 AM",
                website: "www.bluenotelounge.com",
                reservations: true,
                outdoorSeating: false,
                liveMusic: true,
                fullMenu: false
            },
            {
                id: 5,
                name: "The Rooftop Garden",
                type: "Rooftop Bar",
                price: "$$$",
                neighborhood: "Downtown",
                distance: 1.0,
                rating: 4.5,
                image: "/assets/img/placeholder-venue.svg",
                description: "Stunning rooftop bar with panoramic city views. Featuring creative cocktails, light bites, and a beautiful garden setting. Perfect for sunset drinks and special occasions with our heated terrace and fire pits.",
                vibes: ["Rooftop", "Views", "Romantic", "Trendy"],
                phone: "+1 (617) 555-0127",
                address: "100 High St, Boston, MA 02110",
                hours: "4:00 PM - 11:00 PM",
                website: "www.rooftopgardenboston.com",
                reservations: true,
                outdoorSeating: true,
                liveMusic: false,
                fullMenu: false
            }
        ];

        // Find venue or default to first
        this.venue = venues.find(v => v.id === venueId) || venues[0];
        
        // If no valid venue ID, show error and redirect
        if (!venueId || !this.venue) {
            console.error('Invalid venue ID:', venueId);
            // Show error message and redirect option
            this.showVenueNotFoundError();
        }
    }

    setupEventListeners() {
        // Save button
        document.getElementById('saveBtn').addEventListener('click', () => {
            this.toggleSave();
        });

        // Action buttons
        document.getElementById('bookBtn').addEventListener('click', () => {
            this.handleBooking();
        });

        document.getElementById('directionsBtn').addEventListener('click', () => {
            this.getDirections();
        });

        document.getElementById('callBtn').addEventListener('click', () => {
            this.callVenue();
        });

        // Social actions
        document.getElementById('shareBtn').addEventListener('click', () => {
            this.shareVenue();
        });

        document.getElementById('addToListBtn').addEventListener('click', () => {
            this.addToList();
        });

        document.getElementById('createPlanBtn').addEventListener('click', () => {
            this.createPlan();
        });
    }

    renderVenue() {
        if (!this.venue) return;

        // Basic info
        document.getElementById('venueName').textContent = this.venue.name;
        document.getElementById('venueRating').textContent = this.venue.rating;
        document.getElementById('venueType').textContent = this.venue.type;
        document.getElementById('venuePrice').textContent = this.venue.price;
        document.getElementById('venueNeighborhood').textContent = this.venue.neighborhood;
        document.getElementById('venueDistance').textContent = `${this.venue.distance} mi away`;
        document.getElementById('venueDescription').textContent = this.venue.description;
        
        // Hero image
        document.getElementById('venueImage').src = this.venue.image;
        document.getElementById('venueImage').alt = this.venue.name;

        // Vibe tags
        const vibeTagsContainer = document.getElementById('vibeTags');
        vibeTagsContainer.innerHTML = this.venue.vibes.map(vibe => 
            `<span class="vibe-tag">${vibe}</span>`
        ).join('');

        // Update page title
        document.title = `${this.venue.name} | SceneLink`;
    }

    loadPhotos() {
        // Mock photo data
        const photos = [
            "/assets/img/placeholder-venue.svg",
            "/assets/img/placeholder-venue.svg",
            "/assets/img/placeholder-venue.svg",
            "/assets/img/placeholder-venue.svg",
            "/assets/img/placeholder-venue.svg",
            "/assets/img/placeholder-venue.svg"
        ];

        const galleryGrid = document.getElementById('galleryGrid');
        galleryGrid.innerHTML = photos.map((photo, index) => `
            <div class="gallery-item" onclick="venueDetailsPage.viewPhoto(${index})">
                <img src="${photo}" alt="${this.venue.name} photo ${index + 1}" loading="lazy">
            </div>
        `).join('');
    }

    loadReviews() {
        // Mock review data
        const reviews = [
            {
                author: "Sarah Johnson",
                rating: 5,
                date: "2 days ago",
                text: "Absolutely amazing experience! The atmosphere was perfect and the service was impeccable. Will definitely be coming back."
            },
            {
                author: "Mike Chen",
                rating: 4,
                date: "1 week ago",
                text: "Great spot for a night out. The drinks were creative and well-made. Can get a bit crowded on weekends though."
            },
            {
                author: "Emily Davis",
                rating: 5,
                date: "2 weeks ago",
                text: "Perfect date night location! The ambiance is romantic and the staff is very attentive. Highly recommend."
            }
        ];

        const reviewsList = document.getElementById('reviewsList');
        reviewsList.innerHTML = reviews.map(review => `
            <div class="review-item">
                <div class="review-header">
                    <div>
                        <div class="review-author">${review.author}</div>
                        <div class="review-date">${review.date}</div>
                    </div>
                    <div class="review-rating">
                        ${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}
                    </div>
                </div>
                <p class="review-text">${review.text}</p>
            </div>
        `).join('');
    }

    loadSimilarVenues() {
        // Mock similar venues data
        const similarVenues = [
            {
                id: 4,
                name: "The Velvet Lounge",
                type: "Cocktail Bar",
                rating: 4.7,
                image: "/assets/img/placeholder-venue.svg"
            },
            {
                id: 5,
                name: "Midnight Jazz Club",
                type: "Jazz Bar",
                rating: 4.8,
                image: "/assets/img/placeholder-venue.svg"
            },
            {
                id: 6,
                name: "The Rooftop Garden",
                type: "Roofop Bar",
                rating: 4.6,
                image: "/assets/img/placeholder-venue.svg"
            }
        ];

        const similarVenuesContainer = document.getElementById('similarVenues');
        similarVenuesContainer.innerHTML = similarVenues.map(venue => `
            <div class="similar-venue-card" onclick="venueDetailsPage.viewVenue(${venue.id})">
                <div class="similar-venue-image">
                    <img src="${venue.image}" alt="${venue.name}">
                </div>
                <div class="similar-venue-info">
                    <div class="similar-venue-name">${venue.name}</div>
                    <div class="similar-venue-meta">
                        <span>${venue.type}</span>
                        <span>•</span>
                        <span class="similar-venue-rating">★ ${venue.rating}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    toggleSave() {
        this.isSaved = !this.isSaved;
        const saveBtn = document.getElementById('saveBtn');
        const icon = saveBtn.querySelector('i');
        
        if (this.isSaved) {
            saveBtn.classList.add('saved');
            icon.classList.remove('far');
            icon.classList.add('fas');
            saveBtn.querySelector('span').textContent = 'Saved';
            this.showToast('Saved to favorites!');
        } else {
            saveBtn.classList.remove('saved');
            icon.classList.remove('fas');
            icon.classList.add('far');
            saveBtn.querySelector('span').textContent = 'Save';
            this.showToast('Removed from favorites');
        }
    }

    handleBooking() {
        // In real app, this would open booking modal or redirect to booking system
        this.showToast('Opening booking system...');
        setTimeout(() => {
            alert('Booking functionality would be implemented here with reservation system integration.');
        }, 1000);
    }

    getDirections() {
        if (this.venue && this.venue.address) {
            // Open in maps app
            const encodedAddress = encodeURIComponent(this.venue.address);
            window.open(`https://maps.google.com/?q=${encodedAddress}`, '_blank');
        }
    }

    callVenue() {
        if (this.venue && this.venue.phone) {
            window.location.href = `tel:${this.venue.phone}`;
        }
    }

    shareVenue() {
        if (navigator.share) {
            navigator.share({
                title: this.venue.name,
                text: `Check out ${this.venue.name} - ${this.venue.description}`,
                url: window.location.href
            }).catch(err => console.log('Share failed:', err));
        } else {
            // Fallback - copy to clipboard
            navigator.clipboard.writeText(window.location.href);
            this.showToast('Link copied to clipboard!');
        }
    }

    addToList() {
        // In real app, this would open list selection modal
        const listName = prompt('Which list would you like to add this to?');
        if (listName) {
            this.showToast(`Added to "${listName}" list!`);
        }
    }

    createPlan() {
        // In real app, this would open plan creation modal
        const planName = prompt('What would you like to name your plan?');
        if (planName) {
            this.showToast(`Created plan "${planName}" with ${this.venue.name}!`);
        }
    }

    viewPhoto(index) {
        // In real app, this would open photo viewer/lightbox
        this.showToast(`Viewing photo ${index + 1}`);
    }

    viewVenue(venueId) {
        // Navigate to venue details
        window.location.href = `venue-details.html?id=${venueId}`;
    }

    showVenueNotFoundError() {
        const content = document.querySelector('.venue-details-page');
        content.innerHTML = `
            <div class="venue-error-container">
                <div class="error-content">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h2>Venue Not Found</h2>
                    <p>We couldn't find the venue you're looking for.</p>
                    <button class="back-to-explore-btn" onclick="window.location.href='explore.html'">
                        <i class="fas fa-arrow-left"></i>
                        Back to Explore
                    </button>
                </div>
            </div>
        `;
    }

    showToast(message) {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 12px 24px;
            border-radius: 24px;
            font-size: 14px;
            z-index: 1000;
            animation: slideUp 0.3s ease;
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideDown 0.3s ease';
            setTimeout(() => {
                if (document.body.contains(toast)) {
                    document.body.removeChild(toast);
                }
            }, 300);
        }, 2000);
    }
}

// Initialize the venue details page
const venueDetailsPage = new VenueDetailsPage();

// Weather Modal Functions
window.openWeatherModal = function() {
    document.getElementById('weatherModal').classList.add('active');
    loadWeatherData();
};

window.closeWeatherModal = function() {
    document.getElementById('weatherModal').classList.remove('active');
};

window.subscribeNewsletter = function() {
    const email = document.querySelector('.newsletter-form input').value;
    if (email && email.includes('@')) {
        showToast('Subscribed to nightly recommendations!');
        document.querySelector('.newsletter-form input').value = '';
    } else {
        showToast('Please enter a valid email address');
    }
};

// Weather data loading
function loadWeatherData() {
    // Get user's location and load weather data
    getUserLocation().then(location => {
        getWeatherForLocation(location);
    }).catch(error => {
        // Fallback to Boston if location access denied
        getWeatherForLocation({ lat: 42.3601, lng: -71.0589, city: 'Boston' });
    });
}

async function getUserLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation not supported'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const location = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    city: 'Your Location'
                };
                resolve(location);
            },
            (error) => {
                reject(error);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 300000
            }
        );
    });
}

function getWeatherForLocation(location) {
    // Mock weather data - in production, call real weather API
    const weatherConditions = [
        {
            temperature: 72,
            condition: 'Partly Cloudy',
            icon: 'cloud-sun',
            suggestions: [
                { icon: 'umbrella', text: 'Rainy day? Try indoor venues' },
                { icon: 'sun', text: 'Perfect for rooftop bars' },
                { icon: 'wind', text: 'Cool evening? Cozy lounges' }
            ]
        },
        {
            temperature: 68,
            condition: 'Sunny',
            icon: 'sun',
            suggestions: [
                { icon: 'sun', text: 'Perfect for outdoor dining' },
                { icon: 'umbrella', text: 'Rooftop bars with great views' },
                { icon: 'thermometer-half', text: 'Comfortable evening for patio seating' }
            ]
        },
        {
            temperature: 55,
            condition: 'Rainy',
            icon: 'cloud-rain',
            suggestions: [
                { icon: 'umbrella', text: 'Cozy indoor venues recommended' },
                { icon: 'cocktail', text: 'Perfect for cocktail lounges' },
                { icon: 'music', text: 'Live music venues for entertainment' }
            ]
        }
    ];

    const hour = new Date().getHours();
    const randomIndex = Math.floor(Math.random() * weatherConditions.length);
    let weather = weatherConditions[randomIndex];
    
    if (hour >= 18 && hour <= 22) {
        weather.temperature -= 5;
        weather.condition = weather.temperature < 60 ? 'Cool Evening' : 'Pleasant Evening';
    }

    weather.location = location.city;
    updateWeatherModal(weather);
}

function updateWeatherModal(weather) {
    const currentDiv = document.querySelector('.weather-current');
    const suggestionsDiv = document.querySelector('.weather-suggestions');

    currentDiv.innerHTML = `
        <i class="fas fa-${weather.icon}"></i>
        <span>${weather.temperature}°F ${weather.condition}</span>
    `;

    suggestionsDiv.innerHTML = weather.suggestions.map(suggestion => `
        <div class="weather-suggestion">
            <i class="fas fa-${suggestion.icon}"></i>
            <span>${suggestion.text}</span>
        </div>
    `).join('');
}

// Add CSS animations for toast
const style = document.createElement('style');
style.textContent = `
    @keyframes slideUp {
        from {
            transform: translate(-50%, 100%);
            opacity: 0;
        }
        to {
            transform: translate(-50%, 0);
            opacity: 1;
        }
    }
    
    @keyframes slideDown {
        from {
            transform: translate(-50%, 0);
            opacity: 1;
        }
        to {
            transform: translate(-50%, 100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);