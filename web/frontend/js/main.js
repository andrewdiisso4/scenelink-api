// SceneLink - Main JavaScript
// Core utilities and shared functionality

// Global state management
const SceneLink = {
  currentUser: {
    id: 1,
    name: "Alex Rivera",
    username: "alexrivera",
    bio: "Food enthusiast exploring Boston's culinary scene",
    avatar: "/assets/img/placeholder-avatar.svg",
    points: 80,
    visitedRestaurants: 3,
    savedLists: 4,
    friends: [
      { id: 2, name: "Rachel", username: "rachel_foodie", avatar: "/assets/img/placeholder-avatar.svg", bio: "Food Enthusiast" },
      { id: 3, name: "Jake", username: "jake_nightlife", avatar: "/assets/img/placeholder-avatar.svg", bio: "Night life Aficionado" },
      { id: 4, name: "Olivia", username: "olivia_critic", avatar: "/assets/img/placeholder-avatar.svg", bio: "Restaurant Critic" },
      { id: 5, name: "Ethan", username: "ethan_chef", avatar: "/assets/img/placeholder-avatar.svg", bio: "Chef & Foodie" }
    ]
  },
  restaurants: [],
  favorites: [1, 3, 5, 8],
  lists: [
    { id: 1, name: "Brunch Squad Picks", count: 15, icon: "🥞", restaurants: [1, 2, 3] },
    { id: 2, name: "Date Night Spots", count: 10, icon: "💕", restaurants: [6, 9, 11] },
    { id: 3, name: "Chef's Counters", count: 8, icon: "👨‍🍳", restaurants: [5, 8, 11] },
    { id: 4, name: "Late Night Eats", count: 12, icon: "🌙", restaurants: [4, 7, 10] }
  ],
  rewards: [
    { id: 1, name: "Free Appetizer", points: 50, unlocked: true },
    { id: 2, name: "Priority Seating", points: 100, unlocked: false },
    { id: 3, name: "Complimentary Dessert", points: 150, unlocked: false }
  ]
};

// Load restaurants data
async function loadRestaurants() {
  try {
    const response = await fetch('data/restaurants.json');
    const data = await response.json();
    SceneLink.restaurants = Array.isArray(data) ? data : data.restaurants;
    return SceneLink.restaurants;
  } catch (error) {
    console.error('Error loading restaurants:', error);
    return [];
  }
}

// Get restaurant by ID
function getRestaurantById(id) {
  return SceneLink.restaurants.find(r => r.id === parseInt(id));
}

// Filter restaurants
function filterRestaurants(filters) {
  let filtered = [...SceneLink.restaurants];
  
  if (filters.cuisine) {
    filtered = filtered.filter(r => r.cuisine.toLowerCase().includes(filters.cuisine.toLowerCase()));
  }
  
  if (filters.neighborhood) {
    filtered = filtered.filter(r => r.neighborhood.toLowerCase().includes(filters.neighborhood.toLowerCase()));
  }
  
  if (filters.priceLevel) {
    filtered = filtered.filter(r => r.priceLevel === filters.priceLevel);
  }
  
  if (filters.rating) {
    filtered = filtered.filter(r => r.rating >= filters.rating);
  }
  
  if (filters.tags && filters.tags.length > 0) {
    filtered = filtered.filter(r => 
      filters.tags.some(tag => r.tags.some(t => t.toLowerCase().includes(tag.toLowerCase())))
    );
  }
  
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filtered = filtered.filter(r => 
      r.name.toLowerCase().includes(searchLower) ||
      r.description.toLowerCase().includes(searchLower) ||
      r.cuisine.toLowerCase().includes(searchLower)
    );
  }
  
  return filtered;
}

// Search restaurants
function searchRestaurants(query) {
  const searchLower = query.toLowerCase();
  return SceneLink.restaurants.filter(r => 
    r.name.toLowerCase().includes(searchLower) ||
    r.description.toLowerCase().includes(searchLower) ||
    r.cuisine.toLowerCase().includes(searchLower) ||
    r.tags.some(tag => tag.toLowerCase().includes(searchLower))
  );
}

// Toggle favorite
function toggleFavorite(restaurantId) {
  const index = SceneLink.favorites.indexOf(restaurantId);
  if (index > -1) {
    SceneLink.favorites.splice(index, 1);
    return false;
  } else {
    SceneLink.favorites.push(restaurantId);
    return true;
  }
}

