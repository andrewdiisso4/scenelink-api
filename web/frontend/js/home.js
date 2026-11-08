// Home page JavaScript

document.addEventListener('DOMContentLoaded', async () => {
  await loadRestaurants();
  displayFeaturedRestaurants();
  displayEvents();
  displayNightlife();
  setupSignupButtons();
  setupCitySelector();
  setupCityCards();
});

function displayFeaturedRestaurants() {
  const container = document.getElementById('featuredRestaurants');
  
  // Get top 6 restaurants by rating
  const featured = SceneLink.restaurants
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 6);
  
  const html = featured.map(r => createRestaurantCard(r)).join('');
  container.innerHTML = html;
  
  // Add event listeners for favorite buttons
  container.querySelectorAll('.favorite-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const id = parseInt(btn.dataset.id);
      toggleFavorite(id);
      btn.style.color = isFavorite(id) ? 'var(--gold-primary)' : 'var(--text-muted)';
      btn.innerHTML = isFavorite(id) ? '❤️' : '🤍';
      btn.title = isFavorite(id) ? 'Remove from favorites' : 'Add to favorites';
    });
  });
}

function displayEvents() {
  const container = document.getElementById('eventsGrid');
  
  // Filter venues with Event tag
  const events = SceneLink.restaurants
    .filter(r => r.tags.some(tag => tag.toLowerCase().includes('event') || 
                                     tag.toLowerCase().includes('live music') ||
                                     tag.toLowerCase().includes('concert')))
    .slice(0, 3);
  
  if (events.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center;">No events available at the moment.</p>';
    return;
  }
  
  const html = events.map(event => `
    <div class="card" style="position: relative; overflow: hidden;">
      <div style="position: absolute; top: 1rem; right: 1rem; background: var(--gold-primary); color: var(--dark-bg); padding: 0.5rem 1rem; border-radius: var(--radius-sm); font-weight: 600; font-size: 0.85rem; z-index: 1;">
        LIVE EVENT
      </div>
      <img src="${event.image}" alt="${event.name}" class="card-image" loading="lazy">
      <div class="card-content">
        <h3 class="card-title">${event.name}</h3>
        <p class="card-subtitle">${event.cuisine} • ${event.neighborhood}</p>
        <div style="display: flex; align-items: center; gap: 0.5rem; margin: 0.75rem 0;">
          ${generateStars(event.rating)}
          <span class="rating-text">${event.rating}</span>
        </div>
        <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1rem; line-height: 1.5;">
          ${event.description.substring(0, 100)}...
        </p>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem;">
          ${event.tags.slice(0, 3).map(tag => `<span class="tag">${tag}</span>`).join('')}
        </div>
        <a href="restaurant-detail.html?id=${event.id}" class="btn btn-primary" style="width: 100%; justify-content: center;">
          View Details
        </a>
      </div>
    </div>
  `).join('');
  
  container.innerHTML = html;
}

function displayNightlife() {
  const container = document.getElementById('nightlifeGrid');
  
  // Filter venues with Nightlife tag
  const nightlife = SceneLink.restaurants
    .filter(r => r.tags.some(tag => tag.toLowerCase().includes('nightlife') || 
                                     tag.toLowerCase().includes('nightclub') ||
                                     tag.toLowerCase().includes('bar') ||
                                     tag.toLowerCase().includes('cocktail')))
    .slice(0, 3);
  
  if (nightlife.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center;">No nightlife venues available at the moment.</p>';
    return;
  }
  
  const html = nightlife.map(venue => `
    <div class="card" style="position: relative; overflow: hidden;">
      <div style="position: absolute; top: 1rem; right: 1rem; background: rgba(138, 43, 226, 0.9); color: white; padding: 0.5rem 1rem; border-radius: var(--radius-sm); font-weight: 600; font-size: 0.85rem; z-index: 1;">
        🌙 NIGHTLIFE
      </div>
      <img src="${venue.image}" alt="${venue.name}" class="card-image" loading="lazy">
      <div class="card-content">
        <h3 class="card-title">${venue.name}</h3>
        <p class="card-subtitle">${venue.cuisine} • ${venue.neighborhood}</p>
        <div style="display: flex; align-items: center; gap: 0.5rem; margin: 0.75rem 0;">
          ${generateStars(venue.rating)}
          <span class="rating-text">${venue.rating}</span>
        </div>
        <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1rem; line-height: 1.5;">
          ${venue.description.substring(0, 100)}...
        </p>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem;">
          ${venue.tags.slice(0, 3).map(tag => `<span class="tag">${tag}</span>`).join('')}
        </div>
        <a href="restaurant-detail.html?id=${venue.id}" class="btn btn-primary" style="width: 100%; justify-content: center;">
          View Details
        </a>
      </div>
    </div>
  `).join('');
  
  container.innerHTML = html;
}

