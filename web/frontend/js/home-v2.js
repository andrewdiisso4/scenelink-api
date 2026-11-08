// SceneLink V2 - Homepage JavaScript with Google Maps

let map;
let markers = [];
let infoWindow;

// Boston coordinates
const bostonCenter = { lat: 42.3601, lng: -71.0589 };

// Sample venue data
// Phase 5D-B: emptied. Was hardcoded fallback list (Mamma Maria, Neptune
// Oyster, The Beehive, Drink, Yvonne's, Toro, The Sinclair, Royale Nightclub,
// Capo, Lolita Cocina). Only used by the Google-Maps fallback path which is
// unreachable in production (homeMap div is always present and unified-map
// handles it with live /api/venues data).
const venues = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Skip Google Maps init if unified map is present
    if (!document.getElementById('homeMap')) {
        initGoogleMap();
    }
    initEventListeners();
});

// Initialize Google Map
function initGoogleMap() {
    // Check if Google Maps API is loaded
    if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
        console.warn('Google Maps API not loaded. Using fallback.');
        displayMapFallback();
        return;
    }

    // Create map
    map = new google.maps.Map(document.getElementById('googleMap'), {
        center: bostonCenter,
        zoom: 13,
        styles: getDarkMapStyle(),
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true
    });

    // Create info window
    infoWindow = new google.maps.InfoWindow();

    // Add markers for venues
    venues.forEach(venue => {
        addMarker(venue);
    });
}

// Add marker to map
function addMarker(venue) {
    const marker = new google.maps.Marker({
        position: { lat: venue.lat, lng: venue.lng },
        map: map,
        title: venue.name,
        icon: getMarkerIcon(venue.type),
        animation: google.maps.Animation.DROP
    });

    // Add click listener
    marker.addListener('click', () => {
        const content = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 12px; min-width: 200px;">
                <h3 style="margin: 0 0 8px 0; color: #D4AF37; font-size: 18px;">${venue.name}</h3>
                <p style="margin: 0 0 8px 0; color: #666; font-size: 14px;">${venue.category}</p>
                <p style="margin: 0 0 12px 0; color: #999; font-size: 12px; text-transform: capitalize;">${venue.type}</p>
                <button onclick="window.location.href='restaurant-detail.html'" style="width: 100%; padding: 10px; background: #D4AF37; color: #000; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px;">View Details</button>
            </div>
        `;
        infoWindow.setContent(content);
        infoWindow.open(map, marker);
    });

    markers.push(marker);
}

// Get custom marker icon based on venue type
function getMarkerIcon(type) {
    const colors = {
        restaurant: '#D4AF37',
        bar: '#9C27B0',
        event: '#4CAF50',
        nightlife: '#E91E63'
    };

    return {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: colors[type] || '#D4AF37',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
        scale: 10
    };
}

// Dark map style
function getDarkMapStyle() {
    return [
        { elementType: "geometry", stylers: [{ color: "#1a1a1a" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a1a" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#b0b0b0" }] },
        {
            featureType: "administrative.locality",
            elementType: "labels.text.fill",
            stylers: [{ color: "#D4AF37" }]
        },
        {
            featureType: "poi",
            elementType: "labels.text.fill",
            stylers: [{ color: "#808080" }]
        },
        {
            featureType: "poi.park",
            elementType: "geometry",
            stylers: [{ color: "#252525" }]
        },
        {
            featureType: "poi.park",
            elementType: "labels.text.fill",
            stylers: [{ color: "#808080" }]
        },
        {
            featureType: "road",
            elementType: "geometry",
            stylers: [{ color: "#2d2d2d" }]
        },
        {
            featureType: "road",
            elementType: "geometry.stroke",
            stylers: [{ color: "#1a1a1a" }]
        },
        {
            featureType: "road",
            elementType: "labels.text.fill",
            stylers: [{ color: "#b0b0b0" }]
        },
        {
            featureType: "road.highway",
            elementType: "geometry",
            stylers: [{ color: "#3d3d3d" }]
        },
        {
            featureType: "road.highway",
            elementType: "geometry.stroke",
            stylers: [{ color: "#1a1a1a" }]
        },
        {
            featureType: "road.highway",
            elementType: "labels.text.fill",
            stylers: [{ color: "#D4AF37" }]
        },
        {
            featureType: "transit",
            elementType: "geometry",
            stylers: [{ color: "#2d2d2d" }]
        },
        {
            featureType: "transit.station",
            elementType: "labels.text.fill",
            stylers: [{ color: "#808080" }]
        },
        {
            featureType: "water",
            elementType: "geometry",
            stylers: [{ color: "#0a0a0a" }]
        },
        {
            featureType: "water",
            elementType: "labels.text.fill",
            stylers: [{ color: "#808080" }]
        },
        {
            featureType: "water",
            elementType: "labels.text.stroke",
            stylers: [{ color: "#0a0a0a" }]
        }
    ];
}

// Fallback if Google Maps not loaded
function displayMapFallback() {
    const mapContainer = document.getElementById('googleMap');
    if (!mapContainer) return; // Skip if unified map replaced this
    mapContainer.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: var(--dark-lighter); color: var(--text-secondary);">
            <div style="text-align: center; padding: 40px;">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin: 0 auto 20px; opacity: 0.5;">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                </svg>
                <h3 style="margin-bottom: 10px;">Map Loading...</h3>
                <p>Please add your Google Maps API key to enable the interactive map.</p>
            </div>
        </div>
    `;
}

// Initialize event listeners
function initEventListeners() {
    // Category chips
    document.querySelectorAll('.category-chip').forEach(chip => {
        chip.addEventListener('click', function() {
            const category = this.dataset.category;
            handleCategoryClick(category);
        });
    });

    // Hero search
    const heroSearch = document.getElementById('heroSearch');
    const searchBtn = document.querySelector('.btn-search-main');
    
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            const query = heroSearch.value;
            if (query) {
                window.location.href = `explore.html?search=${encodeURIComponent(query)}`;
            }
        });
    }

    if (heroSearch) {
        heroSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = heroSearch.value;
                if (query) {
                    window.location.href = `explore.html?search=${encodeURIComponent(query)}`;
                }
            }
        });
    }

    // View all button
    const viewAllBtn = document.getElementById('viewAllBtn');
    if (viewAllBtn) {
        viewAllBtn.addEventListener('click', () => {
            window.location.href = 'explore.html';
        });
    }

    // City selector
    const citySelector = document.getElementById('citySelector');
    if (citySelector) {
        citySelector.addEventListener('change', function() {
            if (this.value !== 'boston') {
                showNotification('Coming Soon', `${this.options[this.selectedIndex].text} will be available soon!`);
                this.value = 'boston';
            }
        });
    }

    // Signup buttons
    const signupButtons = [
        document.getElementById('headerSignupBtn'),
        document.getElementById('ctaSignupBtn'),
        document.getElementById('footerSignupBtn')
    ];

    signupButtons.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => openModal('signupModal'));
        }
    });

    // Login button
    const loginBtn = document.getElementById('footerLoginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openModal('loginModal');
        });
    }

    // Modal close buttons
    document.getElementById('closeSignupModal')?.addEventListener('click', () => closeModal('signupModal'));
    document.getElementById('closeLoginModal')?.addEventListener('click', () => closeModal('loginModal'));

    // Switch between modals
    document.getElementById('showLoginModal')?.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal('signupModal');
        openModal('loginModal');
    });

    document.getElementById('showSignupModal')?.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal('loginModal');
        openModal('signupModal');
    });

    // Form submissions
    document.getElementById('signupForm')?.addEventListener('submit', handleSignup);
    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);

    // Close modal on outside click
    document.querySelectorAll('.modal-v2').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal.id);
            }
        });
    });

    // Mobile menu
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', toggleMobileMenu);
    }
}