// Check if restaurant is favorite
function isFavorite(restaurantId) {
  return SceneLink.favorites.includes(restaurantId);
}

// Add to list
function addToList(listId, restaurantId) {
  const list = SceneLink.lists.find(l => l.id === listId);
  if (list && !list.restaurants.includes(restaurantId)) {
    list.restaurants.push(restaurantId);
    list.count = list.restaurants.length;
    return true;
  }
  return false;
}

// Remove from list
function removeFromList(listId, restaurantId) {
  const list = SceneLink.lists.find(l => l.id === listId);
  if (list) {
    const index = list.restaurants.indexOf(restaurantId);
    if (index > -1) {
      list.restaurants.splice(index, 1);
      list.count = list.restaurants.length;
      return true;
    }
  }
  return false;
}

// Create new list
function createList(name, icon = "📋") {
  const newList = {
    id: SceneLink.lists.length + 1,
    name: name,
    count: 0,
    icon: icon,
    restaurants: []
  };
  SceneLink.lists.push(newList);
  return newList;
}

// Generate star rating HTML
function generateStars(rating) {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
  
  let html = '<div class="stars">';
  
  for (let i = 0; i < fullStars; i++) {
    html += '<span class="star">★</span>';
  }
  
  if (hasHalfStar) {
    html += '<span class="star">★</span>';
  }
  
  for (let i = 0; i < emptyStars; i++) {
    html += '<span class="star empty">★</span>';
  }
  
  html += '</div>';
  return html;
}

// Create restaurant card HTML
function createRestaurantCard(restaurant) {
  const isFav = isFavorite(restaurant.id);
  
  return `
    <div class="card" data-restaurant-id="${restaurant.id}">
      <img src="${restaurant.image}" alt="${restaurant.name}" class="card-image" loading="lazy">
      <div class="card-content">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
          <h3 class="card-title">${restaurant.name}</h3>
          <button class="favorite-btn" data-id="${restaurant.id}" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; padding: 0; color: ${isFav ? 'var(--gold-primary)' : 'var(--text-muted)'};" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
            ${isFav ? '❤️' : '🤍'}
          </button>
        </div>
        <p class="card-subtitle">${restaurant.cuisine} • ${restaurant.location}</p>
        <div class="card-tags">
          ${restaurant.tags.slice(0, 3).map(tag => `<span class="tag">${tag}</span>`).join('')}
        </div>
        <div class="rating">
          ${generateStars(restaurant.rating)}
          <span class="rating-text">${restaurant.rating} (${restaurant.reviewCount} reviews)</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem;">
          <span style="color: var(--text-muted); font-size: 0.9rem;">${restaurant.priceLevel} • ${restaurant.hours}</span>
          <a href="restaurant-detail.html?id=${restaurant.id}" class="btn btn-primary" style="padding: 0.5rem 1rem; font-size: 0.9rem;">View Details</a>
        </div>
      </div>
    </div>
  `;
}

// Create restaurant list item HTML
function createRestaurantListItem(restaurant) {
  const isFav = isFavorite(restaurant.id);
  
  return `
    <div class="restaurant-item" data-restaurant-id="${restaurant.id}">
      <img src="${restaurant.image}" alt="${restaurant.name}" class="restaurant-image" loading="lazy">
      <div class="restaurant-info">
        <div class="restaurant-header">
          <div>
            <h3 style="margin-bottom: 0.25rem;">${restaurant.name}</h3>
            <p style="color: var(--text-muted); font-size: 0.9rem; margin: 0;">${restaurant.cuisine} • ${restaurant.location}</p>
          </div>
          <button class="favorite-btn" data-id="${restaurant.id}" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; padding: 0; color: ${isFav ? 'var(--gold-primary)' : 'var(--text-muted)'};" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
            ${isFav ? '❤️' : '🤍'}
          </button>
        </div>
        <div class="restaurant-meta">
          <div class="meta-item">
            <span>⭐</span>
            <span>${restaurant.rating}</span>
          </div>
          <div class="meta-item">
            <span>💬</span>
            <span>${restaurant.reviewCount} reviews</span>
          </div>
          <div class="meta-item">
            <span>💰</span>
            <span>${restaurant.priceLevel}</span>
          </div>
          <div class="meta-item">
            <span>👥</span>
            <span>${restaurant.crowd}</span>
          </div>
        </div>
        <p class="restaurant-description">${restaurant.description}</p>
        <div class="restaurant-footer">
          <div class="card-tags">
            ${restaurant.tags.slice(0, 4).map(tag => `<span class="tag">${tag}</span>`).join('')}
          </div>
          <a href="restaurant-detail.html?id=${restaurant.id}" class="btn btn-primary" style="padding: 0.5rem 1.5rem; font-size: 0.9rem;">View Details</a>
        </div>
      </div>
    </div>
  `;
}