function setupSignupButtons() {
  const signupBtn = document.getElementById('signupBtn');
  const heroSignupBtn = document.getElementById('heroSignupBtn');
  const communitySignupBtn = document.getElementById('communitySignupBtn');
  
  if (signupBtn) {
    signupBtn.addEventListener('click', showSignupModal);
  }
  
  if (heroSignupBtn) {
    heroSignupBtn.addEventListener('click', showSignupModal);
  }
  
  if (communitySignupBtn) {
    communitySignupBtn.addEventListener('click', showSignupModal);
  }
}

function setupCitySelector() {
  const citySelector = document.getElementById('citySelector');
  
  if (citySelector) {
    citySelector.addEventListener('change', (e) => {
      const city = e.target.value;
      if (city === 'boston') {
        // Already on Boston
        showNotification('Showing venues in Boston', 'success');
      } else {
        showNotification(`${e.target.options[e.target.selectedIndex].text} coming soon!`, 'info');
        // Reset to Boston
        setTimeout(() => {
          citySelector.value = 'boston';
        }, 1000);
      }
    });
  }
}

function setupCityCards() {
  const cityCards = document.querySelectorAll('.city-card');
  
  cityCards.forEach(card => {
    card.addEventListener('mouseenter', () => {
      card.style.borderColor = 'var(--gold-primary)';
      card.style.transform = 'translateY(-5px)';
    });
    
    card.addEventListener('mouseleave', () => {
      card.style.borderColor = 'transparent';
      card.style.transform = 'translateY(0)';
    });
    
    card.addEventListener('click', () => {
      const city = card.dataset.city;
      if (city === 'boston') {
        window.location.href = 'explore.html';
      } else {
        showNotification('This city is coming soon!', 'info');
      }
    });
  });
}