// Handle category click
function handleCategoryClick(category) {
    const routes = {
        restaurants: 'explore.html?category=restaurants',
        bars: 'nightlife.html?type=bar',
        events: 'events.html',
        nightlife: 'nightlife.html'
    };

    if (routes[category]) {
        window.location.href = routes[category];
    }
}

// Modal functions
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Form handlers
function handleSignup(e) {
    e.preventDefault();
    
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    
    // Store user data
    localStorage.setItem('scenelink_user', JSON.stringify({
        name: name,
        email: email,
        joinedDate: new Date().toISOString()
    }));
    
    closeModal('signupModal');
    showNotification('Welcome to SceneLink!', `Account created successfully. Welcome, ${name}!`);
    
    setTimeout(() => {
        window.location.href = 'explore.html';
    }, 2000);
}

function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    const storedUser = localStorage.getItem('scenelink_user');
    
    if (storedUser) {
        const user = JSON.parse(storedUser);
        closeModal('loginModal');
        showNotification('Welcome Back!', `Logged in as ${user.name}`);
        
        setTimeout(() => {
            window.location.href = 'explore.html';
        }, 1500);
    } else {
        showNotification('Login Failed', 'Please check your credentials or sign up for a new account.');
    }
}

// Mobile menu toggle
function toggleMobileMenu() {
    const navCenter = document.querySelector('.nav-center');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    
    if (navCenter) {
        navCenter.classList.toggle('active');
        mobileMenuBtn.classList.toggle('active');
    }
}

// Notification system
function showNotification(title, message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: linear-gradient(135deg, #1a1a1a, #252525);
        border: 1px solid rgba(212, 175, 55, 0.3);
        border-radius: 12px;
        padding: 20px;
        max-width: 350px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        z-index: 3000;
        animation: slideIn 0.3s ease;
    `;
    
    notification.innerHTML = `
        <h4 style="margin: 0 0 8px 0; color: #D4AF37; font-size: 16px;">${title}</h4>
        <p style="margin: 0; color: #b0b0b0; font-size: 14px; line-height: 1.5;">${message}</p>
    `;
    
    document.body.appendChild(notification);
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
    
    setTimeout(() => {
        notification.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 4000);
}

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});