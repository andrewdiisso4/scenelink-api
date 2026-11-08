// SceneLink - Modern Homepage JavaScript

// Initialize map
let map;
let markers = [];

// Boston coordinates
const bostonCoords = [42.3601, -71.0589];

// Sample venue data for map
const venues = [
    { name: "Mamma Maria", lat: 42.3647, lng: -71.0542, type: "restaurant" },
    { name: "Neptune Oyster", lat: 42.3651, lng: -71.0537, type: "restaurant" },
    { name: "The Beehive", lat: 42.3467, lng: -71.0707, type: "event" },
    { name: "Drink", lat: 42.3520, lng: -71.0502, type: "nightlife" },
    { name: "Yvonne's", lat: 42.3559, lng: -71.0550, type: "nightlife" },
    { name: "Toro", lat: 42.3467, lng: -71.0707, type: "restaurant" },
    { name: "The Sinclair", lat: 42.3736, lng: -71.1097, type: "event" },
    { name: "Royale Nightclub", lat: 42.3505, lng: -71.0621, type: "nightlife" }
];

// Initialize map on page load
document.addEventListener('DOMContentLoaded', function() {
    initMap();
    initEventListeners();
});

function initMap() {
    // Initialize Leaflet map
    map = L.map('mainMap').setView(bostonCoords, 13);
    
    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);
    
    // Custom marker icons - improved visibility
    const goldIcon = L.divIcon({
        className: 'custom-marker',
        html: '<div style="background: linear-gradient(135deg, #D4AF37, #E8C968); width: 36px; height: 36px; border-radius: 50%; border: 3px solid rgba(255,255,255,0.6); box-shadow: 0 3px 12px rgba(0,0,0,0.4), 0 0 0 2px rgba(212,175,55,0.3); display:flex; align-items:center; justify-content:center; font-size:16px; cursor:pointer;">📍</div>',
        iconSize: [36, 36],
        iconAnchor: [18, 18]
    });
    
    // Add markers for venues
    venues.forEach(venue => {
        const marker = L.marker([venue.lat, venue.lng], { icon: goldIcon })
            .addTo(map)
            .bindPopup(`
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 8px;">
                    <h3 style="margin: 0 0 8px 0; color: #D4AF37; font-size: 16px;">${venue.name}</h3>
                    <p style="margin: 0; color: #666; font-size: 14px; text-transform: capitalize;">${venue.type}</p>
                </div>
            `);
        markers.push(marker);
    });
}

function initEventListeners() {
    // City card selection
    const cityCards = document.querySelectorAll('.city-card');
    cityCards.forEach(card => {
        card.addEventListener('click', function() {
            const city = this.dataset.city;
            
            if (city === 'boston') {
                // Already active, do nothing or navigate to explore
                window.location.href = 'explore.html';
            } else {
                // Show coming soon message
                showNotification('Coming Soon!', `${this.querySelector('h4').textContent} will be available soon. Stay tuned!`);
            }
        });
    });
    
    // Signup button handlers
    const signupButtons = [
        document.getElementById('headerSignupBtn'),
        document.getElementById('socialSignupBtn'),
        document.getElementById('ctaSignupBtn')
    ];
    
    signupButtons.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => openModal('signupModal'));
        }
    });
    
    // Login button handlers
    const loginButtons = [
        document.getElementById('footerLoginBtn')
    ];
    
    loginButtons.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                openModal('loginModal');
            });
        }
    });
    
    // Footer signup button
    const footerSignupBtn = document.getElementById('footerSignupBtn');
    if (footerSignupBtn) {
        footerSignupBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openModal('signupModal');
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
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal.id);
            }
        });
    });
    
    // Mobile menu toggle
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const navMenu = document.querySelector('.nav-menu');
    
    if (mobileMenuBtn && navMenu) {
        mobileMenuBtn.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            mobileMenuBtn.classList.toggle('active');
        });
    }
}

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

function handleSignup(e) {
    e.preventDefault();
    
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    
    // Store user data (in real app, this would be sent to backend)
    localStorage.setItem('scenelink_user', JSON.stringify({
        name: name,
        email: email,
        joinedDate: new Date().toISOString()
    }));
    
    closeModal('signupModal');
    showNotification('Welcome to SceneLink!', `Account created successfully. Welcome, ${name}!`);
    
    // Redirect to explore page after short delay
    setTimeout(() => {
        window.location.href = 'explore.html';
    }, 2000);
}

function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    // Simple validation (in real app, this would authenticate with backend)
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

function showNotification(title, message) {
    // Create notification element
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
    
    // Add slide-in animation
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
    
    // Remove notification after 4 seconds
    setTimeout(() => {
        notification.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 4000);
}

// Smooth scroll for anchor links
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