function showSignupModal() {
  const modalHtml = `
    <div id="signupModal" class="modal active">
      <div class="modal-content" style="max-width: 500px;">
        <div class="modal-header">
          <h2 style="margin: 0;">Join SceneLink</h2>
          <button class="modal-close" onclick="document.getElementById('signupModal').remove()">✕</button>
        </div>
        <div class="modal-body">
          <p style="color: var(--text-muted); margin-bottom: 1.5rem;">Create your account and start discovering amazing places</p>
          
          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem; color: var(--text-primary); font-weight: 600;">Full Name</label>
            <input type="text" id="signupName" placeholder="Enter your name" style="width: 100%; padding: 0.75rem; background: var(--dark-lighter); border: 1px solid rgba(212, 175, 55, 0.2); border-radius: var(--radius-sm); color: var(--text-primary); font-size: 1rem;">
          </div>
          
          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem; color: var(--text-primary); font-weight: 600;">Email</label>
            <input type="email" id="signupEmail" placeholder="your@email.com" style="width: 100%; padding: 0.75rem; background: var(--dark-lighter); border: 1px solid rgba(212, 175, 55, 0.2); border-radius: var(--radius-sm); color: var(--text-primary); font-size: 1rem;">
          </div>
          
          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem; color: var(--text-primary); font-weight: 600;">Password</label>
            <input type="password" id="signupPassword" placeholder="Create a password" style="width: 100%; padding: 0.75rem; background: var(--dark-lighter); border: 1px solid rgba(212, 175, 55, 0.2); border-radius: var(--radius-sm); color: var(--text-primary); font-size: 1rem;">
          </div>
          
          <div style="margin-bottom: 1.5rem; padding: 1rem; background: var(--dark-lighter); border-radius: var(--radius-sm); border: 1px solid rgba(212, 175, 55, 0.2);">
            <p style="color: var(--text-primary); font-weight: 600; margin-bottom: 0.75rem;">Connect Your Social Media</p>
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
              <button class="btn btn-secondary" style="width: 100%; justify-content: center; gap: 0.5rem;" onclick="connectInstagram()">
                <span style="font-size: 1.2rem;">📷</span>
                Connect Instagram
              </button>
              <button class="btn btn-secondary" style="width: 100%; justify-content: center; gap: 0.5rem;" onclick="connectTwitter()">
                <span style="font-size: 1.2rem;">🐦</span>
                Connect Twitter
              </button>
              <button class="btn btn-secondary" style="width: 100%; justify-content: center; gap: 0.5rem;" onclick="connectFacebook()">
                <span style="font-size: 1.2rem;">📘</span>
                Connect Facebook
              </button>
            </div>
          </div>
          
          <button id="confirmSignup" class="btn btn-primary" style="width: 100%; justify-content: center; padding: 1rem; font-size: 1.1rem;">
            Create Account
          </button>
          
          <p style="text-align: center; margin-top: 1rem; color: var(--text-muted); font-size: 0.9rem;">
            Already have an account? <a href="#" onclick="showLoginModal(); return false;" style="color: var(--gold-primary); text-decoration: none;">Sign In</a>
          </p>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  // Focus on name input
  document.getElementById('signupName').focus();
  
  // Handle signup
  document.getElementById('confirmSignup').addEventListener('click', () => {
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    
    if (!name || !email || !password) {
      showNotification('Please fill in all fields', 'error');
      return;
    }
    
    // Simulate account creation
    showNotification(`Welcome to SceneLink, ${name}!`, 'success');
    document.getElementById('signupModal').remove();
    
    // Redirect to profile after a short delay
    setTimeout(() => {
      window.location.href = 'profile.html';
    }, 1500);
  });
  
  // Close on background click
  document.getElementById('signupModal').addEventListener('click', (e) => {
    if (e.target.id === 'signupModal') {
      document.getElementById('signupModal').remove();
    }
  });
}

function showLoginModal() {
  // Close signup modal if open
  const signupModal = document.getElementById('signupModal');
  if (signupModal) signupModal.remove();
  
  const modalHtml = `
    <div id="loginModal" class="modal active">
      <div class="modal-content" style="max-width: 450px;">
        <div class="modal-header">
          <h2 style="margin: 0;">Welcome Back</h2>
          <button class="modal-close" onclick="document.getElementById('loginModal').remove()">✕</button>
        </div>
        <div class="modal-body">
          <p style="color: var(--text-muted); margin-bottom: 1.5rem;">Sign in to your SceneLink account</p>
          
          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem; color: var(--text-primary); font-weight: 600;">Email</label>
            <input type="email" id="loginEmail" placeholder="your@email.com" style="width: 100%; padding: 0.75rem; background: var(--dark-lighter); border: 1px solid rgba(212, 175, 55, 0.2); border-radius: var(--radius-sm); color: var(--text-primary); font-size: 1rem;">
          </div>
          
          <div style="margin-bottom: 1.5rem;">
            <label style="display: block; margin-bottom: 0.5rem; color: var(--text-primary); font-weight: 600;">Password</label>
            <input type="password" id="loginPassword" placeholder="Enter your password" style="width: 100%; padding: 0.75rem; background: var(--dark-lighter); border: 1px solid rgba(212, 175, 55, 0.2); border-radius: var(--radius-sm); color: var(--text-primary); font-size: 1rem;">
          </div>
          
          <button id="confirmLogin" class="btn btn-primary" style="width: 100%; justify-content: center; padding: 1rem; font-size: 1.1rem;">
            Sign In
          </button>
          
          <p style="text-align: center; margin-top: 1rem; color: var(--text-muted); font-size: 0.9rem;">
            Don't have an account? <a href="#" onclick="showSignupModal(); return false;" style="color: var(--gold-primary); text-decoration: none;">Sign Up</a>
          </p>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  // Focus on email input
  document.getElementById('loginEmail').focus();
  
  // Handle login
  document.getElementById('confirmLogin').addEventListener('click', () => {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
      showNotification('Please fill in all fields', 'error');
      return;
    }
    
    // Simulate login
    showNotification('Welcome back!', 'success');
    document.getElementById('loginModal').remove();
    
    // Redirect to profile after a short delay
    setTimeout(() => {
      window.location.href = 'profile.html';
    }, 1500);
  });
  
  // Close on background click
  document.getElementById('loginModal').addEventListener('click', (e) => {
    if (e.target.id === 'loginModal') {
      document.getElementById('loginModal').remove();
    }
  });
}

function connectInstagram() {
  showNotification('Instagram connection coming soon!', 'info');
}

function connectTwitter() {
  showNotification('Twitter connection coming soon!', 'info');
}

function connectFacebook() {
  showNotification('Facebook connection coming soon!', 'info');
}
function setupCitySelector() {
  const citySelector = document.getElementById('citySelector');
  
  if (citySelector) {
    citySelector.addEventListener('change', (e) => {
      const city = e.target.value;
      if (city === 'boston') {
        showNotification('Showing venues in Boston', 'info');
      } else {
        showNotification(`${e.target.options[e.target.selectedIndex].text} coming soon!`, 'info');
        setTimeout(() => {
          citySelector.value = 'boston';
        }, 1000);
      }
    });
  }
}

function setupCityCards() {
  const cityCards = document.querySelectorAll('.city-card');
  
  cityCards.forEach(card => {
    card.addEventListener('mouseenter', () => {
      card.style.borderColor = 'var(--gold-primary)';
      card.style.transform = 'translateY(-5px)';
    });
    
    card.addEventListener('mouseleave', () => {
      card.style.borderColor = 'transparent';
      card.style.transform = 'translateY(0)';
    });
    
    card.addEventListener('click', () => {
      const city = card.dataset.city;
      if (city === 'boston') {
        window.location.href = 'explore.html';
      } else {
        showNotification('This city is coming soon!', 'info');
      }
    });
  });
}