// Show notification
function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 100px;
    right: 20px;
    background: ${type === 'success' ? 'var(--success)' : 'var(--error)'};
    color: white;
    padding: 1rem 1.5rem;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    z-index: 10000;
    animation: slideInRight 0.3s ease;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Handle favorite button clicks
document.addEventListener('click', (e) => {
  if (e.target.closest('.favorite-btn')) {
    const btn = e.target.closest('.favorite-btn');
    const restaurantId = parseInt(btn.dataset.id);
    const isFav = toggleFavorite(restaurantId);
    
    btn.style.color = isFav ? 'var(--gold-primary)' : 'var(--text-muted)';
    btn.innerHTML = isFav ? '❤️' : '🤍';
    btn.title = isFav ? 'Remove from favorites' : 'Add to favorites';
    
    const restaurant = getRestaurantById(restaurantId);
    showNotification(
      isFav ? `Added ${restaurant.name} to favorites!` : `Removed ${restaurant.name} from favorites`,
      'success'
    );
  }
});

// Mobile menu toggle
document.addEventListener('DOMContentLoaded', () => {
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const navLinks = document.querySelector('.nav-links');
  
  if (mobileMenuBtn && navLinks) {
    mobileMenuBtn.addEventListener('click', () => {
      navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
      if (window.innerWidth <= 768) {
        navLinks.style.position = 'absolute';
        navLinks.style.top = '100%';
        navLinks.style.left = '0';
        navLinks.style.right = '0';
        navLinks.style.background = 'var(--dark-card)';
        navLinks.style.flexDirection = 'column';
        navLinks.style.padding = '1rem';
        navLinks.style.borderTop = '1px solid rgba(212, 175, 55, 0.1)';
      }
    });
  }
});

// Smooth scroll for anchor links
document.addEventListener('click', (e) => {
  if (e.target.tagName === 'A' && e.target.getAttribute('href')?.startsWith('#')) {
    e.preventDefault();
    const target = document.querySelector(e.target.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  }
});

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  loadRestaurants();
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SceneLink;
}
// Premium Header Scroll Effect
(function() {
    const header = document.getElementById('mainHeader') || document.querySelector('.header-enhanced');
    if (header) {
        window.addEventListener('scroll', function() {
            if (window.scrollY > 50) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
        });
    }
})();

// Explore Now City Dropdown
(function() {
    const wrapper = document.getElementById('exploreDropdown');
    if (!wrapper) return;
    
    // Toggle on click for mobile
    wrapper.querySelector('.btn-explore-now').addEventListener('click', function(e) {
        if (window.innerWidth <= 768) {
            e.preventDefault();
            e.stopPropagation();
            wrapper.classList.toggle('open');
        }
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (!wrapper.contains(e.target)) {
            wrapper.classList.remove('open');
        }
    });
    
    // Handle city selection
    wrapper.querySelectorAll('.city-dropdown-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
            if (this.querySelector('.coming-soon')) {
                e.preventDefault();
                // Could show a toast notification here
            }
        });
    });
})();

// Fade-in Sections on Scroll
(function() {
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };
    
    const fadeInObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);
    
    document.querySelectorAll('.fade-in-section').forEach(function(section) {
        fadeInObserver.observe(section);
    });
})();

// Premium Search Bar Functionality
(function() {
    var searchInput = document.getElementById('premiumSearchInput');
    var searchBtn = document.getElementById('premiumSearchBtn');
    
    if (searchInput && searchBtn) {
        function doSearch() {
            var query = searchInput.value.trim();
            if (query) {
                window.location.href = 'explore.html?search=' + encodeURIComponent(query);
            }
        }
        
        searchBtn.addEventListener('click', doSearch);
        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') doSearch();
        });
    }
})();

// Smooth Scroll for Anchor Links
document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
    anchor.addEventListener('click', function(e) {
        var href = this.getAttribute('href');
        if (href !== '#' && href !== '#signupModal' && href !== '#loginModal') {
            e.preventDefault();
            var target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    });
});
